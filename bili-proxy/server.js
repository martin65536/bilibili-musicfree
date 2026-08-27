// ===== B站 MusicFree 代理服务端 v2 =====
// 重心全在服务端：直接请求B站、格式化数据
// MusicFree 插件只发简单 GET 请求调用这里的业务接口
// 运行：node server.js  （端口默认 3000，可用 PORT 环境变量改）
//
// 控制台交互：运行后按回车显示菜单
//   1. 设置/修改 Cookie
//   2. 查看当前 Cookie
//   3. 清除 Cookie
//   4. 开关调试输出（打印所有B站响应）
//   5. 查看当前配置
//   6. 退出

const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dayjs = require('dayjs');
const he = require('he');
const CryptoJs = require('crypto-js');

const PORT = process.env.PORT || 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const HEADERS = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'sec-ch-ua': '"Not A(Brand";v="99", "Chromium";v="121", "Google Chrome";v="121"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
};

// ===== 配置持久化 =====
const CONFIG_FILE = path.join(__dirname, 'config.json');
let config = { cookie: '', debug: false, debugFull: false };
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            config.cookie = parsed.cookie || '';
            config.debug = !!parsed.debug;
            config.debugFull = !!parsed.debugFull;
        }
    } catch (e) { console.error('[config] 加载失败:', e.message); }
}
function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) { console.error('[config] 保存失败:', e.message); }
}
loadConfig();

// ===== 控制台交互 =====
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let menuActive = false;
function showMenu() {
    if (menuActive) return;
    if (rl.closed) return;
    menuActive = true;
    console.log('\n╔════════════════════════════════════╗');
    console.log('║     B站代理服务端 - 设置菜单       ║');
    console.log('╠════════════════════════════════════╣');
    console.log('║  1. 设置/修改 Cookie               ║');
    console.log('║  2. 查看当前 Cookie                ║');
    console.log('║  3. 清除 Cookie                    ║');
    console.log(`║  4. 调试输出: ${config.debug ? '开 ✓' : '关  '}            ║`);
    console.log(`║  5. 完整响应输出: ${config.debugFull ? '开 ✓' : '关  '}        ║`);
    console.log('║  6. 查看当前配置                   ║');
    console.log('║  7. 退出                           ║');
    console.log('╚════════════════════════════════════╝');
    rl.question('请选择 [1-7]: ', (choice) => {
        menuActive = false;
        handleMenu(choice);
    });
}
function handleMenu(choice) {
    switch (String(choice).trim()) {
        case '1':
            rl.question('请粘贴B站Cookie（含SESSDATA，一行）:\n', (val) => {
                config.cookie = String(val).trim();
                saveConfig();
                const hasSess = /SESSDATA=/.test(config.cookie);
                console.log(hasSess ? '✅ Cookie已保存（含SESSDATA）' : '⚠️ Cookie已保存，但未检测到SESSDATA');
                showMenu();
            });
            break;
        case '2':
            if (config.cookie) {
                const c = config.cookie;
                console.log('当前Cookie长度:', c.length);
                console.log('含SESSDATA:', /SESSDATA=/.test(c));
                console.log('含bili_jct:', /bili_jct=/.test(c));
                console.log('含buvid3:', /buvid3=/.test(c));
                console.log('含DedeUserID:', /DedeUserID=/.test(c));
                console.log('前80字符:', c.slice(0, 80) + '...');
            } else { console.log('当前未设置Cookie'); }
            showMenu();
            break;
        case '3':
            config.cookie = '';
            saveConfig();
            console.log('✅ Cookie已清除');
            showMenu();
            break;
        case '4':
            config.debug = !config.debug;
            saveConfig();
            console.log('调试输出已' + (config.debug ? '开启 ✓（打印请求URL+响应概要）' : '关闭'));
            showMenu();
            break;
        case '5':
            config.debugFull = !config.debugFull;
            if (config.debugFull && !config.debug) {
                config.debug = true; // 完整输出依赖调试输出
                console.log('（已自动开启调试输出）');
            }
            saveConfig();
            console.log('完整响应输出已' + (config.debugFull ? '开启 ✓（打印B站完整响应内容，最多2000字符）' : '关闭'));
            showMenu();
            break;
        case '6':
            console.log('当前配置:');
            console.log('  端口:', PORT);
            console.log('  Cookie:', config.cookie ? `已设置(${config.cookie.length}字符)` : '未设置');
            console.log('  调试输出:', config.debug ? '开' : '关');
            console.log('  完整响应输出:', config.debugFull ? '开' : '关');
            console.log('  配置文件:', CONFIG_FILE);
            showMenu();
            break;
        case '7':
            console.log('再见！');
            process.exit(0);
            break;
        default:
            showMenu();
    }
}
// 启动后 2 秒自动显示菜单
setTimeout(() => { if (!menuActive) showMenu(); }, 2000);

