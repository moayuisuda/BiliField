const INJECT_SRC = chrome.runtime.getURL("content/inject.js");

let CONFIG_STORAGE_KEY;
let SETTINGS_STORAGE_KEY;
let DEFAULT_CONFIG;
let DEFAULT_SETTINGS;

async function loadConstants() {
  const url = chrome.runtime.getURL("content/constants.js");
  const mod = await import(url);
  const constants = mod.default || mod;
  CONFIG_STORAGE_KEY = constants.CONFIG_STORAGE_KEY;
  SETTINGS_STORAGE_KEY = constants.SETTINGS_STORAGE_KEY;
  DEFAULT_CONFIG = constants.DEFAULT_CONFIG;
  DEFAULT_SETTINGS = constants.DEFAULT_SETTINGS;
}

function normalizeKeywords(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[,，\n]/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

function mergeKeywords(existing, next) {
  const set = new Set(existing);
  const merged = existing.slice();
  for (const kw of next) {
    if (!set.has(kw)) {
      merged.push(kw);
      set.add(kw);
    }
  }
  return merged;
}

function normalizeConfig(raw) {
  const config = raw && typeof raw === "object" ? raw : {};
  return {
    feedKeywords: normalizeKeywords(config.feedKeywords),
    replyKeywords: normalizeKeywords(config.replyKeywords),
  };
}

function normalizeSettings(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const importUrl =
    typeof obj.importUrl === "string" && obj.importUrl.trim()
      ? obj.importUrl.trim()
      : DEFAULT_SETTINGS.importUrl;
  const autoUpdate =
    typeof obj.autoUpdate === "boolean"
      ? obj.autoUpdate
      : DEFAULT_SETTINGS.autoUpdate;
  const lastUpdateAt =
    typeof obj.lastUpdateAt === "string" ? obj.lastUpdateAt : "";
  const lastUpdateDay =
    typeof obj.lastUpdateDay === "string" ? obj.lastUpdateDay : "";
  return { importUrl, autoUpdate, lastUpdateAt, lastUpdateDay };
}

function dayStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function timestampStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}`;
}

function encodeConfig(config) {
  try {
    return encodeURIComponent(JSON.stringify(config));
  } catch (error) {
    console.warn("[Bili Field] 配置序列化失败：", error);
    return encodeURIComponent(JSON.stringify(DEFAULT_CONFIG));
  }
}

function injectScriptElement(config) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = INJECT_SRC;
    script.dataset.config = encodeConfig(config);
    script.async = false;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = (event) => {
      script.remove();
      reject(event?.error || new Error("注入脚本加载失败"));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

function notifyUpdate(config) {
  window.dispatchEvent(
    new CustomEvent("biliFieldUpdateConfig", { detail: config })
  );
}

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CONFIG_STORAGE_KEY, (items) => {
      resolve(normalizeConfig(items[CONFIG_STORAGE_KEY] || DEFAULT_CONFIG));
    });
  });
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_STORAGE_KEY, (items) => {
      resolve(
        normalizeSettings(items[SETTINGS_STORAGE_KEY] || DEFAULT_SETTINGS)
      );
    });
  });
}

function subscribeConfigUpdates() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const change = changes[CONFIG_STORAGE_KEY];
    if (!change) return;
    notifyUpdate(normalizeConfig(change.newValue || DEFAULT_CONFIG));
  });
}

async function autoUpdateIfNeeded() {
  try {
    const settings = await loadSettings();
    if (!settings.autoUpdate) return;
    const today = dayStr();
    if (settings.lastUpdateDay === today) return;
    const res = await fetch(settings.importUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const payload = await res.json();
    const newFeed =
      payload && payload.feed ? normalizeKeywords(String(payload.feed)) : [];
    const newReply =
      payload && payload.reply ? normalizeKeywords(String(payload.reply)) : [];
    const current = await loadConfig();
    const feedKeywords = mergeKeywords(current.feedKeywords, newFeed);
    const replyKeywords = mergeKeywords(current.replyKeywords, newReply);
    await new Promise((resolve) => {
      chrome.storage.sync.set(
        {
          [CONFIG_STORAGE_KEY]: { feedKeywords, replyKeywords },
          [SETTINGS_STORAGE_KEY]: {
            importUrl: settings.importUrl,
            autoUpdate: settings.autoUpdate,
            lastUpdateAt: timestampStr(),
            lastUpdateDay: today,
          },
        },
        () => resolve()
      );
    });
  } catch (error) {
    console.warn("[Bili Field] 自动更新失败：", error);
  }
}

async function init() {
  await loadConstants();
  const config = await loadConfig();
  try {
    await injectScriptElement(config);
  } catch (error) {
    console.error("[Bili Field] 注入失败：", error);
  }
  subscribeConfigUpdates();
  autoUpdateIfNeeded();
}

init();
