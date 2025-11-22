(() => {
  const DEFAULT_CONFIG = {
    feedKeywords: [],
    replyKeywords: []
  };

  function parseInitialConfig() {
    const current = document.currentScript;
    if (!current || !current.dataset.config) {
      return DEFAULT_CONFIG;
    }
    try {
      return JSON.parse(decodeURIComponent(current.dataset.config));
    } catch (error) {
      console.warn('[Bili Field] 初始配置解析失败：', error);
      return DEFAULT_CONFIG;
    }
  }

  function includesKeyword(text, keywords) {
    if (!text || !keywords.length) return false;
    const t = String(text);
    return keywords.some((keyword) => t.includes(keyword));
  }

  function extractTitle(item) {
    if (!item || typeof item !== 'object') return '';
    if (typeof item.title === 'string') return item.title;
    const possible = [
      item?.modules?.module_dynamic?.major?.archive?.title,
      item?.modules?.module_dynamic?.major?.opus?.summary?.text,
      item?.modules?.module_dynamic?.major?.article?.title,
      item?.desc,
      item?.name
    ];
    return possible.find((text) => typeof text === 'string') || '';
  }

  function filterFeedPayload(payload, keywords) {
    if (!payload || typeof payload !== 'object') return null;
    const cloned =
      typeof structuredClone === 'function'
        ? structuredClone(payload)
        : JSON.parse(JSON.stringify(payload));

    const containers = [
      cloned?.data?.items,
      cloned?.data?.item,
      cloned?.data?.list
    ].filter(Array.isArray);

    if (!containers.length) return null;

    let mutated = false;
    containers.forEach((list) => {
      const originalLength = list.length;
      list.splice(
        0,
        list.length,
        ...list.filter(
          (entry) => !includesKeyword(extractTitle(entry), keywords)
        )
      );
      if (list.length !== originalLength) mutated = true;
    });

    return mutated ? cloned : null;
  }


  /* 先用 .filter() 把自身 content.message 命中的评论（无论是一级还是子楼）直接删除
   * 剩下的每条会递归调用自身继续处理 reply.replies 子楼。所以 如果是某条子楼被关键词命中，只会删掉那条子楼，不会连带删掉它的一级父评论
   * 但如果一级评论自身包含关键词，会整条（含其所有子楼）一并移除。*/
  function filterReplies(list, keywords) {
    if (!Array.isArray(list)) return list;
    return list
      .filter((reply) => {
        const content = reply?.content?.message || '';
        return !includesKeyword(content, keywords);
      })
      .map((reply) => {
        if (Array.isArray(reply?.replies)) {
          reply.replies = filterReplies(reply.replies, keywords);
        }
        return reply;
      });
  }

  function filterReplyPayload(payload, keywords) {
    if (!payload || typeof payload !== 'object' || !payload.data) return null;
    const clone =
      typeof structuredClone === 'function'
        ? structuredClone(payload)
        : JSON.parse(JSON.stringify(payload));
    const containers = [
      clone.data.replies,
      clone.data.top_replies,
      clone.data.upper?.top,
      clone.data.upper?.assist
    ];

    let mutated = false;
    containers.forEach((list, index) => {
      if (Array.isArray(list)) {
        const filtered = filterReplies(list, keywords);
        if (filtered.length !== list.length) mutated = true;
        switch (index) {
          case 0:
            clone.data.replies = filtered;
            break;
          case 1:
            clone.data.top_replies = filtered;
            break;
          case 2:
            clone.data.upper.top = filtered;
            break;
          case 3:
            clone.data.upper.assist = filtered;
            break;
          default:
            break;
        }
      }
    });

    return mutated ? clone : null;
  }

  function matches(url, patterns) {
    return patterns.some((regex) => regex.test(url));
  }

  async function tryFilterResponse(response, handler) {
    const cloned = response.clone();
    const contentType = cloned.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }
    const data = await cloned.json();
    return handler(data);
  }

  function pageMain(initialConfig) {
    if (window.__biliFieldInstalled) {
      window.dispatchEvent(
        new CustomEvent('biliFieldUpdateConfig', { detail: initialConfig })
      );
      return;
    }

    window.__biliFieldInstalled = true;

    const FEED_PATTERNS = [
      /\/x\/web-interface\/wbi\/index\/top\/feed/,
      /\/x\/(web-interface|v2)\/index\/feed/,
      /\/x\/v2\/feed\//,
      /\/x\/web-feed\//
    ];

    const REPLY_PATTERNS = [/\/x\/v[12]\/reply\//, /\/x\/reply\//];

    let activeConfig = initialConfig || DEFAULT_CONFIG;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (...args) {
      const response = await originalFetch(...args);
      try {
        const request = args[0];
        const url = typeof request === 'string' ? request : request?.url || '';
        if (!url) return response;

        if (activeConfig.feedKeywords.length && matches(url, FEED_PATTERNS)) {
          const filtered = await tryFilterResponse(response, (payload) =>
            filterFeedPayload(payload, activeConfig.feedKeywords)
          );
          if (filtered) {
            return new Response(JSON.stringify(filtered), {
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers)
            });
          }
        }

        if (activeConfig.replyKeywords.length && matches(url, REPLY_PATTERNS)) {
          const filtered = await tryFilterResponse(response, (payload) =>
            filterReplyPayload(payload, activeConfig.replyKeywords)
          );
          if (filtered) {
            return new Response(JSON.stringify(filtered), {
              status: response.status,
              statusText: response.statusText,
              headers: new Headers(response.headers)
            });
          }
        }
      } catch (error) {
        console.warn('[Bili Field] 过滤失败：', error);
      }
      return response;
    };

    window.addEventListener('biliFieldUpdateConfig', (event) => {
      activeConfig = event.detail || DEFAULT_CONFIG;
    });
  }

  pageMain(parseInitialConfig());
})();

