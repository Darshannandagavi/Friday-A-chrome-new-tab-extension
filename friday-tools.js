// friday-tools.js
// friday-tools.js
import { FridayMemory, normalizeSiteKey } from "./friday-memory.js";
const OPEN_METEO_GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";

/*
 * ============================================================================
 * TOOL DECLARATIONS
 * ============================================================================
 *
 * These schemas are sent to Gemini Live during session setup.
 *
 * google_search is intentionally NOT declared here.
 * It is provided by Gemini's native Google Search tool.
 */

export const FRIDAY_TOOL_DECLARATIONS = Object.freeze([
  {
    name: "open_tab",
    description:
      "Open a URL in a new Chrome tab. Use this when the user explicitly asks Friday to open a website or URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The complete URL to open. Example: https://github.com",
        },
        active: {
          type: "boolean",
          description:
            "Whether the new tab should become the active tab. Defaults to true.",
        },
      },
      required: ["url"],
    },
  },

  {
    name: "close_tab",
    description:
      "Close a Chrome tab. If no tab ID is supplied, close the currently active normal browser tab.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "integer",
          description:
            "Optional Chrome tab ID. If omitted, Friday closes the active tab.",
        },
      },
    },
  },

  {
    name: "switch_tab",
    description:
      "Switch to an existing Chrome tab. Use tabId when known, otherwise search tabs by title or URL.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "integer",
          description: "Optional Chrome tab ID.",
        },
        query: {
          type: "string",
          description: "Optional text to match against the tab title or URL.",
        },
      },
    },
  },

  {
    name: "list_tabs",
    description:
      "List the user's currently open Chrome tabs. Use this when the user asks what tabs are open or wants to identify a tab.",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "browser_search",
    description:
      "Open a browser search for the user's query in a new Chrome tab. Use this when the user explicitly asks Friday to search the browser or open search results.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
        engine: {
          type: "string",
          enum: ["google", "bing", "duckduckgo"],
          description: "Search engine to use. Defaults to google.",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "read_page",
    description:
      "Read the visible text content of a webpage in a Chrome tab. Use this when the user asks Friday to read, summarize, inspect, or understand the currently open webpage.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "integer",
          description:
            "Optional Chrome tab ID. If omitted, use the active tab.",
        },
        maxCharacters: {
          type: "integer",
          description:
            "Maximum amount of page text to return. Defaults to 12000.",
        },
      },
    },
  },

  {
    name: "wait_for_tab",
    description:
      "Wait for a Chrome tab to finish loading and return its current title and URL. Use after opening a page before reading it when the page may still be loading.",
    parameters: {
      type: "object",
      properties: {
        tabId: { type: "integer", description: "Chrome tab ID to wait for." },
        timeoutMs: {
          type: "integer",
          description: "Maximum wait time in milliseconds. Defaults to 10000.",
        },
      },
      required: ["tabId"],
    },
  },

  {
    name: "get_tab_info",
    description:
      "Get the current title, URL, loading status, and basic metadata for a Chrome tab.",
    parameters: {
      type: "object",
      properties: {
        tabId: { type: "integer", description: "Optional Chrome tab ID." },
      },
    },
  },

  {
    name: "click_page_link",

    description:
      "Click a visible link or button on a webpage by matching its text. Use this to continue navigating a page when a direct URL is not available.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "integer",
          description: "Optional Chrome tab ID. Defaults to the active tab.",
        },
        text: {
          type: "string",
          description: "Visible link or button text to click.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "fill_login_form",
    description:
      "Fill a login form on the current page using previously saved credentials (see save_memory). Never asks for or receives the raw password from the model - it is read directly from memory and typed into the page. Handles both single-step forms and progressive (email-first, then password) login flows automatically. Returns missingCredentials: true if nothing is saved yet for this site. Returns advancedToNextStep: true if the site only asks for an email first and the password field has not rendered yet - in that case call wait_for_tab briefly, then call fill_login_form again to fill the password once it appears.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "integer",
          description: "Optional Chrome tab ID. Defaults to the active tab.",
        },
        site: {
          type: "string",
          description:
            "Optional site domain to look up (e.g. liganddevelopers.vercel.app). Defaults to the current tab's hostname.",
        },
        submit: {
          type: "boolean",
          description:
            "If true, submit the form immediately after filling it. Defaults to false.",
        },
      },
    },
  },

  {
    name: "fill_input",
    description:
      "Type a value into a text-like form field on the current page, matched by its label, placeholder, name, or aria-label. Use this for search boxes, signup fields, or any non-password input. Do not use this for password fields - use fill_login_form with save_memory instead.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "integer",
          description: "Optional Chrome tab ID. Defaults to the active tab.",
        },
        fieldLabel: {
          type: "string",
          description:
            "Text identifying the field - its visible label, placeholder, or name attribute.",
        },
        value: {
          type: "string",
          description: "The text to type into the field.",
        },
      },
      required: ["fieldLabel", "value"],
    },
  },

  {
    name: "save_memory",
    description:
      "Permanently remember a piece of reusable information, such as a login username, email, password, or PIN, for a specific site or service, so the user never has to repeat it. Call this immediately whenever the user shares login details or similar credentials in conversation, even if they did not explicitly ask you to remember it. Use the site's exact domain as the site value (e.g. liganddevelopers.vercel.app), matching the current tab's hostname when the user is already on that site.",
    parameters: {
      type: "object",
      properties: {
        site: {
          type: "string",
          description:
            "The domain or service name this belongs to, e.g. liganddevelopers.vercel.app.",
        },
        field: {
          type: "string",
          description:
            "What kind of value this is, e.g. username, email, password, or pin.",
        },
        value: { type: "string", description: "The value to remember." },
      },
      required: ["site", "field", "value"],
    },
  },

  {
    name: "get_memory",
    description:
      "Check what information is already saved for a site or service before asking the user for it again. Returns which fields are saved (e.g. username, password) without exposing their values.",
    parameters: {
      type: "object",
      properties: {
        site: {
          type: "string",
          description:
            "The domain or service name to look up, e.g. liganddevelopers.vercel.app.",
        },
      },
      required: ["site"],
    },
  },

  {
    name: "forget_memory",
    description:
      "Delete previously saved information for a site or service, for example if the user's password changed or they ask Friday to forget it.",
    parameters: {
      type: "object",
      properties: {
        site: {
          type: "string",
          description:
            "The domain or service name to forget, e.g. liganddevelopers.vercel.app.",
        },
      },
      required: ["site"],
    },
  },

  {
    name: "list_saved_sites",
    description:
      "List the sites or services Friday currently has saved information for, without revealing the values. Use this if the user asks what you remember.",
    parameters: { type: "object", properties: {} },
  },

  {
    name: "calculator",
    description:
      "Perform a mathematical calculation accurately. Use this instead of doing arithmetic mentally.",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            "A mathematical expression using numbers, +, -, *, /, %, parentheses and decimals.",
        },
      },
      required: ["expression"],
    },
  },

  {
    name: "get_time",
    description:
      "Get the current local time. If a location is supplied, return the local time for that location.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "City or location, for example Bengaluru, London, Tokyo or New York.",
        },
      },
    },
  },

  {
    name: "get_date",
    description:
      "Get the current local date. If a location is supplied, return the date for that location.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "City or location, for example Bengaluru, London, Tokyo or New York.",
        },
      },
    },
  },

  {
    name: "get_weather",
    description:
      "Get the current weather and today's forecast for a city or location.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "City or location, for example Bengaluru, London or Mumbai.",
        },
      },
      required: ["location"],
    },
  },

  {
    name: "open_website",
    description:
      "Open a website in a new Chrome tab. Use this when the user asks Friday to open a website.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The complete website URL or domain to open.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "wait_for_text",
    description:
      "Wait for specific text to appear on a webpage. Use this to wait for asynchronous API calls or dynamic SPA content to load before reading the page.",
    parameters: {
      type: "object",
      properties: {
        tabId: {
          type: "integer",
          description: "Optional Chrome tab ID. Defaults to the active tab.",
        },
        text: {
          type: "string",
          description:
            "The visible text to wait for (e.g., 'Dashboard' or 'Students').",
        },
        timeoutMs: {
          type: "integer",
          description: "Maximum wait time in milliseconds. Defaults to 10000.",
        },
      },
      required: ["text"],
    },
  },
]);

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function ensureChromeApi() {
  if (typeof chrome === "undefined") {
    throw new Error("Chrome extension APIs are unavailable.");
  }
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    throw new Error("A URL is required.");
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (/^(chrome|edge|about|file):/i.test(raw)) {
    return raw;
  }

  return `https://${raw}`;
}

