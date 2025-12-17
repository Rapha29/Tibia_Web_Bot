// bot_logic.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');
const pointsLogic = require('./points_logic.js');


const adminRanks = ["leader alliance", "leader", "vice leader"];
const ADMIN_GROUP_ID = 'suporte'; // ID do seu grupo

function hasAdminAccess(user) {
    if (!user || !user.character) return false;
    const hasRank = adminRanks.includes(user.character.guildRank?.toLowerCase());
    if (hasRank) return true;
    const userGroups = user.character.groups || [];
    return userGroups.includes(ADMIN_GROUP_ID);
}

const DATA_FILES = {
    clientAccounts: path.join(__dirname, 'clientaccount.json'),
    verificationCodes: path.join(__dirname, 'verification_codes.json'),
    guildConfig: path.join(__dirname, 'set_guild.json'),
    worldConfig: path.join(__dirname, 'set_world.json'),
    respawnQueue: path.join(__dirname, 'fila.json'),
    respawnTimes: path.join(__dirname, 'respawnTimes.json'),
    webGroups: path.join(__dirname, 'webgroups.json'),
    cooldowns: path.join(__dirname, 'cooldowns.json'),
    respawnGroups: path.join(__dirname, 'respawn_groups.json'),
    logRespawn: path.join(__dirname, 'logrespawn.json'),
    relations: path.join(__dirname, 'relations.json'),
    logCharacter: path.join(__dirname, 'logcharacter.json'),
    respawns: path.join(__dirname, 'respawns.json'),
    planilhadoRespawns: path.join(__dirname, 'planilhado_respawns.json'),
    planilhadoGroups: path.join(__dirname, 'planilhado_groups.json'),
    planilhadoSchedule: path.join(__dirname, 'planilhado_schedule.json'),
    planilhadoDoubleRespawns: path.join(__dirname, 'planilhado_double_respawns.json'),
    planilhadoDoubleSchedule: path.join(__dirname, 'planilhado_double_schedule.json'),
    underattack: path.join(__dirname, 'underattack.json'),
    bosses: path.join(__dirname, 'bosses.json'),
    bossData: path.join(__dirname, 'boss_data_local.json'),
    bossDataGlobal: path.join(__dirname, 'boss_data.json'),
    bossImagesDir: path.join(__dirname, 'boss_images'), 
    bossChecks: path.join(__dirname, 'boss_checks.json'),
    bossCheckHistory: path.join(__dirname, 'boss_check_history.json'),
    bossFoundHistory: path.join(__dirname, 'boss_found_history.json'),
    bossFoundToday: path.join(__dirname, 'boss_found_today.json'),
    bossLocations: path.join(__dirname, 'boss_locations.json'),
    news: path.join(__dirname, 'news.json'),
    bossTokens: path.join(__dirname, 'bosstokens.json'), 
};

let moduleWorldName;

function init(worldName) {
    moduleWorldName = worldName;
}

function createWikiLink(bossName) {
    if (!bossName) return '';
    const urlEncodedName = encodeURIComponent(bossName.replace(/ /g, '_'));
    return `https://www.tibiawiki.com.br/wiki/${urlEncodedName}`;
}


async function getBossTokens() {
    return await loadJsonFile(DATA_FILES.bossTokens, { bosses: [] });
}

async function updateBossTokens(newTokensData) {
    // newTokensData deve ser um array: [{name: "Boss", tokens: 1}, ...]
    await saveJsonFile(DATA_FILES.bossTokens, { bosses: newTokensData });
    return { success: true };
}

/**
 * Atualiza o status de um agendamento no planilhado (falta, double).
 * @param {object} data - Contém type, respawnCode, groupLeader, isAbsence, isDouble.
 */
async function updatePlanilhadoAssignmentStatus({ type, respawnCode, groupLeader, isAbsence, isDouble, observation }) { // 1. Adicionado "observation"
    const scheduleFile = type === 'double' ?
        DATA_FILES.planilhadoDoubleSchedule : DATA_FILES.planilhadoSchedule;
    const schedule = await loadJsonFile(scheduleFile, {});

    let assignmentFound = false;
    if (schedule[respawnCode]) {
        for (const timeSlot in schedule[respawnCode]) {
            const assignment = schedule[respawnCode][timeSlot];
            if (assignment && typeof assignment === 'object' && assignment.leader === groupLeader) {
                assignment.isAbsence = !!isAbsence;
                assignment.isDouble = !!isDouble;

                // 2. Adiciona a lógica para atualizar ou remover a observação
                if (type === 'normal') {
                    if (observation !== undefined && observation.trim() !== '') {
                        assignment.observation = observation.trim();
                    } else {
                        delete assignment.observation; // Remove o campo se a observação for vazia
                    }
                }
                
                assignmentFound = true;
            }
        }
    }

    if (assignmentFound) {
        await saveJsonFile(scheduleFile, schedule);
        return { success: true };
    } else {
        return { success: false, message: 'Agendamento não encontrado.' };
    }
}

async function updateLocalBossData() {
    try {
        if (!fsSync.existsSync(DATA_FILES.bossImagesDir)) {
            await fs.mkdir(DATA_FILES.bossImagesDir);
        }

        const worldConfig = await loadJsonFile(DATA_FILES.worldConfig, { world: 'issobra' });
        const worldName = (worldConfig.world || 'issobra').toLowerCase();
        const url = `https://www.tibia-statistic.com/bosshunter/details/${worldName}`;
        
        // Headers para simular um navegador real e evitar bloqueios simples
        const response = await fetch(url, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9' 
            } 
        });

        if (!response.ok) {
            console.error(`[BOSS SYNC] Falha ao buscar dados para o mundo: ${worldConfig.world}. Status: ${response.status}`);
            return { success: false };
        }
        const html = await response.text();

        const generateFilename = (bossName) => {
             if (!bossName) return 'unknown.gif';
             return bossName.toLowerCase()
                .replace(/[^a-z0-9_]+/g, '_')
                .replace(/_+/g, '_') + '.gif';
        };

        // 1. Extrair "Chefes Mortos Ontem"
        // A nova estrutura usa a classe 'killed-boss-card'
        let killedYesterdayData = [];
        const killedBlockRegex = /<div class="yesterday-kills-compact[\s\S]*?<\/div>\s*<\/div>/;
        const killedMatch = html.match(killedBlockRegex);
        
        if (killedMatch) {
            const killedHtml = killedMatch[0];
            // Regex para capturar cada card dentro do bloco
            const bossCardRegex = /<a [^>]*class="killed-boss-card" title="([^"]+)">[\s\S]*?<img src="([^"]+)"/g;
            let match;
            while ((match = bossCardRegex.exec(killedHtml)) !== null) {
                const bossName = match[1].trim();
                const imageUrl = match[2];
                const filename = generateFilename(bossName);
                killedYesterdayData.push({ 
                    name: bossName, 
                    imageUrl: imageUrl, 
                    localImage: `boss_images/${filename}` 
                });
            }
        }

        let bossesData = [];

        // 2. Extrair TODOS os bosses (Tabela Principal + Tabela Sem Previsão)
        // A nova estrutura usa <tr id="boss-nome" ...> para todos os bosses
        const rowRegex = /<tr id="boss-[^"]+"[\s\S]*?<\/tr>/g;
        let rowMatch;

        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const rowHtml = rowMatch[0];

            // -- Extração do Nome --
            const nameMatch = rowHtml.match(/class="boss-name-link">\s*(.*?)\s*<\/a>/);
            if (!nameMatch) continue;
            let bossName = nameMatch[1].trim();
            // Corrige caracteres HTML encoded se houver (ex: Gaz'haragoth)
            bossName = bossName.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

            // -- Extração da Imagem --
            const imgMatch = rowHtml.match(/class="boss-thumbnail"[\s\S]*?src="([^"]+)"/);
            const imageUrl = imgMatch ? imgMatch[1] : null;

            // -- Extração da Última Aparição --
            // Procura pelo texto "X dias atrás" dentro do span days-text
            const lastSeenMatch = rowHtml.match(/class="days-text">\s*(.*?)\s*<\/span>/);
            // Ou pega a data bruta antes do span se necessário, mas o texto relativo é útil
            let lastSeen = lastSeenMatch ? lastSeenMatch[1].trim() : "N/A";
            // Limpa texto extra se houver
            lastSeen = lastSeen.replace(' dias atrás', '').replace(' dia atrás', '');
            if (lastSeen !== "N/A") lastSeen += " dias atrás";

            // -- Extração da Previsão (Data ou "Hoje") --
            let predictedDate = null;
            const predictionContainerMatch = rowHtml.match(/class="predicted-date-cell">([\s\S]*?)<\/div>/);
            
            if (predictionContainerMatch) {
                const predContent = predictionContainerMatch[1];
                // Verifica se tem "Hoje" (highlight-text)
                if (predContent.includes('highlight-text">Hoje')) {
                    predictedDate = "Hoje";
                } else {
                    // Tenta pegar a data no formato YYYY-MM-DD ou texto dentro de um span simples
                    const dateMatch = predContent.match(/<span>\s*(\d{4}-\d{2}-\d{2})[^\d<]*<\/span>/);
                    if (dateMatch) {
                        predictedDate = dateMatch[1];
                    }
                }
            }

            // -- Extração da Chance e Porcentagem --
            let chance = "Sem Previsão";
            let pct = 0;

            const chanceTextMatch = rowHtml.match(/class="chance-text[^"]*">\s*(.*?)\s*<\/span>/);
            if (chanceTextMatch) {
                chance = chanceTextMatch[1].trim();
                // Corrige encoding comum em PT
                chance = chance.replace(/&#xE9;/g, 'é').replace(/&#xE3;/g, 'ã');
            }

            const pctMatch = rowHtml.match(/class="chance-percentage[^"]*">\(([^%]+)%\)<\/span>/);
            if (pctMatch) {
                pct = parseInt(pctMatch[1], 10);
            }

            // Se a chance for "Alta probabilidade", normaliza para o padrão do seu sistema
            if (chance === "Alta probabilidade" || chance === "Alta Chance") chance = "Alta Chance";
            if (chance === "Probabilidade média" || chance === "Chance Média") chance = "Chance Média";
            if (chance === "Baixa probabilidade" || chance === "Baixa Chance") chance = "Baixa Chance";
            if (chance === "Sem chance") chance = "Sem Chance";

            // Se não achou previsão nenhuma, verifica se é da tabela "sem previsão" (chance será Sem Previsão)
            if (!chanceTextMatch && !pctMatch) {
                // Verifica se tem data-chance="nochance" no TR
                if (rowHtml.includes('data-chance="nochance"') || rowHtml.includes('data-chance="lowchance"')) {
                   // Mantém como Sem Previsão ou ajusta conforme lógica
                   if(chance === "Sem Previsão" && rowHtml.includes('data-chance="lowchance"')) chance = "Baixa Chance";
                }
            }

            const filename = generateFilename(bossName);

            bossesData.push({
                name: bossName,
                chance: chance,
                pct: pct,
                lastSeen: lastSeen,
                predictedDate: predictedDate,
                imageUrl: imageUrl,
                localImage: `boss_images/${filename}`
            });
        }

        // Salva os dados
        const finalData = {
            lastUpdated: new Date().toISOString(),
            killedYesterday: killedYesterdayData,
            bossList: bossesData
        };

        await saveJsonFile(DATA_FILES.bossData, finalData);
        await saveJsonFile(DATA_FILES.bossDataGlobal, finalData);
        await saveJsonFile(DATA_FILES.bosses, bossesData);

        // Opcional: Baixar imagens novas em background
        // downloadMissingImages(bossesData).catch(err => console.error("[IMG SYNC] Erro:", err));

        return { success: true };

    } catch (error) {
        console.error('[BOSS SYNC] Erro crítico ao atualizar dados dos bosses:', error);
        return { success: false };
    }
}


// async function downloadMissingImages(bossesData) {
//     console.log('[IMG SYNC] Verificando e baixando imagens faltantes em segundo plano...');
//     for (const boss of bossesData) {
//         // Constrói o caminho completo para a imagem local
//         const localPath = path.join(__dirname, boss.localImage);
        
//         // Verifica se a imagem já existe antes de tentar baixar
//         if (!fsSync.existsSync(localPath)) {
//             // A função downloadImage já existe no seu código, vamos usá-la.
//             await downloadImage(boss.imageUrl, localPath);
//             // Pequena pausa para não sobrecarregar o servidor de origem das imagens
//             await new Promise(resolve => setTimeout(resolve, 100));
//         }
//     }
//     console.log('[IMG SYNC] Verificação de imagens em segundo plano concluída.');
// }

async function adminArchivePointsManually(user, io) {
if (!hasAdminAccess(user)) {
            return { success: false, message: "❌ Acesso negado. Apenas líderes podem usar este comando." };
    }

    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const previousMonthStr = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
    const histFilePath = path.join(__dirname, 'points_history', `points_${previousMonthStr}.json`);

    try {
        await fs.access(histFilePath);
        return { success: false, message: `❌ O histórico para ${previousMonthStr} já existe. Use este comando apenas se o arquivamento automático falhar.` };
    } catch (error) {
        if (error.code === 'ENOENT') {
            const result = await pointsLogic.archiveCurrentMonth();
            io.emit('bot:broadcast_notification', { type: 'info', message: 'Um novo histórico de pontos foi criado manualmente por um líder. Um novo mês de pontuação foi iniciado!' });
            return { success: true, message: `✅ Histórico para ${previousMonthStr} criado e arquivado com sucesso. Pontos do novo mês iniciados.` };
        } else {
            console.error(`Erro ao verificar histórico:`, error);
            return { success: false, message: "❌ Ocorreu um erro interno ao tentar arquivar os pontos." };
        }
    }
}


async function deletePlanilhadoGroup({ groupLeader }) {
    const allGroups = await loadJsonFile(DATA_FILES.planilhadoGroups, []);
    const initialLength = allGroups.length;
    const updatedGroups = allGroups.filter(g => g.leader.toLowerCase() !== groupLeader.toLowerCase());

    if (updatedGroups.length < initialLength) {
        await saveJsonFile(DATA_FILES.planilhadoGroups, updatedGroups);
        
        await removeFromPlanilha({ type: 'normal', groupLeader });
        await removeFromPlanilha({ type: 'double', groupLeader });

        return { success: true };
    }
    return { success: false, message: 'Grupo não encontrado.' };
}

/**
 * Registro de evento de segurança no arquivo underattack.json.
 * @param {object} data 
 */
async function logUnderAttack(data) {
    const logFile = DATA_FILES.underattack;
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        ...data
    };

    const logString = JSON.stringify(logEntry) + '\n';

    try {
        await fs.appendFile(logFile, logString, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            try {
                await fs.writeFile(logFile, logString, 'utf8');
            } catch (writeError) {
                console.error(`[CRÍTICO] Falha ao criar o arquivo de log de ataque: ${logFile}`, writeError);
            }
        } else {
            console.error(`[CRÍTICO] Falha ao escrever no log de ataque: ${logFile}`, error);
        }
    }
}

let cachedData = {};


/**
 * Adiciona ou remove grupos de uma lista de personagens.
 * @param {object} data - Contém characterNames, groupIds e a ação ('add' ou 'remove').
 */
