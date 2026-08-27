"use strict";
// ===== B站 MusicFree 代理壳插件 v2 =====
// 极简壳：所有业务逻辑在 Termux 服务端，插件只发 GET 请求
// 配置 proxyUrl 指向服务端（如 http://localhost:3000）

// 通过代理服务端请求
async function proxy(path, params) {
    const base = (env.getUserVariables().proxyUrl || '').replace(/\/$/, '');
    if (!base) throw new Error('未配置proxyUrl，请在插件设置填Termux服务端地址(如http://localhost:3000)');
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const url = base + path + '?' + qs.toString();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('代理请求失败 ' + resp.status);
    return await resp.json();
}

module.exports = {
    platform: "bilibili-proxy",
    version: "0.7.2",
    author: "猫头猫 (代理壳版)",
    cacheControl: "no-cache",
    srcUrl: "https://cdn.jsdelivr.net/gh/martin65536/bilibili-musicfree@main/bilibili-proxy.js",
    description: "B站插件(代理壳版)。需配合Termux服务端使用。Cookie在服务端控制台设置，不用填插件里。\n\n【使用步骤】\n1. Termux安装Node.js：pkg install nodejs\n2. 下载server.js：curl -O https://raw.githubusercontent.com/martin65536/bilibili-musicfree/main/bili-proxy/server.js\n3. 安装依赖：npm install dayjs he crypto-js\n4. 运行：node server.js\n5. 在服务端控制台菜单选1设置B站Cookie（字幕/评论分页需要）\n6. MusicFree装本插件，设置proxyUrl=http://localhost:3000\n\n【配置项】\n• proxyUrl(必填)：Termux服务端地址，如 http://localhost:3000\n• Cookie：在服务端控制台设置，不用填插件\n\n【服务端调试】\n在服务端控制台按回车显示菜单，选4开关调试输出（打印所有B站响应）",
    primaryKey: ["id", "aid", "bvid", "cid"],
    userVariables: [
        { key: "proxyUrl", name: "代理服务端地址", hint: "必填。Termux运行server.js后的地址，如 http://localhost:3000" }
    ],
    supportedSearchType: ["music", "album", "artist"],
    hints: {
        importMusicSheet: ["输入收藏夹ID或URL", "需登录Cookie才能导入私有收藏夹"],
    },

    async search(keyword, page, type) {
        return proxy('/search', { keyword, page, type });
    },
    async getMediaSource(musicItem, quality) {
        return proxy('/mediaSource', { bvid: musicItem.bvid, aid: musicItem.aid, cid: musicItem.cid, quality });
    },
    async getAlbumInfo(albumItem) {
        const r = await proxy('/albumInfo', { bvid: albumItem.bvid, aid: albumItem.aid });
        // 合并父级 albumItem 的字段（包括 platform，MusicFree 自动注入的）
        const musicList = (r.musicList || []).map(m => Object.assign({}, albumItem, m));
        return { musicList };
    },
    async getArtistWorks(artistItem, page) {
        return proxy('/artistWorks', { mid: artistItem.id, page });
    },
    async getTopLists() {
        return proxy('/topLists');
    },
    async getTopListDetail(topListItem) {
        const r = await proxy('/topListDetail', { id: topListItem.id });
        return Object.assign(topListItem, { musicList: r.musicList || [] });
    },
    async importMusicSheet(urlLike) {
        let id = (urlLike.match(/^\s*(\d+)\s*$/) || [])[1]
              || (urlLike.match(/fid=(\d+)/) || [])[1]
              || (urlLike.match(/\/playlist\/pl(\d+)/i) || [])[1]
              || (urlLike.match(/\/list\/ml(\d+)/i) || [])[1];
        if (!id) return;
        return proxy('/importSheet', { id });
    },
    async getMusicComments(musicItem, page) {
        return proxy('/comments', { aid: musicItem.aid, bvid: musicItem.bvid, page });
    },
    async getLyric(musicItem) {
        return proxy('/lyric', { bvid: musicItem.bvid, aid: musicItem.aid, cid: musicItem.cid });
    },
    async getMusicInfo(musicItem) {
        return proxy('/musicInfo', { bvid: musicItem.bvid, aid: musicItem.aid });
    },
};
