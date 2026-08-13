import {
  PromptBuilder,
  PERSONALITY_OPTIONS,
  DEFAULT_PERSONALITY,
} from "./prompt-builder.js";
import { ConversationManager } from "./conversation-manager.js";
import { GeminiService, DEFAULT_GEMINI_TEXT_MODEL } from "./gemini-service.js";
import {
  GeminiVoice,
  GEMINI_VOICE_PRESETS,
  GEMINI_AUTO_VOICE,
  resolveGeminiVoice,
} from "./gemini-voice.js";

function makeId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

const defaultState = {
  name: "Darshan",
  theme: "dark",
  accent: "#7c3aed",
  defaultEngine: "google",
  notes: "",
  gemini: {
    enabled: true,
    apiKey: "",
    apiKeys: [],
    activeApiKeyIndex: 0,
    model: DEFAULT_GEMINI_TEXT_MODEL,
    voice: GEMINI_AUTO_VOICE,
    personality: DEFAULT_PERSONALITY,
    customPersonalities: [],
  },
  shortcuts: [
    {
      id: makeId(),
      name: "YouTube",
      url: "https://youtube.com",
      iconType: "image",
      iconValue: "shortcuticons/youtube.png",
    },
    {
      id: makeId(),
      name: "GitHub",
      url: "https://github.com",
      iconType: "image",
      iconValue: "shortcuticons/github.png",
    },
    {
      id: makeId(),
      name: "Gmail",
      url: "https://mail.google.com",
      iconType: "image",
      iconValue: "shortcuticons/gmail.png",
    },
    {
      id: makeId(),
      name: "Drive",
      url: "https://drive.google.com",
      iconType: "image",
      iconValue: "shortcuticons/drive.png",
    },
    {
      id: makeId(),
      name: "ChatGPT",
      url: "https://chatgpt.com",
      iconType: "image",
      iconValue: "shortcuticons/chatgpt.png",
    },
    {
      id: makeId(),
      name: "LinkedIn",
      url: "https://linkedin.com",
      iconType: "image",
      iconValue: "shortcuticons/linkedin.png",
    },
  ],
  tasks: [{ id: makeId(), title: "Plan today’s main focus", done: false }],
  chat: [
    {
      role: "assistant",
      content: "Add your Gemini API key in Settings, then ask anything.",
    },
  ],
};

const storageKey = "fridayNewTabStateV4";
let state = clone(defaultState);
let editingShortcutId = null;
let notesTimer = null;
let voiceModeActive = false;
let voiceStatus = "off";
let orbitClockFrame = null;
let lastOrbitClockSecond = -1;
let voiceTurn = createEmptyVoiceTurn();
let voiceTurnFinalizeTimer = null;
let voiceTransitionPromise = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const elements = {
  greeting: $("#greeting"),
  time: $("#time"),
  date: $("#date"),
  assistantLine: $("#assistantLine"),

  searchForm: $("#searchForm"),
  searchInput: $("#searchInput"),
  searchEngine: $("#searchEngine"),

  chatButton: $("#chatButton"),
  orbitChatButton: $("#orbitChatButton"),
  orbitHourDot: $("#orbitHourDot"),
  orbitMinuteDot: $("#orbitMinuteDot"),
  orbitSecondDot: $("#orbitSecondDot"),
  themeToggle: $("#themeToggle"),
  themeIcon: $("#themeIcon"),
  settingsButton: $("#settingsButton"),

  homeShortcuts: $("#homeShortcuts"),
  shortcutCount: $("#shortcutCount"),
  taskCount: $("#taskCount"),
  notesCount: $("#notesCount"),

  openShortcutsPanel: $("#openShortcutsPanel"),
  openFocusPanel: $("#openFocusPanel"),
  openNotesPanel: $("#openNotesPanel"),

  panelModal: $("#panelModal"),
  shortcutsModal: $("#shortcutsModal"),
  focusModal: $("#focusModal"),
  notesModal: $("#notesModal"),
  chatModal: $("#chatModal"),

  shortcutsGrid: $("#shortcutsGrid"),
  shortcutForm: $("#shortcutForm"),
  shortcutEditId: $("#shortcutEditId"),
  shortcutName: $("#shortcutName"),
  shortcutUrl: $("#shortcutUrl"),
  shortcutIconType: $("#shortcutIconType"),
  shortcutIconValue: $("#shortcutIconValue"),
  clearShortcutForm: $("#clearShortcutForm"),

  taskForm: $("#taskForm"),
  taskInput: $("#taskInput"),
  taskList: $("#taskList"),
  clearCompletedButton: $("#clearCompletedButton"),

  notesArea: $("#notesArea"),
  notesState: $("#notesState"),

  chatBox: $("#chatBox"),
  chatForm: $("#chatForm"),
  chatInput: $("#chatInput"),
  clearChatButton: $("#clearChatButton"),

  settingsDrawer: $("#settingsDrawer"),
  closeSettings: $("#closeSettings"),
  drawerScrim: $("#drawerScrim"),
  nameInput: $("#nameInput"),
  defaultEngine: $("#defaultEngine"),
  themeMode: $("#themeMode"),
  enableGemini: $("#enableGemini"),
  geminiApiKeyList: $("#geminiApiKeyList"),
  addGeminiApiKey: $("#addGeminiApiKey"),
  apiKeyStatus: $("#apiKeyStatus"),
  geminiModel: $("#geminiModel"),
  customGeminiModel: $("#customGeminiModel"),
  refreshGeminiModels: $("#refreshGeminiModels"),
  geminiModelStatus: $("#geminiModelStatus"),
  geminiVoice: $("#geminiVoice"),
  geminiPersonality: $("#geminiPersonality"),
  addPersonality: $("#addPersonality"),
  personalityList: $("#personalityList"),
  personalityEditor: $("#personalityEditor"),
  personalityName: $("#personalityName"),
  personalityPrompt: $("#personalityPrompt"),
  cancelPersonality: $("#cancelPersonality"),
  savePersonality: $("#savePersonality"),
  accentRow: $("#accentRow"),
  customAccentColor: $("#customAccentColor"),
  customAccentValue: $("#customAccentValue"),
  resetButton: $("#resetButton"),
};

function getChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
    ? chrome.storage.local
    : null;
}

function mergeState(base, saved = {}) {
  const savedGemini = saved.gemini || {};

  return {
    name: typeof saved.name === "string" ? saved.name : base.name,
    theme: saved.theme === "light" ? "light" : base.theme,
    accent: typeof saved.accent === "string" ? saved.accent : base.accent,
    defaultEngine:
      typeof saved.defaultEngine === "string"
        ? saved.defaultEngine
        : base.defaultEngine,
    notes: typeof saved.notes === "string" ? saved.notes : base.notes,
    gemini: {
      enabled:
        typeof savedGemini.enabled === "boolean"
          ? savedGemini.enabled
          : base.gemini.enabled,
      apiKey:
        typeof savedGemini.apiKey === "string"
          ? savedGemini.apiKey
          : base.gemini.apiKey,
      apiKeys: Array.isArray(savedGemini.apiKeys)
        ? savedGemini.apiKeys.filter((key) => typeof key === "string")
        : savedGemini.apiKey
          ? [savedGemini.apiKey]
          : [],
      activeApiKeyIndex: 0,
      model:
        typeof savedGemini.model === "string"
          ? savedGemini.model
          : base.gemini.model,
      voice:
        typeof savedGemini.voice === "string"
          ? savedGemini.voice
          : base.gemini.voice,
      personality:
        typeof savedGemini.personality === "string"
          ? savedGemini.personality
          : base.gemini.personality,
      customPersonalities: Array.isArray(savedGemini.customPersonalities)
        ? savedGemini.customPersonalities
        : [],
    },
    shortcuts: Array.isArray(saved.shortcuts)
      ? saved.shortcuts
      : clone(base.shortcuts),
    tasks: Array.isArray(saved.tasks) ? saved.tasks : clone(base.tasks),
    chat: Array.isArray(saved.chat) ? saved.chat : clone(base.chat),
  };
}

async function loadState() {
  const chromeStorage = getChromeStorage();

  if (chromeStorage) {
    const result = await chromeStorage.get(storageKey);
    if (result[storageKey]) {
      state = mergeState(defaultState, result[storageKey]);
    }
    return;
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      state = mergeState(defaultState, JSON.parse(saved));
    }
  } catch (error) {
    console.warn("Local storage unavailable in preview context.", error);
  }
}

async function saveState() {
  const chromeStorage = getChromeStorage();

  if (chromeStorage) {
    await chromeStorage.set({ [storageKey]: state });
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("Local storage save skipped.", error);
  }
}

function updateOrbitClock(now = new Date()) {
  const milliseconds = now.getMilliseconds();
  const seconds = now.getSeconds() + milliseconds / 1000;
  const minutes = now.getMinutes() + seconds / 60;
  const hours = (now.getHours() % 12) + minutes / 60;

  const hourAngle = hours * 30;
  const minuteAngle = minutes * 6;
  const secondAngle = seconds * 6;

  elements.orbitHourDot?.style.setProperty("--clock-angle", `${hourAngle}deg`);
  elements.orbitMinuteDot?.style.setProperty(
    "--clock-angle",
    `${minuteAngle}deg`,
  );
  elements.orbitSecondDot?.style.setProperty(
    "--clock-angle",
    `${secondAngle}deg`,
  );

  if (now.getSeconds() !== lastOrbitClockSecond) {
    lastOrbitClockSecond = now.getSeconds();

    if (elements.orbitHourDot) {
      elements.orbitHourDot.title = `Hour: ${now.getHours() % 12 || 12}`;
    }
    if (elements.orbitMinuteDot) {
      elements.orbitMinuteDot.title = `Minute: ${String(now.getMinutes()).padStart(2, "0")}`;
    }
    if (elements.orbitSecondDot) {
      elements.orbitSecondDot.title = `Second: ${String(now.getSeconds()).padStart(2, "0")}`;
    }
  }
}

function startOrbitClock() {
  if (orbitClockFrame) {
    cancelAnimationFrame(orbitClockFrame);
  }

  const tick = () => {
    updateOrbitClock(new Date());
    orbitClockFrame = requestAnimationFrame(tick);
  };

  tick();
}

function updateClock() {
  const now = new Date();

  updateOrbitClock(now);

  elements.time.textContent = new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  elements.date.textContent = new Intl.DateTimeFormat([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);

  updateGreeting(now);
}

function getGreeting(hour) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function updateGreeting(now = new Date()) {
  const pendingCount = state.tasks.filter((task) => !task.done).length;

  elements.greeting.textContent = `${getGreeting(now.getHours())}, ${state.name || "Friend"}`;

  if (pendingCount === 0) {
    elements.assistantLine.textContent =
      "Clear for now. Start something meaningful.";
  } else if (pendingCount === 1) {
    elements.assistantLine.textContent = "1 focus task is waiting.";
  } else {
    elements.assistantLine.textContent = `${pendingCount} focus tasks are waiting.`;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.style.setProperty("--accent", state.accent);

  if (elements.themeIcon) {
    elements.themeIcon.src =
      state.theme === "dark" ? "assets/moon.png" : "assets/sun.png";
    elements.themeIcon.alt =
      state.theme === "dark" ? "Dark theme" : "Light theme";
  }

  $$(".accent-dot").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === state.accent);
  });

  if (elements.customAccentColor) {
    elements.customAccentColor.value = state.accent;

    const customAccent = elements.customAccentColor.closest(".custom-accent");
    customAccent?.style.setProperty("--custom-color", state.accent);
  }

  if (elements.customAccentValue) {
    elements.customAccentValue.textContent = String(
      state.accent || "#7c3aed",
    ).toUpperCase();
  }
}