async function adminBatchUpdateUserGroups({ characterNames, groupIds, action }) {
    if (!characterNames || !groupIds || !action) return;

    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let changesMade = false;

    // Loop por cada personagem da lista de entrada
    for (const charName of characterNames) {
        let accountFound = false;
        // Encontra o personagem em clientAccounts
        for (const email in clientAccounts) {
            const account = clientAccounts[email];
            if (account?.tibiaCharacters) {
                const char = account.tibiaCharacters.find(c => c && c.characterName && c.characterName.toLowerCase() === charName.toLowerCase());
                if (char) {
                    let userGroups = new Set(char.groups || []);
                    if (action === 'add') {
                        groupIds.forEach(gId => userGroups.add(gId));
                    } else if (action === 'remove') {
                        groupIds.forEach(gId => userGroups.delete(gId));
                    }
                    char.groups = Array.from(userGroups);
                    changesMade = true;
                    accountFound = true;
                    break; // Sai do loop interno de emails para o próximo personagem
                }
            }
        }
        if (!accountFound) {
            console.warn(`[BATCH UPDATE] Personagem não encontrado: ${charName}`);
        }
    }

    if (changesMade) {
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
    }
}

async function adminRemoveUserFromGroup({ characterName, groupId }) {
    if (!characterName || !groupId) return { success: false };

    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let accountUpdated = false;

    for (const email in clientAccounts) {
        const account = clientAccounts[email];
        if (account?.tibiaCharacters) {
            const charIndex = account.tibiaCharacters.findIndex(c => c && c.characterName && c.characterName.toLowerCase() === characterName.toLowerCase());
            if (charIndex > -1) {
                const userGroups = account.tibiaCharacters[charIndex].groups;
                if (userGroups && userGroups.includes(groupId)) {
                    account.tibiaCharacters[charIndex].groups = userGroups.filter(gId => gId !== groupId);
                    accountUpdated = true;
                }
                break; 
            }
        }
    }
    if (accountUpdated) {
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
    }
    return { success: accountUpdated };
}

async function loadAndCacheData() {
    try {
        cachedData.respawns = await loadJsonFile(DATA_FILES.respawns, {});
        cachedData.respawnTimes = await loadJsonFile(DATA_FILES.respawnTimes, { "default": 150 });
        cachedData.webGroups = await loadJsonFile(DATA_FILES.webGroups, []);
    } catch(err) {
        console.error('Falha ao carregar dados do bot_logic para o cache:', err);
    }
}

loadAndCacheData();

async function loadJsonFile(filePath, defaultData = {}) {
    try {
        if (fsSync.existsSync(filePath)) {
            const data = await fs.readFile(filePath, 'utf8');
            // Se o arquivo existe mas está vazio, retorna default. Se tiver conteúdo, faz o parse.
            return data.trim() === '' ? defaultData : JSON.parse(data);
        }
        // Se o arquivo NÃO existe, cria um novo
        await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    } catch (error) {
        console.error(`ERRO CRÍTICO ao carregar ${filePath}:`, error);
        // CRUCIAL: Lance o erro para parar a execução e não sobrescrever o banco com vazio
        throw error; 
    }
}

async function saveJsonFile(filePath, data) {
    const tempFilePath = filePath + '.tmp'; // Define um nome para o arquivo temporário
    try {
        // 1. Escreve os novos dados no arquivo temporário.
        await fs.writeFile(tempFilePath, JSON.stringify(data, null, 2));
        
        // 2. Renomeia o arquivo temporário para o nome final. Esta operação é instantânea (atômica).
        await fs.rename(tempFilePath, filePath);
    } catch (error) {
        console.error(`Erro ao salvar atomicamente o arquivo ${filePath}:`, error);
        // Se ocorrer um erro, tenta remover o arquivo temporário para não deixar lixo.
        try {
            if (fsSync.existsSync(tempFilePath)) {
                await fs.unlink(tempFilePath);
            }
        } catch (cleanupError) {
            console.error(`Erro ao limpar o arquivo temporário ${tempFilePath}:`, cleanupError);
        }
    }
}

