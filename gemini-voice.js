import { FridayToolManager, FRIDAY_TOOL_DECLARATIONS } from "./friday-tools.js";

const LIVE_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export const GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
// Google currently documents these as the official prebuilt voices for native audio.
// Keep the list in one place so future presets can be added without changing UI logic.
export const GEMINI_VOICE_PRESETS = Object.freeze([
  { value: "Zephyr", label: "Zephyr — Female · Bright" },
  { value: "Puck", label: "Puck — Male · Upbeat" },
  { value: "Charon", label: "Charon — Male · Informative" },
  { value: "Kore", label: "Kore — Female · Firm" },
  { value: "Fenrir", label: "Fenrir — Male · Excitable" },
  { value: "Leda", label: "Leda — Female · Youthful" },
  { value: "Orus", label: "Orus — Male · Firm" },
  { value: "Aoede", label: "Aoede — Female · Breezy" },
  { value: "Callirrhoe", label: "Callirrhoe — Female · Easy-going" },
  { value: "Autonoe", label: "Autonoe — Female · Bright" },
  { value: "Enceladus", label: "Enceladus — Male · Breathy" },
  { value: "Iapetus", label: "Iapetus — Male · Clear" },
  { value: "Umbriel", label: "Umbriel — Male · Easy-going" },
  { value: "Algieba", label: "Algieba — Male · Smooth" },
  { value: "Despina", label: "Despina — Female · Smooth" },
  { value: "Erinome", label: "Erinome — Female · Clear" },
  { value: "Algenib", label: "Algenib — Male · Gravelly" },
  { value: "Rasalgethi", label: "Rasalgethi — Male · Informative" },
  { value: "Laomedeia", label: "Laomedeia — Female · Upbeat" },
  { value: "Achernar", label: "Achernar — Female · Soft" },
  { value: "Alnilam", label: "Alnilam — Male · Firm" },
  { value: "Schedar", label: "Schedar — Male · Even" },
  { value: "Gacrux", label: "Gacrux — Female · Mature" },
  { value: "Pulcherrima", label: "Pulcherrima — Female · Forward" },
  { value: "Achird", label: "Achird — Male · Friendly" },
  { value: "Zubenelgenubi", label: "Zubenelgenubi — Male · Casual" },
  { value: "Vindemiatrix", label: "Vindemiatrix — Female · Gentle" },
  { value: "Sadachbia", label: "Sadachbia — Male · Lively" },
  { value: "Sadaltager", label: "Sadaltager — Male · Knowledgeable" },
  { value: "Sulafat", label: "Sulafat — Female · Warm" },
]);

export const DEFAULT_GEMINI_VOICE = "Achird";
export const GEMINI_AUTO_VOICE = "auto";

const PERSONALITY_VOICE_PREFERENCES = Object.freeze({
  friendly: "Achird",
  professional: "Iapetus",
  efficient: "Kore",
  short: "Kore",
  roasting: "Puck",
  romantic: "Sulafat",
});

export function resolveGeminiVoice(selectedVoice, personality = "friendly") {
  const isOfficialPreset = GEMINI_VOICE_PRESETS.some(
    (preset) => preset.value === selectedVoice,
  );
  if (isOfficialPreset) return selectedVoice;
  return PERSONALITY_VOICE_PREFERENCES[personality] || DEFAULT_GEMINI_VOICE;
}

export async function decodeGeminiWebSocketData(data) {
  if (typeof data === "string") return data;

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.text();
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder("utf-8").decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder("utf-8").decode(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
  }

  return String(data ?? "");
}

export class GeminiVoiceError extends Error {
  constructor(message, { code = "VOICE_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "GeminiVoiceError";
    this.code = code;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function float32ToPcmBase64(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(index * 2, Math.round(value), true);
  }

  return bytesToBase64(new Uint8Array(buffer));
}

function resampleFloat32(samples, sourceRate, targetRate = 16000) {
  if (!samples?.length || sourceRate === targetRate) return samples;

  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const mix = sourcePosition - leftIndex;
    output[index] = samples[leftIndex] * (1 - mix) + samples[rightIndex] * mix;
  }

  return output;
}

function base64PcmToFloat32(base64) {
  const binary = atob(base64);
  const sampleCount = Math.floor(binary.length / 2);
  const output = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const low = binary.charCodeAt(index * 2);
    const high = binary.charCodeAt(index * 2 + 1);
    let value = (high << 8) | low;
    if (value & 0x8000) value -= 0x10000;
    output[index] = value / 0x8000;
  }

  return output;
}