// ===== 工具函数 =====
function durationToSec(duration) {
    if (typeof duration === 'number') return duration;
    if (typeof duration === 'string') {
        return duration.split(':').reduce((p, c) => 60 * p + +c, 0);
    }
    return 0;
}
function secToMmSs(sec) {
    if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
}
function formatNumber(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
}
function formatArtwork(url) {
    if (!url) return null;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('http')) return url;
    return 'https:' + url;
}
// 获取匿名 buvid（缓存）
let anonCookie = null;
async function getAnonCookie() {
    if (anonCookie) return anonCookie;
    try {
        const r = await fetchBili('https://api.bilibili.com/x/frontend/finger/spi', { headers: { 'User-Agent': UA } });
        anonCookie = `buvid3=${r.data.b_3};buvid4=${r.data.b_4}`;
        return anonCookie;
    } catch (e) { return ''; }
}
// 请求B站接口（Node.js fetch 无限制）
async function fetchBili(url, options) {
    const opts = options || {};
    // opts.headers 优先于 HEADERS（覆盖 cookie/referer 等）
    const headers = Object.assign({}, HEADERS, opts.headers || {});
    if (config.debug) console.log('  [debug→B站] ' + (opts.method || 'GET') + ' ' + url.slice(0, 120));
    const resp = await fetch(url, { headers, method: opts.method || 'GET' });
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = { _raw: text, _status: resp.status }; }
    if (config.debug) {
        const summary = typeof parsed === 'object' && parsed ? ('code=' + parsed.code + ' keys=' + Object.keys(parsed).slice(0,5).join(',')) : ('非JSON len=' + text.length);
        console.log('  [debug←B站] status=' + resp.status + ' ' + summary + (parsed._raw ? ' raw前80=' + parsed._raw.slice(0,80) : ''));
        // debugFull 模式：打印完整响应内容（最多 2000 字符）
        if (config.debugFull) {
            console.log('  [debugFull←B站] 完整响应:');
            console.log('  ' + text.slice(0, 2000).split('\n').join('\n  ') + (text.length > 2000 ? '\n  ... (共' + text.length + '字符，仅显示前2000)' : ''));
        }
    }
    return parsed;
}
// 拼接带参数的 URL
function buildUrl(base, params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    return base + '?' + qs.toString();
}

