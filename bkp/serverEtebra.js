const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");
const fetch = require('node-fetch');
const bot = require('./bot_logic.js');
const bossModule = require('./boss_module.js');

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
const WORLD_NAME = 'Etebra';
const HUNTED_ALERT_COOLDOWN = 30 * 60 * 1000;
const huntedLastAlert = new Map();

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
        const response = await fetch(url);
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

    socket.emit('bot:response', "👋 Bem-vindo! Digite !help para ver a lista de comandos disponíveis.");

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

            await bot.verifyUserGuildStatus(foundUser);
            // A linha abaixo é a que realmente envia os dados de login para o client.js
            socket.emit('login:success', { account: { name: foundUser.account.name, email: userEmail }, character: foundUser.character, token: token });
            checkAndEmitAdminStatus(socket);
        }
    });

    setTimeout(() => {
        const user = webUsers.get(socket.id);
        if (user && !user.account) {
            const welcomeMessage = { type: 'actionable_message', text: 'Você não está logado.\n\nPor favor, faça login ou crie uma nova conta para continuar.', actions: [{ buttonText: 'Entrar (Login)', command_to_run: '!showlogin' }, { buttonText: 'Criar Conta', command_to_run: '!showregistration' }, { buttonText: 'Recuperar Conta', command_to_run: '!recover' }] };
            socket.emit('bot:response', welcomeMessage);
        }
    }, 500);
    
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
        if (result && result.responseText) { socket.emit('bot:response', result.responseText); }
        if (result && result.needsBroadcast) { broadcastRespawnUpdates(); }
        if (result && result.broadcastType === 'mass_message') { io.emit('bot:mass_message', result.broadcastPayload); }
        if (result && result.adminDataUpdate) { await updateCaches(); const adminData = await bot.adminGetFullData(); io.emit('admin:dataUpdate', adminData); }
        if (result && result.logoutSuccess) { await updateCaches(); if (user) { user.account = null; user.character = null; } socket.emit('user:status', { isAdmin: false }); }
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

    socket.on('boss:getGroups', async () => {
        try {
            const groups = await bossModule.getBossGroups();
            const userSession = webUsers.get(socket.id);
            const main_character = userSession?.character;
            
            const groupsWithSlots = await Promise.all(groups.map(async (group) => {
                const slots = await bossModule.getSlots(group.id);
                const isCreator = main_character ? group.creator === main_character.characterName : false;
                const canDelete = main_character ? (isCreator || adminRanks.includes(main_character.guildRank?.toLowerCase())) : false;
                
                return {
                    ...group,
                    slots: slots,
                    isCreator: isCreator, // Informação de permissão para o cliente
                    canDelete: canDelete, // Informação de permissão para o cliente
                };
            }));
            socket.emit('boss:groupsList', groupsWithSlots);
        } catch (error) {
            console.error('Erro ao obter grupos de boss:', error);
            socket.emit('bot:response', { type: 'error', text: 'Erro ao carregar grupos de boss.' });
        }
    });

    socket.on('boss:createGroup', async (groupData) => {
        const userSession = webUsers.get(socket.id);
        if (!userSession || !userSession.character) {
            socket.emit('bot:response', { type: 'error', text: "Você precisa estar logado com um personagem para criar grupos." });
            return;
        }

        const creatorChar = userSession.character;
        const formattedSlots = groupData.slots.map(slot => ({
            role: slot.role_name,
            count: parseInt(slot.role_count, 10)
        }));

        try {
            const newGroup = await bossModule.createBossGroup({
                creator: creatorChar.characterName,
                world: creatorChar.world, // Certifique-se que creatorChar.world está disponível
                boss_name: groupData.boss_name,
                event_time: groupData.event_time,
                slots: formattedSlots
            });
            io.emit('bot:broadcast_notification', { type: 'success', message: `Novo grupo de boss criado: ${newGroup.boss_name} por ${newGroup.creator}!` });
            broadcastBossGroupsUpdate(); // Atualiza a lista para todos os clientes
        } catch (error) {
            console.error('Erro ao criar grupo de boss:', error);
            socket.emit('bot:response', { type: 'error', text: "Erro ao criar grupo de boss." });
        }
    });

    
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
        // Checagem de segurança para garantir que apenas um admin possa fazer isso
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminRemoveCooldown(userIdentifier);
            // Envia os dados atualizados para todos os admins
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


    socket.on('boss:joinSlot', async ({ groupId, slotIndex }) => {
        const userSession = webUsers.get(socket.id);
        if (!userSession || !userSession.character) {
            socket.emit('bot:response', { type: 'error', text: "Você precisa estar logado com um personagem para entrar em vagas." });
            return;
        }
        const characterData = {
            name: userSession.character.characterName,
            vocation: userSession.character.vocation,
            level: userSession.character.level
        };
        try {
            const success = await bossModule.joinSlot(groupId, characterData, slotIndex);
            if (success) {
                socket.emit('bot:success_notification', { message: `Você entrou na vaga de boss.` });
                broadcastBossGroupsUpdate();
            } else {
                socket.emit('bot:warning_notification', { message: "Não foi possível entrar na vaga. Ela pode já estar ocupada ou você já está em uma vaga neste grupo." });
            }
        } catch (error) {
            console.error('Erro ao entrar na vaga:', error);
            socket.emit('bot:response', { type: 'error', text: 'Erro ao entrar na vaga de boss.' });
        }
    });

    socket.on('boss:leaveSlot', async ({ groupId, characterName }) => {
        const userSession = webUsers.get(socket.id);
        if (!userSession || !userSession.character) {
            socket.emit('bot:response', { type: 'error', text: "Você precisa estar logado com um personagem para sair de vagas." });
            return;
        }

        let isPermitted = false;
        const group = (await bossModule.getBossGroups()).find(g => g.id === groupId);
        if (group) {
            if (userSession.character.characterName === characterName || 
                group.creator === userSession.character.characterName || 
                adminRanks.includes(userSession.character.guildRank?.toLowerCase())) {
                isPermitted = true;
            }
        }

        if (isPermitted) {
            try {
                await bossModule.leaveSlot(groupId, { name: characterName });
                socket.emit('bot:success_notification', { message: `${characterName} saiu da vaga.` });
                broadcastBossGroupsUpdate();
            } catch (error) {
                console.error('Erro ao sair/remover da vaga:', error);
                socket.emit('bot:response', { type: 'error', text: 'Erro ao sair/remover da vaga.' });
            }
        } else {
            socket.emit('bot:warning_notification', { message: "Você não tem permissão para remover este personagem da vaga." });
        }
    });

    socket.on('boss:deleteGroup', async (groupId) => {
        const userSession = webUsers.get(socket.id);
        if (!userSession || !userSession.character) {
            socket.emit('bot:response', { type: 'error', text: "Você precisa estar logado com um personagem para apagar grupos." });
            return;
        }
        const characterData = {
            name: userSession.character.characterName,
            isLeader: adminRanks.includes(userSession.character.guildRank?.toLowerCase())
        };
        try {
            const success = await bossModule.deleteGroup(groupId, characterData);
            if (success) {
                socket.emit('bot:success_notification', { message: "Grupo de boss apagado com sucesso." });
                io.emit('bot:broadcast_notification', { type: 'info', message: `Um grupo de boss foi removido por ${userSession.character.characterName}.` });
                broadcastBossGroupsUpdate();
            } else {
                socket.emit('bot:warning_notification', { message: "Você não tem permissão para apagar este grupo." });
            }
        } catch (error) {
            console.error('Erro ao apagar grupo:', error);
            socket.emit('bot:response', { type: 'error', text: 'Erro ao apagar grupo de boss.' });
        }
    });

    // Função auxiliar para emitir a lista de bosses atualizada para todos os clientes
    async function broadcastBossGroupsUpdate() {
        try {
            const groups = await bossModule.getBossGroups();
            // Ao invés de tentar calcular isCreator/canDelete para CADA CLIENTE no broadcast,
            // que seria ineficiente, basta enviar os dados do grupo e slots.
            // O cliente que recebe recalcula as permissões baseadas em seu próprio activeCharacter.
            const groupsWithSlots = await Promise.all(groups.map(async (group) => {
                const slots = await bossModule.getSlots(group.id);
                return {
                    id: group.id,
                    creator: group.creator,
                    world: group.world,
                    boss_name: group.boss_name,
                    event_time: group.event_time,
                    created_at: group.created_at,
                    slots: slots,
                };
            }));
            io.emit('boss:groupsList', groupsWithSlots);
        } catch (error) {
            console.error('Erro ao fazer broadcast de grupos de boss:', error);
        }
    }

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

