import { FRIDAY_TOOL_DECLARATIONS, FridayToolManager } from "./friday-tools.js";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_TEXT_MODELS = Object.freeze([
  {
    value: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
  },
  {
    value: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
  },
  {
    value: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
  },
]);

export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-3.6-flash";



const MAX_TOOL_ROUNDS = 12;
const MAX_TOOL_CALLS = 24;
const MAX_IDENTICAL_TOOL_CALLS = 2;
const MAX_TOOL_RESULT_CHARS = 18000;

const AGENT_INSTRUCTION = `
You are Friday operating as an autonomous browser agent when a task requires multiple actions.
For multi-step goals, do not stop after the first useful tool call. Continue until the user's goal is
completed, the available evidence is sufficient, or a tool/action is genuinely blocked.
Use previous tool observations to decide the next action. Preserve useful tab IDs returned by tools and
pass them into later tools when needed. Prefer reading a page after opening it before making conclusions.
Do not repeatedly call the same tool with identical arguments. If an action fails, adapt or stop instead
of blindly retrying. Never claim an action succeeded unless the tool result confirms it.
When comparing multiple items, collect the required evidence for each item before producing the final comparison.
For destructive browser actions such as closing tabs, only do them when the user clearly requests them.
For tasks that require signing in to a website, first try fill_login_form or get_memory to use saved
credentials. Only ask the user for a username or password when nothing is saved for that site, and save
whatever they give you with save_memory right away so the same task never needs to ask again.
If a webpage uses dynamic API calls (like an SPA dashboard), use wait_for_text to wait for specific content to render before reading the page.
Friday's own chat interface lives inside a browser tab. If a tool call fails because it targeted the
wrong page, call list_tabs to find the correct tab by URL and retry with its tabId rather than giving up.
`.trim();

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
    this.agentRun = null;
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

  _limitToolResult(result) {
    try {
      const serialized = JSON.stringify(result);
      if (serialized.length <= MAX_TOOL_RESULT_CHARS) return result;

      if (result && typeof result === "object") {
        const copy = { ...result };
        if (typeof copy.text === "string") {
          const available = Math.max(1000, MAX_TOOL_RESULT_CHARS - 500);
          copy.text = `${copy.text.slice(0, available)}\n\n[Tool result truncated for the next agent step.]`;
          return copy;
        }
      }

      return {
        success: true,
        truncated: true,
        summary: serialized.slice(0, MAX_TOOL_RESULT_CHARS),
      };
    } catch {
      return {
        success: false,
        error: "Tool returned an unserializable result.",
      };
    }
  }

  async streamText(
    message,
    {
      messages = [],
      onToken,
      onDone,
      onToolStart,
      onToolEnd,
      onAgentStart,
      onAgentStep,
      onAgentEnd,
    } = {},
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
          text: `${this.promptBuilder.build({
            userName: config.userName,
            personality: config.personality,
            customPersonalities: config.customPersonalities,
            mode: "text",
          })}\n\n${AGENT_INSTRUCTION}`,
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
    let totalToolCalls = 0;
    let completedRounds = 0;
    const toolCallHistory = new Map();

    this.agentRun = {
      startedAt: Date.now(),
      rounds: 0,
      toolCalls: 0,
      status: "running",
    };

    await onAgentStart?.({
      maxRounds: MAX_TOOL_ROUNDS,
      maxToolCalls: MAX_TOOL_CALLS,
    });

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        completedRounds = round + 1;
        this.agentRun.rounds = completedRounds;

        await onAgentStep?.({
          type: "thinking",
          round: completedRounds,
          maxRounds: MAX_TOOL_ROUNDS,
          toolCalls: totalToolCalls,
          message:
            round === 0
              ? "Planning the task..."
              : `Evaluating the latest result and choosing the next action...`,
        });

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

        contents.push({
          role: "model",
          parts: modelParts.length
            ? modelParts
            : functionCalls.map((call) => ({ functionCall: call })),
        });

        const functionResponseParts = [];

        for (const call of functionCalls) {
          if (totalToolCalls >= MAX_TOOL_CALLS) {
            throw new GeminiApiError(
              `Friday reached its safety limit of ${MAX_TOOL_CALLS} browser actions for this task.`,
              { code: "AGENT_ACTION_LIMIT" },
            );
          }

          const name = String(call?.name || "").trim();
          const args =
            call?.args && typeof call.args === "object" ? call.args : {};
          const signature = `${name}:${JSON.stringify(args)}`;
          const previousCount = toolCallHistory.get(signature) || 0;

          if (previousCount >= MAX_IDENTICAL_TOOL_CALLS) {
            const result = {
              success: false,
              error:
                "Friday blocked this repeated action because the same tool call was already attempted multiple times.",
            };
            functionResponseParts.push({
              functionResponse: { name, response: { result } },
            });
            await onToolEnd?.(name, result);
            continue;
          }

          toolCallHistory.set(signature, previousCount + 1);
          totalToolCalls += 1;
          this.agentRun.toolCalls = totalToolCalls;

          await onAgentStep?.({
            type: "tool",
            round: completedRounds,
            toolCalls: totalToolCalls,
            toolName: name,
            args,
            message: `Running ${name.replaceAll("_", " ")}...`,
          });
          await onToolStart?.(name, args);

          try {
            if (!this.toolManager.has(name)) {
              throw new Error(`Friday does not have a tool named "${name}".`);
            }

            const result = await this.toolManager.execute(name, args);
            const safeResult = this._limitToolResult(result);

            functionResponseParts.push({
              functionResponse: { name, response: { result: safeResult } },
            });
            await onToolEnd?.(name, result);

            await onAgentStep?.({
              type: "observation",
              round: completedRounds,
              toolCalls: totalToolCalls,
              toolName: name,
              result: safeResult,
              message: `${name.replaceAll("_", " ")} completed.`,
            });
          } catch (error) {
            const errorMessage =
              error?.message || String(error) || "Tool execution failed.";
            const result = { success: false, error: errorMessage };

            functionResponseParts.push({
              functionResponse: { name, response: { result } },
            });
            await onToolEnd?.(name, result);

            await onAgentStep?.({
              type: "observation",
              round: completedRounds,
              toolCalls: totalToolCalls,
              toolName: name,
              result,
              message: `${name.replaceAll("_", " ")} failed: ${errorMessage}`,
            });
          }
        }

        contents.push({ role: "user", parts: functionResponseParts });
      }
    } finally {
      if (this.agentRun) {
        this.agentRun.status = finalText ? "completed" : "stopped";
        this.agentRun.finishedAt = Date.now();
      }
      await onAgentEnd?.({
        status: finalText ? "completed" : "stopped",
        rounds: completedRounds,
        toolCalls: totalToolCalls,
      });
      this.agentRun = null;
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
