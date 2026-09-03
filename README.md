# bilibili-musicfree

B站 MusicFree 插件集合，提供多种版本适配不同使用场景。基于 maotoumao 原版扩展，新增 Cookie 支持、AI 字幕作为歌词（双语）、评论分页与视频简介、播放量/点赞等统计字段、专辑名模板、代理服务端等能力。

---

## 📦 版本对比

本项目提供 **3 个版本**，`platform` 名不同，可同时安装对比：

| 版本 | 文件 | platform | 适合场景 | 网络限制 |
|---|---|---|---|---|
| **axios 版**（原版增强） | `bilibili.js` | `bilibili` | 简单使用，不需要字幕/评论完整分页 | 受 MusicFree 沙箱限制 |
| **fetch 版** | `bilibili-fetch.js` | `bilibili-fetch` | 想测试 fetch 是否比 axios 更稳 | 受 MusicFree 沙箱限制 |
| **代理壳版**（推荐） | `bilibili-proxy.js` | `bilibili-proxy` | 需要字幕/评论/作者作品全功能 | **无限制**（走 Termux 代理） |

### 安装链接

```
# axios 版
https://cdn.jsdelivr.net/gh/martin65536/bilibili-musicfree@main/bilibili.js

# fetch 版
https://cdn.jsdelivr.net/gh/martin65536/bilibili-musicfree@main/bilibili-fetch.js

# 代理壳版（推荐）
https://cdn.jsdelivr.net/gh/martin65536/bilibili-musicfree@main/bilibili-proxy.js
```

---

## 🏗️ 架构说明

### axios 版 / fetch 版（直接请求）

```
MusicFree 插件  ──直接请求──>  api.bilibili.com
  (沙箱内)                     (受风控/网络限制)
```

插件直接用 axios/fetch 请求 B站接口。受 MusicFree 沙箱网络环境限制，部分功能（字幕、评论完整分页）可能异常。

### 代理壳版（推荐）

```
MusicFree 壳插件  ──fetch localhost──>  Termux 服务端  ──fetch 无限制──>  api.bilibili.com
  (极简，90行)                          (server.js，重活全干)
```

- **壳插件**：只发简单 GET 请求到本地代理，不做业务逻辑
- **服务端**：在 Termux 里运行 Node.js，直接请求 B站，格式化数据后返回
- **优势**：绕开 MusicFree 沙箱网络限制，Cookie 在服务端管理更安全

---

## 🚀 快速开始

### 方案一：代理壳版（推荐，全功能）

#### 1. Termux 端

```bash
# 安装 Node.js
pkg install nodejs

# 下载服务端
curl -O https://raw.githubusercontent.com/martin65536/bilibili-musicfree/main/bili-proxy/server.js

# 安装依赖
npm install dayjs he crypto-js

# 运行
node server.js
```

看到以下输出即成功：
```
===== B站 MusicFree 代理服务端 v2 =====
监听: http://localhost:3000
```

**Termux 使用技巧**：

```bash
# 修改端口（默认3000，被占用时）
PORT=8080 node server.js

# 后台运行（防止关闭Termux后停止）
nohup node server.js > proxy.log 2>&1 &

# 用 tmux（推荐，可断开重连）
pkg install tmux
tmux
node server.js
# 按 Ctrl+B 然后按 D 断开（服务继续跑）
# 重新连接: tmux attach

# 防止息屏杀死（保持Termux前台或加锁）
termux-wake-lock

# 开机自启（可选）
echo "node ~/server.js &" >> ~/.bashrc
```

**服务端控制台菜单**：运行后 2 秒自动显示，可设置 Cookie、开关调试输出等。

#### 2. 配置 Cookie（可选，但推荐）

服务端启动后，2 秒自动显示菜单：
```
╔════════════════════════════════════╗
║     B站代理服务端 - 设置菜单       ║
╠════════════════════════════════════╣
║  1. 设置/修改 Cookie               ║
║  2. 查看当前 Cookie                ║
║  3. 清除 Cookie                    ║
║  4. 调试输出: 关                   ║
║  5. 完整响应输出: 关               ║
║  6. 查看当前配置                   ║
║  7. 退出                           ║
╚════════════════════════════════════╝
```

选 `1`，粘贴你的 B站 Cookie（含 SESSDATA）。

**Cookie 获取方法**：
1. 浏览器登录 bilibili.com
2. F12 → Network → 点任一 `api.bilibili.com` 请求
3. Request Headers → `cookie:` 那行，复制完整值