function truncateText(text, maxCharacters = 12000) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  const limit = Math.max(1000, Math.min(Number(maxCharacters) || 12000, 30000));

  if (clean.length <= limit) {
    return clean;
  }

  return `${clean.slice(0, limit)}\n\n[Page text truncated.]`;
}

async function getActiveTab() {
  ensureChromeApi();

  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  const tab = tabs?.[0];

  if (!tab?.id) {
    throw new Error("No active browser tab was found.");
  }

  return tab;
}

/*
 * ============================================================================
 * OPEN TAB
 * ============================================================================
 */

async function openTab({ url, active = true } = {}) {
  ensureChromeApi();

  const normalizedUrl = normalizeUrl(url);

  const tab = await chrome.tabs.create({
    url: normalizedUrl,
    active: active !== false,
  });

  return {
    success: true,
    action: "open_tab",
    tabId: tab.id,
    title: tab.title || "",
    url: tab.url || normalizedUrl,
  };
}

/*
 * ============================================================================
 * CLOSE TAB
 * ============================================================================
 */

async function closeTab({ tabId } = {}) {
  ensureChromeApi();

  let targetTabId = Number(tabId);

  if (!Number.isInteger(targetTabId)) {
    const activeTab = await getActiveTab();
    targetTabId = activeTab.id;
  }

  if (!Number.isInteger(targetTabId)) {
    throw new Error("Could not determine which tab to close.");
  }

  const tabs = await chrome.tabs.query({});

  if (tabs.length <= 1) {
    return {
      success: false,
      action: "close_tab",
      message: "Chrome requires at least one tab to remain open.",
    };
  }

  await chrome.tabs.remove(targetTabId);

  return {
    success: true,
    action: "close_tab",
    tabId: targetTabId,
  };
}