function fillSelect(select, options, selectedValue) {
  if (!select) return "";
  select.innerHTML = "";

  for (const item of options) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  }

  const resolved = options.some((item) => item.value === selectedValue)
    ? selectedValue
    : options[0]?.value || "";
  select.value = resolved;
  return resolved;
}

function renderGeminiOptions() {
  const customOptions = state.gemini.customPersonalities.map((item) => ({
    value: item.id,
    label: `${item.name} · Custom`,
  }));
  state.gemini.personality = fillSelect(
    elements.geminiPersonality,
    [...PERSONALITY_OPTIONS, ...customOptions],
    state.gemini.personality,
  );
  state.gemini.voice = fillSelect(
    elements.geminiVoice,
    [
      { value: GEMINI_AUTO_VOICE, label: "Auto — match personality" },
      ...GEMINI_VOICE_PRESETS,
    ],
    state.gemini.voice,
  );
}

function renderApiKeys() {
  elements.geminiApiKeyList.innerHTML = "";
  const keys = state.gemini.apiKeys;
  if (state.gemini.activeApiKeyIndex > keys.length)
    state.gemini.activeApiKeyIndex = keys.length;
  keys.forEach((key, index) => {
    const row = document.createElement("div");
    row.className = `api-key-row${index === state.gemini.activeApiKeyIndex ? " active" : ""}`;
    row.innerHTML = `<span class="key-index">${index + 1}</span><input type="password" value="" placeholder="Google AI Studio API key" autocomplete="off"><span class="active-badge">${index === state.gemini.activeApiKeyIndex ? "Active" : ""}</span><button type="button" class="remove-key" aria-label="Remove API key">×</button>`;
    const input = row.querySelector("input");
    input.value = key;
    input.addEventListener("change", async () => {
      state.gemini.apiKeys[index] = input.value.trim();
      state.gemini.apiKey =
        state.gemini.apiKeys[state.gemini.activeApiKeyIndex] || "";
      await stopVoiceForSettingChange();
      await saveState();
      if (index === state.gemini.activeApiKeyIndex) await loadGeminiModels();
    });
    row.querySelector(".remove-key").addEventListener("click", async () => {
      state.gemini.apiKeys.splice(index, 1);
      if (index < state.gemini.activeApiKeyIndex)
        state.gemini.activeApiKeyIndex -= 1;
      state.gemini.activeApiKeyIndex = Math.min(
        state.gemini.activeApiKeyIndex,
        state.gemini.apiKeys.length,
      );
      state.gemini.apiKey =
        state.gemini.apiKeys[state.gemini.activeApiKeyIndex] || "";
      await stopVoiceForSettingChange();
      await saveState();
      renderApiKeys();
      await loadGeminiModels();
    });
    elements.geminiApiKeyList.appendChild(row);
  });
  elements.apiKeyStatus.textContent = keys.length
    ? state.gemini.activeApiKeyIndex >= keys.length
      ? "All saved API keys have exceeded quota. Add another key to continue."
      : `Using API key ${state.gemini.activeApiKeyIndex + 1} of ${keys.length}. It changes only after quota is exceeded.`
    : "Add an API key to begin using chat and voice mode.";
}

function renderPersonalities() {
  elements.personalityList.innerHTML = "";
  state.gemini.customPersonalities.forEach((item) => {
    const row = document.createElement("div");
    row.className = "personality-row";
    row.innerHTML = `<span><strong></strong><small></small></span><button type="button" aria-label="Delete personality">×</button>`;
    row.querySelector("strong").textContent = item.name;
    row.querySelector("small").textContent = item.prompt;
    row.querySelector("button").addEventListener("click", async () => {
      state.gemini.customPersonalities =
        state.gemini.customPersonalities.filter(
          (entry) => entry.id !== item.id,
        );
      if (state.gemini.personality === item.id)
        state.gemini.personality = DEFAULT_PERSONALITY;
      await stopVoiceForSettingChange();
      await saveState();
      renderGeminiOptions();
      renderPersonalities();
    });
    elements.personalityList.appendChild(row);
  });
}

function renderSettings() {
  elements.nameInput.value = state.name;
  elements.defaultEngine.value = state.defaultEngine;
  elements.searchEngine.value = state.defaultEngine;
  elements.themeMode.value = state.theme;
  elements.enableGemini.checked = Boolean(state.gemini.enabled);
  renderGeminiOptions();
  renderApiKeys();
  renderPersonalities();
  applyGeminiVisibility();
}

function applyGeminiVisibility() {
  const show = Boolean(state.gemini.enabled);
  elements.chatButton.classList.toggle("is-hidden", !show);
  elements.orbitChatButton.classList.toggle("is-hidden", !show);
}

function normalizeUrl(url) {
  const trimmed = String(url || "").trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isLikelyUrl(input) {
  return (
    /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i.test(input.trim()) &&
    !input.includes(" ")
  );
}

function buildSearchUrl(engine, query) {
  const encoded = encodeURIComponent(query);
  const engines = {
    google: `https://www.google.com/search?q=${encoded}`,
    youtube: `https://www.youtube.com/results?search_query=${encoded}`,
    github: `https://github.com/search?q=${encoded}`,
    stackoverflow: `https://stackoverflow.com/search?q=${encoded}`,
    wikipedia: `https://en.wikipedia.org/wiki/Special:Search?search=${encoded}`,
  };

  return engines[engine] || engines.google;
}

function getShortcutFallbackText(shortcut) {
  const name = String(shortcut?.name || "App").trim();
  const words = name.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("");
  }

  return name.slice(0, name.length <= 4 ? 4 : 3).toUpperCase();
}

function paintShortcutFallback(target, shortcut) {
  target.innerHTML = "";
  const span = document.createElement("span");
  span.className = "shortcut-fallback";
  span.textContent = getShortcutFallbackText(shortcut);
  span.title = shortcut?.name || "Shortcut";
  target.appendChild(span);
}