#### 3. MusicFree 端

1. 安装插件：`https://cdn.jsdelivr.net/gh/martin65536/bilibili-musicfree@main/bilibili-proxy.js`
2. 插件设置填 `proxyUrl`：`http://localhost:3000`
3. **不用填 Cookie**（在服务端设置）

完成！现在可以搜索/播放/看评论/看字幕了。

### 方案二：axios 版（简单，功能受限）

直接安装 `bilibili.js`，在插件设置填 Cookie（可选）。

---

## ⚙️ 配置项

### 代理壳版（bilibili-proxy.js）

| 配置项 | 说明 | 示例 |
|---|---|---|
| `proxyUrl` | **必填**。Termux 服务端地址 | `http://localhost:3000` |

Cookie 在服务端控制台设置，不填插件里。

### axios 版 / fetch 版（bilibili.js / bilibili-fetch.js）

| 配置项 | 说明 | 示例 |
|---|---|---|
| `cookie` | 可选。B站登录 Cookie，含 SESSDATA | `SESSDATA=xxx; bili_jct=yyy; ...` |
| `ua` | 可选。自定义 User-Agent | `Mozilla/5.0 (Windows NT 10.0...)` |
| `albumTemplate` | 可选。专辑名模板（见下文） | `{bvid} ({date})` |

---

## 🎵 功能列表

所有版本支持以下功能（代理壳版最完整）：

| 方法 | 功能 | 说明 |
|---|---|---|
| `search` | 搜索 | 视频/UP主，返回播放量/点赞等统计 |
| `getMediaSource` | 播放链接 | 多音质（low/standard/high/super） |
| `getAlbumInfo` | 专辑详情 | 多P/合集视频拆分 |
| `getArtistWorks` | 作者作品 | UP 主视频列表 |
| `getTopLists` | 排行榜 | 全站/音乐/游戏等分区、每周必看、入站必刷 |
| `getTopListDetail` | 排行榜详情 | 排行榜内视频列表 |
| `importMusicSheet` | 导入收藏夹 | 支持收藏夹ID/URL |
| `getMusicComments` | 评论 | 无限滚动，首条自动显示视频简介 |
| `getLyric` | 字幕作为歌词 | AI字幕，支持中英双语 |
| `getMusicInfo` | 歌曲详情 | 补全播放量/点赞/简介等 |

---

## 📝 专辑名模板（axios 版 / fetch 版）

`albumTemplate` 配置项支持自定义专辑名格式，用占位符：

| 占位符 | 含义 | 示例值 |
|---|---|---|
| `{bvid}` | BV号 | `BV1sb411t7ps` |
| `{aid}` | av号 | `47441335` |
| `{date}` | 发布日期 | `2019-03-26` |
| `{duration}` | 时长（秒） | `81` |
| `{durationMmSs}` | 时长（mm:ss） | `01:21` |
| `{artist}` | UP主名 | `五毛钱的宿命` |
| `{title}` | 视频标题 | `手绘700帧...` |
| `{playCount}` | 播放量（格式化） | `1331.8万` |
| `{likeCount}` | 点赞数 | `58.6万` |
| `{coinCount}` | 投币数 | `50.9万` |
| `{favoriteCount}` | 收藏数 | `24.6万` |
| `{danmakuCount}` | 弹幕数 | `5.3万` |
| `{replyCount}` | 评论数 | `1.5万` |
| `{shareCount}` | 分享数 | `10.8万` |
| `{category}` | 分区 | `明星舞蹈` |

**示例**：
- 不填 → `BV1sb411t7ps`（默认只显示BV号）
- `{bvid} ({date})` → `BV1sb411t7ps (2019-03-26)`
- `{bvid} 播{playCount} 赞{likeCount}` → `BV1sb411t7ps 播1331.8万 赞58.6万`

---

## 🛠️ 服务端调试

代理壳版的服务端提供两级调试：

### 4. 调试输出（概要）
打印每个 B站 请求的 URL 和响应概要：
```
[debug→B站] GET https://api.bilibili.com/x/web-interface/search/type?...
[debug←B站] status=200 code=0 keys=code,message,ttl,data
```

### 5. 完整响应输出
打印 B站 完整响应内容（最多 2000 字符）：
```
[debugFull←B站] 完整响应:
{"code":0,"data":{...},"message":"OK"}
```

### 服务端接口列表

服务端提供以下业务接口，壳插件调用它们：

