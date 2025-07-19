
const { TeamSpeak, TextMessageTargetMode } = require("ts3-nodejs-library");
const fetch = require('node-fetch');
const fs = require('fs');
const crypto = require('crypto');

// Configurações do servidor
const serverIP = '69.62.98.88';
const username = 'serveradmin';
const password = 'yJW5xsLCwRAz';

// Níveis e nomes dos grupos
const LEVEL_GROUPS = [
    { minLevel: 50, maxLevel: 99, groupName: '50+' },
    { minLevel: 100, maxLevel: 149, groupName: '100+' },
    { minLevel: 150, maxLevel: 199, groupName: '150+' },
    { minLevel: 200, maxLevel: 249, groupName: '200+' },
    { minLevel: 250, maxLevel: 299, groupName: '250+' },
    { minLevel: 300, maxLevel: 349, groupName: '300+' },
    { minLevel: 350, maxLevel: 399, groupName: '350+' },
    { minLevel: 400, maxLevel: 449, groupName: '400+' },
    { minLevel: 450, maxLevel: 499, groupName: '450+' },
    { minLevel: 500, maxLevel: 549, groupName: '500+' },
    { minLevel: 550, maxLevel: 599, groupName: '550+' },
    { minLevel: 600, maxLevel: 649, groupName: '600+' },
    { minLevel: 650, maxLevel: 699, groupName: '650+' },
    { minLevel: 700, maxLevel: 749, groupName: '700+' },
    { minLevel: 750, maxLevel: 799, groupName: '750+' },
    { minLevel: 800, maxLevel: 849, groupName: '800+' },
    { minLevel: 850, maxLevel: 899, groupName: '850+' },
    { minLevel: 900, maxLevel: 999, groupName: '900+' },
    { minLevel: 1000, maxLevel: 1049, groupName: '1000+' },
    { minLevel: 1050, maxLevel: 1099, groupName: '1050+' },
    { minLevel: 1100, maxLevel: 1199, groupName: '1100+' },
    { minLevel: 1200, maxLevel: 1299, groupName: '1200+' },
    { minLevel: 1300, maxLevel: 1399, groupName: '1300+' },
    { minLevel: 1400, maxLevel: 1499, groupName: '1400+' },
    { minLevel: 1500, maxLevel: 1599, groupName: '1500+' },
    { minLevel: 1600, maxLevel: 1699, groupName: '1600+' },
    { minLevel: 1700, maxLevel: 1799, groupName: '1700+' },
    { minLevel: 1800, maxLevel: 1899, groupName: '1800+' },
    { minLevel: 1900, maxLevel: 1999, groupName: '1900+' },
    { minLevel: 2000, maxLevel: Infinity, groupName: '2000+' }
];

const VOCATION_GROUPS = {
    'Elder Druid': 'Elder Druid',
    'Druid': 'Elder Druid',
    'Elite Knight': 'Elite Knight',
    'Knight': 'Elite Knight',
    'Royal Paladin': 'Royal Paladin',
    'Paladin': 'Royal Paladin',
    'Master Sorcerer': 'Master Sorcerer',
    'Sorcerer': 'Master Sorcerer'
};

// Arquivo para armazenar usuários registrados
const REGISTERED_USERS_FILE = './registered_users.json';
// Arquivo para armazenar códigos de verificação
const VERIFICATION_CODES_FILE = './verification_codes.json';

// Inicializa o registro de usuários
let registeredUsers = {};
try {
    if (fs.existsSync(REGISTERED_USERS_FILE)) {
        registeredUsers = JSON.parse(fs.readFileSync(REGISTERED_USERS_FILE, 'utf8'));
        console.log('Usuários registrados carregados:', Object.keys(registeredUsers).length);
    } else {
        // Cria o arquivo se não existir
        fs.writeFileSync(REGISTERED_USERS_FILE, JSON.stringify({}), 'utf8');
        console.log('Arquivo de usuários registrados criado.');
    }
} catch (error) {
    console.error('Erro ao carregar usuários registrados:', error);
    // Cria o arquivo se não existir
    fs.writeFileSync(REGISTERED_USERS_FILE, JSON.stringify({}), 'utf8');
}

// Mapa para armazenar códigos de verificação temporários
const verificationCodes = new Map();

