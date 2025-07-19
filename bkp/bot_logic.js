const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');

const DATA_FILES = {
    clientAccounts: path.join(__dirname, 'clientaccount.json'),
    verificationCodes: path.join(__dirname, 'verification_codes.json'),
    guildConfig: path.join(__dirname, 'set_guild.json'),
    respawnQueue: path.join(__dirname, 'fila.json'),
    respawnTimes: path.join(__dirname, 'respawnTimes.json'),
    webGroups: path.join(__dirname, 'webgroups.json'),
    cooldowns: path.join(__dirname, 'cooldowns.json'),
    respawnGroups: path.join(__dirname, 'respawn_groups.json'),
    logRespawn: path.join(__dirname, 'logrespawn.json'),
    relations: path.join(__dirname, 'relations.json'),
    logCharacter: path.join(__dirname, 'logcharacter.json'),
    respawns: path.join(__dirname, 'respawns.json')
};

let cachedData = {};

async function loadAndCacheData() {
    console.log('[CACHE-BOT] Carregando ou atualizando dados do bot_logic em memória...');
    try {
        cachedData.respawns = await loadJsonFile(DATA_FILES.respawns, {});
        cachedData.respawnTimes = await loadJsonFile(DATA_FILES.respawnTimes, { "default": 150 });
        cachedData.webGroups = await loadJsonFile(DATA_FILES.webGroups, []);
        console.log('[CACHE-BOT] Dados do bot_logic carregados com sucesso.');
    } catch(err) {
        console.error('Falha ao carregar dados do bot_logic para o cache:', err);
    }
}

loadAndCacheData();

