const express = require('express');
const httpProxy = require('http-proxy');
const http = require('http');

const app = express();

app.use(express.json({ limit: '1mb' }));

const routes = {
    'issobra.newcorporation.com.br': 'http://localhost:3001',
    'etebra.jowbot.com.br': 'http://localhost:3000',
    'yubra.jowbot.com.br': 'http://localhost:3003',
    'ustebra.jowbot.com.br': 'http://localhost:3004',
    'luzibra.jowbot.com.br': 'http://localhost:3005',
    'bkhealth.claimed.com.br': 'http://localhost:8080',
    'localhost': 'http://localhost:3001',
    '127.0.0.1': 'http://localhost:3001'
};

const proxies = {};
const serverStatus = {}; // Guarda estado do servidor: { online: boolean, lastCheck: timestamp }

const OFFLINE_TIMEOUT = 30 * 1000; // 30 segundos

for (const host in routes) {
    const proxy = httpProxy.createProxyServer({ ws: true });

    proxy.on('error', (err, req, res) => {
        const hostname = req?.headers?.host || host;
        console.error(`[PROXY ERRO] ${hostname}:`, err.message);

        // Marca servidor como offline e salva timestamp
        serverStatus[hostname] = {
            online: false,
            lastCheck: Date.now()
        };

        if (res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Erro ao conectar ao backend.');
        }
    });

    proxies[host] = proxy;

    // Inicialmente, consideramos o servidor online
    serverStatus[host] = { online: true, lastCheck: 0 };
}

app.use((req, res) => {
    let hostname = req.headers.host;
    if (hostname && hostname.includes(':')) {
        hostname = hostname.split(':')[0];
    }

    const target = routes[hostname];
    const proxy = proxies[hostname];
    const status = serverStatus[hostname];

    if (!target || !proxy) {
        console.warn(`[PROXY] Host não reconhecido: ${hostname}`);
        return res.status(404).send('Host não encontrado');
    }

    // Se servidor marcado como offline, só tenta proxy se já passou o timeout
    if (!status.online) {
        const now = Date.now();
        if (now - status.lastCheck < OFFLINE_TIMEOUT) {
            // Ainda está dentro do tempo de espera: responde erro rápido
            console.log(`[PROXY] ${hostname} está offline. Ignorando tentativa até 30s.`);
            return res.status(502).send('Backend offline temporariamente.');
        } else {
            // Timeout expirou, tentaremos de novo e atualizamos lastCheck para evitar múltiplas tentativas
            serverStatus[hostname].lastCheck = now;
            console.log(`[PROXY] Tentando reconectar ao backend ${hostname} após timeout.`);
        }
    }

    // Tenta proxy
    proxy.web(req, res, { target }, (e) => {
        // Se der erro no proxy (não capturado pelo proxy.on('error')) pode colocar aqui, se quiser
    });
});

// WebSocket upgrade handler - não altera, mas podemos aplicar mesma lógica offline
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
    let hostname = req.headers.host;
    if (hostname && hostname.includes(':')) {
        hostname = hostname.split(':')[0];
    }

    const target = routes[hostname];
    const proxy = proxies[hostname];
    const status = serverStatus[hostname];

    if (!target || !proxy) {
        console.warn(`[WS] Host não encontrado para WebSocket: ${hostname}`);
        return socket.destroy();
    }

    if (!status.online) {
        const now = Date.now();
        if (now - status.lastCheck < OFFLINE_TIMEOUT) {
            console.log(`[WS] ${hostname} está offline. Fechando conexão WebSocket.`);
            return socket.destroy();
        } else {
            serverStatus[hostname].lastCheck = now;
            console.log(`[WS] Tentando reconectar WebSocket para ${hostname} após timeout.`);
        }
    }

    proxy.ws(req, socket, head, { target });
});

// Log de uso de memória
setInterval(() => {
    const used = process.memoryUsage();
    console.log(`[MEMÓRIA] RSS: ${(used.rss / 1024 / 1024).toFixed(2)} MB`);
}, 60000);

if (global.gc) {
    setInterval(() => {
        global.gc();
        console.log('[GC] Coleta de lixo forçada');
    }, 300000);
}

const PORT = 80;
server.listen(PORT, () => {
    console.log(`🔁 Gateway rodando na porta ${PORT}`);
});