// Carrega códigos de verificação salvos
try {
    if (fs.existsSync(VERIFICATION_CODES_FILE)) {
        const savedCodes = JSON.parse(fs.readFileSync(VERIFICATION_CODES_FILE, 'utf8'));
        Object.entries(savedCodes).forEach(([key, value]) => {
            verificationCodes.set(key, value);
        });
        console.log('Códigos de verificação carregados:', verificationCodes.size);
    }
} catch (error) {
    console.error('Erro ao carregar códigos de verificação:', error);
}

// Função para salvar códigos de verificação
function saveVerificationCodes() {
    try {
        const codesObj = {};
        verificationCodes.forEach((value, key) => {
            codesObj[key] = value;
        });
        fs.writeFileSync(VERIFICATION_CODES_FILE, JSON.stringify(codesObj, null, 2), 'utf8');
        console.log('Códigos de verificação salvos com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar códigos de verificação:', error);
    }
}

// Inicializa a conexão com o servidor TeaSpeak
const teamspeak = new TeamSpeak({
    host: serverIP,
    queryport: 10101,
    serverport: 9987,
    username: username,
    password: password,
    nickname: "Rbot1"
});

// Função para decodificar o nome da guilda, se necessário
function decodeIfEncoded(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value; // Retorna o valor original se não estiver codificado
    }
}

// Função para ler o nome da guilda aliada com fallback para "Vindictam"
function getGuildAliada() {
    try {
        const setGuild = JSON.parse(fs.readFileSync('./set_guild.json', 'utf8'));
        return decodeIfEncoded(setGuild.guild || 'New Corporation'); // Garante que o nome não esteja codificado
    } catch (error) {
        console.error('Erro ao carregar a guilda aliada:', error);
        return 'New Corporation; // Valor padrão se houver erro ou o arquivo estiver vazio
    }
}

// Define a constante guildAliada
const guildAliada = getGuildAliada();

// Função para verificar o status do personagem na guilda
async function checkTibiaCharacterInGuild(charName) {
    if (!charName) return null;
    
    const url = `https://api.tibiadata.com/v4/guild/${encodeURIComponent(guildAliada)}`;

    // Exibe no console a URL completa que está sendo buscada
    console.log("URL completa para busca da guilda:", url);

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.guild && data.guild.members) {
            const normalizedCharName = charName.toLowerCase().trim();
            const member = data.guild.members.find(member => 
                member.name.toLowerCase().includes(normalizedCharName)
            );
            
            if (member) {
                console.log(`Personagem ${charName} encontrado na guilda: ${member.name}`);
                return member;
            } else {
                console.log(`Personagem ${charName} não encontrado na guilda.`);
            }
        }
    } catch (error) {
        console.error("Erro ao buscar informações da guilda:", error);
    }
    return null;
}

// Função para obter informações de um personagem específico
async function getTibiaCharacterInfo(charName) {
    if (!charName) return null;
    
    const url = `https://api.tibiadata.com/v4/character/${encodeURIComponent(charName)}`;
    
    console.log(`Buscando informações do personagem: ${charName}`);
    console.log(`URL: ${url}`);
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`Resposta da API para ${charName}:`, JSON.stringify(data).substring(0, 200) + '...');
        
        if (data.character && data.character.character) {
            console.log(`Personagem ${charName} encontrado!`);
            return data.character.character;
        } else {
            console.log(`Personagem ${charName} não encontrado na API.`);
        }
    } catch (error) {
        console.error(`Erro ao buscar informações do personagem ${charName}:`, error);
    }
    return null;
}

// Função para obter informações completas do cliente
async function getFullClientInfo(clid) {
    try {
        console.log(`Obtendo informações para cliente com clid: ${clid}`);
        const clientInfo = await teamspeak.clientInfo(clid);
        const info = Array.isArray(clientInfo) ? clientInfo[0] : clientInfo;
        const clientNickname = info.clientNickname || "Nickname não encontrado";
        const clientDescription = info.clientDescription || "";
        console.log(`Nickname: ${clientNickname}`);
        console.log(`Descrição: ${clientDescription}`);
        const clientDatabaseId = parseInt(info.clientDatabaseId, 10);
        if (isNaN(clientDatabaseId)) {
            console.error(`ID do banco de dados inválido: ${info.clientDatabaseId}`);
            return null;
        }
        return { ...info, clientNickname, clientDescription, clientDatabaseId, clid };
    } catch (error) {
        console.error(`Erro ao obter informações do cliente ${clid}:`, error);
        return null;
    }
}

