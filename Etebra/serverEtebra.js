const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const fetch = require('node-fetch');
const bot = require('./bot_logic.js');
const activeUsers = new Map();

const app = express();
app.set('trust proxy', 'loopback'); 

app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' /socket.io/socket.io.js; " + // Adicionado 'unsafe-inline'
        "style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; " +  // Adicionado 'unsafe-inline'
        "font-src 'self' cdnjs.cloudflare.com; " +
        "connect-src 'self'; " +
        "img-src 'self' data:; " +
        "object-src 'none';"
    );

    next();
});
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e5 
});
const connectionAttempts = new Map();
const blockedIPs = new Map();

app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/stalker/:name', async (req, res) => {
    try {
        const characterName = req.params.name;
        if (!characterName) {
            return res.status(400).json({ error: 'Nome do personagem não fornecido.' });
        }

        const externalApiUrl = `https://api.tibiastalker.pl/api/tibia-stalker/v1/characters/${encodeURIComponent(characterName)}`;
        
        const response = await fetch(externalApiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            // Se a API externa retornar um erro (ex: 404), repassa o erro.
            const errorData = await response.json();
            return res.status(response.status).json(errorData);
        }

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error('[PROXY-STALKER] Erro:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao contatar a API externa.' });
    }
});

const scriptFileName = path.basename(__filename);
const worldNameFromScript = scriptFileName.replace(/^server|\.js$/g, '').toLowerCase();

if (!worldNameFromScript) {
    console.error(`ERRO: Não foi possível determinar o mundo pelo nome do arquivo: ${scriptFileName}`);
    process.exit(1);
}

let configs;
try {
    configs = JSON.parse(fs.readFileSync(path.join(__dirname, 'ports.json'), 'utf8'));
} catch (e) {
    console.error("ERRO CRÍTICO: Não foi possível carregar ou ler o arquivo 'ports.json'.");
    process.exit(1);
}

const serverConfig = configs.find(c => c.world === worldNameFromScript);

if (!serverConfig) {
    console.error(`ERRO: Nenhuma configuração encontrada para o mundo "${worldNameFromScript}" em ports.json.`);
    process.exit(1);
}

const PORT = serverConfig.port;
const WORLD_NAME = serverConfig.world;

bot.init(WORLD_NAME);

console.log(`[CONFIG] Configuração carregada para o mundo [${WORLD_NAME}] na porta [${PORT}]`);

const webUsers = new Map();
const adminRanks = ["leader alliance", "leader", "vice leader"];
const qeqAdmins = ['rapha2929@gmail.com'];
const HUNTED_ALERT_COOLDOWN = 30 * 60 * 1000;
const huntedLastAlert = new Map();
const ENEMY_ALERT_COOLDOWN = 30 * 60 * 1000;
const enemyLastAlert = new Map();   
let cachedRespawnsData = {};
let cachedClientAccounts = {};
let isSyncingRelations = false; 
let currentlyOnlinePlayers = new Set();


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
    return currentlyOnlinePlayers;
}

/**
 * VERSÃO GENÉRICA E OTIMIZADA para enviar alertas de relações (Hunteds e Inimigos).
 * @param {Array} relationList - A lista de jogadores (ex: relations.players_hunteds).
 * @param {Map} lastAlertMap - O mapa que armazena o último alerta para cada jogador.
 * @param {number} cooldown - O tempo de espera em milissegundos entre alertas.
 * @param {string} eventName - O nome do evento do socket a ser emitido (ex: 'bot:hunted_online').
 * @param {string} logPrefix - O prefixo para a mensagem de log no console (ex: '[ALERTA HUNTED]').
 */
async function sendRelationAlert(relationList, lastAlertMap, cooldown, eventName, logPrefix) {
    try {
        const onlinePlayers = await getOnlinePlayers(); // Usa o cache
        const now = Date.now();

        (relationList || []).forEach(player => {
            if (onlinePlayers.has(player.name)) {
                const lastAlertTime = lastAlertMap.get(player.name) || 0;
                if (now - lastAlertTime >= cooldown) {
                    io.emit(eventName, player);
                    lastAlertMap.set(player.name, now);
                    console.log(`${logPrefix} Online: ${player.name}`);
                }
            }
        });
    } catch (err) {
        console.error(`${logPrefix} Erro:`, err);
    }
}