function paintShortcutIcon(target, shortcut) {
  target.innerHTML = "";

  if (shortcut.iconType === "image" && shortcut.iconValue) {
    const img = document.createElement("img");
    img.className = "shortcut-image";
    img.src = shortcut.iconValue;
    img.alt = shortcut.name || "Shortcut";
    img.loading = "lazy";
    img.onerror = () => paintShortcutFallback(target, shortcut);
    target.appendChild(img);
    return;
  }

  if (shortcut.iconType === "fa" && shortcut.iconValue) {
    const icon = document.createElement("i");
    icon.className = shortcut.iconValue;
    target.appendChild(icon);
    return;
  }

  paintShortcutFallback(target, shortcut);
}

function renderHomeShortcuts() {
  elements.homeShortcuts.innerHTML = "";

  state.shortcuts.slice(0, 10).forEach((shortcut) => {
    const link = document.createElement("a");
    link.href = normalizeUrl(shortcut.url);
    link.className = "home-shortcut";
    link.title = shortcut.name;
    paintShortcutIcon(link, shortcut);
    elements.homeShortcuts.appendChild(link);
  });
}

function renderShortcuts() {
  elements.shortcutsGrid.innerHTML = "";
  elements.shortcutCount.textContent = state.shortcuts.length;

  renderHomeShortcuts();

  if (state.shortcuts.length === 0) {
    elements.shortcutsGrid.innerHTML = `<div class="empty-state">No shortcuts yet.</div>`;
    return;
  }

  state.shortcuts.forEach((shortcut) => {
    const card = document.createElement("a");
    card.href = normalizeUrl(shortcut.url);
    card.className = "shortcut-card";
    card.title = shortcut.name;

    const actions = document.createElement("div");
    actions.className = "shortcut-actions";

    const editButton = document.createElement("button");
    editButton.className = "mini-action";
    editButton.type = "button";
    editButton.innerHTML = `<i class="fa-solid fa-pen"></i>`;
    editButton.title = "Edit";
    editButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openShortcutForEdit(shortcut.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "mini-action";
    deleteButton.type = "button";
    deleteButton.innerHTML = `<i class="fa-solid fa-trash"></i>`;
    deleteButton.title = "Delete";
    deleteButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.shortcuts = state.shortcuts.filter(
        (item) => item.id !== shortcut.id,
      );
      await saveState();
      renderShortcuts();
    });

    actions.append(editButton, deleteButton);

    paintShortcutIcon(card, shortcut);
    card.appendChild(actions);
    elements.shortcutsGrid.appendChild(card);
  });
}

function openShortcutForEdit(shortcutId) {
  const shortcut = state.shortcuts.find((item) => item.id === shortcutId);
  if (!shortcut) return;

  editingShortcutId = shortcutId;
  elements.shortcutEditId.value = shortcut.id;
  elements.shortcutName.value = shortcut.name;
  elements.shortcutUrl.value = shortcut.url;
  elements.shortcutIconType.value = shortcut.iconType || "text";
  elements.shortcutIconValue.value = shortcut.iconValue || "";
  updateShortcutIconPlaceholder();
}

function clearShortcutForm() {
  editingShortcutId = null;
  elements.shortcutForm.reset();
  elements.shortcutEditId.value = "";
  elements.shortcutIconType.value = "image";
  updateShortcutIconPlaceholder();
}

function updateShortcutIconPlaceholder() {
  const type = elements.shortcutIconType.value;

  if (type === "image") {
    elements.shortcutIconValue.placeholder =
      "shortcuticons/github.png or https://site.com/icon.png";
  } else if (type === "text") {
    elements.shortcutIconValue.placeholder = "GH";
  } else {
    elements.shortcutIconValue.placeholder = "fa-brands fa-github";
  }
}

function renderTasks() {
  elements.taskList.innerHTML = "";
  elements.taskCount.textContent = state.tasks.filter(
    (task) => !task.done,
  ).length;

  if (state.tasks.length === 0) {
    elements.taskList.innerHTML = `<li class="empty-state">No tasks yet.</li>`;
    updateGreeting();
    return;
  }

  state.tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = `task-item ${task.done ? "done" : ""}`;

    const check = document.createElement("button");
    check.className = "task-check";
    check.type = "button";
    check.innerHTML = `<i class="fa-solid fa-check"></i>`;
    check.addEventListener("click", async () => {
      task.done = !task.done;
      await saveState();
      renderTasks();
    });

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const remove = document.createElement("button");
    remove.className = "task-delete";
    remove.type = "button";
    remove.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
    remove.addEventListener("click", async () => {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      await saveState();
      renderTasks();
    });

    li.append(check, title, remove);
    elements.taskList.appendChild(li);
  });

  updateGreeting();
}

function renderNotes() {
  elements.notesArea.value = state.notes;
  elements.notesCount.textContent = state.notes.trim().length;
}

function renderChat() {
  elements.chatBox.innerHTML = "";

  state.chat.forEach((message) => {
    const div = document.createElement("div");
    div.className =
      `msg ${message.role === "user" ? "user" : "assistant"} ${message.kind === "error" ? "error" : ""}`.trim();
    div.textContent = message.content;
    elements.chatBox.appendChild(div);
  });

  elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
}

function openPanel(panelName) {
  $$(".modal").forEach((modal) => {
    modal.classList.toggle("active", modal.dataset.panel === panelName);
  });

  elements.panelModal.classList.add("open");
  elements.panelModal.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    if (panelName === "shortcuts") elements.shortcutName.focus();
    if (panelName === "focus") elements.taskInput.focus();
    if (panelName === "notes") elements.notesArea.focus();
    if (panelName === "chat") elements.chatInput.focus();
  }, 120);
}

function closePanel() {
  elements.panelModal.classList.remove("open");
  elements.panelModal.setAttribute("aria-hidden", "true");

  setTimeout(() => {
    $$(".modal").forEach((modal) => modal.classList.remove("active"));
  }, 260);
}

function openSettings() {
  elements.settingsDrawer.inert = false;
  elements.settingsDrawer.classList.add("open");
  elements.drawerScrim.classList.add("open");

  setTimeout(() => {
    elements.nameInput.focus();
  }, 80);
}

