// ===== B站 MusicFree 代理服务端 =====
// 运行在 Termux (Node.js) 里，为 MusicFree 壳插件提供 B站 API 代理
// 用法：node server.js
// 端口默认 3000，可通过 PORT 环境变量修改
//
// 原理：MusicFree 沙箱网络受限，Termux 里 Node.js 的 fetch 无限制
// 壳插件把请求转发到这里，服务端代为请求 B站并返回数据

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// 请求 B站接口（Node.js fetch 无限制）
async function fetchBili(url, options) {
    const opts = options || {};
    const headers = Object.assign({
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
    }, opts.headers || {});
    // Node 18+ 支持全局 fetch
    const resp = await fetch(url, { headers, method: opts.method || 'GET' });
    const text = await resp.text();
    return { status: resp.status, body: text };
}

const server = http.createServer(async (req, res) => {
    // CORS 头（允许 MusicFree 访问）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsedUrl = new URL(req.url, 'http://localhost:' + PORT);
    const pathname = parsedUrl.pathname;

    // 健康检查
    if (pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'bili-proxy', time: Date.now() }));
        return;
    }

    // 代理接口：GET /proxy?url=<bilibili_url>&cookie=<cookie>
    if (pathname === '/proxy') {
        const targetUrl = parsedUrl.searchParams.get('url');
        const cookie = parsedUrl.searchParams.get('cookie') || '';
        const referer = parsedUrl.searchParams.get('referer') || 'https://www.bilibili.com/';
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'missing url param' }));
            return;
        }
        try {
            const r = await fetchBili(targetUrl, {
                headers: { cookie: cookie, referer: referer }
            });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(r.body);
        } catch (e) {
            console.error('[proxy error]', e.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found, use /ping or /proxy?url=...' }));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('===== B站 MusicFree 代理服务端 =====');
    console.log('监听: http://localhost:' + PORT);
    console.log('健康检查: http://localhost:' + PORT + '/ping');
    console.log('代理接口: http://localhost:' + PORT + '/proxy?url=<bilibili_api_url>&cookie=<cookie>');
    console.log('按 Ctrl+C 停止');
});
