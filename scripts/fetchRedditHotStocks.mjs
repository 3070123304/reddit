import { mkdir, writeFile } from 'node:fs/promises';

const CONFIG = {
  subreddits: (process.env.REDDIT_SUBREDDITS || 'wallstreetbets,stocks,investing,options,StockMarket,SecurityAnalysis')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  windowMinutes: Number(process.env.REDDIT_WINDOW_MINUTES || 60),
  limitPerFeed: Number(process.env.REDDIT_LIMIT_PER_FEED || 25),
  maxCommentPosts: Number(process.env.REDDIT_MAX_COMMENT_POSTS || 8),
  outputPath: process.env.REDDIT_OUTPUT_PATH || 'data/reddit-hot-stocks.json',
  jsOutputPath: process.env.REDDIT_JS_OUTPUT_PATH || 'data/reddit-hot-stocks.js',
  userAgent: process.env.REDDIT_USER_AGENT || 'qdii-hot-stocks/1.0',
  feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
  seekingAlphaLimit: Number(process.env.SEEKING_ALPHA_LIMIT || 20),
};

const SEEKING_ALPHA_FEEDS = [
  { name: 'All News', url: 'https://seekingalpha.com/market_currents.xml' },
  { name: 'Latest Articles', url: 'https://seekingalpha.com/feed.xml' },
  { name: 'Wall Street Breakfast', url: 'https://seekingalpha.com/tag/wall-st-breakfast.xml' },
  { name: 'Editor Picks', url: 'https://seekingalpha.com/tag/editors-picks.xml' },
  { name: 'Most Popular', url: 'https://seekingalpha.com/listing/most-popular-articles.xml' },
];

const KNOWN_TICKERS = new Set([
  'AAPL', 'ABBV', 'ABNB', 'AMD', 'AMZN', 'AVGO', 'BA', 'BABA', 'BAC', 'COIN', 'COST', 'CRM',
  'DIS', 'GOOG', 'GOOGL', 'HD', 'INTC', 'JPM', 'LLY', 'META', 'MSFT', 'MSTR', 'NFLX', 'NKE',
  'NVDA', 'ORCL', 'PLTR', 'QQQ', 'RIVN', 'SHOP', 'SMCI', 'SNOW', 'SPY', 'TSLA', 'TSM', 'UBER',
  'UNH', 'V', 'WMT', 'XOM',
]);

const BLOCKLIST = new Set([
  'AI', 'ATH', 'CEO', 'CFO', 'DD', 'EPS', 'ETF', 'FOMO', 'GDP', 'IPO', 'ITM', 'IV', 'LOL', 'MOON',
  'OTM', 'PE', 'PCE', 'SEC', 'USA', 'USD', 'YOLO',
]);

const TOPIC_RULES = [
  ['财报', ['earnings', 'eps', 'revenue', 'guidance', 'beat', 'miss']],
  ['AI', ['ai', 'artificial intelligence', 'gpu', 'chip', 'datacenter', 'data center']],
  ['期权', ['option', 'options', 'call', 'calls', 'put', 'puts', 'iv', 'gamma']],
  ['做空', ['short', 'shorts', 'short squeeze', 'squeeze']],
  ['降息', ['rate cut', 'rates', 'fed', 'powell', 'inflation', 'cpi', 'pce']],
  ['并购', ['merger', 'acquisition', 'buyout', 'takeover']],
  ['监管', ['sec', 'regulation', 'regulator', 'lawsuit', 'antitrust']],
  ['估值', ['valuation', 'multiple', 'overvalued', 'undervalued', 'p/e', 'pe ratio']],
];

function utcNow() {
  return Date.now();
}

function uniq(values) {
  return Array.from(new Set(values));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redditHeaders(token) {
  if (!token) {
    return {
      'User-Agent': CONFIG.userAgent,
    };
  }

  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': CONFIG.userAgent,
  };
}