// Função para extrair o personagem da descrição (compatível com formatos antigos)
function extractCharacterName(description) {
    if (!description) return null;
    
    // Verifica se a descrição contém "Main:" (formato antigo)
    const mainMatch = description.match(/Main:\s*([^\/]+)/);
    if (mainMatch) {
        return mainMatch[1].trim();
    }
    
    // Verifica se a descrição contém "Reg:" (outro formato possível)
    const regMatch = description.match(/Reg:\s*([^\/]+)/);
    if (regMatch) {
        return regMatch[1].trim();
    }
    
    // Se não encontrar nenhum formato específico, retorna a descrição completa
    // (apenas para compatibilidade, não deve ser usado em novos registros)
    return description.trim();
}

// Função para buscar o ID de um grupo pelo nome
async function getGroupIdByName(groupName) {
    try {
        const groups = await teamspeak.serverGroupList();
        const group = groups.find(g => g.name === groupName);
        if (!group) {
            console.error(`Grupo com o nome "${groupName}" não encontrado.`);
            return null;
        }
        return group.sgid;
    } catch (error) {
        console.error(`Erro ao buscar grupo ${groupName}:`, error);
        return null;
    }
}

// Função para salvar usuários registrados no arquivo
function saveRegisteredUsers() {
    try {
        fs.writeFileSync(REGISTERED_USERS_FILE, JSON.stringify(registeredUsers, null, 2), 'utf8');
        console.log('Usuários registrados salvos com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar usuários registrados:', error);
    }
}

// Função para gerar um código de verificação aleatório
function generateVerificationCode() {
    return crypto.randomBytes(6).toString('hex').toUpperCase().substring(0, 12);
}

// Função para verificar se o código de verificação está presente nos comentários do personagem
async function checkVerificationCode(characterName, code) {
    try {
        const character = await getTibiaCharacterInfo(characterName);
        if (!character || !character.comment) {
            console.log(`Personagem ${characterName} não tem comentários ou não foi encontrado.`);
            return false;
        }
        
        console.log(`Comentário do personagem ${characterName}: "${character.comment}"`);
        console.log(`Verificando se contém o código: ${code}`);
        
        const containsCode = character.comment.includes(code);
        console.log(`Resultado da verificação: ${containsCode ? 'Código encontrado!' : 'Código não encontrado.'}`);
        
        return containsCode;
    } catch (error) {
        console.error(`Erro ao verificar código para ${characterName}:`, error);
        return false;
    }
}

// Função segura para enviar mensagens de texto
async function sendSafeTextMessage(clid, message) {
    if (!clid || !message) {
        console.error("Tentativa de enviar mensagem com clid ou mensagem inválidos");
        return;
    }
    
    try {
        await teamspeak.sendTextMessage(clid, TextMessageTargetMode.CLIENT, message);
        console.log(`Mensagem enviada para ${clid}: ${message}`);
    } catch (error) {
        console.error(`Erro ao enviar mensagem para ${clid}:`, error);
    }
}

// Função para enviar todas as instruções de registro de uma vez
async function sendAllRegistrationInstructions(clid, code) {
    try {
        const fullMessage = `Para registrar seu personagem:\n` +
                           `1. Acesse Tibia.com\n` +
                           `2. Adicione este código nos comentários do seu personagem: ${code}\n` +
                           `3. Aguarde 2 minutos e digite: !register SeuPersonagem\n` +
                           `Exemplo: !register Ranyx`;
        
        await sendSafeTextMessage(clid, fullMessage);
    } catch (error) {
        console.error(`Erro ao enviar instruções completas: ${error}`);
    }
}