async function loadJsonFile(filePath, defaultData = {}) { try { if (fsSync.existsSync(filePath)) { const data = await fs.readFile(filePath, 'utf8'); return data.trim() === '' ? defaultData : JSON.parse(data); } await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2)); return defaultData; } catch (error) { console.error(`Erro ao carregar ${filePath}:`, error); return defaultData; } }
async function saveJsonFile(filePath, data) { try { await fs.writeFile(filePath, JSON.stringify(data, null, 2)); } catch (error) { console.error(`Erro ao salvar ${filePath}:`, error); } }
function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex'); return `${salt}:${hash}`; }
function verifyPassword(storedPassword, providedPassword) { if (!storedPassword || !storedPassword.includes(':')) return false; const [salt, originalHash] = storedPassword.split(':'); const hash = crypto.pbkdf2Sync(providedPassword, salt, 1000, 64, 'sha512').toString('hex'); return hash === originalHash; }
function parseCustomTime(timeString) { if (!timeString || !/^\d{1,2}:\d{2}$/.test(timeString)) return null; const parts = timeString.split(':'); return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10); }
function formatMinutesToHHMM(minutes) { if (isNaN(minutes)) return "00:00"; const h = Math.floor(minutes / 60); const m = Math.floor(minutes % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
async function getTibiaCharacterInfo(charName) { if (!charName) return null; try { const url = `https://api.tibiadata.com/v4/character/${encodeURIComponent(charName)}`; const response = await fetch(url); if (!response.ok) return null; const data = await response.json(); return data.character?.character || null; } catch (error) { console.error(`Erro ao buscar info de ${charName}:`, error); return null; } }
async function getGuildName() { const setGuild = await loadJsonFile(DATA_FILES.guildConfig, { guild: 'Vindictam' }); return setGuild.guild || 'Vindictam'; }
async function checkTibiaCharacterInGuild(charName) { const guildAliada = await getGuildName(); const url = `https://api.tibiadata.com/v4/guild/${encodeURIComponent(guildAliada)}`; try { const response = await fetch(url); if (!response.ok) return null; const data = await response.json(); if (data.guild?.members) { return data.guild.members.find(member => member.name.toLowerCase() === charName.toLowerCase()); } } catch (error) { console.error("Erro ao buscar guilda:", error); } return null; }

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

    const totalTime = baseTime + extraTime;

    return {
        total: totalTime,
        breakdown: {
            base: { name: rankName, time: baseTime },
            groups: groupBreakdown,
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
    const logRespawn = await loadJsonFile(DATA_FILES.logRespawn, {});
    const logCharacter = await loadJsonFile(DATA_FILES.logCharacter, {});
    const respawns = cachedData.respawns;
    let respawnDisplayName = respawnCode.toUpperCase();
    for (const region in respawns) { if (respawns[region][respawnCode.toUpperCase()]) { respawnDisplayName = `[${respawnCode.toUpperCase()}] ${respawns[region][respawnCode.toUpperCase()]}`; break; } }
    if (!logRespawn[respawnCode]) { logRespawn[respawnCode] = []; }
    if (!logCharacter[characterName]) { logCharacter[characterName] = []; }
    logRespawn[respawnCode].unshift({ timestamp, user: characterName, action });
    logCharacter[characterName].unshift({ timestamp, respawn: respawnDisplayName, action });
    if (logRespawn[respawnCode].length > 100) { logRespawn[respawnCode].pop(); }
    if (logCharacter[characterName].length > 100) { logCharacter[characterName].pop(); }
    await saveJsonFile(DATA_FILES.logRespawn, logRespawn);
    await saveJsonFile(DATA_FILES.logCharacter, logCharacter);
}

async function processConversationReply(reply, user) {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
    let result = { responseText: "" };
    if (!user.conversationState) { return { responseText: "Não estou aguardando uma resposta." }; }
    switch (user.conversationState) {
        case 'awaiting_reg_name': user.registrationData = { name: reply }; user.conversationState = 'awaiting_reg_email'; result.responseText = `Obrigado, ${reply}. Agora, digite seu e-mail:`; break;
        case 'awaiting_reg_email': if (clientAccounts[reply]) { result.responseText = "❌ Este e-mail já está em uso. Por favor, digite outro e-mail válido:"; } else { user.registrationData.email = reply; user.conversationState = 'awaiting_reg_phone'; result.responseText = `Ok. Agora, seu telefone (com DDD):`; } break;
        case 'awaiting_reg_phone': user.registrationData.phone = reply; user.conversationState = 'awaiting_reg_password'; result.responseText = `Perfeito. Para finalizar, crie uma senha:`; break;
        case 'awaiting_reg_password': const regData = user.registrationData; clientAccounts[regData.email] = { name: regData.name, phone: regData.phone, passwordHash: hashPassword(reply), tibiaCharacters: [], recoveryToken: null, recoveryTokenExpires: null }; await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts); result.responseText = { type: 'actionable_message', text: '✅ Conta criada com sucesso!', actions: [{ buttonText: 'Fazer Login Agora', command_to_run: '!showlogin' }] }; user.conversationState = null; user.registrationData = {}; break;
        case 'awaiting_change_char_name': { const newCharName = reply; const account = user.account; const existingChar = account.tibiaCharacters.find(c => c && c.characterName && c.characterName.toLowerCase() === newCharName.toLowerCase()); if (existingChar) { user.character = existingChar; result.responseText = `✅ Sucesso! Você agora está usando o personagem ${existingChar.characterName}.`; result.loginSuccess = true; result.loginData = { account: { name: account.name, email: account.email }, character: existingChar, token: null }; } else { const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes); const codeToUse = crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12); verificationCodes[account.email] = codeToUse; await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes); result.responseText = { type: 'actionable_message', text: `O personagem [b]${newCharName}[/b] não está registrado.\nPara registrá-lo, adicione o código [b]${codeToUse}[/b] ao comentário dele no Tibia.com e clique abaixo.`, actions: [{ buttonText: `Verificar e Registrar ${newCharName}`, command_to_run: `!confirmregister ${newCharName}` }] }; } user.conversationState = null; break; }
        case 'awaiting_char_name': { const characterNameToRegister = reply; const userIdentifier = user.account.email; const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes); const codeToUse = crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12); verificationCodes[userIdentifier] = codeToUse; await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes); result.responseText = { type: 'actionable_message', text: `Ok. Para registrar [b]${characterNameToRegister}[/b], adicione o código [b]${codeToUse}[/b] ao comentário dele no Tibia.com e clique no botão.`, actions: [{ buttonText: `Verificar e Registrar ${characterNameToRegister}`, command_to_run: `!confirmregister ${characterNameToRegister}` }] }; user.conversationState = null; break; }
        case 'awaiting_login_email': user.loginData = { email: reply }; user.conversationState = 'awaiting_login_password'; result.responseText = `Ok, agora digite a senha para ${reply}:`; break;
        case 'awaiting_login_password': { const loginEmail = user.loginData.email; const account = clientAccounts[loginEmail]; if (!account || !verifyPassword(account.passwordHash, reply)) { result.responseText = "❌ Senha inválida. Tente novamente:"; user.conversationState = 'awaiting_login_password'; } else { const sessionToken = crypto.randomBytes(32).toString('hex'); if (!account.sessionTokens) { account.sessionTokens = []; } account.sessionTokens.push(sessionToken); await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts); user.account = account; user.account.email = loginEmail; user.character = (account.tibiaCharacters && account.tibiaCharacters.length > 0) ? account.tibiaCharacters[0] : null; result.loginSuccess = true; result.loginData = { account: { name: user.account.name, email: user.account.email }, character: user.character, token: sessionToken }; if (!user.character) { result.responseText = `Login bem-sucedido! Bem-vindo, ${account.name}.\n\nNotei que você não tem nenhum personagem. Qual o nome do seu personagem principal?`; user.conversationState = 'awaiting_char_name'; } else { result.responseText = `Login bem-sucedido! Bem-vindo, ${account.name}.`; user.conversationState = null; } } if (result.loginSuccess) { user.loginData = {}; } break; }
        case 'awaiting_recovery_email': { const email = reply.toLowerCase(); if (!clientAccounts[email]) { result.responseText = "❌ E-mail não encontrado. Tente novamente ou crie uma nova conta."; user.conversationState = null; } else { user.recoveryData = { email: email }; user.conversationState = 'awaiting_recovery_name'; result.responseText = `Ok. Agora, digite o seu nome completo, como foi cadastrado:`; } break; }
        case 'awaiting_recovery_name': { const account = clientAccounts[user.recoveryData.email]; if (account.name.toLowerCase() !== reply.toLowerCase()) { result.responseText = "❌ Nome não confere com o registrado para este e-mail. Processo cancelado."; user.conversationState = null; user.recoveryData = {}; } else { user.recoveryData.name = reply; user.conversationState = 'awaiting_recovery_phone'; result.responseText = `Nome confirmado. Por favor, digite o seu telefone (com DDD):`; } break; }
        case 'awaiting_recovery_phone': { const account = clientAccounts[user.recoveryData.email]; if (account.phone !== reply) { result.responseText = "❌ Telefone não confere com o registrado. Processo cancelado."; user.conversationState = null; user.recoveryData = {}; } else { user.conversationState = 'awaiting_new_password'; result.responseText = `✅ Verificação concluída com sucesso! Por favor, crie uma nova senha:`; } break; }
        case 'awaiting_new_password': { const email = user.recoveryData.email; const account = clientAccounts[email]; account.passwordHash = hashPassword(reply); await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts); result.responseText = { type: 'actionable_message', text: '✅ Senha alterada com sucesso!', actions: [{ buttonText: 'Fazer Login Agora', command_to_run: '!showlogin' }] }; user.conversationState = null; user.recoveryData = {}; break; }
        default: result.responseText = "Ocorreu um erro na conversa. Tente novamente."; user.conversationState = null; break;
    }
    return result;
}

