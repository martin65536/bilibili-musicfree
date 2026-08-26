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
        return (v && v.cookie && String(v.cookie).trim()) || "";
    } catch (e) {
        return "";
    }
}
// 拼接最终请求用的 cookie 字符串：用户 cookie 优先，匿名 buvid 作为补充
// 如果用户填了 cookie，直接用用户的（里面通常已含 buvid3/buvid4/SESSDATA 等）
// 否则降级用匿名 buvid3/buvid4
async function getCookieString() {
    const userCookie = getUserCookie();
    if (userCookie) {
        return userCookie;
    }
    await getCookie();
    if (!cookie) return "";
    return `buvid3=${cookie.b_3};buvid4=${cookie.b_4}`;
}
// 判断当前是否处于登录状态（用于决定是否尝试拉取字幕）
function isLoggedIn() {
    const c = getUserCookie();
    return /SESSDATA=/.test(c);
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
    const res = (await axios_1.default.get("https://api.bilibili.com/x/web-interface/search/type", {
        headers: Object.assign(Object.assign({}, searchHeaders), { cookie: await getCookieString() }),
        params,
    })).data;
    return res.data;
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
    return {
        id: (_d = (_c = result.cid) !== null && _c !== void 0 ? _c : result.bvid) !== null && _d !== void 0 ? _d : result.aid,
        aid: result.aid,
        bvid: result.bvid,
        artist: (_e = result.author) !== null && _e !== void 0 ? _e : (_f = result.owner) === null || _f === void 0 ? void 0 : _f.name,
        title,
        alias: (_g = title.match(/《(.+?)》/)) === null || _g === void 0 ? void 0 : _g[1],
        album: (_h = result.bvid) !== null && _h !== void 0 ? _h : result.aid,
        artwork: ((_j = result.pic) === null || _j === void 0 ? void 0 : _j.startsWith("//"))
            ? "http:".concat(result.pic)
            : result.pic,
        duration: durationToSec(result.duration),
        tags: (_k = result.tag) === null || _k === void 0 ? void 0 : _k.split(","),
        date: dayjs.unix(result.pubdate || result.created).format("YYYY-MM-DD"),
    };
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
        web_location: 1550101,
        order_avoided: true,
        order: "pubdate",
        keyword: "",
        platform: "web",
        dm_img_list: "[]",
        dm_img_str: "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
        dm_cover_img_str: "QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgR1RYIDE2NTAgKDB4MDAwMDFGOTEpIERpcmVjdDNEMTEgdnNfNV8wIHBzXzVfMCwgRDNEMTEpR29vZ2xlIEluYy4gKE5WSURJQS",
        dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
        wts: now.toString(),
    };
    const w_rid = await getRid(params);
    const res = (await axios_1.default.get("https://api.bilibili.com/x/space/wbi/arc/search", {
        headers: Object.assign(Object.assign({}, queryHeaders), { cookie: await getCookieString() }),
        params: Object.assign(Object.assign({}, params), { w_rid }),
    })).data;
    const resultData = res.data;
    const albums = resultData.list.vlist.map(formatMedia);
    return {
        isEnd: resultData.page.pn * resultData.page.ps >= resultData.page.count,
        data: albums,
    };
}
async function getMediaSource(musicItem, quality) {
    var _a, _b, _c, _d, _e, _f;
    let cid = musicItem.cid;
    if (!cid) {
        cid = (await getCid(musicItem.bvid, musicItem.aid)).data.cid;
    }
    const _params = musicItem.bvid
        ? {
            bvid: musicItem.bvid,
        }
        : {
            aid: musicItem.aid,
        };
    const res = (await axios_1.default.get("https://api.bilibili.com/x/player/playurl", {
        headers: headers,
        params: Object.assign(Object.assign({}, _params), { cid: cid, fnval: 16 }),
    })).data;
    let url;
    if (res.data.dash) {
        const audios = res.data.dash.audio;
        audios.sort((a, b) => a.bandwidth - b.bandwidth);
        const len = audios.length;
        switch (quality) {
            case "low":
                url = (_a = audios[0]) === null || _a === void 0 ? void 0 : _a.baseUrl;
                break;
            case "standard":
                url = (_b = audios[Math.min(1, len - 1)]) === null || _b === void 0 ? void 0 : _b.baseUrl;
                break;
            case "high":
                url = (_c = audios[Math.min(2, len - 1)]) === null || _c === void 0 ? void 0 : _c.baseUrl;
                break;
            case "super":
                url = (_d = audios[len - 1]) === null || _d === void 0 ? void 0 : _d.baseUrl;
                break;
        }
        if (!url) {
            url = (_e = audios[len - 1]) === null || _e === void 0 ? void 0 : _e.baseUrl;
        }
    }
    else {
        url = res.data.durl[0].url;
    }
    const hostUrl = url.substring(url.indexOf("/") + 2);
    const _headers = {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36 Edg/89.0.774.63",
        accept: "*/*",
        host: hostUrl.substring(0, hostUrl.indexOf("/")),
        "accept-encoding": "gzip, deflate, br",
        connection: "keep-alive",
        referer: "https://www.bilibili.com/video/".concat((_f = (musicItem.bvid !== null && musicItem.bvid !== undefined
            ? musicItem.bvid
            : musicItem.aid)) !== null && _f !== void 0 ? _f : ""),
    };
    return {
        url: url,
        headers: _headers,
    };
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
    const res = await axios_1.default.get(`https://api.bilibili.com/x/web-interface/${topListItem.id}`, {
        headers: Object.assign(Object.assign({}, headers), { referer: "https://www.bilibili.com/", cookie: await getCookieString() }),
    });
    return Object.assign(Object.assign({}, topListItem), { musicList: (((_a = res.data.data) === null || _a === void 0 ? void 0 : _a.list) || []).map(formatMedia) });
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
            album: (_b = _.bvid) !== null && _b !== void 0 ? _b : _.aid,
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
            // 缓存 cursor.next 供下一页使用
            if (typeof cursor.next === "number") {
                commentCursorCache.set(cacheKey, cursor.next);
            }
        } else {
            // 评论接口失败（风控/无评论等），replies 保持空，但简介仍要显示
            console.warn("评论接口返回异常:", res.code, res.message);
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
        return {};
    }
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
        if (playerRes.code !== 0 || !playerRes.data?.subtitle) {
            return {};
        }
        const subtitles = playerRes.data.subtitle.subtitles || [];
        if (subtitles.length === 0) {
            return {};
        }
        // 找中文字幕（lan 含 zh 或 cn）
        const zhSub = subtitles.find((s) => /zh|cn/i.test(s.lan || ""));
        // 找英文字幕（lan 含 en）
        const enSub = subtitles.find((s) => /en/i.test(s.lan || ""));
        
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
        
        // 都没有就报错返回空
        if (!zhBody && !enBody) {
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
    version: "0.4.5",
    author: "猫头猫 (cookie+字幕扩展)",
    cacheControl: "no-cache",
    srcUrl: "https://raw.githubusercontent.com/martin65536/bilibili-musicfree/main/bilibili.js",
    primaryKey: ["id", "aid", "bvid", "cid"],
    userVariables: [
        {
            key: "cookie",
            name: "B站登录Cookie",
            hint: "可选。在浏览器登录bilibili后，F12→Network→任一请求→Cookie，复制完整值（含SESSDATA）。填了才能获取AI字幕、导入私有收藏夹等。不填则匿名使用。"
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
    getLyric
};