// Função para enviar instruções de registro para um cliente
async function sendRegistrationInstructions(clid) {
    try {
        console.log(`Enviando instruções de registro para cliente ${clid}`);
        
        const clientInfo = await getFullClientInfo(clid);
        if (!clientInfo) {
            console.error(`Não foi possível obter informações do cliente ${clid}`);
            return;
        }
        
        const { clientUniqueIdentifier, clientNickname } = clientInfo;
        
        // Verificar se o usuário já está registrado no arquivo
        if (registeredUsers[clientUniqueIdentifier]) {
            console.log(`Usuário ${clientNickname} já está registrado no arquivo.`);
            await sendSafeTextMessage(clid, "Você já está registrado. Não é necessário se registrar novamente.");
            return;
        }
        
        // Verificar se já existe um código para este usuário
        if (verificationCodes.has(clientUniqueIdentifier)) {
            const existingCode = verificationCodes.get(clientUniqueIdentifier);
            console.log(`Usuário ${clientNickname} já tem um código de verificação: ${existingCode}`);
            
            // Enviar instruções com o código existente (todas de uma vez)
            await sendAllRegistrationInstructions(clid, existingCode);
            return;
        }
        
        // Gerar código de verificação para o usuário
        const verificationCode = generateVerificationCode();
        verificationCodes.set(clientUniqueIdentifier, verificationCode);
        saveVerificationCodes(); // Salvar os códigos após adicionar um novo
        
        console.log(`Código de verificação gerado para ${clientNickname}: ${verificationCode}`);
        
        // Enviar instruções de registro (todas de uma vez)
        await sendAllRegistrationInstructions(clid, verificationCode);
        
        console.log(`Instruções de registro enviadas para ${clientNickname} (${clientUniqueIdentifier}) com código ${verificationCode}`);
    } catch (error) {
        console.error("Erro ao enviar instruções de registro:", error);
    }
}

// Função para registrar um personagem para um cliente
async function registerCharacter(clid, characterName) {
    try {
        console.log(`Iniciando registro do personagem ${characterName} para cliente ${clid}`);
        
        const clientInfo = await getFullClientInfo(clid);
        if (!clientInfo) {
            console.error(`Não foi possível obter informações do cliente ${clid}`);
            return;
        }
        
        const { clientUniqueIdentifier, clientNickname, clientDatabaseId } = clientInfo;
        
        // Verificar se o usuário já está registrado
        if (registeredUsers[clientUniqueIdentifier]) {
            console.log(`Usuário ${clientNickname} já está registrado.`);
            await sendSafeTextMessage(clid, "Você já está registrado. Não é necessário se registrar novamente.");
            return;
        }
        
        // Verificar se o código de verificação foi gerado para este usuário
        const verificationCode = verificationCodes.get(clientUniqueIdentifier);
        if (!verificationCode) {
            console.log(`Nenhum código de verificação encontrado para ${clientNickname}`);
            await sendSafeTextMessage(clid, "Você precisa solicitar um código de verificação primeiro. Digite !register para começar.");
            return;
        }
        
        console.log(`Verificando código ${verificationCode} para personagem ${characterName}`);
        
        // Verificar se o código está nos comentários do personagem
        const isCodeValid = await checkVerificationCode(characterName, verificationCode);
        if (!isCodeValid) {
            console.log(`Código inválido para ${characterName}`);
            await sendSafeTextMessage(clid, 
                `Não foi possível verificar o código nos comentários do personagem ${characterName}. Por favor, certifique-se de que adicionou o código ${verificationCode} nos comentários do personagem e tente novamente.`);
            return;
        }
        
        // Verificar informações do personagem
        const character = await getTibiaCharacterInfo(characterName);
        if (!character) {
            console.log(`Personagem ${characterName} não encontrado`);
            await sendSafeTextMessage(clid, 
                `Não foi possível encontrar o personagem ${characterName}. Verifique se o nome está correto e tente novamente.`);
            return;
        }
        
        console.log(`Personagem ${characterName} verificado com sucesso!`);
        
        // Registrar usuário
        registeredUsers[clientUniqueIdentifier] = {
            characterName: character.name,
            registeredAt: new Date().toISOString(),
            level: character.level,
            vocation: character.vocation,
            world: character.world
        };
        
        // Salvar registro
        saveRegisteredUsers();
        
        // Remover código de verificação
        verificationCodes.delete(clientUniqueIdentifier);
        saveVerificationCodes(); // Salvar após remover o código
        
        // Atualizar descrição do cliente com o personagem registrado
        try {
            // Definir a descrição apenas com o nome do personagem
            await teamspeak.clientEdit(clid, { clientDescription: character.name });
            console.log(`Descrição atualizada para ${clientNickname}: ${character.name}`);
        } catch (error) {
            console.error(`Erro ao atualizar descrição do cliente ${clientNickname}:`, error);
        }
        
        // Processar o cliente para atribuir grupos com base no personagem registrado
        await processRegisteredClient(clientInfo, character);
        
        await sendSafeTextMessage(clid, 
            `Personagem ${character.name} registrado com sucesso! Grupos atualizados de acordo com seu level e vocação.`);
        
        console.log(`Usuário ${clientNickname} (${clientUniqueIdentifier}) registrado com personagem ${character.name}`);
    } catch (error) {
        console.error(`Erro ao registrar personagem:`, error);
        await sendSafeTextMessage(clid, 
            "Ocorreu um erro ao processar seu registro. Por favor, tente novamente mais tarde.");
    }
}