/**
 * Função genérica para limitar a taxa de eventos por socket.
 * @param {string} socketId - O ID do socket do usuário.
 * @param {string} eventName - O nome do evento a ser limitado.
 * @param {number} limit - O número máximo de chamadas permitidas.
 * @param {number} duration - A janela de tempo em segundos.
 * @returns {boolean} - Retorna true se o usuário estiver limitado, false caso contrário.
 */
function isRateLimited(socketId, eventName, limit, duration) {
    const user = webUsers.get(socketId);
    if (!user) return true; // Bloqueia se o usuário não for encontrado

    const now = Date.now();
    const durationMs = duration * 1000;
    
    if (!user.rateLimitTimestamps) user.rateLimitTimestamps = {};
    if (!user.rateLimitTimestamps[eventName]) user.rateLimitTimestamps[eventName] = [];

    let timestamps = user.rateLimitTimestamps[eventName];
    timestamps = timestamps.filter(ts => now - ts < durationMs);
    
    if (timestamps.length >= limit) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
             socket.emit('bot:response', { type: 'error', text: `❌ Você está fazendo muitas requisições. Tente novamente em alguns segundos.` });
        }
        user.rateLimitTimestamps[eventName] = timestamps; // Atualiza com os timestamps filtrados
        return true;
    }

    timestamps.push(now);
    user.rateLimitTimestamps[eventName] = timestamps;
    return false;
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

function cleanupAlertMap(alertMap, relationList) {
    const currentNames = new Set((relationList || []).map(p => p.name));
    
    for (const name of alertMap.keys()) {
        if (!currentNames.has(name)) {
            alertMap.delete(name);
        }
    }
}

io.on('connection', (socket) => {
    // --- LÓGICA DE DETECÇÃO DE IP ---
    const forwardedFor = socket.handshake.headers['x-forwarded-for'];
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : socket.handshake.address;

    const now = Date.now();

    // 1. Verifica se o IP já está bloqueado
    const blockExpires = blockedIPs.get(ip);
    if (blockExpires && now < blockExpires) {
        const remainingMinutes = Math.ceil((blockExpires - now) / 60000);
        console.warn(`[SECURITY] Conexão bloqueada do IP ${ip}. Bloqueio termina em ${remainingMinutes} min.`);
        socket.emit('system:blocked', { duration: remainingMinutes });
        socket.disconnect(true);
        return;
    } else if (blockExpires && now >= blockExpires) {
        blockedIPs.delete(ip);
    }

    // 2. Rastreia tentativas de conexão no último minuto
    let attempts = connectionAttempts.get(ip) || [];
    attempts = attempts.filter(timestamp => now - timestamp < 60000);
    attempts.push(now);
    connectionAttempts.set(ip, attempts);

    // 3. Se exceder o limite, bloqueia e LOGA A TENTATIVA DE ATAQUE
    if (attempts.length > 5) {
        console.error(`[SECURITY] IP ${ip} bloqueado por 10 minutos por excesso de recarregamentos.`);
        blockedIPs.set(ip, now + 600000);
        connectionAttempts.delete(ip);

        bot.logUnderAttack({
            type: 'Connection Flood',
            ip: ip, 
            reason: `Mais de 5 conexões em 1 minuto. Bloqueado por 10 minutos.`,
            accountName: 'N/A',
            email: 'N/A',
            phone: 'N/A',
            character: 'N/A'
        });
        
        socket.emit('system:blocked', { duration: 10 });
        socket.disconnect(true);
        return;
    }
    // --- FIM DA LÓGICA DE BLOQUEIO DE IP ---

    console.log(`[INFO] Usuário conectado: ${socket.id}`);
    const userSession = { 
        socketId: socket.id, 
        account: null, 
        character: null, 
        conversationState: null, 
        registrationData: {}, 
        loginData: {},
        commandTimestamps: [],
        isMutedUntil: 0,
        rateLimitTimestamps: {},
        clientTimeInfo: null 

    };
    webUsers.set(socket.id, userSession);

    broadcastRespawnUpdates(socket);


    socket.on('user:time_info', (data) => {
        const user = webUsers.get(socket.id);
        if (user && data) {
            user.clientTimeInfo = data;
        }
    });

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
            // --- INÍCIO DA LÓGICA DE SESSÃO ÚNICA ---
            const oldSocketId = activeUsers.get(userEmail);
            if (oldSocketId && oldSocketId !== socket.id) {
                console.log(`[SECURITY] Desconectando sessão antiga para ${userEmail} do socket ${oldSocketId}.`);
                // Emite um aviso para a aba antiga antes de desconectar
                io.to(oldSocketId).emit('system:force_disconnect', 'Você se conectou em um novo local. Esta sessão foi encerrada.');
                io.sockets.sockets.get(oldSocketId)?.disconnect(true);
            }
            activeUsers.set(userEmail, socket.id);
            // --- FIM DA LÓGICA DE SESSÃO ÚNICA ---

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

    socket.on('admin:updateRespawnRankRestrictions', async (data) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminUpdateRespawnRankRestrictions(data);
            socket.emit('bot:success_notification', { message: 'Restrições de rank para o respawn foram salvas.' });
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:updateRespawnRankRestrictions' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:getUsers', async () => {
        const user = webUsers.get(socket.id);

        console.log(`[DEBUG] Verificando rank para 'admin:getUsers'. Rank do usuário: '${user?.character?.guildRank}'`);

        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            const usersForDisplay = await bot.adminGetUsersForDisplay();
            socket.emit('admin:usersUpdate', usersForDisplay);
        } else {
            console.warn(`[SECURITY] Acesso negado a 'admin:getUsers' para o socket ${socket.id}. Rank: '${user?.character?.guildRank}'`);
        }
    });

    socket.on('admin:removeUserFromGroup', async (data) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminRemoveUserFromGroup(data);
            
            await updateCaches();
            const usersForDisplay = await bot.adminGetUsersForDisplay();
            const adminData = await bot.adminGetFullData();
            io.emit('admin:usersUpdate', usersForDisplay);
            io.emit('admin:dataUpdate', adminData);
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:removeUserFromGroup' pelo socket ${socket.id}`);
        }
    });


    socket.on('admin:getUserDetails', async (userEmail) => {
        const requester = webUsers.get(socket.id);

        if (requester && requester.character && adminRanks.includes(requester.character.guildRank?.toLowerCase())) {
            
            const clientAccounts = await bot.loadJsonFile(path.join(__dirname, 'clientaccount.json'));
            const targetAccount = clientAccounts[userEmail];

            if (targetAccount) {
                const userDetails = {
                    name: targetAccount.name,
                    email: userEmail,
                    phone: targetAccount.phone || 'Não cadastrado',
                    tibiaCharacters: targetAccount.tibiaCharacters || []
                };
                
                socket.emit('admin:userDetailsResponse', userDetails);

            } else {
                socket.emit('bot:response', { type: 'error', text: 'Usuário não encontrado.' });
            }
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:getUserDetails' pelo socket ${socket.id}`);
        }
    });