function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex'); return `${salt}:${hash}`; }
function verifyPassword(storedPassword, providedPassword) { if (!storedPassword || !storedPassword.includes(':')) return false; const [salt, originalHash] = storedPassword.split(':'); const hash = crypto.pbkdf2Sync(providedPassword, salt, 1000, 64, 'sha512').toString('hex'); return hash === originalHash; }
function parseCustomTime(timeString) { if (!timeString || !/^\d{1,2}:\d{2}$/.test(timeString)) return null; const parts = timeString.split(':'); return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10); }
function formatMinutesToHHMM(minutes) { if (isNaN(minutes)) return "00:00"; const h = Math.floor(minutes / 60); const m = Math.floor(minutes % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
async function getTibiaCharacterInfo(charName) { if (!charName) return null; try { const url = `https://api.tibiadata.com/v4/character/${encodeURIComponent(charName)}`; const response = await fetch(url); if (!response.ok) return null; const data = await response.json(); return data.character?.character || null; } catch (error) { console.error(`Erro ao buscar info de ${charName}:`, error); return null; } }
async function getGuildName() { const setGuild = await loadJsonFile(DATA_FILES.guildConfig, { guild: 'Exalted' }); return setGuild.guild || 'Exalted'; }

async function checkTibiaCharacterInGuild(charName) {
    const guildAliada = await getGuildName();
    const url = `https://api.tibiadata.com/v4/guild/${encodeURIComponent(guildAliada)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null; // Retorna NULL se a API falhar (Erro 500, 404, etc)
        
        const data = await response.json();
        // Verifica se a estrutura da guilda existe
        if (data.guild && data.guild.members) {
            const member = data.guild.members.find(member => member.name.toLowerCase() === charName.toLowerCase());
            return member || false; // Retorna o membro OU false (não está na guilda)
        }
        return null; // JSON inválido ou incompleto = Erro de API
    } catch (error) {
        console.error("Erro ao buscar guilda:", error);
        return null; // Erro de conexão = Erro de API
    }
}

async function getUserMaxTime(registrationData) {
    const respawnTimes = cachedData.respawnTimes;
    const webGroups = cachedData.webGroups;
    let baseTime = respawnTimes['default'] || 150;
    let rankName = 'default';

    if (registrationData?.guildRank && respawnTimes.hasOwnProperty(registrationData.guildRank)) {
        baseTime = respawnTimes[registrationData.guildRank];
        rankName = registrationData.guildRank;
    }

    let extraTime = 0;
    const groupBreakdown = [];
    if (Array.isArray(registrationData?.groups)) {
        registrationData.groups.forEach(userGroupId => {
            const groupInfo = webGroups.find(g => g.id === userGroupId);
            if (groupInfo?.extraTime) {
                extraTime += groupInfo.extraTime;
                groupBreakdown.push({ name: groupInfo.name, time: groupInfo.extraTime });
            }
        });
    }

    const calculatedTime = baseTime + extraTime;
    const totalTime = Math.min(calculatedTime, 210);

    return {
        total: totalTime, 
        breakdown: {
            base: { name: rankName, time: baseTime },
            groups: groupBreakdown,
            calculated: calculatedTime 
        }
    };
}

async function findRespawnCode(identifier) {
    if (!identifier) return null;
    const respawns = cachedData.respawns;
    const identifierLower = identifier.toLowerCase();
    for (const region in respawns) {
        for (const code in respawns[region]) {
            if (code.toLowerCase() === identifierLower) { return code.toUpperCase(); }
            const name = respawns[region][code];
            if (name.toLowerCase() === identifierLower) { return code.toUpperCase(); }
        }
    }
    return null;
}

async function logActivity(respawnCode, characterName, action) {
    const timestamp = new Date().toISOString();
    const respawns = cachedData.respawns;
    let respawnDisplayName = respawnCode.toUpperCase();
    for (const region in respawns) {
        if (respawns[region][respawnCode.toUpperCase()]) {
            respawnDisplayName = `[${respawnCode.toUpperCase()}] ${respawns[region][respawnCode.toUpperCase()]}`;
            break;
        }
    }

    const logRespawnEntry = { timestamp, respawnCode: respawnCode.toUpperCase(), user: characterName, action };
    const logCharacterEntry = { timestamp, characterName: characterName, respawn: respawnDisplayName, action };

    try {
        await fs.appendFile(DATA_FILES.logRespawn, JSON.stringify(logRespawnEntry) + '\n', 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(DATA_FILES.logRespawn, JSON.stringify(logRespawnEntry) + '\n', 'utf8');
        } else {
            console.error(`Falha ao escrever no log de respawn: ${DATA_FILES.logRespawn}`, error);
        }
    }

    try {
        await fs.appendFile(DATA_FILES.logCharacter, JSON.stringify(logCharacterEntry) + '\n', 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(DATA_FILES.logCharacter, JSON.stringify(logCharacterEntry) + '\n', 'utf8');
        } else {
            console.error(`Falha ao escrever no log de personagem: ${DATA_FILES.logCharacter}`, error);
        }
    }
}

async function processConversationReply(reply, user) {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
    let result = { responseText: "" };
    if (!user.conversationState) {
        return { responseText: "Não estou aguardando uma resposta." };
    }
    switch (user.conversationState) {
        case 'awaiting_reg_name': 
            user.registrationData = { name: reply };
            user.conversationState = 'awaiting_reg_email'; 
            result.responseText = `Obrigado, ${reply}. Agora, digite seu e-mail:`; 
            break;
        case 'awaiting_reg_email': 
            if (clientAccounts[reply]) { 
                result.responseText = "❌ Este e-mail já está em uso. Por favor, digite outro e-mail válido:";
            } else { 
                user.registrationData.email = reply; 
                user.conversationState = 'awaiting_reg_phone'; 
                result.responseText = `Ok. Agora, seu telefone (com DDD):`; 
            } 
            break;
        case 'awaiting_reg_phone': 
            user.registrationData.phone = reply; 
            user.conversationState = 'awaiting_reg_password'; 
            result.responseText = `Perfeito. Para finalizar, crie uma senha:`; 
            break;
        case 'awaiting_reg_password': 
            const regData = user.registrationData; 
            clientAccounts[regData.email] = { name: regData.name, phone: regData.phone, passwordHash: hashPassword(reply), tibiaCharacters: [], recoveryToken: null, recoveryTokenExpires: null };
            await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts); 
            result.responseText = { type: 'actionable_message', text: '✅ Conta criada com sucesso!', actions: [{ buttonText: 'Fazer Login Agora', command_to_run: '!showlogin' }] };
            user.conversationState = null; 
            user.registrationData = {}; 
            break;
        
        case 'awaiting_change_char_name': { 
            const newCharName = reply; 
            const account = user.account;
            const existingCharIndex = account.tibiaCharacters.findIndex(c => c && c.characterName && c.characterName.toLowerCase() === newCharName.toLowerCase());
            
            if (existingCharIndex > -1) {
                // --- INÍCIO DA NOVA LÓGICA ---
                const allAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
                const userAccount = allAccounts[account.email];

                if (userAccount) {
                    // Remove o personagem da sua posição atual
                    const charToMove = userAccount.tibiaCharacters.splice(existingCharIndex, 1)[0];
                    // Adiciona o personagem no início da lista
                    userAccount.tibiaCharacters.unshift(charToMove);
                    // Define o novo personagem como o ativo
                    userAccount.activeCharacterName = charToMove.characterName;

                    await saveJsonFile(DATA_FILES.clientAccounts, allAccounts);

                    // Atualiza a sessão do usuário com os novos dados
                    user.character = charToMove;
                    user.account = userAccount;

                    result.responseText = `✅ Sucesso! Você agora está usando o personagem ${charToMove.characterName} como principal.`; 
                    result.loginSuccess = true;
                    result.loginData = { account: { name: account.name, email: account.email }, character: charToMove, token: null };
                }
                // --- FIM DA NOVA LÓGICA ---
            } else { 
                const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes); 
                const codeToUse = crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12); 
                verificationCodes[account.email] = codeToUse; 
                await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes);
                result.responseText = { type: 'actionable_message', text: `O personagem [b]${newCharName}[/b] não está registrado.\nPara registrá-lo, adicione o código [b]${codeToUse}[/b] ao comentário dele no Tibia.com e clique abaixo.`, actions: [{ buttonText: `Verificar e Registrar ${newCharName}`, command_to_run: `!confirmregister ${newCharName}` }] };
            } 
            user.conversationState = null; 
            break; 
        }

        case 'awaiting_char_name': { 
            const characterNameToRegister = reply;
            const userIdentifier = user.account.email; 
            const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes); 
            const codeToUse = crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12); 
            verificationCodes[userIdentifier] = codeToUse; 
            await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes);
            result.responseText = { type: 'actionable_message', text: `Ok. Para registrar [b]${characterNameToRegister}[/b], adicione o código [b]${codeToUse}[/b] ao comentário dele no Tibia.com e clique no botão.`, actions: [{ buttonText: `Verificar e Registrar ${characterNameToRegister}`, command_to_run: `!confirmregister ${characterNameToRegister}` }] };
            user.conversationState = null; 
            break; 
        }
        case 'awaiting_login_email': 
            user.loginData = { email: reply };
            user.conversationState = 'awaiting_login_password'; 
            result.responseText = `Ok, agora digite a senha para ${reply}:`; 
            break;
        case 'awaiting_login_password': { 
            const loginEmail = user.loginData.email;
            const account = clientAccounts[loginEmail]; 
            if (!account || !verifyPassword(account.passwordHash, reply)) { 
                result.responseText = "❌ Senha inválida. Tente novamente:"; 
                user.conversationState = 'awaiting_login_password';
            } else { 
                const sessionToken = crypto.randomBytes(32).toString('hex'); 
                if (!account.sessionTokens) { account.sessionTokens = []; }
                account.sessionTokens.push(sessionToken);

                // Se tiver mais de 3 tokens, remove o mais antigo
                if (account.sessionTokens.length > 2) {
                    account.sessionTokens.shift(); 
}
                await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
                user.account = account; 
                user.account.email = loginEmail;
                
                let activeChar = null;
                if (account.activeCharacterName) {
                    activeChar = account.tibiaCharacters.find(c => c && c.characterName === account.activeCharacterName);
                }
                if (!activeChar && account.tibiaCharacters && account.tibiaCharacters.length > 0) {
                    activeChar = account.tibiaCharacters[0];
                }
                user.character = activeChar;
                result.loginSuccess = true;
                result.loginData = { account: { name: user.account.name, email: user.account.email }, character: user.character, token: sessionToken };
                if (!user.character) { 
                    result.responseText = `Login bem-sucedido! Bem-vindo, ${account.name}.\n\nNotei que você não tem nenhum personagem. Qual o nome do seu personagem principal?`; 
                    user.conversationState = 'awaiting_char_name'; 
                } else { 
                    result.responseText = `Login bem-sucedido! Bem-vindo, ${account.name}.`;
                    user.conversationState = null; 
                } 
            } 
            if (result.loginSuccess) { 
                user.loginData = {}; 
            } 
            break;
        }
        case 'awaiting_recovery_email': { 
            const email = reply.toLowerCase();
            if (!clientAccounts[email]) { 
                result.responseText = "❌ E-mail não encontrado. Tente novamente ou crie uma nova conta."; 
                user.conversationState = null;
            } else { 
                user.recoveryData = { email: email }; 
                user.conversationState = 'awaiting_recovery_name'; 
                result.responseText = `Ok. Agora, digite o seu nome completo, como foi cadastrado:`; 
            } 
            break;
        }
        case 'awaiting_recovery_name': { 
            const account = clientAccounts[user.recoveryData.email];
            if (account.name.toLowerCase() !== reply.toLowerCase()) { 
                result.responseText = "❌ Nome não confere com o registrado para este e-mail. Processo cancelado.";
                user.conversationState = null; 
                user.recoveryData = {}; 
            } else { 
                user.recoveryData.name = reply; 
                user.conversationState = 'awaiting_recovery_phone'; 
                result.responseText = `Nome confirmado. Por favor, digite o seu telefone (com DDD):`; 
            } 
            break;
        }
        case 'awaiting_recovery_phone': { 
            const account = clientAccounts[user.recoveryData.email];
            if (account.phone !== reply) { 
                result.responseText = "❌ Telefone não confere com o registrado. Processo cancelado."; 
                user.conversationState = null; 
                user.recoveryData = {}; 
            } else { 
                user.conversationState = 'awaiting_new_password'; 
                result.responseText = `✅ Verificação concluída com sucesso! Por favor, crie uma nova senha:`; 
            } 
            break; 
        }
        case 'awaiting_new_password': { 
            const email = user.recoveryData.email;
            const account = clientAccounts[email]; 
            account.passwordHash = hashPassword(reply); 
            await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
            result.responseText = { type: 'actionable_message', text: '✅ Senha alterada com sucesso!', actions: [{ buttonText: 'Fazer Login Agora', command_to_run: '!showlogin' }] };
            user.conversationState = null; 
            user.recoveryData = {}; 
            break; 
        }
        case 'awaiting_stream_link': { 
            const link = reply.trim();
            if (!link.toLowerCase().startsWith('http')) {
                result.responseText = "❌ Link inválido. O link deve começar com 'http' ou 'https'. Tente novamente.";
                break;
            }
            const allClientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
            const userAccount = allClientAccounts[user.account.email];
            const charIndex = userAccount.tibiaCharacters.findIndex(c => c && c.characterName === user.character.characterName);
            if (charIndex > -1) {
                userAccount.tibiaCharacters[charIndex].streamLink = link;
                await saveJsonFile(DATA_FILES.clientAccounts, allClientAccounts);
                result.responseText = "✅ Link da stream salvo com sucesso!";
                result.adminDataUpdate = true;
                user.conversationState = null;
            } else {
                result.responseText = "❌ Ocorreu um erro ao encontrar seu personagem.";
            }
            break;
        }

        case 'awaiting_news_message': {
            const newsData = {
                message: reply,
                author: user.character.characterName,
                date: new Date().toISOString()
            };
            await saveJsonFile(DATA_FILES.news, newsData);
            user.conversationState = null;
            result.responseText = "✅ Novidades do dia salvas com sucesso!";
            result.broadcastType = 'broadcast_notification';
            result.broadcastPayload = { type: 'info', message: `As novidades do dia foram atualizadas por ${user.character.characterName}. Digite !news para ver.` };
            break;
        }

        case 'awaiting_stream_link': {
            const link = reply.trim();
        }

        default: 
            result.responseText = "Ocorreu um erro na conversa. Tente novamente.";
            user.conversationState = null; 
            break;
    }
    return result;
}


async function processCommand(command, args, user, onlinePlayers) {
    const filaRespawns = await loadJsonFile(DATA_FILES.respawnQueue, {});
    let cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    const respawnGroups = await loadJsonFile(DATA_FILES.respawnGroups, {});
    let result = { responseText: "", needsBroadcast: false, broadcastType: null, broadcastPayload: {}, adminDataUpdate: false };
    const loggedInAccount = user.account; // This can be null for non-logged-in users
    const activeCharacter = user.character;

    const superAdmins = ['rapha2929@gmail.com'];
    const isSuperAdmin = loggedInAccount && superAdmins.includes(loggedInAccount.email);

    // Comandos que NÃO exigem que o usuário esteja logado
    const publicCommands = ['showlogin', 'showregistration', 'recover', 'help', 'news'];

    // Se o usuário NÃO está logado E o comando NÃO é um dos comandos públicos, então exige login
    if (!loggedInAccount && !publicCommands.includes(command)) {
        result.responseText = {
            type: 'actionable_message',
            text: "Você precisa fazer login para usar este comando.",
            actions: [{ buttonText: 'Fazer Login', command_to_run: '!showlogin' }]
        };
        return result;
    }

    // Define userIdentifier only if loggedInAccount exists
    const userIdentifier = loggedInAccount ? loggedInAccount.email : null; // Added conditional assignment

    const charName = activeCharacter?.characterName || (isSuperAdmin ? loggedInAccount?.name : 'Visitante'); // Added ?. for loggedInAccount.name
    const registration = { ...loggedInAccount, ...activeCharacter }; // loggedInAccount might be null here, so registration will be {null, ...activeCharacter}

    switch (command) {

case "addwz": {
            if (!hasAdminAccess(user)) {
                result.responseText = "❌ Apenas administradores podem usar este comando.";
                return result;
            }

            try {
                // Garante que está esperando a função assíncrona terminar
                const updateResult = await pointsLogic.updateAttendanceForMissedWarzoneDays(); 

                // Adiciona uma verificação para o caso de 'updateResult' ainda ser indefinido
                if (updateResult && updateResult.message) {
                    result.responseText = updateResult.message;
                } else {
                    console.error('[addwz] pointsLogic.updateAttendanceForMissedWarzoneDays não retornou um objeto válido.');
                    result.responseText = '⚠️ Ocorreu um erro ao processar a Warzone. Verifique os logs do servidor.';
                }
                
                result.broadcastPointsUpdate = true;

            } catch (error) {
                console.error('[addwz] Erro ao executar updateAttendanceForMissedWarzoneDays:', error);
                result.responseText = '❌ Erro interno ao executar o comando !addwz.';
            }
            break;
        }

case "novomes": {
    if (!hasAdminAccess(user)) { // Ou a verificação de permissão apropriada
        result.responseText = "❌ Apenas administradores podem usar este comando.";
        return result;
    }
    // Chama a função do points_logic
    const archiveResult = await pointsLogic.archiveCurrentMonth(); // Garanta que 'pointsLogic' é o objeto/módulo importado
    result.responseText = archiveResult.message;
    if (archiveResult.success) {
        result.broadcastType = 'broadcast_notification';
        result.broadcastPayload = { type: 'info', message: `O histórico mensal (pontos e warzone) foi arquivado por um líder! Um novo mês começou!` };
        result.broadcastPointsUpdate = true; // Sinaliza para atualizar o frontend
    }
    break;
}

case "ranking": {
            if (!hasAdminAccess(user)) { 
                result.responseText = "❌ Acesso negado. Apenas líderes podem usar este comando.";
                break;
            }
            
            // Retorna uma mensagem imediata e um gatilho para o server.js
            result.responseText = "Iniciando sincronia completa de ranks em segundo plano... Isso pode levar vários minutos. Você será notificado no chat quando terminar.";
            result.triggerAdminSync = true;
            break;
        }

case 'warmodeon': {
    if (!hasAdminAccess(user)) { 
        result.responseText = "❌ Apenas líderes podem ativar o War Mode.";
        return result; 
    }
    result.responseText = "⚔️ WAR MODE ATIVADO! O painel de guerra agora é restrito à guilda.";
    // CORREÇÃO AQUI: Mudado de warModeStatus para toggleWarMode
    result.toggleWarMode = true; 
    result.broadcastType = 'broadcast_notification';
    result.broadcastPayload = { type: 'warning', message: "⚔️ WAR MODE ATIVADO! Acesso ao painel restrito." };
    break;
}

case 'warmodeoff': {
    if (!hasAdminAccess(user)) { 
        result.responseText = "❌ Apenas líderes podem desativar o War Mode.";
        return result; 
    }
    result.responseText = "🛡️ War Mode desativado. Painel liberado.";
    // CORREÇÃO AQUI: Mudado de warModeStatus para toggleWarMode
    result.toggleWarMode = false;
    result.broadcastType = 'broadcast_notification';
    result.broadcastPayload = { type: 'info', message: "🛡️ War Mode desativado. Painel liberado ao público." };
    break;
}
        
        case "help":
            result.responseText = `[b]Comandos Gerais[/b]
!help -> Mostra esta lista de comandos.
!news -> Exibe as novidades do dia.
!shared [nível] -> Calcula a faixa de XP compartilhada.
!resp [código] -> Reserva um respawn com tempo padrão.
!resp [código] [tempo] -> Reserva um respawn com tempo definido.
ex: !resp A1 1:25
!respmaker [código] -> Reserva um respawn para caçar com maker.
!respdel [código] -> Libera um respawn ou sai da fila.
!respinfo [código] -> Mostra informações sobre um respawn.
!aceitar -> Confirma a posse de um respawn que você reservou.
!maker [nome] -> Define o nome do seu personagem maker.
!plan [código] -> Assume um respawn da planilha.

[b]Comandos de Conta[/b]
!showlogin -> Inicia o processo de login via chat.
!showregistration -> Inicia o processo de criação de conta.
!recover -> Inicia a recuperação de conta.
!logout -> Desconecta sua conta.
!register [nome] -> Registra um novo personagem na sua conta.
!startchangechar -> Troca de personagem principal.
!stream -> Adiciona ou atualiza o link da sua live.
!removestream -> Remove o link da sua live.

[b]Comandos de Liderança[/b]
!mp [mensagem] -> Envia uma mensagem em massa para todos online.
!hoje -> Define as novidades do dia.
!ranking -> Atualiza todos os rankings.
!addwz -> Registra a presença da Warzone para dias anteriores no mês.
    Obs: Esse comando deve ser usado sempre após eventos que a guild nao fez WZ e no ultimo dia do mes após o registro das presenças da WZ
!novomes -> Arquiva o ranking e inicia um novo mês de pontuação.
    obs: Esse comando deve ser usado sempre no ultimo dia do mes após o registro das presenças da WZ e sincronização de experiência`;
            return result;

    
        case "showlogin":
            if (loggedInAccount) {
                result.responseText = `Você já está conectado como ${loggedInAccount.name}.`;
                return result;
            }
            user.conversationState = 'awaiting_login_email';
            result.responseText = "Para fazer o login, por favor, digite seu e-mail:";
            return result;
        case "showregistration":
            if (loggedInAccount) {
                result.responseText = `Você já está conectado como ${loggedInAccount.name}.`;
                return result;
            }
            user.conversationState = 'awaiting_reg_name';
            result.responseText = "Ok, vamos criar sua conta. Primeiro, qual o seu nome completo?";
            return result;
        case "recover":
            user.conversationState = 'awaiting_recovery_email';
            result.responseText = "Ok, vamos iniciar a recuperação. Por favor, digite o e-mail da sua conta:";
            return result;
        case "resetpassword":
            return result;
        case "stream": 
            if (!loggedInAccount) { // Defensive check, should be caught by earlier logic, but good for clarity
                result.responseText = "Erro: Login necessário para usar este comando."; return result;
            }
            user.conversationState = 'awaiting_stream_link';
            result.responseText = "Por favor, cole o link da sua stream (ex: https://twitch.tv/seu_canal):";
            break;
        case "removestream": { // This command requires login
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            const allClientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
            const userAccount = allClientAccounts[userIdentifier]; // userIdentifier will be valid here
            const charIndex = userAccount.tibiaCharacters.findIndex(c => c && c.characterName === charName);
            if (charIndex > -1 && userAccount.tibiaCharacters[charIndex].streamLink) {
                delete userAccount.tibiaCharacters[charIndex].streamLink;
                await saveJsonFile(DATA_FILES.clientAccounts, allClientAccounts);
                result.responseText = "✅ Link da stream removido com sucesso.";
                result.adminDataUpdate = true;
            } else {
                result.responseText = "Você não possui um link de stream cadastrado.";
            }
            break;
        }
        case "startchangechar": // This command requires login
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            user.conversationState = 'awaiting_change_char_name';
            result.responseText = "Qual o nome do personagem para o qual você deseja trocar?";
            break;
        case "register": { // This command requires loggedInAccount to get userIdentifier for verificationCodes
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para registrar um personagem."; return result; }
            const characterName = args.join(" ");
            if (!characterName) {
                user.conversationState = 'awaiting_char_name';
                result.responseText = "Entendido. Digite o nome exato do personagem que deseja registrar:";
            } else {
                const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes);
                const codeToUse = crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12);
                verificationCodes[userIdentifier] = codeToUse; // userIdentifier is valid here because of loggedInAccount check
                await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes);
                result.responseText = {
                    type: 'actionable_message',
                    text: `Ok.\nPara registrar [b]${characterName}[/b], adicione o código [b]${codeToUse}[/b] ao comentário dele no Tibia.com e clique no botão.`,
                    actions: [{ buttonText: `Verificar e Registrar ${characterName}`, command_to_run: `!confirmregister ${characterName}` }]
                };
            }
            break;
        }
        case "confirmregister": { // This command requires loggedInAccount and valid userIdentifier
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para confirmar o registro."; return result; }
            const characterNameToConfirm = args.join(" ");
            if (!characterNameToConfirm) { result.responseText = "Especifique o nome do personagem."; break;
            }
            const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes);
            const code = verificationCodes[userIdentifier]; // userIdentifier is valid here
            if (!code) { result.responseText = "Nenhum código de verificação ativo. Use !register."; break;
            }
            const charInfo = await getTibiaCharacterInfo(characterNameToConfirm);
            if (!charInfo || !charInfo.comment || !charInfo.comment.includes(code)) {
                result.responseText = {
                    type: 'actionable_message',
                    text: `Código '${code}' não encontrado no comentário de '${characterNameToConfirm}'.\nAguarde 5 minutos e tente novamente.`,
                    actions: [{
                        buttonText: `Verificar Novamente`, command_to_run: `!confirmregister ${characterNameToConfirm}` }]
                };
                break;
            }
            const guildMember = await checkTibiaCharacterInGuild(charInfo.name);
            if (!guildMember) {
                result.responseText = `O personagem ${charInfo.name} não pertence à guilda '${await getGuildName()}'.`;
                break;
            }
            const allClientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
            Object.values(allClientAccounts).forEach(acc => {
                acc.tibiaCharacters = (acc.tibiaCharacters || []).filter(c => c && c.characterName && c.characterName.toLowerCase() !== charInfo.name.toLowerCase());
            });
            const newCharData = {
                characterName: charInfo.name,
                registeredAt: new Date().toISOString(),
                level: charInfo.level,
                vocation: charInfo.vocation,
                world: charInfo.world,
                guildRank: guildMember.rank || null,
                groups: []
            };
            loggedInAccount.tibiaCharacters.push(newCharData);
            allClientAccounts[userIdentifier] = loggedInAccount;
            user.character = newCharData;
            delete verificationCodes[userIdentifier];
            await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes);
            await saveJsonFile(DATA_FILES.clientAccounts, allClientAccounts);
            result.adminDataUpdate = true;
            result.responseText = `✅ Sucesso! O personagem ${charInfo.name} foi registrado na sua conta.`;
            break;
        }
        case "mp": {
            // Apenas para membros com ranks de admin
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            const allowedRanks = ["leader alliance", "leader", "prodigy"];
            if (!allowedRanks.includes((registration.guildRank || "").toLowerCase())) {
                result.responseText = "Sem permissão.";
                break;
            }
            const message = args.join(" ");
            if (!message) {
                result.responseText = "Uso: !mp [mensagem]";
                break;
            }
            result.responseText = "✅ Mensagem enviada.";
            result.broadcastType = 'mass_message';
            result.broadcastPayload = { sender: charName, message: message };
            break;
        }
        case "respinfo": {
            const userInput = args.join(" ");
            if (!userInput) { result.responseText = "Uso: !respinfo [nome ou código]"; break;
            }
            const respawnCode = await findRespawnCode(userInput);
            if (!respawnCode) { result.responseText = `Respawn "${userInput}" não encontrado.`; break;
            }
            const actualRespawnKey = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            if (!actualRespawnKey) { result.responseText = `Ninguém está no respawn ${respawnCode.toUpperCase()}.`; break;
            }
            const respawn = filaRespawns[actualRespawnKey];
            let infoText = `Informações para ${respawnCode.toUpperCase()}:\n`;
            infoText += `Caçando agora: ${respawn.current ? respawn.current.clientNickname : 'Ninguém'}\n`;
            infoText += "Fila de espera (Nexts):\n";
            if (respawn.queue && respawn.queue.length > 0) {
                respawn.queue.forEach((user, index) => { infoText += `${index + 1}. ${user.clientNickname}\n`; });
            } else {
                infoText += "Fila de espera está vazia.";
            }
            result.responseText = infoText;
            break;
        }
        case "plan": {
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            if (!activeCharacter) {
                result.responseText = "Você precisa ter um personagem ativo para usar este comando.";
                return result;
            }

            const respawnCodeInput = args[0];
            if (!respawnCodeInput) {
                result.responseText = "Uso: !plan [código do respawn]";
                return result;
            }

            const respawnCode = await findRespawnCode(respawnCodeInput);
            if (!respawnCode) {
                result.responseText = `Respawn "${respawnCodeInput}" não encontrado.`;
                return result;
            }

            const planilhadoScheduleNormal = await loadJsonFile(DATA_FILES.planilhadoSchedule, {});
            const planilhadoScheduleDouble = await loadJsonFile(DATA_FILES.planilhadoDoubleSchedule, {});

            let isLeaderInPlanilhado = false;
            let planilhadoType = null;
            let scheduledLeader = null;
            let scheduledDuration = 210;

            const checkScheduleForLeader = (schedule, type) => {
                if (schedule[respawnCode]) {
                    for (const timeSlot in schedule[respawnCode]) {
                        const scheduleEntry = schedule[respawnCode][timeSlot];
                        const leaderToCheck = typeof scheduleEntry === 'object' ? scheduleEntry.leader : scheduleEntry;

                        if (leaderToCheck.toLowerCase() === charName.toLowerCase()) {
                            isLeaderInPlanilhado = true;
                            planilhadoType = type;
                            scheduledLeader = leaderToCheck;
                            scheduledDuration = typeof scheduleEntry === 'object' && scheduleEntry.duration ? scheduleEntry.duration : 210;
                            return true;
                        }
                    }
                }
                return false;
            };

            if (!checkScheduleForLeader(planilhadoScheduleNormal, 'normal')) {
                checkScheduleForLeader(planilhadoScheduleDouble, 'double');
            }
            
            if (!isLeaderInPlanilhado) {
                result.responseText = `❌ Você não tem um agendamento na planilha para o respawn ${respawnCode.toUpperCase()}.`;
                return result;
            }

            const actualRespawnKey = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            if (actualRespawnKey && filaRespawns[actualRespawnKey].current?.clientUniqueIdentifier === userIdentifier) {
                result.responseText = `Você já está no respawn ${respawnCode.toUpperCase()} como planilhado.`;
                return result;
            }

            if (actualRespawnKey && filaRespawns[actualRespawnKey].current) {
                const kickedUser = filaRespawns[actualRespawnKey].current.clientNickname;
                await logActivity(actualRespawnKey, kickedUser, `Removido por ${charName} (Planilhado)`);
            }
            
            if (actualRespawnKey && filaRespawns[actualRespawnKey].queue.length > 0) {
                 filaRespawns[actualRespawnKey].queue = [];
            }

            const allPlanilhadoGroups = await loadJsonFile(DATA_FILES.planilhadoGroups, {});
            const currentGroup = allPlanilhadoGroups.find(g => g.leader.toLowerCase() === charName.toLowerCase());
            
            const groupMembersNames = currentGroup ? currentGroup.members.map(name => ({ name: name })) : [];
            
            const planilhadoUserData = {
                clientNickname: charName,
                clientUniqueIdentifier: userIdentifier,
                allocatedTime: scheduledDuration,
                isPlanilhado: true,
                planilhadoType: planilhadoType,
                groupLeader: scheduledLeader,
                groupMembers: groupMembersNames
            };

            const now = new Date();
            filaRespawns[respawnCode] = {
                current: planilhadoUserData,
                queue: [],
                time: scheduledDuration,
                waitingForAccept: false,
                acceptanceTime: 0,
                startTime: now.toISOString(),
                endTime: new Date(now.getTime() + (scheduledDuration * 60 * 1000)).toISOString(),
                planilhadoGroup: currentGroup
            };
            await logActivity(respawnCode, charName, `Assumiu (Planilhado)`);
            result.responseText = `✅ O respawn ${respawnCode.toUpperCase()} foi assumido pelo seu grupo planilhado por ${formatMinutesToHHMM(scheduledDuration)}.`;
            result.needsBroadcast = true;
            await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
            break;
        }
case "phodeuwz": {
if (!hasAdminAccess(user)) {
            result.responseText = "❌ Acesso negado. Apenas líderes podem usar este comando.";
        break;
    }

    const playersToMark = args.join(" ").split(',').map(name => name.trim()).filter(Boolean);

    let updateResult;
    if (playersToMark.length === 0) {
        // Se nenhum nome for fornecido, marca falta para todos
        updateResult = await pointsLogic.markAllAsAbsentForWarzone();
    } else {
        // Se nomes forem fornecidos, marca falta para os específicos
        updateResult = await pointsLogic.markWarzoneAbsence(playersToMark);
    }

    result.responseText = updateResult.message;
    
    if (updateResult.success) {
        result.pointsDataUpdate = true;
    }
    break;
}

        case "hoje": {
            const allowedRanksForNews = ["leader alliance", "leader", "vice leader", "hero"];
            if (!user.character || !allowedRanksForNews.includes(user.character.guildRank?.toLowerCase())) {
                result.responseText = "❌ Acesso negado. Apenas Líderes e Heros podem usar este comando.";
                break;
            }
            user.conversationState = 'awaiting_news_message';
            result.responseText = "Por favor, insira a mensagem com as novidades de hoje:";
            break;
        }

        case "news": {
            const newsData = await loadJsonFile(DATA_FILES.news, {});
            if (newsData && newsData.message) {
                const newsDate = new Date(newsData.date);
                const formattedDate = `${newsDate.toLocaleDateString('pt-BR')} às ${newsDate.toLocaleTimeString('pt-BR')}`;
                result.responseText = `--- NOVIDADES ---\n\n${newsData.message}\n\nPostado por: ${newsData.author} em ${formattedDate}`;
            } else {
                result.responseText = "Nenhuma novidade foi postada hoje.";
            }
            break;
        }

        case "planilhadoremove": { // Comando para remover grupo planilhado do respawn (kick)
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            const respawnCodeInput = args[0];
            const groupLeaderToRemove = args[1];

            if (!respawnCodeInput || !groupLeaderToRemove) {
                result.responseText = "Uso: !planilhadoremove [código do respawn] [nome do líder do grupo]";
                return result;
            }

            const userIsAdminCommand = user.character && adminRanks.includes(user.character.guildRank?.toLowerCase()); // Check for admin rank for the command
            const isGroupLeaderCommand = user.character && user.character.characterName.toLowerCase() === groupLeaderToRemove.toLowerCase(); // Check if user is the leader being targeted

            if (!userIsAdminCommand && !isGroupLeaderCommand) { // Only allow if admin or the actual leader
                result.responseText = "❌ Você não tem permissão para remover este grupo planilhado do respawn.";
                return result;
            }

            const respawnCode = await findRespawnCode(respawnCodeInput);
            if (!respawnCode) {
                result.responseText = `Respawn "${respawnCodeInput}" não encontrado.`;
                return result;
            }

            const key = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            if (!key) {
                result.responseText = `Respawn ${respawnCode.toUpperCase()} não está ativo.`;
                return result;
            }

            const respawn = filaRespawns[key];

            // Condição para permitir a remoção: é admin OU o líder do grupo planilhado que está no respawn corresponde
            const currentOccupantIsPlanilhadoLeader = respawn.current?.groupLeader?.toLowerCase() === groupLeaderToRemove.toLowerCase() ||
                                                      (respawn.current && !respawn.current.groupLeader && respawn.current.clientNickname.toLowerCase() === groupLeaderToRemove.toLowerCase());

            if (userIsAdminCommand || currentOccupantIsPlanilhadoLeader) { // Allow removal if admin or matching leader
                await logActivity(key, respawn.current?.clientNickname || 'N/A', `Grupo Planilhado removido por ${user.character?.characterName || 'Admin'}`);

                if (respawn.queue.length > 0) {
                    const nextUser = respawn.queue.shift();
                    respawn.current = nextUser;
                    respawn.time = nextUser.allocatedTime;
                    respawn.waitingForAccept = true;
                    respawn.acceptanceTime = 10;
                    respawn.startTime = new Date().toISOString();
                    respawn.endTime = null;
                    await logActivity(key, nextUser.clientNickname, `Assumiu (fila)`);
                } else {
                    delete filaRespawns[key];
                }

                result.responseText = `✅ O grupo planilhado de ${groupLeaderToRemove} foi removido do respawn ${respawnCode.toUpperCase()}.`;
                result.needsBroadcast = true;
                await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);

            } else {
                result.responseText = `❌ O respawn ${respawnCode.toUpperCase()} não está ocupado por um grupo planilhado de ${groupLeaderToRemove}, ou você não tem permissão.`;
            }
            break;
        }
        case "respmaker":
        case "resp": {
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            if (!isSuperAdmin) {
                const guildMemberCheck = await checkTibiaCharacterInGuild(charName);
                if (!guildMemberCheck) {
                    result.responseText = `❌ Você não pode reservar um respawn pois não faz parte da guilda '${await getGuildName()}'.`;
                    return result;
                }
            }

            const isMakerHunt = command === 'respmaker';
            if (!isSuperAdmin) {
                const userGroups = registration.groups ||
                [];
                if (userGroups.includes('resp-block')) {
                    result.responseText = "❌ Você não pode reservar respawns porque possui o grupo 'Resp-Block'.";
                    break;
                }
            }

            if (cooldowns[userIdentifier] && cooldowns[userIdentifier] > Date.now() && !isSuperAdmin) {
                const remaining = Math.ceil((cooldowns[userIdentifier] - Date.now()) / 60000);
                result.responseText = `Você está em cooldown e não pode reservar um novo respawn. Espere mais ${remaining} minuto(s).`;
                return result;
            }

            const maxTimeData = await getUserMaxTime(registration);
            if (maxTimeData.total === 0 && !isSuperAdmin) {
                result.responseText = "Você não pode reservar um Respawn com esse Character";
                return result;
            }

            const respawnKeyWaiting = Object.keys(filaRespawns).find(k => filaRespawns[k].waitingForAccept && filaRespawns[k].current?.clientUniqueIdentifier === userIdentifier);
            if (respawnKeyWaiting) {
                result.responseText = `Você foi removido do respawn ${respawnKeyWaiting.toUpperCase()} porque está reservando um novo.\n\n`;
                const oldRespawn = filaRespawns[respawnKeyWaiting];
                await logActivity(respawnKeyWaiting, charName, `Abandonou (nova reserva)`);
                if (oldRespawn.queue.length > 0) {
                    const nextUser = oldRespawn.queue.shift();
                    oldRespawn.current = nextUser;
                    oldRespawn.time = nextUser.allocatedTime;
                    oldRespawn.waitingForAccept = true;
                    oldRespawn.acceptanceTime = 10;
                    oldRespawn.startTime = new Date().toISOString();
                    oldRespawn.endTime = null;
                    await logActivity(respawnKeyWaiting, nextUser.clientNickname, `Assumiu (abandono)`);
                } else {
                    delete filaRespawns[respawnKeyWaiting];
                }
            }

            const timeArg = /^\d{1,2}:\d{2}$/.test(args[args.length - 1]) ?
            args[args.length - 1] : null;
            const userInput = timeArg ? args.slice(0, -1).join(' ') : args.join(' ');
            if (!userInput) { result.responseText += `Uso: !${command} [nome ou código] [tempo opcional]`; break;
            }
            const respawnCode = await findRespawnCode(userInput);
            if (!respawnCode) { result.responseText += `Respawn "${userInput}" não encontrado.`; break;
            }

            if (!isSuperAdmin) {
                const rankRestrictions = await loadJsonFile(path.join(__dirname, 'respawn_rank_restrictions.json'), {});
                const restrictedRanksForRespawn = rankRestrictions[respawnCode] || [];
                if (restrictedRanksForRespawn.includes(registration.guildRank)) {
                    result.responseText = `❌ Seu rank ('${registration.guildRank}') não tem permissão para reservar este respawn.`;
                    return result;
                }

                const requiredGroups = respawnGroups[respawnCode];
                if (requiredGroups?.length > 0 && !requiredGroups.some(g => (registration.groups || []).includes(g))) {
                    result.responseText += `Requer um dos grupos: ${cachedData.webGroups.find(g => requiredGroups.includes(g.id))?.name ||
                    'desconhecido'}.`;
                    break;
                }
            }
            // Numero de claimeds simultanoes e nexts
            if (Object.values(filaRespawns).reduce((c, r) => c + (r.current?.clientUniqueIdentifier === userIdentifier) + r.queue.some(u => u.clientUniqueIdentifier === userIdentifier), 0) >= 1 && !isSuperAdmin) {
                result.responseText += "Limite de 1 respawns atingido.";
                break;
            }

            const maxTimeAllowed = isSuperAdmin ?
            210 : maxTimeData.total;

            let finalTimeInMinutes = maxTimeAllowed;
            if (timeArg) {
                const requestedTime = parseCustomTime(timeArg);
                if (requestedTime === null) { result.responseText += `Formato de tempo inválido: "${timeArg}". Use HH:MM.`; break;
                }
                if (requestedTime > maxTimeAllowed) { result.responseText += `Tempo excede seu limite de ${formatMinutesToHHMM(maxTimeAllowed)}.`;
                break; }
                finalTimeInMinutes = requestedTime;
            }

            const userData = { clientNickname: charName, clientUniqueIdentifier: userIdentifier, allocatedTime: finalTimeInMinutes, isMakerHunt: isMakerHunt, makerName: null };

            const actualRespawnKey = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            const respawnExists = actualRespawnKey ? filaRespawns[actualRespawnKey] : null;
            const isHuntingElsewhere = Object.values(filaRespawns).some(r => r.current?.clientUniqueIdentifier === userIdentifier);

            if (isHuntingElsewhere && !respawnExists && !isSuperAdmin) {
                result.responseText = `❌ Você não pode pegar um respawn vazio enquanto estiver caçando ativamente em outro.\nSaia do seu respawn atual ou entre na fila de um já existente.`;
                return result;
            }

            if (respawnExists) {
                if (respawnExists.current?.clientUniqueIdentifier === userIdentifier || respawnExists.queue.some(u => u.clientUniqueIdentifier === userIdentifier)) {
                    result.responseText += `Você já está em ${respawnCode.toUpperCase()}.`;
                } else {
                    if (isHuntingElsewhere && respawnExists.queue.length === 0 && !isSuperAdmin) {
                        result.responseText += `❌ Você não pode ser o próximo na fila enquanto estiver caçando ativamente em outro respawn.`;
                        return result;
                    }
                    respawnExists.queue.push(userData);
                    await logActivity(respawnCode, charName, `Entrou na fila`);
                    result.responseText += `Você entrou na fila para ${respawnCode.toUpperCase()}.`;
                }
            } else {
                filaRespawns[respawnCode] = { current: userData, queue: [], time: finalTimeInMinutes, waitingForAccept: true, acceptanceTime: 10, startTime: new Date().toISOString() };
                await logActivity(respawnCode, charName, `Pegou o respawn`);
                if (isMakerHunt) {
                    result.responseText += `Você pegou ${respawnCode.toUpperCase()} para uma hunt com maker.\nUse !maker nome_do_maker para defini-lo.`;
                } else {
                    result.responseText += `Você pegou ${respawnCode.toUpperCase()}.\nUse 'Aceitar' em 10 min.`;
                }
            }
            result.needsBroadcast = true;
            await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
            break;
        }
        case "maker": {
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            const makerName = args.join(" ");
            if (!makerName) {
                result.responseText = "Uso: !maker nome_do_maker";
                return result;
            }
            let userEntry = null;
            let respawnKey = null;
            for (const key in filaRespawns) {
                const respawn = filaRespawns[key];
                if (respawn.current?.clientUniqueIdentifier === userIdentifier) {
                    userEntry = respawn.current;
                    respawnKey = key;
                    break;
                }
                const queueIndex = respawn.queue.findIndex(u => u.clientUniqueIdentifier === userIdentifier);
                if (queueIndex > -1) {
                    userEntry = respawn.queue[queueIndex];
                    respawnKey = key;
                    break;
                }
            }
            if (userEntry && userEntry.isMakerHunt) {
                userEntry.makerName = makerName;
                await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
                result.responseText = `✅ Maker definido como "${makerName}" para o respawn ${respawnKey.toUpperCase()}. Agora você pode usar !aceitar.`;
                result.needsBroadcast = true;
            } else {
                result.responseText = "❌ Você não está em uma reserva de hunt com maker ou não foi encontrado em nenhuma fila/respawn.";
            }
            break;
        }
        case "aceitar": {
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            if (cooldowns[userIdentifier] && cooldowns[userIdentifier] > Date.now()) {
                const remaining = Math.ceil((cooldowns[userIdentifier] - Date.now()) / 60000);
                result.responseText = `Você está em cooldown. Espere mais ${remaining} minuto(s).`;
                break;
            }
            const respawnKey = Object.keys(filaRespawns).find(k => filaRespawns[k].current?.clientUniqueIdentifier === userIdentifier && filaRespawns[k].waitingForAccept);
            if (!respawnKey) {
                result.responseText = "Nenhum respawn para aceitar.";
                break;
            }
            const respawn = filaRespawns[respawnKey];
            if (respawn.paused) {
                respawn.waitingForAccept = false;
                respawn.time = respawn.current.allocatedTime;
                respawn.startTime = new Date().toISOString();
                respawn.endTime = null;
                respawn.remainingTimeOnPause = respawn.time * 60000;
                if (respawn.hasOwnProperty('remainingAcceptanceTimeOnPause')) {
                    delete respawn.remainingAcceptanceTimeOnPause;
                }
                await logActivity(respawnKey, charName, `Aceitou o respawn (PAUSADO)`);
                result.responseText = `✅ Você aceitou ${respawnKey.toUpperCase()}. Ele permanecerá PAUSADO até ser liberado por um líder.`;
                cooldowns[userIdentifier] = Date.now() + 10 * 60 * 1000;
                await saveJsonFile(DATA_FILES.cooldowns, cooldowns);
                result.responseText += " Você entrou em cooldown de 10 min para aceitar outro respawn.";
                result.needsBroadcast = true;
                await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
            } else {
                respawn.waitingForAccept = false;
                respawn.time = respawn.current?.allocatedTime || respawn.time || 150;
                respawn.startTime = new Date().toISOString();
                respawn.endTime = new Date(Date.now() + respawn.time * 60000).toISOString();
                await logActivity(respawnKey, charName, `Aceitou o respawn`);
                result.responseText = `Você aceitou ${respawnKey.toUpperCase()}.`;
                cooldowns[userIdentifier] = Date.now() + 10 * 60 * 1000;
                await saveJsonFile(DATA_FILES.cooldowns, cooldowns);
                result.responseText += " Você entrou em cooldown de 10 min para aceitar outro respawn.";
                result.needsBroadcast = true;
                await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
            }
            break;
        }
        case "respdel": {
            if (!loggedInAccount) { result.responseText = "Erro: Login necessário para usar este comando."; return result; }
            const userInput = args.join(" ");
            if (!userInput) { result.responseText = "Uso: !respdel [nome ou código]"; break;
            }
            const respawnCode = await findRespawnCode(userInput);
            if (!respawnCode) { result.responseText = `Respawn "${userInput}" não encontrado.`; break;
            }
            const key = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            if (!key) { result.responseText = `Respawn ${respawnCode.toUpperCase()} não está ativo.`; break;
            }
            const respawn = filaRespawns[key];

            let removed = false;

            if (respawn.current?.clientUniqueIdentifier === userIdentifier) {
                if (respawn.current.isPlanilhado) {
                    const allPlanilhadoGroups = await loadJsonFile(DATA_FILES.planilhadoGroups, {});
                    const currentGroup = allPlanilhadoGroups.find(g => g.leader.toLowerCase() === respawn.current.groupLeader.toLowerCase());
                    if (currentGroup && currentGroup.members.some(member => member.toLowerCase() === charName.toLowerCase())) {
                        cooldowns[userIdentifier] = Date.now() + 10 * 60 * 1000;
                        await saveJsonFile(DATA_FILES.cooldowns, cooldowns);
                        await logActivity(key, charName, `Saiu do respawn (Planilhado)`);
                        result.responseText = `Você saiu de ${respawnCode.toUpperCase()} (planilhado) e entrou em cooldown de 10 min.`;
                        if (respawn.queue.length > 0) {
                            const nextUser = respawn.queue.shift();
                            respawn.current = nextUser;
                            respawn.time = nextUser.allocatedTime;
                            respawn.waitingForAccept = true;
                            respawn.acceptanceTime = 10;
                            respawn.startTime = new Date().toISOString();
                            respawn.endTime = null;
                            await logActivity(key, nextUser.clientNickname, `Assumiu (fila)`);
                            if (respawn.paused) {
                                respawn.remainingAcceptanceTimeOnPause = respawn.acceptanceTime * 60 * 1000;
                            }
                        } else {
                            delete filaRespawns[key];
                        }
                        removed = true;
                    }
                } else {
                    cooldowns[userIdentifier] = Date.now() + 10 * 60 * 1000;
                    await saveJsonFile(DATA_FILES.cooldowns, cooldowns);
                    await logActivity(key, charName, `Saiu do respawn`);
                    result.responseText = `Você saiu de ${respawnCode.toUpperCase()} e entrou em cooldown de 10 min.`;
                    if (respawn.queue.length > 0) {
                        const nextUser = respawn.queue.shift();
                        respawn.current = nextUser;
                        respawn.time = nextUser.allocatedTime;
                        respawn.waitingForAccept = true;
                        respawn.acceptanceTime = 10;
                        respawn.startTime = new Date().toISOString();
                        respawn.endTime = null;
                        await logActivity(key, nextUser.clientNickname, `Assumiu (fila)`);
                        if (respawn.paused) {
                            respawn.remainingAcceptanceTimeOnPause = respawn.acceptanceTime * 60 * 1000;
                        }
                    } else {
                        delete filaRespawns[key];
                    }
                    removed = true;
                }
            } else {
                const queueIndex = respawn.queue.findIndex(u => u.clientUniqueIdentifier === userIdentifier);
                if (queueIndex > -1) {
                    respawn.queue.splice(queueIndex, 1);
                    await logActivity(key, charName, `Saiu da fila`);
                    result.responseText = `Você foi removido da fila de ${respawnCode.toUpperCase()}.`;
                    removed = true;
                } else {
                    result.responseText = `Você não está em ${respawnCode.toUpperCase()}.`;
                }
            }

            if (removed) {
                result.needsBroadcast = true;
                await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
            }
            break;
        }
        case "shared": {
            const level = parseInt(args[0], 10);
            if (isNaN(level) || level <= 0) {
                result.responseText = "Forneça um nível válido.";
            } else {
                result.responseText = `Um nível ${level} compartilha XP com ${Math.ceil(level * 2 / 3)} e ${Math.floor(level * 3 / 2)}.`;
            }
            break;
        }
        case "logout": {
            if (!loggedInAccount) { result.responseText = "Erro: Você não está logado."; return result; }
            const token = args[0];
            if (token && loggedInAccount.sessionTokens) {
                const allClientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
                loggedInAccount.sessionTokens = loggedInAccount.sessionTokens.filter(t => t !== token);
                allClientAccounts[userIdentifier] = loggedInAccount;
                await saveJsonFile(DATA_FILES.clientAccounts, allClientAccounts);
            }
            result.logoutSuccess = true;
            result.responseText = "Desconectado com sucesso.";
            break;
        }
        default:
            result.responseText = `Comando '${command}' não reconhecido.`;
    }
    return result;
}

async function adminGetFullData() {
    const groups = (cachedData.webGroups || []).filter(g => g.id !== 'plus');
    const respawns = cachedData.respawns || {};
    const respawnGroups = await loadJsonFile(DATA_FILES.respawnGroups, {});
    let respawnTimes = cachedData.respawnTimes || {};
    const cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    const planilhadoRespawns = await loadJsonFile(DATA_FILES.planilhadoRespawns, []);
    const planilhadoDoubleRespawns = await loadJsonFile(DATA_FILES.planilhadoDoubleRespawns, []);
    const respawnRankRestrictions = await loadJsonFile(path.join(__dirname, 'respawn_rank_restrictions.json'), {});
    const allUsersForRankCheck = await loadJsonFile(DATA_FILES.clientAccounts, {});
    const allRanksInGuild = new Set(['default']);
    Object.values(allUsersForRankCheck).forEach(userAccount => {
        (userAccount.tibiaCharacters || []).forEach(char => {
            if (char.guildRank) allRanksInGuild.add(char.guildRank);
        });
    });
    
    let timesFileWasModified = false;
    allRanksInGuild.forEach(rank => {
        if (!respawnTimes.hasOwnProperty(rank)) {
            respawnTimes[rank] = 150;
            timesFileWasModified = true;
        }
    });

    if (timesFileWasModified) {
        await saveJsonFile(DATA_FILES.respawnTimes, respawnTimes);
        await loadAndCacheData();
    }
    
    return {
        groups,
        respawns,
        respawnGroups,
        respawnTimes,
        cooldowns,
        planilhadoRespawns,
        planilhadoDoubleRespawns,
        respawnRankRestrictions 
    };
}

async function adminGetUsersForDisplay() {
    const users = await loadJsonFile(DATA_FILES.clientAccounts, {});
    const usersForDisplay = {};

    for (const email in users) {
        const account = users[email];
        const mainChar = (account.tibiaCharacters && account.tibiaCharacters.length > 0)
            ? account.tibiaCharacters[0]
            : { characterName: 'N/A', guildRank: 'N/A', groups: [] };

        usersForDisplay[email] = {
            name: account.name,
            characterName: mainChar.characterName,
            guildRank: mainChar.guildRank || 'N/A',
            groups: mainChar.groups || []
        };
    }

    return usersForDisplay;
}

async function adminCreateOrUpdateRespawn(respawnData) {
    const { code, name, region } = respawnData;
    if (!code || !name || !region) return { success: false, message: 'Código, Nome e Região são obrigatórios.' };

    const respawns = await loadJsonFile(DATA_FILES.respawns, {});
    
    for (const reg in respawns) {
        if (respawns[reg][code]) {
            delete respawns[reg][code];
        }
    }

    if (!respawns[region]) {
        respawns[region] = {};
    }
    respawns[region][code] = name;

    await saveJsonFile(DATA_FILES.respawns, respawns);
    await loadAndCacheData(); 
    return { success: true };
}

async function adminDeleteRespawn(respawnCode) {
    if (!respawnCode) return { success: false, message: 'Código do respawn não fornecido.' };

    const respawns = await loadJsonFile(DATA_FILES.respawns, {});
    let found = false;
    for (const region in respawns) {
        if (respawns[region][respawnCode]) {
            delete respawns[region][respawnCode];
            found = true;
            break;
        }
    }

    if (found) {
        await saveJsonFile(DATA_FILES.respawns, respawns);
        await loadAndCacheData(); 
        return { success: true };
    }
    return { success: false, message: 'Respawn não encontrado.' };
}

async function adminUpdateRespawnRankRestrictions({ respawnCode, restrictedRanks }) {
    const restrictionsFile = path.join(__dirname, 'respawn_rank_restrictions.json');
    const restrictions = await loadJsonFile(restrictionsFile, {});

    if (restrictedRanks && restrictedRanks.length > 0) {
        restrictions[respawnCode] = restrictedRanks;
    } else {
        delete restrictions[respawnCode];
    }

    await saveJsonFile(restrictionsFile, restrictions);
}

async function adminRemoveCooldown(userIdentifier) {
    let cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    if (cooldowns[userIdentifier]) {
        delete cooldowns[userIdentifier];
        await saveJsonFile(DATA_FILES.cooldowns, cooldowns);
        return true;
    }
    return false;
}

async function adminCreateOrUpdateGroup(groupData) {
    const groups = await loadJsonFile(DATA_FILES.webGroups, []);
    const groupName = groupData.name.trim();
    const extraTime = parseInt(groupData.extraTime, 10);
    if (!groupName || isNaN(extraTime) || extraTime < 0) return;
    const groupId = groupData.id || groupName.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '');
    const existingIndex = groups.findIndex(g => g.id === groupId);
    if (existingIndex > -1) {
        groups[existingIndex].name = groupName;
        groups[existingIndex].extraTime = extraTime;
    } else {
        groups.push({ id: groupId, name: groupName, extraTime: extraTime });
    }
    await saveJsonFile(DATA_FILES.webGroups, groups);
    await loadAndCacheData();
}

async function adminDeleteGroup(groupId) {
    let groups = await loadJsonFile(DATA_FILES.webGroups, []);
    groups = groups.filter(g => g.id !== groupId);
    await saveJsonFile(DATA_FILES.webGroups, groups);
    const users = await loadJsonFile(DATA_FILES.clientAccounts, {});
    for (const userId in users) { if (users[userId].tibiaCharacters) { users[userId].tibiaCharacters.forEach(char => { if(char.groups?.includes(groupId)) { char.groups = char.groups.filter(gId => gId !== groupId); } }); } }
    await saveJsonFile(DATA_FILES.clientAccounts, users);
    await loadAndCacheData();
}

async function adminUpdateRespawnTimes(timesData) {
    const validatedData = {};
    for (const rank in timesData) {
        const time = parseInt(timesData[rank], 10);
        if (!isNaN(time) && time >= 0) {
            validatedData[rank] = time;
        }
    }
    await saveJsonFile(DATA_FILES.respawnTimes, validatedData);
    await loadAndCacheData();
}

async function adminUpdateUserGroups({ characterName, groups }) {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let accountUpdated = false;
    for (const email in clientAccounts) {
        const account = clientAccounts[email];
        if (account?.tibiaCharacters) {
            const charIndex = account.tibiaCharacters.findIndex(c => c && c.characterName && characterName && c.characterName.toLowerCase() === characterName.toLowerCase());
            if (charIndex > -1) {
                account.tibiaCharacters[charIndex].groups = groups;
                accountUpdated = true;
                break;
            }
        }
    }
    if (accountUpdated) { await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts); }
}

async function adminUpdateRespawnGroups(respawnCode, groupIds) {
    const respawnGroups = await loadJsonFile(DATA_FILES.respawnGroups, {});
    if (groupIds && groupIds.length > 0) {
        respawnGroups[respawnCode] = groupIds;
    } else {
        delete respawnGroups[respawnCode];
    }
    await saveJsonFile(DATA_FILES.respawnGroups, respawnGroups);
}

async function adminPauseRespawn(respawnCode, isPaused) {
    const fila = await loadJsonFile(DATA_FILES.respawnQueue, {});
    const key = Object.keys(fila).find(k => k.toLowerCase() === respawnCode.toLowerCase());
    if (!key) return; 

    const respawn = fila[key];
    const characterName = respawn.current?.clientNickname || 'N/A';
    const now = Date.now();

    if (isPaused) {
        if (respawn.paused) return; 
        respawn.paused = true;
        respawn.pausedAt = now; 

        if (respawn.waitingForAccept) {
            const acceptanceDeadline = new Date(respawn.startTime).getTime() + (respawn.acceptanceTime * 60 * 1000);
            const remainingMs = acceptanceDeadline - now;
            respawn.remainingAcceptanceTimeOnPause = remainingMs > 0 ? remainingMs : 0;
            await logActivity(key, characterName, `PAUSADO (ACEITE)`);
        } else if (respawn.endTime) {
            const remainingMs = new Date(respawn.endTime).getTime() - now;
            respawn.remainingTimeOnPause = remainingMs > 0 ? remainingMs : 0;
            await logActivity(key, characterName, `PAUSOU`);
        }
    } else { 
        if (!respawn.paused) return;
        respawn.paused = false;
        delete respawn.pausedAt; 

        if (respawn.hasOwnProperty('remainingAcceptanceTimeOnPause')) {
            const newStartTime = new Date(now + respawn.remainingAcceptanceTimeOnPause - (respawn.acceptanceTime * 60 * 1000));
            respawn.startTime = newStartTime.toISOString();
            delete respawn.remainingAcceptanceTimeOnPause;
            await logActivity(key, characterName, `DESPAUSADO (ACEITE)`);
        } else if (respawn.hasOwnProperty('remainingTimeOnPause')) {
            const newEndTime = now + (respawn.remainingTimeOnPause || 0);
            respawn.endTime = new Date(newEndTime).toISOString();
            delete respawn.remainingTimeOnPause;
            await logActivity(key, characterName, `DESPAUSOU`);
        }
    }
    await saveJsonFile(DATA_FILES.respawnQueue, fila);
}

async function adminPauseAll(isPaused) {
    const fila = await loadJsonFile(DATA_FILES.respawnQueue, {});
    const now = Date.now();
    for (const key in fila) {
        const respawn = fila[key];
        if (!respawn.current || respawn.waitingForAccept) continue;

        if (isPaused) {
            if (respawn.paused) continue;
            respawn.paused = true;
            respawn.pausedAt = now;
            const remainingMs = new Date(respawn.endTime).getTime() - now;
            respawn.remainingTimeOnPause = remainingMs > 0 ? remainingMs : 0;
        } else {
            if (!respawn.paused) continue;
            respawn.paused = false;
            delete respawn.pausedAt; 
            const newEndTime = now + (respawn.remainingTimeOnPause || 0);
            respawn.endTime = new Date(newEndTime).toISOString();
            delete respawn.remainingTimeOnPause;
        }
    }
    await saveJsonFile(DATA_FILES.respawnQueue, fila);
    await logActivity("TODOS", "Líder", isPaused ? `PAUSOU TODOS` : `DESPAUSOU TODOS`);
}

async function adminGetRespawnLog(respawnCode) {
    let respawnDisplayName = respawnCode.toUpperCase();
    const respawns = cachedData.respawns || {};

    for (const region in respawns) {
        if (respawns[region][respawnCode.toUpperCase()]) {
            respawnDisplayName = respawns[region][respawnCode.toUpperCase()];
            break;
        }
    }

    const allEntries = await loadNdjsonFile(DATA_FILES.logRespawn);
    const filteredEntries = allEntries
        .filter(entry => entry.respawnCode && entry.respawnCode.toLowerCase() === respawnCode.toLowerCase())
        .reverse()
        .slice(0, 100);
        
    return { title: `Log para Respawn: ${respawnDisplayName}`, entries: filteredEntries };
}

async function adminGetCharacterLog(characterName) {
    const allEntries = await loadNdjsonFile(DATA_FILES.logCharacter);
    const filteredEntries = allEntries
        .filter(entry => entry.characterName && entry.characterName.toLowerCase() === characterName.toLowerCase())
        .reverse()
        .slice(0, 100);
    return { title: `Log para Personagem: ${characterName}`, entries: filteredEntries };
}

async function adminKickUser({ respawnCode, userToKick, adminName }) {
    const fila = await loadJsonFile(DATA_FILES.respawnQueue, {});
    const key = Object.keys(fila).find(k => k.toLowerCase() === respawnCode.toLowerCase());
    if (!key) return;
    const respawn = fila[key];

    if (respawn.current?.clientNickname === userToKick) {
        if (respawn.current.isPlanilhado) {
            await logActivity(key, userToKick, `Grupo Planilhado removido por ${adminName}`);
            delete fila[key]; 
        } else {
            await logActivity(key, userToKick, `Removido por ${adminName}`);
            if (respawn.queue.length > 0) {
                const nextUser = respawn.queue.shift();
                respawn.current = nextUser;
                respawn.time = nextUser.allocatedTime;
                respawn.waitingForAccept = true;
                respawn.acceptanceTime = 10;
                respawn.startTime = new Date().toISOString();
                respawn.endTime = null;
                await logActivity(key, nextUser.clientNickname, `Assumiu (kick)`);
            } else {
                delete fila[key];
            }
        }
    } else {
        const originalLength = respawn.queue.length;
        respawn.queue = respawn.queue.filter(u => u.clientNickname !== userToKick);
        if (respawn.queue.length < originalLength) {
            await logActivity(key, userToKick, `Removido da fila por ${adminName}`);
        }
    }
    await saveJsonFile(DATA_FILES.respawnQueue, fila);
}

async function processExpiredRespawns(onlinePlayers) {
    const fila = await loadJsonFile(DATA_FILES.respawnQueue, {});
    const cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    let hasChanges = false; 
    const notifications = [];
    const now = Date.now();
    const PAUSE_TIME_LIMIT = 15 * 60 * 1000; // 15 minutos em milissegundos

    if (!onlinePlayers) {
        console.error("[processExpiredRespawns] Lista de jogadores online não recebida.");
        return { hasChanges: false, notifications: [] };
    }

    for (const key in fila) {
        const respawn = fila[key];
        
        // Lógica de despausa automática para qualquer respawn pausado
        if (respawn.paused && respawn.pausedAt) {
            if (now - respawn.pausedAt > PAUSE_TIME_LIMIT) {
                respawn.paused = false;
                delete respawn.pausedAt;
                
                // Restaura o tempo
                if (respawn.hasOwnProperty('remainingAcceptanceTimeOnPause')) {
                    const newStartTime = new Date(now + respawn.remainingAcceptanceTimeOnPause - (respawn.acceptanceTime * 60 * 1000));
                    respawn.startTime = newStartTime.toISOString();
                    delete respawn.remainingAcceptanceTimeOnPause;
                    respawn.waitingForAccept = true;
                    respawn.acceptanceTime = 10;
                } else if (respawn.hasOwnProperty('remainingTimeOnPause')) {
                    const newEndTime = now + (respawn.remainingTimeOnPause || 0);
                    respawn.endTime = new Date(newEndTime).toISOString();
                    delete respawn.remainingTimeOnPause;
                    respawn.waitingForAccept = false;
                    respawn.time = respawn.current.allocatedTime;
                }
                
                hasChanges = true;
                await logActivity(key, respawn.current?.clientNickname || 'N/A', `Despausado automaticamente`);
            }
        }

        if (!respawn || respawn.paused) continue; 

        let needsUpdate = false;

        if (respawn.current && !respawn.waitingForAccept) {
            let userIsOnline = false;
            let characterToCheckForInactivity = respawn.current.clientNickname;

            if (respawn.current.isPlanilhado && respawn.current.groupMembers) {
                userIsOnline = respawn.current.groupMembers.some(member => onlinePlayers.has(member.name));
                characterToCheckForInactivity = respawn.current.groupLeader;
            } else if (respawn.current.isMakerHunt && respawn.current.makerName) {
                userIsOnline = onlinePlayers.has(respawn.current.makerName);
                characterToCheckForInactivity = respawn.current.makerName;
            } else {
                userIsOnline = onlinePlayers.has(respawn.current.clientNickname);
            }

            const offlineTimeLimit = (respawn.current.acceptedOffline ? 16 : 15) * 60 * 1000;
            if (!userIsOnline) {
                if (!respawn.current.offlineSince) {
                    respawn.current.offlineSince = now;
                    hasChanges = true;
                } else if (now - respawn.current.offlineSince > offlineTimeLimit) {
                    const reason = respawn.current.isPlanilhado ? `inatividade do grupo planilhado (${characterToCheckForInactivity})` : (respawn.current.isMakerHunt ? `inatividade do maker (${characterToCheckForInactivity})` : 'inatividade');
                    await logActivity(key, respawn.current.clientNickname, `Removido por ${reason}`);
                    notifications.push({ recipientEmail: respawn.current.clientUniqueIdentifier, type: 'private_message', message: `❌ Você foi removido do respawn ${key.toUpperCase()} por inatividade.` });
                    needsUpdate = true;
                }
            } else {
                if (respawn.current.offlineSince) {
                    delete respawn.current.offlineSince;
                    delete respawn.current.acceptedOffline; 
                    hasChanges = true;
                }
            }
        }
        
        if (respawn.waitingForAccept) {
            const acceptanceDeadline = new Date(respawn.startTime).getTime() + (respawn.acceptanceTime * 60 * 1000);
            if (now > acceptanceDeadline) { 
                await logActivity(key, respawn.current.clientNickname, `Não aceitou`);
                notifications.push({ recipientEmail: respawn.current.clientUniqueIdentifier, type: 'private_message', message: `❌ Você não aceitou o respawn ${key.toUpperCase()} a tempo e foi removido.` });
                needsUpdate = true; 
            } else {
                const minutesRemaining = Math.ceil((acceptanceDeadline - now) / (60 * 1000));
                if (respawn.lastReminderSentAtMinute === undefined) {
                    respawn.lastReminderSentAtMinute = -1;
                }

                if (minutesRemaining > 0 && minutesRemaining < respawn.acceptanceTime && minutesRemaining !== respawn.lastReminderSentAtMinute) {
                    notifications.push({
                         recipientEmail: respawn.current.clientUniqueIdentifier, 
                        type: 'warning',
                        message: `🔔 Lembrete! Você tem ${minutesRemaining} minuto(s) para aceitar o respawn ${key.toUpperCase()}. Use o comando '!aceitar'.` 
                    });
                    respawn.lastReminderSentAtMinute = minutesRemaining; 
                    hasChanges = true; 
                }
            }
        } 
        else if (respawn.endTime && now > new Date(respawn.endTime).getTime()) {
            if (respawn.current) {
                await logActivity(key, respawn.current.clientNickname, `Tempo finalizado`);
                notifications.push({ recipientEmail: respawn.current.clientUniqueIdentifier, type: 'private_message', message: `Seu tempo no respawn ${key.toUpperCase()} acabou!` });
                if (!respawn.current.isPlanilhado) {
                    cooldowns[respawn.current.clientUniqueIdentifier] = Date.now() + 10 * 60 * 1000;
                }
            }
            needsUpdate = true;
        }

        if (needsUpdate) {
            hasChanges = true;
            if (respawn.queue.length > 0) {
                const nextUser = respawn.queue.shift();
                respawn.current = nextUser; 
                respawn.time = nextUser.allocatedTime; 
                respawn.waitingForAccept = true; 
                respawn.acceptanceTime = 10; 
                respawn.startTime = new Date().toISOString(); 
                respawn.endTime = null;
                delete respawn.lastReminderSentAtMinute; 
                
                await logActivity(key, nextUser.clientNickname, `Assumiu (fila)`); 
                notifications.push({ 
                    recipientEmail: nextUser.clientUniqueIdentifier, 
                    type: 'private_message', 
                    message: `Sua vez chegou no respawn ${key.toUpperCase()}! Use o comando '!aceitar' em até 10 minutos.` 
                }); 
            } else {
                delete fila[key];
            }
        }
    }

    if (hasChanges) {
        await saveJsonFile(DATA_FILES.respawnQueue, fila);
        await saveJsonFile(DATA_FILES.cooldowns, cooldowns); 
    }

    return { hasChanges, notifications };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function getGuildMembers(guildName) {
    if (!guildName) return [];
    const encodedName = encodeURIComponent(guildName);
    const url = `https://api.tibiadata.com/v4/guild/${encodedName}`;
    try {
        const response = await fetch(url);
        if (!response.ok) { console.error(`[SYNC] API retornou status ${response.status} para a guilda '${guildName}'`); return []; }
        const data = await response.json();
        return data.guild?.members || [];
    } catch (error) {
        console.error(`[SYNC] Erro de conexão ao buscar guilda '${guildName}':`, error.message);
        return [];
    }
}

async function getRelationsData() {
    const defaultData = {
        world: moduleWorldName,
        source_allies: [],
        source_enemies: [],
        source_hunteds: [],
        players_allies: [],
        players_enemies: [],
        players_hunteds: [],
        last_sync: null
    };
    return await loadJsonFile(DATA_FILES.relations, defaultData);
}

async function loadNdjsonFile(filePath) {
    try {
        if (!fsSync.existsSync(filePath)) {
            return [];
        }
        const data = await fs.readFile(filePath, 'utf8');
        if (data.trim() === '') {
            return [];
        }
        const lines = data.trim().split('\n');
        return lines.map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }).filter(Boolean);
    } catch (error) {
        console.error(`Erro ao carregar o arquivo de log ${filePath}:`, error);
        return [];
    }
}