/*
 * ============================================================================
 * LIST TABS
 * ============================================================================
 */

async function listTabs() {
  ensureChromeApi();

  const tabs = await chrome.tabs.query({});

  return tabs
    .filter((tab) => Number.isInteger(tab.id))
    .map((tab) => ({
      tabId: tab.id,
      title: tab.title || "",
      url: tab.url || "",
      active: Boolean(tab.active),
      windowId: tab.windowId,
    }));
}

/*
 * ============================================================================
 * SWITCH TAB
 * ============================================================================
 */

async function switchTab({ tabId, query } = {}) {
  ensureChromeApi();

  let targetTab = null;

  if (Number.isInteger(Number(tabId))) {
    const requestedId = Number(tabId);

    const tabs = await chrome.tabs.query({});

    targetTab = tabs.find((tab) => tab.id === requestedId) || null;
  }

  if (!targetTab && String(query || "").trim()) {
    const search = String(query).trim().toLowerCase();

    const tabs = await chrome.tabs.query({});

    targetTab =
      tabs.find((tab) => {
        const title = String(tab.title || "").toLowerCase();
        const url = String(tab.url || "").toLowerCase();

        return title.includes(search) || url.includes(search);
      }) || null;
  }

  if (!targetTab?.id) {
    throw new Error(
      `No Chrome tab matched "${String(query || tabId || "").trim()}".`,
    );
  }

  await chrome.tabs.update(targetTab.id, {
    active: true,
  });

  if (Number.isInteger(targetTab.windowId)) {
    await chrome.windows.update(targetTab.windowId, {
      focused: true,
    });
  }

  return {
    success: true,
    action: "switch_tab",
    tabId: targetTab.id,
    title: targetTab.title || "",
    url: targetTab.url || "",
  };
}

/*
 * ============================================================================
 * BROWSER SEARCH
 * ============================================================================
 */

