// friday-memory.js
//
// Persistent key/value memory for Friday, primarily used to remember
// login credentials and similar reusable details per site so the
// user is never asked to repeat them. Backed by chrome.storage.local
// (falling back to localStorage in a preview/dev context, matching
// the pattern already used in newtab.js) so the text agent
// (gemini-service.js) and the voice agent (gemini-voice.js) always
// read and write the same up-to-date data without sharing any
// in-memory cache between them.

const MEMORY_STORAGE_KEY = "fridayMemoryV1";

function getChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local
    ? chrome.storage.local
    : null;
}

async function loadMemory() {
  const chromeStorage = getChromeStorage();

  if (chromeStorage) {
    const result = await chromeStorage.get(MEMORY_STORAGE_KEY);
    return result[MEMORY_STORAGE_KEY] &&
      typeof result[MEMORY_STORAGE_KEY] === "object"
      ? result[MEMORY_STORAGE_KEY]
      : {};
  }

  try {
    const saved = localStorage.getItem(MEMORY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

async function persistMemory(data) {
  const chromeStorage = getChromeStorage();

  if (chromeStorage) {
    await chromeStorage.set({ [MEMORY_STORAGE_KEY]: data });
    return;
  }

  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Friday memory save skipped.", error);
  }
}

/*
 * Normalize a site value down to a bare hostname so the same site
 * always resolves to the same memory record, whether it was typed
 * as a full URL, prefixed with www, or given a trailing path.
 *
 * Deliberately does NOT collapse to a root domain - on shared hosts
 * like vercel.app/netlify.app/github.io that would let credentials
 * for one app match a completely unrelated app on the same host.
 */
export function normalizeSiteKey(site) {
  let clean = String(site || "")
    .trim()
    .toLowerCase();
  if (!clean) return "";

  clean = clean.replace(/^[a-z]+:\/\//, "");
  clean = clean.split(/[/?#]/)[0];
  clean = clean.replace(/^www\./, "");

  return clean;
}

export const FridayMemory = {
  async saveField(site, field, value) {
    const key = normalizeSiteKey(site);
    if (!key) throw new Error("A valid site is required to save memory.");

    const data = await loadMemory();
    data[key] = { ...(data[key] || {}), [field]: value, updatedAt: Date.now() };
    await persistMemory(data);

    return data[key];
  },

  async getRecord(site) {
    const key = normalizeSiteKey(site);
    if (!key) return null;

    const data = await loadMemory();
    return data[key] || null;
  },

  async deleteRecord(site) {
    const key = normalizeSiteKey(site);
    if (!key) return false;

    const data = await loadMemory();
    if (!data[key]) return false;

    delete data[key];
    await persistMemory(data);
    return true;
  },

  async listSites() {
    const data = await loadMemory();
    return Object.keys(data);
  },

  async listRecords() {
    const data = await loadMemory();
    return Object.entries(data).map(([site, record]) => ({
      site,
      fields: Object.keys(record).filter((key) => key !== "updatedAt"),
      updatedAt: record.updatedAt || null,
    }));
  },

  async clearAll() {
    await persistMemory({});
  },
};