async function adminAddRelation({ type, name, reason }) {
    const relations = await getRelationsData();
    const listKey = type;
    const list = relations[listKey];
    let newData = null;
    if (type === 'source_hunteds') {
        if (list && !list.some(item => item.name.toLowerCase() === name.toLowerCase())) {
            newData = { name, reason };
            list.push(newData);
            await saveJsonFile(DATA_FILES.relations, relations);
        }
    } else {
        if (list && !list.some(item => item.toLowerCase() === name.toLowerCase())) {
            newData = { name };
            list.push(name);
            await saveJsonFile(DATA_FILES.relations, relations);
        }
    }
    return { updatedData: relations, newData };
}

async function adminRemoveRelation({ type, name }) {
    const relations = await getRelationsData();
    const listKey = type;
    if (relations[listKey]) {
        const initialLength = relations[listKey].length;
        if(type === 'source_hunteds') {
            relations[listKey] = relations[listKey].filter(item => item.name.toLowerCase() !== name.toLowerCase());
        } else {
            relations[listKey] = relations[listKey].filter(item => item.toLowerCase() !== name.toLowerCase());
        }
        if (relations[listKey].length < initialLength) {
            await saveJsonFile(DATA_FILES.relations, relations);
            return relations;
        }
    }
    return relations;
}