async function broadcastRespawnUpdates() {
    try {
        const fila = await bot.loadJsonFile(path.join(__dirname, 'fila.json'), {});
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
            if (respawn.current) {
                const userAccount = accountDataMap[respawn.current.clientUniqueIdentifier];
                const registrationData = { ...userAccount, ...userAccount?.tibiaCharacters?.[0] };
                respawn.current.plusExpiresAt = plusStatusMap[respawn.current.clientUniqueIdentifier] || null;
                respawn.current.entitledTime = await bot.getUserMaxTime(registrationData);
            }
            if (respawn.queue) {
                for(const userInQueue of respawn.queue) {
                    const userAccount = accountDataMap[userInQueue.clientUniqueIdentifier];
                    const registrationData = { ...userAccount, ...userAccount?.tibiaCharacters?.[0] };
                    userInQueue.plusExpiresAt = plusStatusMap[userInQueue.clientUniqueIdentifier] || null;
                    userInQueue.entitledTime = await bot.getUserMaxTime(registrationData);
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
        const result = await bot.processExpiredRespawns();
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
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        await sendHuntedAlert(onlinePlayers);
    } catch (error) {
        console.error("[ERRO] Falha nas tarefas automáticas:", error);
    }
}

setInterval(async () => {
    try {
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        await sendHuntedAlert(onlinePlayers);
    } catch (error) {
        console.error("[ALERTA HUNTED] Erro no intervalo:", error);
    }
}, 3 * 60 * 3000);

setInterval(runAutomaticTasks, 20000);
setInterval(broadcastRespawnUpdates, 30000);

const PORT = 3002;
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