async function browserSearch({ query, engine = "google" } = {}) {
  ensureChromeApi();

  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) {
    throw new Error("A search query is required.");
  }

  const engines = {
    google: `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`,
    bing: `https://www.bing.com/search?q=${encodeURIComponent(cleanQuery)}`,
    duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`,
  };

  const searchEngine = String(engine || "google").toLowerCase();
  const searchUrl = engines[searchEngine] || engines.google;

  const tab = await chrome.tabs.create({
    url: searchUrl,
    active: true,
  });

  return {
    success: true,
    action: "browser_search",
    engine: searchEngine in engines ? searchEngine : "google",
    query: cleanQuery,
    tabId: tab.id,
    url: searchUrl,
  };
}

/*
 * ============================================================================
 * READ PAGE
 * ============================================================================
 */

async function readPage({ tabId, maxCharacters = 12000 } = {}) {
  ensureChromeApi();

  let targetTabId = Number(tabId);

  if (!Number.isInteger(targetTabId)) {
    const activeTab = await getActiveTab();
    targetTabId = activeTab.id;
  }

  if (!Number.isInteger(targetTabId)) {
    throw new Error("Could not determine which tab to read.");
  }

  const tabs = await chrome.tabs.query({});

  const targetTab = tabs.find((tab) => tab.id === targetTabId);

  if (!targetTab) {
    throw new Error("The requested Chrome tab no longer exists.");
  }

  const pageUrl = String(targetTab.url || "");

  if (
    /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(pageUrl)
  ) {
    throw new Error(
      "Chrome does not allow Friday to read this protected browser page.",
    );
  }

  if (
    typeof chrome.scripting === "undefined" ||
    typeof chrome.scripting.executeScript !== "function"
  ) {
    throw new Error(
      "Chrome scripting permission is unavailable. Add the scripting permission to manifest.json.",
    );
  }

  const results = await chrome.scripting.executeScript({
    target: {
      tabId: targetTabId,
    },
    func: () => {
      const clone = document.body?.cloneNode(true);

      if (!clone) {
        return {
          title: document.title || "",
          url: location.href,
          text: "",
        };
      }

      clone
        .querySelectorAll(
          "script, style, noscript, iframe, svg, canvas, template",
        )
        .forEach((element) => element.remove());

      return {
        title: document.title || "",
        url: location.href,
        text: clone.innerText || clone.textContent || "",
      };
    },
  });

  const page = results?.[0]?.result;

  if (!page) {
    throw new Error("Friday could not extract text from this page.");
  }

  return {
    success: true,
    action: "read_page",
    tabId: targetTabId,
    title: page.title || targetTab.title || "",
    url: page.url || pageUrl,
    text: truncateText(page.text, maxCharacters),
  };
}

/*
 * ============================================================================
 * TAB WAIT / INFO / CLICK
 * ============================================================================
 */

async function getTabByIdOrActive(tabId) {
  ensureChromeApi();
  const requested = Number(tabId);
  if (Number.isInteger(requested)) {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => item.id === requested);
    if (!tab) throw new Error("The requested Chrome tab no longer exists.");
    return tab;
  }
  return getActiveTab();
}

async function getTabInfo({ tabId } = {}) {
  const tab = await getTabByIdOrActive(tabId);
  return {
    success: true,
    action: "get_tab_info",
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || "",
    url: tab.url || "",
    status: tab.status || "unknown",
    active: Boolean(tab.active),
  };
}

async function waitForTab({ tabId, timeoutMs = 10000 } = {}) {
  ensureChromeApi();
  const requested = Number(tabId);
  if (!Number.isInteger(requested))
    throw new Error("A valid tabId is required.");

  const timeout = Math.max(1000, Math.min(Number(timeoutMs) || 10000, 20000));
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => item.id === requested);
    if (!tab) throw new Error("The requested Chrome tab no longer exists.");

    if (tab.status === "complete") {
      return {
        success: true,
        action: "wait_for_tab",
        tabId: tab.id,
        title: tab.title || "",
        url: tab.url || "",
        status: tab.status,
        waitedMs: Date.now() - started,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const tab = await getTabByIdOrActive(requested);
  return {
    success: true,
    action: "wait_for_tab",
    tabId: tab.id,
    title: tab.title || "",
    url: tab.url || "",
    status: tab.status || "loading",
    timedOut: true,
    waitedMs: Date.now() - started,
  };
}

async function clickPageLink({ tabId, text } = {}) {
  ensureChromeApi();
  const targetTabId = Number.isInteger(Number(tabId))
    ? Number(tabId)
    : (await getActiveTab()).id;
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Link or button text is required.");

  const pageUrl = String((await getTabByIdOrActive(targetTabId)).url || "");
  if (
    /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(pageUrl)
  ) {
    throw new Error(
      "Chrome does not allow Friday to interact with this protected page.",
    );
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    args: [cleanText],
    func: (needle) => {
      const normalize = (value) =>
        String(value || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      const wanted = normalize(needle);
      const candidates = Array.from(
        document.querySelectorAll(
          'a,button,[role="button"],input[type="submit"],input[type="button"]',
        ),
      );
      const match = candidates.find((element) => {
        const label = normalize(
          element.innerText ||
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.value,
        );
        return label === wanted || label.includes(wanted);
      });

      if (!match)
        return {
          success: false,
          error: `No visible link or button matched "${needle}".`,
        };

      match.scrollIntoView({ block: "center", behavior: "instant" });
      match.click();
      return {
        success: true,
        text: match.innerText || match.textContent || needle,
      };
    },
  });

  const result = results?.[0]?.result;
  if (!result?.success)
    throw new Error(result?.error || "Could not click the requested link.");

  await new Promise((resolve) => setTimeout(resolve, 500));
  const tab = await getTabByIdOrActive(targetTabId);

  return {
    success: true,
    action: "click_page_link",
    tabId: targetTabId,
    clickedText: result.text,
    title: tab.title || "",
    url: tab.url || "",
  };
}

/*
 * ============================================================================
 * CALCULATOR
 * ============================================================================
 */
/*
 * ============================================================================
 * LOGIN FORM FILL
 * ============================================================================
 */

/*
 * ============================================================================
 * LOGIN FORM FILL
 * ============================================================================
 */

async function fillLoginForm({ tabId, site, submit = false } = {}) {
  ensureChromeApi();

  const targetTabId = Number.isInteger(Number(tabId)) ? Number(tabId) : (await getActiveTab()).id;
  const tab = await getTabByIdOrActive(targetTabId);
  const pageUrl = String(tab.url || "");

  if (/^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(pageUrl)) {
    throw new Error("Chrome does not allow Friday to interact with this protected page.");
  }

  let hostname = "";
  try {
    hostname = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {}

  if (site) {
    const requestedSite = normalizeSiteKey(site);
    if (requestedSite && hostname && !hostname.includes(requestedSite) && !requestedSite.includes(hostname)) {
      throw new Error(
        `The current tab is on "${hostname}", not "${requestedSite}". Use open_tab or switch_tab to go to ${requestedSite} first, then retry fill_login_form.`,
      );
    }
  }

  const lookupSite = String(site || hostname || "").trim();
  if (!lookupSite) {
    throw new Error("Could not determine which site to look up saved credentials for.");
  }

  const record = await FridayMemory.getRecord(lookupSite);
  const username = record?.username || record?.email || "";
  const password = record?.password || "";

  if (!password) {
    return {
      success: false,
      action: "fill_login_form",
      site: lookupSite,
      missingCredentials: true,
      message: `No saved password for "${lookupSite}". Ask the user for their login email/username and password, save it with save_memory, then call fill_login_form again.`,
    };
  }

  const attempt = async () => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      args: [{ username, password, submit: Boolean(submit) }],
      func: ({ username, password, submit }) => {
        function setNativeValue(el, value) {
          const proto =
            el instanceof HTMLTextAreaElement
              ? window.HTMLTextAreaElement.prototype
              : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) setter.call(el, value);
          else el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const isVisible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;

        const passwordField = Array.from(document.querySelectorAll('input[type="password"]')).find(isVisible);

        const usernameSelectors = [
          'input[type="email"]',
          'input[autocomplete="username"]',
          'input[autocomplete="email"]',
          'input[name*="email" i]',
          'input[name*="user" i]',
          'input[id*="email" i]',
          'input[id*="user" i]',
          'input[placeholder*="email" i]',
          'input[placeholder*="username" i]',
          'input[type="text"]',
        ];

        function findUsernameField(scope) {
          for (const selector of usernameSelectors) {
            const field = Array.from(scope.querySelectorAll(selector)).find(
              (el) => el.type !== "password" && isVisible(el),
            );
            if (field) return field;
          }
          return null;
        }

        // ---- Case 1: password field is already on the page (single-step form) ----
        if (passwordField) {
          const scope = passwordField.closest("form") || document;
          const usernameField = findUsernameField(scope);

          if (usernameField && username) setNativeValue(usernameField, username);
          setNativeValue(passwordField, password);

          let submitted = false;
          if (submit) {
            const form = passwordField.closest("form");
            if (form && typeof form.requestSubmit === "function") {
              form.requestSubmit();
              submitted = true;
            } else if (form) {
              form.submit();
              submitted = true;
            } else {
              const submitControl = document.querySelector('button[type="submit"], input[type="submit"]');
              if (submitControl) {
                submitControl.click();
                submitted = true;
              }
            }
          }

          return {
            stage: "password_filled",
            usernameFilled: Boolean(usernameField && username),
            passwordFilled: true,
            submitted,
          };
        }

        // ---- Case 2: no password field yet - likely a progressive (email-first) flow ----
        const usernameField = findUsernameField(document);
        if (!usernameField) {
          return { stage: "no_fields", error: "No visible email/username or password field was found on this page." };
        }

        setNativeValue(usernameField, username);

        const buttonWords = ["continue", "next", "sign in", "log in", "login"];
        const clickable = Array.from(document.querySelectorAll('button,[role="button"],input[type="submit"]'));
        const advanceButton = clickable.find((el) => {
          const label = (el.innerText || el.textContent || el.value || "").trim().toLowerCase();
          return label && buttonWords.some((word) => label.includes(word)) && isVisible(el);
        });

        if (advanceButton) advanceButton.click();

        return { stage: "advanced_step", usernameFilled: true, clickedAdvance: Boolean(advanceButton) };
      },
    });

    return results?.[0]?.result;
  };

  let result = await attempt();

  // Give a progressive form time to render its password step, then try again once.
  if (result?.stage === "advanced_step") {
    await new Promise((resolve) => setTimeout(resolve, 900));
    result = await attempt();
  }

  if (!result || result.stage === "no_fields") {
    throw new Error(result?.error || "Could not find a login form on this page.");
  }

  if (result.stage === "advanced_step") {
    return {
      success: false,
      action: "fill_login_form",
      tabId: targetTabId,
      site: lookupSite,
      advancedToNextStep: true,
      message:
        "This site uses a multi-step login (email first, then password). Filled the email and advanced to the next step, but the password field still hasn't appeared. Call wait_for_tab briefly, then call fill_login_form again.",
    };
  }

  return {
    success: true,
    action: "fill_login_form",
    tabId: targetTabId,
    site: lookupSite,
    usernameFilled: result.usernameFilled,
    passwordFilled: result.passwordFilled,
    submitted: result.submitted,
    message: result.submitted
      ? "Filled and submitted the login form using saved credentials."
      : "Filled the login form using saved credentials. Call fill_login_form again with submit: true, or click_page_link, to log in.",
  };
}

/*
 * ============================================================================
 * GENERIC INPUT FILL
 * ============================================================================
 */

async function fillInput({ tabId, fieldLabel, value } = {}) {
  ensureChromeApi();

  const targetTabId = Number.isInteger(Number(tabId))
    ? Number(tabId)
    : (await getActiveTab()).id;
  const cleanLabel = String(fieldLabel || "").trim();
  if (!cleanLabel)
    throw new Error(
      "A fieldLabel is required to identify which field to fill.",
    );
  if (value === undefined || value === null)
    throw new Error("A value is required.");

  const pageUrl = String((await getTabByIdOrActive(targetTabId)).url || "");
  if (
    /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(pageUrl)
  ) {
    throw new Error(
      "Chrome does not allow Friday to interact with this protected page.",
    );
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    args: [cleanLabel, String(value)],
    func: (needle, fillValue) => {
      const normalize = (v) =>
        String(v || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      const wanted = normalize(needle);

      function labelFor(input) {
        if (input.labels && input.labels.length)
          return input.labels[0].innerText || input.labels[0].textContent;
        if (input.getAttribute("aria-label"))
          return input.getAttribute("aria-label");
        if (input.placeholder) return input.placeholder;
        if (input.id) {
          const byFor = document.querySelector(`label[for="${input.id}"]`);
          if (byFor) return byFor.innerText || byFor.textContent;
        }
        return input.name || "";
      }

      const candidates = Array.from(
        document.querySelectorAll("input,textarea"),
      ).filter((el) => {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        return ![
          "password",
          "hidden",
          "checkbox",
          "radio",
          "submit",
          "button",
          "file",
          "image",
          "reset",
        ].includes(type);
      });

      const match = candidates.find((el) =>
        normalize(labelFor(el)).includes(wanted),
      );
      if (!match)
        return {
          success: false,
          error: `No matching input field found for "${needle}".`,
        };

      match.focus();
      const proto =
        match instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(match, fillValue);
      else match.value = fillValue;
      match.dispatchEvent(new Event("input", { bubbles: true }));
      match.dispatchEvent(new Event("change", { bubbles: true }));

      return { success: true, label: labelFor(match) || needle };
    },
  });

  const result = results?.[0]?.result;
  if (!result?.success)
    throw new Error(result?.error || "Could not fill the requested field.");

  return {
    success: true,
    action: "fill_input",
    tabId: targetTabId,
    fieldLabel: cleanLabel,
    filledLabel: result.label,
  };
}

/*
 * ============================================================================
 * MEMORY (credentials & reusable facts)
 * ============================================================================
 */

async function saveMemory({ site, field, value } = {}) {
  const cleanSite = String(site || "").trim();
  const cleanField = String(field || "")
    .trim()
    .toLowerCase();
  if (!cleanSite) throw new Error("A site is required.");
  if (!cleanField) throw new Error("A field name is required.");
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error("A value is required.");
  }

  await FridayMemory.saveField(cleanSite, cleanField, String(value));

  return {
    success: true,
    action: "save_memory",
    site: cleanSite,
    field: cleanField,
    message: `Saved ${cleanField} for ${cleanSite}.`,
  };
}

async function getMemory({ site } = {}) {
  const cleanSite = String(site || "").trim();
  if (!cleanSite) throw new Error("A site is required.");

  const record = await FridayMemory.getRecord(cleanSite);
  if (!record)
    return {
      success: true,
      action: "get_memory",
      site: cleanSite,
      found: false,
    };

  const fields = Object.keys(record).filter((key) => key !== "updatedAt");
  return {
    success: true,
    action: "get_memory",
    site: cleanSite,
    found: fields.length > 0,
    fields,
  };
}

async function forgetMemory({ site } = {}) {
  const cleanSite = String(site || "").trim();
  if (!cleanSite) throw new Error("A site is required.");

  const removed = await FridayMemory.deleteRecord(cleanSite);

  return {
    success: true,
    action: "forget_memory",
    site: cleanSite,
    removed,
    message: removed
      ? `Forgot saved information for ${cleanSite}.`
      : `Nothing was saved for ${cleanSite}.`,
  };
}

async function listSavedSites() {
  const sites = await FridayMemory.listSites();
  return { success: true, action: "list_saved_sites", sites };
}

function calculate({ expression } = {}) {
  const rawExpression = String(expression || "").trim();

  if (!rawExpression) {
    throw new Error("A mathematical expression is required.");
  }

  /*
   * Only permit arithmetic characters.
   * This prevents arbitrary JavaScript from reaching Function().
   */
  if (!/^[0-9+\-*/().%\s]+$/.test(rawExpression)) {
    throw new Error(
      "Calculator accepts only numbers and arithmetic operators.",
    );
  }

  /*
   * Convert:
   *
   * 50%   -> (50/100)
   * 17.5% -> (17.5/100)
   */
  const expressionWithPercentages = rawExpression.replace(
    /(\d+(?:\.\d+)?)%/g,
    "($1/100)",
  );

  let value;

  try {
    // eslint-disable-next-line no-new-func
    value = Function(`"use strict"; return (${expressionWithPercentages});`)();
  } catch {
    throw new Error("Invalid mathematical expression.");
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("The calculation did not produce a valid number.");
  }

  return {
    success: true,
    action: "calculator",
    expression: rawExpression,
    result: value,
  };
}

/*
 * ============================================================================
 * GEOCODING
 * ============================================================================
 */

async function geocodeLocation(location) {
  const cleanLocation = String(location || "").trim();

  if (!cleanLocation) {
    return {
      name: "Current location",
      latitude: null,
      longitude: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  const url =
    `${OPEN_METEO_GEOCODING}?name=` +
    encodeURIComponent(cleanLocation) +
    "&count=1&language=en&format=json";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Location lookup failed with HTTP ${response.status}.`);
  }

  const data = await response.json();

  const result = data?.results?.[0];

  if (!result) {
    throw new Error(`Could not find the location "${cleanLocation}".`);
  }

  return {
    name: [result.name, result.admin1, result.country]
      .filter(Boolean)
      .join(", "),
    latitude: result.latitude,
    longitude: result.longitude,
    timezone:
      result.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/*
 * ============================================================================
 * TIME
 * ============================================================================
 */

async function getTime({ location } = {}) {
  const geo = await geocodeLocation(location);

  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: geo.timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return {
    success: true,
    action: "get_time",
    location: geo.name,
    timezone: geo.timezone,
    time: formatter.format(now),
  };
}

/*
 * ============================================================================
 * DATE
 * ============================================================================
 */

async function getDate({ location } = {}) {
  const geo = await geocodeLocation(location);

  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: geo.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return {
    success: true,
    action: "get_date",
    location: geo.name,
    timezone: geo.timezone,
    date: formatter.format(now),
  };
}

/*
 * ============================================================================
 * WEATHER
 * ============================================================================
 */

function weatherDescription(code) {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };

  return descriptions[Number(code)] || "Unknown conditions";
}