async function processCommand(command, args, user) {
    const filaRespawns = await loadJsonFile(DATA_FILES.respawnQueue);
    let cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    const respawnGroups = await loadJsonFile(DATA_FILES.respawnGroups, {});
    let result = { responseText: "", needsBroadcast: false, broadcastType: null, broadcastPayload: {}, adminDataUpdate: false };
    const loggedInAccount = user.account;
    const activeCharacter = user.character;
    switch (command) {
        case "help": result.responseText = `Comandos disponíveis:\n!register -> Inicia o registro de um personagem na sua conta.\n!resp [código] [tempo] -> Reserva um respawn (tempo é opcional, ex: 02:30).\n!respdel [código] -> Libera um respawn que você reservou.\n!aceitar -> Confirma a reserva de um respawn que você pegou.\n!mp [msg] -> Envia uma mensagem em massa (apenas para líderes).\n!shared [lvl] -> Calcula a faixa de XP compartilhada para um nível.\n!recover -> Inicia o processo de recuperação de conta.`;
            return result;
        case "showlogin": if (loggedInAccount) { result.responseText = `Você já está conectado como ${loggedInAccount.name}.`; return result;
        } user.conversationState = 'awaiting_login_email'; result.responseText = "Para fazer o login, por favor, digite seu e-mail:"; return result;
        case "showregistration": if (loggedInAccount) { result.responseText = `Você já está conectado como ${loggedInAccount.name}.`; return result; } user.conversationState = 'awaiting_reg_name';
            result.responseText = "Ok, vamos criar sua conta. Primeiro, qual o seu nome completo?"; return result;
        case "recover": user.conversationState = 'awaiting_recovery_email';
            result.responseText = "Ok, vamos iniciar a recuperação. Por favor, digite o e-mail da sua conta:"; return result;
        case "resetpassword": return result;
    }
    if (!loggedInAccount) { result.responseText = { type: 'actionable_message', text: "Você precisa fazer login para usar este comando.", actions: [{ buttonText: 'Fazer Login', command_to_run: '!showlogin' }] };
        return result; }
    const registration = { ...loggedInAccount, ...activeCharacter };
    const userIdentifier = loggedInAccount.email;
    if (!activeCharacter && !['register', 'confirmregister', 'startchangechar'].includes(command)) { result.responseText = { type: 'actionable_message', text: "Você precisa registrar um personagem para usar este comando.", actions: [{ buttonText: 'Registrar Personagem', command_to_run: '!startcharregister' }] };
        return result; }
    const charName = activeCharacter?.characterName;
    switch (command) {
        case "startchangechar": user.conversationState = 'awaiting_change_char_name';
            result.responseText = "Qual o nome do personagem para o qual você deseja trocar?"; break;
        case "register": { const characterName = args.join(" "); if (!characterName) { user.conversationState = 'awaiting_char_name';
            result.responseText = "Entendido. Digite o nome exato do personagem que deseja registrar:"; } else { const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes);
            const codeToUse = crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12); verificationCodes[userIdentifier] = codeToUse; await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes); result.responseText = { type: 'actionable_message', text: `Ok.
Para registrar [b]${characterName}[/b], adicione o código [b]${codeToUse}[/b] ao comentário dele no Tibia.com e clique no botão.`, actions: [{ buttonText: `Verificar e Registrar ${characterName}`, command_to_run: `!confirmregister ${characterName}` }] };
        } break; }
        case "confirmregister": { const characterNameToConfirm = args.join(" ");
            if (!characterNameToConfirm) { result.responseText = "Especifique o nome do personagem."; break; } const verificationCodes = await loadJsonFile(DATA_FILES.verificationCodes);
            const code = verificationCodes[userIdentifier]; if (!code) { result.responseText = "Nenhum código de verificação ativo. Use !register."; break;
            } const charInfo = await getTibiaCharacterInfo(characterNameToConfirm); if (!charInfo || !charInfo.comment || !charInfo.comment.includes(code)) { result.responseText = { type: 'actionable_message', text: `Código '${code}' não encontrado no comentário de '${characterNameToConfirm}'.
Aguarde 5 minutos e tente novamente.`, actions: [{ buttonText: `Verificar Novamente`, command_to_run: `!confirmregister ${characterNameToConfirm}` }] }; break;
            } const guildMember = await checkTibiaCharacterInGuild(charInfo.name); if (!guildMember) { result.responseText = `O personagem ${charInfo.name} não pertence à guilda '${await getGuildName()}'.`;
                break; } const allClientAccounts = await loadJsonFile(DATA_FILES.clientAccounts); Object.values(allClientAccounts).forEach(acc => { acc.tibiaCharacters = (acc.tibiaCharacters || []).filter(c => c && c.characterName && c.characterName.toLowerCase() !== charInfo.name.toLowerCase()); });
            const newCharData = { characterName: charInfo.name, registeredAt: new Date().toISOString(), level: charInfo.level, vocation: charInfo.vocation, world: charInfo.world, guildRank: guildMember.rank ||
            null, groups: [] }; loggedInAccount.tibiaCharacters.push(newCharData); allClientAccounts[userIdentifier] = loggedInAccount; user.character = newCharData; delete verificationCodes[userIdentifier]; await saveJsonFile(DATA_FILES.verificationCodes, verificationCodes); await saveJsonFile(DATA_FILES.clientAccounts, allClientAccounts);
            result.adminDataUpdate = true; result.responseText = `✅ Sucesso! O personagem ${charInfo.name} foi registrado na sua conta.`; break;
        }
        case "mp": { const allowedRanks = ["leader alliance", "leader", "prodigy"];
            if (!allowedRanks.includes((registration.guildRank || "").toLowerCase())) { result.responseText = "Sem permissão."; break; } const message = args.join(" ");
            if (!message) { result.responseText = "Uso: !mp [mensagem]"; break; } result.responseText = "✅ Mensagem enviada."; result.broadcastType = 'mass_message';
            result.broadcastPayload = { sender: charName, message: message }; break; }
        case "respinfo": {
            const userInput = args.join(" ");
            if (!userInput) {
                result.responseText = "Uso: !respinfo [nome ou código]";
                break;
            }
            const respawnCode = await findRespawnCode(userInput);
            if (!respawnCode) {
                result.responseText = `Respawn "${userInput}" não encontrado.`;
                break;
            }
            const actualRespawnKey = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            if (!actualRespawnKey) {
                result.responseText = `Ninguém está no respawn ${respawnCode.toUpperCase()}.`;
                break;
            }
            const respawn = filaRespawns[actualRespawnKey];
            let infoText = `Informações para ${respawnCode.toUpperCase()}:\n`;
            infoText += `Caçando agora: ${respawn.current ? respawn.current.clientNickname : 'Ninguém'}\n`;
            if (respawn.queue && respawn.queue.length > 0) {
                infoText += "Fila de espera (Nexts):\n";
                respawn.queue.forEach((user, index) => {
                    infoText += `${index + 1}. ${user.clientNickname}\n`;
                });
            } else {
                infoText += "Fila de espera está vazia.";
            }
            result.responseText = infoText;
            break;
        }
        
        case "resp": {
            const userGroups = registration.groups || [];
            if (userGroups.includes('resp-block')) {
                result.responseText = "❌ Você não pode reservar respawns porque possui o grupo 'Resp-Block'.";
                break; 
            }
            if (cooldowns[userIdentifier] && cooldowns[userIdentifier] > Date.now()) {
                const remaining = Math.ceil((cooldowns[userIdentifier] - Date.now()) / 60000);
                result.responseText = `Você está em cooldown e não pode reservar um novo respawn. Espere mais ${remaining} minuto(s).`;
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
            if (!userInput) {
                result.responseText += "Uso: !resp [nome ou código] [tempo opcional]";
                break;
            }
            const respawnCode = await findRespawnCode(userInput);
            if (!respawnCode) {
                result.responseText += `Respawn "${userInput}" não encontrado.`;
                break;
            }
            const requiredGroups = respawnGroups[respawnCode];
            if (requiredGroups?.length > 0 && !requiredGroups.some(g => (registration.groups || []).includes(g))) {
                result.responseText += `Requer um dos grupos: ${cachedData.webGroups.find(g => requiredGroups.includes(g.id))?.name ||
                'desconhecido'}.`;
                break;
            }
            if (Object.values(filaRespawns).reduce((c, r) => c + (r.current?.clientUniqueIdentifier === userIdentifier) + r.queue.some(u => u.clientUniqueIdentifier === userIdentifier), 0) >= 2) {
                result.responseText += "Limite de 2 respawns atingido.";
                break;
            }
            const maxTimeData = await getUserMaxTime(registration);
            const maxTimeAllowed = maxTimeData.total;
            let finalTimeInMinutes = maxTimeAllowed;
            if (timeArg) {
                const requestedTime = parseCustomTime(timeArg);
                if (requestedTime === null) {
                    result.responseText += `Formato de tempo inválido: "${timeArg}".
Use HH:MM.`;
                    break;
                }
                if (requestedTime > maxTimeAllowed) {
                    result.responseText += `Tempo excede seu limite de ${formatMinutesToHHMM(maxTimeAllowed)}.`;
                    break;
                }
                finalTimeInMinutes = requestedTime;
            }
            
            const actualRespawnKey = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            const respawnExists = actualRespawnKey ? filaRespawns[actualRespawnKey] : null;
            const userData = { clientNickname: charName, clientUniqueIdentifier: userIdentifier, allocatedTime: finalTimeInMinutes };
            const isHuntingElsewhere = Object.values(filaRespawns).some(r => r.current?.clientUniqueIdentifier === userIdentifier);
            if (isHuntingElsewhere && !respawnExists) {
                result.responseText = `❌ Você não pode pegar um respawn vazio enquanto estiver caçando ativamente em outro.
Saia do seu respawn atual ou entre na fila de um já existente.`;
                return result;
            }

            if (respawnExists) {
                if (respawnExists.current?.clientUniqueIdentifier === userIdentifier || respawnExists.queue.some(u => u.clientUniqueIdentifier === userIdentifier)) {
                    result.responseText += `Você já está em ${respawnCode.toUpperCase()}.`;
                } else {
                    if (isHuntingElsewhere && respawnExists.queue.length === 0) {
                        result.responseText += `❌ Você não pode ser o próximo na fila enquanto estiver caçando ativamente em outro respawn.`;
                        return result;
                    }
                    respawnExists.queue.push(userData);
                    await logActivity(respawnCode, charName, `Entrou na fila`);
                    result.responseText += `Você entrou na fila para ${respawnCode.toUpperCase()}.`;
                    result.needsBroadcast = true;
                    await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
                }
            } else {
                filaRespawns[respawnCode] = { current: userData, queue: [], time: finalTimeInMinutes, waitingForAccept: true, acceptanceTime: 10, startTime: new Date().toISOString() };
                await logActivity(respawnCode, charName, `Pegou o respawn`);
                result.responseText += `Você pegou ${respawnCode.toUpperCase()}. Use 'Aceitar' em 10 min.`;
                result.needsBroadcast = true;
                await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
            }
            break;
        }

        case "aceitar": {
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
                // --- INÍCIO DA CORREÇÃO ---
                // Garante que o `respawn.time` seja sempre um número válido, buscando em `allocatedTime`
                // e usando fallbacks seguros caso o valor esteja ausente.
                respawn.time = respawn.current?.allocatedTime || respawn.time || 150;
                // --- FIM DA CORREÇÃO ---
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
            const userInput = args.join(" ");
            if (!userInput) { result.responseText = "Uso: !respdel [nome ou código]"; break; }
            const respawnCode = await findRespawnCode(userInput);
            if (!respawnCode) { result.responseText = `Respawn "${userInput}" não encontrado.`; break; }
            const key = Object.keys(filaRespawns).find(k => k.toLowerCase() === respawnCode.toLowerCase());
            if (!key) { result.responseText = `Respawn ${respawnCode.toUpperCase()} não está ativo.`; break; }
            const respawn = filaRespawns[key];

            if (respawn.current?.clientUniqueIdentifier === userIdentifier) {
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
                result.needsBroadcast = true;
                await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
            } else {
                const queueIndex = respawn.queue.findIndex(u => u.clientUniqueIdentifier === userIdentifier);
                if (queueIndex > -1) {
                    respawn.queue.splice(queueIndex, 1);
                    await logActivity(key, charName, `Saiu da fila`);
                    result.responseText = `Você foi removido da fila de ${respawnCode.toUpperCase()}.`;
                    result.needsBroadcast = true;
                    await saveJsonFile(DATA_FILES.respawnQueue, filaRespawns);
                } else {
                    result.responseText = `Você não está em ${respawnCode.toUpperCase()}.`;
                }
            }
            break;
        }
        case "shared": { const level = parseInt(args[0], 10);
            if (isNaN(level) || level <= 0) { result.responseText = "Forneça um nível válido.";
            } else { result.responseText = `Um nível ${level} compartilha XP com ${Math.ceil(level * 2/3)} e ${Math.floor(level * 3/2)}.`; } break;
        }
        case "logout": const token = args[0];
            if(token && loggedInAccount.sessionTokens) { const allClientAccounts = await loadJsonFile(DATA_FILES.clientAccounts); loggedInAccount.sessionTokens = loggedInAccount.sessionTokens.filter(t => t !== token); allClientAccounts[userIdentifier] = loggedInAccount;
                await saveJsonFile(DATA_FILES.clientAccounts, allClientAccounts); } result.logoutSuccess = true; result.responseText = "Desconectado com sucesso."; break;
        default: result.responseText = `Comando '${command}' não reconhecido.`;
    }
    return result;
}