async function getRedditToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.log('No Reddit API credentials found. Using public reddit.com .json endpoints.');
    return null;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': CONFIG.userAgent,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!response.ok) {
    throw new Error(`Reddit token request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  console.log('Using Reddit OAuth API.');
  return payload.access_token;
}

async function fetchJson(url, token, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: redditHeaders(token) });
      if (!response.ok) {
        throw new Error(`Reddit request failed: ${response.status} ${url}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      const waitMs = 900 * attempt;
      console.log(`Fetch failed (${attempt}/${retries}), retrying in ${waitMs}ms: ${url}`);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

async function fetchText(url, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': CONFIG.userAgent,
        },
      });
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${url}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      const waitMs = 900 * attempt;
      console.log(`Fetch failed (${attempt}/${retries}), retrying in ${waitMs}ms: ${url}`);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function getXmlTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeHtml(match[1]) : '';
}

function parseRssItems(xml, feedName) {
  const itemBlocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return itemBlocks.map((item) => {
    const title = getXmlTag(item, 'title');
    const link = getXmlTag(item, 'link');
    const description = getXmlTag(item, 'description');
    const publishedAtText = getXmlTag(item, 'pubDate') || getXmlTag(item, 'updated');
    const publishedDate = publishedAtText ? new Date(publishedAtText) : null;
    const publishedAt = publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate.toISOString() : '';
    return {
      title,
      source: feedName,
      summary: description,
      publishedAt,
      tickers: extractTickers(`${title} ${description}`),
      url: link,
    };
  }).filter((item) => item.title && item.url);
}

async function fetchSeekingAlphaItems() {
  const items = [];

  for (const feed of SEEKING_ALPHA_FEEDS) {
    try {
      const xml = await fetchText(feed.url, 2);
      items.push(...parseRssItems(xml, feed.name));
    } catch (error) {
      console.log(`Skipped Seeking Alpha feed ${feed.name}: ${error.message}`);
    }
  }

  const byUrl = new Map();
  for (const item of items) byUrl.set(item.url, item);

  return Array.from(byUrl.values())
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, CONFIG.seekingAlphaLimit);
}

function normalizePost(child) {
  const data = child?.data || {};
  return {
    id: data.id,
    title: data.title || '',
    selftext: data.selftext || '',
    subreddit: data.subreddit || '',
    score: Number(data.score || 0),
    comments: Number(data.num_comments || 0),
    createdUtc: Number(data.created_utc || 0),
    permalink: data.permalink ? `https://www.reddit.com${data.permalink}` : '',
  };
}

async function fetchPosts(token) {
  const feeds = ['hot', 'new', 'rising', 'top'];
  const since = utcNow() - CONFIG.windowMinutes * 60 * 1000;
  const posts = [];

  for (const subreddit of CONFIG.subreddits) {
    for (const feed of feeds) {
      const timeParam = feed === 'top' ? '&t=hour' : '';
      const url = token
        ? `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/${feed}?limit=${CONFIG.limitPerFeed}${timeParam}`
        : `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${feed}.json?limit=${CONFIG.limitPerFeed}${timeParam}`;
      try {
        const payload = await fetchJson(url, token);
        for (const child of payload?.data?.children || []) {
          const post = normalizePost(child);
          if (post.createdUtc * 1000 >= since) posts.push(post);
        }
      } catch (error) {
        console.log(`Skipped r/${subreddit}/${feed}: ${error.message}`);
      }
    }
  }

  const byId = new Map();
  for (const post of posts) byId.set(post.id, post);
  return Array.from(byId.values());
}

async function fetchCommentsForPosts(posts, token) {
  const commentTexts = new Map();
  const sortedPosts = posts
    .slice()
    .sort((a, b) => b.score + b.comments * 2 - (a.score + a.comments * 2))
    .slice(0, CONFIG.maxCommentPosts);

  for (const post of sortedPosts) {
    const path = post.permalink.replace('https://www.reddit.com', '');
    const url = token
      ? `https://oauth.reddit.com${path}.json?limit=20&sort=top`
      : `https://www.reddit.com${path}.json?limit=20&sort=top`;
    try {
      const payload = await fetchJson(url, token, 2);
      const comments = payload?.[1]?.data?.children || [];
      const text = comments
        .map((comment) => comment?.data?.body || '')
        .filter((body) => body && body !== '[deleted]' && body !== '[removed]')
        .join(' ');
      commentTexts.set(post.id, text);
    } catch (error) {
      console.log(`Skipped comments for ${post.id}: ${error.message}`);
    }
  }

  return commentTexts;
}