// Função para processar o registro de um cliente com informações do personagem
async function processRegisteredClient(client, character) {
    if (!client || !character) return;
    
    const { clientDatabaseId, clientNickname } = client;
    const level = character.level;
    const vocation = character.vocation;
    
    let newLevelGroupId = null;
    let newVocationGroupId = null;
    
    try {
        // Encontrar ID do grupo de vocação
        newVocationGroupId = await getGroupIdByName(VOCATION_GROUPS[vocation] || 'Unknown');
        
        // Encontrar ID do grupo de level
        for (const group of LEVEL_GROUPS) {
            if (level >= group.minLevel && level <= group.maxLevel) {
                newLevelGroupId = await getGroupIdByName(group.groupName);
                break;
            }
        }
        
        // Obter grupos atuais do cliente
        const currentGroups = client.clientServergroups.map(Number);
        
        // Adicionar ao grupo de level se necessário
        if (newLevelGroupId && !currentGroups.includes(newLevelGroupId)) {
            await teamspeak.clientAddServerGroup(clientDatabaseId, newLevelGroupId);
            console.log(`${clientNickname} adicionado ao grupo ${newLevelGroupId} (level)`);
        }
        
        // Adicionar ao grupo de vocação se necessário
        if (newVocationGroupId && !currentGroups.includes(newVocationGroupId)) {
            await teamspeak.clientAddServerGroup(clientDatabaseId, newVocationGroupId);
            console.log(`${clientNickname} adicionado ao grupo ${newVocationGroupId} (vocation)`);
        }
        
        // Adicionar ao grupo de membro registrado
        const memberGroupId = await getGroupIdByName('Membro');
        if (memberGroupId && !currentGroups.includes(memberGroupId)) {
            await teamspeak.clientAddServerGroup(clientDatabaseId, memberGroupId);
            console.log(`${clientNickname} adicionado ao grupo Membro`);
        }
    } catch (error) {
        console.error(`Erro ao processar registro para ${clientNickname}:`, error);
    }
}

// Função para processar comando recebido
async function processCommand(message, clid) {
    if (!message) {
        console.error(`Mensagem vazia recebida de ${clid}`);
        return;
    }
    
    console.log(`Processando comando: "${message}" de ${clid}`);
    
    // Normalizar a mensagem para comparação
    const normalizedMessage = message.trim().toLowerCase();
    
    // Comando para iniciar registro
    if (normalizedMessage === "!register") {
        console.log(`Comando !register recebido de ${clid}`);
        await sendRegistrationInstructions(clid);
        return;
    }
    
    // Comando para registrar personagem específico
    if (normalizedMessage.startsWith("!register ")) {
        const characterName = message.substring("!register ".length).trim();
        console.log(`Comando !register ${characterName} recebido de ${clid}`);
        
        if (characterName) {
            await registerCharacter(clid, characterName);
        } else {
            await sendSafeTextMessage(clid, 
                "Por favor, forneça o nome do personagem. Exemplo: !register SeuPersonagem");
        }
        return;
    }
    
    // Verificar comando com erro de digitação comum
    if (normalizedMessage.startsWith("!resgister ")) {
        const characterName = message.substring("!resgister ".length).trim();
        console.log(`Comando com erro de digitação !resgister ${characterName} recebido de ${clid}`);
        
        await sendSafeTextMessage(clid, 
            "Comando digitado incorretamente. Use !register SeuPersonagem");
        return;
    }
}