async function adminGetFullData() {
    const users = await loadJsonFile(DATA_FILES.clientAccounts, {});
    const groups = (cachedData.webGroups || []).filter(g => g.id !== 'plus');
    const respawns = cachedData.respawns || {};
    const respawnGroups = await loadJsonFile(DATA_FILES.respawnGroups, {});
    let respawnTimes = cachedData.respawnTimes || {};
    const cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    
    const allRanksInGuild = new Set(['default']);
    Object.values(users).forEach(userAccount => { (userAccount.tibiaCharacters || []).forEach(char => { if (char.guildRank) allRanksInGuild.add(char.guildRank); }); });
    
    let timesFileWasModified = false;
    allRanksInGuild.forEach(rank => { if (!respawnTimes.hasOwnProperty(rank)) { respawnTimes[rank] = 150; timesFileWasModified = true; } });
    
    if (timesFileWasModified) { await saveJsonFile(DATA_FILES.respawnTimes, respawnTimes);
        await loadAndCacheData();
    }
    return { users, groups, respawns, respawnGroups, respawnTimes, cooldowns };
}

async function adminCreateOrUpdateRespawn(respawnData) {
    const { code, name, region } = respawnData;
    if (!code || !name || !region) return { success: false, message: 'Código, Nome e Região são obrigatórios.' };

    const respawns = await loadJsonFile(DATA_FILES.respawns, {});
    
    // Remove o código antigo de qualquer outra região, caso esteja sendo movido
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
    await loadAndCacheData(); // Recarrega o cache
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
        await loadAndCacheData(); // Recarrega o cache
        return { success: true };
    }
    return { success: false, message: 'Respawn não encontrado.' };
}

