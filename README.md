现在脚本取帖子分两块：Reddit 帖子 和 Seeking Alpha 资讯。

Reddit 帖子逻辑

脚本会抓这些社区：

wallstreetbets
stocks
investing
options
StockMarket
SecurityAnalysis
每个社区抓 4 个列表：

hot
new
rising
top?t=hour
然后只保留：

created_utc 在最近 60 分钟内的帖子
也就是“过去一小时的新帖子”。

之后会去重，同一个帖子只保留一次。

热门帖子排序逻辑是：

score + comments * 2
也就是说：

upvote 分数越高越靠前
评论数越多越靠前
评论的权重是 upvote 的 2 倍
最后取前 20 条。

股票怎么从帖子里识别

脚本会从这些地方找股票代码：

帖子标题
帖子正文
热门评论
识别方式：

$NVDA 这种 cashtag
NVDA 这种大写 ticker
但只认我们白名单里的股票，比如：

NVDA, TSLA, AMD, AAPL, MSFT, META, AMZN, PLTR, MSTR, COIN ...
也会排除容易误判的词，比如：

AI, CEO, DD, ETF, IPO, USA, USD
热门股票排序逻辑

每只股票会根据这些因素算分：

提及次数
相关帖子数量
帖子 upvote 总分
帖子评论总数
公式大致是：

mentions * 8
+ postCount * 12
+ log10(totalScore + 10) * 18
+ log10(totalComments + 10) * 10
最后取 Top 10。

Seeking Alpha 资讯逻辑

Seeking Alpha 不抓全文，只抓 RSS。脚本会读取几个 RSS 源：

All News
Latest Articles
Wall Street Breakfast
Editor Picks
Most Popular
每条只取：

标题
摘要
发布时间
链接
提到的股票代码
然后按发布时间倒序排序，取前 20 条。

所以整体逻辑可以理解为：

Reddit = 看大家正在热议什么
Seeking Alpha = 看资讯端刚出了什么消息
Reddit 负责“热度”，Seeking Alpha 负责“资讯入口”。
