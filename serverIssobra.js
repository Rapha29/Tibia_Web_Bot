// server.js 

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const fetch = require('node-fetch');
const { updateLocalBossData, ...bot } = require('./bot_logic.js');
const activeUsers = new Map();
const pointsLogic = require('./points_logic.js');
const warModule = require('./war_module.js');

const app = express();
app.set('trust proxy', 'loopback'); 

app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; " + 
        "font-src 'self' cdnjs.cloudflare.com; " +
        "connect-src 'self'; " +
        "img-src 'self' data: https://static.tibia-statistic.com; " + // Adicionado o domínio
        "object-src 'none';"
    );

    next();
});
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e5,
    pingInterval: 10000,
    pingTimeout: 5000  
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

const generateFilename = (bossName) => {
    if (!bossName) return 'unknown.gif';
    // Converte para minúsculas, substitui espaços/caracteres especiais por underscore, remove múltiplos underscores, adiciona .gif
    return bossName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_') + '.gif';
};

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


const webUsers = new Map();
const adminRanks = ["leader alliance", "leader", "vice leader"];
const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
const ADMIN_GROUP_ID = 'suporte';
const qeqAdmins = ['rapha2929@gmail.com'];

/**
 * Verifica se o usuário tem permissão de administrador (Líder OU grupo 'suporte').
 * @param {object} user - O objeto de sessão do usuário.
 * @returns {boolean}
*/
function hasAdminAccess(user) {
    if (!user || !user.character) return false;
    
    // 1. Verifica se tem o rank de admin
    const hasRank = adminRanks.includes(user.character.guildRank?.toLowerCase());
    if (hasRank) return true;
    
    // 2. Se não tiver o rank, verifica se tem o grupo 'suporte'
    const userGroups = user.character.groups || [];
    const hasGroup = userGroups.includes(ADMIN_GROUP_ID);
    
    return hasGroup;
}

/**
 * Verifica se o usuário tem permissão de admin para o sistema de pontos.
 * @param {object} user - O objeto de sessão do usuário.
 * @returns {boolean}
*/
function hasPointsAdminAccess(user) {
    if (!user || !user.character) return false;
    
    // 1. Verifica se tem o rank de admin de pontos
    const hasRank = pointsAdminRanks.includes(user.character.guildRank?.toLowerCase());
    if (hasRank) return true;
    
    // 2. Se não tiver o rank, verifica se tem o grupo 'suporte'
    const userGroups = user.character.groups || [];
    const hasGroup = userGroups.includes(ADMIN_GROUP_ID);
    
    return hasGroup;
}


let cachedRespawnsData = {};
let cachedClientAccounts = {};
let characterDetailsMap = new Map();
let isSyncingRelations = false; 
let currentlyOnlinePlayers = new Set();
let warCheckInterval = null; 
let isWarModeActive = false;

/**
 * Verifica se o usuário pertence à guilda configurada.
 * @param {object} user - Sessão do usuário.
 */
function isGuildMember(user) {
    const userRank = user?.character?.guildRank?.toLowerCase();
    // Verifica se rank existe e não é um status de saída/erro
    return user && user.character && userRank && 
           userRank !== 'n/a' && 
           userRank !== 'left guild' && 
           userRank !== 'not found';
}

function canAccessRestrictedContent(user) {
    // Se War Mode desligado, acesso liberado (ou defina false se quiser privado sempre)
    if (!isWarModeActive) return true;

    // Se War Mode ligado:
    // 1. Bloqueia imediatamente se não estiver logado ou sem char selecionado
    if (!user || !user.character) return false;

    // 2. Bloqueia se o rank não estiver na lista permitida
    const allowedRanks = ["leader alliance", "leader", "vice leader", "prodigy", "hero", "major", "rising", "member", "membro novo", "recruta", "Academy"];
    const userRank = user.character.guildRank?.toLowerCase();
    
    return allowedRanks.includes(userRank);
}

bot.init(WORLD_NAME);

console.log(`[CONFIG] Configuração carregada para o mundo [${WORLD_NAME}] na porta [${PORT}]`);

const HUNTED_ALERT_COOLDOWN = 30 * 60 * 1000;
const huntedLastAlert = new Map();
const ENEMY_ALERT_COOLDOWN = 30 * 60 * 1000;
const enemyLastAlert = new Map();   
const huntedLastLevel = new Map(); 
const allyLastLevel = new Map();
const enemyLastLevel = new Map();
let currentPlayerData = new Map();