function closeSettings() {
  if (elements.settingsDrawer.contains(document.activeElement)) {
    document.activeElement.blur();
    elements.settingsButton.focus();
  }

  elements.settingsDrawer.classList.remove("open");
  elements.drawerScrim.classList.remove("open");
  elements.settingsDrawer.inert = true;
}

function getGeminiConfig() {
  return {
    ...state.gemini,
    userName: String(state.name || "Friend").trim() || "Friend",
  };
}

function setVoiceStatus(status, label) {
  voiceStatus = status;
  document.body.dataset.voice = status;
  elements.chatButton.dataset.voice = status;
  elements.orbitChatButton.dataset.voice = status;

  [elements.chatButton, elements.orbitChatButton].forEach((button) => {
    button.classList.remove(
      "voice-off",
      "voice-connecting",
      "voice-listening",
      "voice-thinking",
      "voice-speaking",
    );
    button.classList.add(`voice-${status}`);
  });

  if (label) elements.assistantLine.textContent = label;
}

function createEmptyVoiceTurn() {
  return {
    userMessage: null,
    assistantMessage: null,
    inputText: "",
    outputText: "",
    complete: false,
  };
}

function appendTranscriptChunk(current, incoming) {
  const existing = String(current || "");
  const next = String(incoming || "");
  if (!next) return existing;
  if (!existing) return next;
  if (next.startsWith(existing)) return next;
  if (existing.endsWith(next)) return existing;

  const needsSpace = !/\s$/.test(existing) && !/^\s|^[.,!?;:]/.test(next);
  return `${existing}${needsSpace ? " " : ""}${next}`;
}

function ensureVoiceUserMessage() {
  if (voiceTurn.userMessage) return voiceTurn.userMessage;

  voiceTurn.userMessage = { role: "user", content: "" };
  if (voiceTurn.assistantMessage) {
    const assistantIndex = state.chat.indexOf(voiceTurn.assistantMessage);
    state.chat.splice(Math.max(0, assistantIndex), 0, voiceTurn.userMessage);
  } else {
    state.chat.push(voiceTurn.userMessage);
  }
  return voiceTurn.userMessage;
}

function ensureVoiceAssistantMessage() {
  if (voiceTurn.assistantMessage) return voiceTurn.assistantMessage;
  voiceTurn.assistantMessage = { role: "assistant", content: "" };
  state.chat.push(voiceTurn.assistantMessage);
  return voiceTurn.assistantMessage;
}

function updateVoiceInputTranscript(chunk) {
  if (voiceTurn.complete && (voiceTurn.inputText || voiceTurn.outputText)) {
    const pendingChunk = String(chunk || "");
    finishVoiceTurn()
      .then(() => updateVoiceInputTranscript(pendingChunk))
      .catch((error) =>
        console.error("Could not finalize the previous voice turn", error),
      );
    return;
  }

  const message = ensureVoiceUserMessage();
  voiceTurn.inputText = appendTranscriptChunk(voiceTurn.inputText, chunk);
  message.content = voiceTurn.inputText;
  renderChat();
}

function updateVoiceOutputTranscript(chunk) {
  const message = ensureVoiceAssistantMessage();
  voiceTurn.outputText = appendTranscriptChunk(voiceTurn.outputText, chunk);
  message.content = voiceTurn.outputText;
  renderChat();

  if (voiceTurn.complete) scheduleVoiceTurnFinish();
}

function scheduleVoiceTurnFinish(delay = 500) {
  clearTimeout(voiceTurnFinalizeTimer);
  voiceTurnFinalizeTimer = setTimeout(() => {
    finishVoiceTurn().catch((error) =>
      console.error("Could not save Friday Live turn", error),
    );
  }, delay);
}

async function finishVoiceTurn() {
  clearTimeout(voiceTurnFinalizeTimer);
  voiceTurnFinalizeTimer = null;
  state.chat = state.chat
    .filter((message) => String(message?.content || "").trim())
    .slice(-20);
  voiceTurn = createEmptyVoiceTurn();
  await saveState();
  renderChat();
}

async function showGeminiError(message, { openChat = false } = {}) {
  const clean = String(
    message || "Gemini encountered an unexpected error.",
  ).trim();
  const lastMessage = state.chat[state.chat.length - 1];

  if (!(lastMessage?.kind === "error" && lastMessage.content === clean)) {
    state.chat.push({ role: "assistant", content: clean, kind: "error" });
    state.chat = state.chat.slice(-20);
    await saveState();
    renderChat();
  }

  if (openChat) openPanel("chat");
}

const conversationManager = new ConversationManager({ maxMessages: 20 });
const geminiService = new GeminiService({
  getConfig: getGeminiConfig,
  onActiveKeyChange: async (index) => {
    state.gemini.activeApiKeyIndex = index;
    state.gemini.apiKey = state.gemini.apiKeys[index] || "";
    await saveState();
    renderApiKeys();
  },
  promptBuilder: PromptBuilder,
  conversationManager,
});

const geminiVoice = new GeminiVoice({
  onStatus: (status, label) => setVoiceStatus(status, label),
  onAudioLevel: (level) =>
    elements.orbitChatButton.style.setProperty(
      "--voice-level",
      Number(level || 0).toFixed(3),
    ),
  onInputTranscript: updateVoiceInputTranscript,
  onOutputTranscript: updateVoiceOutputTranscript,
  onInterrupted: () =>
    setVoiceStatus("listening", "Interrupted. Gemini is listening..."),
  onTurnComplete: () => {
    voiceTurn.complete = true;
    scheduleVoiceTurnFinish();
  },
  onPlaybackIdle: () => {
    if (voiceModeActive && voiceStatus === "speaking") {
      setVoiceStatus("listening", "Friday Live is listening...");
    }
  },
  onError: (error) => {
    voiceModeActive = false;
    finishVoiceTurn().finally(() => {
      setVoiceStatus("off", error.message);
      showGeminiError(error.message, { openChat: true });
    });
  },
});

