const CONFIG_STORAGE_KEY = 'biliFieldRules';
const DEFAULT_CONFIG = {
  feedKeywords: [],
  replyKeywords: []
};
const INJECT_SRC = chrome.runtime.getURL('content/inject.js');

function normalizeKeywords(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[,，\n]/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeConfig(raw) {
  const config = raw && typeof raw === 'object' ? raw : {};
  return {
    feedKeywords: normalizeKeywords(config.feedKeywords),
    replyKeywords: normalizeKeywords(config.replyKeywords)
  };
}

function encodeConfig(config) {
  try {
    return encodeURIComponent(JSON.stringify(config));
  } catch (error) {
    console.warn('[Bili Field] 配置序列化失败：', error);
    return encodeURIComponent(JSON.stringify(DEFAULT_CONFIG));
  }
}

function injectScriptElement(config) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = INJECT_SRC;
    script.dataset.config = encodeConfig(config);
    script.async = false;
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = (event) => {
      script.remove();
      reject(event?.error || new Error('注入脚本加载失败'));
    };
    (document.head || document.documentElement).appendChild(script);
  });
}

function notifyUpdate(config) {
  window.dispatchEvent(
    new CustomEvent('biliFieldUpdateConfig', { detail: config })
  );
}

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(CONFIG_STORAGE_KEY, (items) => {
      resolve(normalizeConfig(items[CONFIG_STORAGE_KEY] || DEFAULT_CONFIG));
    });
  });
}

function subscribeConfigUpdates() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const change = changes[CONFIG_STORAGE_KEY];
    if (!change) return;
    notifyUpdate(normalizeConfig(change.newValue || DEFAULT_CONFIG));
  });
}

async function init() {
  const config = await loadConfig();
  try {
    await injectScriptElement(config);
    // 双重保障：注入完成后再广播一次，避免脚本初始化时 dataset 丢失。
    notifyUpdate(config);
  } catch (error) {
    console.error('[Bili Field] 注入失败：', error);
  }
  subscribeConfigUpdates();
}

init();

