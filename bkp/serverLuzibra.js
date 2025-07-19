const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const fetch = require('node-fetch');
const bot = require('./bot_logic.js');
const fs = require('fs');

const app = express();
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server);

const webUsers = new Map();
const adminRanks = ["leader alliance", "leader", "prodigy"];
const WORLD_NAME = 'Luzibra';
const HUNTED_ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutos em milissegundos
const huntedLastAlert = new Map(); // Mapa para rastrear o último alerta de cada hunted

async function getOnlinePlayers(worldName) {
    const url = `https://api.tibiadata.com/v4/world/${encodeURIComponent(worldName)}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const players = data?.world?.online_players || [];
        return new Set(players.map(p => p.name));
    } catch (err) {
        console.error('[API] Erro ao buscar jogadores online:', err);
        return new Set();
    }
}

async function sendHuntedAlert(onlinePlayers) {
    try {
        const relations = await bot.getRelationsData();
        const hunteds = relations.players_hunteds || [];
        
        const now = Date.now();
        hunteds.forEach(hunted => {
            if (onlinePlayers.has(hunted.name)) {
                const lastAlertTime = huntedLastAlert.get(hunted.name) || 0;
                if (now - lastAlertTime >= HUNTED_ALERT_COOLDOWN) {
                    const message = `ALERTA! Hunted ${hunted.name} (level ${hunted.level}) está online!`;
                    io.emit('bot:hunted_online', hunted);
                    huntedLastAlert.set(hunted.name, now);
                    console.log(`[ALERTA] Hunted online: ${hunted.name}`);
                }
            }
        });
    } catch (err) {
        console.error('[ALERTA HUNTED] Erro:', err);
    }
}

io.on('connection', (socket) => {
    console.log(`[INFO] Usuário conectado: ${socket.id}`);
    const userSession = { socketId: socket.id, account: null, character: null, conversationState: null, registrationData: {}, loginData: {} };
    webUsers.set(socket.id, userSession);

    socket.on('user:authenticate_with_token', async (token) => {
        if (!token) return;
        const clientAccounts = await bot.loadJsonFile(path.join(__dirname, 'clientaccount.json'));
        let foundUser = webUsers.get(socket.id);
        let foundAccount = null;
        let userEmail = null;
        for (const email in clientAccounts) {
            const account = clientAccounts[email];
            if (account.sessionTokens && account.sessionTokens.includes(token)) {
                foundAccount = account;
                userEmail = email;
                break;
            }
        }
        if (foundUser && foundAccount) {
            foundUser.account = foundAccount;
            foundUser.account.email = userEmail;
            foundUser.character = (foundAccount.tibiaCharacters && foundAccount.tibiaCharacters.length > 0) ? foundAccount.tibiaCharacters[0] : null;
            socket.emit('login:success', { account: { name: foundAccount.name, email: userEmail }, character: foundUser.character, token: token });
            checkAndEmitAdminStatus(socket);
        }
    });

    setTimeout(() => {
        const user = webUsers.get(socket.id);
        if (user && !user.account) {
            const welcomeMessage = { type: 'actionable_message', text: 'Bem-vindo ao Controle Web!\n\nPor favor, faça login ou crie uma nova conta para continuar.', actions: [{ buttonText: 'Entrar (Login)', command_to_run: '!showlogin' }, { buttonText: 'Criar Conta', command_to_run: '!showregistration' }] };
            socket.emit('bot:response', welcomeMessage);
        }
    }, 500);

    socket.on('friends:getData', async () => {
        const data = await bot.getRelationsData();
        const onlineSet = await getOnlinePlayers(WORLD_NAME);

        for (const key of ['players_allies', 'players_enemies', 'players_hunteds']) {
            if (data[key]) {
                data[key] = data[key].map(p => ({ ...p, online: onlineSet.has(p.name) }));
            }
        }

        data.last_sync = Date.now();
        socket.emit('friends:dataUpdated', data);
    });

    socket.on('admin:addRelation', async (relationData) => {
        const result = await bot.adminAddRelation(relationData);
        io.emit('friends:dataUpdated', result.updatedData);
        if (relationData.type === 'source_hunteds' && result.newData) {
            const adminName = webUsers.get(socket.id)?.character?.characterName || 'Líder';
            const message = `NOVO HUNTED ADICIONADO: ${result.newData.name}. Motivo: ${result.newData.reason}`;
            io.emit('bot:mass_message', { sender: adminName, message });
        }
    });

    socket.on('admin:removeRelation', async (relationData) => {
        const updatedData = await bot.adminRemoveRelation(relationData);
        io.emit('friends:dataUpdated', updatedData);
    });

    socket.on('admin:syncRelations', () => {
        socket.emit('bot:response', 'Iniciando sincronização em segundo plano...');
        bot.syncAllRelations().then(updatedData => {
            io.emit('friends:dataUpdated', updatedData);
            socket.emit('bot:response', 'Sincronização manual concluída.');
        }).catch(error => {
            console.error('[SYNC MANUAL ERROR]', error);
            socket.emit('bot:response', 'Ocorreu um erro durante a sincronização.');
        });
    });

    socket.on('user:command', async (message) => {
        const user = webUsers.get(socket.id);
        if (!user) return;
        console.log(`[CMD] De ${user.socketId}: ${message}`);
        const senderName = user.character ? user.character.characterName : (user.account ? user.account.name : 'Visitante');
        socket.emit('command:echo', { sender: senderName, text: message });
        let result;
        if (message.startsWith('!')) {
            const args = message.trim().substring(1).split(" ");
            const command = args.shift().toLowerCase();
            result = await bot.processCommand(command, args, user);
        } else if (user.conversationState) {
            result = await bot.processConversationReply(message, user);
        } else {
            result = { responseText: `Comando não reconhecido. Comandos devem começar com '!' (ex: !help).` };
        }
        if (result && result.loginSuccess) {
            socket.emit('login:success', result.loginData);
            checkAndEmitAdminStatus(socket);
        } else {
            checkAndEmitAdminStatus(socket);
        }
        if (result && result.responseText) { socket.emit('bot:response', result.responseText); }
        if (result && result.needsBroadcast) { broadcastRespawnUpdates(); }
        if (result && result.broadcastType === 'mass_message') { io.emit('bot:mass_message', result.broadcastPayload); }
        if (result && result.adminDataUpdate) { const adminData = await bot.adminGetFullData(); io.emit('admin:dataUpdate', adminData); }
        if (result && result.logoutSuccess) { if (user) { user.account = null; user.character = null; } socket.emit('user:status', { isAdmin: false }); }
    });

    socket.on('admin:getData', async () => { const data = await bot.adminGetFullData(); socket.emit('admin:dataUpdate', data); });
    socket.on('admin:createOrUpdateGroup', async (d) => { await bot.adminCreateOrUpdateGroup(d); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:deleteGroup', async (id) => { await bot.adminDeleteGroup(id); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:updateUserGroups', async (data) => { await bot.adminUpdateUserGroups(data); const adminData = await bot.adminGetFullData(); io.emit('admin:dataUpdate', adminData); });
    socket.on('admin:updateRespawnGroups', async (d) => { await bot.adminUpdateRespawnGroups(d.respawnCode, d.groups); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:pauseRespawn', async (d) => { await bot.adminPauseRespawn(d.respawnCode, d.isPaused); broadcastRespawnUpdates(); });
    socket.on('admin:pauseAll', async (isPaused) => { await bot.adminPauseAll(isPaused); broadcastRespawnUpdates(); });
    socket.on('admin:kickUser', async ({ respawnCode, userToKick }) => { const adminName = webUsers.get(socket.id)?.character?.characterName || 'Líder'; await bot.adminKickUser({ respawnCode, userToKick, adminName: adminName }); broadcastRespawnUpdates(); });
    socket.on('admin:getRespawnLog', async (respawnCode) => { const logData = await bot.adminGetRespawnLog(respawnCode); socket.emit('admin:showLog', logData); });
    socket.on('admin:getCharacterLog', async (characterName) => { const logData = await bot.adminGetCharacterLog(characterName); socket.emit('admin:showLog', logData); });
    socket.on('admin:updateRespawnTimes', async (timesData) => { await bot.adminUpdateRespawnTimes(timesData); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('disconnect', () => { console.log(`[INFO] Usuário desconectado: ${socket.id}`); webUsers.delete(socket.id); });
});

function checkAndEmitAdminStatus(socket) {
    const user = webUsers.get(socket.id);
    if (user && user.character && user.character.guildRank) {
        const userRank = user.character.guildRank.toLowerCase();
        const isAdmin = adminRanks.includes(userRank);
        socket.emit('user:status', { isAdmin });
    } else if (user && user.account) {
        socket.emit('user:status', { isAdmin: false });
    }
}

async function broadcastRespawnUpdates() { try { const fila = await bot.loadJsonFile(path.join(__dirname, 'fila.json'), {}); const respawnsData = await bot.loadJsonFile(path.join(__dirname, 'respawns.json'), {}); const allRespawnNames = {}; for (const region in respawnsData) { for (const code in respawnsData[region]) { allRespawnNames[code.toUpperCase()] = respawnsData[region][code]; } } io.emit('respawn:update', { fila, respawns: allRespawnNames }); } catch (error) { console.error("[ERRO] Falha em broadcastRespawnUpdates:", error); } }
async function runAutomaticTasks() {
    try {
        const result = await bot.processExpiredRespawns();
        if (result.hasChanges) {
            console.log("[AUTO] Respawns expirados processados.");
            broadcastRespawnUpdates();
        }
        // Bloco que envia as notificações de aviso
        if (result.notifications && result.notifications.length > 0) {
            const connectedUsers = Array.from(webUsers.values());
            result.notifications.forEach(notification => {
                const targetUser = connectedUsers.find(u => u.account && u.account.email === notification.recipientEmail);
                if (targetUser) {
                    const eventName = notification.type === 'warning' ? 'bot:warning_notification' : 'bot:private_message';
                    io.to(targetUser.socketId).emit(eventName, { message: notification.message });
                }
            });
        }
        
        // Verificação de hunteds online
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        await sendHuntedAlert(onlinePlayers);
        
    } catch (error) {
        console.error("[ERRO] Falha nas tarefas automáticas:", error);
    }
}

// Verificação periódica de hunteds online (a cada 2 minutos)
setInterval(async () => {
    try {
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        await sendHuntedAlert(onlinePlayers);
    } catch (error) {
        console.error("[ALERTA HUNTED] Erro no intervalo:", error);
    }
}, 2 * 60 * 1000); // 2 minutos

setInterval(broadcastRespawnUpdates, 15000);
setInterval(runAutomaticTasks, 20000);

const PORT = 3003;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta http://127.0.0.1:${PORT}.`);
    console.log('Iniciando a primeira sincronização em segundo plano...');
    bot.syncAllRelations().then(updatedData => {
        io.emit('friends:dataUpdated', updatedData);
        console.log('Primeira sincronização em segundo plano concluída.');
    }).catch(error => {
        console.error('[INITIAL SYNC ERROR]', error);
    });
});
