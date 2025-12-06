import { FormEvent, useEffect, useRef, useState } from "react";
import constants from "../../extension/content/constants";

type Settings = {
  importUrl: string;
  autoUpdate: boolean;
  lastUpdateAt: string;
  lastUpdateDay: string;
};

const CONFIG_STORAGE_KEY = constants.CONFIG_STORAGE_KEY;
const SETTINGS_STORAGE_KEY = constants.SETTINGS_STORAGE_KEY;
const DEFAULT_CONFIG = constants.DEFAULT_CONFIG as {
  feedKeywords: string[];
  replyKeywords: string[];
};
const DEFAULT_SETTINGS = constants.DEFAULT_SETTINGS as Settings;
const DEFAULT_IMPORT_URL = constants.DEFAULT_IMPORT_URL as string;

import "./styles.css";

function parseInput(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeKeywords(existing: string[], newKeywords: string[]): string[] {
  const existingSet = new Set(existing.map((keyword) => keyword.toLowerCase()));
  const merged = [...existing];
  newKeywords.forEach((keyword) => {
    if (!existingSet.has(keyword.toLowerCase())) {
      merged.push(keyword);
      existingSet.add(keyword.toLowerCase());
    }
  });
  return merged;
}

function safeGetConfig(
  items: Record<string, { feedKeywords: string[]; replyKeywords: string[] }>
) {
  const raw = items[CONFIG_STORAGE_KEY];
  if (!raw || typeof raw !== "object") {
    return DEFAULT_CONFIG;
  }
  return {
    feedKeywords: Array.isArray(raw.feedKeywords)
      ? raw.feedKeywords.map((item) => String(item))
      : DEFAULT_CONFIG.feedKeywords,
    replyKeywords: Array.isArray(raw.replyKeywords)
      ? raw.replyKeywords.map((item) => String(item))
      : DEFAULT_CONFIG.replyKeywords,
  };
}

function safeGetSettings(items: Record<string, unknown>) {
  const raw = items[SETTINGS_STORAGE_KEY];
  if (!raw || typeof raw !== "object") {
    return DEFAULT_SETTINGS;
  }
  const obj = raw as Settings;
  return {
    importUrl:
      typeof obj.importUrl === "string" && obj.importUrl.trim()
        ? obj.importUrl.trim()
        : DEFAULT_SETTINGS.importUrl,
    autoUpdate:
      typeof obj.autoUpdate === "boolean"
        ? obj.autoUpdate
        : DEFAULT_SETTINGS.autoUpdate,
    lastUpdateAt: typeof obj.lastUpdateAt === "string" ? obj.lastUpdateAt : "",
    lastUpdateDay:
      typeof obj.lastUpdateDay === "string" ? obj.lastUpdateDay : "",
  };
}

const App = () => {
  const [feedValue, setFeedValue] = useState("");
  const [replyValue, setReplyValue] = useState("");

  const [importUrl, setImportUrl] = useState(DEFAULT_IMPORT_URL);
  const [autoUpdate, setAutoUpdate] = useState<boolean>(
    DEFAULT_SETTINGS.autoUpdate
  );
  const [lastUpdateAt, setLastUpdateAt] = useState<string>(
    DEFAULT_SETTINGS.lastUpdateAt
  );

  const [statusText, setStatusText] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const statusTimer = useRef<number>(null);

  const updateStatus = (
    text: string,
    isError = false,
    autoClearMs?: number
  ) => {
    setStatusText(text);
    setStatusIsError(isError);
    if (statusTimer.current) {
      window.clearTimeout(statusTimer.current);
      statusTimer.current = null;
    }
    if (autoClearMs) {
      statusTimer.current = window.setTimeout(() => {
        setStatusText("");
        setStatusIsError(false);
        statusTimer.current = null;
      }, autoClearMs);
    }
  };

  const applyConfigToUI = (config: {
    feedKeywords: string[];
    replyKeywords: string[];
  }) => {
    setFeedValue((config.feedKeywords || []).join(", "));
    setReplyValue((config.replyKeywords || []).join(", "));
  };

  const applySettingsToUI = (settings: Settings) => {
    setImportUrl(settings.importUrl || DEFAULT_SETTINGS.importUrl);
    setAutoUpdate(Boolean(settings.autoUpdate));
    setLastUpdateAt(settings.lastUpdateAt || "");
  };

  const writeSettings = (partial: Partial<Settings>) => {
    const storage = window.chrome?.storage?.sync;
    if (!storage) return;
    const next = {
      importUrl: (partial.importUrl ?? importUrl).trim(),
      autoUpdate: partial.autoUpdate ?? autoUpdate,
      lastUpdateAt: partial.lastUpdateAt ?? lastUpdateAt,
      lastUpdateDay: partial.lastUpdateDay ?? "",
    };
    storage.set({ [SETTINGS_STORAGE_KEY]: next });
  };

  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState("");

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const response = await fetch(
          "https://my-json-server.typicode.com/ahhcr68-ux/thin-json-db/presets/version"
        );
        if (!response.ok) return;
        const data = (await response.json()) as { latest: string };
        if (data && data.latest) {
          const current = __APP_VERSION__;
          const latest = data.latest;
          
          const compareVersions = (v1: string, v2: string) => {
            const parts1 = v1.split('.').map(Number);
            const parts2 = v2.split('.').map(Number);
            const len = Math.max(parts1.length, parts2.length);
            for (let i = 0; i < len; i++) {
              const num1 = parts1[i] || 0;
              const num2 = parts2[i] || 0;
              if (num1 > num2) return 1;
              if (num1 < num2) return -1;
            }
            return 0;
          };

          if (compareVersions(latest, current) > 0) {
            setHasNewVersion(true);
            setRemoteVersion(latest);
          }
        }
      } catch (e) {
        console.error("Failed to check version", e);
      }
    };
    checkVersion();
  }, []);

  useEffect(() => {
    const storage = window.chrome?.storage?.sync;
    if (!storage) {
      setFeedValue(DEFAULT_CONFIG.feedKeywords.join(", "));
      setReplyValue(DEFAULT_CONFIG.replyKeywords.join(", "));
      setImportUrl(DEFAULT_SETTINGS.importUrl);
      setAutoUpdate(DEFAULT_SETTINGS.autoUpdate);
      return;
    }
    storage.get([CONFIG_STORAGE_KEY, SETTINGS_STORAGE_KEY], (items) => {
      const config = safeGetConfig(items as any);
      const settings = safeGetSettings(items as any);
      applyConfigToUI(config);
      applySettingsToUI(settings);
    });
  }, []);

  useEffect(() => {
    const storage = window.chrome?.storage;
    if (!storage?.onChanged) return;
    const handler = (
      changes: Record<string, { newValue?: unknown }>,
      area: string
    ) => {
      if (area !== "sync") return;
      const rulesChange = changes[CONFIG_STORAGE_KEY];
      const settingsChange = changes[SETTINGS_STORAGE_KEY];
      if (
        rulesChange &&
        rulesChange.newValue &&
        typeof rulesChange.newValue === "object"
      ) {
        const cfg = safeGetConfig({
          [CONFIG_STORAGE_KEY]: rulesChange.newValue,
        } as any);
        applyConfigToUI(cfg);
      }
      if (
        settingsChange &&
        settingsChange.newValue &&
        typeof settingsChange.newValue === "object"
      ) {
        const s = safeGetSettings({
          [SETTINGS_STORAGE_KEY]: settingsChange.newValue,
        } as any);
        applySettingsToUI(s);
      }
    };
    storage.onChanged.addListener(handler);
    return () => {
      try {
        storage.onChanged.removeListener(handler);
      } catch {}
    };
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimer.current) {
        window.clearTimeout(statusTimer.current);
      }
    };
  }, []);

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      feedKeywords: parseInput(feedValue),
      replyKeywords: parseInput(replyValue),
    };
    const storage = window.chrome?.storage?.sync;
    if (!storage) {
      updateStatus("浏览器 storage 不可用，无法保存", true);
      return;
    }
    storage.set(
      {
        [CONFIG_STORAGE_KEY]: payload,
      },
      () => {
        const lastError = window.chrome?.runtime?.lastError;
        if (lastError) {
          updateStatus(`保存失败：${lastError.message}`, true);
        } else {
          updateStatus("已保存 ✔，新请求生效", false, 2000);
        }
      }
    );
  };

  const handleImport = async () => {
    const targetUrl = importUrl.trim();
    setIsImporting(true);
    updateStatus("正在获取...");
    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      if (!payload || typeof payload !== "object") {
        throw new Error("接口返回格式不正确");
      }
      const currentFeed = parseInput(feedValue);
      const currentReply = parseInput(replyValue);
      const newFeedKeywords = payload.feed
        ? parseInput(String(payload.feed))
        : [];
      const newReplyKeywords = payload.reply
        ? parseInput(String(payload.reply))
        : [];
      const mergedFeed = mergeKeywords(currentFeed, newFeedKeywords);
      const mergedReply = mergeKeywords(currentReply, newReplyKeywords);
      setFeedValue(mergedFeed.join(", "));
      setReplyValue(mergedReply.join(", "));
      const addedFeedCount = mergedFeed.length - currentFeed.length;
      const addedReplyCount = mergedReply.length - currentReply.length;
      if (addedFeedCount === 0 && addedReplyCount === 0) {
        updateStatus("已是最新，无新增关键词", false, 3000);
      } else {
        updateStatus(
          `已合并：首页 +${addedFeedCount}，评论 +${addedReplyCount}`,
          false,
          3000
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "未知错误，请稍后重试";
      updateStatus(`获取失败：${message}`, true);
      console.error("[Bili Field] 导入失败：", error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main>
      <header>
        <h1>🌸 Bili Field</h1>
        <p>使用逗号（中英文皆可）分隔关键词</p>
      </header>
      <form onSubmit={handleSave}>
        <section>
          <label htmlFor="feedKeywords">首页推荐 屏蔽词</label>
          <textarea
            id="feedKeywords"
            name="feedKeywords"
            placeholder="示例：抽奖, 营销"
            rows={3}
            value={feedValue}
            onChange={(event) => setFeedValue(event.target.value)}
          />
        </section>
        <section>
          <label htmlFor="replyKeywords">评论区 屏蔽词</label>
          <textarea
            id="replyKeywords"
            name="replyKeywords"
            placeholder="示例：刷屏, 引战"
            rows={3}
            value={replyValue}
            onChange={(event) => setReplyValue(event.target.value)}
          />
        </section>
        <footer>
          <button type="submit">保存</button>
          <span
            id="status"
            role="status"
            aria-live="polite"
            style={{ color: statusIsError ? "#ff4d4f" : "inherit" }}
          >
            {statusText}
          </span>
        </footer>
      </form>
      <div className="import-section">
        <input
          type="text"
          id="import-url"
          placeholder="接口地址（可选，留空使用默认）"
          value={importUrl}
          onChange={(event) => {
            const next = event.target.value;
            setImportUrl(next);
            writeSettings({ importUrl: next });
          }}
        />
        <button
          type="button"
          onClick={handleImport}
          className="import-btn"
          disabled={isImporting}
        >
          {isImporting ? "正在下载…" : "下载规则"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={autoUpdate}
            onChange={(event) => {
              const next = event.target.checked;
              setAutoUpdate(next);
              writeSettings({ autoUpdate: next });
            }}
          />
          <span>自动更新</span>
          <span style={{ fontSize: 12, color: "#666" }}>
            Latest：{lastUpdateAt || "尚未更新"}
          </span>
        </label>
      </div>
      {hasNewVersion && (
        <div
          className="version-notice"
          style={{
            marginTop: 12,
            padding: 8,
            background: "#f0f9ff",
            borderRadius: 4,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, color: "#0369a1" }}>
            发现新版本 v{remoteVersion} (当前 v{__APP_VERSION__})
            <a
              href="https://github.com/ahhcr68-ux/bili-field/releases"
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 8, color: "#0284c7", fontWeight: "bold" }}
            >
              去更新
            </a>
          </p>
        </div>
      )}
    </main>
  );
};

export default App;