socket.on('friends:getData', async () => {
    // APLICA O RATE LIMIT: 5 requisições a cada 10 segundos
    if (isRateLimited(socket.id, 'friends:getData', 5, 10)) return;
    
    const data = await bot.getRelationsData();
    const onlineSet = await getOnlinePlayers(); // Usa o cache de players online
    for (const key of ['players_allies', 'players_enemies', 'players_hunteds']) {
        if (data && data[key]) {
            data[key] = data[key].map(p => ({ ...p, online: onlineSet.has(p.name) }));
        }
    }
    if(data) data.last_sync = Date.now();
    socket.emit('friends:dataUpdated', data);
});

    socket.on('admin:addRelation', async (relationData) => {
        const adminRanks = ["leader alliance", "leader", "vice leader"];
        const user = webUsers.get(socket.id);

        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {

            const result = await bot.adminAddRelation(relationData);
            io.emit('friends:dataUpdated', result.updatedData);
            if (relationData.type === 'source_hunteds' && result.newData) {
                const adminName = user.character?.characterName || 'Líder';
                const message = `NOVO HUNTED ADICIONADO: ${result.newData.name}. Motivo: ${result.newData.reason}`;
                io.emit('bot:mass_message', { sender: adminName, message });
            }
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:addRelation' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:removeRelation', async (relationData) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            const updatedData = await bot.adminRemoveRelation(relationData);
            io.emit('friends:dataUpdated', updatedData);
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:removeRelation' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:syncRelations', () => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            
            // --- LÓGICA DE CONTROLE DE SINCRONIZAÇÃO ---
            if (isSyncingRelations) {
                socket.emit('bot:response', { type: 'error', text: 'Uma sincronização já está em andamento. Por favor, aguarde.' });
                return;
            }
            
            isSyncingRelations = true;
            socket.emit('bot:response', 'Iniciando sincronização em segundo plano... Isso pode levar alguns minutos.');
            
            bot.syncAllRelations().then(updatedData => {
                io.emit('friends:dataUpdated', updatedData);
                socket.emit('bot:response', 'Sincronização manual concluída.');
            }).catch(error => {
                console.error('[SYNC MANUAL ERROR]', error);
                socket.emit('bot:response', { type: 'error', text: 'Ocorreu um erro durante a sincronização.' });
            }).finally(() => {
                // Garante que a flag seja liberada, mesmo em caso de erro.
                isSyncingRelations = false; 
            });

        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:syncRelations' pelo socket ${socket.id}`);
        }
    });

    socket.on('user:command', async (message) => {
        const user = webUsers.get(socket.id);
        if (!user) return;

        const now = Date.now();

        const userIsAdmin = user.character && adminRanks.includes(user.character.guildRank?.toLowerCase());

        if (!userIsAdmin) {
            if (user.isMutedUntil && now < user.isMutedUntil) {
                return;
            }

            user.commandTimestamps = user.commandTimestamps.filter(timestamp => now - timestamp < 10000);
            user.commandTimestamps.push(now);

            if (user.commandTimestamps.length > 5) {
                user.isMutedUntil = now + 300000;
                console.log(`[SECURITY] Usuário do socket ${socket.id} mutado por 5 minutos por excesso de comandos.`);
                bot.logUnderAttack({
                    type: 'Command Flood',
                    ip: socket.handshake.address,
                    reason: `Mais de 5 comandos em 10 segundos. Mutado por 5 minutos.`,
                    accountName: user.account?.name || 'N/A',
                    email: user.account?.email || 'N/A',
                    phone: user.account?.phone || 'Não cadastrado',
                    character: user.character?.characterName || 'Nenhum',
                    clientTime: user.clientTimeInfo
                });
                socket.emit('bot:response',`Limite de comandos excedido. Você não poderá enviar comandos por 5 minutos.`);
                return;
            }
        }

        const senderName = user.character ? user.character.characterName : (user.account ? user.account.name : 'Visitante');
        socket.emit('command:echo', { sender: senderName, text: message });
        let result;
        if (message.startsWith('!')) {
            const args = message.trim().substring(1).split(" ");
            const command = args.shift().toLowerCase();
            // HERE IS THE CHANGE: Pass currentlyOnlinePlayers
            result = await bot.processCommand(command, args, user, currentlyOnlinePlayers); 
        } else if (user.conversationState) {
            result = await bot.processConversationReply(message, user);
        } else {
            result = { responseText: `Comando não reconhecido. Comandos devem começar com '!' (ex: !help).` };
        }

        if (result && result.loginSuccess) {
            const userEmail = result.loginData.account.email;
            if(userEmail) {
                const oldSocketId = activeUsers.get(userEmail);
                if (oldSocketId && oldSocketId !== socket.id) {
                    console.log(`[SECURITY] Desconectando sessão antiga para ${userEmail} do socket ${oldSocketId}.`);
                    io.to(oldSocketId).emit('system:force_disconnect', 'Você se conectou em um novo local. Esta sessão foi encerrada.');
                    io.sockets.sockets.get(oldSocketId)?.disconnect(true);
                }
                activeUsers.set(userEmail, socket.id);
            }
            
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

    socket.on('admin:createOrUpdateGroup', async (d) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminCreateOrUpdateGroup(d);
            await updateCaches();
            const data = await bot.adminGetFullData();
            io.emit('admin:dataUpdate', data);
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:createOrUpdateGroup' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:deleteGroup', async (id) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminDeleteGroup(id);
            await updateCaches();
            const adminData = await bot.adminGetFullData();
            const usersForDisplay = await bot.adminGetUsersForDisplay();
            io.emit('admin:dataUpdate', adminData);
            io.emit('admin:usersUpdate', usersForDisplay);
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:deleteGroup' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:updateUserGroups', async (data) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminUpdateUserGroups(data);
            await updateCaches();
            const adminData = await bot.adminGetFullData();
            const usersForDisplay = await bot.adminGetUsersForDisplay();
            io.emit('admin:dataUpdate', adminData);
            io.emit('admin:usersUpdate', usersForDisplay);
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:updateUserGroups' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:updateRespawnGroups', async (d) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminUpdateRespawnGroups(d.respawnCode, d.groups);
            const data = await bot.adminGetFullData();
            io.emit('admin:dataUpdate', data);
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:updateRespawnGroups' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:pauseRespawn', async (d) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminPauseRespawn(d.respawnCode, d.isPaused);
            broadcastRespawnUpdates();
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:pauseRespawn' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:pauseAll', async (isPaused) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminPauseAll(isPaused);
            broadcastRespawnUpdates();
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:pauseAll' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:kickUser', async ({ respawnCode, userToKick }) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            const adminName = user.character?.characterName || 'Líder';
            await bot.adminKickUser({ respawnCode, userToKick, adminName: adminName });
            broadcastRespawnUpdates();
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:kickUser' pelo socket ${socket.id}`);
        }
    });

    socket.on('admin:getRespawnLog', async (respawnCode) => { const logData = await bot.adminGetRespawnLog(respawnCode); socket.emit('admin:showLog', logData); });
    socket.on('admin:getCharacterLog', async (characterName) => { const logData = await bot.adminGetCharacterLog(characterName); socket.emit('admin:showLog', logData); });
    socket.on('admin:updateRespawnTimes', async (timesData) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminUpdateRespawnTimes(timesData);
            await updateCaches();
            const data = await bot.adminGetFullData();
            io.emit('admin:dataUpdate', data);
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:updateRespawnTimes' pelo socket ${socket.id}`);
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
        if (isRateLimited(socket.id, 'planilhado:getData', 5, 10)) return;

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
        const user = webUsers.get(socket.id);
        if (user && user.account && user.account.email) {
            if (activeUsers.get(user.account.email) === socket.id) {
                activeUsers.delete(user.account.email);
                console.log(`[INFO] Sessão ativa para ${user.account.email} foi limpa.`);
            }
        }
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


async function broadcastRespawnUpdates(socket = null) {
    try {
        const fila = await bot.loadJsonFile(path.join(__dirname, 'fila.json'), {});
        const onlinePlayers = await getOnlinePlayers(WORLD_NAME);
        const clientAccounts = cachedClientAccounts;

        const plusStatusMap = {};
        const accountDataMap = {};
        // Cria um mapa de characterName para os dados completos do personagem para busca rápida
        const characterDetailsMap = new Map(); 

        for (const email in clientAccounts) {
            accountDataMap[email] = clientAccounts[email];
            if (clientAccounts[email].tibiaCharacters) {
                clientAccounts[email].tibiaCharacters.forEach(char => {
                    if (char.characterName) {
                        characterDetailsMap.set(char.characterName.toLowerCase(), char);
                    }
                });
            }
            const mainChar = clientAccounts[email].tibiaCharacters?.[0];
            if (mainChar?.plusExpiresAt) {
                plusStatusMap[email] = mainChar.plusExpiresAt;
            }
        }

        for (const code in fila) {
            const respawn = fila[code];
            const processUser = async (user) => {
                if (!user) return;
                const userAccount = accountDataMap[user.clientUniqueIdentifier];
                const registrationData = { ...userAccount, ...userAccount?.tibiaCharacters?.[0] };
                user.plusExpiresAt = plusStatusMap[user.clientUniqueIdentifier] || null;
                user.entitledTime = await bot.getUserMaxTime(registrationData);
                user.isOnline = onlinePlayers.has(user.clientNickname);
                user.streamLink = userAccount?.tibiaCharacters?.[0]?.streamLink || null;

                if (user.isMakerHunt && user.makerName) {
                    user.isMakerOnline = onlinePlayers.has(user.makerName);
                } else {
                    user.isMakerOnline = false;
                }
                
                // Lógica para enriquecer os detalhes dos membros do grupo planilhado
                if (user.isPlanilhado && user.groupMembers) {
                    user.groupMembers = await Promise.all(user.groupMembers.map(async (member) => {
                        let memberDetails = {
                            name: member.name, // Nome já vem do bot_logic.js
                            level: 'N/A',
                            vocation: 'N/A',
                            guildRank: 'N/A',
                            isOnline: onlinePlayers.has(member.name) // Verifica status online
                        };

                        // 1. Tentar encontrar nos cachedClientAccounts (mapa de detalhes de char)
                        const cachedChar = characterDetailsMap.get(member.name.toLowerCase());
                        if (cachedChar) {
                            memberDetails.level = cachedChar.level || 'N/A';
                            memberDetails.vocation = cachedChar.vocation || 'N/A';
                            memberDetails.guildRank = cachedChar.guildRank || 'N/A';
                        } else {
                            // 2. Se não encontrado no cache local, tentar buscar na API externa, segundo caso pois custa memória
                            try {
                                const charInfoFromApi = await bot.getTibiaCharacterInfo(member.name);
                                if (charInfoFromApi) {
                                    memberDetails.level = charInfoFromApi.level || 'N/A';
                                    memberDetails.vocation = charInfoFromApi.vocation || 'N/A';
                                    const guildMemberInfo = await bot.checkTibiaCharacterInGuild(charInfoFromApi.name);
                                    memberDetails.guildRank = guildMemberInfo ? guildMemberInfo.rank : 'N/A';
                                }
                            } catch (apiError) {
                                console.error(`Erro ao buscar info de ${member.name} na API para planilhado:`, apiError);
                            }
                        }
                        return memberDetails;
                    }));
                }
            };

            if (respawn.current) {
                await processUser(respawn.current);
            }
            if (respawn.queue) {
                for (const userInQueue of respawn.queue) {
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

        const dataToSend = { fila, respawns: allRespawnNames };
        if (socket) {
            socket.emit('respawn:update', dataToSend);
        } else {
            io.emit('respawn:update', dataToSend);
        }
    } catch (error) {
        console.error("[ERRO] Falha em broadcastRespawnUpdates:", error);
    }
}
async function fetchWithTimeout(url, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

async function runAutomaticTasks() {
    try {
        const url = `https://api.tibiadata.com/v4/world/${encodeURIComponent(WORLD_NAME)}`;
        const response = await fetchWithTimeout(url, 5000);
        if (!response.ok) {
            console.error(`[API] Erro ao buscar jogadores na tarefa automática: Status ${response.status}.`);
            currentlyOnlinePlayers = new Set();
        } else {
            const data = await response.json();
            const players = data?.world?.online_players || [];
            currentlyOnlinePlayers = new Set(players.map(p => p.name));
        }

        const result = await bot.processExpiredRespawns(currentlyOnlinePlayers);
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

        const relations = await bot.getRelationsData();
        
        cleanupAlertMap(huntedLastAlert, relations.players_hunteds);
        cleanupAlertMap(enemyLastAlert, relations.players_enemies);

        await sendRelationAlert(relations.players_hunteds, huntedLastAlert, HUNTED_ALERT_COOLDOWN, 'bot:hunted_online', '[ALERTA HUNTED]');
        await sendRelationAlert(relations.players_enemies, enemyLastAlert, ENEMY_ALERT_COOLDOWN, 'bot:enemy_online', '[ALERTA INIMIGO]');
    } catch (error) {
        console.error("[ERRO] Falha nas tarefas automáticas:", error);
    }
}

async function loopAutomaticTasks() {
    while (true) {
        try {
            await runAutomaticTasks();
        } catch (e) {
            console.error("Erro em runAutomaticTasks:", e);
        }
        await new Promise(r => setTimeout(r, 60000));
    }
}
loopAutomaticTasks();
 

server.listen(PORT, async () => {
    console.log(`Servidor para o mundo [${WORLD_NAME}] rodando na porta http://127.0.0.1:${PORT}.`);

    await updateCaches();
    console.log('Iniciando a primeira sincronização de guilds em segundo plano...');
    
    // Aplica a lógica de controle também na primeira sincronização
    if (!isSyncingRelations) {
        isSyncingRelations = true;
        bot.syncAllRelations().then(updatedData => {
            io.emit('friends:dataUpdated', updatedData);
            console.log('Primeira sincronização em segundo plano concluída.');
        }).catch(error => {
            console.error('[INITIAL SYNC ERROR]', error);
        }).finally(() => {
            isSyncingRelations = false;
        });
    }
});

const MEMORY_LIMIT_MB = 200;

setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const memoryUsageInMB = memoryUsage.rss / 1024 / 1024;

    console.log(`[MEMÓRIA] Uso atual: ${memoryUsageInMB.toFixed(2)} MB / ${MEMORY_LIMIT_MB} MB`);

    if (memoryUsageInMB > MEMORY_LIMIT_MB) {
        console.error(`[RESTART] Limite de memória de ${MEMORY_LIMIT_MB} MB excedido.`);
        console.error(`[RESTART] Uso atual: ${memoryUsageInMB.toFixed(2)} MB. Finalizando o processo para reinício.`);
                process.exit(1);
    }
}, 30000); // Verificando a cada 30 segundos

setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [ip, expires] of blockedIPs.entries()) {
        if (now >= expires) {
            blockedIPs.delete(ip);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`[CLEANUP] Limpeza de ${cleanedCount} IP(s) expirados do mapa de bloqueio.`);
    }
}, 10 * 60 * 1000);

setInterval(() => {
    broadcastRespawnUpdates();
}, 60000); // 60 segundos