async function syncAllRelations() {
    const relations = await getRelationsData(); 
    let newPlayersAllies = [], newPlayersEnemies = [], newPlayersHunteds = []; 
    const processedNames = new Set(); 
    
    for (const guildName of relations.source_allies) {
        const members = await getGuildMembers(guildName); 
        for (const member of members) { if (!processedNames.has(member.name.toLowerCase())) { newPlayersAllies.push({ name: member.name, level: member.level, vocation: member.vocation }); processedNames.add(member.name.toLowerCase());  } }
        await sleep(500); 
    }
    
    processedNames.clear(); 
    
    for (const guildName of relations.source_enemies) {
        const members = await getGuildMembers(guildName); 
        for (const member of members) { if (!processedNames.has(member.name.toLowerCase())) { newPlayersEnemies.push({ name: member.name, level: member.level, vocation: member.vocation }); processedNames.add(member.name.toLowerCase());  } }
        await sleep(500); 
    }
    
    for (const hunted of relations.source_hunteds) {
        const charInfo = await getTibiaCharacterInfo(hunted.name); 
        if (charInfo) {
            const huntedData = { name: charInfo.name, level: charInfo.level, vocation: charInfo.vocation, reason: hunted.reason };
            newPlayersHunteds.push(huntedData); 
        }
        await sleep(500); 
    }
    
    relations.players_allies = newPlayersAllies; 
    relations.players_enemies = newPlayersEnemies; 
    relations.players_hunteds = newPlayersHunteds; 
    relations.last_sync = new Date().toISOString(); 
    await saveJsonFile(DATA_FILES.relations, relations); 
    return relations; 
}