function extractTickers(text) {
  const cashtags = Array.from(String(text).matchAll(/\$([A-Z]{1,5})(?![A-Z])/g)).map((match) => match[1]);
  const uppercaseWords = Array.from(String(text).matchAll(/\b[A-Z]{2,5}\b/g)).map((match) => match[0]);
  return uniq([...cashtags, ...uppercaseWords])
    .filter((ticker) => KNOWN_TICKERS.has(ticker))
    .filter((ticker) => !BLOCKLIST.has(ticker));
}

function extractTopics(text) {
  const lower = String(text).toLowerCase();
  return TOPIC_RULES
    .filter(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))
    .map(([topic]) => topic);
}

function getSentiment(text) {
  const lower = String(text).toLowerCase();
  const bullWords = ['bull', 'bullish', 'buy', 'calls', 'moon', 'beat', 'upside', 'long'];
  const bearWords = ['bear', 'bearish', 'sell', 'puts', 'dump', 'miss', 'downside', 'short'];
  const bullCount = bullWords.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
  const bearCount = bearWords.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
  if (bullCount > bearCount + 1) return '偏多';
  if (bearCount > bullCount + 1) return '偏空';
  return '分歧';
}

function summarizeStock(ticker, stat) {
  const topics = stat.topics.length ? stat.topics.slice(0, 4).join('、') : '短线交易';
  return `过去一小时 ${ticker} 被提及 ${stat.mentions} 次，相关帖子 ${stat.posts.size} 篇，讨论重点集中在${topics}。`;
}

