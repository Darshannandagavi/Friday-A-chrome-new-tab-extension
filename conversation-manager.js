export class ConversationManager {
  constructor({ maxMessages = 20 } = {}) {
    this.maxMessages = maxMessages;
  }

  normalize(messages = []) {
    const normalized = [];

    for (const message of messages) {
      if (!message || message.kind === "error") continue;

      const text = String(message.content || "").trim();
      if (!text || text === "Thinking...") continue;

      const role = message.role === "assistant" ? "model" : "user";
      const previous = normalized[normalized.length - 1];

      if (previous?.role === role) {
        previous.parts[0].text += `\n${text}`;
      } else {
        normalized.push({ role, parts: [{ text }] });
      }
    }

    return normalized.slice(-this.maxMessages);
  }

  buildTextContents(messages, currentMessage) {
    const contents = this.normalize(messages);
    const current = String(currentMessage || "").trim();
    const last = contents[contents.length - 1];

    if (current && !(last?.role === "user" && last.parts?.[0]?.text === current)) {
      contents.push({ role: "user", parts: [{ text: current }] });
    }

    return contents.slice(-this.maxMessages);
  }

  buildLiveHistory(messages) {
    return this.normalize(messages).slice(-12);
  }
}
