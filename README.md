# 美股情报热榜配置

这个项目已经支持每小时生成一次 `data/reddit-hot-stocks.json`，页面会自动读取它并展示：

- 过去一小时 Reddit 热门股票 Top 10
- 每只股票的提及次数、相关帖子数、热门话题、情绪和摘要
- 每只股票相关热门帖子链接
- Reddit 热门帖子列表
- Seeking Alpha RSS 资讯标题、摘要和链接

## 1. 不申请 Reddit API 也能运行

脚本现在支持无 API 模式。你可以直接运行：

```powershell
node scripts/fetchRedditHotStocks.mjs
```

它会走 Reddit 公开 `.json` 地址抓取数据。这个方式不需要 `client id` 和 `client secret`，但更容易遇到限流或被 Reddit 拦截。

Seeking Alpha 使用 RSS feed，只抓标题、摘要、发布时间和链接，不抓全文。

## 2. 申请 Reddit API，可选

1. 登录 Reddit。
2. 打开 https://www.reddit.com/prefs/apps
3. 点击 `create another app...`
4. 类型选择 `script`。
5. 记录：
   - `client id`
   - `client secret`

有 API 凭证时，脚本会优先走 OAuth API；没有凭证时，会自动退回公开 `.json` 抓取。

## 3. 本地运行

Windows PowerShell 示例：

如果你的电脑没有安装 Node.js，直接运行：

```powershell
.\run-reddit-hot-stocks.cmd
```

它会优先使用 Codex 自带的 Node.js。

如果你的电脑已经安装 Node.js，也可以运行：

```powershell
$env:REDDIT_CLIENT_ID="你的 client id"
$env:REDDIT_CLIENT_SECRET="你的 client secret"
$env:REDDIT_USER_AGENT="qdii-hot-stocks/1.0 by 你的 reddit 用户名"
node scripts/fetchRedditHotStocks.mjs
```

如果你不想申请 API，就不要设置前两个环境变量，直接运行：

```powershell
node scripts/fetchRedditHotStocks.mjs
```

运行成功后会更新：

```text
data/reddit-hot-stocks.json
data/reddit-hot-stocks.js
```

## 4. GitHub 每小时自动运行

把项目上传到 GitHub 后，在仓库里配置 Secrets：

```text
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
FEISHU_WEBHOOK_URL
```

项目已经包含 workflow：

```text
.github/workflows/reddit-hot-stocks.yml
```

它会在每小时第 7 分钟自动运行一次，也可以在 GitHub Actions 页面手动点击运行。

如果配置了 `FEISHU_WEBHOOK_URL`，每次运行后会把 Reddit 热榜摘要推送到飞书群。

## 5. 调整抓取范围

可以在 GitHub Actions 或本地环境变量里调整：

```text
REDDIT_SUBREDDITS=wallstreetbets,stocks,investing,options,StockMarket,SecurityAnalysis
REDDIT_WINDOW_MINUTES=60
REDDIT_LIMIT_PER_FEED=50
SEEKING_ALPHA_LIMIT=20
```

## 6. 推送到飞书群

1. 在飞书群里添加自定义机器人。
2. 复制机器人 Webhook 地址。
3. 本地运行时设置：

```powershell
$env:FEISHU_WEBHOOK_URL="你的飞书机器人 Webhook"
node scripts/fetchRedditHotStocks.mjs
```

4. GitHub Actions 自动运行时，把 Webhook 放到仓库 Secrets：

```text
FEISHU_WEBHOOK_URL
```

## 7. 注意

Reddit 热榜只覆盖公开 subreddit 和 API 当前能返回的帖子，不能保证覆盖所有 Reddit 讨论。

Seeking Alpha 只读取 RSS 里的标题、摘要和链接，不抓取文章全文或付费内容。这个工具适合做热点发现和资讯入口，不适合做交易信号。
