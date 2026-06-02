(function initRedditDashboard() {
  const els = {
    dataMeta: document.querySelector('#dataMeta'),
    stockCount: document.querySelector('#stockCount'),
    postCount: document.querySelector('#postCount'),
    subredditCount: document.querySelector('#subredditCount'),
    saCount: document.querySelector('#saCount'),
    windowLabel: document.querySelector('#windowLabel'),
    stockList: document.querySelector('#stockList'),
    topicList: document.querySelector('#topicList'),
    postList: document.querySelector('#postList'),
    seekingAlphaList: document.querySelector('#seekingAlphaList'),
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatLocalTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getSentimentClass(sentiment) {
    if (sentiment === '偏多') return 'sentiment-up';
    if (sentiment === '偏空') return 'sentiment-down';
    return 'sentiment-mixed';
  }

  function buildTopicStats(stocks) {
    const counts = new Map();
    for (const stock of stocks) {
      for (const topic of stock.topics || []) {
        counts.set(topic, (counts.get(topic) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }

  function renderStocks(stocks) {
    els.stockList.innerHTML = stocks.map((item, index) => `
      <article class="stock-row">
        <div class="rank">${index + 1}</div>
        <div class="stock-body">
          <div class="stock-mainline">
            <strong class="ticker">${escapeHtml(item.ticker)}</strong>
            <span class="score">${escapeHtml(item.score)}分</span>
            <span class="sentiment ${getSentimentClass(item.sentiment)}">${escapeHtml(item.sentiment || '分歧')}</span>
          </div>
          <div class="stock-stats">
            <span>${escapeHtml(item.mentions)}次提及</span>
            <span>${escapeHtml(item.postCount)}篇帖子</span>
          </div>
          <p class="stock-summary">${escapeHtml(item.summary || '')}</p>
          <div class="topic-row">
            ${(item.topics || []).slice(0, 5).map((topic) => `<span>${escapeHtml(topic)}</span>`).join('')}
          </div>
          <div class="stock-links">
            ${(item.topPosts || []).slice(0, 3).map((post) => `
              <a href="${escapeHtml(post.url)}" target="_blank" rel="noopener">
                <span>${escapeHtml(post.title)}</span>
                <small>r/${escapeHtml(post.subreddit)} · ${escapeHtml(post.score)}分 · ${escapeHtml(post.comments)}评论</small>
              </a>
            `).join('')}
          </div>
        </div>
      </article>
    `).join('') || '<div class="empty-state">暂无过去一小时热议股票</div>';
  }

  function renderTopics(stocks) {
    const topics = buildTopicStats(stocks);
    els.topicList.innerHTML = topics.map((topic) => `
      <div class="topic-chip">
        <span>${escapeHtml(topic.name)}</span>
        <strong>${escapeHtml(topic.count)}</strong>
      </div>
    `).join('') || '<div class="empty-state">暂无热门话题</div>';
  }

  function renderPosts(posts) {
    els.postList.innerHTML = posts.slice(0, 20).map((post) => `
      <a class="post-row" href="${escapeHtml(post.url)}" target="_blank" rel="noopener">
        <span class="post-title">${escapeHtml(post.title)}</span>
        <span class="post-meta">
          r/${escapeHtml(post.subreddit)} · ${escapeHtml(post.score)}分 · ${escapeHtml(post.comments)}评论 · ${formatLocalTime(post.createdAt)}
        </span>
        <span class="post-tickers">${(post.tickers || []).map((ticker) => `$${escapeHtml(ticker)}`).join(' ')}</span>
      </a>
    `).join('') || '<div class="empty-state">暂无热门帖子</div>';
  }

  function renderSeekingAlpha(items) {
    els.seekingAlphaList.innerHTML = items.slice(0, 20).map((item) => `
      <a class="article-row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
        <span class="article-title">${escapeHtml(item.title)}</span>
        <span class="article-meta">
          ${escapeHtml(item.source || 'Seeking Alpha')} · ${formatLocalTime(item.publishedAt)}
        </span>
        <span class="article-summary">${escapeHtml(item.summary || '')}</span>
        <span class="post-tickers">${(item.tickers || []).map((ticker) => `$${escapeHtml(ticker)}`).join(' ')}</span>
      </a>
    `).join('') || '<div class="empty-state">暂无 Seeking Alpha 资讯</div>';
  }

  function renderDashboard(data) {
    const stocks = Array.isArray(data.stocks) ? data.stocks : [];
    const posts = Array.isArray(data.hotPosts) ? data.hotPosts : [];
    const subreddits = Array.isArray(data.subreddits) ? data.subreddits : [];
    const seekingAlphaItems = Array.isArray(data.seekingAlpha?.popularItems)
      ? data.seekingAlpha.popularItems
      : Array.isArray(data.seekingAlpha?.items)
        ? data.seekingAlpha.items
        : [];
    const sourceLabel = data.source === 'demo' ? '示例数据' : 'Reddit + Seeking Alpha';

    els.dataMeta.textContent = `${sourceLabel} · 更新于 ${formatLocalTime(data.generatedAt)}`;
    els.stockCount.textContent = stocks.length;
    els.postCount.textContent = posts.length;
    els.subredditCount.textContent = subreddits.length;
    els.saCount.textContent = seekingAlphaItems.length;
    els.windowLabel.textContent = data.window || 'last_60_minutes';

    renderStocks(stocks);
    renderTopics(stocks);
    renderPosts(posts);
    renderSeekingAlpha(seekingAlphaItems);
  }

  async function loadData() {
    if (window.redditHotStocksData && window.location.protocol === 'file:') {
      renderDashboard(window.redditHotStocksData);
      return;
    }

    try {
      const response = await fetch('./data/reddit-hot-stocks.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      renderDashboard(await response.json());
    } catch (error) {
      if (window.redditHotStocksData) {
        renderDashboard(window.redditHotStocksData);
        return;
      }
      els.dataMeta.textContent = '数据读取失败';
      els.stockList.innerHTML = '<div class="empty-state">请先运行 Reddit 抓取脚本生成数据</div>';
      els.topicList.innerHTML = '';
      els.postList.innerHTML = '';
      els.seekingAlphaList.innerHTML = '';
    }
  }

  loadData();
}());