async function updateCaches() {
    try {
        cachedRespawnsData = await bot.loadJsonFile(path.join(__dirname, 'respawns.json'), {});
        cachedClientAccounts = await bot.loadJsonFile(path.join(__dirname, 'clientaccount.json'), {});

        characterDetailsMap.clear();
        for (const email in cachedClientAccounts) {
            if (cachedClientAccounts[email].tibiaCharacters) {
                cachedClientAccounts[email].tibiaCharacters.forEach(char => {
                    if (char && char.characterName) {
                        characterDetailsMap.set(char.characterName.toLowerCase(), char);
                    }
                });
            }
        }
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

/**
 * Agenda a sincronização de XP, depois, repete a cada 24h.
 */
// function scheduleXpSync() {
//     const now = new Date(); 
//     const nextSync = new Date(); 
//     // Define a hora da próxima execução para 5:00:00
//     nextSync.setHours(5, 0, 0, 0); 
//     // Se a hora atual já passou das 5h, agenda para o dia seguinte
//     if (now > nextSync) { 
//         nextSync.setDate(nextSync.getDate() + 1);
//     } 

//     const timeToNextSync = nextSync.getTime() - now.getTime();
//     console.log(`[XP SYNC] Próxima sincronização de XP agendada para ${nextSync.toLocaleString('pt-BR')}.`); 
//     setTimeout(() => { 
//         // Executa a primeira vez
//         pointsLogic.fetchAndProcessXP();

//         // Depois, agenda para repetir a cada 24 horas
//         setInterval(() => {
//             pointsLogic.fetchAndProcessXP();
//         }, 24 * 60 * 60 * 1000);
//     }, 
// timeToNextSync);
// }


function scheduleWarzoneAttendanceCheck() {
    const now = new Date();
    const nextCheck = new Date();

    // Define a hora da próxima execução para 4:00:00
    nextCheck.setHours(4, 0, 0, 0);

    // Se a hora atual já passou das 4h, agenda para o dia seguinte
    if (now > nextCheck) {
        nextCheck.setDate(nextCheck.getDate() + 1);
    }

    const timeToNextCheck = nextCheck.getTime() - now.getTime();


    // Aguarda até as 4h da manhã
    setTimeout(() => {
        pointsLogic.updateAttendanceForMissedWarzoneDays(); // Primeira execução

        // Depois, agenda para repetir a cada 24 horas
        setInterval(() => {
            pointsLogic.updateAttendanceForMissedWarzoneDays();
        }, 24 * 60 * 60 * 1000);
    }, timeToNextCheck);
}


// Inicia os agendadores Warzone quando o servidor arranca
// scheduleWarzoneAttendanceCheck();
// Inicia o agendador da tarefa de XP quando o servidor arranca
// scheduleXpSync();

io.on('connection', (socket) => {
//     // --- LÓGICA DE DETECÇÃO DE IP ---
//     const forwardedFor = socket.handshake.headers['x-forwarded-for'];
//     const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : socket.handshake.address;

//     const now = Date.now();

//Listener Painel de guerra (War)
// socket.on('war:getStatus', () => {
//     socket.emit('war:statusUpdate', isWarModuleActive);
// });
async function broadcastRestrictedUpdate(eventName, data, emptyData = []) {
    const sockets = await io.fetchSockets();
    for (const sock of sockets) {
        const user = webUsers.get(sock.id);
        if (canAccessRestrictedContent(user)) {
            sock.emit(eventName, data);
        } else {
            // Envia dados vazios para limpar a tela do usuário não autorizado
            sock.emit(eventName, emptyData);
        }
    }
}

socket.on('war:getData', async (options) => {
    try {
        const user = webUsers.get(socket.id);
        
        if (!canAccessRestrictedContent(user)) {
             socket.emit('bot:response', '🔒 WAR MODE ATIVO: Painel restrito à guilda.' );
             socket.emit('war:dataUpdated', { 
                filterRangeDescription: 'Acesso Restrito', 
                lastChecked: null, 
                summary: {}, 
                rankings: {}, 
                statsByVocation: {} 
            });
            return;
        }

        const dateRange = options?.dateRange || 'today';
        const warStats = await warModule.getWarStats(dateRange);
        socket.emit('war:dataUpdated', warStats);

    } catch (error) {
        console.error("[WAR MODULE] Erro:", error);
        socket.emit('war:dataUpdated', { filterRangeDescription: 'Erro', summary: {}, rankings: {}, statsByVocation: {} });
    }
});

// socket.on('war:toggle', (newState) => {
//     const user = webUsers.get(socket.id);
//     if (hasAdminAccess(user)) { // Apenas admins podem ligar/desligar
//         isWarAlertActive = !!newState;
//         io.emit('war:statusUpdate', isWarAlertActive); // Notifica todos os clientes
//     }
// });


socket.on('admin:deleteUser', async (targetEmail) => {
    const user = webUsers.get(socket.id);
    if (hasAdminAccess(user)) {
        // Impede que se delete o próprio super admin hardcoded, se necessário
        if (qeqAdmins.includes(targetEmail)) {
            socket.emit('bot:response', { type: 'error', text: 'Não é possível deletar o Super Admin.' });
            return;
        }

        const result = await bot.adminDeleteUser(targetEmail);
        
        if (result.success) {
            // Remove da lista de usuários ativos se estiver logado
            if (activeUsers.has(targetEmail)) {
                const targetSocketId = activeUsers.get(targetEmail);
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('system:force_disconnect', 'Sua conta foi removida por um administrador.');
                    targetSocket.disconnect(true);
                }
                activeUsers.delete(targetEmail);
            }

            await updateCaches();
            const usersForDisplay = await bot.adminGetUsersForDisplay();
            const adminData = await bot.adminGetFullData();

            io.emit('admin:usersUpdate', usersForDisplay);
            io.emit('admin:dataUpdate', adminData);
            socket.emit('bot:success_notification', { message: 'Usuário removido com sucesso.' });
        } else {
            socket.emit('bot:response', { type: 'error', text: result.message });
        }
    } else {
        console.warn(`[SECURITY] Tentativa não autorizada de 'admin:deleteUser' pelo socket ${socket.id}`);
    }
});


// Listener para pegar os tokens
    socket.on('tokens:getData', async () => {
        const data = await bot.getBossTokens();
        socket.emit('tokens:dataReceived', data);
    });

    // Listener para atualizar tokens (apenas Admin)
    socket.on('tokens:update', async (newTokensList) => {
        const user = webUsers.get(socket.id);
        if (hasAdminAccess(user)) {
            await bot.updateBossTokens(newTokensList);
            // Envia notificação e atualiza a todos que estiverem com o modal aberto
            socket.emit('bot:success_notification', { message: 'Valores dos tokens atualizados com sucesso.' });
            const updatedData = await bot.getBossTokens();
            io.emit('tokens:dataReceived', updatedData);
        } else {
            socket.emit('bot:response', { type: 'error', text: 'Sem permissão para editar tokens.' });
        }
    });


socket.on('admin:updateUser', async (data) => {
        const user = webUsers.get(socket.id);
        if (hasAdminAccess(user)) {
            // data deve conter: { originalEmail, name, email, phone }
            const result = await bot.adminUpdateUserData(data.originalEmail, data);

            if (result.success) {
                await updateCaches();
                
                // Atualiza as listas para todos os admins conectados
                const usersForDisplay = await bot.adminGetUsersForDisplay();
                const adminData = await bot.adminGetFullData();
                io.emit('admin:usersUpdate', usersForDisplay);
                io.emit('admin:dataUpdate', adminData);

                // Se o e-mail mudou, atualiza o mapa de usuários ativos
                if (data.originalEmail !== data.email) {
                    const socketId = activeUsers.get(data.originalEmail);
                    if (socketId) {
                        activeUsers.delete(data.originalEmail);
                        activeUsers.set(data.email, socketId);
                        // Opcional: Avisar o usuário que seus dados mudaram
                        io.to(socketId).emit('bot:private_message', { message: 'Seus dados cadastrais foram atualizados por um administrador.' });
                    }
                }

                socket.emit('bot:success_notification', { message: 'Dados do usuário atualizados com sucesso.' });
            } else {
                socket.emit('bot:response', { type: 'error', text: result.message });
            }
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:updateUser' pelo socket ${socket.id}`);
        }
    });

// Listener CORRIGIDO para obter o histórico de bosses encontrados por um jogador
socket.on('bosses:getFinderHistory', async ({ characterName }) => {
    if (isRateLimited(socket.id, 'bosses:getFinderHistory', 5, 10)) return;
    // A verificação de login "if (user && user.character)" foi REMOVIDA para permitir acesso público
    const history = await bot.getFinderHistory(characterName);
    socket.emit('bosses:finderHistoryData', { characterName, history });
});

// Listener para o check de um usuário anônimo
socket.on('bosses:anonymousCheck', async ({ bossName, characterName }) => {
    // Limita para 5 checks a cada 60 segundos por conexão
    if (isRateLimited(socket.id, 'bosses:anonymousCheck', 5, 60)) return;
    
    // Validação básica
    if (!bossName || !characterName || typeof characterName !== 'string' || characterName.trim().length === 0) {
        return; // Ignora a requisição se os dados forem inválidos
    }

    await bot.recordBossCheck({ bossName, characterName: characterName.trim() });
    
    // Envia os dados atualizados para TODOS os clientes
    const updatedData = await bot.getBossesData();
    io.emit('bosses:dataUpdated', updatedData);
});

// Listener para o registro de 'encontrado' de um usuário anônimo
socket.on('bosses:anonymousRecordFound', async (data) => {
    // Limita para 2 registros a cada 60 segundos por conexão
    if (isRateLimited(socket.id, 'bosses:anonymousRecordFound', 2, 60)) return;

    // Validação básica
    if (!data.bossName || !data.characterName || typeof data.characterName !== 'string' || data.characterName.trim().length === 0) {
        return; // Ignora a requisição se os dados forem inválidos
    }

    // A função recordBossFound já aceita um objeto com todos os dados necessários
    await bot.recordBossFound({ ...data, characterName: data.characterName.trim() });

    const wikiUrl = bot.createWikiLink(data.bossName);
    const detailsLink = `[url=${wikiUrl}](Detalhes)[/url]`;

    let message = `[b]${data.bossName}[/b] ${detailsLink} \n Boss encontrado por ${data.characterName.trim()}!`;
    if (data.deathTime) message += `\n- Hora da Morte: ${data.deathTime}`;
    if (data.tokens) message += `\n- Tokens: ${data.tokens}`;
    if (data.observation) message += `\n- Obs: ${data.observation}`;
    
    io.emit('bot:broadcast_notification', { type: 'info', message });

    const updatedData = await bot.getBossesData();
    io.emit('bosses:dataUpdated', updatedData);
});

socket.on('bosses:getHistory', async ({ bossName }) => {
    if (isRateLimited(socket.id, 'bosses:getHistory', 5, 10)) return;
    const user = webUsers.get(socket.id);
    if (user && user.character) {
        const history = await bot.getBossHistory(bossName); // USE A NOVA FUNÇÃO
        socket.emit('bosses:historyData', { bossName, history });
    }
});

// Listener para obter o histórico de checks de um jogador
socket.on('bosses:getCheckerHistory', async ({ characterName }) => {
    if (isRateLimited(socket.id, 'bosses:getCheckerHistory', 5, 10)) return;
    // A verificação de login "if (user && user.character)" foi REMOVIDA para permitir acesso público
    const history = await bot.getCheckerHistory(characterName);
    socket.emit('bosses:checkerHistoryData', { characterName, history });
});


socket.on('bosses:recordFound', async (data) => {
    try {
        const characterName = data.characterName ? data.characterName.trim() : null;

        if (!characterName) {
            return; // O cliente já deve ter validado, mas é uma segurança extra.
        }

        // ... (resto do código para rate limit, salvar e notificar) ...

        await bot.recordBossFound({ ...data, characterName });

        const wikiUrl = bot.createWikiLink(data.bossName);
        const detailsLink = `[url=${wikiUrl}](Detalhes)[/url]`;
        let message = `[b]${data.bossName}[/b] ${detailsLink} \n Boss encontrado por ${characterName}!`;
        if (data.deathTime) message += `\n- Hora da Morte: ${data.deathTime}`;
        if (data.tokens) message += `\n- Tokens: ${data.tokens}`;
        if (data.observation) message += `\n- Obs: ${data.observation}`;
        io.emit('bot:broadcast_notification', { type: 'info', message });

        const updatedData = await bot.getBossesData();
        io.emit('bosses:dataUpdated', updatedData);

    } catch (error) {
        console.error(`[ERRO CRÍTICO no listener bosses:recordFound]:`, error);
    }
});

        // Listener para o líder atualizar o status de um agendamento (Falta/Double)
    socket.on('planilhado:updateAssignmentStatus', async (payload) => {
        const user = webUsers.get(socket.id);
    if (hasAdminAccess(user)) { // << MUDANÇA APLICADA AQUI
            const result = await bot.updatePlanilhadoAssignmentStatus(payload);
            if (result.success) {
                socket.emit('bot:success_notification', { message: 'Status do agendamento atualizado.' });
                broadcastPlanilhadoUpdate('normal');
                broadcastPlanilhadoUpdate('double');
            } else {
                socket.emit('bot:response', { type: 'error', text: result.message });
            }
        }
    });

let isUpdatingBosses = false; // Flag para evitar múltiplas atualizações simultâneas

socket.on('bosses:getData', async () => {
    if (isRateLimited(socket.id, 'bosses:getData', 5, 10)) return;

    try {
        // 1. Envia imediatamente os dados do cache atual para o usuário.
        const currentData = await bot.getBossesData();
        socket.emit('bosses:dataUpdated', currentData);

        // 2. Verifica se uma atualização em segundo plano é necessária.
        const localData = await bot.loadJsonFile(path.join(__dirname, 'boss_data_local.json'));
        const today = new Date().toDateString();
        const lastUpdateDate = localData.lastUpdated ? new Date(localData.lastUpdated).toDateString() : null;

        // Inicia a atualização apenas se o cache estiver antigo E nenhuma outra atualização estiver em andamento.
        if (lastUpdateDate !== today && !isUpdatingBosses) {
            isUpdatingBosses = true;
            
            // 3. Executa a atualização sem 'await', para não bloquear.
            updateLocalBossData().then(async (result) => {
                if (result.success) {
                    const newData = await bot.getBossesData();
                    io.emit('bosses:dataUpdated', newData); // Envia os dados atualizados para TODOS os clientes.
                }
            }).catch(error => {
                console.error('[BOSS SYNC] Erro na atualização em segundo plano:', error);
            }).finally(() => {
                isUpdatingBosses = false; // Libera a flag.
            });
        }
    } catch (error) {
        console.error('[BOSS CACHE] Erro ao processar bosses:getData:', error);
    
        // Em vez de travar, envia uma mensagem de erro para a interface
        socket.emit('bot:response', { type: 'error', text: 'Falha ao buscar os dados dos bosses no momento. A fonte externa pode estar indisponível.' });
        // Envia um objeto vazio para limpar a página de bosses em caso de erro, evitando que dados antigos sejam mostrados.
        socket.emit('bosses:dataUpdated', { killedYesterday: [], bossList: [], ranking: [] });
    }
});

    socket.on('bosses:check', async ({ bossName }) => {
        if (isRateLimited(socket.id, 'bosses:check', 10, 60)) return; // Limita 10 checks por minuto
        const user = webUsers.get(socket.id);
        if (user && user.character) {
            await bot.recordBossCheck({ bossName, characterName: user.character.characterName });
            // Após registrar, busca todos os dados atualizados e envia para todos
            const updatedData = await bot.getBossesData();
            io.emit('bosses:dataUpdated', updatedData);
        } else {
            socket.emit('bot:response', { type: 'error', text: 'Você precisa estar logado para fazer um check.' });
        }
    });

    // Listener para o líder deletar um grupo inteiro
    socket.on('planilhado:deleteGroup', async (payload) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            const result = await bot.deletePlanilhadoGroup(payload);
            if (result.success) {
                socket.emit('bot:success_notification', { message: `Grupo de ${payload.groupLeader} deletado com sucesso.` });
                broadcastPlanilhadoUpdate('normal');
                broadcastPlanilhadoUpdate('double');
            } else {
                socket.emit('bot:response', { type: 'error', text: result.message });
            }
        }
    });

    // // 1. Verifica se o IP já está bloqueado
    // const blockExpires = blockedIPs.get(ip);
    // if (blockExpires && now < blockExpires) {
    //     const remainingMinutes = Math.ceil((blockExpires - now) / 60000);
    //     console.warn(`[SECURITY] Conexão bloqueada do IP ${ip}. Bloqueio termina em ${remainingMinutes} min.`);
    //     socket.emit('system:blocked', { duration: remainingMinutes });
    //     socket.disconnect(true);
    //     return;
    // } else if (blockExpires && now >= blockExpires) {
    //     blockedIPs.delete(ip);
    // }

    // // 2. Rastreia tentativas de conexão no último minuto
    // let attempts = connectionAttempts.get(ip) || [];
    // attempts = attempts.filter(timestamp => now - timestamp < 60000);
    // attempts.push(now);
    // connectionAttempts.set(ip, attempts);

    // // 3. Se exceder o limite, bloqueia e LOGA A TENTATIVA DE ATAQUE
    // if (attempts.length > 5) {
    //     console.error(`[SECURITY] IP ${ip} bloqueado por 10 minutos por excesso de recarregamentos.`);
    //     blockedIPs.set(ip, now + 600000);
    //     connectionAttempts.delete(ip);

    //     bot.logUnderAttack({
    //         type: 'Connection Flood',
    //         ip: ip, 
    //         reason: `Mais de 5 conexões em 1 minuto. Bloqueado por 10 minutos.`,
    //         accountName: 'N/A',
    //         email: 'N/A',
    //         phone: 'N/A',
    //         character: 'N/A'
    //     });
        
    //     socket.emit('system:blocked', { duration: 10 });
    //     socket.disconnect(true);
    //     return;
    // }
    // // --- FIM DA LÓGICA DE BLOQUEIO DE IP ---

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
        clientTimeInfo: null, 
        welcomeTimeout: null
    };

    webUsers.set(socket.id, userSession);

    broadcastRespawnUpdates(socket);

        //-----------------------------------------------//
    //----------- LISTENERS DO SISTEMA DE PONTOS -----------//
    //-----------------------------------------------//

    //Adicionar/Remover grupos em massa
    socket.on('admin:updateMultipleUserGroups', async (data) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await bot.adminBatchUpdateUserGroups(data);

            // Dispara uma atualização global para que todos os painéis de admin reflitam a mudança
            await updateCaches();
            const usersForDisplay = await bot.adminGetUsersForDisplay();
            const adminData = await bot.adminGetFullData();

            io.emit('admin:usersUpdate', usersForDisplay);
            io.emit('admin:dataUpdate', adminData);
            socket.emit('bot:success_notification', { message: `Alteração em massa de grupos realizada com sucesso.` });
        } else {
            console.warn(`[SECURITY] Tentativa não autorizada de 'admin:updateMultipleUserGroups' pelo socket ${socket.id}`);
            socket.emit('bot:response', { type: 'error', text: 'Acesso negado.' });
        }
});
    // Envia os dados de pontos quando a página é carregada
    socket.on('points:getData', async () => {
        try {
            const data = await pointsLogic.getPointsData();
            socket.emit('points:dataUpdated', data);
        } catch (error) {
            console.error('[POINTS_SYSTEM] Erro ao obter dados de pontos:', error);
            socket.emit('bot:response', { type: 'error', text: 'Ocorreu um erro ao carregar os dados de ranking.' });
        }
    });

    // Adiciona presença na Warzone a partir do log