async function adminRemoveCooldown(userIdentifier) {
    let cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    if (cooldowns[userIdentifier]) {
        delete cooldowns[userIdentifier];
        await saveJsonFile(DATA_FILES.cooldowns, cooldowns);
        console.log(`[ADMIN] Cooldown removido para: ${userIdentifier}`);
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
    if (!key) return; // Respawn não encontrado na fila

    const respawn = fila[key];
    const characterName = respawn.current?.clientNickname || 'N/A';

    if (isPaused) { // Pausando
        if (respawn.paused) return; // Já está pausado
        respawn.paused = true;
        
        if (respawn.waitingForAccept) {
            // Pausa o tempo de aceite
            const acceptanceDeadline = new Date(respawn.startTime).getTime() + (respawn.acceptanceTime * 60 * 1000);
            const remainingMs = acceptanceDeadline - Date.now();
            respawn.remainingAcceptanceTimeOnPause = remainingMs > 0 ? remainingMs : 0;
            await logActivity(key, characterName, `PAUSADO (ACEITE)`);
        } else if (respawn.endTime) {
            // Pausa o tempo de caça (lógica existente)
            const remainingMs = new Date(respawn.endTime).getTime() - Date.now();
            respawn.remainingTimeOnPause = remainingMs > 0 ? remainingMs : 0;
            await logActivity(key, characterName, `PAUSOU`);
        }
    } else { // Despausando
        if (!respawn.paused) return; // Já está ativo
        respawn.paused = false;

        if (respawn.hasOwnProperty('remainingAcceptanceTimeOnPause')) {
            // Despausa o tempo de aceite, recalculando o novo tempo de início
            const newStartTime = new Date(Date.now() + respawn.remainingAcceptanceTimeOnPause - (respawn.acceptanceTime * 60 * 1000));
            respawn.startTime = newStartTime.toISOString();
            delete respawn.remainingAcceptanceTimeOnPause;
            await logActivity(key, characterName, `DESPAUSADO (ACEITE)`);
        } else if (respawn.hasOwnProperty('remainingTimeOnPause')) {
            // Despausa o tempo de caça (lógica existente)
            const newEndTime = Date.now() + (respawn.remainingTimeOnPause || 0);
            respawn.endTime = new Date(newEndTime).toISOString();
            delete respawn.remainingTimeOnPause;
            await logActivity(key, characterName, `DESPAUSOU`);
        }
    }
    await saveJsonFile(DATA_FILES.respawnQueue, fila);
}

async function adminPauseAll(isPaused) {
    const fila = await loadJsonFile(DATA_FILES.respawnQueue, {});
    for (const key in fila) {
        const respawn = fila[key];
        if (!respawn.current || respawn.waitingForAccept) continue;
        if (isPaused) {
            if (respawn.paused) continue;
            respawn.paused = true;
            const remainingMs = new Date(respawn.endTime).getTime() - Date.now();
            respawn.remainingTimeOnPause = remainingMs > 0 ? remainingMs : 0;
        } else {
            if (!respawn.paused) continue;
            respawn.paused = false;
            const newEndTime = Date.now() + (respawn.remainingTimeOnPause || 0);
            respawn.endTime = new Date(newEndTime).toISOString();
            respawn.remainingTimeOnPause = null;
        }
    }
    await saveJsonFile(DATA_FILES.respawnQueue, fila);
    await logActivity("TODOS", "Líder", isPaused ? `PAUSOU TODOS` : `DESPAUSOU TODOS`);
}

async function adminGetRespawnLog(respawnCode) {
    const logData = await loadJsonFile(DATA_FILES.logRespawn, {});
    return { title: `Log para Respawn: ${respawnCode.toUpperCase()}`, entries: logData[respawnCode] || [] };
}

async function adminGetCharacterLog(characterName) {
    const logData = await loadJsonFile(DATA_FILES.logCharacter, {});
    return { title: `Log para Personagem: ${characterName}`, entries: logData[characterName] || [] };
}

async function adminKickUser({ respawnCode, userToKick, adminName }) {
    const fila = await loadJsonFile(DATA_FILES.respawnQueue, {});
    const key = Object.keys(fila).find(k => k.toLowerCase() === respawnCode.toLowerCase());
    if (!key) return;
    const respawn = fila[key];
    if (respawn.current?.clientNickname === userToKick) {
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
    } else {
        const originalLength = respawn.queue.length;
        respawn.queue = respawn.queue.filter(u => u.clientNickname !== userToKick);
        if (respawn.queue.length < originalLength) {
            await logActivity(key, userToKick, `Removido da fila por ${adminName}`);
        }
    }
    await saveJsonFile(DATA_FILES.respawnQueue, fila);
}

async function processExpiredRespawns() {
    const fila = await loadJsonFile(DATA_FILES.respawnQueue, {});
    const cooldowns = await loadJsonFile(DATA_FILES.cooldowns, {});
    let hasChanges = false;
    const notifications = [];
    const now = Date.now();

    for (const key in fila) {
        const respawn = fila[key];
        if (!respawn || respawn.paused) continue;

        let needsUpdate = false;

        if (respawn.waitingForAccept) {
            const acceptanceDeadline = new Date(respawn.startTime).getTime() + (respawn.acceptanceTime * 60 * 1000);

            // Se o tempo para aceitar expirou completamente
            if (now > acceptanceDeadline) {
                await logActivity(key, respawn.current.clientNickname, `Não aceitou`);
                notifications.push({ 
                    recipientEmail: respawn.current.clientUniqueIdentifier, 
                    type: 'private_message', 
                    message: `❌ Você não aceitou o respawn ${key.toUpperCase()} a tempo e foi removido da fila.` 
                });
                needsUpdate = true;
            } else {
                // NOVO: Lógica de lembrete a cada minuto
                const minutesRemaining = Math.ceil((acceptanceDeadline - now) / (60 * 1000));
                
                // Inicializa a propriedade se não existir
                if (respawn.lastReminderSentAtMinute === undefined) {
                    respawn.lastReminderSentAtMinute = -1; 
                }

                // Envia o lembrete apenas se o minuto mudou e é diferente do último enviado
                if (minutesRemaining > 0 && minutesRemaining < respawn.acceptanceTime && minutesRemaining !== respawn.lastReminderSentAtMinute) {
                    notifications.push({
                        recipientEmail: respawn.current.clientUniqueIdentifier,
                        type: 'warning', // Usando 'warning' para se destacar
                        message: `🔔 Lembrete! Você tem ${minutesRemaining} minuto(s) para aceitar o respawn ${key.toUpperCase()}. Use o comando '!aceitar'.`
                    });
                    respawn.lastReminderSentAtMinute = minutesRemaining; // Marca que o lembrete para este minuto foi enviado
                    hasChanges = true; // Garante que a fila seja salva com o novo estado do 'lastReminderSentAtMinute'
                }
                // FIM DO NOVO TRECHO
            }

        } else if (respawn.endTime) {
            // Se o tempo de caça no respawn expirou
            if (now > new Date(respawn.endTime).getTime()) {
                if (respawn.current) {
                    await logActivity(key, respawn.current.clientNickname, `Tempo finalizado`);
                    notifications.push({ 
                        recipientEmail: respawn.current.clientUniqueIdentifier, 
                        type: 'private_message', 
                        message: `Seu tempo no respawn ${key.toUpperCase()} acabou.` 
                    });
                    cooldowns[respawn.current.clientUniqueIdentifier] = Date.now() + 10 * 60 * 1000;
                }
                needsUpdate = true;
            }
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
                respawn.lastReminderSentAtMinute = -1; // Reseta o lembrete para o próximo usuário
                
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
    const defaultData = { world: "Issobra", source_allies: [], source_enemies: [], source_hunteds: [], players_allies: [], players_enemies: [], players_hunteds: [], last_sync: null };
    return await loadJsonFile(DATA_FILES.relations, defaultData);
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
    console.log('[SYNC] Iniciando sincronização de relações...');
    const relations = await getRelationsData();
    let newPlayersAllies = [], newPlayersEnemies = [], newPlayersHunteds = [];
    const processedNames = new Set();
    for (const guildName of relations.source_allies) {
        const members = await getGuildMembers(guildName);
        for (const member of members) { if (!processedNames.has(member.name.toLowerCase())) { newPlayersAllies.push({ name: member.name, level: member.level, vocation: member.vocation }); processedNames.add(member.name.toLowerCase()); } }
        await sleep(500);
    }
    processedNames.clear();
    for (const guildName of relations.source_enemies) {
        const members = await getGuildMembers(guildName);
        for (const member of members) { if (!processedNames.has(member.name.toLowerCase())) { newPlayersEnemies.push({ name: member.name, level: member.level, vocation: member.vocation }); processedNames.add(member.name.toLowerCase()); } }
        await sleep(500);
    }
    for (const hunted of relations.source_hunteds) {
        const charInfo = await getTibiaCharacterInfo(hunted.name);
        if (charInfo) { const huntedData = { name: charInfo.name, level: charInfo.level, vocation: charInfo.vocation, reason: hunted.reason }; newPlayersHunteds.push(huntedData); if (!processedNames.has(charInfo.name.toLowerCase())) { newPlayersEnemies.push(huntedData); } }
        await sleep(500);
    }
    relations.players_allies = newPlayersAllies;
    relations.players_enemies = newPlayersEnemies;
    relations.players_hunteds = newPlayersHunteds;
    relations.last_sync = new Date().toISOString();
    await saveJsonFile(DATA_FILES.relations, relations);
    console.log(`[SYNC] Sincronização concluída.`);
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

async function processExpiredPlusMembers() {
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts, {});
    let changesMade = false;
    const now = new Date();
    for (const email in clientAccounts) {
        const account = clientAccounts[email];
        if (account.tibiaCharacters && account.tibiaCharacters.length > 0) {
            const char = account.tibiaCharacters[0];
            if (char.plusExpiresAt && new Date(char.plusExpiresAt) < now) {
                console.log(`[EXPIRAÇÃO] Acesso Plus de ${char.characterName} (${email}) expirou.`);
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
    if(!user || !user.account) return;
    const clientAccounts = await loadJsonFile(DATA_FILES.clientAccounts);
    const account = clientAccounts[user.account.email];
    if(!account || !account.tibiaCharacters) return;

    let changesMade = false;
    for (const char of account.tibiaCharacters) {
        const guildMember = await checkTibiaCharacterInGuild(char.characterName);
        if (guildMember) {
            if (char.guildRank !== guildMember.rank) {
                console.log(`[SYNC LOGIN] Rank de ${char.characterName} atualizado para ${guildMember.rank}`);
                char.guildRank = guildMember.rank;
                changesMade = true;
            }
        } else {
            console.log(`[SYNC LOGIN] ${char.characterName} não está mais na guilda. Removendo privilégios.`);
            char.guildRank = 'Left Guild';
            changesMade = true;
        }
    }

    if(changesMade) {
        await saveJsonFile(DATA_FILES.clientAccounts, clientAccounts);
        user.account = account;
        user.character = account.tibiaCharacters.find(c => c.characterName === user.character.characterName) || account.tibiaCharacters[0];
    }
}

module.exports = {
    processCommand, processConversationReply, loadJsonFile, saveJsonFile, // <-- loadJsonFile e saveJsonFile foram adicionadas aqui
    adminGetFullData, adminCreateOrUpdateGroup, adminDeleteGroup, adminUpdateUserGroups,
    adminPauseRespawn, adminPauseAll, processExpiredRespawns, adminUpdateRespawnGroups,
    adminGetRespawnLog, adminGetCharacterLog, adminKickUser, adminUpdateRespawnTimes,
    getRelationsData, adminAddRelation, adminRemoveRelation, syncAllRelations,
    adminGetAllUsersForPlusManagement, adminAddPlusTime, processExpiredPlusMembers, getUserMaxTime,
    verifyUserGuildStatus,  adminRemoveCooldown,    adminCreateOrUpdateRespawn,
    adminDeleteRespawn
};