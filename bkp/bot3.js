const { TeamSpeak } = require("ts3-nodejs-library");
const fetch = require('node-fetch');
const fs = require('fs').promises;
require('dotenv').config();

// Inicializa a conexão com o servidor TeaSpeak
const teamspeak = new TeamSpeak({
    host: process.env.TS3_HOST,
    queryport: process.env.TS3_QUERY_PORT,
    serverport: process.env.TS3_PORT,
    username: process.env.TS3_USER,
    password: process.env.TS3_PASSWORD,
    nickname: "Bot"
});

// Função para salvar as regras do maker em um arquivo JSON
async function saveMakerRules(rules) {
    try {
        await fs.writeFile('makers_regras.json', JSON.stringify(rules, null, 2));
        console.log('Regras do maker salvas com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar as regras do maker:', error);
    }
}

// Função para carregar as regras do maker do arquivo JSON
async function loadMakerRules() {
    try {
        const data = await fs.readFile('makers_regras.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Arquivo de regras não encontrado. Criando um novo.');
            return {};
        }
        console.error('Erro ao carregar as regras do maker:', error);
        return {};
    }
}

// Função para processar o comando !setmaker
async function handleSetMaker(message) {
    // Expressão regular para dividir a string, considerando aspas
    const regex = /"([^"]+)"|\S+/g;
    const parts = [];
    let match;

    while ((match = regex.exec(message)) !== null) {
        parts.push(match[1] || match[0]);
    }

    // Verifique se há pelo menos 6 partes para processar o comando
    if (parts.length !== 6) {
        return 'Uso incorrecto. Usa: !setmaker "<Nombre>" <Nivel min-máx> "<Vocación>" <Mundo> <ID de Grupo>';
    }

    // Atribui cada parte a uma variável
    const [, commandName, levelRange, vocation, world, groupId] = parts;

    // Carregar as regras do maker
    const rules = await loadMakerRules();

    // Salvar a nova configuração
    rules[commandName] = {
        levelRange,
        vocation,
        world,
        groupId: parseInt(groupId, 10)
    };

    await saveMakerRules(rules);
    return `Regla de maker '${commandName}' configurada con éxito.`;
}


// Função para processar o comando !viewmaker
async function handleViewMaker(message) {
    const parts = message.split(' ');
    const commandName = parts[1] ? parts.slice(1).join(' ') : null; // Nome da regra, caso seja especificado
    const rules = await loadMakerRules();

    if (!commandName) {
        // Exibe todos os nomes de regras, se não especificar uma regra
        const ruleNames = Object.keys(rules);
        if (ruleNames.length === 0) {
            return 'Ninguna regla de maker configurada.';
        } else {
            return `Regras de makers configuradas:\n- ${ruleNames.join('\n- ')}`;
        }
    } else if (rules[commandName]) {
        // Exibe os detalhes da regra especificada
        const rule = rules[commandName];
        return `Configuração para "${commandName}":
        Level: ${rule.levelRange}
        Vocação: ${rule.vocation}
        World: ${rule.world}
        Grupo ID: ${rule.groupId}`;
    } else {
        return `Nenhuma configuração encontrada para '${commandName}'.`;
    }
}
// Função para processar o comando !clearmaker
async function handleClearMaker(message) {
    const commandName = message.split(' ').slice(1).join(' '); // Nome da regra
    const rules = await loadMakerRules();

    if (rules[commandName]) {
        delete rules[commandName];
        await saveMakerRules(rules);
        return `Regra '${commandName}' removida com sucesso.`;
    } else {
        return `Nenhuma configuração encontrada para '${commandName}'.`;
    }
}
// Função para obter informações detalhadas de um cliente
async function getFullClientInfo(clid) {
    try {
        console.log(`Obtendo informações para cliente com clid: ${clid}`);
        const clientInfo = await teamspeak.clientInfo(clid);
        const info = Array.isArray(clientInfo) ? clientInfo[0] : clientInfo;

        const clientNickname = info.clientNickname || "Nickname não encontrado";
        const clientDescription = info.clientDescription || "Sem descrição";
        
        const clientDatabaseId = parseInt(info.clientDatabaseId, 10);
        if (isNaN(clientDatabaseId)) {
            console.error(`ID do banco de dados inválido: ${info.clientDatabaseId}`);
            return null;
        }

        console.log(`Nickname: ${clientNickname}, Descrição: ${clientDescription}`);
        return { ...info, clientNickname, clientDescription, clientDatabaseId };
    } catch (error) {
        console.error(`Erro ao obter informações do cliente: ${error.message}`);
        return null;
    }
}