socket.on('points:addWarzone', async (logText) => {
    const user = webUsers.get(socket.id);
    // Esta é a lista que deve ser usada, contendo líderes e prodigy
    const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];

    // A verificação foi corrigida para usar a lista correta
if (hasPointsAdminAccess(user)) {        const result = await pointsLogic.addWarzoneAttendance(logText);
        socket.emit('bot:response', { type: result.success ? 'success' : 'error', text: result.message });
        if (result.success) {
            const data = await pointsLogic.getPointsData();
            io.emit('points:dataUpdated', data); // Atualiza todos os clientes
        }
    } else {
        // Adicionado para dar feedback em caso de falta de permissão
        socket.emit('bot:response', { type: 'error', text: 'Você não tem permissão para adicionar presenças na Warzone.' });
    }
});

    socket.on('points:saveWarzoneChanges', async (changes) => {
        const result = await pointsLogic.saveWarzoneChanges(changes);
        if (result.success) {
            // Avisa o cliente que salvou com sucesso
            socket.emit('points:saveChangesConfirmed', result.message);
            // Envia os dados atualizados para TODOS os clientes conectados
            io.emit('points:dataUpdated', await pointsLogic.getPointsData());
        }
    });

// Adiciona pontos de Eventos
socket.on('points:addEvent', async ({ players, participations }) => { // Corrigido de playerName para players
    const user = webUsers.get(socket.id);
    const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
if (hasPointsAdminAccess(user)) {
            const result = await pointsLogic.addEventPoints(players, participations); // Passando o array players
        socket.emit('bot:response', { type: 'success', text: `Pontos de evento para ${players.join(', ')} atualizados.` });
        if (result.success) {
            const data = await pointsLogic.getPointsData();
            io.emit('points:dataUpdated', data);
        }
    }
});