// ===== wbi 签名（getArtistWorks 需要）=====
function getMixinKey(e) {
    const t = [];
    [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52].forEach(r => { if (e.charAt(r)) t.push(e.charAt(r)); });
    return t.join('').slice(0, 32);
}
let wbiImg = null, wbiSub = null, wbiTime = null;
async function getWBIKeys(cookie) {
    if (wbiImg && wbiSub && wbiTime && wbiTime.getDate() === new Date().getDate()) return { img: wbiImg, sub: wbiSub };
    const ts = Math.floor(Date.now() / 1000);
    const hexSign = CryptoJs.HmacSHA256(`ts${ts}`, 'XgwSnGZ1p').toString(CryptoJs.enc.Hex);
    const r = await fetchBili(buildUrl('https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket', { key_id:'ec02', hexsign:hexSign, 'context[ts]':ts, csrf:'' }), { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0' } });
    if (!r.data || !r.data.nav) {
        console.error('[getWBIKeys] GenWebTicket返回异常:', JSON.stringify(r).slice(0, 200));
        throw new Error('GenWebTicket失败 code=' + r.code);
    }
    wbiImg = r.data.nav.img.slice(r.data.nav.img.lastIndexOf('/') + 1, r.data.nav.img.lastIndexOf('.'));
    wbiSub = r.data.nav.sub.slice(r.data.nav.sub.lastIndexOf('/') + 1, r.data.nav.sub.lastIndexOf('.'));
    wbiTime = new Date();
    return { img: wbiImg, sub: wbiSub };
}
async function getRid(params, cookie) {
    const { img, sub } = await getWBIKeys(cookie);
    const npi = img + sub;
    const o = getMixinKey(npi);
    const l = Object.keys(params).sort();
    const c = [];
    for (let d = 0, u = /[!'\(\)*]/g; d < l.length; ++d) {
        let p = params[l[d]];
        if (p && typeof p === 'string') p = p.replace(u, '');
        if (p != null) c.push(encodeURIComponent(l[d]) + '=' + encodeURIComponent(p));
    }
    return CryptoJs.MD5(c.join('&') + npi).toString();
}

// ===== 业务接口实现 =====

// 1. 搜索
async function apiSearch(query) {
    const keyword = query.keyword;
    const page = parseInt(query.page || '1');
    const type = query.type || 'music';
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const searchType = (type === 'album' || type === 'music') ? 'video' : 'bili_user';
    const params = { context:'', page, order:'', page_size:20, keyword, duration:'', tids_1:'', tids_2:'', __refresh__:true, _extra:'', highlight:1, single_column:0, platform:'pc', from_source:'', search_type:searchType, dynamic_offset:0 };
    const r = await fetchBili(buildUrl('https://api.bilibili.com/x/web-interface/search/type', params), {
        headers: Object.assign({ cookie, origin:'https://search.bilibili.com', referer:'https://search.bilibili.com/', accept:'application/json, text/plain, */*' }, HEADERS)
    });
    if (r.code !== 0 || !r.data || !r.data.result) return { isEnd: true, data: [] };
    const list = r.data.result;
    if (searchType === 'video') {
        return { isEnd: r.data.numResults <= page * 20, data: list.map(formatMedia) };
    } else {
        return { isEnd: r.data.numResults <= page * 20, data: list.map(item => ({
            name: item.uname, id: item.mid, fans: item.fans, description: item.usign,
            avatar: item.upic && item.upic.startsWith('//') ? 'https://' + item.upic : item.upic,
            worksNum: item.videos
        })) };
    }
}
function formatMedia(result) {
    const title = he.decode((result.title || '').replace(/(<em(.*?)>)|(<\/em>)/g, ''));
    const durSec = durationToSec(result.duration);
    const pubTs = result.pubdate || result.created;
    const artistName = result.author || (result.owner && result.owner.name) || '';
    const baseAlbum = result.bvid || result.aid;
    return {
        id: result.cid || result.bvid || result.aid,
        aid: result.aid, bvid: result.bvid,
        artist: artistName, title,
        album: baseAlbum,
        artwork: formatArtwork(result.pic) || result.pic,
        duration: durSec,
        tags: (result.tag && typeof result.tag === 'string') ? result.tag.split(',') : undefined,
        date: pubTs ? dayjs.unix(pubTs).format('YYYY-MM-DD') : '',
        playCount: typeof result.play === 'number' ? result.play : undefined,
        likeCount: typeof result.like === 'number' ? result.like : undefined,
        favoriteCount: typeof result.favorites === 'number' ? result.favorites : undefined,
        danmakuCount: typeof result.video_review === 'number' ? result.video_review : undefined,
        replyCount: typeof result.review === 'number' ? result.review : undefined,
        category: result.typename || '',
        description: (result.description || result.desc || '') + '\n播放 ' + formatNumber(result.play) + ' | 点赞 ' + formatNumber(result.like) + ' | 收藏 ' + formatNumber(result.favorites),
        artistId: result.mid,
    };
}

// 2. 获取 cid（getAlbumInfo/getMediaSource 需要）
async function getCid(bvid, aid, cookie) {
    const r = await fetchBili(buildUrl('https://api.bilibili.com/x/web-interface/view', bvid ? { bvid } : { aid }), { headers: { cookie, referer: 'https://www.bilibili.com/' } });
    return r;
}

// 3. 专辑详情（多P/合集）
async function apiAlbumInfo(query) {
    const bvid = query.bvid;
    const aid = query.aid;
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const cidRes = await getCid(bvid, aid, cookie);
    const d = cidRes.data;
    if (!d) return { musicList: [] };
    // 父级字段，每个分P继承
    const base = {
        aid: d.aid,
        bvid: d.bvid,
        artist: d.owner && d.owner.name || '',
        artwork: formatArtwork(d.pic),
        album: d.bvid || d.aid,
    };
    const pages = d.pages || [];
    if (pages.length <= 1) {
        return { musicList: [Object.assign({}, base, { id: d.cid, cid: d.cid, title: d.title, duration: d.duration })] };
    }
    // 多P：每个分P继承父级字段
    return { musicList: pages.map(p => Object.assign({}, base, { cid: p.cid, id: p.cid, title: p.part, duration: durationToSec(p.duration) })) };
}

// 4. 播放链接
async function apiMediaSource(query) {
    const bvid = query.bvid;
    const aid = query.aid;
    const cid = query.cid;
    const quality = query.quality || 'standard';
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    let realCid = cid;
    if (!realCid) {
        const cidRes = await getCid(bvid, aid, cookie);
        realCid = cidRes.data && cidRes.data.cid;
    }
    if (!realCid) throw new Error('无法获取cid');
    const params = Object.assign(bvid ? { bvid } : { aid }, { cid: realCid, fnval: 16 });
    const r = await fetchBili(buildUrl('https://api.bilibili.com/x/player/playurl', params), { headers: { referer: 'https://www.bilibili.com/video/' + (bvid || aid) } });
    if (r.code !== 0) throw new Error('playurl错误 code=' + r.code);
    let url;
    if (r.data.dash && r.data.dash.audio && r.data.dash.audio.length) {
        const audios = r.data.dash.audio.sort((a, b) => a.bandwidth - b.bandwidth);
        const len = audios.length;
        const idx = quality === 'low' ? 0 : quality === 'high' ? Math.min(2, len-1) : quality === 'super' ? len-1 : Math.min(1, len-1);
        url = audios[idx].baseUrl;
    } else if (r.data.durl && r.data.durl.length) {
        url = r.data.durl[0].url;
    }
    if (!url) throw new Error('无音频流');
    const hostUrl = url.substring(url.indexOf('/') + 2);
    return { url, headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/video/' + (bvid || aid), host: hostUrl.substring(0, hostUrl.indexOf('/')) } };
}

// 5. 歌曲详情
async function apiMusicInfo(query) {
    const bvid = query.bvid;
    const aid = query.aid;
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const cidRes = await getCid(bvid, aid, cookie);
    const d = cidRes.data;
    if (!d) return {};
    const result = {};
    if (d.cid) result.cid = d.cid;
    if (d.duration) result.duration = d.duration;
    if (d.title) result.title = he.decode(d.title);
    if (d.pic) result.artwork = formatArtwork(d.pic);
    if (d.owner && d.owner.name) result.artist = d.owner.name;
    if (d.desc) result.desc = d.desc.trim();
    const stat = d.stat || {};
    if (stat.view != null) result.playCount = stat.view;
    if (stat.like != null) result.likeCount = stat.like;
    if (stat.coin != null) result.coinCount = stat.coin;
    if (stat.favorite != null) result.favoriteCount = stat.favorite;
    if (stat.danmaku != null) result.danmakuCount = stat.danmaku;
    if (stat.reply != null) result.replyCount = stat.reply;
    if (d.pubdate) result.date = dayjs.unix(d.pubdate).format('YYYY-MM-DD');
    return result;
}

// 6. 评论
const commentCursor = new Map(); // aid -> next
async function apiComments(query) {
    const aid = query.aid;
    const page = parseInt(query.page || '1');
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const next = page === 1 ? 0 : (commentCursor.get(String(aid)) || 0);
    const params = { type:1, oid:aid, mode:3, next, ps:30, plat:1, web_location:1315875, wts:Math.floor(Date.now()/1000) };
    const r = await fetchBili(buildUrl('https://api.bilibili.com/x/v2/reply/main', params), { headers: { cookie, referer:'https://www.bilibili.com/' } });
    if (r.code !== 0) return { isEnd: true, data: [] };
    const replies = r.data.replies || [];
    const cursor = r.data.cursor || {};
    if (typeof cursor.next === 'number') commentCursor.set(String(aid), cursor.next);
    const comments = replies.map(item => ({
        id: item.rpid, nickName: item.member && item.member.uname, avatar: item.member && item.member.avatar,
        comment: item.content && item.content.message, like: item.like, createAt: item.ctime * 1000,
        location: item.reply_control && item.reply_control.location && item.reply_control.location.startsWith('IP属地：') ? item.reply_control.location.slice(5) : undefined,
        replies: item.replies ? item.replies.map(r2 => ({ id: r2.rpid, nickName: r2.member && r2.member.uname, avatar: r2.member && r2.member.avatar, comment: r2.content && r2.content.message, like: r2.like, createAt: r2.ctime * 1000 })) : undefined
    }));
    // 首页插简介
    if (page === 1) {
        try {
            const cidRes = await getCid(query.bvid, aid, cookie);
            const desc = cidRes.data && cidRes.data.desc;
            if (desc && desc.trim()) comments.unshift({ id: '__intro__', nickName: '📝 视频简介', comment: desc.trim() });
        } catch (e) {}
    }
    return { isEnd: !(replies.length > 0 && cursor.next > 0 && replies.length >= 30), data: comments };
}

// 7. 字幕（歌词）
async function apiLyric(query) {
    const bvid = query.bvid;
    const aid = query.aid;
    const cid = query.cid;
    const cookie = config.cookie || query.cookie;
    if (!cookie || !/SESSDATA=/.test(cookie)) return {}; // 未登录不获取
    let realCid = cid;
    if (!realCid) {
        const cidRes = await getCid(bvid, aid, cookie);
        realCid = cidRes.data && cidRes.data.cid;
    }
    if (!realCid) return {};
    const params = { aid, cid: realCid, isGaiaAvoided:false, web_location:1315873, dm_img_list:'[]', dm_img_str:'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ', dm_cover_img_str:'QU5HTEUgKE5WSURJQS' };
    const r = await fetchBili(buildUrl('https://api.bilibili.com/x/player/wbi/v2', params), { headers: { cookie, referer: 'https://www.bilibili.com/video/' + bvid, origin: 'https://www.bilibili.com' } });
    if (r.code !== 0 || !r.data || !r.data.subtitle) return {};
    const subs = r.data.subtitle.subtitles || [];
    if (subs.length === 0) return {};
    const zhSub = subs.find(s => /zh|cn/i.test(s.lan || ''));
    const enSub = subs.find(s => /en/i.test(s.lan || ''));
    async function fetchBody(sub) {
        if (!sub || !sub.subtitle_url) return null;
        let u = sub.subtitle_url;
        if (u.startsWith('//')) u = 'https:' + u;
        const r = await fetchBili(u, { headers: { 'User-Agent': UA } });
        return Array.isArray(r.body) ? r.body : null;
    }
    const zhBody = zhSub ? await fetchBody(zhSub) : null;
    const enBody = enSub ? await fetchBody(enSub) : null;
    function toLrc(body) {
        if (!body || !body.length) return '';
        return body.map(i => '[' + secToMmSs(i.from) + ']' + (i.content || '')).join('\n');
    }
    const result = {};
    if (zhBody) result.rawLrc = toLrc(zhBody);
    if (enBody) result.translation = toLrc(enBody);
    if (!result.rawLrc && !result.translation) {
        const body = await fetchBody(subs[0]);
        if (body) result.rawLrc = toLrc(body);
    }
    return result;
}

// 8. 排行榜
async function apiTopLists(query) {
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const weeklyRes = await fetchBili('https://api.bilibili.com/x/web-interface/popular/series/list', { headers: { cookie, referer:'https://www.bilibili.com/' } });
    const weekly = { title: '每周必看', data: (weeklyRes.data.list || []).slice(0, 8).map(e => ({ id: 'popular/series/one?number=' + e.number, title: e.subject, description: e.name, coverImg: 'https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_weekly.png' })) };
    const precious = { title: '入站必刷', data: [{ id: 'popular/precious?page_size=100&page=1', title: '入站必刷', coverImg: 'https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_history.png' }] };
    const boardKeys = [['ranking/v2?rid=0&type=all','全站'],['ranking/v2?rid=3&type=all','音乐'],['ranking/v2?rid=1&type=all','动画'],['ranking/v2?rid=119&type=all','鬼畜'],['ranking/v2?rid=168&type=all','国创相关'],['ranking/v2?rid=129&type=all','舞蹈'],['ranking/v2?rid=4&type=all','游戏'],['ranking/v2?rid=36&type=all','知识'],['ranking/v2?rid=188&type=all','科技'],['ranking/v2?rid=234&type=all','运动'],['ranking/v2?rid=223&type=all','汽车'],['ranking/v2?rid=160&type=all','生活'],['ranking/v2?rid=211&type=all','美食'],['ranking/v2?rid=217&type=all','动物圈'],['ranking/v2?rid=155&type=all','时尚'],['ranking/v2?rid=5&type=all','娱乐'],['ranking/v2?rid=181&type=all','影视'],['ranking/v2?rid=0&type=origin','原创'],['ranking/v2?rid=0&type=rookie','新人']];
    const board = { title: '排行榜', data: boardKeys.map(([id,title]) => ({ id, title, coverImg: 'https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_rank.png' })) };
    return [weekly, precious, board];
}
async function apiTopListDetail(query) {
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const r = await fetchBili('https://api.bilibili.com/x/web-interface/' + query.id, { headers: { cookie, referer:'https://www.bilibili.com/' } });
    return { musicList: ((r.data && r.data.list) || []).map(formatMedia) };
}

// 9. 作者作品
async function apiArtistWorks(query) {
    const mid = query.mid;
    const page = parseInt(query.page || '1');
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const now = Math.round(Date.now() / 1e3);
    const params = { mid, ps:30, tid:0, pn:page, index:0, special_type:'', web_location:'333.1387', order_avoided:true, order:'pubdate', keyword:'', platform:'web', dm_img_list:'[]', dm_img_str:'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ', dm_cover_img_str:'TWFsaS1HNzcgTUM5QV', dm_img_inter:'{"ds":[],"wh":[7802,2344,18],"of":[117,234,117]}', wts: now.toString() };
    const w_rid = await getRid(params, cookie);
    params.w_rid = w_rid;
    const r = await fetchBili(buildUrl('https://api.bilibili.com/x/space/wbi/arc/search', params), { headers: { cookie, origin:'https://space.bilibili.com', referer:'https://space.bilibili.com/' + mid + '/video' } });
    // wbi 签名失败时（-403/-352），降级用搜索接口
    if (r.code !== 0 || !r.data || !r.data.list) {
        console.log('[artistWorks] wbi接口失败 code=' + r.code + '，降级用搜索');
        // 先拿 UP 主名字
        let uname = '';
        try {
            const infoUrl = buildUrl('https://api.bilibili.com/x/space/acc/info', { mid });
            const info = await fetchBili(infoUrl, { headers: { cookie, referer: 'https://space.bilibili.com/' + mid } });
            uname = info.data && info.data.name || '';
        } catch (e) {}
        if (!uname) return { isEnd: true, data: [] };
        // 搜索该 UP 主的视频
        const searchParams = { context:'', page, order:'', page_size:30, keyword:uname, duration:'', tids_1:'', tids_2:'', __refresh__:true, _extra:'', highlight:1, single_column:0, platform:'pc', from_source:'', search_type:'video', dynamic_offset:0 };
        const sr = await fetchBili(buildUrl('https://api.bilibili.com/x/web-interface/search/type', searchParams), { headers: { cookie, origin:'https://search.bilibili.com', referer:'https://search.bilibili.com/', accept:'application/json, text/plain, */*' } });
        if (sr.code !== 0 || !sr.data || !sr.data.result) return { isEnd: true, data: [] };
        // 过滤出该 UP 主自己的视频
        const list = sr.data.result.filter(v => String(v.mid) === String(mid));
        return { isEnd: sr.data.numResults <= page * 30, data: list.map(formatMedia) };
    }
    return { isEnd: r.data.page.pn * r.data.page.ps >= r.data.page.count, data: r.data.list.vlist.map(formatMedia) };
}

// 10. 导入收藏夹
async function apiImportSheet(query) {
    const id = query.id;
    const cookie = config.cookie || query.cookie || await getAnonCookie();
    const result = [];
    let page = 1;
    while (true) {
        const r = await fetchBili(buildUrl('https://api.bilibili.com/x/v3/fav/resource/list', { media_id:id, platform:'web', ps:20, pn:page }), { headers: { cookie, referer:'https://www.bilibili.com/' } });
        if (r.code !== 0 || !r.data || !r.data.medias) break;
        result.push(...r.data.medias);
        if (!r.data.has_more) break;
        page++;
        if (page > 50) break;
    }
    return result.map(_ => ({ id:_.id, aid:_.aid, bvid:_.bvid, artwork:_.cover, title:_.title, artist:_.upper && _.upper.name, album:_.bvid || _.aid, duration: durationToSec(_.duration) }));
}

// ===== HTTP 服务 =====
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = new URL(req.url, 'http://localhost:' + PORT);
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams);
    console.log('[' + new Date().toLocaleTimeString() + '] ' + pathname + ' ' + JSON.stringify(query).slice(0, 100));

    const routes = {
        '/ping': () => ({ ok: true, service: 'bili-proxy-v2', time: Date.now() }),
        '/search': () => apiSearch(query),
        '/albumInfo': () => apiAlbumInfo(query),
        '/mediaSource': () => apiMediaSource(query),
        '/musicInfo': () => apiMusicInfo(query),
        '/comments': () => apiComments(query),
        '/lyric': () => apiLyric(query),
        '/topLists': () => apiTopLists(query),
        '/topListDetail': () => apiTopListDetail(query),
        '/artistWorks': () => apiArtistWorks(query),
        '/importSheet': () => apiImportSheet(query),
    };

    try {
        const handler = routes[pathname];
        if (!handler) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'unknown route: ' + pathname, routes: Object.keys(routes) }));
            return;
        }
        const result = await handler();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
    } catch (e) {
        console.error('[error]', pathname, e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('===== B站 MusicFree 代理服务端 v2 =====');
    console.log('监听: http://localhost:' + PORT);
    console.log('接口:');
    console.log('  /ping              健康检查');
    console.log('  /search            搜索 ?keyword=&page=&type=&cookie=');
    console.log('  /albumInfo         专辑详情 ?bvid=&aid=&cookie=');
    console.log('  /mediaSource       播放链接 ?bvid=&aid=&cid=&quality=&cookie=');
    console.log('  /musicInfo         歌曲详情 ?bvid=&aid=&cookie=');
    console.log('  /comments          评论 ?aid=&bvid=&page=&cookie=');
    console.log('  /lyric             字幕 ?bvid=&aid=&cid=&cookie=');
    console.log('  /topLists          排行榜 ?cookie=');
    console.log('  /topListDetail     排行榜详情 ?id=&cookie=');
    console.log('  /artistWorks       作者作品 ?mid=&page=&cookie=');
    console.log('  /importSheet       导入收藏夹 ?id=&cookie=');
    console.log('按 Ctrl+C 停止');
});
