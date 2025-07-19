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
const adminRanks = ["leader alliance", "leader", "vice leader"];
const WORLD_NAME = 'Issobra';
const HUNTED_ALERT_COOLDOWN = 30 * 60 * 1000;
const huntedLastAlert = new Map();
const ENEMY_ALERT_COOLDOWN = 30 * 60 * 1000; // Cooldown de 30 minutos para inimigos
const enemyLastAlert = new Map();
let cachedRespawnsData = {};
let cachedClientAccounts = {};

async function updateCaches() {
    console.log('[CACHE-SERVER] Carregando ou atualizando dados em memória...');
    try {
        cachedRespawnsData = await bot.loadJsonFile(path.join(__dirname, 'respawns.json'), {});
        cachedClientAccounts = await bot.loadJsonFile(path.join(__dirname, 'clientaccount.json'), {});
        console.log('[CACHE-SERVER] Dados carregados com sucesso.');
    } catch(err) {
        console.error('Falha ao carregar os caches do servidor:', err);
    }
}

async function getOnlinePlayers(worldName) {
    const url = `https://api.tibiadata.com/v4/world/${encodeURIComponent(worldName)}`;
    try {
        const response = await fetch(url, { timeout: 5000 }); // Adicionado timeout
        if (!response.ok) {
            console.error(`[API] Erro ao buscar jogadores: A API retornou status ${response.status}. Pode estar offline.`);
            return new Set();
        }
        const data = await response.json();
        const players = data?.world?.online_players || [];
        return new Set(players.map(p => p.name));
    } catch (err) {
        console.error(`[API] Falha ao processar a resposta da API para o mundo '${worldName}':`, err.message);
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
            
            let activeChar = null;
            if (foundAccount.activeCharacterName) {
                activeChar = foundAccount.tibiaCharacters.find(c => c && c.characterName === foundAccount.activeCharacterName);
            }
            if (!activeChar && foundAccount.tibiaCharacters && foundAccount.tibiaCharacters.length > 0) {
                activeChar = foundAccount.tibiaCharacters[0];
            }
            foundUser.character = activeChar;

            await bot.verifyUserGuildStatus(foundUser);
            socket.emit('login:success', { account: { name: foundUser.account.name, email: userEmail }, character: foundUser.character, token: token });
            checkAndEmitAdminStatus(socket);
        }
    });

    setTimeout(() => {
        const user = webUsers.get(socket.id);
        if (user && !user.account) {
            socket.emit('bot:response', "👋 Bem-vindo! Digite !help para ver a lista de comandos disponíveis.");
            const welcomeMessage = { type: 'actionable_message', text: 'Você não está logado.\n\nPor favor, faça login ou crie uma nova conta para continuar.', actions: [{ buttonText: 'Entrar (Login)', command_to_run: '!showlogin' }, { buttonText: 'Criar Conta', command_to_run: '!showregistration' }, { buttonText: 'Recuperar Conta', command_to_run: '!recover' }] };
            socket.emit('bot:response', welcomeMessage);
 
       }
    }, 1500);
    socket.on('friends:getData', async () => {
        const data = await bot.getRelationsData();
        const onlineSet = await getOnlinePlayers(WORLD_NAME);
        for (const key of ['players_allies', 'players_enemies', 'players_hunteds']) {
            if (data && data[key]) {
                data[key] = data[key].map(p => ({ ...p, online: onlineSet.has(p.name) }));
            }
     
        }
        if(data) data.last_sync = Date.now();
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
            await updateCaches();
            socket.emit('login:success', result.loginData);
            checkAndEmitAdminStatus(socket);
        } else { 
            checkAndEmitAdminStatus(socket);
        }
        if (result && result.responseText) { socket.emit('bot:response', result.responseText);
        }
        if (result && result.needsBroadcast) { broadcastRespawnUpdates();
        }
        if (result && result.broadcastType === 'mass_message') { io.emit('bot:mass_message', result.broadcastPayload);
        }
        if (result && result.adminDataUpdate) { await updateCaches(); const adminData = await bot.adminGetFullData();
        io.emit('admin:dataUpdate', adminData); }
        if (result && result.logoutSuccess) { await updateCaches();
        if (user) { user.account = null; user.character = null; } socket.emit('user:status', { isAdmin: false }); }
    });
    socket.on('admin:getData', async () => { const data = await bot.adminGetFullData(); socket.emit('admin:dataUpdate', data); });
    socket.on('admin:createOrUpdateGroup', async (d) => { await bot.adminCreateOrUpdateGroup(d); await updateCaches(); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:deleteGroup', async (id) => { await bot.adminDeleteGroup(id); await updateCaches(); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:updateUserGroups', async (data) => { await bot.adminUpdateUserGroups(data); await updateCaches(); const adminData = await bot.adminGetFullData(); io.emit('admin:dataUpdate', adminData); });
    socket.on('admin:updateRespawnGroups', async (d) => { await bot.adminUpdateRespawnGroups(d.respawnCode, d.groups); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('admin:pauseRespawn', async (d) => { await bot.adminPauseRespawn(d.respawnCode, d.isPaused); broadcastRespawnUpdates(); });
    socket.on('admin:pauseAll', async (isPaused) => { await bot.adminPauseAll(isPaused); broadcastRespawnUpdates(); });
    socket.on('admin:kickUser', async ({ respawnCode, userToKick }) => { const adminName = webUsers.get(socket.id)?.character?.characterName || 'Líder'; await bot.adminKickUser({ respawnCode, userToKick, adminName: adminName }); broadcastRespawnUpdates(); });
    socket.on('admin:getRespawnLog', async (respawnCode) => { const logData = await bot.adminGetRespawnLog(respawnCode); socket.emit('admin:showLog', logData); });
    socket.on('admin:getCharacterLog', async (characterName) => { const logData = await bot.adminGetCharacterLog(characterName); socket.emit('admin:showLog', logData); });
    socket.on('admin:updateRespawnTimes', async (timesData) => { await bot.adminUpdateRespawnTimes(timesData); await updateCaches(); const data = await bot.adminGetFullData(); io.emit('admin:dataUpdate', data); });
    socket.on('user:get_initial_data', async () => {
        try {
            const webGroups = await bot.loadJsonFile(path.join(__dirname, 'webgroups.json'), []);
            socket.emit('data:initial_data_response', { groups: webGroups });
        } catch (error) {
            console.error('Erro ao enviar dados iniciais para o cliente:', error);
        }
    });
    socket.on('admin:removeCooldown', async (userIdentifier) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminRemoveCooldown(userIdentifier);
            const adminData = await bot.adminGetFullData();
  
             io.emit('admin:dataUpdate', adminData);
        }
    });
    socket.on('admin:createOrUpdateRespawn', async (respawnData) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminCreateOrUpdateRespawn(respawnData);
            const adminData = await bot.adminGetFullData();
            io.emit('admin:dataUpdate', adminData);
        }
    });
    socket.on('admin:deleteRespawn', async (respawnCode) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminDeleteRespawn(respawnCode);
            const adminData = await bot.adminGetFullData();
            io.emit('admin:dataUpdate', adminData);
        }
    });
    const qeqAdmins = ['rapha2929@gmail.com', 'admin@tibianyx.com.br'];
    socket.on('qeq:checkAccess', () => {
        const user = webUsers.get(socket.id);
        let hasAccess = false; let isAdmin = false;
        if (user && user.account) {
            const userEmail = user.account.email;
            const mainChar = user.character;
            if (qeqAdmins.includes(userEmail)) {
          
             hasAccess = true; isAdmin = true;
            } else if (mainChar && mainChar.plusExpiresAt && new Date(mainChar.plusExpiresAt) > new Date()) {
                hasAccess = true;
            }
        }
        socket.emit('qeq:accessResponse', { hasAccess, isAdmin });
    });
    socket.on('qeq:getUsersForManagement', async () => {
        const user = webUsers.get(socket.id);
        if (user && user.account && qeqAdmins.includes(user.account.email)) {
            const users = await bot.adminGetAllUsersForPlusManagement();
            socket.emit('qeq:userListResponse', users);
        }
    });
    socket.on('qeq:addPlusTime', async (data) => {
        const user = webUsers.get(socket.id);
        if (user && user.account && qeqAdmins.includes(user.account.email)) {
            const result = await bot.adminAddPlusTime(data);
            if(result.success){
                await updateCaches();
                const updatedUsers = await bot.adminGetAllUsersForPlusManagement();
      
                 io.emit('qeq:userListResponse', updatedUsers);
            } else {
                socket.emit('bot:response', { type: 'error', text: result.message || 'Falha ao atualizar o status Plus.' });
            }
        }
    });
    
    async function getFullPlanilhadoData(type) {
        const data = await bot.getPlanilhadoData(type);
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        if (data && data.groups) {
            for (const group of data.groups) {
                if (group.members) {
                    group.members.forEach(member => {
                                       member.online = onlinePlayers.has(member.name);
                    });
                }
            }
        }
        return data;
    }

    socket.on('planilhado:getData', async ({ type }) => {
        const data = await getFullPlanilhadoData(type);
        socket.emit('planilhado:dataUpdated', { type, data });
    });
    socket.on('planilhado:createOrUpdateGroup', async (members) => {
        const user = webUsers.get(socket.id);
        if (user && user.character) {
            const leaderName = user.character.characterName;
            const result = await bot.createOrUpdatePlanilhadoGroup(leaderName, members);
            if(result.success) {
                io.emit('bot:broadcast_notification', { type: 'info', message: `O grupo de planilha de ${leaderName} foi atualizado.` });
                broadcastPlanilhadoUpdate('normal');
                broadcastPlanilhadoUpdate('double');
            } else {
                socket.emit('bot:response', { type: 'error', text: result.message });
            }
        }
    });
    socket.on('planilhado:assignGroup', async (payload) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {

            if (!payload || !payload.type || !payload.respawnCode || !payload.groupLeader || !payload.startTime || !payload.duration) {
                console.warn(`[INFO] Bloqueado agendamento inválido vindo do socket ${socket.id}. Payload:`, payload);
                return;
      
             }

            const result = await bot.assignToPlanilha(payload);
            if(result.success) {
                
                         function getRespawnNameByCode(code) {
                    for (const region in cachedRespawnsData) {
                        if (cachedRespawnsData[region][code]) {
                            return cachedRespawnsData[region][code];
       
                                 }
                    }
                    return code; 
                }

                function formatDuration(hours) {
                    const h = Math.floor(hours);
                    const m = Math.round((hours - h) * 60);
                    return `${h}:${String(m).padStart(2, '0')}`;
                }

                const respawnName = getRespawnNameByCode(payload.respawnCode);
                const formattedTime = formatDuration(payload.duration);

                const message = `${payload.groupLeader} Planilhou ${respawnName} por ${formattedTime}`;
                io.emit('bot:broadcast_notification', { type: 'info', message: message });
                
                broadcastPlanilhadoUpdate(payload.type);
            } else {
                socket.emit('bot:response', { type: 'error', text: result.message });
            }
        }
    });
    socket.on('planilhado:removeAssignment', async ({ type, respawnCode, groupLeader }) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
           const result = await bot.removeFromPlanilha({ type, respawnCode, groupLeader });
            if(result.success) {
                broadcastPlanilhadoUpdate(type);
            } else {
     
                         socket.emit('bot:response', { type: 'error', text: result.message });
            }
        }
    });
    socket.on('admin:updatePlanilhadoRespawns', async (payload) => { 
         const user = webUsers.get(socket.id);
         if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminUpdatePlanilhadoRespawns(payload);
            broadcastPlanilhadoUpdate('normal');
            broadcastPlanilhadoUpdate('double');
            socket.emit('bot:success_notification', { message: `Listas de respawns das planilhas atualizadas.` });
   
             }
    });
    async function broadcastPlanilhadoUpdate(type) {
        try {
            const data = await getFullPlanilhadoData(type);
            io.emit('planilhado:dataUpdated', { type, data });
        } catch (error) {
            console.error(`Erro ao fazer broadcast da planilha ${type}:`, error);
        }
    }
    
    socket.on('disconnect', () => {
        console.log(`[INFO] Usuário desconectado: ${socket.id}`);
        webUsers.delete(socket.id);
    });
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