function analyze(posts, commentTexts, seekingAlphaItems) {
  const stockMap = new Map();
  const hotPosts = [];

  for (const post of posts) {
    const text = `${post.title} ${post.selftext} ${commentTexts.get(post.id) || ''}`;
    const tickers = extractTickers(text);
    const topics = extractTopics(text);

    hotPosts.push({
      title: post.title,
      subreddit: post.subreddit,
      score: post.score,
      comments: post.comments,
      createdAt: new Date(post.createdUtc * 1000).toISOString(),
      tickers,
      url: post.permalink,
    });

    for (const ticker of tickers) {
      if (!stockMap.has(ticker)) {
        stockMap.set(ticker, {
          ticker,
          mentions: 0,
          posts: new Set(),
          score: 0,
          comments: 0,
          topics: [],
          text: '',
          topPosts: [],
        });
      }
      const stat = stockMap.get(ticker);
      stat.mentions += 1 + (commentTexts.get(post.id)?.match(new RegExp(`\\b${ticker}\\b`, 'g')) || []).length;
      stat.posts.add(post.id);
      stat.score += post.score;
      stat.comments += post.comments;
      stat.topics.push(...topics);
      stat.text += ` ${text}`;
      stat.topPosts.push({
        title: post.title,
        subreddit: post.subreddit,
        score: post.score,
        comments: post.comments,
        url: post.permalink,
      });
    }
  }

  const stocks = Array.from(stockMap.values())
    .map((stat) => {
      const weightedScore = Math.round(stat.mentions * 8 + stat.posts.size * 12 + Math.log10(stat.score + 10) * 18 + Math.log10(stat.comments + 10) * 10);
      stat.topics = uniq(stat.topics).slice(0, 5);
      stat.topPosts = stat.topPosts
        .sort((a, b) => b.score + b.comments * 2 - (a.score + a.comments * 2))
        .slice(0, 5);
      return {
        ticker: stat.ticker,
        score: weightedScore,
        mentions: stat.mentions,
        postCount: stat.posts.size,
        sentiment: getSentiment(stat.text),
        topics: stat.topics,
        summary: summarizeStock(stat.ticker, stat),
        topPosts: stat.topPosts,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    window: `last_${CONFIG.windowMinutes}_minutes`,
    source: 'reddit',
    subreddits: CONFIG.subreddits,
    seekingAlpha: {
      source: 'Seeking Alpha RSS',
      feeds: SEEKING_ALPHA_FEEDS.map((feed) => feed.name),
      items: seekingAlphaItems,
    },
    stocks,
    hotPosts: hotPosts
      .sort((a, b) => b.score + b.comments * 2 - (a.score + a.comments * 2))
      .slice(0, 20),
  };
}

function formatFeishuMessage(result) {
  const generatedAt = new Date(result.generatedAt).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const stockLines = result.stocks.slice(0, 10).map((stock, index) => {
    const topics = stock.topics?.length ? stock.topics.slice(0, 4).join('、') : '暂无';
    const firstPost = stock.topPosts?.[0];
    const linkLine = firstPost?.url ? `\n   热门帖：${firstPost.title}\n   ${firstPost.url}` : '';
    return `${index + 1}. ${stock.ticker}｜${stock.score}分｜${stock.mentions}次提及｜${stock.sentiment}
   话题：${topics}${linkLine}`;
  });

  const postLines = result.hotPosts.slice(0, 5).map((post, index) => {
    const tickers = post.tickers?.length ? `｜${post.tickers.map((ticker) => `$${ticker}`).join(' ')}` : '';
    return `${index + 1}. ${post.title}
   r/${post.subreddit}｜${post.score}分｜${post.comments}评论${tickers}
   ${post.url}`;
  });

  const seekingAlphaLines = (result.seekingAlpha?.items || []).slice(0, 5).map((item, index) => {
    const tickers = item.tickers?.length ? `｜${item.tickers.map((ticker) => `$${ticker}`).join(' ')}` : '';
    return `${index + 1}. ${item.title}
   ${item.source}${tickers}
   ${item.url}`;
  });

  return [
    `Reddit 美股热榜｜过去一小时`,
    `更新时间：${generatedAt}`,
    '',
    `热门股票 Top ${Math.min(result.stocks.length, 10)}`,
    stockLines.join('\n\n') || '暂无热议股票',
    '',
    `热门帖子 Top ${Math.min(result.hotPosts.length, 5)}`,
    postLines.join('\n\n') || '暂无热门帖子',
    '',
    `Seeking Alpha 最新资讯 Top ${Math.min(result.seekingAlpha?.items?.length || 0, 5)}`,
    seekingAlphaLines.join('\n\n') || '暂无 Seeking Alpha 资讯',
  ].join('\n');
}

async function sendFeishuMessage(result) {
  if (!CONFIG.feishuWebhookUrl) return;

  const response = await fetch(CONFIG.feishuWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: {
        text: formatFeishuMessage(result),
      },
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Feishu webhook failed: ${response.status} ${text}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  if (payload && payload.code && payload.code !== 0) {
    throw new Error(`Feishu webhook failed: ${text}`);
  }
  console.log('Sent Reddit hot stocks to Feishu');
}

async function main() {
  const token = await getRedditToken();
  const posts = await fetchPosts(token);
  const commentTexts = await fetchCommentsForPosts(posts, token);
  const seekingAlphaItems = await fetchSeekingAlphaItems();
  const result = analyze(posts, commentTexts, seekingAlphaItems);
  await mkdir('data', { recursive: true });
  await writeFile(CONFIG.outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(CONFIG.jsOutputPath, `window.redditHotStocksData = ${JSON.stringify(result, null, 2)};\n`, 'utf8');
  await sendFeishuMessage(result);
  console.log(`Wrote ${CONFIG.outputPath} and ${CONFIG.jsOutputPath}: ${result.stocks.length} stocks, ${result.hotPosts.length} posts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