async function sendChatMessage(message) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) return;

  const userMessage = { role: "user", content: cleanMessage };
  const assistantMessage = { role: "assistant", content: "" };
  state.chat.push(userMessage, assistantMessage);
  renderChat();

  let responseText = "";
  let toolStatusMessage = null;

  const clearToolStatus = () => {
    if (toolStatusMessage) {
      state.chat = state.chat.filter((item) => item !== toolStatusMessage);
      toolStatusMessage = null;
    }
  };

  try {
    await geminiService.streamText(cleanMessage, {
      messages: state.chat,
      onToken: (_token, fullText) => {
        clearToolStatus();
        responseText = fullText;
        assistantMessage.content = fullText;
        renderChat();
      },
      onDone: (fullText) => {
        clearToolStatus();
        responseText = fullText;
        assistantMessage.content = fullText;
        renderChat();
      },
      onToolStart: (toolName) => {
        clearToolStatus();
        toolStatusMessage = {
          role: "assistant",
          content: `Using ${String(toolName || "").replaceAll("_", " ")}...`,
          kind: "status",
        };
        const assistantIndex = state.chat.indexOf(assistantMessage);
        if (assistantIndex >= 0) {
          state.chat.splice(assistantIndex, 0, toolStatusMessage);
        } else {
          state.chat.push(toolStatusMessage);
        }
        renderChat();
      },
      onToolEnd: () => {
        clearToolStatus();
        renderChat();
      },
    });
  } catch (error) {
    clearToolStatus();
    if (error?.name === "AbortError") {
      assistantMessage.content = responseText || "Response stopped.";
    } else {
      assistantMessage.content =
        error?.message || "Gemini could not complete this request.";
      assistantMessage.kind = "error";
    }
  }

  clearToolStatus();
  state.chat = state.chat
    .filter((item) => String(item?.content || "").trim())
    .slice(-20);
  await saveState();
  renderChat();
}

async function stopVoiceAssistant({ label = "Voice mode stopped." } = {}) {
  voiceModeActive = false;
  await geminiVoice.stop({ silent: true });
  await finishVoiceTurn();
  setVoiceStatus("off", label);
}

async function startVoiceAssistant() {
  if (!state.gemini.enabled) {
    await showGeminiError("Gemini is disabled in Settings.", {
      openChat: true,
    });
    return;
  }

  if (!state.gemini.apiKeys.length) {
    await showGeminiError(
      "Add at least one Gemini API key in Settings before starting voice mode.",
      { openChat: true },
    );
    openSettings();
    return;
  }

  if (state.gemini.activeApiKeyIndex >= state.gemini.apiKeys.length) {
    state.gemini.activeApiKeyIndex = 0;
    state.gemini.apiKey = state.gemini.apiKeys[0] || "";
    await saveState();
    renderApiKeys();
  }

  voiceModeActive = true;
  voiceTurn = createEmptyVoiceTurn();

  const startIndex = state.gemini.activeApiKeyIndex;
  let lastQuotaError = null;

  try {
    for (let attempt = 0; attempt < state.gemini.apiKeys.length; attempt += 1) {
      const keyIndex = (startIndex + attempt) % state.gemini.apiKeys.length;

      state.gemini.activeApiKeyIndex = keyIndex;
      state.gemini.apiKey = state.gemini.apiKeys[keyIndex] || "";

      await saveState();
      renderApiKeys();

      try {
        await geminiVoice.start({
          apiKey: state.gemini.apiKeys[keyIndex],
          voice: resolveGeminiVoice(
            state.gemini.voice,
            state.gemini.personality,
          ),
          systemInstruction: PromptBuilder.build({
            userName: state.name,
            personality: state.gemini.personality,
            customPersonalities: state.gemini.customPersonalities,
            mode: "voice",
          }),
          history: conversationManager.buildLiveHistory(state.chat),
        });

        // Successfully connected.
        return;
      } catch (error) {
        if (error?.code !== "QUOTA_EXCEEDED") {
          throw error;
        }

        lastQuotaError = error;

        console.warn(
          `[Friday Live] API key ${keyIndex + 1}/${state.gemini.apiKeys.length} quota exhausted.`,
        );

        // Try the next key.
      }
    }

    // Every key was attempted and exhausted.
    const exhaustedError = new Error(
      "All Gemini API keys have exceeded their Live API quota. Add another API key or wait for the quota to reset.",
    );

    exhaustedError.code = "ALL_KEYS_EXHAUSTED";
    exhaustedError.cause = lastQuotaError;

    throw exhaustedError;
  } catch (error) {
    voiceModeActive = false;

    // Reset to the first key after all keys are exhausted.
    if (error?.code === "ALL_KEYS_EXHAUSTED") {
      state.gemini.activeApiKeyIndex = 0;
      state.gemini.apiKey = state.gemini.apiKeys[0] || "";
      await saveState();
      renderApiKeys();
    }

    setVoiceStatus("off", error.message);
    await showGeminiError(error.message, { openChat: true });
  }
}
async function toggleVoiceAssistant() {
  if (voiceTransitionPromise) return voiceTransitionPromise;

  voiceTransitionPromise = (async () => {
    elements.orbitChatButton.disabled = true;

    if (voiceModeActive || geminiVoice.active) {
      await stopVoiceAssistant();
    } else {
      await startVoiceAssistant();
    }
  })();

  try {
    await voiceTransitionPromise;
  } finally {
    voiceTransitionPromise = null;
    elements.orbitChatButton.disabled = false;
  }
}

async function stopVoiceForSettingChange() {
  if (!voiceModeActive && !geminiVoice.active) return;
  await stopVoiceAssistant({
    label: "Voice settings changed. Start voice mode again.",
  });
}

const GEMINI_MODELS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";

