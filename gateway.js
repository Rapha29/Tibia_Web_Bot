const express = require('express');
const httpProxy = require('http-proxy');
const http = require('http');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ======================
// CONFIGURAÇÕES
// ======================
const OFFLINE_TIMEOUT = 30 * 1000; // 30 segundos

// ======================
// ROTAS DE PROXY
// ======================
const routes = {
    'issobra.jowbot.com.br': 'http://localhost:3001',
    'etebra.jowbot.com.br': 'http://localhost:3000',
    'yubra.jowbot.com.br': 'http://localhost:3003',
    'luzibra.jowbot.com.br': 'http://localhost:3005',
    'ustebra.jowbot.com.br': 'http://localhost:3004',
    'issobra.jowtibia.com.br': 'http://localhost:3001',
    'etebra.jowtibia.com.br': 'http://localhost:3000',
    'yubra.jowtibia.com.br': 'http://localhost:3003',
    'luzibra.jowtibia.com.br': 'http://localhost:3005',
    'ustebra.jowtibia.com.br': 'http://localhost:3004',
    'bkhealth.claimed.com.br': 'http://localhost:5000',
    'ironalliance.com.br': 'http://localhost:3006'
};

// ======================
// SITES ESTÁTICOS
// ======================
const staticSites = {
    'npeletrica.com.br': '/home/npeletrica/index.html',
    'www.npeletrica.com.br': '/home/npeletrica/index.html',
    'fcmixconcreto.com.br': '/home/fcmix/index.html',
    'www.fcmixconcreto.com.br': '/home/fcmix/index.html',
};

// ======================
// HELPERS
// ======================
function normalizeHost(req) {
    return req.headers.host
        ?.split(':')[0]
        ?.toLowerCase()
        ?.replace(/\.$/, '');
}

// ======================
// PROXIES E STATUS
// ======================
const proxies = {};
const serverStatus = {};

for (const host of Object.keys(routes)) {
    const proxy = httpProxy.createProxyServer({
        ws: true,
        changeOrigin: true
    });

    proxy.on('error', (err, req, res) => {
        console.error(`[PROXY ERRO] ${host}: ${err.message}`);

        serverStatus[host] = {
            online: false,
            lastCheck: Date.now()
        };

        if (res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Erro: O backend está indisponível.');
        } else if (res?.destroy) {
            res.destroy();
        }
    });

    proxies[host] = proxy;
    serverStatus[host] = { online: true, lastCheck: 0 };
}

// ======================
// MIDDLEWARE – SITES ESTÁTICOS
// ======================
app.use((req, res, next) => {
    const hostname = normalizeHost(req);

    if (staticSites[hostname]) {
        const staticFilePath = staticSites[hostname];
        const staticDir = path.dirname(staticFilePath);

        if (req.path === '/' || req.path === '/index.html') {
            return res.sendFile(staticFilePath);
        }

        return express.static(staticDir)(req, res, next);
    }

    next();
});

// ======================
// MIDDLEWARE PRINCIPAL – PROXY HTTP
// ======================
app.use((req, res) => {
    const hostname = normalizeHost(req);

    if (!routes[hostname]) {
        console.warn(`[PROXY] Host sem rota configurada: ${hostname}`);
        return res.status(404).send('Host não configurado no gateway.');
    }

    const target = routes[hostname];
    const proxy = proxies[hostname];
    const status = serverStatus[hostname];

    if (!proxy || !target) {
        console.error(`[PROXY] Configuração inválida para: ${hostname}`);
        return res.status(500).send('Erro interno do gateway.');
    }

    if (status && !status.online) {
        const now = Date.now();
        if (now - status.lastCheck < OFFLINE_TIMEOUT) {
            console.log(`[PROXY] ${hostname} bloqueado (cooldown).`);
            return res.status(503).send('Serviço temporariamente indisponível.');
        } else {
            console.log(`[PROXY] ${hostname} saindo do cooldown.`);
            serverStatus[hostname].online = true;
        }
    }

    proxy.web(req, res, { target });
});

// ======================
// SERVIDOR HTTP
// ======================
const server = http.createServer(app);

// ======================
// WEBSOCKET
// ======================
server.on('upgrade', (req, socket, head) => {
    const hostname = normalizeHost(req);

    if (!routes[hostname]) {
        console.warn(`[WS] Host sem rota configurada: ${hostname}`);
        return socket.destroy();
    }

    const target = routes[hostname];
    const proxy = proxies[hostname];
    const status = serverStatus[hostname];

    if (!proxy || !target) {
        return socket.destroy();
    }

    if (status && !status.online) {
        const now = Date.now();
        if (now - status.lastCheck < OFFLINE_TIMEOUT) {
            console.log(`[WS] ${hostname} bloqueado (cooldown).`);
            return socket.destroy();
        } else {
            console.log(`[WS] ${hostname} saindo do cooldown.`);
            serverStatus[hostname].online = true;
        }
    }

    proxy.ws(req, socket, head, { target });
});

// ======================
// START
// ======================
const PORT = 80;
server.listen(PORT, () => {
    console.log(`🔁 Gateway iniciado na porta ${PORT}`);
});
