const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const vhost = require('vhost');
const bot = require('./bot_logic.js');

const app = express();

const botApp = express();
botApp.use(express.static(__dirname));
botApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const etebraApp = express();
etebraApp.use(express.static(path.join(__dirname, 'Etebra')));
etebraApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Etebra", "index.html"));
});

const yubraApp = express();
yubraApp.use(express.static(path.join(__dirname, 'Yubra')));
yubraApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Yubra", "index.html"));
});

const ustebraApp = express();
ustebraApp.use(express.static(path.join(__dirname, 'Ustebra')));
ustebraApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Ustebra", "index.html"));
});

const luzibraApp = express();
luzibraApp.use(express.static(path.join(__dirname, 'Luzibra')));
luzibraApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "Luzibra", "index.html"));
});

app.use(vhost('issobra.newcorporation.com.br', botApp));
app.use(vhost('etebra.jowbot.com.br', etebraApp));
app.use(vhost('yubra.jowbot.com.br', yubraApp));
app.use(vhost('ustebra.jowbot.com.br', ustebraApp));
app.use(vhost('luzibra.jowbot.com.br', luzibraApp));
app.use(vhost('localhost', botApp));
app.use(vhost('127.0.0.1', botApp));

const server = http.createServer(app);
const io = new Server(server);

const webUsers = new Map();
const adminRanks = ["leader alliance", "leader", "prodigy"];

io.on('connection', (socket) => {
    console.log(`[INFO] Usuário conectado: ${socket.id}`);

    socket.on('user:identify', async (nickname) => {
        const user = { nickname, uniqueId: nickname };
        webUsers.set(socket.id, user);
        const registeredUsers = await bot.loadJsonFile(path.join(__dirname, 'registered_users.json'));
        const registrationData = registeredUsers[user.uniqueId];
        if (registrationData) {
            const userRank = (registrationData.guildRank || "").toLowerCase();
            socket.emit('user:status', {
                isRegistered: true,
                message: `Conectado como ${registrationData.characterName}`,
                isAdmin: adminRanks.includes(userRank)
            });
        } else {
            socket.emit('user:status', { isRegistered: false, message: `Conectado como ${nickname} (Não Registrado)`, isAdmin: false });
            const result = await bot.processWebCommand('!register', [], user);
            socket.emit('bot:response', result.responseText);
        }
    });

    socket.on('user:command', async (message) => {
        const user = webUsers.get(socket.id);
        if (!user) return;
        console.log(`[CMD] De ${user.nickname}: ${message}`);
        socket.emit('command:echo', { sender: user.nickname, text: message });
        const args = message.trim().split(" ");
        const command = args.shift().toLowerCase();
        const result = await bot.processWebCommand(command, args, user);
        socket.emit('bot:response', result.responseText);
        if (result.needsBroadcast) {
            broadcastRespawnUpdates();
        }
        if (result.broadcastType === 'mass_message') {
            io.emit('bot:mass_message', result.broadcastPayload);
        }
    });

    socket.on('admin:getData', async () => { const data = await bot.adminGetFullData(); socket.emit('admin:dataUpdate', data); });
    socket.on('admin:createOrUpdateGroup', async (d) => { await bot.adminCreateOrUpdateGroup(d); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:deleteGroup', async (id) => { await bot.adminDeleteGroup(id); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:updateUserGroups', async (d) => { await bot.adminUpdateUserGroups(d.userId, d.groups); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:updateRespawnGroups', async (d) => { await bot.adminUpdateRespawnGroups(d.respawnCode, d.groups); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:pauseRespawn', async (d) => { await bot.adminPauseRespawn(d.respawnCode, d.isPaused); broadcastRespawnUpdates(); });
    socket.on('admin:pauseAll', async (isPaused) => { await bot.adminPauseAll(isPaused); broadcastRespawnUpdates(); });
    socket.on('admin:kickUser', async ({ respawnCode, userToKick }) => {
        const adminUser = webUsers.get(socket.id);
        if (!adminUser) return;
        const registeredUsers = await bot.loadJsonFile(path.join(__dirname, 'registered_users.json'));
        const adminRegistration = registeredUsers[adminUser.uniqueId];
        const adminName = adminRegistration ? adminRegistration.characterName : 'Líder';
        await bot.adminKickUser({ respawnCode, userToKick, adminName });
        broadcastRespawnUpdates();
    });
    socket.on('admin:getRespawnLog', async (respawnCode) => { const logData = await bot.adminGetRespawnLog(respawnCode); socket.emit('admin:showLog', logData); });
    socket.on('admin:getCharacterLog', async (characterName) => { const logData = await bot.adminGetCharacterLog(characterName); socket.emit('admin:showLog', logData); });

    socket.on('disconnect', () => { console.log(`[INFO] Usuário desconectado: ${socket.id}`); webUsers.delete(socket.id); });
});

async function broadcastRespawnUpdates() {
    try {
        const fila = await bot.loadJsonFile(path.join(__dirname, 'fila.json'), {});
        const respawnsData = await bot.loadJsonFile(path.join(__dirname, 'respawns.json'), {});
        
        const allRespawnNames = {};
        if (typeof respawnsData === 'object' && respawnsData !== null) {
            for (const region in respawnsData) {
                if (typeof respawnsData[region] === 'object' && respawnsData[region] !== null) {
                    for (const code in respawnsData[region]) {
                        allRespawnNames[code.toUpperCase()] = respawnsData[region][code];
                    }
                }
            }
        }
        io.emit('respawn:update', { fila, respawns: allRespawnNames });
    } catch (error) {
        console.error("[ERRO CRÍTICO] Falha em broadcastRespawnUpdates:", error);
    }
}

async function runAutomaticTasks() {
    try {
        const updated = await bot.processExpiredRespawns();
        if (updated) {
            console.log("[AUTO] Respawns expirados/pendentes foram processados. Atualizando clientes...");
            broadcastRespawnUpdates();
        }
    } catch (error) {
        console.error("[ERRO CRÍTICO] Falha nas tarefas automáticas:", error);
    }
}

setInterval(broadcastRespawnUpdates, 15000);
setInterval(runAutomaticTasks, 20000);

const PORT = 80;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}.`);
    console.log('Acesse os domínios configurados. Para teste local, use http://localhost');
});