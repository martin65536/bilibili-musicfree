"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const dayjs = require("dayjs");
const he = require("he");
const CryptoJs = require("crypto-js");
const { load } = require("cheerio");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const headers = {
    "user-agent": UA,
    accept: "*/*",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
};
let cookie = null;
async function getCookie() {
    if (!cookie) {
        cookie = (await axios_1.default.get("https://api.bilibili.com/x/frontend/finger/spi", {
            headers: { "User-Agent": UA },
        })).data.data;
    }
    return cookie;
}
// 读取用户在插件设置里填的 B 站登录 cookie（可选）
// 填了之后：AI 字幕、高清音质、收藏夹等需要登录的功能才能用
function getUserCookie() {
    try {
        const v = env.getUserVariables();
        const raw = (v && v.cookie) ? v.cookie : "";
        // 用户可能填了字符串，也可能是其他类型，统一转字符串
        const c = raw ? String(raw).trim() : "";
        if (c) {
            // 脱敏日志：只显示长度和是否含关键 cookie 项，不泄露完整值
            const hasSessdata = /SESSDATA=/.test(c);
            const hasBiliJct = /bili_jct=/.test(c);
            const hasBuvid3 = /buvid3=/.test(c);
            console.log("[getUserCookie] 已读取用户cookie 长度=" + c.length + " 含SESSDATA=" + hasSessdata + " 含bili_jct=" + hasBiliJct + " 含buvid3=" + hasBuvid3);
            if (!hasSessdata) {
                console.warn("[getUserCookie] ⚠️ 用户cookie不含SESSDATA，登录态功能(字幕/评论分页)将不可用");
            }
        } else {
            console.log("[getUserCookie] 用户未填cookie，将使用匿名buvid");
        }
        return c;
    } catch (e) {
        console.error("[getUserCookie] 读取异常:", e.message);
        return "";
    }
}
// 拼接最终请求用的 cookie 字符串：用户 cookie 优先，匿名 buvid 作为补充
// 如果用户填了 cookie，直接用用户的（里面通常已含 buvid3/buvid4/SESSDATA 等）
// 否则降级用匿名 buvid3/buvid4
// 关键修复：用户cookie如果缺buvid3（设备指纹），B站会降级返回受限数据
// （评论只给3条、字幕列表为空等）。这里自动补上匿名buvid3/buvid4
async function getCookieString() {
    const userCookie = getUserCookie();
    if (userCookie) {
        // 检查用户cookie是否缺buvid3
        const hasBuvid3 = /buvid3=/.test(userCookie);
        if (hasBuvid3) {
            return userCookie;
        }
        // 缺buvid3，自动补匿名buvid3/buvid4
        await getCookie();
        if (cookie && cookie.b_3) {
            console.log("[getCookieString] 用户cookie缺buvid3，自动补全匿名buvid3/buvid4");
            return userCookie + ";buvid3=" + cookie.b_3 + ";buvid4=" + cookie.b_4;
        }
        console.warn("[getCookieString] 用户cookie缺buvid3，且匿名buvid获取失败");
        return userCookie;
    }
    await getCookie();
    if (!cookie) {
        console.warn("[getCookieString] 匿名buvid也为空，请求将不带cookie");
        return "";
    }
    const anon = `buvid3=${cookie.b_3};buvid4=${cookie.b_4}`;
    return anon;
}
// 判断当前是否处于登录状态（用于决定是否尝试拉取字幕）
function isLoggedIn() {
    const c = getUserCookie();
    const logged = /SESSDATA=/.test(c);
    console.log("[isLoggedIn] " + (logged ? "✅ 已登录(有SESSDATA)" : "❌ 未登录(无SESSDATA，字幕/评论分页受限)"));
    return logged;
}
// 读取用户配置的专辑名模板字符串
// 默认空 = 只返回 bvid/aid
// 支持占位符：{bvid} {aid} {date} {duration} {durationMmSs} {artist} {title}
// 例："{bvid} ({date})" -> "BV1sb411t7ps (2019-03-26)"
function getAlbumTemplate() {
    try {
        const v = env.getUserVariables();
        return (v && v.albumTemplate && String(v.albumTemplate).trim()) || "";
    } catch (e) {
        return "";
    }
}
// 秒数转 mm:ss（工具函数）
function secToMmSs(sec) {
    if (typeof sec !== "number" || !isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${String(m).padStart(2, "0")}:${String(Math.floor(s)).padStart(2, "0")}`;
}
// 数字格式化：13317730 -> "1331.8万"，586240 -> "58.6万"，1234 -> "1234"
function formatNumber(n) {
    if (typeof n !== "number" || !isFinite(n)) return "";
    if (n >= 10000) {
        return (n / 10000).toFixed(1).replace(/\.0$/, "") + "万";
    }
    return String(n);
}
// 按模板生成 album 字符串
// vars: { bvid, aid, date, duration, durationMmSs, artist, title,
//         playCount, likeCount, coinCount, favoriteCount, danmakuCount, replyCount, shareCount, category }
function renderAlbumTemplate(vars) {
    const tpl = getAlbumTemplate();
    if (!tpl) {
        return vars.bvid || String(vars.aid || "") || "";
    }
    let out = tpl;
    const replacements = {
        "{bvid}": vars.bvid || "",
        "{aid}": vars.aid != null ? String(vars.aid) : "",
        "{date}": vars.date || "",
        "{duration}": typeof vars.duration === "number" ? String(vars.duration) : "",
        "{durationMmSs}": typeof vars.duration === "number" ? secToMmSs(vars.duration) : "",
        "{artist}": vars.artist || "",
        "{title}": vars.title || "",
        "{playCount}": typeof vars.playCount === "number" ? formatNumber(vars.playCount) : "",
        "{likeCount}": typeof vars.likeCount === "number" ? formatNumber(vars.likeCount) : "",
        "{coinCount}": typeof vars.coinCount === "number" ? formatNumber(vars.coinCount) : "",
        "{favoriteCount}": typeof vars.favoriteCount === "number" ? formatNumber(vars.favoriteCount) : "",
        "{danmakuCount}": typeof vars.danmakuCount === "number" ? formatNumber(vars.danmakuCount) : "",
        "{replyCount}": typeof vars.replyCount === "number" ? formatNumber(vars.replyCount) : "",
        "{shareCount}": typeof vars.shareCount === "number" ? formatNumber(vars.shareCount) : "",
        "{category}": vars.category || "",
    };
    for (const [k, v] of Object.entries(replacements)) {
        out = out.split(k).join(v);
    }
    return out.trim();
}
async function getCid(bvid, aid) {
    const params = bvid ? { bvid } : { aid };
    const cidRes = (await axios_1.default.get("https://api.bilibili.com/x/web-interface/view", {
        headers: Object.assign(Object.assign({}, headers), { cookie: await getCookieString() }),
        params,
    })).data;
    return cidRes;
}
function durationToSec(duration) {
    if (typeof duration === "number") {
        return duration;
    }
    if (typeof duration === "string") {
        const dur = duration.split(":");
        return dur.reduce(function (prev, curr) {
            return 60 * prev + +curr;
        }, 0);
    }
    return 0;
}
const searchHeaders = {
    "user-agent": UA,
    accept: "application/json, text/plain, */*",
    "accept-encoding": "gzip, deflate, br",
    origin: "https://search.bilibili.com",
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    referer: "https://search.bilibili.com/",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
};
const pageSize = 20;
async function searchBase(keyword, page, searchType) {
    await getCookie();
    const params = {
        context: "",
        page,
        order: "",
        page_size: pageSize,
        keyword,
        duration: "",
        tids_1: "",
        tids_2: "",
        __refresh__: true,
        _extra: "",
        highlight: 1,
        single_column: 0,
        platform: "pc",
        from_source: "",
        search_type: searchType,
        dynamic_offset: 0,
    };
    try {
        const res = (await axios_1.default.get("https://api.bilibili.com/x/web-interface/search/type", {
            headers: Object.assign(Object.assign({}, searchHeaders), { cookie: await getCookieString() }),
            params,
        })).data;
        if (!res) {
            throw new Error("搜索接口返回空（可能被风控）");
        }
        if (res.code !== 0) {
            throw new Error("搜索接口返回错误 code=" + res.code + " msg=" + (res.message || ""));
        }
        if (!res.data || !res.data.result) {
            throw new Error("搜索接口返回数据异常: " + JSON.stringify(res).slice(0, 200));
        }
        return res.data;
    } catch (error) {
        console.error("[searchBase] 搜索失败 keyword=" + keyword + " page=" + page + " type=" + searchType + ":", error.message);
        // 返回安全结构，避免上层 .map/.filter 崩溃
        return { result: [], numResults: 0 };
    }
}
async function getFavoriteList(id) {
    const result = [];
    const pageSize = 20;
    let page = 1;
    while (true) {
        try {
            const { data: { data: { medias, has_more }, }, } = await axios_1.default.get("https://api.bilibili.com/x/v3/fav/resource/list", {
                params: {
                    media_id: id,
                    platform: "web",
                    ps: pageSize,
                    pn: page,
                },
                headers: Object.assign(Object.assign({}, headers), { cookie: await getCookieString() }),
            });
            result.push(...medias);
            if (!has_more) {
                break;
            }
            page += 1;
        }
        catch (error) {
            console.warn(error);
            break;
        }
    }
    return result;
}
function formatMedia(result) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const title = he.decode((_b = (_a = result.title) === null || _a === void 0 ? void 0 : _a.replace(/(\<em(.*?)\>)|(\<\/em\>)/g, "")) !== null && _b !== void 0 ? _b : "");
    // 用模板生成 album，默认只返回 bvid/aid
    const durSec = durationToSec(result.duration);
    const pubTs = result.pubdate || result.created;
    const pubDate = pubTs ? dayjs.unix(pubTs).format("YYYY-MM-DD") : "";
    const artistName = (result.author || (result.owner && result.owner.name) || "");
    // 统计字段（搜索接口直接返回，无需二次请求）
    const playCount = typeof result.play === "number" ? result.play : (result.stat ? result.stat.view : undefined);
    const likeCount = typeof result.like === "number" ? result.like : (result.stat ? result.stat.like : undefined);
    const danmakuCount = typeof result.video_review === "number" ? result.video_review : (typeof result.danmaku === "number" ? result.danmaku : (result.stat ? result.stat.danmaku : undefined));
    const replyCount = typeof result.review === "number" ? result.review : (result.stat ? result.stat.reply : undefined);
    const favoriteCount = typeof result.favorites === "number" ? result.favorites : (result.stat ? result.stat.favorite : undefined);
    const coinCount = typeof result.coins === "number" ? result.coins : (result.stat ? result.stat.coin : undefined);
    const shareCount = typeof result.share === "number" ? result.share : (result.stat ? result.stat.share : undefined);
    const category = result.typename || result.tname || "";
    // 视频简介：优先 description 字段，其次 desc
    const rawDesc = (result.description && String(result.description).trim()) || (result.desc && String(result.desc).trim()) || "";
    // 拼一段介绍：简介 + 统计摘要
    let descParts = [];
    if (rawDesc) descParts.push(rawDesc);
    const statParts = [];
    if (typeof playCount === "number") statParts.push("播放 " + formatNumber(playCount));
    if (typeof likeCount === "number") statParts.push("点赞 " + formatNumber(likeCount));
    if (typeof coinCount === "number") statParts.push("投币 " + formatNumber(coinCount));
    if (typeof favoriteCount === "number") statParts.push("收藏 " + formatNumber(favoriteCount));
    if (typeof danmakuCount === "number") statParts.push("弹幕 " + formatNumber(danmakuCount));
    if (typeof replyCount === "number") statParts.push("评论 " + formatNumber(replyCount));
    if (statParts.length > 0) descParts.push(statParts.join(" | "));
    const description = descParts.join("\n");
    const album = renderAlbumTemplate({
        bvid: result.bvid,
        aid: result.aid,
        date: pubDate,
        duration: durSec,
        durationMmSs: durSec > 0 ? secToMmSs(durSec) : "",
        artist: artistName,
        title: title,
        playCount: playCount,
        likeCount: likeCount,
        coinCount: coinCount,
        favoriteCount: favoriteCount,
        danmakuCount: danmakuCount,
        replyCount: replyCount,
        shareCount: shareCount,
        category: category,
    });
    const item = {
        id: (_d = (_c = result.cid) !== null && _c !== void 0 ? _c : result.bvid) !== null && _d !== void 0 ? _d : result.aid,
        aid: result.aid,
        bvid: result.bvid,
        artist: artistName,
        title,
        alias: (_g = title.match(/《(.+?)》/)) === null || _g === void 0 ? void 0 : _g[1],
        album: album,
        artwork: ((_j = result.pic) === null || _j === void 0 ? void 0 : _j.startsWith("//"))
            ? "http:".concat(result.pic)
            : result.pic,
        duration: durationToSec(result.duration),
        tags: (result.tag && typeof result.tag === "string") ? result.tag.split(",") : undefined,
        date: pubDate,
        playCount: playCount,
        likeCount: likeCount,
        coinCount: coinCount,
        favoriteCount: favoriteCount,
        danmakuCount: danmakuCount,
        replyCount: replyCount,
        shareCount: shareCount,
        category: category,
        description: description,
        artistId: result.mid,
        artistAvatar: result.upic || (result.owner && result.owner.face),
    };
    Object.keys(item).forEach((key) => {
        if (item[key] === undefined || item[key] === null) delete item[key];
    });
    return item;
}
async function searchAlbum(keyword, page) {
    const resultData = await searchBase(keyword, page, "video");
    const albums = resultData.result.map(formatMedia);
    return {
        isEnd: resultData.numResults <= page * pageSize,
        data: albums,
    };
}
async function searchArtist(keyword, page) {
    const resultData = await searchBase(keyword, page, "bili_user");
    const artists = resultData.result.map((result) => {
        var _a;
        return ({
            name: result.uname,
            id: result.mid,
            fans: result.fans,
            description: result.usign,
            avatar: ((_a = result.upic) === null || _a === void 0 ? void 0 : _a.startsWith("//"))
                ? `https://${result.upic}`
                : result.upic,
            worksNum: result.videos,
        });
    });
    return {
        isEnd: resultData.numResults <= page * pageSize,
        data: artists,
    };
}
function getMixinKey(e) {
    var t = [];
    return ([
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
        49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
        40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
        62, 11, 36, 20, 34, 44, 52,
    ].forEach(function (r) {
        e.charAt(r) && t.push(e.charAt(r));
    }),
        t.join("").slice(0, 32));
}
function hmacSha256(key, message) {
    const hmac = CryptoJs.HmacSHA256(message, key);
    return hmac.toString(CryptoJs.enc.Hex);
}
async function getBiliTicket(csrf) {
    const ts = Math.floor(Date.now() / 1000);
    const hexSign = hmacSha256('XgwSnGZ1p', `ts${ts}`);
    const url = 'https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket';
    try {
        const response = await axios_1.default.post(url, null, {
            params: {
                key_id: 'ec02',
                hexsign: hexSign,
                'context[ts]': ts,
                csrf: csrf || ''
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0'
            }
        });
        const data = await response.data;
        return data.data;
    }
    catch (e) {
        throw e;
    }
}
let img, sub, syncedTime;
async function getWBIKeys() {
    if (img && sub && syncedTime && syncedTime.getDate() === (new Date()).getDate()) {
        return {
            img,
            sub
        };
    }
    else {
        const data = await getBiliTicket('');
        img = data.nav.img;
        img = img.slice(img.lastIndexOf('/') + 1, img.lastIndexOf('.'));
        sub = data.nav.sub;
        sub = sub.slice(sub.lastIndexOf('/') + 1, sub.lastIndexOf('.'));
        syncedTime = new Date();
        return {
            img,
            sub
        };
    }
}
async function getRid(params) {
    const wbiKeys = await getWBIKeys();
    const npi = wbiKeys.img + wbiKeys.sub;
    const o = getMixinKey(npi);
    const l = Object.keys(params).sort();
    let c = [];
    for (let d = 0, u = /[!'\(\)*]/g; d < l.length; ++d) {
        let [h, p] = [l[d], params[l[d]]];
        p && "string" == typeof p && (p = p.replace(u, "")),
            null != p &&
                c.push("".concat(encodeURIComponent(h), "=").concat(encodeURIComponent(p)));
    }
    const f = c.join("&");
    const w_rid = CryptoJs.MD5(f + o).toString();
    return w_rid;
}
let w_webid;
let w_webid_date;
async function getWWebId(id) {
    if (w_webid && w_webid_date && (Date.now() - w_webid_date.getTime() < 1000 * 60 * 60)) {
        return w_webid;
    }
    const html = (await axios_1.default.get("https://space.bilibili.com/" + id, {
        headers: {
            "user-agent": UA,
        }
    })).data;
    const $ = load(html);
    const content = $("#__RENDER_DATA__").text();
    const jsonContent = JSON.parse(decodeURIComponent(content));
    w_webid = jsonContent.access_id;
    w_webid_date = new Date();
    return w_webid;
}
async function getArtistWorks(artistItem, page, type) {
    const queryHeaders = {
        "user-agent": UA,
        accept: "*/*",
        "accept-encoding": "gzip, deflate, br, zstd",
        origin: "https://space.bilibili.com",
        "sec-fetch-site": "same-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        referer: `https://space.bilibili.com/${artistItem.id}/video`,
    };
    await getCookie();
    const now = Math.round(Date.now() / 1e3);
    const params = {
        mid: artistItem.id,
        ps: 30,
        tid: 0,
        pn: page,
        index: 0,
        special_type: "",
        web_location: "333.1387",
        order_avoided: true,
        order: "pubdate",
        keyword: "",
        platform: "web",
        dm_img_list: "[]",
        dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
        dm_cover_img_str: "QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgR1RYIDE2NTAgKDB4MDAwMDFGOTEpIERpcmVjdDNEMTEgdnNfNV8wIHBzXzVfMCwgRDNEMTEpR29vZ2xlIEluYy4gKE5WSURJQS",
        dm_img_inter: '{"ds":[],"wh":[4564,4288,68],"of":[401,802,401]}',
        wts: now.toString(),
    };
    const w_rid = await getRid(params);
    try {
        const res = (await axios_1.default.get("https://api.bilibili.com/x/space/wbi/arc/search", {
            headers: Object.assign(Object.assign({}, queryHeaders), { cookie: await getCookieString() }),
            params: Object.assign(Object.assign({}, params), { w_rid }),
        })).data;
        if (!res) {
            throw new Error("作者作品接口返回空（可能被风控412）");
        }
        if (res.code !== 0) {
            throw new Error("作者作品接口返回错误 code=" + res.code + " msg=" + (res.message || "") + "（mid=" + artistItem.id + " page=" + page + "）");
        }
        if (!res.data || !res.data.list || !res.data.list.vlist) {
            throw new Error("作者作品数据异常: " + JSON.stringify(res).slice(0, 200));
        }
        const resultData = res.data;
        const albums = resultData.list.vlist.map(formatMedia);
        return {
            isEnd: resultData.page && resultData.page.pn ? (resultData.page.pn * resultData.page.ps >= resultData.page.count) : true,
            data: albums,
        };
    } catch (error) {
        console.error("[getArtistWorks] mid=" + artistItem.id + " page=" + page + ":", error.message);
        // 返回空结果，不向上抛，避免客户端崩
        return { isEnd: true, data: [] };
    }
}
async function getMediaSource(musicItem, quality) {
    var _a, _b, _c, _d, _e, _f;
    const logTag = "[getMediaSource] " + (musicItem.bvid || musicItem.aid || "unknown");
    try {
        let cid = musicItem.cid;
        if (!cid) {
            const cidRes = await getCid(musicItem.bvid, musicItem.aid);
            if (!cidRes || !cidRes.data || !cidRes.data.cid) {
                throw new Error("获取cid失败 bvid=" + musicItem.bvid + " aid=" + musicItem.aid + "（视频可能失效或被风控）");
            }
            cid = cidRes.data.cid;
        }
        const _params = musicItem.bvid ? { bvid: musicItem.bvid } : { aid: musicItem.aid };
        if (!musicItem.bvid && !musicItem.aid) {
            throw new Error("musicItem 缺少 bvid 和 aid");
        }
        const res = (await axios_1.default.get("https://api.bilibili.com/x/player/playurl", {
            headers: headers,
            params: Object.assign(Object.assign({}, _params), { cid: cid, fnval: 16 }),
        })).data;
        if (!res) {
            throw new Error("playurl接口返回空（可能被风控）");
        }
        if (res.code !== 0) {
            throw new Error("playurl接口错误 code=" + res.code + " msg=" + (res.message || ""));
        }
        if (!res.data) {
            throw new Error("playurl返回data为空: " + JSON.stringify(res).slice(0, 200));
        }
        let url;
        if (res.data.dash && res.data.dash.audio && res.data.dash.audio.length > 0) {
            const audios = res.data.dash.audio;
            audios.sort((a, b) => a.bandwidth - b.bandwidth);
            const len = audios.length;
            switch (quality) {
                case "low": url = (_a = audios[0]) === null || _a === void 0 ? void 0 : _a.baseUrl; break;
                case "standard": url = (_b = audios[Math.min(1, len - 1)]) === null || _b === void 0 ? void 0 : _b.baseUrl; break;
                case "high": url = (_c = audios[Math.min(2, len - 1)]) === null || _c === void 0 ? void 0 : _c.baseUrl; break;
                case "super": url = (_d = audios[len - 1]) === null || _d === void 0 ? void 0 : _d.baseUrl; break;
            }
            if (!url) { url = (_e = audios[len - 1]) === null || _e === void 0 ? void 0 : _e.baseUrl; }
        } else if (res.data.durl && res.data.durl.length > 0) {
            url = res.data.durl[0].url;
        } else {
            throw new Error("playurl未返回音频流 dash/durl 均为空: " + JSON.stringify(res.data).slice(0, 200));
        }
        if (!url) {
            throw new Error("解析出的播放URL为空");
        }
        const hostUrl = url.substring(url.indexOf("/") + 2);
        const _headers = {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
            accept: "*/*",
            host: hostUrl.substring(0, hostUrl.indexOf("/")),
            "accept-encoding": "gzip, deflate, br",
            connection: "keep-alive",
            referer: "https://www.bilibili.com/video/".concat((_f = (musicItem.bvid !== null && musicItem.bvid !== undefined ? musicItem.bvid : musicItem.aid)) !== null && _f !== void 0 ? _f : ""),
        };
        return { url: url, headers: _headers };
    } catch (error) {
        console.error(logTag + ":", error.message);
        throw error;  // getMediaSource 应向上抛，让客户端知道播放失败的原因
    }
}
// 获取歌曲详情（补全播放量、简介、UP主等信息）
// 复用 getCid（它调的就是 view 接口，返回里含 stat/desc/owner 等）
// 返回 Partial<IMusicItem>，会与现有数据合并
async function getMusicInfo(musicItem) {
    const bvid = musicItem.bvid;
    const aid = musicItem.aid;
    if (!bvid && !aid) {
        return {};
    }
    try {
        const cidRes = await getCid(bvid, aid);
        const d = cidRes?.data;
        if (!d) {
            return {};
        }
        const result = {};
        // 补全标准字段
        if (d.cid) result.cid = d.cid;
        if (d.duration) result.duration = d.duration;
        if (d.title) result.title = he.decode(d.title);
        if (d.pic) {
            result.artwork = d.pic.startsWith("//") ? "https:" + d.pic : d.pic;
        }
        // UP主信息
        if (d.owner?.name) {
            result.artist = d.owner.name;
        }
        // 扩展字段：视频简介
        if (d.desc && String(d.desc).trim()) {
            result.desc = String(d.desc).trim();
        }
        // 扩展字段：统计数据
        const stat = d.stat;
        if (stat) {
            if (typeof stat.view === "number") result.playCount = stat.view;
            if (typeof stat.like === "number") result.likeCount = stat.like;
            if (typeof stat.coin === "number") result.coinCount = stat.coin;
            if (typeof stat.favorite === "number") result.favoriteCount = stat.favorite;
            if (typeof stat.danmaku === "number") result.danmakuCount = stat.danmaku;
            if (typeof stat.reply === "number") result.replyCount = stat.reply;
            if (typeof stat.share === "number") result.shareCount = stat.share;
        }
        // 扩展字段：发布日期
        if (d.pubdate) {
            result.date = dayjs.unix(d.pubdate).format("YYYY-MM-DD");
        }
        // 扩展字段：分区
        if (d.tname) {
            result.category = d.tname;
        }
        // 扩展字段：UP主头像
        if (d.owner?.face) {
            result.artistAvatar = d.owner.face;
        }
        // 扩展字段：UP主 uid
        if (d.owner?.mid) {
            result.artistId = d.owner.mid;
        }
        // 移除 undefined 字段
        Object.keys(result).forEach((key) => {
            if (result[key] === undefined) delete result[key];
        });
        return result;
    } catch (error) {
        console.error("获取歌曲详情失败:", error.message);
        return {};
    }
}
async function getTopLists() {
    await getCookie();
    const precious = {
        title: "入站必刷",
        data: [
            {
                id: "popular/precious?page_size=100&page=1",
                title: "入站必刷",
                coverImg: "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_history.png",
            },
        ],
    };
    const weekly = {
        title: "每周必看",
        data: [],
    };
    const weeklyRes = await axios_1.default.get("https://api.bilibili.com/x/web-interface/popular/series/list", {
        headers: Object.assign(Object.assign({}, headers), { cookie: await getCookieString() }),
    });
    weekly.data = weeklyRes.data.data.list.slice(0, 8).map((e) => ({
        id: `popular/series/one?number=${e.number}`,
        title: e.subject,
        description: e.name,
        coverImg: "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_weekly.png",
    }));
    const boardKeys = [
        {
            id: "ranking/v2?rid=0&type=all",
            title: "全站",
        },
        {
            id: "ranking/v2?rid=3&type=all",
            title: "音乐",
        },
        {
            id: "ranking/v2?rid=1&type=all",
            title: "动画",
        },
        {
            id: "ranking/v2?rid=119&type=all",
            title: "鬼畜",
        },
        {
            id: "ranking/v2?rid=168&type=all",
            title: "国创相关",
        },
        {
            id: "ranking/v2?rid=129&type=all",
            title: "舞蹈",
        },
        {
            id: "ranking/v2?rid=4&type=all",
            title: "游戏",
        },
        {
            id: "ranking/v2?rid=36&type=all",
            title: "知识",
        },
        {
            id: "ranking/v2?rid=188&type=all",
            title: "科技",
        },
        {
            id: "ranking/v2?rid=234&type=all",
            title: "运动",
        },
        {
            id: "ranking/v2?rid=223&type=all",
            title: "汽车",
        },
        {
            id: "ranking/v2?rid=160&type=all",
            title: "生活",
        },
        {
            id: "ranking/v2?rid=211&type=all",
            title: "美食",
        },
        {
            id: "ranking/v2?rid=217&type=all",
            title: "动物圈",
        },
        {
            id: "ranking/v2?rid=155&type=all",
            title: "时尚",
        },
        {
            id: "ranking/v2?rid=5&type=all",
            title: "娱乐",
        },
        {
            id: "ranking/v2?rid=181&type=all",
            title: "影视",
        },
        {
            id: "ranking/v2?rid=0&type=origin",
            title: "原创",
        },
        {
            id: "ranking/v2?rid=0&type=rookie",
            title: "新人",
        },
    ];
    const board = {
        title: "排行榜",
        data: boardKeys.map((_) => (Object.assign(Object.assign({}, _), { coverImg: "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_rank.png" }))),
    };
    return [weekly, precious, board];
}
async function getTopListDetail(topListItem) {
    var _a;
    await getCookie();
    try {
        const res = await axios_1.default.get(`https://api.bilibili.com/x/web-interface/${topListItem.id}`, {
            headers: Object.assign(Object.assign({}, headers), { referer: "https://www.bilibili.com/", cookie: await getCookieString() }),
        });
        if (!res.data || res.data.code !== 0 || !res.data.data) {
            throw new Error("排行榜详情接口异常 code=" + (res.data && res.data.code) + " msg=" + (res.data && res.data.message) + " id=" + topListItem.id);
        }
        const list = ((_a = res.data.data) === null || _a === void 0 ? void 0 : _a.list) || [];
        return Object.assign(Object.assign({}, topListItem), { musicList: list.map(formatMedia) });
    } catch (error) {
        console.error("[getTopListDetail] id=" + topListItem.id + ":", error.message);
        return Object.assign(Object.assign({}, topListItem), { musicList: [] });
    }
}
async function importMusicSheet(urlLike) {
    var _a, _b, _c, _d;
    let id;
    if (!id) {
        id = (_a = urlLike.match(/^\s*(\d+)\s*$/)) === null || _a === void 0 ? void 0 : _a[1];
    }
    if (!id) {
        id = (_b = urlLike.match(/^(?:.*)fid=(\d+).*$/)) === null || _b === void 0 ? void 0 : _b[1];
    }
    if (!id) {
        id = (_c = urlLike.match(/\/playlist\/pl(\d+)/i)) === null || _c === void 0 ? void 0 : _c[1];
    }
    if (!id) {
        id = (_d = urlLike.match(/\/list\/ml(\d+)/i)) === null || _d === void 0 ? void 0 : _d[1];
    }
    if (!id) {
        return;
    }
    const musicSheet = await getFavoriteList(id);
    return musicSheet.map((_) => {
        var _a, _b;
        return ({
            id: _.id,
            aid: _.aid,
            bvid: _.bvid,
            artwork: _.cover,
            title: _.title,
            artist: (_a = _.upper) === null || _a === void 0 ? void 0 : _a.name,
            album: renderAlbumTemplate({
                bvid: _.bvid,
                aid: _.aid,
                date: (_.pubdate || _.ctime || _.fav_time) ? dayjs.unix(_.pubdate || _.ctime || _.fav_time).format("YYYY-MM-DD") : "",
                duration: durationToSec(_.duration),
                durationMmSs: durationToSec(_.duration) > 0 ? secToMmSs(durationToSec(_.duration)) : "",
                artist: (_a = _.upper) === null || _a === void 0 ? void 0 : _a.name,
                title: _.title,
            }),
            duration: durationToSec(_.duration),
        });
    });
}
// ===== 评论 =====
// B站评论接口：https://api.bilibili.com/x/v2/reply/main（无需 wbi 签名）
// 采用 cursor 游标翻页（不是 pn/ps）：
//   首次请求 next=0，返回 cursor.next 作为下一页游标
//   后续请求传 next=上次返回的 cursor.next
//   cursor.is_end=true 表示最后一页
// 由于 MusicFree 的 getMusicComments(musicItem, page) 无状态（page 是数字），
// 而 B站用游标翻页，这里用模块级 Map 按 aid 缓存上次返回的 cursor.next
const commentCursorCache = new Map(); // aid -> next cursor
function formatComment(item) {
    var _a, _b, _c, _d, _e;
    return {
        id: item.rpid,
        nickName: (_a = item.member) === null || _a === void 0 ? void 0 : _a.uname,
        avatar: (_b = item.member) === null || _b === void 0 ? void 0 : _b.avatar,
        comment: (_c = item.content) === null || _c === void 0 ? void 0 : _c.message,
        like: item.like,
        createAt: item.ctime * 1000,
        location: ((_e = (_d = item.reply_control) === null || _d === void 0 ? void 0 : _d.location) === null || _e === void 0 ? void 0 : _e.startsWith("IP属地：")) ? item.reply_control.location.slice(5) : undefined
    };
}
// 获取视频简介（desc）作为评论首条
// view 接口返回的 desc 就是 UP 主写的视频简介
async function getVideoDesc(musicItem) {
    const aid = musicItem.aid;
    const bvid = musicItem.bvid;
    if (!aid && !bvid) return null;
    try {
        const cidRes = await getCid(bvid, aid);
        const desc = cidRes?.data?.desc;
        if (desc && String(desc).trim()) {
            return String(desc).trim();
        }
        return null;
    } catch (e) {
        return null;
    }
}
// 构造一条「视频简介」评论项，插在评论列表最前面
function buildDescComment(descText, musicItem) {
    if (!descText) return null;
    return {
        id: "__intro__",
        nickName: "📝 视频简介",
        comment: descText,
        avatar: musicItem.artwork || undefined,
    };
}
async function getMusicComments(musicItem, page) {
    var _a, _b;
    const aid = musicItem.aid;
    if (!aid) {
        return { isEnd: true, data: [] };
    }
    const currentPage = page || 1;
    const ps = 30;
    // 从缓存取上次的 cursor.next（首页用 0）
    const cacheKey = String(aid);
    let next = currentPage === 1 ? 0 : (commentCursorCache.get(cacheKey) || 0);
    const params = {
        type: 1,
        oid: aid,
        mode: 3,
        next: next,
        ps: ps,
        plat: 1,
        web_location: 1315875,
        wts: Math.floor(Date.now() / 1000)
    };
    try {
        const res = (await (axios_1.default.get("https://api.bilibili.com/x/v2/reply/main", {
            params: params,
            headers: Object.assign(Object.assign({}, headers), { cookie: await getCookieString(), referer: "https://www.bilibili.com/" })
        }))).data;
        let replies = [];
        let cursor = {};
        if (res.code === 0 && res.data) {
            replies = res.data.replies || [];
            cursor = res.data.cursor || {};
            console.log("[getMusicComments] aid=" + aid + " page=" + currentPage + " 成功 条数=" + replies.length + " cursor.next=" + cursor.next + " is_end=" + cursor.is_end + " all_count=" + cursor.all_count);
            // 缓存 cursor.next 供下一页使用
            if (typeof cursor.next === "number") {
                commentCursorCache.set(cacheKey, cursor.next);
            }
        } else {
            // 评论接口失败（风控/无评论等），replies 保持空，但简介仍要显示
            console.warn("[getMusicComments] aid=" + aid + " page=" + currentPage + " 接口异常 code=" + res.code + " msg=" + res.message);
        }
        const comments = [];
        for (let i = 0; i < replies.length; ++i) {
            comments[i] = formatComment(replies[i]);
            if ((_a = replies[i].replies) === null || _a === void 0 ? void 0 : _a.length) {
                comments[i].replies = (_b = replies[i]) === null || _b === void 0 ? void 0 : _b.replies.map(formatComment);
            }
        }
        // 仅在第一页插入视频简介——即使没有评论也要显示简介
        if (currentPage === 1) {
            try {
                const desc = await getVideoDesc(musicItem);
                if (desc) {
                    const descComment = buildDescComment(desc, musicItem);
                    if (descComment) {
                        comments.unshift(descComment);
                    }
                }
            } catch (e) {
                // 简介获取失败不影响评论展示
                console.error("简介插入失败:", e.message);
            }
        }
        // 判断是否最后一页：
        // - 有评论时：cursor.next > 0 且返回条数 >= ps 才认为有下一页
        // - 没评论时（只有简介）：直接 isEnd=true
        const hasMore = replies.length > 0 && (typeof cursor.next === "number" && cursor.next > 0) && replies.length >= ps;
        return {
            isEnd: !hasMore,
            data: comments
        };
    } catch (error) {
        console.error("获取评论失败:", error.message);
        return { isEnd: true, data: [] };
    }
}
// ===== 字幕作为歌词 =====
// B站字幕链路：
//   1. player/wbi/v2?aid=&cid= 带 cookie → 返回 data.subtitle.subtitles[]
//      每项: { lan, lan_doc, subtitle_url }
//   2. 请求 subtitle_url → 返回 { body: [{ from, to, content }, ...] }
//   3. 转成 LRC 格式
// 注意：AI 字幕需要登录 cookie（SESSDATA），匿名状态下 subtitles 列表通常为空

// 秒数转 LRC 时间戳 [mm:ss.xx]
function secondsToLrcTime(sec) {
    if (typeof sec !== "number" || !isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    const ss = s.toFixed(2).padStart(5, "0");
    return `${String(m).padStart(2, "0")}:${ss}`;
}

// 把 B站字幕 body 转成 LRC 文本
function subtitleBodyToLrc(body) {
    if (!Array.isArray(body) || body.length === 0) return "";
    const lines = body.map((item) => {
        const from = typeof item.from === "number" ? item.from : parseFloat(item.from);
        const content = item.content || "";
        return `[${secondsToLrcTime(from)}]${content}`;
    });
    return lines.join("\n");
}

async function getLyric(musicItem) {
    // 没有登录 cookie 时，字幕列表基本拿不到，直接返回空（避免无谓请求）
    if (!isLoggedIn()) {
        console.warn("[getLyric] 未登录，跳过字幕获取 bvid=" + musicItem.bvid + " aid=" + musicItem.aid);
        return {};
    }
    console.log("[getLyric] 开始获取字幕 bvid=" + musicItem.bvid + " aid=" + musicItem.aid + " cid=" + musicItem.cid);
    try {
        // 拿 cid（搜索结果可能没带 cid）
        let cid = musicItem.cid;
        const bvid = musicItem.bvid;
        const aid = musicItem.aid;
        if (!cid) {
            const cidRes = await getCid(bvid, aid);
            cid = cidRes?.data?.cid;
        }
        if (!cid || (!aid && !bvid)) {
            return {};
        }
        const referer = bvid ? `https://www.bilibili.com/video/${bvid}` : "https://www.bilibili.com/";
        // 请求 player/wbi/v2 拿字幕列表
        const playerRes = (await axios_1.default.get("https://api.bilibili.com/x/player/wbi/v2", {
            params: aid ? { aid, cid } : { bvid, cid },
            headers: Object.assign(Object.assign({}, headers), { cookie: await getCookieString(), referer }),
        })).data;
        if (playerRes.code !== 0 || !playerRes.data || !playerRes.data.subtitle) {
            console.warn("[getLyric] player/wbi/v2 失败 bvid=" + bvid + " aid=" + aid + " cid=" + cid + " code=" + (playerRes && playerRes.code) + " msg=" + (playerRes && playerRes.message) + "（可能未登录或被风控）");
            return {};
        }
        const subtitles = playerRes.data.subtitle.subtitles || [];
        console.log("[getLyric] bvid=" + bvid + " aid=" + aid + " 字幕列表条数=" + subtitles.length + (subtitles.length > 0 ? " 语言=" + subtitles.map(s=>s.lan).join(",") : "（无字幕）"));
        if (subtitles.length === 0) {
            return {};
        }
        // 找中文字幕（lan 含 zh 或 cn）
        const zhSub = subtitles.find((s) => /zh|cn/i.test(s.lan || ""));
        // 找英文字幕（lan 含 en）
        const enSub = subtitles.find((s) => /en/i.test(s.lan || ""));
        console.log("[getLyric] 选中: zhSub=" + (zhSub ? zhSub.lan : "无") + " enSub=" + (enSub ? enSub.lan : "无"));
        
        // 下载字幕 JSON 的辅助函数
        async function fetchSubtitleBody(sub) {
            if (!sub || !sub.subtitle_url) return null;
            let u = sub.subtitle_url;
            if (u.startsWith("//")) u = "https:" + u;
            if (!u.startsWith("http")) u = "https://" + u;
            const r = (await axios_1.default.get(u, { headers: { "User-Agent": UA, referer } })).data;
            return Array.isArray(r.body) ? r.body : null;
        }
        
        const zhBody = zhSub ? await fetchSubtitleBody(zhSub) : null;
        const enBody = enSub ? await fetchSubtitleBody(enSub) : null;
        console.log("[getLyric] 字幕下载: zhBody条数=" + (zhBody ? zhBody.length : 0) + " enBody条数=" + (enBody ? enBody.length : 0));
        
        // 都没有就报错返回空
        if (!zhBody && !enBody) {
            console.warn("[getLyric] 字幕内容为空，返回{}");
            return {};
        }
        
        const result = {};
        // 中文字幕作为主歌词
        if (zhBody) {
            const lrc = subtitleBodyToLrc(zhBody);
            if (lrc) result.rawLrc = lrc;
        }
        // 英文字幕作为翻译歌词（MusicFree 客户端会自动双语展示）
        if (enBody) {
            const translation = subtitleBodyToLrc(enBody);
            if (translation) result.translation = translation;
        }
        
        // 如果中英都没有，但有其它单条字幕，降级用第一条
        if (!result.rawLrc && !result.translation) {
            const picked = subtitles[0];
            const body = await fetchSubtitleBody(picked);
            if (body && body.length) {
                result.rawLrc = subtitleBodyToLrc(body);
            }
        }
        
        if (!result.rawLrc && !result.translation) {
            return {};
        }
        return result;
    } catch (error) {
        console.error("获取字幕失败:", error.message);
        return {};
    }
}
module.exports = {
    platform: "bilibili",
    appVersion: ">=0.0",
    version: "0.5.6",
    author: "猫头猫 (cookie+字幕扩展)",
    cacheControl: "no-cache",
    srcUrl: "https://cdn.jsdelivr.net/gh/martin65536/bilibili-musicfree@main/bilibili.js",
    description: "在 MusicFree 搜索/播放 B站视频音频。基于 maotoumao 版本扩展，新增：登录Cookie支持、AI字幕作为歌词(双语)、评论分页与视频简介、播放量/点赞等统计字段、专辑名模板。\n\n【功能】\n• 搜索视频/UP主，播放视频音频流\n• 排行榜(全站/音乐/游戏等分区)、每周必看、入站必刷\n• 导入收藏夹为歌单\n• 获取评论(无限滚动)，首条自动显示视频简介\n• 获取AI字幕作为歌词，支持中英双语(rawLrc中文+translation英文)\n• 搜索结果自带播放量/点赞/收藏/弹幕/评论数\n• 专辑名可自定义模板(占位符: {bvid} {date} {playCount} {likeCount} {durationMmSs} {artist} {category} 等)\n\n【配置项(插件设置)】\n• B站登录Cookie(可选)：填了才能获取AI字幕、导入私有收藏夹、评论完整分页。不填则匿名使用(功能受限)。\n  获取方法：浏览器登录bilibili→F12→Network→点任一api.bilibili.com请求→Request Headers→复制cookie整行值(含SESSDATA)。\n• 专辑名模板(可选)：自定义专辑名格式。不填默认只显示BV号。例：填 {bvid} ({date}) 显示 BV1sb411t7ps (2022-08-18)。\n\n【注意】\n• AI字幕需登录Cookie且视频本身开启AI字幕，不是所有视频都有。\n• 评论完整分页需登录Cookie，匿名只能看少量热门评论。\n• 投币数搜索接口不返回，播放时通过getMusicInfo补全。",
    primaryKey: ["id", "aid", "bvid", "cid"],
    userVariables: [
        {
            key: "cookie",
            name: "B站登录Cookie",
            hint: "可选。在浏览器登录bilibili后，F12→Network→任一请求→Cookie，复制完整值（含SESSDATA）。填了才能获取AI字幕、导入私有收藏夹等。不填则匿名使用。"
        },
        {
            key: "albumTemplate",
            name: "专辑名模板",
            hint: "可选。自定义专辑名格式。占位符：{bvid} {aid} {date} {duration} {durationMmSs} {artist} {title} {playCount} {likeCount} {coinCount} {favoriteCount} {danmakuCount} {replyCount} {shareCount} {category}。默认不填只返回BV号。例：{bvid} ({date}) 显示 BV1sb411t7ps (2019-03-26)；{bvid} 播{playCount} 显示 BV1sb411t7ps 播1331.8万。"
        }
    ],
    hints: {
        importMusicSheet: [
            "bilibili 移动端：APP点击我的，空间，右上角分享，复制链接，浏览器打开切换桌面版网站，点击播放全部视频，复制链接",
            "bilibili H5/PC端：复制收藏夹URL，或者直接输入ID即可",
            "非公开收藏夹无法导入，编辑收藏夹改为公开即可（或在插件设置填登录Cookie后可导入私有）",
            "导入时间和歌单大小有关，请耐心等待",
            "获取字幕需在插件设置填登录Cookie（含SESSDATA），匿名无法获取AI字幕",
        ],
    },
    supportedSearchType: ["music", "album", "artist"],
    async search(keyword, page, type) {
        if (type === "album" || type === "music") {
            return await searchAlbum(keyword, page);
        }
        if (type === "artist") {
            return await searchArtist(keyword, page);
        }
    },
    getMediaSource,
    async getAlbumInfo(albumItem) {
        var _a;
        const cidRes = await getCid(albumItem.bvid, albumItem.aid);
        const _ref2 = (_a = cidRes === null || cidRes === void 0 ? void 0 : cidRes.data) !== null && _a !== void 0 ? _a : {};
        const cid = _ref2.cid;
        const pages = _ref2.pages;
        let musicList;
        if (pages.length === 1) {
            musicList = [Object.assign(Object.assign({}, albumItem), { cid: cid })];
        }
        else {
            musicList = pages.map(function (_) {
                return Object.assign(Object.assign({}, albumItem), { cid: _.cid, title: _.part, duration: durationToSec(_.duration), id: _.cid });
            });
        }
        return {
            musicList,
        };
    },
    getArtistWorks,
    getTopLists,
    getTopListDetail,
    importMusicSheet,
    getMusicComments,
    getLyric,
    getMusicInfo
};