function closeReasonToError(event, setupComplete) {
  const reason = String(event?.reason || "").trim();
  const closeCode = Number(event?.code) || 0;
  const closeDetail =
    reason ||
    (closeCode ? `Friday Live closed with WebSocket code ${closeCode}.` : "");
  if (
    /quota|resource.?exhausted|rate.?limit|429/i.test(`${reason} ${closeCode}`)
  ) {
    return new GeminiVoiceError(
      "The current Gemini API key has exceeded its Live API quota.",
      { code: "QUOTA_EXCEEDED" },
    );
  }
  if (!navigator.onLine) {
    return new GeminiVoiceError(
      "The voice connection was lost because the device is offline.",
      { code: "OFFLINE" },
    );
  }
  if (!setupComplete) {
    return new GeminiVoiceError(
      closeDetail ||
        "Friday Live rejected the connection. Check the API key, model access, and quota in Google AI Studio.",
      { code: "CONNECTION_REJECTED" },
    );
  }
  return new GeminiVoiceError(
    closeDetail ||
      "The Friday Live voice connection was lost. Stop voice mode and start it again.",
    { code: "CONNECTION_LOST" },
  );
}

export class GeminiVoice {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;

    this.toolManager = new FridayToolManager({
      onToolStart: (toolName) => {
        this.emit(
          "onStatus",
          "tool",
          `Friday is using ${toolName.replaceAll("_", " ")}...`,
        );
      },

      onToolEnd: (toolName, result) => {
        console.debug("[Friday Tool]", toolName, result);
      },
    });

