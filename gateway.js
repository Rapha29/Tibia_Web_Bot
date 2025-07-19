const express = require('express');
const httpProxy = require('http-proxy');
const vhost = require('vhost');
const http = require('http');

const app = express();
const proxy = httpProxy.createProxyServer({
    // Opção para lidar com WebSockets (essencial para o Socket.IO)
    ws: true, 
});

proxy.on('error', (err, req, res) => {
    console.error(`Erro no proxy:`, err.message);
    if (res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Erro de conexão com o serviço de backend.');
    }
});

// Lista de domínios e portas de destino
const routes = {
    'issobra.newcorporation.com.br': 'http://localhost:3001',
    'etebra.jowbot.com.br': 'http://localhost:3000',
    'yubra.jowbot.com.br': 'http://localhost:3003',
    'ustebra.jowbot.com.br': 'http://localhost:3004',
    'luzibra.jowbot.com.br': 'http://localhost:3005',
    'localhost': 'http://localhost:3001',
    '127.0.0.1': 'http://localhost:3001'
};

// Middleware que encaminha a requisição para o destino correto
app.use((req, res) => {
    const target = routes[req.headers.host];
    if (target) {
        // http-proxy automaticamente adiciona os headers X-Forwarded-For, etc.
        proxy.web(req, res, { target });
    } else {
        res.status(404).send('Host não encontrado');
    }
});

const server = http.createServer(app);

// Handler para o upgrade de WebSocket
server.on('upgrade', (req, socket, head) => {
    const target = routes[req.headers.host];
    if (target) {
        proxy.ws(req, socket, head, { target });
    } else {
        socket.destroy();
    }
});

const PORT = 80;
server.listen(PORT, () => {
    console.log(`Gateway rodando na porta ${PORT}`);
});