// Adiciona pontos de Hive
socket.on('points:addHive', async ({ players, tasks }) => { // Corrigido de playerName para players
    const user = webUsers.get(socket.id);
    const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
if (hasPointsAdminAccess(user)) {
            const result = await pointsLogic.addHivePoints(players, tasks); // Passando o array players
        socket.emit('bot:response', { type: 'success', text: `Pontos de Hive para ${players.join(', ')} atualizados.` });
        if (result.success) {
            const data = await pointsLogic.getPointsData();
            io.emit('points:dataUpdated', data);
        }
    }
});

// Adiciona pontos de KS (atrapalhar inimigo)
socket.on('points:addKS', async ({ players, hours }) => { // Corrigido de playerName para players
    const user = webUsers.get(socket.id);
    const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
if (hasPointsAdminAccess(user)) {
            const result = await pointsLogic.addKSPoints(players, hours); // Passando o array players
        socket.emit('bot:response', { type: 'success', text: `Pontos de KS para ${players.join(', ')} atualizados.` });
        if (result.success) {
            const data = await pointsLogic.getPointsData();
            io.emit('points:dataUpdated', data);
        }
    }
});
    
    // Adiciona pontos de Mountain Piece
    socket.on('points:addMountainPiece', async ({ players, pieces }) => {
        const user = webUsers.get(socket.id);
        const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            
            const piecesPerBackpack = 20; // 20 peças por backpack
            const backpacksNeeded = 4; // precisa de 4 backpacks
            const piecesRequired = piecesPerBackpack * backpacksNeeded; // 80 peças
            
            // Cada conjunto de 80 peças dá 2 pontos
            const pointsPerSet = 2;

            // Calcula quantos conjuntos completos existem
            const fullSets = Math.floor(pieces / piecesRequired);
            const totalPoints = fullSets * pointsPerSet;
            
            const reason = `${pieces} peça(s) entregue(s) (${fullSets} conjunto(s) válido(s))`;

            if (players && players.length > 0 && totalPoints > 0) {
                await pointsLogic.addPoints('MountainPiece', totalPoints, players, reason);
                socket.emit('bot:response', { type: 'success', text: 'Pontos de Mountain Piece adicionados com sucesso.'});
                const data = await pointsLogic.getPointsData();
                io.emit('points:dataUpdated', data);
            } else {
                socket.emit('bot:response', { type: 'error', text: 'Quantidade insuficiente para gerar pontos (mínimo 4 backpacks).' });
            }
        }
    });

    // Adiciona pontos de Services
socket.on('points:addService', async ({ players, serviceName }) => {
    const user = webUsers.get(socket.id);
    const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
if (hasPointsAdminAccess(user)) {

        const result = await pointsLogic.addPoints('Services', 1, players, serviceName);

        if (result && result.success) {
            socket.emit('bot:response', { type: 'success', text: 'Pontos de Service adicionados com sucesso.' });
            const data = await pointsLogic.getPointsData();
            io.emit('points:dataUpdated', data);
        } else {
            socket.emit('bot:response', { type: 'error', text: 'Falha ao adicionar pontos de Service.' });
        }
    }
});
    // Listener para o líder editar um registo de pontos
    socket.on('points:editEntry', async ({ player, category, entryId, newData }) => {
        const user = webUsers.get(socket.id);
        const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            const result = await pointsLogic.editPointEntry(player, category, entryId, newData);
            socket.emit('bot:response', { type: result.success ? 'success' : 'error', text: result.message });
            if (result.success) {
                const data = await pointsLogic.getPointsData();
                io.emit('points:dataUpdated', data);
            }
        }
    });
    
    // Listener para o líder remover um registo de pontos
