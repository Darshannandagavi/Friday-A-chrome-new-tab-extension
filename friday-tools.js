// friday-tools.js

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
 * CALCULATOR
 * ============================================================================
 */

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

const TOOL_IMPLEMENTATIONS = Object.freeze({
  open_tab: openTab,
  close_tab: closeTab,
  switch_tab: switchTab,
  list_tabs: listTabs,
  browser_search: browserSearch,
  read_page: readPage,
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

    await this.onToolStart?.(toolName, args);

    const startedAt = performance.now();

    try {
      const result = await tool(args);

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
        {
          success: false,
          error: message,
        },
        Math.round(performance.now() - startedAt),
      );

      throw error;
    }
  }
}