async function sendEnemyAlert(onlinePlayers) {
    try {
        const relations = await bot.getRelationsData();
        const enemies = relations.players_enemies || [];
        const now = Date.now();
        enemies.forEach(enemy => {
            if (onlinePlayers.has(enemy.name)) {
                const lastAlertTime = enemyLastAlert.get(enemy.name) || 0;
                if (now - lastAlertTime >= ENEMY_ALERT_COOLDOWN) {
                    io.emit('bot:enemy_online', enemy); 
               
                 enemyLastAlert.set(enemy.name, now);
                    console.log(`[ALERTA] Inimigo online: ${enemy.name}`);
                }
            }
        });
    } catch (err) {
        console.error('[ALERTA INIMIGO] Erro:', err);
    }
}

async function broadcastRespawnUpdates() {
    try {
        const fila = await bot.loadJsonFile(path.join(__dirname, 'fila.json'), {});
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        const clientAccounts = cachedClientAccounts;
        const plusStatusMap = {};
        const accountDataMap = {};
        for (const email in clientAccounts) {
            accountDataMap[email] = clientAccounts[email];
            const mainChar = clientAccounts[email].tibiaCharacters?.[0];
            if (mainChar?.plusExpiresAt) {
                plusStatusMap[email] = mainChar.plusExpiresAt;
            }
        }
        for (const code in fila) {
            const respawn = fila[code];

            // Função auxiliar para processar tanto o usuário atual quanto os da fila
            const processUser = async (user) => {
                if (!user) return;
                const userAccount = accountDataMap[user.clientUniqueIdentifier];
                const registrationData = { ...userAccount, ...userAccount?.tibiaCharacters?.[0] };
                user.plusExpiresAt = plusStatusMap[user.clientUniqueIdentifier] || null;
                user.entitledTime = await bot.getUserMaxTime(registrationData);
                user.isOnline = onlinePlayers.has(user.clientNickname);
                user.streamLink = userAccount?.tibiaCharacters?.[0]?.streamLink || null;

                // NOVA LÓGICA PARA VERIFICAR O STATUS DO MAKER
                if (user.isMakerHunt && user.makerName) {
                    user.isMakerOnline = onlinePlayers.has(user.makerName);
                } else {
                    user.isMakerOnline = false;
                }
            };

            if (respawn.current) {
                await processUser(respawn.current);
            }
            if (respawn.queue) {
                for(const userInQueue of respawn.queue) {
                    await processUser(userInQueue);
                }
            }
        }
        const allRespawnNames = {};
        for (const region in cachedRespawnsData) {
            for (const code in cachedRespawnsData[region]) {
                allRespawnNames[code.toUpperCase()] = cachedRespawnsData[region][code];
            }
        }
        io.emit('respawn:update', { fila, respawns: allRespawnNames });
    } catch (error) {
        console.error("[ERRO] Falha em broadcastRespawnUpdates:", error);
    }
}