async function adminGetAllUsersForPlusManagement() {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    const usersList = Object.entries(clientAccounts).map(([email, account]) => {
        const mainChar = (account.tibiaCharacters && account.tibiaCharacters.length > 0) ? account.tibiaCharacters[0] : { characterName: 'N/A', plusExpiresAt: null };
        return { email: email, name: account.name, characterName: mainChar.characterName, plusExpiresAt: mainChar.plusExpiresAt || null };
    });
    return usersList.sort((a, b) => a.name.localeCompare(b.name));
}

async function adminAddPlusTime({ identifier, durationInDays }) {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let targetAccount = null;
    let targetUserEmail = null;
    if (clientAccounts[identifier]) {
        targetAccount = clientAccounts[identifier];
        targetUserEmail = identifier;
    } else {
        const lowerCaseIdentifier = identifier.toLowerCase();
        for (const email in clientAccounts) {
            const account = clientAccounts[email];
            const mainChar = account.tibiaCharacters?.[0];
            if (mainChar && mainChar.characterName.toLowerCase() === lowerCaseIdentifier) {
                targetAccount = account;
                targetUserEmail = email;
                break;
            }
        }
    }
    if (targetAccount && targetAccount.tibiaCharacters && targetAccount.tibiaCharacters.length > 0) {
        const char = targetAccount.tibiaCharacters[0];
        if (durationInDays === 0) {
            char.plusExpiresAt = null;
        } else {
            const now = new Date();
            let currentExpiration = char.plusExpiresAt ? new Date(char.plusExpiresAt) : now;
            if (currentExpiration < now) {
                currentExpiration = now;
            }
            currentExpiration.setDate(currentExpiration.getDate() + durationInDays);
            char.plusExpiresAt = currentExpiration.toISOString();
        }
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
        return { success: true, email: targetUserEmail };
    }
    return { success: false, message: "Usuário não encontrado." };
}

