import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import "./styles.css";

const CONFIG_STORAGE_KEY = "biliFieldRules";
const DEFAULT_CONFIG = {
  feedKeywords: [] as string[],
  replyKeywords: [] as string[],
};
const DEFAULT_IMPORT_URL =
  "https://my-json-server.typicode.com/ahhcr68-ux/thin-json-db/presets/default";

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

const App = () => {
  const [feedValue, setFeedValue] = useState("");
  const [replyValue, setReplyValue] = useState("");

  const [importUrl, setImportUrl] = useState(DEFAULT_IMPORT_URL);

  const [statusText, setStatusText] = useState("");
  const [statusIsError, setStatusIsError] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const statusTimer = useRef<number>(null);

  const updateStatus = useCallback(
    (text: string, isError = false, autoClearMs?: number) => {
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
    },
    []
  );

  useEffect(() => {
    const storage = window.chrome?.storage?.sync;
    if (!storage) {
      setFeedValue(DEFAULT_CONFIG.feedKeywords.join(", "));
      setReplyValue(DEFAULT_CONFIG.replyKeywords.join(", "));
      return;
    }
    storage.get(CONFIG_STORAGE_KEY, (items) => {
      const config = safeGetConfig(items);
      setFeedValue(config.feedKeywords.join(", "));
      setReplyValue(config.replyKeywords.join(", "));
    });
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
    storage.set({ [CONFIG_STORAGE_KEY]: payload }, () => {
      const lastError = window.chrome?.runtime?.lastError;
      if (lastError) {
        updateStatus(`保存失败：${lastError.message}`, true);
      } else {
        updateStatus("已保存 ✔，刷新后生效", false, 2000);
      }
    });
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
          onChange={(event) => setImportUrl(event.target.value)}
        />
        <button
          type="button"
          onClick={handleImport}
          className="import-btn"
          disabled={isImporting}
        >
          {isImporting ? "正在下载…" : "下载规则"}
        </button>
      </div>
    </main>
  );
};

export default App;