socket.on('points:removeEntry', async ({ player, category, entryId }) => {
        const user = webUsers.get(socket.id);
        if (hasPointsAdminAccess(user)) {
            const result = await pointsLogic.removePointEntry(player, category, entryId);
            socket.emit('bot:response', { type: result.success ? 'success' : 'error',
text: result.message }); 
            if (result.success) { 
                const data = await pointsLogic.getPointsData();
                io.emit('points:dataUpdated', data);
            }
        } else {
             socket.emit('bot:response', { type: 'error', text: 'Você não tem permissão para remover entradas de pontos.' });
        }
    });

    // Listener para arquivar o mês atual e zerar os pontos
    socket.on('points:archiveAndReset', async () => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            const result = await pointsLogic.archiveCurrentMonth();
            socket.emit('bot:response', { type: result.success ? 'success' : 'error', text: result.message });
            if (result.success) {
                const data = await pointsLogic.getPointsData();
                io.emit('points:dataUpdated', data);
            }
        }
    });

    // Listener para obter o histórico de um mês específico
    socket.on('points:getHistory', async ({ month }) => { // ex: month = '2025-07'
        const data = await pointsLogic.getHistoryData(month);
        socket.emit('points:historyDataUpdated', data);
    });
 // Listener para o líder forçar a atualização do XP
    socket.on('points:forceXpSync', async () => {
        const user = webUsers.get(socket.id);
        const pointsAdminRanks = ["leader alliance", "leader", "vice leader", "prodigy"];
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            await pointsLogic.fetchAndProcessXP();
            socket.emit('bot:response', { type: 'success', text: 'Sincronização de XP iniciada.' });
            // Dá um tempo para o cálculo e atualiza todos
            setTimeout(async () => {
                const data = await pointsLogic.getPointsData();
                io.emit('points:dataUpdated', data);
            }, 2000);
        }
    });

    // Listener para o líder atualizar o URL do CSV
    socket.on('points:updateXpUrl', async (newUrl) => {
        const user = webUsers.get(socket.id);
        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {
            const result = await pointsLogic.updateXpCsvUrl(newUrl);
            socket.emit('bot:response', { type: 'success', text: result.message });
        }
    });

    // Historico de ranking
    socket.on('history:getAvailableMonths', async () => {
        const months = await pointsLogic.getAvailableHistory();
        socket.emit('history:availableMonths', months);
    });

    socket.on('history:getMonthData', async (monthStr) => {
        const result = await pointsLogic.getHistoryData(monthStr);
        socket.emit('history:monthData', result);
    });

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
            clearTimeout(foundUser.welcomeTimeout);
    
            // --- INÍCIO DA LÓGICA DE SESSÃO ÚNICA ---
            const oldSocketId = activeUsers.get(userEmail);
            if (oldSocketId && oldSocketId !== socket.id) {
                console.log(`[SECURITY] Desconectando sessão antiga para ${userEmail} do socket ${oldSocketId}.`);
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

    userSession.welcomeTimeout = setTimeout(() => {
        const user = webUsers.get(socket.id);
        // A condição continua a mesma
        if (user && !user.account) {
            socket.emit('bot:response', "👋 Bem-vindo! Digite !help para ver a lista de comandos disponíveis.");
            const welcomeMessage = { type: 'actionable_message', text: 'Você não está logado.\n\nPor favor, faça login ou crie uma nova conta para continuar.', actions: [{ buttonText: 'Entrar (Login)', command_to_run: '!showlogin' }, { buttonText: 'Criar Conta', command_to_run: '!showregistration' }, { buttonText: 'Recuperar Conta', command_to_run: '!recover' }], text: 'Se ja estiver Logado apenar aperte F5 para atualizar a página' };
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
    if (isRateLimited(socket.id, 'friends:getData', 5, 10)) return;

    // BLOQUEIO WAR MODE (Mantenha sua lógica de verificação aqui)
    const user = webUsers.get(socket.id);
    if (!canAccessRestrictedContent(user)) {
         socket.emit('bot:response', { type: 'error', text: '⛔ Acesso negado: War Mode Ativo.' });
         socket.emit('friends:dataUpdated', { players_allies: [], players_enemies: [], players_hunteds: [] });
         return;
    }

    const data = await bot.getRelationsData();
    const onlineSet = await getOnlinePlayers(); 
    
    // Criação de um Set auxiliar normalizado (lowercase)
    const onlineSetLower = new Set();
    onlineSet.forEach(name => onlineSetLower.add(name.toLowerCase()));

    for (const key of ['players_allies', 'players_enemies', 'players_hunteds']) {
        if (data && data[key]) {
            data[key] = data[key].map(p => ({ 
                ...p, 
                // Verifica contra o set normalizado
                online: p.name && onlineSetLower.has(p.name.toLowerCase()) 
            }));
        }
    }
    
    if(data) data.last_sync = Date.now();
    socket.emit('friends:dataUpdated', data);
});

    socket.on('admin:addRelation', async (relationData) => {
        const adminRanks = ["leader alliance", "leader", "vice leader", "Prodigy"];
        const user = webUsers.get(socket.id);

        if (user && user.character && adminRanks.includes(user.character.guildRank?.toLowerCase())) {

            const result = await bot.adminAddRelation(relationData);
            await broadcastRestrictedUpdate('friends:dataUpdated', result.updatedData, { players_allies: [], players_enemies: [], players_hunteds: [] });
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
            if (result && result.triggerAdminSync) {
                bot.adminSyncAllUsers(io, socket.id).then(async (syncResult) => {
                    // Quando terminar, envia o resultado FINAL para o admin que pediu
                    socket.emit('bot:response', syncResult.responseText);
                    
                    if (syncResult.adminDataUpdate) {
                        await updateCaches(); 
                        const adminData = await bot.adminGetFullData(); 
                        io.emit('admin:dataUpdate', adminData); 
                        const usersForDisplay = await bot.adminGetUsersForDisplay();
                        io.emit('admin:usersUpdate', usersForDisplay); 
                    }
                }).catch(err => {
                    console.error("[ADMIN SYNC] Erro na execução em segundo plano:", err);
                    socket.emit('bot:response', { type: 'error', text: 'Ocorreu um erro na sincronia em segundo plano.' });
                });
                
                result.triggerAdminSync = false; 
            }
        } else if (user.conversationState) {
            result = await bot.processConversationReply(message, user);
        } else {
            result = { responseText: `Comando não reconhecido. Comandos devem começar com '!' (ex: !help).` };
        }

  if (result && result.toggleWarMode !== undefined) {
    isWarModeActive = result.toggleWarMode;
    
    // Notifica visualmente (ícone/aviso)
    io.emit('warmode:status', isWarModeActive);

    // 1. Atualiza Respawns (Já existia)
    broadcastRespawnUpdates();

    // 2. ADICIONADO: Força atualização da Friends List (Limpa tela de intrusos)
    const relationsData = await bot.getRelationsData();
    await broadcastRestrictedUpdate('friends:dataUpdated', relationsData, { players_allies: [], players_enemies: [], players_hunteds: [] });

    // 3. ADICIONADO: Força atualização do Planilhado (Limpa tela de intrusos)
    broadcastPlanilhadoUpdate('normal');
    broadcastPlanilhadoUpdate('double');
    
    // 4. ADICIONADO: Força atualização do War Painel
    // Nota: O War Panel geralmente pede dados via socket, mas podemos enviar um sinal de reset
    if (isWarModeActive) {
        // Envia sinal para limpar dados de quem não tem permissão
        const sockets = await io.fetchSockets();
        for (const sock of sockets) {
            const user = webUsers.get(sock.id);
            if (!canAccessRestrictedContent(user)) {
                sock.emit('war:dataUpdated', { filterRangeDescription: 'Acesso Restrito', summary: {}, rankings: {}, statsByVocation: {} });
            }
        }
    }

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
        if (result && result.broadcastType === 'broadcast_notification') {
        io.emit('bot:broadcast_notification', result.broadcastPayload);}
        if (result && result.adminDataUpdate) { await updateCaches(); const adminData = await bot.adminGetFullData(); io.emit('admin:dataUpdate', adminData); }
        if (result && result.logoutSuccess) { await updateCaches(); if (user) { user.account = null; user.character = null; } socket.emit('user:status', { isAdmin: false }); }
            if (result && result.broadcastPointsUpdate) {
        const data = await pointsLogic.getPointsData();
        io.emit('points:dataUpdated', data);
    }
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

    const user = webUsers.get(socket.id);

    if (!canAccessRestrictedContent(user)) {
        socket.emit('bot:response', { type: 'error', text: '🔒 WAR MODE ATIVO: Acesso restrito à guilda.' });
        socket.emit('planilhado:dataUpdated', { type, data: { respawns: [], groups: [], schedule: {} } });
        return;
    }

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
        // SUBSTITUIÇÃO: Usa a função segura em vez de io.emit
        // io.emit('planilhado:dataUpdated', { type, data }); <--- REMOVER ESTA LINHA
        await broadcastRestrictedUpdate('planilhado:dataUpdated', { type, data }, { type, data: { respawns: [], groups: [], schedule: {} } });
    } catch (error) {
        console.error(`Erro ao fazer broadcast da planilha ${type}:`, error);
    }
}
    
socket.on('disconnect', () => {
    const user = webUsers.get(socket.id);
    if (user) {
        if (user.welcomeTimeout) {
            clearTimeout(user.welcomeTimeout);
            user.welcomeTimeout = null;
        }
        if (user.account && activeUsers.get(user.account.email) === socket.id) {
            activeUsers.delete(user.account.email);
        }
    }
    webUsers.delete(socket.id);
});

});

function checkAndEmitAdminStatus(socket) {
    const user = webUsers.get(socket.id);
    // A verificação antiga é substituída pela nova função
    const isAdmin = hasAdminAccess(user); 
    socket.emit('user:status', { isAdmin });
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
        const clientAccounts = cachedClientAccounts; // Alias para o cache global

        const plusStatusMap = {};
        const accountDataMap = {}; // Este é um clone local, o que é seguro.
        
        // --- ALTERAÇÃO: Remoção da (re)construção do characterDetailsMap ---
        // const characterDetailsMap = new Map(); // [1067] REMOVIDO
        
        for (const email in clientAccounts) {
            accountDataMap[email] = clientAccounts[email]; // [1068] MANTIDO (é um clone)
            
            // O loop que construía o mapa [1069-1070] foi REMOVIDO
            // (Agora usamos o mapa global construído pelo updateCaches)

            const mainChar = clientAccounts[email].tibiaCharacters?.[0]; // [1070] MANTIDO
            if (mainChar?.plusExpiresAt) { // [1071] MANTIDO
                plusStatusMap[email] = mainChar.plusExpiresAt; // [1072] MANTIDO
            }
        }
        // --- FIM DA ALTERAÇÃO ---

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

      
                        // 1. Tentar encontrar no cache GLOBAL
                        // Esta linha agora usa o 'characterDetailsMap' global
                        const cachedChar = characterDetailsMap.get(member.name.toLowerCase());
                        if (cachedChar) {
                   
                            memberDetails.level = cachedChar.level || 'N/A';
                            memberDetails.vocation = cachedChar.vocation || 'N/A';
                            memberDetails.guildRank = cachedChar.guildRank || 'N/A';
                        } else {
                            // 2. Se não encontrado no cache local, tentar buscar na API externa
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
        const emptyData = { fila: {}, respawns: {} }; // Dados vazios para bloqueados

        // Função auxiliar para envio
        const sendToSocket = (sock) => {
            const user = webUsers.get(sock.id);
            if (canAccessRestrictedContent(user)) {
                sock.emit('respawn:update', dataToSend);
            } else {
                sock.emit('respawn:update', emptyData); // Limpa a tela do usuário
            }
        };

        if (socket) {
            sendToSocket(socket);
        } else {
            const sockets = await io.fetchSockets();
            for (const sock of sockets) {
                sendToSocket(sock);
            }
        }
    } catch (error) {
        console.error("[ERRO] Falha em broadcastRespawnUpdates:", error);
    }
}


async function fetchWithTimeout(url, timeout = 10000) {
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
        
        // Variáveis temporárias para armazenar o novo estado
        let tempOnlinePlayerSet = new Set();
        let tempOnlinePlayerMap = new Map();
        let apiSuccess = false; // Flag de controle

        try {
            const response = await fetchWithTimeout(url, 5000);
            if (!response.ok) {
                console.error(`[API] Erro ao buscar jogadores na tarefa automática: Status ${response.status}. Mantendo cache anterior.`);
            } else {
                const data = await response.json();
                const players = data?.world?.online_players || [];
                
                for (const p of players) {
                    if (p.name && p.level) {
                        tempOnlinePlayerSet.add(p.name);
                        tempOnlinePlayerMap.set(p.name, p);
                    }
                }
                apiSuccess = true; // Marca sucesso apenas se chegou aqui
            }
        } catch (fetchError) {
             console.error("[API] Falha ao buscar jogadores online (fetch error). Mantendo cache anterior:", fetchError.message);
        }

        // SÓ atualiza as globais se a API respondeu corretamente
        if (apiSuccess) {
            currentlyOnlinePlayers = tempOnlinePlayerSet;
            currentPlayerData = tempOnlinePlayerMap;
        }

        // O resto do código continua usando currentlyOnlinePlayers (que será o novo ou o antigo)
        const result = await bot.processExpiredRespawns(currentlyOnlinePlayers);
        
        if (result && result.hasChanges) {
            broadcastRespawnUpdates();
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

         const plusResult = await bot.processExpiredPlusMembers();
         if (plusResult && plusResult.hasChanges) {
             await updateCaches();
         }

        //SISTEMA DE MORTES
        await warModule.checkWarActivity(currentlyOnlinePlayers);

        // Verificação de Level Ups
        const relations = await bot.getRelationsData();

        await checkRelationLevelUps(relations.players_allies, allyLastLevel, "ALLY", currentPlayerData);
        await checkRelationLevelUps(relations.players_enemies, enemyLastLevel, "ENEMY", currentPlayerData);
        await checkRelationLevelUps(relations.players_hunteds, huntedLastLevel, "HUNTED", currentPlayerData);

        cleanupAlertMap(huntedLastAlert, relations.players_hunteds);
        cleanupAlertMap(enemyLastAlert, relations.players_enemies);
        
        // Passa os mapas de alerta corretos
        await sendRelationAlert(relations.players_hunteds, huntedLastAlert, HUNTED_ALERT_COOLDOWN, 'bot:hunted_online', '[ALERTA HUNTED]');
        await sendRelationAlert(relations.players_enemies, enemyLastAlert, ENEMY_ALERT_COOLDOWN, 'bot:enemy_online', '[ALERTA INIMIGO]');

    } catch (error) {
        console.error("[ERRO] Falha nas tarefas automáticas:", error);
    }
}
// Calcula um atraso aleatório entre 15.000ms (15s) e 60.000ms (1min)
const initialDelay = Math.floor(Math.random() * (60000 - 15000 + 1) + 15000);


setTimeout(() => {
    runAutomaticTasks(); // 1. Executa a primeira vez após o atraso aleatório
    
    // 2. Inicia o ciclo fixo a partir deste momento
    setInterval(runAutomaticTasks, 120 * 1000); 
}, initialDelay);

/**
 * Verifica level-ups comparando o cache local com a lista de online players atual.
 * Não faz requisições de API, usa os dados já carregados em memória.
 */
async function checkRelationLevelUps(relationList, levelMap, relationType, onlinePlayersMap) {
    try {
        if (!relationList || !onlinePlayersMap) return;

        for (const player of relationList) {
            // Busca dados do player no mapa de online players baixado anteriormente
            // A chave no map pode vir de várias fontes, garantindo lowercase para match
            let onlinePlayer = onlinePlayersMap.get(player.name) || onlinePlayersMap.get(player.name.toLowerCase());
            
            // Se não achou direto, tenta iterar (fallback de segurança)
            if (!onlinePlayer) {
                for (const [key, val] of onlinePlayersMap.entries()) {
                    if (key.toLowerCase() === player.name.toLowerCase()) {
                        onlinePlayer = val;
                        break;
                    }
                }
            }

            if (onlinePlayer && onlinePlayer.level) {
                const currentLevel = parseInt(onlinePlayer.level, 10);
                const lastKnownLevel = levelMap.get(player.name);

                // Se é a primeira vez que vemos o player, apenas salvamos o level
                if (lastKnownLevel === undefined) {
                    levelMap.set(player.name, currentLevel);
                } 
                // Se o level atual é maior que o último gravado
                else if (currentLevel > lastKnownLevel) {
                    console.log(`[LEVEL UP ${relationType}] ${player.name}: ${lastKnownLevel} -> ${currentLevel}`);
                    
                    const characterName = player.name;
                    const encodedName = encodeURIComponent(characterName);
                    const guildStatsUrl = `https://guildstats.eu/character?nick=${encodedName}&tab=9`;
                    const message = `[LEVEL UP ${relationType}] O ${relationType.toLowerCase()} [url=${guildStatsUrl}][b]${characterName}[/b][/url] alcançou o level [b]${currentLevel}[/b]!`;
                    
                    const playerVocation = onlinePlayer.vocation || 'Unknown';
                    
                    // Registra no módulo de guerra
                    warModule.recordLevelUp({
                        name: characterName,
                        vocation: playerVocation,
                        oldLevel: lastKnownLevel,
                        newLevel: currentLevel,
                        type: relationType.toLowerCase()
                    });

                    io.emit('bot:broadcast_notification', { type: 'info', message: message });
                    
                    // Atualiza o mapa para não notificar novamente
                    levelMap.set(player.name, currentLevel);
                } 
                // Se perdeu level (morreu), atualiza silenciosamente para detectar o próximo up
                else if (currentLevel < lastKnownLevel) {
                    levelMap.set(player.name, currentLevel);
                }
            }
        }

        // Limpeza de cache para players removidos da lista de relations
        const currentNames = new Set(relationList.map(p => p.name));
        for (const name of levelMap.keys()) {
            if (!currentNames.has(name)) {
                levelMap.delete(name);
            }
        }

    } catch (err) {
        console.error(`[LEVEL UP CHECK] Erro ao verificar level de ${relationType}:`, err);
    }
}

function scheduleDailyBossCleanup() {
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const runCleanup = () => {
        // Ação principal: Limpa o arquivo de bosses encontrados.
        bot.saveJsonFile(path.join(__dirname, 'boss_found_today.json'), {});
    };
    const scheduleNextCleanup = () => {
        const now = new Date();
        const nextCleanup = new Date();

        // Define o horário da próxima limpeza para 8:00 da manhã.
        nextCleanup.setHours(8, 0, 0, 0);
        
        // Se o horário atual já passou das 8h, agenda para o dia seguinte.
        if (now > nextCleanup) {
            nextCleanup.setDate(nextCleanup.getDate() + 1);
        }

        const timeToCleanup = nextCleanup.getTime() - now.getTime();

        // Aguarda até o horário agendado.
        setTimeout(() => {
            runCleanup(); // Executa a limpeza.
            // Após a primeira execução, agenda para repetir a cada 24 horas.
            setInterval(runCleanup, twentyFourHours);
        }, timeToCleanup);
    };

    scheduleNextCleanup();
}


/**
 * Agenda uma verificação diária. Se for o dia 1º do mês,
 * agenda a execução das tarefas mensais para as 23:00.
 */
function scheduleDailyCheckForMonthlyTasks() {
    // Variável de controle para garantir que a tarefa seja agendada apenas uma vez por mês.
    let hasScheduledThisMonth = false;

    // A função que efetivamente executa as tarefas.
    const runMonthlyTasks = async () => {
        try {
            // 1. Executa o preenchimento de faltas da Warzone.
            const wzResult = await pointsLogic.updateAttendanceForMissedWarzoneDays();

            // 2. Arquiva o mês e zera os pontos.
            const archiveResult = await pointsLogic.archiveCurrentMonth();

            if (archiveResult.success) {
                io.emit('bot:broadcast_notification', { type: 'info', message: 'O ranking de pontos foi arquivado! Um novo mês de pontuação começou!' });
                const data = await pointsLogic.getPointsData();
                io.emit('points:dataUpdated', data);
            }
        } catch (error) {
            console.error('[MONTHLY TASKS] Ocorreu um erro ao executar as tarefas mensais:', error);
        }
    };

    // A função que é executada uma vez por dia para verificar a data.
    const dailyChecker = () => {
        const now = new Date();

        // CONDIÇÃO 1: É dia 1º do mês?
        if (now.getDate() === 1 && !hasScheduledThisMonth) {
            
            // Marca que já agendou para este mês para não agendar de novo.
            hasScheduledThisMonth = true;

            // Calcula o tempo até as 23:00 de hoje.
            const executionTime = new Date();
            executionTime.setHours(23, 0, 0, 0); // 23:00:00
            
            const delay = executionTime.getTime() - now.getTime();

            // Garante que o tempo é no futuro (caso a verificação rode depois das 23h).
            if (delay > 0) {
                setTimeout(runMonthlyTasks, delay);
            }

        // CONDIÇÃO 2: Não é mais dia 1º? Reseta a trava.
        } else if (now.getDate() !== 1) {
            if (hasScheduledThisMonth) {
                hasScheduledThisMonth = false;
            }
        }
    };

    // Lógica para iniciar o ciclo diário
    const startDailyCycle = () => {
        const now = new Date();
        const nextCheck = new Date();
        
        // Agenda a primeira verificação para 1 minuto após a meia-noite do dia seguinte.
        nextCheck.setDate(now.getDate() + 1);
        nextCheck.setHours(0, 1, 0, 0); // 00:01:00

        const initialDelay = nextCheck.getTime() - now.getTime();

        setTimeout(() => {
            dailyChecker(); // Roda a primeira verificação.
            // Depois, estabelece o intervalo para rodar a cada 24 horas.
            setInterval(dailyChecker, 24 * 60 * 60 * 1000);
        }, initialDelay);
    };
    
    // Roda a verificação uma vez na inicialização do servidor, para o caso de iniciar no dia 1º.
    dailyChecker();
    // Inicia o ciclo de agendamento diário.
    startDailyCycle();
}

scheduleDailyCheckForMonthlyTasks();

// function scheduleMonthlyArchive() {
//     const now = new Date();
//     const nextCheck = new Date(now.getFullYear(), now.getMonth() + 1, 1, 3, 0, 0); // Agenda para o dia 1 do próximo mês às 3h
//     const timeToNextCheck = nextCheck.getTime() - now.getTime();
    
//     console.log(`[MONTHLY ARCHIVE] Próxima verificação de arquivamento agendada para ${nextCheck.toLocaleString('pt-BR')}.`);
    
//     setTimeout(async () => {
//         await initialCheckAndSchedule();
//     }, timeToNextCheck);
// }
// async function initialCheckAndSchedule() {
//     const now = new Date();
//     const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1);
//     const previousMonthStr = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
//     const histFilePath = path.join(__dirname, 'points_history', `points_${previousMonthStr}.json`);
    
//     try {
//         await fs.access(histFilePath);
//         console.log(`[MONTHLY ARCHIVE] Histórico para ${previousMonthStr} já existe.`);
//     } catch (error) {
//         if (error.code === 'ENOENT') {
//             console.log(`[MONTHLY ARCHIVE] Histórico para ${previousMonthStr} não encontrado. Iniciando arquivamento.`);
//             const result = await pointsLogic.archiveCurrentMonth();
//             console.log(`[MONTHLY ARCHIVE] ${result.message}`);
            
//             // Avisar todos os jogadores sobre o novo ranking
//             io.emit('bot:broadcast_notification', { type: 'info', message: 'O ranking de pontos do mês passado foi arquivado e um novo mês de pontuação foi iniciado!' });
//         } else {
//             console.error(`[MONTHLY ARCHIVE] Erro ao verificar histórico:`, error);
//         }
//     }
    
//     // Independentemente do resultado, agenda a próxima verificação mensal
//     // scheduleMonthlyArchive();
// }

server.listen(PORT, async () => {
    console.log(`Servidor para o mundo [${WORLD_NAME}] rodando na porta http://127.0.0.1:${PORT}.`);

    await updateCaches();
    await bot.cleanupExcessTokens();
    
    // console.log('[SERVER] Inicializando War Module...');
    await warModule.init(bot, io);


    // Execução inicial dos dados dos bosses
    await updateLocalBossData(); // Garante que bot.updateLocalBossData existe

    // Definição da função de agendamento
    function scheduleDailyBossUpdate() {
    const twentyFourHours 
= 24 * 60 * 60 * 1000;

        const runUpdate = async () => {
            try {
                // Certifique-se que 'bot' está acessível aqui ou passe como argumento se necessário
                await bot.updateLocalBossData();
  
            } catch (error) {
                console.error('[BOSS SYNC] Erro durante a execução da sincronização diária:', error);
            }
        };

        const scheduleNextUpdate = () => {
            try {
                const now = new Date();
                const nextUpdate = new Date();

                // --- ALTERAÇÃO APLICADA AQUI ---
                // Define o horário da próxima atualização para 8:00 da manhã.
                nextUpdate.setHours(8, 0, 0, 0);
                // --- FIM DA ALTERAÇÃO ---

                // Se o horário atual já passou das 8h, agenda para o dia seguinte.
                if (now.getTime() > nextUpdate.getTime()) { // Comparar com getTime() é mais seguro
                    nextUpdate.setDate(nextUpdate.getDate() + 1);
                }

                const timeToUpdate = nextUpdate.getTime() - now.getTime();

                if (timeToUpdate < 0) {
                     console.error('[BOSS SYNC] Erro: O tempo calculado para a próxima atualização é negativo. Verifique o relógio/fuso do servidor.');
                     // Tenta reagendar para o dia seguinte como fallback
                     nextUpdate.setDate(nextUpdate.getDate() + 1);
                     const fallbackTimeToUpdate = nextUpdate.getTime() - now.getTime();
                     if (fallbackTimeToUpdate > 0) {
                         setTimeout(() => {
                            runUpdate();
                            setInterval(runUpdate, twentyFourHours);
      
                           }, fallbackTimeToUpdate);
                     } else {
                         console.error('[BOSS SYNC] Falha crítica ao reagendar a atualização.');
                     }
                     return;
                }

                // Aguarda até o horário agendado.
                setTimeout(() => {
                    runUpdate(); // Executa a atualização.
                    // Após a primeira execução, agenda para repetir a cada 24 horas.
                    setInterval(runUpdate, twentyFourHours);
                }, timeToUpdate);
            } catch (scheduleError) {
                console.error('[BOSS SYNC] Erro ao agendar a próxima sincronização:', scheduleError);
            }
        };
        scheduleNextUpdate();
}

    // Chama a função para iniciar o agendamento
    const sixHoursInMillis = 6 * 60 * 60 * 1000;
    setInterval(async () => {
        try {
            // Chama a função que atualiza os dados dos bosses
            await updateLocalBossData(); // Ou bot.updateLocalBossData() se estiver no contexto do bot
        } catch (error) {
            console.error('[BOSS SYNC] Erro durante a execução da atualização agendada:', error);
        }
    }, sixHoursInMillis);
    
    // A função 'verifyAllUsersStatus' permanece, mas sem a lógica dos bosses
    async function verifyAllUsersStatus() {
        // await initialCheckAndSchedule(); // Esta função está comentada no seu código original
        const allUsers = webUsers.values();
        for (const user of allUsers) {
            if (user.account) {
                await bot.verifyUserGuildStatus(user);
            }
        }
        io.emit('user:updateStatus');
    }

// function scheduleStatusCheck() {
//     const now = new Date();
//     const nextCheck = new Date();
//     // Define o horário para 3h da manhã
//     nextCheck.setHours(3, 0, 0, 0);

//     // Se a hora atual já passou das 3h, agenda para o dia seguinte
//     if (now > nextCheck) {
//         nextCheck.setDate(nextCheck.getDate() + 1);
//     }

//     const timeToNextCheck = nextCheck.getTime() - now.getTime();

//     console.log(`[STATUS CHECK] Próxima verificação de status agendada para ${nextCheck.toLocaleString()}.`);

//     // Aguarda até a hora agendada
//     setTimeout(() => {
//         verifyAllUsersStatus();
//         // Depois, agenda para repetir a cada 24 horas
//         setInterval(verifyAllUsersStatus, 24 * 60 * 60 * 1000);
//     }, timeToNextCheck);
//     }

//     scheduleStatusCheck();
    
    // Aplica a lógica de controle também na primeira sincronização
    if (!isSyncingRelations) {
        isSyncingRelations = true;
        bot.syncAllRelations().then(updatedData => {
            io.emit('friends:dataUpdated', updatedData);
        }).catch(error => {
            console.error('[INITIAL SYNC ERROR]', error);
        }).finally(() => {
            isSyncingRelations = false;
        });
    }
});

/**
 * Adiciona ou remove grupos de uma lista de personagens.
 * @param {object} data - Contém characterNames, groupIds e a ação ('add' ou 'remove').
 */
async function adminBatchUpdateUserGroups({ characterNames, groupIds, action }) {
    if (!characterNames || !groupIds || !action) return;

    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let changesMade = false;
    const characterNameMap = new Map();

    // Cria um mapa para busca rápida de personagens
    for (const email in clientAccounts) {
        const account = clientAccounts[email];
        if (account?.tibiaCharacters) {
            account.tibiaCharacters.forEach(char => {
                if (char && char.characterName) {
                    characterNameMap.set(char.characterName.toLowerCase(), char);
                }
            });
        }
    }

    // Loop por cada personagem da lista de entrada
    for (const charName of characterNames) {
        const char = characterNameMap.get(charName.toLowerCase());
        if (char) {
            let userGroups = new Set(char.groups || []);
            let charChanges = false;
            
            if (action === 'add') {
                groupIds.forEach(gId => {
                    if (!userGroups.has(gId)) {
                        userGroups.add(gId);
                        charChanges = true;
                    }
                });
            } else if (action === 'remove') {
                groupIds.forEach(gId => {
                    if (userGroups.has(gId)) {
                        userGroups.delete(gId);
                        charChanges = true;
                    }
                });
            }
            
            if (charChanges) {
                char.groups = Array.from(userGroups);
                changesMade = true;
            }
        } else {
            console.warn(`[BATCH UPDATE] Personagem não encontrado: ${charName}`);
        }
    }

    if (changesMade) {
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
    }
}
const MEMORY_LIMIT_MB = 300;

setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const memoryUsageInMB = memoryUsage.rss / 1024 / 1024;

    console.log(`[MEMÓRIA] Uso atual: ${memoryUsageInMB.toFixed(2)} MB / ${MEMORY_LIMIT_MB} MB`);

    if (memoryUsageInMB > MEMORY_LIMIT_MB) {
        console.error(`[RESTART] Limite de memória de ${MEMORY_LIMIT_MB} MB excedido.`);
        console.error(`[RESTART] Uso atual: ${memoryUsageInMB.toFixed(2)} MB. Finalizando o processo para reinício.`);
                process.exit(1);
    }
}, 60000); // Verificando a cada 30 segundos

// setInterval(() => {
//     const now = Date.now();
//     let cleanedCount = 0;
    
//     for (const [ip, expires] of blockedIPs.entries()) {
//         if (now >= expires) {
//             blockedIPs.delete(ip);
//             cleanedCount++;
//         }
//     }
    
//     if (cleanedCount > 0) {
//         console.log(`[CLEANUP] Limpeza de ${cleanedCount} IP(s) expirados do mapa de bloqueio.`);
//     }
// }, 10 * 60 * 1000);

setInterval(() => {
    broadcastRespawnUpdates();
}, 60000); // 60 segundos