// Função para verificar se um usuário já está registrado (considerando descrição antiga)
function isUserAlreadyRegistered(clientInfo) {
    if (!clientInfo) return false;
    
    const { clientUniqueIdentifier, clientDescription } = clientInfo;
    
    // Verificar se está no registro de usuários
    if (registeredUsers[clientUniqueIdentifier]) {
        console.log(`Usuário ${clientInfo.clientNickname} encontrado no registro de usuários.`);
        return true;
    }
    
    // Verificar se a descrição contém "Main:" ou "Reg:" (formatos antigos)
    if (clientDescription && (clientDescription.includes("Main:") || clientDescription.includes("Reg:"))) {
        console.log(`Usuário ${clientInfo.clientNickname} tem descrição no formato antigo.`);
        return true;
    }
    
    return false;
}

// Função para processar o cliente
async function processClient(client) {
    if (!client) {
        console.error("Cliente não encontrado.");
        return;
    }

    const { clientNickname, clientDescription, clientDatabaseId, clientUniqueIdentifier, clid } = client;

    // Verificar se o usuário já está registrado (usando a função melhorada)
    if (isUserAlreadyRegistered(client)) {
        console.log(`Cliente ${clientNickname} já está registrado, processando normalmente.`);
    } else {
        // Usuário não registrado, verificar se está inativo
        const lastActivity = new Date(client.clientLastconnected * 1000);
        const now = new Date();
        const inactiveDays = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
        
        // Se o usuário estiver ativo há menos de 1 dia e não for o próprio bot, enviar instruções de registro
        if (inactiveDays < 1 && clientNickname !== "Rbot1") {
            console.log(`Enviando instruções de registro para novo usuário: ${clientNickname}`);
            await sendRegistrationInstructions(clid);
            return;
        }
    }

    if (!clientDescription) {
        console.log(`Cliente ${clientNickname} sem descrição. Pulando processamento.`);
        return;
    }

    console.log(`Processando cliente: ${clientNickname}`);

    // Extrair o nome do personagem da descrição (compatível com formatos antigos)
    const characterName = extractCharacterName(clientDescription);
    if (!characterName) {
        console.log(`Não foi possível extrair nome de personagem da descrição de ${clientNickname}`);
        return;
    }
    
    console.log(`Personagem extraído da descrição: ${characterName}`);
    
    const character = await checkTibiaCharacterInGuild(characterName);

    if (character) {
        const level = character.level;
        const vocation = character.vocation;
        const status = character.status;

        let newLevelGroupId = null;
        let newVocationGroupId = await getGroupIdByName(VOCATION_GROUPS[vocation] || 'Unknown');

        // Encontra o novo grupo baseado no nível
        for (const group of LEVEL_GROUPS) {
            if (level >= group.minLevel && level <= group.maxLevel) {
                newLevelGroupId = await getGroupIdByName(group.groupName);
                break;
            }
        }

        try {
            const currentGroups = client.clientServergroups.map(Number);

            // Remove grupos de nível e vocação que não são mais necessários
            for (const group of LEVEL_GROUPS) {
                const groupId = await getGroupIdByName(group.groupName);
                if (groupId && groupId !== newLevelGroupId && currentGroups.includes(groupId)) {
                    await teamspeak.clientDelServerGroup(clientDatabaseId, groupId);
                    console.log(`${clientNickname} removido do grupo ${group.groupName}`);
                }
            }

            for (const vocation in VOCATION_GROUPS) {
                const groupId = await getGroupIdByName(VOCATION_GROUPS[vocation]);
                if (groupId && groupId !== newVocationGroupId && currentGroups.includes(groupId)) {
                    await teamspeak.clientDelServerGroup(clientDatabaseId, groupId);
                    console.log(`${clientNickname} removido do grupo ${VOCATION_GROUPS[vocation]}`);
                }
            }

            // Adiciona novos grupos de nível e vocação se necessário
            if (newLevelGroupId && !currentGroups.includes(newLevelGroupId)) {
                await teamspeak.clientAddServerGroup(clientDatabaseId, newLevelGroupId);
                console.log(`${clientNickname} adicionado ao grupo ${newLevelGroupId}`);
            }

            if (newVocationGroupId && !currentGroups.includes(newVocationGroupId)) {
                await teamspeak.clientAddServerGroup(clientDatabaseId, newVocationGroupId);
                console.log(`${clientNickname} adicionado ao grupo ${newVocationGroupId} (vocation)`);
            }

            // Atualiza o grupo baseado no status online
            const onlineGroupId = await getGroupIdByName('Online');
            const offlineGroupId = await getGroupIdByName('Offline');

            if (status=== 'online' && onlineGroupId && !currentGroups.includes(onlineGroupId)) {
                await teamspeak.clientAddServerGroup(clientDatabaseId, onlineGroupId);
                console.log(`${clientNickname} adicionado ao grupo Online`);
            } else if (status !== 'online' && onlineGroupId && currentGroups.includes(onlineGroupId)) {
                await teamspeak.clientDelServerGroup(clientDatabaseId, onlineGroupId);
                console.log(`${clientNickname} removido do grupo Online`);
            }

            if (status !== 'online' && offlineGroupId && !currentGroups.includes(offlineGroupId)) {
                await teamspeak.clientAddServerGroup(clientDatabaseId, offlineGroupId);
                console.log(`${clientNickname} adicionado ao grupo Offline`);
            } else if (status === 'online' && offlineGroupId && currentGroups.includes(offlineGroupId)) {
                await teamspeak.clientDelServerGroup(clientDatabaseId, offlineGroupId);
                console.log(`${clientNickname} removido do grupo Offline`);
            }

        } catch (groupError) {
            console.error(`Erro ao atualizar os grupos para ${clientNickname}:`, groupError);
        }
    } else {
        console.log(`Personagem ${characterName} não encontrado na guilda.`);
    }
}