// Função para buscar o nível do personagem e atribuir grupo com base no tipo e nível
// Função para verificar o personagem e atribuir grupo com base na configuração de regra
async function verificarPersonagem(clientDescription) {
    const rules = await loadMakerRules();
    let resultado = null;

    for (const [ruleName, rule] of Object.entries(rules)) {
        const worldMatch = clientDescription.match(new RegExp(`${rule.world}:\\s*([^/]+)`));
        if (worldMatch) {
            const personagens = worldMatch[1].split(",").map(nome => nome.trim());
            for (const personagem of personagens) {
                const apiUrl = `https://api.tibiadata.com/v4/character/${encodeURIComponent(personagem)}`;
                try {
                    const response = await fetch(apiUrl);
                    const data = await response.json();
                    const level = data.character?.character?.level;
                    const world = data.character?.character?.world;
                    const vocation = data.character?.character?.vocation;

                    console.log(`Verificando ${rule.world}: ${personagem} (Nível: ${level}, Mundo: ${world}, Vocação: ${vocation})`);

                    const [minLevel, maxLevel] = rule.levelRange.split('-').map(Number);
                    const allowedVocations = rule.vocation.split(',').map(v => v.trim()); // Divide e remove espaços extras
                    
                    if (
                        world === rule.world && 
                        level >= minLevel && level <= maxLevel &&
                        allowedVocations.includes(vocation) // Verifica se a vocação está na lista permitida
                    ) {
                        resultado = { grupo: rule.groupId, nome: personagem };
                        break;
                    }
                } catch (error) {
                    console.error(`Erro ao buscar dados de ${personagem}: ${error.message}`);
                }
            }
            if (resultado) break;
        }
    }

    return resultado;
}


// Função principal para verificar clientes e atribuir grupos
async function verificarClientes() {
    try {
        const clients = await teamspeak.clientList({ clientType: 0 });
        for (const client of clients) {
            const clientInfo = await getFullClientInfo(client.clid);
            if (clientInfo) {
                const resultado = await verificarPersonagem(clientInfo.clientDescription);

                if (resultado) {
                    try {
                        await teamspeak.clientAddServerGroup(clientInfo.clientDatabaseId, resultado.grupo);
                        console.log(`Grupo ${resultado.grupoNome ? resultado.grupoNome : 'Desconhecido'} (ID: ${resultado.grupo}) atribuído a ${clientInfo.clientNickname} (Personagem: ${resultado.nome}).`);
                    } catch (error) {
                        if (!error.message.includes("client is already a member of the group")) {
                            console.error(`Erro ao adicionar grupo: ${error.message}`);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Erro ao verificar clientes: ${error.message}`);
    }
}

// Executa a verificação periodicamente (a cada 1 minuto)
setInterval(verificarClientes, 1 * 60 * 1000);

// Conexão ao servidor e evento de erro
teamspeak.on("ready", () => {
    console.log("Conectado ao servidor TeaSpeak!");
    verificarClientes(); // Verificação inicial
});

teamspeak.on("error", (error) => {
    console.error(`Erro: ${error.message}`);
});

// Evento de mensagem de texto
teamspeak.on("textmessage", async (ev) => {
    if (ev.msg.startsWith('!setmaker')) {
        const response = await handleSetMaker(ev.msg);
        teamspeak.sendTextMessage(ev.invoker.clid, 1, response);
    } else if (ev.msg.startsWith('!viewmaker')) {
        const response = await handleViewMaker(ev.msg);
        teamspeak.sendTextMessage(ev.invoker.clid, 1, response);
    } else if (ev.msg.startsWith('!clearmaker')) {
        const response = await handleClearMaker(ev.msg);
        teamspeak.sendTextMessage(ev.invoker.clid, 1, response);
    }
});

console.log("Bot iniciado. Aguardando conexão...");