| 接口 | 功能 | 参数 |
|---|---|---|
| `/ping` | 健康检查 | 无 |
| `/search` | 搜索 | keyword, page, type |
| `/albumInfo` | 专辑详情 | bvid, aid |
| `/mediaSource` | 播放链接 | bvid, aid, cid, quality |
| `/musicInfo` | 歌曲详情 | bvid, aid |
| `/comments` | 评论 | aid, bvid, page |
| `/lyric` | 字幕 | bvid, aid, cid |
| `/topLists` | 排行榜 | 无 |
| `/topListDetail` | 排行榜详情 | id |
| `/artistWorks` | 作者作品 | mid, page |
| `/importSheet` | 导入收藏夹 | id |

可独立测试：
```bash
curl "http://localhost:3000/ping"
curl "http://localhost:3000/search?keyword=蔡徐坤&page=1&type=music"
curl "http://localhost:3000/lyric?bvid=BV12z4y1B76K&aid=571629411&cid=1146686123"
```

---

## 🔒 Cookie 安全

### 代理壳版
- Cookie 存在服务端 `config.json`，不经过 MusicFree 沙箱
- 多设备共享同一服务端，Cookie 统一管理
- Cookie 更新只改服务端，插件不用动

### axios 版 / fetch 版
- Cookie 填在 MusicFree 插件设置里
- 注意：Cookie 含 SESSDATA（登录凭证），不要泄露

### Cookie 字段说明

完整 Cookie 应包含：

| 字段 | 作用 | 必需 |
|---|---|---|
| `SESSDATA` | 登录凭证 | ✅ 字幕/评论分页必需 |
| `bili_jct` | CSRF token | 推荐 |
| `buvid3` | 设备指纹 | 推荐（缺失可能被降级） |
| `DedeUserID` | 用户ID | 推荐 |
| `b_lsid` | 会话标识 | 可选 |

---

## 🐛 FAQ

### Q: 字幕获取不到？
**A:**
1. 代理壳版：服务端控制台选1设Cookie（含SESSDATA）
2. axios版：插件设置填Cookie
3. 确认视频本身有AI字幕（不是所有视频都有）
4. 服务端开调试输出（选4）看 `player/wbi/v2` 返回的 `subtitles` 是否为空

### Q: 评论只能看到几条，无法滚动？
**A:** 评论完整分页需要登录Cookie。匿名只返回少量热门评论。
- 代理壳版：服务端设Cookie
- axios版：插件设Cookie

### Q: 搜作者作品（getArtistWorks）报错 -403？
**A:** B站对 `space/wbi/arc/search` 接口风控严格。代理壳版已加降级方案（wbi失败时用搜索代替）。如果还不行：
1. 服务端设Cookie
2. 开调试看具体错误
3. 等B站风控放松（有时效性）

### Q: 代理壳版提示"未配置proxyUrl"？
**A:** 在MusicFree插件设置填 `proxyUrl` = `http://localhost:3000`（Termux服务端地址）

### Q: Termux服务端怎么后台运行？
**A:**
```bash
# 方法1: nohup
nohup node server.js &

# 方法2: tmux
tmux
node server.js
# Ctrl+B, D 退出（服务继续跑）

# 方法3: termux-wake-lock（防止息屏杀死）
termux-wake-lock
node server.js
```

### Q: 播放视频没声音？
**A:** B站视频音频流是独立的，插件已经提取音频流。如果没声音：
1. 检查 `getMediaSource` 返回的 url 是否有效
2. 确认视频没失效
3. 付费视频无法播放

### Q: 如何更新插件？
**A:**
- 代理壳版服务端：`curl -O https://raw.githubusercontent.com/martin65536/bilibili-musicfree/main/bili-proxy/server.js` 重新下载
- MusicFree插件：点"刷新插件"（srcUrl指向@main，自动拉新版）

---

## 📁 项目结构

```
bilibili-musicfree/
├── bilibili.js              # axios 版插件（原版增强）
├── bilibili-fetch.js        # fetch 版插件
├── bilibili-proxy.js        # 代理壳版插件（推荐）
├── bili-proxy/
│   └── server.js            # Termux 代理服务端
└── README.md                # 本文档
```

---

## 🙏 致谢

- 原版插件：[maotoumao/MusicFreePlugins](https://github.com/maotoumao/MusicFreePlugins)
- MusicFree 插件开发指南：[maotoumao/musicfree-skills](https://github.com/maotoumao/musicfree-skills)

---

## 📄 License

MIT