// Evento quando um cliente se conecta ao servidor
teamspeak.on('clientconnect', async (event) => {
    try {
        if (!event || !event.client || !event.client.clid) {
            console.error("Evento de conexão inválido recebido");
            return;
        }
        
        const clid = event.client.clid;
        console.log(`Cliente conectado com clid: ${clid}`);
        
        const clientInfo = await getFullClientInfo(clid);
        
        if (clientInfo) {
            const { clientUniqueIdentifier, clientNickname } = clientInfo;
            
            // Verificar se o usuário já está registrado
            if (!isUserAlreadyRegistered(clientInfo) && clientNickname !== "NICK DO BOT") {
                console.log(`Novo usuário conectado: ${clientNickname}. Enviando instruções de registro.`);
                // Aguardar um breve momento para garantir que o cliente está pronto para receber mensagens
                setTimeout(() => {
                    sendRegistrationInstructions(clid);
                }, 1000); // Reduzido para 1 segundo
            }
        }
    } catch (error) {
        console.error("Erro ao processar conexão de cliente:", error);
    }
});

// Evento quando o bot se conecta ao servidor
teamspeak.on('ready', async () => {
    console.log('Bot conectado ao servidor TeaSpeak.');

    // Verifica clientes a cada 40 segundos
    setInterval(async () => {
        try {
            const clients = await teamspeak.clientList();
            console.log('Verificando clientes...');
            for (const client of clients) {
                if (!client || !client.clid) continue;
                const clientInfo = await getFullClientInfo(client.clid);
                if (clientInfo) {
                    await processClient(clientInfo);
                }
            }
        } catch (error) {
            console.error('Erro ao verificar clientes:', error);
        }
    }, 40000); // 40 segundos
});

// Evento quando uma mensagem é recebida - CORRIGIDO PARA USAR A ESTRUTURA CORRETA
teamspeak.on('textmessage', async (ev) => {
    try {
        // Verificação da estrutura do evento conforme o exemplo fornecido
        if (!ev || !ev.invoker) {
            console.error("Evento de mensagem inválido recebido");
            return;
        }
        
        const clid = ev.invoker.clid;
        // Usar ev.msg em vez de ev.message conforme o exemplo
        const message = ev.msg;
        
        if (!message) {
            console.error("Mensagem vazia recebida");
            return;
        }
        
        console.log(`Mensagem recebida: "${message}" de ${clid}`);
        
        // Processar o comando independentemente do targetmode
        await processCommand(message, clid);
    } catch (error) {
        console.error("Erro ao processar mensagem:", error);
    }
});

// Evento de erro
teamspeak.on('error', (error) => {
    console.error("Erro no bot:", error);
});

console.log("Bot iniciado com sucesso com função de auto-registro simplificada!");