function normalizeGeminiModelName(modelName) {
  return String(modelName || "")
    .trim()
    .replace(/^models\//, "");
}

function getCurrentGeminiApiKey() {
  return String(
    state.gemini.apiKeys?.[state.gemini.activeApiKeyIndex] || "",
  ).trim();
}

function setGeminiModelStatus(message, type = "normal") {
  elements.geminiModelStatus.textContent = message;
  elements.geminiModelStatus.dataset.type = type;
}

async function loadGeminiModels() {
  const apiKey = getCurrentGeminiApiKey();
  const selectedModel = normalizeGeminiModelName(state.gemini.model);

  if (!apiKey) {
    elements.geminiModel.innerHTML =
      '<option value="">Add an API key to load models</option>';
    elements.customGeminiModel.value = selectedModel;
    setGeminiModelStatus(
      "Add a Gemini API key before loading available models.",
      "error",
    );
    return;
  }

  elements.refreshGeminiModels.disabled = true;
  elements.geminiModel.disabled = true;
  elements.geminiModel.innerHTML =
    '<option value="">Loading Gemini models...</option>';
  setGeminiModelStatus("Loading available Gemini models...");

  try {
    const models = [];
    let pageToken = "";

    do {
      const url = new URL(GEMINI_MODELS_ENDPOINT);
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await fetch(url.toString(), {
        headers: { "x-goog-api-key": apiKey },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload?.error?.message ||
            `Could not load Gemini models (${response.status}).`,
        );

      models.push(...(Array.isArray(payload.models) ? payload.models : []));
      pageToken = payload.nextPageToken || "";
    } while (pageToken);

    const textModels = models
      .filter((model) =>
        model.supportedGenerationMethods?.includes("generateContent"),
      )
      .map((model) => ({
        value: normalizeGeminiModelName(model.baseModelId || model.name),
        label: model.displayName || normalizeGeminiModelName(model.name),
      }))
      .filter((model) => model.value)
      .filter(
        (model, index, list) =>
          list.findIndex((item) => item.value === model.value) === index,
      )
      .sort((a, b) => a.label.localeCompare(b.label));

    elements.geminiModel.innerHTML =
      '<option value="">Select a Gemini model</option>';
    textModels.forEach((model) => {
      const option = document.createElement("option");
      option.value = model.value;
      option.textContent = `${model.label} — ${model.value}`;
      elements.geminiModel.appendChild(option);
    });

    if (textModels.some((model) => model.value === selectedModel)) {
      elements.geminiModel.value = selectedModel;
      elements.customGeminiModel.value = "";
    } else {
      elements.geminiModel.value = "";
      elements.customGeminiModel.value = selectedModel;
    }
    setGeminiModelStatus(
      `${textModels.length} compatible Gemini models loaded.`,
      "success",
    );
  } catch (error) {
    elements.geminiModel.innerHTML =
      '<option value="">Could not load models</option>';
    elements.customGeminiModel.value = selectedModel;
    setGeminiModelStatus(
      error?.message || "Could not load Gemini models.",
      "error",
    );
  } finally {
    elements.geminiModel.disabled = false;
    elements.refreshGeminiModels.disabled = false;
  }
}

function attachEvents() {
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const query = elements.searchInput.value.trim();
    if (!query) return;

    const target = isLikelyUrl(query)
      ? normalizeUrl(query)
      : buildSearchUrl(elements.searchEngine.value, query);

    window.location.href = target;
  });

  elements.themeToggle.addEventListener("click", async () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    elements.themeMode.value = state.theme;
    applyTheme();
    await saveState();
  });

  elements.chatButton.addEventListener("click", () => openPanel("chat"));
  elements.orbitChatButton.addEventListener("click", () => {
    toggleVoiceAssistant().catch(console.error);
  });
  elements.openShortcutsPanel.addEventListener("click", () =>
    openPanel("shortcuts"),
  );
  elements.openFocusPanel.addEventListener("click", () => openPanel("focus"));
  elements.openNotesPanel.addEventListener("click", () => openPanel("notes"));

  $$(".close-panel").forEach((button) => {
    button.addEventListener("click", closePanel);
  });

  elements.panelModal.addEventListener("click", (event) => {
    if (event.target === elements.panelModal) closePanel();
  });

  elements.settingsButton.addEventListener("click", openSettings);
  elements.closeSettings.addEventListener("click", closeSettings);
  elements.drawerScrim.addEventListener("click", closeSettings);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePanel();
      closeSettings();
    }
  });

  elements.shortcutIconType.addEventListener(
    "change",
    updateShortcutIconPlaceholder,
  );
  elements.clearShortcutForm.addEventListener("click", clearShortcutForm);

  elements.shortcutForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = elements.shortcutName.value.trim();
    const url = elements.shortcutUrl.value.trim();

    if (!name || !url) return;

    const item = {
      id: editingShortcutId || makeId(),
      name,
      url: normalizeUrl(url),
      iconType: elements.shortcutIconType.value,
      iconValue: elements.shortcutIconValue.value.trim(),
    };

    if (editingShortcutId) {
      state.shortcuts = state.shortcuts.map((shortcut) =>
        shortcut.id === editingShortcutId ? item : shortcut,
      );
    } else {
      state.shortcuts.unshift(item);
    }

    await saveState();
    renderShortcuts();
    clearShortcutForm();
  });

  elements.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = elements.taskInput.value.trim();
    if (!title) return;

    state.tasks.unshift({ id: makeId(), title, done: false });
    elements.taskInput.value = "";

    await saveState();
    renderTasks();
  });

  elements.clearCompletedButton.addEventListener("click", async () => {
    state.tasks = state.tasks.filter((task) => !task.done);
    await saveState();
    renderTasks();
  });

  elements.notesArea.addEventListener("input", () => {
    state.notes = elements.notesArea.value;
    elements.notesCount.textContent = state.notes.trim().length;
    elements.notesState.textContent = "Saving...";
    elements.notesState.style.color = "var(--muted)";

    clearTimeout(notesTimer);

    notesTimer = setTimeout(async () => {
      await saveState();
      elements.notesState.textContent = "Saved";
      elements.notesState.style.color = "var(--success)";
    }, 400);
  });

  elements.clearChatButton.addEventListener("click", async () => {
    const shouldClear = confirm("Clear Friday chat history?");
    if (!shouldClear) return;

    await stopVoiceAssistant();
    geminiService.abort();

    state.chat = [
      {
        role: "assistant",
        content: state.gemini.apiKeys.some(Boolean)
          ? "Chat cleared. Ask me anything."
          : "Chat cleared. Add your Gemini API key in Settings, then ask anything.",
      },
    ];

    await saveState();
    renderChat();
    elements.chatInput.focus();
  });

  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = elements.chatInput.value.trim();
    if (!message) return;

    elements.chatInput.value = "";
    await sendChatMessage(message);
  });

  elements.nameInput.addEventListener("input", async () => {
    state.name = elements.nameInput.value.trim() || "Friend";
    updateGreeting();
    await saveState();
  });

  elements.defaultEngine.addEventListener("change", async () => {
    state.defaultEngine = elements.defaultEngine.value;
    elements.searchEngine.value = state.defaultEngine;
    await saveState();
  });

  elements.themeMode.addEventListener("change", async () => {
    state.theme = elements.themeMode.value;
    applyTheme();
    await saveState();
  });

  elements.enableGemini.addEventListener("change", async () => {
    state.gemini.enabled = elements.enableGemini.checked;
    if (!state.gemini.enabled) {
      geminiService.abort();
      await stopVoiceAssistant({ label: "Gemini is disabled." });
    }
    applyGeminiVisibility();
    await saveState();
  });

  elements.addGeminiApiKey.addEventListener("click", async () => {
    state.gemini.apiKeys.push("");
    if (state.gemini.apiKeys.length === 1) state.gemini.activeApiKeyIndex = 0;
    await saveState();
    renderApiKeys();
    elements.geminiApiKeyList.lastElementChild?.querySelector("input")?.focus();
  });

  elements.addPersonality.addEventListener("click", () => {
    elements.personalityName.value = "";
    elements.personalityPrompt.value = "";
    elements.personalityEditor.classList.remove("is-hidden");
    elements.personalityName.focus();
  });

  elements.cancelPersonality.addEventListener("click", () =>
    elements.personalityEditor.classList.add("is-hidden"),
  );

  elements.savePersonality.addEventListener("click", async () => {
    const name = elements.personalityName.value.trim();
    const prompt = elements.personalityPrompt.value.trim();
    if (!name || !prompt) return;
    const item = { id: `custom-${makeId()}`, name, prompt };
    state.gemini.customPersonalities.push(item);
    state.gemini.personality = item.id;
    elements.personalityEditor.classList.add("is-hidden");
    await stopVoiceForSettingChange();
    await saveState();
    renderGeminiOptions();
    renderPersonalities();
  });

  elements.geminiModel.addEventListener("change", async () => {
    const selectedModel = normalizeGeminiModelName(elements.geminiModel.value);
    if (!selectedModel) return;
    state.gemini.model = selectedModel;
    elements.customGeminiModel.value = "";
    geminiService.abort();
    await stopVoiceForSettingChange();
    await saveState();
    setGeminiModelStatus(`Using ${selectedModel}.`, "success");
  });

  elements.customGeminiModel.addEventListener("change", async () => {
    const customModel = normalizeGeminiModelName(
      elements.customGeminiModel.value,
    );
    if (!customModel) return;
    state.gemini.model = customModel;
    elements.customGeminiModel.value = customModel;
    elements.geminiModel.value = "";
    geminiService.abort();
    await stopVoiceForSettingChange();
    await saveState();
    setGeminiModelStatus(`Using custom model: ${customModel}.`, "success");
  });

  elements.refreshGeminiModels.addEventListener("click", () =>
    loadGeminiModels().catch(console.error),
  );

  elements.geminiVoice.addEventListener("change", async () => {
    state.gemini.voice = elements.geminiVoice.value || GEMINI_AUTO_VOICE;
    await stopVoiceForSettingChange();
    await saveState();
  });

  elements.geminiPersonality.addEventListener("change", async () => {
    state.gemini.personality =
      elements.geminiPersonality.value || DEFAULT_PERSONALITY;
    await stopVoiceForSettingChange();
    await saveState();
  });

  elements.accentRow.addEventListener("click", async (event) => {
    const button = event.target.closest(".accent-dot");
    if (!button) return;

    state.accent = button.dataset.color;
    applyTheme();
    await saveState();
  });

  elements.customAccentColor.addEventListener("input", async () => {
    state.accent = elements.customAccentColor.value;
    applyTheme();
    await saveState();
  });

  elements.resetButton.addEventListener("click", async () => {
    const shouldReset = confirm("Reset Friday New Tab data?");
    if (!shouldReset) return;

    geminiService.abort();
    await stopVoiceAssistant();
    state = clone(defaultState);
    await saveState();
    renderAll();
    closeSettings();
  });
}

function renderAll() {
  applyTheme();
  renderSettings();
  renderShortcuts();
  renderTasks();
  renderNotes();
  renderChat();
  updateClock();
  updateShortcutIconPlaceholder();
}

async function init() {
  await loadState();
  renderAll();
  attachEvents();
  await loadGeminiModels();
  setVoiceStatus("off");
  startOrbitClock();
  setInterval(updateClock, 1000);

  window.addEventListener("offline", () => {
    geminiService.abort();
    if (voiceModeActive || geminiVoice.active) {
      stopVoiceAssistant({ label: "Offline. Voice mode stopped." })
        .then(() =>
          showGeminiError(
            "The internet connection was lost. Gemini voice mode has stopped.",
          ),
        )
        .catch(console.error);
    }
  });

  window.addEventListener("beforeunload", () => {
    geminiService.abort();
    geminiVoice.stop({ silent: true });
  });
}

init().catch((error) => {
  console.error("Friday New Tab failed to start", error);
});
