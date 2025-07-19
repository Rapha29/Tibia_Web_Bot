const { TeamSpeak, TextMessageTargetMode } = require("ts3-nodejs-library");
const fetch = require('node-fetch');
const fs = require('fs');

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

// Inicializa a conexão com o servidor TeaSpeak
const teamspeak = new TeamSpeak({
    host: serverIP,
    queryport: 10101,
    serverport: 9987,
    username: username,
    password: password,
    nickname: "corporation"
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
        return decodeIfEncoded(setGuild.guild || 'Vindictam'); // Garante que o nome não esteja codificado
    } catch (error) {
        console.error('Erro ao carregar a guilda aliada:', error);
        return 'Vindictam'; // Valor padrão se houver erro ou o arquivo estiver vazio
    }
}

// Define a constante guildAliada
const guildAliada = getGuildAliada();

// Função para verificar o status do personagem na guilda
async function checkTibiaCharacterInGuild(charName) {
    const url = `https://api.tibiadata.com/v4/guild/${encodeURIComponent(guildAliada)}`; // Codifique aqui apenas

    // Exibe no console a URL completa que está sendo buscada
    console.log("URL completa para busca da guilda:", url);

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.guild && data.guild.members) {
            const normalizedCharName = charName.toLowerCase().trim();
            return data.guild.members.find(member => 
                member.name.toLowerCase().includes(normalizedCharName)
            );
        }
    } catch (error) {
        console.error("Erro ao buscar informações da guilda:", error);
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
        const clientDescription = info.clientDescription || "Sem descrição";
        console.log(`Nickname: ${clientNickname}`);
        console.log(`Descrição: ${clientDescription}`);
        const clientDatabaseId = parseInt(info.clientDatabaseId, 10);
        if (isNaN(clientDatabaseId)) {
            console.error(`ID do banco de dados inválido: ${info.clientDatabaseId}`);
            return null;
        }
        return { ...info, clientNickname, clientDescription, clientDatabaseId };
    } catch (error) {
        console.error(`Erro ao obter informações do cliente ${clid}:`, error);
        return null;
    }
}

// Função para extrair o Main character da descrição
function extractMainCharacter(description) {
    const match = description.match(/Main:\s*([^\/]+)/);
    return match ? match[1].trim() : null;
}

// Função para extrair os Makers da descrição
function extractMakers(description) {
    const makersMatch = description.match(/Maker:\s*([^\/]+)/);
    return makersMatch 
        ? makersMatch[1].split(/,\s*/).map(maker => maker.trim()) 
        : [];
}

// Função para buscar o ID de um grupo pelo nome
async function getGroupIdByName(groupName) {
    const groups = await teamspeak.serverGroupList();
    const group = groups.find(g => g.name === groupName);
    if (!group) {
        throw new Error(`Grupo com o nome "${groupName}" não encontrado.`);
    }
    return group.sgid;
}

// Função para atualizar os grupos de Makers
async function updateMakerGroup(client) {
    const { clientNickname, clientDescription, clientDatabaseId } = client;

    // Extrai os Makers da descrição do cliente
    const makers = extractMakers(clientDescription);
    if (!makers.length) {
        console.log(`Nenhum Maker encontrado para ${clientNickname}.`);
        return;
    }

    let makerOnline = false;

    // Verifica o status online dos Makers
    for (const maker of makers) {
        const makerStatus = await checkTibiaCharacterInGuild(maker); // Função que verifica o status do personagem

        if (makerStatus && makerStatus.status === 'online') {
            makerOnline = true;
            break; // Para a verificação se encontrar qualquer Maker online
        }
    }

    const group64 = await getGroupIdByName('Maker Online'); // Grupo a ser adicionado se um Maker estiver online
    const group66 = await getGroupIdByName('Maker Offline'); // Grupo a ser adicionado se nenhum Maker estiver online

    try {
        const currentGroups = client.clientServergroups.map(Number);

        if (makerOnline) {
            if (!currentGroups.includes(group64)) {
                await teamspeak.clientAddServerGroup(clientDatabaseId, group64);
                console.log(`${clientNickname} adicionado ao grupo Makers Online`);
            }
            if (currentGroups.includes(group66)) {
                await teamspeak.clientDelServerGroup(clientDatabaseId, group66);
                console.log(`${clientNickname} removido do grupo Makers Offline`);
            }
        } else {
            if (!currentGroups.includes(group66)) {
                await teamspeak.clientAddServerGroup(clientDatabaseId, group66);
                console.log(`${clientNickname} adicionado ao grupo Makers Offline`);
            }
            if (currentGroups.includes(group64)) {
                await teamspeak.clientDelServerGroup(clientDatabaseId, group64);
                console.log(`${clientNickname} removido do grupo Makers Online`);
            }
        }
    } catch (groupError) {
        console.error(`Erro ao atualizar os grupos de Makers para ${clientNickname}:`, groupError);
    }
}

