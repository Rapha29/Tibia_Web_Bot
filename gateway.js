const express = require('express');
const httpProxy = require('http-proxy');
const http = require('http');

const app = express();
app.use(express.json({ limit: '1mb' }));

const routes = {
    'issobra.newcorporation.com.br': 'http://localhost:3001',
    'newcorporation.com.br': 'http://localhost:3001',
    'etebra.jowbot.com.br': 'http://localhost:3000',
    'yubra.jowbot.com.br': 'http://localhost:3003',
    'ustebra.jowbot.com.br': 'http://localhost:3004',
    'luzibra.jowbot.com.br': 'http://localhost:3005',
    'bkhealth.claimed.com.br': 'http://localhost:5000',
    'localhost': 'http://localhost:3001',
    '127.0.0.1': 'http://localhost:3001'
};

const proxies = {};
const serverStatus = {};
const OFFLINE_TIMEOUT = 30 * 1000; // 30s cooldown

for (const host in routes) {
    const proxy = httpProxy.createProxyServer({ ws: true });

    proxy.on('error', (err, req, res) => {
        const hostname = req?.headers?.host?.split(':')[0] || host;
        console.error(`[PROXY ERRO] ${hostname}:`, err.message);

        serverStatus[hostname] = {
            online: false,
            lastCheck: Date.now()
        };

        if (res && res.writeHead && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Erro: O backend está indisponível.');
        } else if (res?.destroy) {
            res.destroy();
        }
    });

    proxies[host] = proxy;
    serverStatus[host] = { online: true, lastCheck: 0 };
}

// Middleware principal
app.use((req, res) => {
    let hostname = req.headers.host?.split(':')[0];
    const target = routes[hostname];
    const proxy = proxies[hostname];
    const status = serverStatus[hostname];

    if (!target || !proxy) {
        console.warn(`[PROXY] Host desconhecido: ${hostname}`);
        return res.status(404).send('Host não encontrado');
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

// WebSocket (upgrade)
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
    let hostname = req.headers.host?.split(':')[0];
    const target = routes[hostname];
    const proxy = proxies[hostname];
    const status = serverStatus[hostname];

    if (!target || !proxy) {
        console.warn(`[WS] Host desconhecido: ${hostname}`);
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

// Inicia o servidor na porta 80
const PORT = 80;
server.listen(PORT, () => {
    console.log(`🔁 Gateway iniciado na porta ${PORT} com circuit breaker de 30s.`);
});