async function runAutomaticTasks() {
    try {
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        const result = await bot.processExpiredRespawns(onlinePlayers);
        if (result && result.hasChanges) {
            console.log("[AUTO] Respawns expirados processados.");
            broadcastRespawnUpdates();
        }
        const plusResult = await bot.processExpiredPlusMembers();
        if (plusResult && plusResult.hasChanges) {
            console.log("[AUTO] Assinaturas Plus expiradas processadas.");
            await updateCaches();
        }
        if (result && result.notifications && result.notifications.length > 0) {
            const connectedUsers = Array.from(webUsers.values());
            result.notifications.forEach(notification => {
                const targetUser = connectedUsers.find(u => u.account && u.account.email === notification.recipientEmail);
                if (targetUser) {
                    const eventName = notification.type === 'warning' ? 'bot:warning_notification' : 'bot:private_message';
                    io.to(targetUser.socketId).emit(eventName, { message: notification.message });
  
               }
            });
        }
        await sendHuntedAlert(onlinePlayers);
        await sendEnemyAlert(onlinePlayers);
    } catch (error) {
        console.error("[ERRO] Falha nas tarefas automáticas:", error);
    }
}

setInterval(runAutomaticTasks, 20000); 
setInterval(broadcastRespawnUpdates, 30000);

const PORT = 3001;
server.listen(PORT, async () => {
    console.log(`Servidor rodando na porta http://127.0.0.1:${PORT}.`);
    await updateCaches();
    console.log('Iniciando a primeira sincronização de guilds em segundo plano...');
    bot.syncAllRelations().then(updatedData => {
        io.emit('friends:dataUpdated', updatedData);
        console.log('Primeira sincronização em segundo plano concluída.');
    }).catch(error => {
        console.error('[INITIAL SYNC ERROR]', error);
    });
}); 