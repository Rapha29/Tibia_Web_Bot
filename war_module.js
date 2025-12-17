//war_module.js

const fetch = require("node-fetch");
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Constantes de configuração
// const MAX_RETRIES = 3; // Não usado com fetch simplificado
const REQUEST_TIMEOUT = 8000; // Timeout um pouco menor para fetch simples
const WAR_DATA_FILE = path.join(__dirname, 'war_data.json');
const RELATIONS_FILE = path.join(__dirname, 'relations.json');
const GUILD_CONFIG_FILE = path.join(__dirname, 'set_guild.json');
const ENEMY_GUILDS_FILE = path.join(__dirname, 'guild_enemy.json');
const USER_PREFS_FILE = path.join(__dirname, 'user_prefs.json');

// Variáveis de estado do módulo
let botLogic = null;
let io = null;
let alliedGuildName = "Default Allied Guild";

// Caches em memória
let alliedPlayerNamesSet = new Set();
let enemyPlayerNamesSet = new Set();
let huntedPlayerNamesSet = new Set();
let warData = {};
let inMemoryDeathCache = new Map();
let playerLastDeathMap = new Map();
let inMemoryLevelUpCache = new Map();

let isCheckingWar = false;
let alertingEnabled = true;
let levelUpQueue = [];
let isProcessingLevelUpQueue = false;

// --- Funções Auxiliares de Data ---
function getStartOfTibiaDay(date = new Date()) {
    const tibiaDay = new Date(date);
    tibiaDay.setHours(tibiaDay.getHours() - 5);
    tibiaDay.setHours(5, 0, 0, 0);
    return tibiaDay;
}

function getNdaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
}

