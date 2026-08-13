import { FRIDAY_TOOL_DECLARATIONS, FridayToolManager } from "./friday-tools.js";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_TEXT_MODELS = Object.freeze([
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
]);

export const DEFAULT_GEMINI_TEXT_MODEL = GEMINI_TEXT_MODELS[0].value;

const MAX_TOOL_ROUNDS = 4;

export class GeminiApiError extends Error {
  constructor(message, { status = 0, code = "GEMINI_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
  }
}

function friendlyHttpError(status, payload) {
  const rawMessage = payload?.error?.message || "";

  if (status === 400 && /api key|key not valid|invalid/i.test(rawMessage)) {
    return new GeminiApiError(
      "The Gemini API key is invalid. Open Settings and add a valid Google AI Studio API key.",
      { status, code: "INVALID_API_KEY" },
    );
  }
  if (status === 401 || status === 403) {
    return new GeminiApiError(
      "Gemini rejected this API key or the selected model is not available for it. Check the key and model access in Google AI Studio.",
      { status, code: "ACCESS_DENIED" },
    );
  }
  if (status === 429) {
    return new GeminiApiError(
      "Gemini quota is currently exhausted. Check your Google AI Studio rate limits or try again after the quota resets.",
      { status, code: "QUOTA_EXCEEDED" },
    );
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new GeminiApiError(
      "Gemini is temporarily unavailable. Your chat is safe; try the request again shortly.",
      { status, code: "SERVICE_UNAVAILABLE" },
    );
  }

  return new GeminiApiError(
    rawMessage || `Gemini request failed with status ${status}.`,
    { status, code: "REQUEST_FAILED" },
  );
}

function extractTextFromParts(parts) {
  return parts
    .filter((part) => typeof part?.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("");
}

function extractFunctionCallsFromParts(parts) {
  return parts
    .filter((part) => part && typeof part === "object" && part.functionCall)
    .map((part) => part.functionCall);
}

async function readErrorPayload(response) {
  const text = await response.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

export class GeminiService {
  constructor({
    getConfig,
    onActiveKeyChange,
    promptBuilder,
    conversationManager,
  }) {
    this.getConfig = getConfig;
    this.onActiveKeyChange = onActiveKeyChange;
    this.promptBuilder = promptBuilder;
    this.conversationManager = conversationManager;
    this.controller = null;
    this.toolManager = new FridayToolManager();
  }

  abort() {
    this.controller?.abort();
    this.controller = null;
  }

  /**
   * Sends one streamGenerateContent request, using the multi-key quota
   * fallback logic, and returns the fetch Response once a usable one is
   * obtained (or throws).
   */
  async _requestStream({ endpoint, keys, startIndex, body }) {
    let activeIndex = Math.min(
      Math.max(0, Number(startIndex) || 0),
      keys.length - 1,
    );
    let response;

    while (activeIndex < keys.length) {
      if (!keys[activeIndex]) {
        activeIndex += 1;
        if (activeIndex < keys.length)
          await this.onActiveKeyChange?.(activeIndex);
        continue;
      }

      try {
        response = await fetch(endpoint, {
          method: "POST",
          signal: this.controller.signal,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": keys[activeIndex],
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        if (!navigator.onLine) {
          throw new GeminiApiError(
            "The internet connection was lost while contacting Gemini.",
            { code: "OFFLINE", cause: error },
          );
        }
        throw new GeminiApiError(
          "Could not reach Gemini. Check your network connection and try again.",
          { code: "NETWORK_FAILURE", cause: error },
        );
      }

      if (response.ok) return { response, activeIndex };

      const apiError = friendlyHttpError(
        response.status,
        await readErrorPayload(response),
      );
      if (apiError.code !== "QUOTA_EXCEEDED") throw apiError;

      activeIndex += 1;
      if (activeIndex >= keys.length) {
        await this.onActiveKeyChange?.(activeIndex);
        throw new GeminiApiError(
          "All Gemini API keys have exceeded their quota. Add more API keys to continue chatting.",
          { status: 429, code: "ALL_KEYS_EXHAUSTED" },
        );
      }
      await this.onActiveKeyChange?.(activeIndex);
    }

    throw new GeminiApiError(
      "All Gemini API keys have exceeded their quota. Add more API keys to continue chatting.",
      { status: 429, code: "ALL_KEYS_EXHAUSTED" },
    );
  }

  /**
   * Reads an SSE streamGenerateContent response to completion, forwarding
   * text tokens via onToken, and returns the accumulated text plus any
   * functionCall parts the model asked to invoke, plus the raw parts of
   * the model turn (needed to append to conversation history correctly).
   */
  async _consumeStream(response, { onToken } = {}) {
    if (!response.body) {
      throw new GeminiApiError(
        "Gemini did not return a readable response stream.",
        { code: "EMPTY_STREAM" },
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventData = [];
    let fullText = "";
    const functionCalls = [];
    const modelParts = [];

    const processEvent = () => {
      if (!eventData.length) return;
      const data = eventData.join("\n").trim();
      eventData = [];
      if (!data || data === "[DONE]") return;

      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }

      if (payload?.error) {
        throw friendlyHttpError(payload.error.code || 500, payload);
      }

      const parts = payload?.candidates?.[0]?.content?.parts || [];
      if (parts.length) modelParts.push(...parts);

      const token = extractTextFromParts(parts);
      if (token) {
        fullText += token;
        onToken?.(token, fullText);
      }

      const calls = extractFunctionCallsFromParts(parts);
      if (calls.length) functionCalls.push(...calls);
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = done ? "" : lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            processEvent();
          } else if (line.startsWith("data:")) {
            eventData.push(line.slice(5).trimStart());
          }
        }

        if (done) {
          if (buffer.trim().startsWith("data:"))
            eventData.push(buffer.trim().slice(5).trimStart());
          processEvent();
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { text: fullText.trim(), functionCalls, modelParts };
  }

  async streamText(
    message,
    { messages = [], onToken, onDone, onToolStart, onToolEnd } = {},
  ) {
    const config = this.getConfig();

    if (!config.enabled) {
      throw new GeminiApiError("Gemini is disabled in Settings.", {
        code: "DISABLED",
      });
    }
    const keys = Array.isArray(config.apiKeys)
      ? config.apiKeys.map((key) => String(key || "").trim())
      : [String(config.apiKey || "").trim()];
    if (!keys.some(Boolean)) {
      throw new GeminiApiError(
        "Add at least one Gemini API key in Settings before sending a message.",
        { code: "MISSING_API_KEY" },
      );
    }
    if (!navigator.onLine) {
      throw new GeminiApiError(
        "You appear to be offline. Reconnect to the internet and try again.",
        { code: "OFFLINE" },
      );
    }

    this.abort();
    this.controller = new AbortController();

    const model = config.model || DEFAULT_GEMINI_TEXT_MODEL;
    const endpoint = `${API_ROOT}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

    const systemInstruction = {
      parts: [
        {
          text: this.promptBuilder.build({
            userName: config.userName,
            personality: config.personality,
            customPersonalities: config.customPersonalities,
            mode: "text",
          }),
        },
      ],
    };

    const generationConfig = {
      temperature: config.personality === "professional" ? 0.35 : 0.65,
      maxOutputTokens: config.personality === "short" ? 220 : 1200,
    };

    const contents = this.conversationManager.buildTextContents(
      messages,
      message,
    );

    let activeIndex = Math.min(
      Math.max(0, Number(config.activeApiKeyIndex) || 0),
      keys.length - 1,
    );
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const body = {
        systemInstruction,
        contents,
        generationConfig,
        tools: [{ functionDeclarations: FRIDAY_TOOL_DECLARATIONS }],
      };

      const { response, activeIndex: usedIndex } = await this._requestStream({
        endpoint,
        keys,
        startIndex: activeIndex,
        body,
      });
      activeIndex = usedIndex;

      const { text, functionCalls, modelParts } = await this._consumeStream(
        response,
        { onToken },
      );

      if (!functionCalls.length) {
        finalText = text;
        break;
      }

      // Model wants to call one or more tools. Record its turn, execute
      // the tools locally, then feed the results back for a follow-up turn.
      contents.push({
        role: "model",
        parts: modelParts.length
          ? modelParts
          : functionCalls.map((call) => ({ functionCall: call })),
      });

      const functionResponseParts = [];

      for (const call of functionCalls) {
        const name = String(call?.name || "").trim();
        const args =
          call?.args && typeof call.args === "object" ? call.args : {};

        await onToolStart?.(name, args);

        try {
          if (!this.toolManager.has(name)) {
            throw new Error(`Friday does not have a tool named "${name}".`);
          }
          const result = await this.toolManager.execute(name, args);
          functionResponseParts.push({
            functionResponse: { name, response: { result } },
          });
          await onToolEnd?.(name, result);
        } catch (error) {
          const errorMessage =
            error?.message || String(error) || "Tool execution failed.";
          functionResponseParts.push({
            functionResponse: { name, response: { error: errorMessage } },
          });
          await onToolEnd?.(name, { success: false, error: errorMessage });
        }
      }

      contents.push({ role: "function", parts: functionResponseParts });
    }

    this.controller = null;

    if (!finalText) {
      throw new GeminiApiError(
        "Gemini returned an empty response. Try rephrasing the request.",
        { code: "EMPTY_RESPONSE" },
      );
    }

    onDone?.(finalText);
    return finalText;
  }
}