    this.socket = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.mediaSource = null;
    this.captureNode = null;
    this.playbackSources = new Set();
    this.nextPlaybackTime = 0;
    this.ready = false;
    this.setupComplete = false;
    this.intentionalClose = false;
    this.setupTimer = null;
    this.inputSampleRate = 16000;
  }

  get active() {
    return Boolean(this.socket || this.mediaStream || this.audioContext);
  }

  emit(name, ...args) {
    this.callbacks?.[name]?.(...args);
  }

  async start({
    apiKey,
    voice = DEFAULT_GEMINI_VOICE,
    systemInstruction,
    history = [],
  } = {}) {
    
    if (!apiKey) {
      throw new GeminiVoiceError(
        "Add your Gemini API key in Settings before starting voice mode.",
        { code: "MISSING_API_KEY" },
      );
    }
    
    if (!navigator.onLine) {
      throw new GeminiVoiceError(
        "You appear to be offline. Reconnect before starting voice mode.",
        { code: "OFFLINE" },
      );
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new GeminiVoiceError(
        "Microphone capture is not available in this browser.",
        { code: "MIC_UNAVAILABLE" },
      );
    }
    if (!window.AudioContext && !window.webkitAudioContext) {
      throw new GeminiVoiceError(
        "Web Audio is not available in this browser.",
        { code: "AUDIO_UNAVAILABLE" },
      );
    }

    await this.stop({ silent: true });
    this.intentionalClose = false;
    this.emit("onStatus", "connecting", "Connecting to Friday Live...");

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    try {
      this.audioContext = new AudioContextClass({ latencyHint: "interactive" });
      await this.audioContext.resume();
    } catch (error) {
      await this.stop({ silent: true });
      throw new GeminiVoiceError(
        "Friday could not initialize low-latency audio playback.",
        { code: "AUDIO_START_FAILURE", cause: error },
      );
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          sampleSize: { ideal: 16 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      await this.stop({ silent: true });
      if (
        error?.name === "NotAllowedError" ||
        error?.name === "SecurityError"
      ) {
        throw new GeminiVoiceError(
          "Microphone permission was blocked. Allow microphone access and start voice mode again.",
          { code: "MIC_PERMISSION", cause: error },
        );
      }
      throw new GeminiVoiceError("Friday could not open the microphone.", {
        code: "MIC_FAILURE",
        cause: error,
      });
    }

    try {
      await this.audioContext.audioWorklet.addModule(
        "audio-capture-worklet.js",
      );
      this.inputSampleRate = Math.round(this.audioContext.sampleRate);
    } catch (error) {
      await this.stop({ silent: true });
      throw new GeminiVoiceError(
        "Friday could not start the microphone audio processor.",
        { code: "AUDIO_PROCESSOR_FAILURE", cause: error },
      );
    }

    const endpoint = `${LIVE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
    try {
      this.socket = new WebSocket(endpoint);
      this.socket.binaryType = "arraybuffer";
    } catch (error) {
      await this.stop({ silent: true });
      throw new GeminiVoiceError(
        "Friday could not create the Friday Live connection.",
        { code: "WEBSOCKET_START_FAILURE", cause: error },
      );
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const rejectOnce = async (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(this.setupTimer);
        await this.stop({ silent: true });
        reject(error);
      };

      this.setupTimer = setTimeout(() => {
        const socketState = this.socket?.readyState;
        const stateLabel =
          socketState === WebSocket.CONNECTING
            ? "The WebSocket is still connecting."
            : socketState === WebSocket.OPEN
              ? "The socket opened, but Gemini did not confirm the session setup."
              : "The WebSocket closed before setup completed.";

        rejectOnce(
          new GeminiVoiceError(
            `Friday Live could not finish connecting. ${stateLabel} Check Live API access for the current model and reload the extension.`,
            { code: "CONNECTION_TIMEOUT" },
          ),
        );
      }, 20000);

      this.socket.onopen = () => {
        const setupMessage = {
          setup: {
            model: `models/${GEMINI_LIVE_MODEL}`,

            generationConfig: {
              responseModalities: ["AUDIO"],

              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voice || DEFAULT_GEMINI_VOICE,
                  },
                },
              },
            },

            tools: [
              {
                functionDeclarations: FRIDAY_TOOL_DECLARATIONS,
              },
            ],

            systemInstruction: {
              parts: [
                {
                  text: String(
                    systemInstruction ||
                      "You are Friday, a helpful voice assistant.",
                  ),
                },
              ],
            },

            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
                endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
                prefixPaddingMs: 180,
                silenceDurationMs: 1100,
              },

              activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
              turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
            },

            inputAudioTranscription: {},
            outputAudioTranscription: {},

            ...(Array.isArray(history) && history.length
              ? {
                  historyConfig: {
                    initialHistoryInClientContent: true,
                  },
                }
              : {}),
          },
        };

        this.socket.send(JSON.stringify(setupMessage));
      };

      this.socket.onmessage = async (event) => {
        let message;

        try {
          const rawMessage = await decodeGeminiWebSocketData(event.data);
          message = JSON.parse(rawMessage);
        } catch (error) {
          console.warn(
            "Friday Live sent an unreadable WebSocket message.",
            error,
          );
          return;
        }

        if (
          Object.prototype.hasOwnProperty.call(message, "setupComplete") &&
          !this.setupComplete
        ) {
          this.setupComplete = true;
          this.ready = true;
          clearTimeout(this.setupTimer);

          if (Array.isArray(history) && history.length) {
            this.socket.send(
              JSON.stringify({
                clientContent: {
                  turns: history,
                  turnComplete: true,
                },
              }),
            );
          }

          this.startMicrophoneCapture();
          this.emit("onStatus", "listening", "Friday Live is listening...");

          if (!settled) {
            settled = true;
            resolve();
          }
        }

        this.handleServerMessage(message).catch((error) => {
          console.error("[Friday Live] Server message handling failed:", error);

          this.emit(
            "onError",
            error instanceof GeminiVoiceError
              ? error
              : new GeminiVoiceError(
                  error?.message ||
                    "Friday could not process the Gemini Live response.",
                  {
                    code: "SERVER_MESSAGE_FAILURE",
                    cause: error,
                  },
                ),
          );
        });
      };

      this.socket.onerror = (event) => {
        console.group("[Friday Live] WEBSOCKET ERROR");
        console.error("Raw error event:", event);
        console.error("Event type:", event?.type);
        console.error("Socket readyState:", this.socket?.readyState);
        console.error("Socket URL:", this.socket?.url);
        console.trace("WebSocket error stack");
        console.groupEnd();
      };

      this.socket.onclose = (event) => {
        console.group("[Friday Live] WEBSOCKET CLOSED");

        console.error("Raw close event:", event);
        console.log("Close code:", event.code);
        console.log("Close reason:", event.reason);
        console.log("Was clean:", event.wasClean);
        console.log("Socket URL:", this.socket?.url);
        console.log("Setup complete:", this.setupComplete);
        console.log("Ready:", this.ready);
        console.log("Intentional close:", this.intentionalClose);

        console.groupEnd();

        clearTimeout(this.setupTimer);

        const wasIntentional = this.intentionalClose;
        const wasReady = this.setupComplete;

        this.ready = false;
        this.setupComplete = false;
        this.socket = null;

        if (!settled && !wasIntentional) {
          const error = closeReasonToError(event, wasReady);

          console.error("[Friday Live] Converted close error:", error);

          console.error("[Friday Live] Converted error details:", {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            stack: error?.stack,
            cause: error?.cause,
          });

          rejectOnce(error);
          return;
        }

        if (!wasIntentional) {
          const error = closeReasonToError(event, wasReady);

          console.error("[Friday Live] Runtime close error:", error);

          this.emit("onError", error);
          this.emit("onClose", error);
          this.releaseAudioResources();
        }
      };
    });
  }

  startMicrophoneCapture() {
    if (!this.audioContext || !this.mediaStream || this.captureNode) return;

    this.mediaSource = this.audioContext.createMediaStreamSource(
      this.mediaStream,
    );
    this.captureNode = new AudioWorkletNode(
      this.audioContext,
      "friday-pcm-capture",
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: { chunkSize: 2048 },
      },
    );
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    this.captureNode.port.onmessage = (event) => {
      if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
      const samples =
        event.data instanceof Float32Array
          ? event.data
          : new Float32Array(event.data);
      const pcm16k = resampleFloat32(samples, this.inputSampleRate, 16000);
      const payload = {
        realtimeInput: {
          audio: {
            data: float32ToPcmBase64(pcm16k),
            mimeType: "audio/pcm;rate=16000",
          },
        },
      };
      this.socket.send(JSON.stringify(payload));
    };

    this.mediaSource.connect(this.captureNode);
    this.captureNode.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  async handleServerMessage(message) {
    /*
     * ========================================================================
     * TOOL CALL
     * ========================================================================
     */

    const toolCall = message?.toolCall;

    if (toolCall?.functionCalls?.length) {
      await this.handleToolCall(toolCall);
      return;
    }

    /*
     * ========================================================================
     * GO AWAY / SESSION REFRESH
     * ========================================================================
     */

    if (message?.goAway?.timeLeft) {
      this.emit(
        "onStatus",
        "connecting",
        "Friday Live is refreshing the voice session...",
      );
    }

    /*
     * ========================================================================
     * NORMAL SERVER CONTENT
     * ========================================================================
     */

    const serverContent = message?.serverContent;

    if (!serverContent) {
      return;
    }

    if (serverContent.interrupted) {
      this.stopPlayback();

      this.emit("onInterrupted");

      this.emit("onStatus", "listening", "Interrupted. Gemini is listening...");
    }

    const inputText = serverContent.inputTranscription?.text;

    if (inputText) {
      this.emit("onInputTranscript", inputText);
    }

    const outputText = serverContent.outputTranscription?.text;

    if (outputText) {
      this.emit("onOutputTranscript", outputText);
    }

    const parts = serverContent.modelTurn?.parts || [];

    for (const part of parts) {
      const audio = part?.inlineData;

      if (audio?.data) {
        this.queueAudio(audio.data, audio.mimeType || "audio/pcm;rate=24000");
      }
    }

    if (serverContent.turnComplete) {
      this.emit("onTurnComplete");

      this.emit("onStatus", "listening", "Friday Live is listening...");
    }
  }
  queueAudio(base64, mimeType = "audio/pcm;rate=24000") {
    if (!this.audioContext || !base64) {
      return;
    }

    try {
      /*
       * Gemini Live native audio output is raw signed
       * little-endian 16-bit PCM.
       */
      const samples = base64PcmToFloat32(base64);

      if (!samples.length) {
        return;
      }

      /*
       * Gemini normally returns:
       *
       * audio/pcm;rate=24000
       *
       * Read the sample rate from the MIME type so this
       * continues working if Google changes it later.
       */
      const rateMatch = String(mimeType || "").match(/rate=(\d+)/i);

      const sampleRate = Math.max(8000, Number(rateMatch?.[1]) || 24000);

      /*
       * Create a Web Audio buffer from Gemini's PCM chunk.
       */
      const audioBuffer = this.audioContext.createBuffer(
        1,
        samples.length,
        sampleRate,
      );

      audioBuffer.copyToChannel(samples, 0);

      const source = this.audioContext.createBufferSource();

      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      /*
       * Gemini sends audio in multiple chunks.
       *
       * Schedule every chunk immediately after the previous
       * chunk so there are no gaps, overlaps, or clicks.
       */
      const now = this.audioContext.currentTime;

      const startTime = Math.max(now + 0.01, this.nextPlaybackTime || now);

      this.nextPlaybackTime = startTime + audioBuffer.duration;

      this.playbackSources.add(source);

      /*
       * Calculate a simple RMS level for your orbit voice UI.
       */
      let energy = 0;

      for (let index = 0; index < samples.length; index += 1) {
        energy += samples[index] * samples[index];
      }

      const rms = Math.sqrt(energy / Math.max(1, samples.length));

      const visualLevel = Math.min(1, rms * 4);

      this.emit("onAudioLevel", visualLevel);

      this.emit("onStatus", "speaking", "Friday Live is speaking...");

      source.onended = () => {
        this.playbackSources.delete(source);

        try {
          source.disconnect();
        } catch {}

        /*
         * Don't switch back to listening while another
         * queued Gemini audio chunk is still playing.
         */
        if (this.playbackSources.size === 0) {
          this.emit("onAudioLevel", 0);

          this.nextPlaybackTime = this.audioContext?.currentTime || 0;

          this.emit("onPlaybackIdle");
        }
      };

      source.start(startTime);
    } catch (error) {
      console.error("[Friday Live] Could not play Gemini audio:", error);

      this.emit(
        "onError",
        new GeminiVoiceError(
          "Friday received Gemini voice audio but could not play it.",
          {
            code: "AUDIO_PLAYBACK_FAILURE",
            cause: error,
          },
        ),
      );
    }
  }
  async handleToolCall(toolCall) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn("[Friday Tools] WebSocket is not available.");

      return;
    }

    const functionCalls = Array.isArray(toolCall?.functionCalls)
      ? toolCall.functionCalls
      : [];

    if (!functionCalls.length) {
      return;
    }

    const functionResponses = [];

    for (const functionCall of functionCalls) {
      const name = String(functionCall?.name || "").trim();

      const args =
        functionCall?.args && typeof functionCall.args === "object"
          ? functionCall.args
          : {};

      const id = String(functionCall?.id || "").trim();

      console.log("[Friday Tool Call]", name, args);

      try {
        if (!this.toolManager.has(name)) {
          throw new Error(`Unknown Friday tool: ${name}`);
        }

        const result = await this.toolManager.execute(name, args);

        functionResponses.push({
          name,
          id,
          response: {
            result,
          },
        });
      } catch (error) {
        const message =
          error?.message || String(error) || "Tool execution failed.";

        console.error(`[Friday Tool Error] ${name}:`, error);

        functionResponses.push({
          name,
          id,
          response: {
            error: message,
          },
        });
      }
    }

    if (!functionResponses.length) {
      return;
    }

    /*
     * Gemini Live requires the client to send the tool result
     * back through the WebSocket.
     */

    const toolResponseMessage = {
      toolResponse: {
        functionResponses,
      },
    };

    try {
      this.socket.send(JSON.stringify(toolResponseMessage));

      console.log("[Friday Tool Response]", functionResponses);

      this.emit(
        "onStatus",
        "listening",
        "Friday is processing the tool result...",
      );
    } catch (error) {
      console.error("[Friday Tools] Could not send tool response.", error);
    }
  }

  stopPlayback() {
    for (const source of this.playbackSources) {
      try {
        source.stop();
      } catch {}
      try {
        source.disconnect();
      } catch {}
    }
    this.playbackSources.clear();
    this.nextPlaybackTime = this.audioContext?.currentTime || 0;
  }

  sendText(text) {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) {
      throw new GeminiVoiceError("Friday Live is not connected.", {
        code: "NOT_CONNECTED",
      });
    }
    this.socket.send(
      JSON.stringify({ realtimeInput: { text: String(text || "") } }),
    );
  }

  async stop({ silent = false } = {}) {
    this.intentionalClose = true;
    this.ready = false;
    clearTimeout(this.setupTimer);
    this.setupTimer = null;

    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(
          JSON.stringify({ realtimeInput: { audioStreamEnd: true } }),
        );
      } catch {}
      try {
        this.socket.close(1000, "Voice mode stopped");
      } catch {}
    } else if (this.socket) {
      try {
        this.socket.close();
      } catch {}
    }

    this.socket = null;
    await this.releaseAudioResources();
    this.setupComplete = false;

    if (!silent) this.emit("onStatus", "off", "Voice mode stopped.");
  }

  async releaseAudioResources() {
    this.stopPlayback();

    try {
      this.captureNode?.port?.close();
    } catch {}
    try {
      this.mediaSource?.disconnect();
    } catch {}
    try {
      this.captureNode?.disconnect();
    } catch {}
    try {
      this.silentGain?.disconnect();
    } catch {}

    this.captureNode = null;
    this.mediaSource = null;
    this.silentGain = null;

    for (const track of this.mediaStream?.getTracks?.() || []) {
      track.stop();
    }
    this.mediaStream = null;

    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch {}
    }
    this.audioContext = null;
  }
}