// --- Funções de Inicialização e Controle ---
async function init(botRef, ioInstance) {
    botLogic = botRef;
    io = ioInstance;
    if (!botLogic || !botLogic.loadJsonFile || !botLogic.saveJsonFile || !io) {
        console.error('[WAR MODULE] Erro Crítico: Referências inválidas.');
        return;
    }

    try {
        const guildConfig = await botLogic.loadJsonFile(GUILD_CONFIG_FILE, { guild: "Default Allied Guild" });
        alliedGuildName = guildConfig.guild;
        const enemyGuildData = await botLogic.loadJsonFile(ENEMY_GUILDS_FILE, { guilds: [] });
        const enemyGuildNames = (enemyGuildData.guilds || []).filter(g => typeof g === 'string' && g.trim() !== "");
        const relationsData = await botLogic.loadJsonFile(RELATIONS_FILE, { players_allies: [], players_hunteds: [] });
        huntedPlayerNamesSet = new Set((relationsData.players_hunteds || []).map(p => p.name.toLowerCase()));
        alliedPlayerNamesSet = new Set((relationsData.players_allies || []).map(p => p.name.toLowerCase()));

        const userPrefs = await botLogic.loadJsonFile(USER_PREFS_FILE, { broadcastDeathAlerts: true });
        alertingEnabled = userPrefs.broadcastDeathAlerts === true;

        // Usando fetchCharacterDeaths simplificado para carregar guildas inimigas também
        for (const guildName of enemyGuildNames) {
            try {
                 const members = await fetchGuildMembersSimple(guildName);
                 if (members) {
                     members.forEach(member => enemyPlayerNamesSet.add(member.name.toLowerCase()));
                 }
            } catch (e) {
                console.error(`[WAR MODULE] Falha ao carregar guilda inimiga ${guildName}: ${e.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 300)); // Manter delay
        }

        warData = await botLogic.loadJsonFile(WAR_DATA_FILE, {
            lastChecked: null,
            deaths: { ally: {}, enemy: {}, hunted: {} },
            killsByPlayer: { ally: {}, enemy: {} },
            killsByCreature: {},
            statsByVocation: {},
            levelUps: { ally: {}, enemy: {}, hunted: {} }
        });

        // Garantir estrutura mínima
        if (!warData.deaths) warData.deaths = { ally: {}, enemy: {}, hunted: {} };
        if (!warData.killsByPlayer) warData.killsByPlayer = { ally: {}, enemy: {} };
        if (!warData.killsByCreature) warData.killsByCreature = {};
        if (!warData.statsByVocation) warData.statsByVocation = {};
        if (!warData.levelUps) warData.levelUps = { ally: {}, enemy: {}, hunted: {} };
        if (!warData.levelUps.ally) warData.levelUps.ally = {};
        if (!warData.levelUps.enemy) warData.levelUps.enemy = {};
        if (!warData.levelUps.hunted) warData.levelUps.hunted = {};

        inMemoryDeathCache.clear();
        playerLastDeathMap.clear();
        let deathCount = 0;

        for (const type of ['ally', 'enemy', 'hunted']) {
            const deaths = warData.deaths[type];
            if (deaths) {
                for (const charName in deaths) {
                    const charLower = charName.toLowerCase();
                    let currentMaxTime = playerLastDeathMap.get(charLower) || 0;
                    if (deaths[charName] && deaths[charName].details) {
                        deaths[charName].details.forEach(detail => {
                            if(detail && detail.time) {
                                try {
                                    const deathTime = new Date(detail.time).getTime();
                                    if(!isNaN(deathTime)){ // Verifica se a data é válida
                                        inMemoryDeathCache.set(`${charName}-${detail.time}`, true);
                                        deathCount++;
                                        if (deathTime > currentMaxTime) {
                                            currentMaxTime = deathTime;
                                        }
                                    }
                                } catch(e) {/* Ignora data inválida */}
                            }
                        });
                    }
                    playerLastDeathMap.set(charLower, currentMaxTime);
                }
            }
        }

        inMemoryLevelUpCache.clear();
        let levelUpCount = 0;
        for (const type of ['ally', 'enemy', 'hunted']) {
            const levelUps = warData.levelUps[type];
            if (levelUps) {
                for (const charName in levelUps) {
                    if (levelUps[charName] && levelUps[charName].details) {
                        levelUps[charName].details.forEach(detail => {
                           if (detail && detail.newLevel) {
                              inMemoryLevelUpCache.set(`${charName.toLowerCase()}-${detail.newLevel}`, true);
                              levelUpCount++;
                           }
                        });
                    }
                }
            }
        }


    } catch (error) {
        console.error('[WAR MODULE] Erro grave durante a inicialização:', error);
    }
}

// Função auxiliar de espera
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função robusta com retry para buscar mortes
async function fetchCharacterDeaths(characterName, type) {
    const encodedName = encodeURIComponent(characterName);
    const url = `https://api.tibiadata.com/v4/character/${encodedName}`;
    const maxRetries = 2; // Tenta 2 vezes extras se falhar
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
            
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.status === 429) {
                // Rate limit: espera mais tempo antes de tentar de novo
                console.warn(`[WAR MODULE] Rate limit atingido para ${characterName}. Aguardando 2s...`);
                await sleep(20000);
                attempt++;
                continue;
            }

            if (!response.ok) {
                if (response.status === 404) return []; // Personagem não existe/renomeado
                throw new Error(`HTTP Error ${response.status}`);
            }

            const data = await response.json();

            // Validação da estrutura
            if (!data || !data.character || !data.character.deaths) return [];

            const charInfo = data.character.character || {};
            const deaths = data.character.deaths;

            if (!Array.isArray(deaths)) return [];

            return deaths
                .filter(death => death && death.time)
                .map(death => ({
                    character: charInfo.name || characterName,
                    level: death.level || charInfo.level || 0,
                    vocation: charInfo.vocation || "Unknown",
                    time: death.time,
                    reason: death.reason || "Unknown reason",
                    killers: death.killers || [],
                    type: type
                }));

        } catch (error) {
            attempt++;
            if (attempt <= maxRetries) {
                // Se foi erro de conexão ou timeout, espera um pouco e tenta de novo
                const delay = 5000 * attempt; 
                await sleep(delay);
            } else {
                console.error(`[WAR MODULE] Falha final ao buscar ${characterName} após ${attempt} tentativas.`);
                return [];
            }
        }
    }
    return [];
}

// Helper simples para buscar membros de guildas (usado no init)
async function fetchGuildMembersSimple(guildName) {
     const url = `https://api.tibiadata.com/v4/guild/${encodeURIComponent(guildName)}`;
     try {
         const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
         const response = await fetch(url, { signal: controller.signal });
         clearTimeout(timeoutId);
         if (!response.ok) {
             return null; // Falha ao buscar guilda
         }
         const data = await response.json();
         return data?.guild?.members || [];
     } catch (error) {
         console.error(`[WAR MODULE] Erro simples ao buscar guilda ${guildName}: ${error.message}`);
         return null;
     }
}


async function checkWarActivity(onlinePlayersSet = new Set()) {
    if (isCheckingWar) {
        return;
    }
    isCheckingWar = true;

    if (!io || !botLogic) {
        isCheckingWar = false;
        return;
    }

    const startTime = Date.now();
    let newDeathsFound = 0;
    let newDeathsToAlert = [];
    let playersToCheck = [];

    try {
        for (const playerName of onlinePlayersSet) {
            const lowerName = playerName.toLowerCase();
            if (alliedPlayerNamesSet.has(lowerName)) playersToCheck.push({ name: playerName, type: 'ally' });
            else if (enemyPlayerNamesSet.has(lowerName)) playersToCheck.push({ name: playerName, type: 'enemy' });
            else if (huntedPlayerNamesSet.has(lowerName)) playersToCheck.push({ name: playerName, type: 'hunted' });
        }

        if (playersToCheck.length === 0) return; // Sai antes

for (const playerTask of playersToCheck) {
            const playerLower = playerTask.name.toLowerCase();
            const playerStartTime = playerLastDeathMap.get(playerLower) || 0;

            // Usa a nova função com retry
            const deaths = await fetchCharacterDeaths(playerTask.name, playerTask.type);
            
            // DELAY IMPORTANTE: Pausa de 1 segundo entre players para não spamar a API
            // Isso garante que "aguardamos um pouco" entre consultas distintas
            await sleep(1000); 

            if (!deaths || deaths.length === 0) continue;

            for (const death of deaths) {
                // Validação de data já feita em fetchCharacterDeaths simplificado
            const deathTime = new Date(death.time);
                 const deathKey = `${death.character}-${death.time}`;
                 const deathTimestamp = deathTime.getTime();

                 if (deathTimestamp > playerStartTime && !inMemoryDeathCache.has(deathKey)) {
                     await processAndStoreDeath(death, warData, alliedPlayerNamesSet);
                     inMemoryDeathCache.set(deathKey, true);
                     playerLastDeathMap.set(playerLower, deathTimestamp);
                     newDeathsFound++;
                     newDeathsToAlert.push(death);
                 }
            }
        }

        if (newDeathsFound > 0) {
            warData.lastChecked = new Date().toISOString();
            await botLogic.saveJsonFile(WAR_DATA_FILE, warData);

            newDeathsToAlert.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
            for (const death of newDeathsToAlert) {
                try {
                    const victimType = death.type;
                    const victimName = death.character;
                    const victimLevel = death.level || '?';
                    const reason = (death.reason || "Causa desconhecida").replace(/^(Died|Killed) at Level \d+ by /i, '');
                    let killerText = `morto por ${reason}`;
                    const playerKillers = (death.killers || []).filter(k => k.player);
                    if (playerKillers.length > 0) {
                        const firstPlayerKiller = playerKillers[0];
                        const isAllyKiller = alliedPlayerNamesSet.has(firstPlayerKiller.name.toLowerCase());
                        killerText = `morto por ${firstPlayerKiller.name} (${isAllyKiller ? 'ALIADO' : 'INIMIGO'})`;
                        if (playerKillers.length > 1) killerText += ` e outros.`;
                    }

                    const alertMessage = `[MORTE ${victimType.toUpperCase()}] ${victimName} (Level ${victimLevel}) foi ${killerText}`;
                    const broadcastType = victimType === 'ally' ? 'error' : 'info';
                    if (alertingEnabled) {
                        io.emit('bot:broadcast_notification', { type: broadcastType, message: alertMessage });
                        await new Promise(resolve => setTimeout(resolve, 250));
                    }
                } catch (alertError) {
                    console.error("[WAR MODULE] Erro ao gerar alerta de morte:", alertError);
                }
            }

            try {
                const currentStats = await getWarStats('today', warData);
                io.emit('war:dataUpdated', currentStats);
            } catch (statsError) {
                 console.error("[WAR MODULE] Erro ao recalcular stats imediatos:", statsError);
            }
        } else {
             if (!warData.lastChecked || (Date.now() - new Date(warData.lastChecked || 0).getTime() > 60000)) {
                 warData.lastChecked = new Date().toISOString();
                 await botLogic.saveJsonFile(WAR_DATA_FILE, warData);
             }
        }

    } catch (error) {
        console.error('[WAR MODULE] Erro durante checkWarActivity:', error);
    } finally {
        isCheckingWar = false;
        const endTime = Date.now();
        if (newDeathsFound === 0) {
        }
    }
}

async function processAndStoreDeath(deathInfo, warDataRef, alliedPlayerNamesSetRef) {
    if (!deathInfo || !deathInfo.character || !deathInfo.type || !warDataRef) return;
    const victimName = deathInfo.character;
    const victimVocation = deathInfo.vocation || "Unknown";
    const deathType = deathInfo.type;
    const deathLevel = deathInfo.level || 0;
    try {
        if (!warDataRef.deaths[deathType][victimName]) warDataRef.deaths[deathType][victimName] = { count: 0, details: [], vocation: victimVocation };
        if (!warDataRef.statsByVocation[victimVocation]) warDataRef.statsByVocation[victimVocation] = { deaths: 0, kills: 0, levelUps: 0 };
        warDataRef.deaths[deathType][victimName].count++;
        warDataRef.deaths[deathType][victimName].details.unshift({ time: deathInfo.time, reason: deathInfo.reason, killers: deathInfo.killers, level: deathLevel });
        warDataRef.deaths[deathType][victimName].vocation = victimVocation;
        if (!warDataRef.statsByVocation[victimVocation].deaths) warDataRef.statsByVocation[victimVocation].deaths = 0;
        warDataRef.statsByVocation[victimVocation].deaths++;
        if (Array.isArray(deathInfo.killers)) {
            for (const killer of deathInfo.killers) {
                const killerName = killer.name;
                if (!killerName || typeof killerName !== 'string') continue;
                if (killer.player) {
                    const isAllyKiller = alliedPlayerNamesSetRef?.has(killerName.toLowerCase());
                    const killerTypeKey = isAllyKiller ? 'ally' : 'enemy';
                    if (!warDataRef.killsByPlayer[killerTypeKey][killerName]) warDataRef.killsByPlayer[killerTypeKey][killerName] = { count: 0, details: [] };
                    warDataRef.killsByPlayer[killerTypeKey][killerName].count++;
                    warDataRef.killsByPlayer[killerTypeKey][killerName].details.unshift({ time: deathInfo.time, victim: victimName });
                } else {
                    if (!warDataRef.killsByCreature[killerName]) warDataRef.killsByCreature[killerName] = { count: 0, details: [] };
                    warDataRef.killsByCreature[killerName].count++;
                    warDataRef.killsByCreature[killerName].details.unshift({ time: deathInfo.time, victim: victimName });
                }
            }
        }
    } catch (error) { console.error(`[WAR MODULE] Erro GRAVE ao processar morte de ${victimName}:`, error); }
}

async function processAndStoreLevelUp(levelUpInfo, warDataRef) {
    if (!levelUpInfo || !levelUpInfo.name || !levelUpInfo.type || !warDataRef) return;
    const playerName = levelUpInfo.name;
    const playerVocation = levelUpInfo.vocation || "Unknown";
    const levelUpType = levelUpInfo.type.toLowerCase();
    try {
        if (!warDataRef.levelUps[levelUpType][playerName]) warDataRef.levelUps[levelUpType][playerName] = { count: 0, details: [], vocation: playerVocation };
        if (!warDataRef.statsByVocation[playerVocation]) warDataRef.statsByVocation[playerVocation] = { deaths: 0, kills: 0, levelUps: 0 };
        warDataRef.levelUps[levelUpType][playerName].count++;
        warDataRef.levelUps[levelUpType][playerName].details.unshift({ time: new Date().toISOString(), oldLevel: levelUpInfo.oldLevel, newLevel: levelUpInfo.newLevel });
        warDataRef.levelUps[levelUpType][playerName].vocation = playerVocation;
        if (!warDataRef.statsByVocation[playerVocation].levelUps) warDataRef.statsByVocation[playerVocation].levelUps = 0;
        warDataRef.statsByVocation[playerVocation].levelUps++;
    } catch (error) { console.error(`[WAR MODULE] Erro GRAVE ao processar level up de ${playerName}:`, error); }
}

async function processLevelUpQueue() {
    if (isProcessingLevelUpQueue || levelUpQueue.length === 0) return;
    isProcessingLevelUpQueue = true;
    const levelUpInfo = levelUpQueue.shift();
    if (!levelUpInfo) { isProcessingLevelUpQueue = false; return; }
    const playerLower = levelUpInfo.name.toLowerCase();
    const levelUpKey = `${playerLower}-${levelUpInfo.newLevel}`;
    if (inMemoryLevelUpCache.has(levelUpKey)) {
        isProcessingLevelUpQueue = false;
        setTimeout(processLevelUpQueue, 0);
        return;
    }
    try {
        await processAndStoreLevelUp(levelUpInfo, warData);
        inMemoryLevelUpCache.set(levelUpKey, true);
        await botLogic.saveJsonFile(WAR_DATA_FILE, warData);
    } catch (error) { console.error(`[WAR MODULE] Erro ao processar level up da fila para ${levelUpInfo.name}:`, error); }
    finally { isProcessingLevelUpQueue = false; setTimeout(processLevelUpQueue, 0); }
}

async function recordLevelUp(levelUpInfo) {
    if (!levelUpInfo || !levelUpInfo.name || !levelUpInfo.type || !levelUpInfo.newLevel) { console.error('[WAR MODULE] Tentativa de registrar level up com dados inválidos:', levelUpInfo); return; }
    const playerLower = levelUpInfo.name.toLowerCase();
    const levelUpKey = `${playerLower}-${levelUpInfo.newLevel}`;
    if (inMemoryLevelUpCache.has(levelUpKey)) return;
    levelUpQueue.push(levelUpInfo);
    processLevelUpQueue();
}

async function getWarStats(dateRange = 'today', inMemoryData = null) {
    try {
        let rawWarData = inMemoryData || warData || await botLogic.loadJsonFile(WAR_DATA_FILE, {});
        if (!rawWarData.deaths) rawWarData.deaths = { ally: {}, enemy: {}, hunted: {} };
        if (!rawWarData.killsByPlayer) rawWarData.killsByPlayer = { ally: {}, enemy: {} };
        if (!rawWarData.killsByCreature) rawWarData.killsByCreature = {};
        if (!rawWarData.statsByVocation) rawWarData.statsByVocation = {};
        if (!rawWarData.levelUps) rawWarData.levelUps = { ally: {}, enemy: {}, hunted: {} };
        if (!rawWarData.levelUps.ally) rawWarData.levelUps.ally = {};
        if (!rawWarData.levelUps.enemy) rawWarData.levelUps.enemy = {};
        if (!rawWarData.levelUps.hunted) rawWarData.levelUps.hunted = {};

        let filterStartDate = null;
        let filterRangeDescription = "Desde o início";
        const now = new Date();
        switch (dateRange) {
             case 'today': filterStartDate = getStartOfTibiaDay(now); filterRangeDescription = `Hoje (Desde ${filterStartDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de ${filterStartDate.toLocaleDateString('pt-BR')})`; break;
             case 'week': filterStartDate = getNdaysAgo(6); filterRangeDescription = `Últimos 7 Dias (Desde ${filterStartDate.toLocaleDateString('pt-BR')})`; break;
             case 'month': const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); startOfMonth.setHours(0,0,0,0); filterStartDate = startOfMonth; filterRangeDescription = `Mês Atual (Desde ${filterStartDate.toLocaleDateString('pt-BR')})`; break;
             default: filterRangeDescription = "Desde o início"; break;
        }
        const filterStartTime = filterStartDate ? filterStartDate.getTime() : 0;

        const calculatedStats = {
            summary: { allyDeaths: 0, enemyDeaths: 0, huntedDeaths: 0, allyLevelUps: 0, enemyLevelUps: 0, huntedLevelUps: 0 },
            rankingsTemp: { killPlayerAlly: new Map(), killPlayerEnemy: new Map(), killCreature: new Map() },
            individualDeaths: { ally: [], enemy: [], hunted: [] },
            individualLevelUps: { ally: [], enemy: [], hunted: [] },
            statsByVocation: {}
        };

        for (const killerTypeKey of ['ally', 'enemy']) {
            const playerKills = rawWarData.killsByPlayer?.[killerTypeKey]; if (!playerKills) continue; const killRankingKey = `killPlayer${killerTypeKey.charAt(0).toUpperCase() + killerTypeKey.slice(1)}`;
            for (const killerName in playerKills) { const killerData = playerKills[killerName]; let killCount = 0; const filteredVictims = []; if (killerData?.details) { killerData.details.forEach(detail => { if(detail?.time) { try { const killTime = new Date(detail.time).getTime(); if(killTime >= filterStartTime){ killCount++; filteredVictims.push({victim: detail.victim, time: killTime});}} catch(e){}}}); if(killCount > 0){ calculatedStats.rankingsTemp[killRankingKey].set(killerName, {count: killCount, details: filteredVictims});}} }
        }
        const creatureKills = rawWarData.killsByCreature; if (creatureKills) { for (const creatureName in creatureKills) { const creatureData = creatureKills[creatureName]; let killCount = 0; if (creatureData?.details) { creatureData.details.forEach(detail => { if(detail?.time) { try { const killTime = new Date(detail.time).getTime(); if(killTime >= filterStartTime) { killCount++; }} catch(e){}}}); if (killCount > 0) { calculatedStats.rankingsTemp.killCreature.set(creatureName, {count: killCount}); }} } }

        for (const deathType of ['ally', 'enemy', 'hunted']) {
            const deathEntries = rawWarData.deaths?.[deathType]; if (!deathEntries) continue;
            for (const victimName in deathEntries) { const victimData = deathEntries[victimName]; if (!victimData) continue; const victimVocation = victimData.vocation || "Unknown"; if (!calculatedStats.statsByVocation[victimVocation]) calculatedStats.statsByVocation[victimVocation] = { deaths: 0, kills: 0, levelUps: 0 };
                if (victimData.details) { victimData.details.forEach(detail => { if (detail?.time) { try { const deathTime = new Date(detail.time); if (deathTime.getTime() >= filterStartTime) { calculatedStats.summary[`${deathType}Deaths`]++; calculatedStats.individualDeaths[deathType].push({ name: victimName, level: detail.level || 0, reason: (detail.reason || 'Desconhecida').replace(/^(Died|Killed) at Level \d+ by /i, 'by '), time: deathTime.toISOString() }); if (!calculatedStats.statsByVocation[victimVocation].deaths) calculatedStats.statsByVocation[victimVocation].deaths = 0; calculatedStats.statsByVocation[victimVocation].deaths++; }} catch (e) {}}}); }
            }
        }

        for (const levelUpType of ['ally', 'enemy', 'hunted']) {
            const levelUpEntries = rawWarData.levelUps?.[levelUpType]; if (!levelUpEntries) continue;
            for (const playerName in levelUpEntries) { const playerData = levelUpEntries[playerName]; if (!playerData) continue; const playerVocation = playerData.vocation || "Unknown"; if (!calculatedStats.statsByVocation[playerVocation]) calculatedStats.statsByVocation[playerVocation] = { deaths: 0, kills: 0, levelUps: 0 };
                if (playerData.details) { playerData.details.forEach(detail => { if (detail?.time) { try { const levelUpTime = new Date(detail.time); if (levelUpTime.getTime() >= filterStartTime) { calculatedStats.summary[`${levelUpType}LevelUps`]++; calculatedStats.individualLevelUps[levelUpType].push({ name: playerName, oldLevel: detail.oldLevel || 0, newLevel: detail.newLevel || 0, time: levelUpTime.toISOString() }); if (!calculatedStats.statsByVocation[playerVocation].levelUps) calculatedStats.statsByVocation[playerVocation].levelUps = 0; calculatedStats.statsByVocation[playerVocation].levelUps++; }} catch (e) {}}}); }
            }
        }

        const sortAndFormatRanking = (rankingMap) => Array.from(rankingMap.entries()).map(([name, data]) => ({ name, count: data.count || 0, details: data.details || [] })).sort((a, b) => b.count - a.count).slice(0, 50);
        const sortEventList = (eventArray) => eventArray.sort((a, b) => { const timeA = a.time ? new Date(a.time).getTime() : 0; const timeB = b.time ? new Date(b.time).getTime() : 0; return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA); });

        const finalRankings = {
            deathAlly: sortEventList(calculatedStats.individualDeaths.ally), deathEnemy: sortEventList(calculatedStats.individualDeaths.enemy), deathHunted: sortEventList(calculatedStats.individualDeaths.hunted),
            levelUpAlly: sortEventList(calculatedStats.individualLevelUps.ally), levelUpEnemy: sortEventList(calculatedStats.individualLevelUps.enemy), levelUpHunted: sortEventList(calculatedStats.individualLevelUps.hunted),
            killPlayerAlly: sortAndFormatRanking(calculatedStats.rankingsTemp.killPlayerAlly), killPlayerEnemy: sortAndFormatRanking(calculatedStats.rankingsTemp.killPlayerEnemy), killCreature: sortAndFormatRanking(calculatedStats.rankingsTemp.killCreature)
        };

        const updateVocStatsKills = (killRanking) => {
             killRanking.forEach(killer => {
                 let killerVocation = "Unknown";
                 for(const type of ['ally', 'enemy', 'hunted']) { if(rawWarData.deaths?.[type]?.[killer.name]?.vocation) { killerVocation = rawWarData.deaths[type][killer.name].vocation; break; } if(rawWarData.levelUps?.[type]?.[killer.name]?.vocation) { killerVocation = rawWarData.levelUps[type][killer.name].vocation; break; }}
                  if (!calculatedStats.statsByVocation[killerVocation]) calculatedStats.statsByVocation[killerVocation] = { deaths: 0, kills: 0, levelUps: 0 };
                  if (!calculatedStats.statsByVocation[killerVocation].kills) calculatedStats.statsByVocation[killerVocation].kills = 0;
                  calculatedStats.statsByVocation[killerVocation].kills += killer.count;
             });
        };
        updateVocStatsKills(finalRankings.killPlayerAlly); updateVocStatsKills(finalRankings.killPlayerEnemy);

        return {
            filterRangeDescription: filterRangeDescription, lastChecked: rawWarData.lastChecked || null, summary: calculatedStats.summary, rankings: finalRankings, statsByVocation: calculatedStats.statsByVocation
        };
    } catch (error) {
        console.error("[WAR MODULE] Erro em getWarStats:", error);
        return { filterRangeDescription: `Erro (${dateRange})`, lastChecked: null, summary: {}, rankings: {}, statsByVocation: {} };
    }
}

// Removida a função fetchWithRetry

module.exports = {
    init,
    checkWarActivity,
    getWarStats,
    recordLevelUp
};