// /**
//  * Baixa uma imagem de uma URL e a salva localmente.
//  * @param {string} url A URL da imagem a ser baixada.
//  * @param {string} filepath O caminho local onde a imagem será salva.
//  */
// async function downloadImage(url, filepath) {
//     try {
//         const response = await fetch(url);
//         if (!response.ok) {
//             console.error(`[IMG SYNC] Falha ao baixar imagem: ${url}. Status: ${response.statusText}`);
//             return;
//         }
//         const buffer = await response.buffer();
//         await fs.writeFile(filepath, buffer);
//         console.log(`[IMG SYNC] Imagem baixada: ${path.basename(filepath)}`);
//     } catch (error) {
//         console.error(`[IMG SYNC] Erro ao baixar ${url}:`, error);
//     }
// }

async function processExpiredPlusMembers() {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let changesMade = false;
    const now = new Date();
    for (const email in clientAccounts) {
        const account = clientAccounts[email];
        if (account.tibiaCharacters && account.tibiaCharacters.length > 0) {
            const char = account.tibiaCharacters[0];
            if (char.plusExpiresAt && new Date(char.plusExpiresAt) < now) {
                char.plusExpiresAt = null;
                changesMade = true;
            }
        }
    }
    if (changesMade) {
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
    }
    return { hasChanges: changesMade };
}

async function verifyUserGuildStatus(user) {
    if (!user || !user.account) return;
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
    const account = clientAccounts[user.account.email];
    if (!account || !account.tibiaCharacters) return;

    let changesMade = false;
    for (const char of account.tibiaCharacters) {
        // Tenta buscar dados. Se a API falhar, retorna NULL.
        const charInfoFromApi = await getTibiaCharacterInfo(char.characterName);

        if (charInfoFromApi) {
            // --- SUCESSO NA API DO PERSONAGEM ---
            
            // 1. Atualizar Guild Rank
            // A função checkTibiaCharacterInGuild também precisa ser robusta (veja a correção abaixo)
            const guildMember = await checkTibiaCharacterInGuild(charInfoFromApi.name);

            if (guildMember === null) {
                // API da Guilda falhou: NÃO FAZ NADA. Mantém o rank antigo.
                console.warn(`[SYNC LOGIN] Falha na API de guilda para ${char.characterName}. Mantendo dados antigos.`);
            } else if (guildMember) {
                // Jogador ESTÁ na guilda
                if (char.guildRank !== guildMember.rank) {
                    char.guildRank = guildMember.rank;
                    changesMade = true;
                }
            } else {
                // Jogador NÃO ESTÁ na guilda (retornou false, não null)
                // Só altera se ele tinha algum rank antes, para evitar spam de log
                if (char.guildRank && char.guildRank !== 'Left Guild' && char.guildRank !== 'Not Found' && char.guildRank !== 'N/A') {
                    char.guildRank = 'Left Guild';
                    changesMade = true;
                }
            }

            // 2. Atualizar Level
            if (char.level !== charInfoFromApi.level) {
                char.level = charInfoFromApi.level;
                changesMade = true;
            }
            // 3. Atualizar Vocação
            if (char.vocation !== charInfoFromApi.vocation) {
                char.vocation = charInfoFromApi.vocation;
                changesMade = true;
            }

        } else {
            // --- FALHA NA API DO PERSONAGEM ---
            // O código antigo marcava 'Not Found' aqui.
            // A CORREÇÃO é: Não fazer nada. Se a API caiu, mantemos o último status conhecido.
            console.warn(`[SYNC LOGIN] Não foi possível buscar dados de ${char.characterName} (API instável?). Mantendo dados antigos.`);
            
            // Se quiser marcar 'Not Found' apenas se tiver certeza absoluta (ex: 404), 
            // precisaria alterar o getTibiaCharacterInfo para retornar status. 
            // Por segurança, removemos a linha que seta 'Not Found' indiscriminadamente.
        }
    }

    if (changesMade) {
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
        // Atualiza a sessão atual em memória
        user.account = account;
        user.character = account.tibiaCharacters.find(c => c.characterName === user.character.characterName) || account.tibiaCharacters[0];
    }
}


async function getPlanilhadoData(type = 'normal') {
    const respawnsFile = type === 'double' ? DATA_FILES.planilhadoDoubleRespawns : DATA_FILES.planilhadoRespawns;
    const scheduleFile = type === 'double' ? DATA_FILES.planilhadoDoubleSchedule : DATA_FILES.planilhadoSchedule;
    const planilhadoRespawnCodes = await loadJsonFile(respawnsFile, []);
    const allAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    const allGroups = await loadJsonFile(DATA_FILES.planilhadoGroups, []);
    const schedule = await loadJsonFile(scheduleFile, {});
    const allRespawns = cachedData.respawns || {};

    const charDetailsMap = new Map();
    for (const account of Object.values(allAccounts)) {
        if (account.tibiaCharacters) {
            for (const char of account.tibiaCharacters) {
                if (char.characterName) {
                    charDetailsMap.set(char.characterName.toLowerCase(), {
                        name: char.characterName,
                        level: char.level || 'N/A',
                        vocation: char.vocation || 'N/A',
                        guildRank: char.guildRank || 'N/A'
                    });
                }
            }
        }
    }

    const enrichedGroups = allGroups.map(group => {
        const enrichedMembers = group.members.map(memberName => {
            const details = charDetailsMap.get(memberName.toLowerCase());
            return details ? { ...details } : { name: memberName, level: 'N/A', vocation: 'N/A', guildRank: 'N/A' };
        });
        return { ...group, members: enrichedMembers };
    });

    const allRespawnNames = {};
    for (const region in allRespawns) {
        for (const code in allRespawns[region]) {
            allRespawnNames[code.toUpperCase()] = allRespawns[region][code];
        }
    }

    const respawns = planilhadoRespawnCodes.map(code => ({
        code: code,
        name: allRespawnNames[code.toUpperCase()] || code
    })).sort((a, b) => a.name.localeCompare(b.name));
    
    return { respawns, groups: enrichedGroups, schedule };
}

async function createOrUpdatePlanilhadoGroup(leaderName, memberNames) {
    if (!leaderName) return { success: false, message: 'Líder do grupo é inválido.' };
    if (memberNames.length > 4) return { success: false, message: 'Um grupo pode ter no máximo 4 membros além do líder.' };

    const allClientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {}); // Carrega todas as contas
    const allRegisteredCharacters = new Set();
    for (const email in allClientAccounts) {
        if (allClientAccounts[email].tibiaCharacters) {
            allClientAccounts[email].tibiaCharacters.forEach(char => {
                if (char.characterName) {
                    allRegisteredCharacters.add(char.characterName.toLowerCase());
                }
            });
        }
    }

    // Verifica se o líder está cadastrado
    if (!allRegisteredCharacters.has(leaderName.toLowerCase())) {
        return { success: false, message: `O líder ${leaderName} não está cadastrado no sistema.` };
    }

    // Verifica se todos os membros estão cadastrados
    for (const member of memberNames) {
        if (member && !allRegisteredCharacters.has(member.toLowerCase())) {
            return { success: false, message: `O membro "${member}" não está cadastrado no sistema e não pode ser adicionado ao grupo.` };
        }
    }

    const allGroups = await loadJsonFile(DATA_FILES.planilhadoGroups, []);
    const existingGroupIndex = allGroups.findIndex(g => g.leader.toLowerCase() === leaderName.toLowerCase());
    
    // Filtra membros vazios e duplicados e garante que o líder esteja no início
    const finalMembers = [leaderName, ...memberNames.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i && v.toLowerCase() !== leaderName.toLowerCase())];

    if (existingGroupIndex > -1) {
        allGroups[existingGroupIndex].members = finalMembers;
    } else {
        allGroups.push({ leader: leaderName, members: finalMembers });
    }

    await saveJsonFile(DATA_FILES.planilhadoGroups, allGroups);
    return { success: true, message: 'Grupo de planilhado atualizado com sucesso.' };
}