async function manageServerGroups(client) {
    const { clientDatabaseId, clientNickname } = client;
    const currentGroups = client.clientServergroups.map(Number);
    const group207 = 4160;
    const group321 = 4185;

    try {
        if (currentGroups.includes(group207)) {
            // Se o cliente está no grupo 207, remove do grupo 321 se estiver presente
            if (currentGroups.includes(group321)) {
                await teamspeak.clientDelServerGroup(clientDatabaseId, group321);
                console.log(`${clientNickname} removido do grupo ${group321}`);
            }
        } else {
            // Se o cliente não está no grupo 207, adiciona ao grupo 321 se não estiver presente
            if (!currentGroups.includes(group321)) {
                await teamspeak.clientAddServerGroup(clientDatabaseId, group321);
                console.log(`${clientNickname} adicionado ao grupo ${group321}`);
            }
        }
    } catch (error) {
        console.error(`Erro ao gerenciar grupos do servidor para ${clientNickname}:`, error);
    }
}

// Função para processar o cliente, incluindo Main character e Makers
async function processClient(client) {
    if (!client) {
        console.error("Cliente não encontrado.");
        return;
    }

    const { clientNickname, clientDescription, clientDatabaseId } = client;

    if (!clientDescription) {
        console.error("Descrição não encontrada. Não é possível processar o cliente.");
        return;
    }

    console.log(`Processando cliente: ${clientNickname}`);

    // Verificação do Main character
    const characterName = extractMainCharacter(clientDescription);
    if (characterName) {
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
                    if (groupId !== newLevelGroupId && currentGroups.includes(groupId)) {
                        await teamspeak.clientDelServerGroup(clientDatabaseId, groupId);
                        console.log(`${clientNickname} removido do grupo ${group.groupName}`);
                    }
                }

                for (const vocation in VOCATION_GROUPS) {
                    const groupId = await getGroupIdByName(VOCATION_GROUPS[vocation]);
                    if (groupId !== newVocationGroupId && currentGroups.includes(groupId)) {
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

                if (status === 'online' && !currentGroups.includes(onlineGroupId)) {
                    await teamspeak.clientAddServerGroup(clientDatabaseId, onlineGroupId);
                    console.log(`${clientNickname} adicionado ao grupo Online`);
                } else if (status !== 'online' && currentGroups.includes(onlineGroupId)) {
                    await teamspeak.clientDelServerGroup(clientDatabaseId, onlineGroupId);
                    console.log(`${clientNickname} removido do grupo Online`);
                }

                if (status !== 'online' && !currentGroups.includes(offlineGroupId)) {
                    await teamspeak.clientAddServerGroup(clientDatabaseId, offlineGroupId);
                    console.log(`${clientNickname} adicionado ao grupo Offline`);
                } else if (status === 'online' && currentGroups.includes(offlineGroupId)) {
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

       // Chama a nova função para gerenciar os grupos 207 e 321
   await manageServerGroups(client);
    
    // Chama a função separada para processar Makers
    await updateMakerGroup(client);
}

// Evento quando o bot se conecta ao servidor
teamspeak.on('ready', async () => {
    console.log('Bot conectado ao servidor TeaSpeak.');

    // Verifica clientes a cada 40 segundos
    setInterval(async () => {
        try {
            const clients = await teamspeak.clientList();
            console.log('Verificando clientes...');
            for (const client of clients) {
                const clientInfo = await getFullClientInfo(client.clid);
                await processClient(clientInfo);
            }
        } catch (error) {
            console.error('Erro ao verificar clientes:', error);
        }
    }, 40000); // 40 segundos
});

// Evento quando uma mensagem é recebida
teamspeak.on('textmessage', async (msg) => {
    if (msg.targetMode === TextMessageTargetMode.CLIENT) {
        const clid = msg.invoker.clid;
        const message = msg.message;
        await processCommand(message, clid, message);
    }
});

// Evento de erro
teamspeak.on('error', (error) => {
    console.error("Erro no bot:", error);
});