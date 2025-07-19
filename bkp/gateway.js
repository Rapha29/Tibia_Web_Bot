const express = require('express');
const httpProxy = require('http-proxy');
const vhost = require('vhost');

const app = express();
const proxy = httpProxy.createProxyServer({});

const makeProxy = (target) => (req, res) => {
    proxy.web(req, res, { target }, (err) => {
        res.status(502).send('Erro ao conectar ao bot.');
    });
};

app.use(vhost('issobra.newcorporation.com.br', makeProxy('http://localhost:3001')));
app.use(vhost('etebra.jowbot.com.br', makeProxy('http://localhost:3002')));
app.use(vhost('yubra.jowbot.com.br', makeProxy('http://localhost:3003')));
app.use(vhost('ustebra.jowbot.com.br', makeProxy('http://localhost:3004')));
app.use(vhost('luzibra.jowbot.com.br', makeProxy('http://localhost:3005')));

app.use(vhost('localhost', makeProxy('http://localhost:3001')));
app.use(vhost('127.0.0.1', makeProxy('http://localhost:3001')));

app.listen(80, () => {
    console.log('Gateway rodando na porta 80');
});