async function assignToPlanilha({ type = 'normal', respawnCode, groupLeader, startTime, duration, observation }) { // 1. Adicionado 'observation' aqui
    if (!startTime || typeof startTime.split !== 'function' || !duration) {
        return { success: false, message: 'Dados inválidos para o agendamento.' };
    }

    const scheduleFile = type === 'double' ? DATA_FILES.planilhadoDoubleSchedule : DATA_FILES.planilhadoSchedule;
    const schedule = await loadJsonFile(scheduleFile, {});
    if (!schedule[respawnCode]) {
        schedule[respawnCode] = {};
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const totalMinutes = duration * 60;
    const slotsToFill = totalMinutes / 30;

    let currentHour = startHour;
    let currentMinute = startMinute;
    const timeSlots = [];
    for (let i = 0; i < slotsToFill; i++) {
        timeSlots.push(`${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);
        currentMinute += 30;
        if (currentMinute >= 60) {
            currentMinute = 0;
            currentHour = (currentHour + 1) % 24;
        }
    }

    for (const slot of timeSlots) {
        if (schedule[respawnCode][slot] && schedule[respawnCode][slot].leader !== groupLeader) {
            return { success: false, message: `Conflito de horário! O slot ${slot} já está ocupado por ${schedule[respawnCode][slot].leader}.` };
        }
    }
    
    for (const slot of timeSlots) {
        // 2. Criamos o objeto base do agendamento
        const assignmentData = {
            leader: groupLeader,
            isAbsence: false,
            isDouble: false
        };

        // 3. Adicionamos a observação APENAS se o tipo for 'normal' e a observação não for vazia
        if (type === 'normal' && observation) {
            assignmentData.observation = observation;
        }

        schedule[respawnCode][slot] = assignmentData;
    }

    await saveJsonFile(scheduleFile, schedule);
    return { success: true };
}

async function removeFromPlanilha({ type = 'normal', respawnCode, groupLeader }) {
    const scheduleFile = type === 'double' ? DATA_FILES.planilhadoDoubleSchedule : DATA_FILES.planilhadoSchedule;
    const schedule = await loadJsonFile(scheduleFile, {});
    let itemsRemoved = false;

    if (schedule[respawnCode]) {
        for (const timeSlot in schedule[respawnCode]) {
            const assignment = schedule[respawnCode][timeSlot];
            
            if (assignment && typeof assignment === 'object' && assignment.leader === groupLeader) {
                delete schedule[respawnCode][timeSlot];
                itemsRemoved = true;
            }
        }
    }

    if (itemsRemoved) {
        await saveJsonFile(scheduleFile, schedule);
        return { success: true };
    }
    
    // Retorna 'false' se nada foi removido, para um feedback mais preciso.
    return { success: false, message: 'Nenhum agendamento encontrado para este líder neste respawn.' };
}

async function adminUpdatePlanilhadoRespawns({ normal, double }) {
    if (Array.isArray(normal)) {
        await saveJsonFile(DATA_FILES.planilhadoRespawns, normal);
    }
    if (Array.isArray(double)) {
        await saveJsonFile(DATA_FILES.planilhadoDoubleRespawns, double);
    }
    return { success: true };
}

/**
 * Extrai o nome base de um boss (ex: "Midnight Panther (Sul)" -> "Midnight Panther").
 * @param {string} locationSpecificName O nome completo do boss.
 * @returns {string} O nome base do boss.
 */
function parseBaseBossName(locationSpecificName) {
    if (!locationSpecificName) return '';
    // Tenta encontrar o último " (" que indica uma localização
    const match = locationSpecificName.match(/^(.*?)\s\(/);
    // Se encontrar, retorna a parte antes do parêntese (o nome base)
    // Se não encontrar, retorna o nome original (é um boss sem localização)
    return match ? match[1].trim() : locationSpecificName;
}


// Substitua a função getBossesData [referência: source 1810] pela seguinte:
async function getBossesData() {
    const bossData = await loadJsonFile(DATA_FILES.bossData, { killedYesterday: [], bossList: [] });
    const bossChecks = await loadJsonFile(DATA_FILES.bossChecks, {});
    const checkHistory = await loadJsonFile(DATA_FILES.bossCheckHistory, {});
    const foundHistory = await loadJsonFile(DATA_FILES.bossFoundHistory, {});
    const foundToday = await loadJsonFile(DATA_FILES.bossFoundToday, {});
    const bossLocations = await loadJsonFile(DATA_FILES.bossLocations, {}); // Carrega o novo arquivo

    const now = new Date();
    now.setHours(now.getHours() - 5);
    const gameDayString = now.toISOString().split('T')[0];

    const mergedBossList = []; // Lista final

    // Processa a lista de bosses vinda do tibia-statistic
    for (const boss of (bossData.bossList || [])) {
        const locations = bossLocations[boss.name];

        if (locations && locations.length > 0) {
            // CASO 1: Boss com MÚLTIPLOS locais (ex: Midnight Panther)
            for (const loc of locations) {
                const locationSpecificName = `${boss.name} (${loc.spotName})`;
                
                const foundRecord = foundToday[locationSpecificName];
                let isFoundToday = false;
                let foundBy = null;
                let foundAt = null;

                if (foundRecord && foundRecord.timestamp) {
                    const foundDate = new Date(foundRecord.timestamp);
                    foundDate.setHours(foundDate.getHours() - 5);
                    const foundGameDayString = foundDate.toISOString().split('T')[0];

                    if (foundGameDayString === gameDayString) {
                        isFoundToday = true;
                        foundBy = foundRecord.finder;
                        foundAt = foundRecord.timestamp;
                    }
                }

                // Cria uma entrada "clone" para este local específico
                mergedBossList.push({
                    ...boss, // Copia dados base (chance, pct, lastSeen, etc.)
                    name: locationSpecificName, // Define o nome completo
                    baseName: boss.name, // Armazena o nome base
                    wikiLink: loc.wikiLink, // Usa o link do local
                    lastCheck: bossChecks[locationSpecificName] || null, // Check é por local
                    isFoundToday: isFoundToday, // "Found" é por local (mas será sincronizado)
                    foundBy: foundBy,
                    foundAt: foundAt
                });
            }
        } else {
            // CASO 2: Boss normal (sem locais definidos no JSON)
            const foundRecord = foundToday[boss.name];
            let isFoundToday = false;
            let foundBy = null;
            let foundAt = null;

            if (foundRecord && foundRecord.timestamp) {
                const foundDate = new Date(foundRecord.timestamp);
                foundDate.setHours(foundDate.getHours() - 5);
                const foundGameDayString = foundDate.toISOString().split('T')[0];

                if (foundGameDayString === gameDayString) {
                    isFoundToday = true;
                    foundBy = foundRecord.finder;
                    foundAt = foundRecord.timestamp;
                }
            }

            mergedBossList.push({
                ...boss,
                baseName: boss.name, // O nome base é ele mesmo
                wikiLink: createWikiLink(boss.name), // Usa o link padrão
                lastCheck: bossChecks[boss.name] || null,
                isFoundToday: isFoundToday,
                foundBy: foundBy,
                foundAt: foundAt
            });
        }
    }

    // 1. Ranking de Checks (não precisa de alteração, pois o history já tem os nomes corretos)
    const checkCounts = {};
    for (const boss in checkHistory) {
        for (const check of checkHistory[boss]) {
            checkCounts[check.checker] = (checkCounts[check.checker] || 0) + 1;
        }
    }
    const checkRanking = Object.entries(checkCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // 2. Ranking de Bosses Encontrados (não precisa de alteração)
    const foundCounts = {};
    for (const boss in foundHistory) {
        for (const found of foundHistory[boss]) {
            foundCounts[found.finder] = (foundCounts[found.finder] || 0) + 1;
        }
    }
    const foundRanking = Object.entries(foundCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    return {
        lastUpdated: bossData.lastUpdated,
        killedYesterday: bossData.killedYesterday || [],
        bossList: mergedBossList, // Retorna a nova lista "explodida"
        checkRanking: checkRanking,
        foundRanking: foundRanking
    };
}

async function recordBossFound({ bossName, characterName, deathTime, tokens, observation }) {
    const timestamp = new Date().toISOString();
    const foundData = {
        finder: characterName,
        timestamp,
        deathTime,
        tokens,
        observation
    };

    const bossLocations = await loadJsonFile(DATA_FILES.bossLocations, {});
    
    // 1. Descobrir o nome base do boss
    const baseName = parseBaseBossName(bossName); // Usa a nova helper
    
    const bossesToMarkAsFound = [];

    // 2. Verificar se o nome base está no
    if (bossLocations[baseName]) {
        // Se sim, pegar todos os seus locais
        for (const loc of bossLocations[baseName]) {
            bossesToMarkAsFound.push(`${baseName} (${loc.spotName})`);
        }
    } else {
        // Se não, é um boss normal, marcar apenas ele
        bossesToMarkAsFound.push(bossName);
    }

    // 3. Carregar os arquivos de histórico e "found today"
    const history = await loadJsonFile(DATA_FILES.bossFoundHistory, {});
    const foundToday = await loadJsonFile(DATA_FILES.bossFoundToday, {});

    // 4. Iterar sobre a lista de bosses a marcar (pode ser 1 ou vários)
    for (const nameToMark of bossesToMarkAsFound) {
        // Adiciona ao histórico geral
        if (!history[nameToMark]) {
            history[nameToMark] = [];
        }
        history[nameToMark].unshift(foundData);
        if (history[nameToMark].length > 50) { // Limita o histórico
            history[nameToMark] = history[nameToMark].slice(0, 50);
        }
        
        // Adiciona ao "found today"
        foundToday[nameToMark] = { finder: characterName, timestamp: timestamp };
    }

    // 5. Salvar os arquivos
    await saveJsonFile(DATA_FILES.bossFoundHistory, history);
    await saveJsonFile(DATA_FILES.bossFoundToday, foundToday);

    return { success: true };
}

async function recordBossCheck({ bossName, characterName }) {
    if (!bossName || !characterName) {
        return { success: false, message: "Nome do boss ou do personagem ausente." };
    }
    const timestamp = new Date().toISOString();
    const checkData = {
        checker: characterName,
        timestamp: timestamp
    };

    // 1. Atualiza o último check (comportamento atual)
    const bossChecks = await loadJsonFile(DATA_FILES.bossChecks, {});
    bossChecks[bossName] = checkData;
    await saveJsonFile(DATA_FILES.bossChecks, bossChecks);

    // 2. Adiciona ao histórico
    const history = await loadJsonFile(DATA_FILES.bossCheckHistory, {});
    if (!history[bossName]) {
        history[bossName] = [];
    }
    history[bossName].unshift(checkData); // Adiciona no início do array

    // Limita o histórico aos últimos 50 checks por boss
    if (history[bossName].length > 50) {
        history[bossName] = history[bossName].slice(0, 50);
    }
    
    await saveJsonFile(DATA_FILES.bossCheckHistory, history);

    return { success: true };
}

async function getBossHistory(bossName) {
    if (!bossName) return [];

    const checkHistory = await loadJsonFile(DATA_FILES.bossCheckHistory, {});
    const foundHistory = await loadJsonFile(DATA_FILES.bossFoundHistory, {});

    const checks = (checkHistory[bossName] || []).map(c => ({ ...c, type: 'check' }));
    const founds = (foundHistory[bossName] || []).map(f => ({ ...f, type: 'found' }));

    const combinedHistory = [...checks, ...founds];
    combinedHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return combinedHistory.slice(0, 100); // Limita o histórico combinado
}

async function getCheckerHistory(characterName) {
    if (!characterName) {
        return [];
    }
    const history = await loadJsonFile(DATA_FILES.bossCheckHistory, {});
    const checkerHistory = [];

    for (const bossName in history) {
        for (const check of history[bossName]) {
            if (check.checker.toLowerCase() === characterName.toLowerCase()) {
                checkerHistory.push({
                    bossName: bossName,
                    timestamp: check.timestamp
                });
            }
        }
    }

    // Ordena os checks do mais recente para o mais antigo
    checkerHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return checkerHistory;
}


async function getFinderHistory(characterName) {
    if (!characterName) {
        return [];
    }
    const history = await loadJsonFile(DATA_FILES.bossFoundHistory, {});
    const finderHistory = [];

    for (const bossName in history) {
        for (const found of history[bossName]) {
            if (found.finder.toLowerCase() === characterName.toLowerCase()) {
                finderHistory.push({
                    bossName: bossName,
                    ...found // Inclui todos os outros dados do evento (timestamp, tokens, etc)
                });
            }
        }
    }

    // Ordena os registros do mais recente para o mais antigo
    finderHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return finderHistory;
}

// bot_logic.js

/**
 * Sincroniza todos os usuários no clientaccount.json com a API do Tibia.
 * [MODIFICADO] Envia progresso em tempo real (sem throttling) para o socket do admin.
 * @param {object} io - A instância do Socket.IO.
 * @param {string} socketId - O ID do socket do admin que requisitou.
 */
async function adminSyncAllUsers(io, socketId) {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let changesMade = false;
    let updatedCount = 0;
    let leftCount = 0;
    let apiErrorCount = 0;
    const guildName = await getGuildName();

    const totalAccounts = Object.keys(clientAccounts).length;
    let currentAccountIndex = 0;

    const startMessage = ` Iniciando varredura de ${totalAccounts} contas para a guilda: ${guildName}...`;
    console.log(startMessage);
    if (io && socketId) {
        io.to(socketId).emit('bot:response', startMessage);
    }

    for (const email in clientAccounts) {
        currentAccountIndex++; // Incrementa por conta
        const account = clientAccounts[email];
        if (!account.tibiaCharacters || account.tibiaCharacters.length === 0) continue;

        // Itera por todos os personagens da conta
        for (const char of account.tibiaCharacters) {
            if (!char || !char.characterName) continue;

            const progressMessage = ` ${currentAccountIndex} de ${totalAccounts}... (${char.characterName})`;
            if (io && socketId) {
                 io.to(socketId).emit('bot:response', progressMessage);
            }
            console.log(progressMessage); // Mantém o log no console

            const charInfoFromApi = await getTibiaCharacterInfo(char.characterName);
            
            if (charInfoFromApi) {
                const guildMember = await checkTibiaCharacterInGuild(charInfoFromApi.name);
                
                if (guildMember) {
                    // CASO 1: Personagem está na guilda
                    if (char.guildRank !== guildMember.rank) {
                        const updateMessage = ` Rank de ${char.characterName} atualizado para: ${guildMember.rank}`;
                        if (io && socketId) io.to(socketId).emit('bot:response', updateMessage); // Envia para o chat
                        
                        char.guildRank = guildMember.rank;
                        changesMade = true;
                        updatedCount++;
                    }
                } else {
                    // CASO 2: Personagem existe, mas NÃO está na guilda
                    if (char.guildRank !== 'Left Guild' && char.guildRank !== 'Not Found') {
                        const leftMessage = ` ${char.characterName} não está mais na guilda. Marcando.`;
                        console.log(leftMessage);
                        if (io && socketId) io.to(socketId).emit('bot:response', leftMessage); // Envia para o chat

                        char.guildRank = 'Left Guild';
                        changesMade = true;
                        leftCount++;
                    }
                }
            } else {
                // CASO 3: Personagem NÃO encontrado na API
                if (char.guildRank !== 'Not Found') {
                    const notFoundMessage = ` ${char.characterName} não encontrado na API. Marcando.`;
                    console.log(notFoundMessage);
                    if (io && socketId) io.to(socketId).emit('bot:response', notFoundMessage); // Envia para o chat

                    char.guildRank = 'Not Found';
                    changesMade = true;
                    leftCount++;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 500)); 
        }
    }

    if (changesMade) {
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
    }

    const finalReport = ` Sincronia concluída. ${updatedCount} ranks atualizados. ${leftCount} membros marcados como 'Left' ou 'Not Found'.`;
    console.log(finalReport);
    
    return { 
        responseText: finalReport,
        adminDataUpdate: true 
    };
}

async function cleanupExcessTokens() {
    const accounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let changes = false;
    let removedCount = 0;

    for (const email in accounts) {
        const acc = accounts[email];
        // Se houver mais de 1 token, mantém apenas o último (o mais recente)
        if (Array.isArray(acc.sessionTokens) && acc.sessionTokens.length > 1) {
            const tokensToRemove = acc.sessionTokens.length - 1;
            // Fatia o array mantendo apenas o último elemento
            acc.sessionTokens = acc.sessionTokens.slice(-1);
            removedCount += tokensToRemove;
            changes = true;
        }
    }

    if (changes) {
        await saveJsonFile(DATA_FILES.clientAccounts, accounts);
    } else {
    }
}

// Adicionar esta função no bot_logic.js

async function adminDeleteUser(email) {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    
    if (clientAccounts[email]) {
        delete clientAccounts[email];
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
        return { success: true };
    }
    return { success: false, message: 'Usuário não encontrado.' };
}

async function adminUpdateUserData(originalEmail, newData) {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    const targetAccount = clientAccounts[originalEmail];

    if (!targetAccount) {
        return { success: false, message: 'Usuário original não encontrado.' };
    }

    const newEmail = newData.email ? newData.email.trim() : originalEmail;
    
    // Se o e-mail mudou, verifica se o novo já existe
    if (newEmail !== originalEmail && clientAccounts[newEmail]) {
        return { success: false, message: 'O novo e-mail já está em uso por outra conta.' };
    }

    // Atualiza os dados básicos
    targetAccount.name = newData.name;
    targetAccount.phone = newData.phone;

    // Se o e-mail mudou, precisamos mover os dados para a nova chave
    if (newEmail !== originalEmail) {
        clientAccounts[newEmail] = targetAccount; // Copia para a nova chave
        delete clientAccounts[originalEmail];     // Remove a chave antiga
        
        // Atualiza também os tokens de sessão se necessário (opcional, mas recomendado manter)
        // A sessão do usuário pode cair, mas é o comportamento esperado ao mudar email
    }

    await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
    return { success: true };
}


module.exports = {
    init,
    processCommand,
    processConversationReply,
    loadJsonFile,
    saveJsonFile,
    adminGetFullData, 
    adminGetUsersForDisplay, 
    adminCreateOrUpdateGroup,
    adminDeleteGroup,
    adminUpdateUserGroups,
    adminRemoveUserFromGroup, 
    adminPauseRespawn,
    adminPauseAll,
    processExpiredRespawns,
    adminUpdateRespawnGroups,
    adminGetRespawnLog,
    adminGetCharacterLog,
    adminKickUser,
    adminUpdateRespawnTimes,
    getRelationsData,
    adminAddRelation,
    adminRemoveRelation,
    syncAllRelations,
    adminGetAllUsersForPlusManagement,
    adminAddPlusTime,
    processExpiredPlusMembers,
    getUserMaxTime,
    verifyUserGuildStatus,
    adminRemoveCooldown,
    adminCreateOrUpdateRespawn,
    adminDeleteRespawn,
    getPlanilhadoData,
    createOrUpdatePlanilhadoGroup,
    assignToPlanilha,
    removeFromPlanilha,
    adminUpdatePlanilhadoRespawns,
    adminUpdateRespawnRankRestrictions,
    logUnderAttack,
    adminBatchUpdateUserGroups,
    updatePlanilhadoAssignmentStatus,
    deletePlanilhadoGroup,
    adminArchivePointsManually,
    getBossesData,
    updateLocalBossData,
    recordBossCheck,
    recordBossFound,   
    getBossHistory, 
    adminSyncAllUsers,
    getFinderHistory,
    getCheckerHistory,
    createWikiLink, 
    parseBaseBossName,
    cleanupExcessTokens,
    adminDeleteUser,
    adminUpdateUserData,
    getBossTokens,
    updateBossTokens,
};