async function getWeather({ location } = {}) {
  const cleanLocation = String(location || "").trim();

  if (!cleanLocation) {
    throw new Error("A weather location is required.");
  }

  const geo = await geocodeLocation(cleanLocation);

  if (
    !Number.isFinite(Number(geo.latitude)) ||
    !Number.isFinite(Number(geo.longitude))
  ) {
    throw new Error("The location does not have valid coordinates.");
  }

  const url = new URL(OPEN_METEO_FORECAST);

  url.searchParams.set("latitude", String(geo.latitude));
  url.searchParams.set("longitude", String(geo.longitude));

  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
    ].join(","),
  );

  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
    ].join(","),
  );

  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather service failed with HTTP ${response.status}.`);
  }

  const data = await response.json();

  const current = data?.current;
  const daily = data?.daily;

  if (!current) {
    throw new Error("Weather service returned no current conditions.");
  }

  return {
    success: true,
    action: "get_weather",
    location: geo.name,
    timezone: data.timezone || geo.timezone,

    current: {
      temperatureC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidityPercent: current.relative_humidity_2m,
      precipitationMm: current.precipitation,
      windSpeedKmh: current.wind_speed_10m,
      condition: weatherDescription(current.weather_code),
    },

    today: {
      minimumC: daily?.temperature_2m_min?.[0] ?? null,
      maximumC: daily?.temperature_2m_max?.[0] ?? null,
      precipitationProbabilityPercent:
        daily?.precipitation_probability_max?.[0] ?? null,
      condition: weatherDescription(daily?.weather_code?.[0]),
    },
  };
}

/*
 * ============================================================================
 * WAIT FOR TEXT (Dynamic Content)
 * ============================================================================
 */

async function waitForText({ tabId, text, timeoutMs = 10000 } = {}) {
  ensureChromeApi();
  const targetTabId = Number.isInteger(Number(tabId))
    ? Number(tabId)
    : (await getActiveTab()).id;
  const cleanText = String(text || "").trim().toLowerCase();
  
  if (!cleanText) {
    throw new Error("Text to wait for is required.");
  }

  const timeout = Math.max(1000, Math.min(Number(timeoutMs) || 10000, 20000));
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => document.body?.innerText?.toLowerCase() || "",
    });
    
    const pageText = results?.[0]?.result || "";
    
    if (pageText.includes(cleanText)) {
      const tab = await getTabByIdOrActive(targetTabId);
      return {
        success: true,
        action: "wait_for_text",
        tabId: targetTabId,
        title: tab.title || "",
        url: tab.url || "",
        found: true,
        waitedMs: Date.now() - started,
      };
    }
    
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const tab = await getTabByIdOrActive(targetTabId);
  return {
    success: false,
    action: "wait_for_text",
    tabId: targetTabId,
    title: tab.title || "",
    url: tab.url || "",
    found: false,
    timedOut: true,
    waitedMs: Date.now() - started,
  };
}

/*
 * ============================================================================
 * OPEN WEBSITE
 * ============================================================================
 */

async function openWebsite({ url } = {}) {
  return openTab({
    url,
    active: true,
  });
}

/*
 * ============================================================================
 * TOOL REGISTRY
 * ============================================================================
 */

const TAB_SCOPED_TOOLS = new Set([
  "close_tab",
  "switch_tab",
  "read_page",
  "wait_for_tab",
  "wait_for_text",
  "get_tab_info",
  "click_page_link",
  "fill_login_form",
  "fill_input",
]);

const TOOL_IMPLEMENTATIONS = Object.freeze({
  open_tab: openTab,
  close_tab: closeTab,
  switch_tab: switchTab,
  list_tabs: listTabs,
  browser_search: browserSearch,
  read_page: readPage,
  wait_for_tab: waitForTab,
  wait_for_text: waitForText,
  get_tab_info: getTabInfo,
  click_page_link: clickPageLink,
  fill_login_form: fillLoginForm,
  fill_input: fillInput,
  save_memory: saveMemory,
  get_memory: getMemory,
  forget_memory: forgetMemory,
  list_saved_sites: listSavedSites,
  calculator: calculate,
  get_time: getTime,
  get_date: getDate,
  get_weather: getWeather,
  open_website: openWebsite,
});

/*
 * ============================================================================
 * FRIDAY TOOL MANAGER
 * ============================================================================
 */

export class FridayToolManager {
  constructor({ onToolStart, onToolEnd } = {}) {
    this.onToolStart = onToolStart;
    this.onToolEnd = onToolEnd;
    this.lastTabId = null;
  }

  has(name) {
    return typeof TOOL_IMPLEMENTATIONS[name] === "function";
  }

  async execute(name, args = {}) {
    const toolName = String(name || "").trim();
    const tool = TOOL_IMPLEMENTATIONS[toolName];

    if (!tool) {
      throw new Error(`Friday does not have a tool named "${toolName}".`);
    }

    // If the model didn't specify a tab, default to the last tab Friday
    // actually worked with - not chrome.tabs' "active tab", which may be
    // Friday's own New Tab page if the user just typed in chat.
    const callArgs =
      TAB_SCOPED_TOOLS.has(toolName) &&
      !Number.isInteger(Number(args?.tabId)) &&
      Number.isInteger(this.lastTabId)
        ? { ...args, tabId: this.lastTabId }
        : args;

    await this.onToolStart?.(toolName, callArgs);

    const startedAt = performance.now();

    try {
      const result = await tool(callArgs);

      if (toolName === "close_tab") {
        if (result?.success && result.tabId === this.lastTabId) {
          this.lastTabId = null;
        }
      } else if (Number.isInteger(result?.tabId)) {
        this.lastTabId = result.tabId;
      }

      await this.onToolEnd?.(
        toolName,
        result,
        Math.round(performance.now() - startedAt),
      );

      return result;
    } catch (error) {
      const message = error?.message || String(error) || "Unknown tool error.";

      await this.onToolEnd?.(
        toolName,
        { success: false, error: message },
        Math.round(performance.now() - startedAt),
      );

      throw error;
    }
  }
}
