const { TeamSpeak } = require("ts3-nodejs-library");
const axios = require("axios");
const fs = require('fs').promises;
const path = require('path');


// Conectar ao servidor TS3
const ts3 = new TeamSpeak({
    host: "69.62.98.88",        // IP do servidor TS3
    queryport: 10101,             // Porta do query
    serverport: 9987,             // Porta do servidor TS3
    username: "serveradmin",      // Usuário query
    password: "yJW5xsLCwRAz",     // Senha query
    nickname: "RBot"       // Nome do bot
});

//// permissoes ////

const adminGroupID = 2;
const masteradminGroupID = 1;
const serveradminGroupID = 3;
const mpoke =  65;
const mmove = 66;
const botadm = 64;

//////// canais /////////
const canalAFK = 76;
const canalResp = 77;
const canalGuildAliada = 22;
const canalMakerAliado = 42;
const canalEnemy = 83;
const canalAliadoAdicional = 41;
const canalMakerInimigo = 44;
const canalHuntedIndividual = 42;
///////// configs //////////
const guildAliada = 'New Corporation';
const mundo = 'Issobra';





let afkTime = 15; // Tempo padrão em minutos (pode ser modificado pelo comando !tempoafk)

// Função para obter informações completas do cliente
async function getFullClientInfo(clid) {
    try {
        const clientInfo = await ts3.clientInfo(clid);
        const info = Array.isArray(clientInfo) ? clientInfo[0] : clientInfo;

        const clientNickname = info.clientNickname || "Nickname não encontrado";
        const clientDescription = info.clientDescription || "Sem descrição";
        const clientChannelId = parseInt(info.cid, 10); // Canal atual do cliente
        const clientOutputMuted = info.clientOutputMuted; // Mudo de saída
        const clientIdleTime = info.clientIdleTime; // Tempo de inatividade em ms

        // ID do canal AFK
        const afkChannelId = canalAFK;

        console.log(`Cliente: ${clientNickname}, Mudo: ${clientOutputMuted}, IdleTime: ${clientIdleTime}`);

        // Verifica se o cliente está AFK ou com os alto-falantes desativados pelo tempo configurado
        if (clientOutputMuted && clientIdleTime >= afkTime * 60000) {
            // Move para o canal AFK
            console.log(`${clientNickname} será movido para o canal AFK após estar inativo por mais de ${afkTime} minutos.`);
            await ts3.clientMove(clid, afkChannelId);
        } else {
            console.log(`${clientNickname} não está AFK nem com saída de áudio desativada por tempo suficiente.`);
        }

        return info;
    } catch (error) {
        console.error(`Erro ao obter informações do cliente ${clid}:`, error);
        return null;
    }
}

// Função para mover o cliente para o canal AFK se ele estiver com o alto-falante mutado e inativo
async function checkAndMoveAfkClients() {
    try {
        const clients = await ts3.clientList({ clientType: 0 }); // Obter todos os clientes conectados

        for (const client of clients) {
            await getFullClientInfo(client.clid);
        }
    } catch (error) {
        console.error("Erro ao verificar e mover clientes AFK:", error);
    }
}

// Função para iniciar a verificação em intervalos
function startAfkCheck(intervalMs = 60000) { // Verificação a cada 1 minuto
    setInterval(() => {
        checkAndMoveAfkClients();
    }, intervalMs);
}

// Função para lidar com o comando !tempoafk
async function handleAfkCommand(msg, invoker) {
    const args = msg.split(" ");
    const invokerID = invoker.clid;

    try {
        // Obter informações completas do invoker (quem enviou o comando)
        const clientInfo = await ts3.getClientById(invokerID);
        if (!clientInfo) {
            throw new Error("Informações do cliente não encontradas.");
        }

        // Verificar se o invoker está no grupo admin ou dev
        const clientServerGroups = clientInfo.servergroups || [];
        if (![adminGroupID, devGroupID, botadm].some(group => clientServerGroups.includes(group.toString()))) {
            ts3.sendTextMessage(invokerID, 1, "Você não tem permissão para usar este comando.");
            return;
        }

        // Se o comando for !tempoafk sem argumento, mostrar o tempo atual
        if (args.length === 1) {
            ts3.sendTextMessage(invokerID, 1, `O tempo AFK do servidor está setado em ${afkTime} minutos. Para modificar, digite !tempoafk <minutos>.`);
        } else {
            // Modificar o tempo AFK se um valor for especificado
            const newAfkTime = parseInt(args[1], 10);
            if (isNaN(newAfkTime) || newAfkTime <= 0) {
                ts3.sendTextMessage(invokerID, 1, "Por favor, forneça um valor válido de minutos para o tempo AFK.");
            } else {
                afkTime = newAfkTime;
                ts3.sendTextMessage(invokerID, 1, `O tempo AFK do servidor foi alterado para ${afkTime} minutos.`);
            }
        }
    } catch (error) {
        console.error("Erro ao lidar com o comando !tempoafk:", error);
    }
}

// Ouvir o comando !tempoafk
ts3.on("textmessage", async (event) => {
    const { msg, invoker } = event;

    if (msg.startsWith("!tempoafk")) {
        await handleAfkCommand(msg, invoker);
    }
});

// Iniciar a verificação de AFK a cada minuto
startAfkCheck();

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////     MENSAGEM LEVEL UP    ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let playerLevels = {};

// Função para verificar os jogadores da guilda
async function checkGuildMembers() {
  try {
    // Pega a lista de membros da guilda
    const guildResponse = await axios.get(`https://api.tibiadata.com/v4/guild/${guildAliada}`);
    const guildMembers = guildResponse.data.guild.members;

    // Pega a lista de jogadores online no mundo Inabra
    const worldResponse = await axios.get(`https://api.tibiadata.com/v4/world/${mundo}`);
    const onlinePlayers = worldResponse.data.world.online_players;

    // Filtra os jogadores da guilda que estão online no mundo
    const onlineGuildMembers = guildMembers.filter(member =>
      onlinePlayers.some(player => player.name === member.name)
    );

    // Verifica se houve mudança de nível
    for (const member of onlineGuildMembers) {
      const player = onlinePlayers.find(p => p.name === member.name);
      const currentLevel = player.level;

      if (!playerLevels[member.name]) {
        playerLevels[member.name] = currentLevel; // Inicializa o nível
      } else if (currentLevel > playerLevels[member.name]) {
        const oldLevel = playerLevels[member.name];
        playerLevels[member.name] = currentLevel;

        // Envia mensagem ao chat geral no TS3 para subida de level
        sendLevelMessage(member.name, oldLevel, currentLevel, 'up');
      } else if (currentLevel < playerLevels[member.name]) {
        const oldLevel = playerLevels[member.name];
        playerLevels[member.name] = currentLevel;

        // Envia mensagem ao chat geral no TS3 para perda de level (vermelho)
        sendLevelMessage(member.name, oldLevel, currentLevel, 'down');
      }
    }
  } catch (error) {
    console.error("Erro ao verificar guilda:", error);
  }
}

// Função para enviar mensagem no chat geral do TS3
function sendLevelMessage(playerName, oldLevel, newLevel, action) {
  const color = action === 'up' ? 'green' : 'red'; // Verde para "up", Vermelho para "down"
  const message = action === 'up' 
    ? `[AMIGO UPLVL] ${playerName} ${oldLevel} > ${newLevel}!` 
    : `[AMIGO MUERTE] ${playerName} ${oldLevel} > ${newLevel}!`;

  ts3.sendTextMessage(1, 3, `[B][color=${color}]${message}[/color][/B]`)
    .then(() => {
      console.log(`Mensagem enviada: ${message}`);
    })
    .catch(err => {
      console.error("Erro ao enviar mensagem:", err);
    });
}
ts3.on("ready", () => {
    console.log("Bot conectado ao TS3!");
  // Checar membros da guilda a cada 60 segundos
  setInterval(checkGuildMembers, 60000);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   MENSAGEM BOAS VINDAS  ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Enviar mensagem de boas-vindas para qualquer cliente que se conectar
ts3.on("clientconnect", async (event) => {
    try {
        const welcomeMessages = [
            `[color=green][b]Estamos na fase *BETA*, e contamos com a sua ajuda para melhorar o serviço![/color]`,
            `[color=red][b]Seja bem-vindo![/color]`,
            `Para Claimar ou ficar de Next um respaw use: [b]!resp Codigo[/b] (Exemplo !resp C5)`,
            `Para mais comandos leia o canal [b]✖ Comandos de Respawn ✖[/b]`,
        ];

        // Enviar cada mensagem com um pequeno intervalo
        for (const message of welcomeMessages) {
            await ts3.sendTextMessage(event.client.clid, 1, message);
            console.log(`Enviou mensagem de boas-vindas: ${message}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Aguardar 1 segundo entre as mensagens
        }
    } catch (error) {
        console.error("Erro ao enviar mensagem de boas-vindas:", error);
    }
});

// Evento de mensagem no TeamSpeak
ts3.on("textmessage", async (event) => {
    const message = event.msg.trim();
    
    if (message.startsWith("!cloot")) {
        try {
            const lootData = message.replace("!cloot", "").trim(); // Dados fornecidos após o comando
            const { totalBalance, balancePerPerson, people, transactions } = processLootData(lootData);
            
            let responseMessage = `Profit Total: ${formatNumber(totalBalance)} gp\n`;
            responseMessage += `Players na PT: ${people.size}\n`;
            responseMessage += `Balance por char: ${formatNumber(balancePerPerson)} gp\n`;
            transactions.forEach(({ from, to, amount }) => {
                responseMessage += `${from} deve pagar ${formatNumber(amount)} gp para ${to}\n`;
            });

            // Enviar a mensagem com os resultados para o invocador
            await ts3.sendTextMessage(event.invoker.clid, 1, responseMessage);
            console.log(`Comando !cloot usado por ${event.invoker.clid}`);

        } catch (error) {
            console.error("Erro ao processar dados de loot:", error);
            await ts3.sendTextMessage(event.invoker.clid, 1, "Erro ao processar os dados de loot. Verifique o formato da entrada.");
        }
    }
});

// Função para processar os dados de loot usando seu script
function processLootData(data) {
    const totalBalance = parseNumber(data.match(/Balance:? (?<balance>[\d,-]+)/).groups.balance);
    const people = new Map();
    const matches = data.matchAll(/(?<name>[-a-zA-Z' \(\)]+)\n\s+Loot:? [\d,-]+\n\s+Supplies:? [\d,-]+\n\s+Balance:? (?<balance>[\d,-]+)/g);
    
    for (const match of matches) {
        const name = match.groups.name.replace(" (Leader)", "");
        const balance = parseNumber(match.groups.balance);
        people.set(name, balance);
    }
    
    const balancePerPerson = Math.floor(totalBalance / people.size);
    const transactions = calculateTransactions({ people, balancePerPerson });
    
    return { totalBalance, balancePerPerson, people, transactions };
}

function calculateTransactions({ people, balancePerPerson }) {
    const givers = [];
    const receivers = [];
  
    for (const [name, balance] of people) {
        const amount = Math.abs(balance - balancePerPerson);
        if (balance > balancePerPerson) {
            givers.push({ name, amount });
        } else if (balance < balancePerPerson) {
            receivers.push({ name, amount });
        }
    }
  
    const transactions = [];
  
    for (const giver of givers) {
        for (const receiver of receivers) {
            if (giver.amount >= receiver.amount) {
                transactions.push({ from: giver.name, to: receiver.name, amount: receiver.amount });
                giver.amount -= receiver.amount;
                receivers.splice(receivers.indexOf(receiver), 1);
            } else {
                transactions.push({ from: giver.name, to: receiver.name, amount: giver.amount });
                receiver.amount -= giver.amount;
                givers.splice(givers.indexOf(giver), 1);
                break;
            }
        }
    }
  
    return transactions;
}

function parseNumber(text) {
    return Number(text.replace(/,/g, ""));
}

function formatNumber(number) {
    return new Intl.NumberFormat("en").format(number);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////      COMANDO !DESC     ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    ts3.on("textmessage", async (event) => {
        const message = event.msg.trim();
        
        if (message === "!desc") {
            try {
                // Enviar mensagem com o link para criar descrição
                await ts3.sendTextMessage(
                    event.invoker.clid, // ID do cliente invocador
                    1, // Modo 1 significa CLIENT (mensagem privada)
                    "[URL=https://descricao.tobot.shop/]Haz clic aquí para crear tu descripción.[/URL]"
                );
                console.log(`Comando !desc usado por ${event.invoker.clid}`);
            } catch (error) {
                console.error("Erro ao enviar mensagem de descrição:", error);
            }
        }
    });
    
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////           SCAN          ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Escutar mensagens de texto privadas (comando !scan)
    ts3.on("textmessage", async (event) => {
        const message = event.msg.trim();
    
       // Verificar se a mensagem começa com "!scan"
    if (message.startsWith("!scan")) {
        try {
            const invokerClientId = event.invoker.clid;
            const clientInfo = await ts3.getClientById(invokerClientId);
    
            if (!clientInfo) {
                throw new Error("Informações do cliente não encontradas.");
            }
    
            // Verificar se o usuário pertence ao grupo com permissão (ID 9)
            const clientServerGroups = clientInfo.servergroups || [];
            if (![adminGroupID, modGroupID, devGroupID, botadm].some(group => clientServerGroups.includes(group.toString()))) {
                ts3.sendTextMessage(event.invoker.clid, 1, "Você não tem permissão para usar este comando.");
                console.log(`Tentativa de uso não autorizado do comando !scan por ${event.invoker.nickname}`);
                return;
            }
    
            // Obter o nome do personagem após o comando "!scan"
            const characterName = message.slice(6).trim();
    
            if (!characterName) {
                ts3.sendTextMessage(event.invoker.clid, 1, "Por favor, forneça um nome de personagem para escanear.");
                return;
            }
    
            // Codificar o nome do personagem para uso em URL
            const encodedName = encodeURIComponent(characterName);
    
            // URL da API com o nome do personagem
            const apiUrl = `https://api.tibiastalker.pl/api/tibia-stalker/v1/characters/${encodedName}`;
    
            // Fazer requisição para a API TibiaStalker
            try {
                const response = await axios.get(apiUrl);
                const characterData = response.data;
    
                // Montar a resposta formatada
                let replyMessage = `[b][color=#7cac0e]Personagem:[/color][/b] ${characterData.name}\n`
                    + `[b][color=#7cac0e]Mundo:[/color][/b] ${characterData.world}\n`
                    + `[b][color=#7cac0e]Vocação:[/color][/b] ${characterData.vocation}\n`
                    + `[b][color=#7cac0e]Level:[/color][/b] ${characterData.level}\n`
                    + `[b][color=#7cac0e]Último login:[/color][/b] ${new Date(characterData.lastLogin).toLocaleString()}`;
    
                // Exibir personagens visíveis
                if (characterData.otherVisibleCharacters.length > 0) {
                    replyMessage += `\n[b][color=#7cac0e]Outros personagens visíveis:[/color][/b] ${characterData.otherVisibleCharacters.join(", ")}`;
                }
    
                // Exibir possíveis personagens invisíveis, exceto "Teste"
                if (characterData.possibleInvisibleCharacters.length > 0) {
                    replyMessage += `\n[b][color=#7cac0e]Possíveis personagens:[/color][/b]\n`;
                    
                    characterData.possibleInvisibleCharacters
                        .filter(char => char.otherCharacterName.toLowerCase() !== "Teste".toLowerCase())
                        .forEach(char => {
                            let color = char.numberOfMatches > 50 ? '#00FF00' : '#FF0000'; // Verde para mais pontos, vermelho para menos
                            replyMessage += `[color=${color}]${char.otherCharacterName.charAt(0).toUpperCase() + char.otherCharacterName.slice(1)}[/color] [b]Pontos:[/b] ${char.numberOfMatches}\n`;
                        });
    
                    // Debug: log da lista filtrada
                    console.log('Lista filtrada de personagens invisíveis:', characterData.possibleInvisibleCharacters);
                }
    
                // Enviar a resposta no privado para o invoker
                ts3.sendTextMessage(event.invoker.clid, 1, replyMessage);
            } catch (apiError) {
                console.error("Erro ao acessar a API TibiaStalker:", apiError);
                ts3.sendTextMessage(event.invoker.clid, 1, "Erro ao buscar informações do personagem.");
            }
        } catch (error) {
            console.error("Erro ao verificar permissões ou processar o comando:", error);
        }
    }
    
    });

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////        MASSPOKE        ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

ts3.on("textmessage", async (event) => {
    const message = event.msg.trim();
    if (message.startsWith("!mp")) {
        try {
            // Obter informações completas do invoker (quem enviou o comando)
            const invokerClientId = event.invoker.clid;

            // Obter o cliente completo por ID
            const clientInfo = await ts3.getClientById(invokerClientId);

            if (!clientInfo) {
                throw new Error("Información del cliente no encontrada.");
            }

            // Verificar se o invoker está no grupo de admin (Group ID 9)
            const clientServerGroups = clientInfo.servergroups || [];

            if ([adminGroupID, serveradminGroupID, masteradminGroupID, botadm, mpoke].some(group => clientServerGroups.includes(group.toString()))) {

                // Extrair a mensagem do comando
                const pokeMessage = message.slice(4).trim();
                
                if (pokeMessage) {
                    try {
                        // Obter todos os clientes conectados
                        const clients = await ts3.clientList({ clientType: 0 });

                        // Criar o link clicável para o invoker (quem enviou a mensagem)
                        const encodedNickname = encodeURIComponent(event.invoker.nickname); // Encode especial characters
                        const invokerUrl = `[URL=client://${event.invoker.clid}/${event.invoker.uniqueIdentifier}~${encodedNickname}]${event.invoker.nickname}[/URL]`;

                        // Adicionar o nickname do invoker no início da mensagem com o link
                        const messagePrefix = `[color=blue][b]${invokerUrl}:[/b][/color]`;

                        // Enviar masspoke para cada cliente
                        clients.forEach(client => {
                            const messageToSend = `${messagePrefix} ${pokeMessage}`;
                            ts3.clientPoke(client.clid, messageToSend);
                        });

                        // Enviar mensagem de confirmação para quem enviou o comando
                        ts3.sendTextMessage(event.invoker.clid, 1, `Masspoke enviado: "${pokeMessage}"`);
                    } catch (error) {
                        console.error("Erro ao enviar masspoke:", error);
                        ts3.sendTextMessage(event.invoker.clid, 1, "Erro ao enviar masspoke.");
                    }
                } else {
                    ts3.sendTextMessage(event.invoker.clid, 1, "Por favor, forneça uma mensagem para o masspoke.");
                }
            } else {
                // Se o usuário não tiver permissão
                ts3.sendTextMessage(event.invoker.clid, 1, "Você não tem permissão para usar este comando.");
                console.log(`Tentativa de uso não autorizado do comando !mp por ${event.invoker.nickname}`);
            }
        } catch (error) {
            console.error("Erro ao verificar permissões:", error);
        }
    }
});
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////       AFK CLIENT       ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para obter a lista completa de clientes conectados
async function getAllClients() {
    try {
        return await ts3.clientList({ clientType: 0 }); // 0 é para obter todos os clientes
    } catch (error) {
        console.error("Erro ao obter lista de clientes:", error);
        return [];
    }
  }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////       RESPAWN LIST     ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let activeRespawns = {}; 
let respawnData = {}; // Para armazenar os dados do respawn.json

// Constantes de IDs de grupos
const tresmakers = 217;
const makerduzentos = 218;
const makerquebra = 219;
const newmember = 220;
const respblockGroupID = 84;

const defaultRespawnTime = 150; // 02:30

// Tempos de respawn personalizados por grupo
let baseRespawnTimes = {};
let bonusRespawnTimes = {};

const extraRespawnTimes = {};
let clientRespawnCount = {}; // Para armazenar o número de respawns por cliente

// Variável e constantes para controle do bloqueio após !respdel
let respdelUsers = {}; // Armazena: { client.clid: timestamp_do_fim_do_bloqueio }
const bloqueioDuracaoMs = 10 * 60 * 1000; // 10 minutos em milissegundos

// Função de formatação hora/minuto
function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    // Usa padStart para garantir 2 dígitos
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

async function loadGroupRespawnTimes() {
    const filePath = path.join(__dirname, 'group_respawn_times.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const groups = JSON.parse(data);
        
        baseRespawnTimes = {};
        bonusRespawnTimes = {};
        
        groups.forEach(group => {
            if (group.is_bonus) {
                bonusRespawnTimes[group.group_id] = group.respawn_time;
            } else {
                baseRespawnTimes[group.group_id] = group.respawn_time;
            }
        });
        
    } catch (error) {
        console.error("Erro ao carregar tempos de respawn:", error);
    }
}

// Função para salvar a fila de respawns em um arquivo JSON
async function saveRespawnsToFile() {
    const filePath = path.join(__dirname, 'fila_respawn.json');
    try {
        await fs.writeFile(filePath, JSON.stringify(activeRespawns, null, 2), 'utf8');
    } catch (error) {
        console.error("Erro ao salvar a fila de respawns:", error);
    }
}

// Função para carregar a fila de respawns do arquivo JSON
async function loadRespawnsFromFile() {
    const filePath = path.join(__dirname, 'fila_respawn.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
        activeRespawns = JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar a fila de respawns:", error);
        activeRespawns = {}; // Inicializa como vazio se o arquivo não existir
    }
}

// Função para carregar o arquivo respawn.json
async function loadRespawnData() {
    const filePath = path.join(__dirname, 'respawns.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
        const rawData = JSON.parse(data);
        respawnData = {};
        for (const city in rawData) {
            respawnData[city] = {};
            for (const key in rawData[city]) {
                // Use trim() e toUpperCase() para garantir normalização
                const upperKey = key.trim().toUpperCase();
                respawnData[city][upperKey] = rawData[city][key];
            }
        }
        
    } catch (error) {
        console.error("Erro ao carregar os dados de respawn:", error);
        respawnData = {};
    }
}

// Função para carregar o arquivo respdel.json (bloqueios)
async function loadRespdelData() {
    const filePath = path.join(__dirname, 'respdel.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
        respdelUsers = JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar respdel.json:", error);
        respdelUsers = {};
    }
}

// Função para salvar o arquivo respdel.json (bloqueios)
async function saveRespdelData() {
    const filePath = path.join(__dirname, 'respdel.json');
    try {
        await fs.writeFile(filePath, JSON.stringify(respdelUsers, null, 2), 'utf8');
    } catch (error) {
        console.error("Erro ao salvar respdel.json:", error);
    }
}

// Função para verificar se o respawn é válido com base no respawn.json
function isValidRespawn(respawnNumber) {
    // Remove espaços e coloca em maiúsculas
    respawnNumber = respawnNumber.trim().toUpperCase();
    for (const city in respawnData) {
        if (respawnData[city].hasOwnProperty(respawnNumber)) {
            return true;
        }
    }
    return false;
}

// Função para verificar se o usuário está online
async function isUserOnline(clientUniqueIdentifier) {
    try {
        const clients = await ts3.clientList(); // Obtém a lista de clientes conectados no TS3
        return clients.some(client => client.uniqueIdentifier === clientUniqueIdentifier);
    } catch (error) {
        console.error("Erro ao verificar se o usuário está online:", error);
        return false;
    }
}

// Função para formatar o nome do usuário com base no status online/offline
async function formatClientName(nickname, uniqueIdentifier, clid) {
    const encodedNickname = nickname
        .replace(/\\/g, '%5C')
        .replace(/\[/g, '%5C%5B')
        .replace(/\]/g, '%5C%5D')
        .replace(/ /g, '%20');
    return `[URL=client://${clid}/${uniqueIdentifier}~${encodedNickname}]${nickname}[/URL]`;
}

async function updateRespawnChannel() {
    let description = "[b]Respawns Ativos:[/b]\n\n";
    description += "[table][tr][th]Respawn[/th][th]Ocupado por[/th][th]Tempo restante[/th][th]Fila[/th][/tr]";

    for (const respawnNumber in activeRespawns) {
        const respawn = activeRespawns[respawnNumber];
        const cityName = getRespawnName(respawnNumber);

        const clientInfo = await getFullClientInfo(respawn.current.clid);
        const formattedName = await formatClientName(clientInfo.clientNickname, clientInfo.clientUniqueIdentifier, clientInfo.clid);

        description += `[tr][td]${respawnNumber} (${cityName})[/td]`;
        description += `[td]${formattedName}[/td]`;
        
        if (respawn.waitingForAccept) {
            description += `[td]Aguardando aceitação (${respawn.acceptanceTime}m[/td]`;
        } else {
            const remaining = respawn.time;
            const total = respawn.maxTime;
            description += `[td][color=red]${formatTime(remaining)}m[/color] / [color=green]${formatTime(total)}h[/color][/td]`;
        }

        if (respawn.queue.length > 0) {
            const nextClient = respawn.queue[0];
            const nextClientInfo = await getFullClientInfo(nextClient.clid);
            const formattedNextClient = await formatClientName(nextClientInfo.clientNickname, nextClientInfo.clientUniqueIdentifier, nextClientInfo.clid);
            description += `[td]${formattedNextClient} (+${respawn.queue.length - 1})[/td][/tr]`;
        } else {
            description += "[td]Sem Fila[/td][/tr]";
        }
    }

    description += "[/table]";

    try {
        await ts3.channelEdit(canalResp, { channel_description: description });
    } catch (error) {
        console.error("Erro ao atualizar o canal 31:", error);
    }
}

// Função para obter o nome do respawn com base no número
function getRespawnName(respawnNumber) {
    for (const city in respawnData) {
        if (respawnData[city][respawnNumber]) {
            return respawnData[city][respawnNumber];
        }
    }
    return "Desconhecido";
}

// Função para iniciar o temporizador do respawn
async function startRespawnTimer(respawnNumber) {
    const respawn = activeRespawns[respawnNumber];
    respawn.time = respawn.maxTime; 
    const intervalId = setInterval(async () => {
        if (!isRespawnPaused) {
            if (respawn.waitingForAccept) {
                respawn.acceptanceTime--;
                if (respawn.acceptanceTime <= 0) {
                    const removedPlayer = respawn.current;
                    if (respawn.queue.length > 0) {
                        const nextClient = respawn.queue.shift();
                        respawn.current = nextClient;
                        respawn.waitingForAccept = true;
                        respawn.acceptanceTime = 15; // 15 minutos para aceitar
                        await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.");
                    } else {
                        delete activeRespawns[respawnNumber];
                        clearInterval(intervalId);
                    }
                    await ts3.sendTextMessage(removedPlayer.clid, 1, "Você foi removido do respawn por não aceitar a tempo.");
                }
            } else {
                respawn.time--;
                if (respawn.time <= 0) {
                    if (respawn.queue.length > 0) {
                        const nextClient = respawn.queue.shift();
                        respawn.current = nextClient;
                        respawn.waitingForAccept = true;
                        respawn.acceptanceTime = 15;
                        await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.");
                    } else {
                        delete activeRespawns[respawnNumber];
                        clearInterval(intervalId);
                    }
                }
            }
            await updateRespawnChannel();
        }
    }, 60000);
    respawn.intervalId = intervalId;
}

let isRespawnPaused = false;

// Função para verificar se o usuário está no grupo respblock (ID 666)
function isInRespblockGroup(clientInfo) {
    const clientServerGroups = clientInfo.servergroups || [];
    return clientServerGroups.includes(respblockGroupID.toString());
}

async function hasGuildBankPermission(clientInfo) {
    const clientServerGroups = clientInfo.servergroups || [];
    // Se o usuário estiver no grupo respblock, não pode usar o comando
    return !clientServerGroups.includes(respblockGroupID.toString());
}

// Função para adicionar tempo extra a um grupo específico
async function handleAddExtraTimeCommand(client, groupId, extraTime) {
    const clientInfo = await ts3.getClientById(client.clid);
    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }
    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !addextratime.");
        return;
    }
    const groupIdNumber = parseInt(groupId);
    const extraTimeMinutes = parseInt(extraTime);
    if (isNaN(groupIdNumber) || isNaN(extraTimeMinutes)) {
        await ts3.sendTextMessage(client.clid, 1, "Por favor, forneça um ID de grupo e um tempo extra válidos.");
        return;
    }
    extraRespawnTimes[groupIdNumber] = extraTimeMinutes;
    await ts3.sendTextMessage(client.clid, 1, `Tempo extra de ${extraTimeMinutes} minutos adicionado ao grupo ${groupIdNumber}.`);
}

// Função para obter o tempo de respawn com base no grupo do usuário (usada se não for customizado)
async function getRespawnTimePorGrupo(clientInfo) {
    const clientServerGroups = clientInfo.servergroups || [];
    let baseTime = defaultRespawnTime;
    let bonusTime = 0;
    let extraTime = 0;
    // Encontra o maior tempo base
    for (const groupId in baseRespawnTimes) {
        if (clientServerGroups.includes(groupId.toString())) {
            const time = baseRespawnTimes[groupId];
            if (time > baseTime) baseTime = time;
        }
    }
    // Soma os bônus fixos
    for (const groupId in bonusRespawnTimes) {
        if (clientServerGroups.includes(groupId.toString())) {
            bonusTime += bonusRespawnTimes[groupId];
        }
    }
    // Soma extras temporários
    for (const groupId in extraRespawnTimes) {
        if (clientServerGroups.includes(groupId.toString())) {
            extraTime += extraRespawnTimes[groupId];
        }
    }
    return baseTime + bonusTime + extraTime;
}

async function handleRespCommand(client, commandBody) {
    // Verifica se o usuário está bloqueado por ter usado !respdel recentemente
    const agora = Date.now();
    if (respdelUsers[client.clid]) {
        const bloqueioFinal = respdelUsers[client.clid];
        if (agora < bloqueioFinal) {
            const restanteMs = bloqueioFinal - agora;
            const minutos = Math.floor(restanteMs / 60000);
            const segundos = Math.floor((restanteMs % 60000) / 1000);
            await ts3.sendTextMessage(client.clid, 1, 
              `Você está proibido de usar o comando !resp por mais ${minutos} minutos e ${segundos} segundos.`);
            return;
        } else {
            // Bloqueio expirou, remove o usuário da lista
            delete respdelUsers[client.clid];
            await saveRespdelData();
        }
    }

    // Exemplo de commandBody: "A1, 00:30" ou "A1"
    let parts = commandBody.split(',');
    let respawnNumber = parts[0].trim().toUpperCase();
    let customTime = null;
    if (parts.length > 1) {
        customTime = parts[1].trim();
    }

    const clientInfo = await ts3.getClientById(client.clid);
    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    // Bloqueia se o usuário estiver no grupo respblock (ID 666)
    if (isInRespblockGroup(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "Você está proibido de usar comandos !resp.");
        return;
    }

    if (!isValidRespawn(respawnNumber)) {
        await ts3.sendTextMessage(client.clid, 1, `O respawn número ${respawnNumber} não é válido.`);
        return;
    }

    // Verifica limites de respawn por cliente
    if (!clientRespawnCount[client.clid]) {
        clientRespawnCount[client.clid] = { current: 0, daily: 0, lastReset: new Date() };
    }
    const now = new Date();
    if (now.getDate() !== clientRespawnCount[client.clid].lastReset.getDate()) {
        clientRespawnCount[client.clid].daily = 0;
        clientRespawnCount[client.clid].lastReset = now;
    }
    const clientServerGroups = clientInfo.servergroups || [];
    const isExempt = clientServerGroups.includes(serveradminGroupID.toString()) ||
                     clientServerGroups.includes(masteradminGroupID.toString());

    if (!isExempt) {
        if (clientRespawnCount[client.clid].current >= 99999) {
            await ts3.sendTextMessage(client.clid, 1, "Você já atingiu o limite de 2 respawns simultâneos.");
            return;
        }
        if (clientRespawnCount[client.clid].daily >= 99999) {
            await ts3.sendTextMessage(client.clid, 1, "Você já atingiu o limite de 3 respawns por dia.");
            return;
        }
    }

    const clientData = {
        clid: client.clid,
        clientNickname: client.nickname
    };

    // Verifica se o cliente já está no respawn ou na fila
    if (activeRespawns[respawnNumber] && 
        (activeRespawns[respawnNumber].current.clid === client.clid || 
         activeRespawns[respawnNumber].queue.some(user => user.clid === client.clid))) {
        await ts3.sendTextMessage(client.clid, 1, "Você já está neste respawn ou na sua fila.");
        return;
    }

    const activeRespawnCount = Object.values(activeRespawns).filter(respawn =>
        respawn.current.clid === client.clid ||
        respawn.queue.some(user => user.clid === client.clid)
    ).length;
    if (!isExempt && activeRespawnCount >= 2) {
        await ts3.sendTextMessage(client.clid, 1, "Você já está em 2 respawns. Use !respdel para sair de um deles antes de entrar em outro.");
        return;
    }

    let respawnTime;
    if (customTime) {
        // Espera o formato HH:MM
        const timeParts = customTime.split(':');
        if (timeParts.length !== 2) {
            await ts3.sendTextMessage(client.clid, 1, "Formato de tempo inválido. Use HH:MM.");
            return;
        }
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        if (isNaN(hours) || isNaN(minutes)) {
            await ts3.sendTextMessage(client.clid, 1, "Tempo inválido. Use números no formato HH:MM.");
            return;
        }
        respawnTime = hours * 60 + minutes;
        if (respawnTime > 210) {
            await ts3.sendTextMessage(client.clid, 1, "O tempo máximo permitido é 3:30.");
            return;
        }
    } else {
        // Se não for customizado, calcula com base nos grupos
        respawnTime = await getRespawnTimePorGrupo(clientInfo);
    }

    if (!activeRespawns[respawnNumber]) {
        activeRespawns[respawnNumber] = { 
            current: clientData, 
            queue: [], 
            time: 0, // Contador inicia em 0
            maxTime: respawnTime, // Tempo máximo definido (customizado ou via grupos)
            waitingForAccept: false
        };
        startRespawnTimer(respawnNumber);
        const respawnName = getRespawnName(respawnNumber);
        await ts3.sendTextMessage(client.clid, 1, `[color=green]Respawn [${respawnNumber}] ${respawnName} iniciado. Tempo máximo de hunt: ${formatTime(respawnTime)}[/color]`);
        if (!isExempt) {
            clientRespawnCount[client.clid].current++;
            clientRespawnCount[client.clid].daily++;
        }
    } else {
        activeRespawns[respawnNumber].queue.push(clientData);
        const respawnName = getRespawnName(respawnNumber);
        await ts3.sendTextMessage(client.clid, 1, `[color=blue]Você entrou na fila do respawn ${respawnName} número ${respawnNumber}. Aguarde sua vez.[/color]`);
    }

    await saveRespawnsToFile();
    await updateRespawnChannel();
}

async function handleRespDelCommand(client, respawnNumber) {
    respawnNumber = respawnNumber.toUpperCase(); 
    const clientInfo = await ts3.getClientById(client.clid);
    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }
    if (!await hasGuildBankPermission(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respdel.");
        return;
    }
    const respawn = activeRespawns[respawnNumber];
    if (!respawn) {
        await ts3.sendTextMessage(client.clid, 1, "Respawn no encontrado.");
        return;
    }
    if (respawn.current && respawn.current.clid === client.clid) {
        if (respawn.queue.length > 0) {
            const nextClient = respawn.queue.shift();
            respawn.current = nextClient;
            respawn.waitingForAccept = true;
            respawn.acceptanceTime = 15;
            await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.");
        } else {
            delete activeRespawns[respawnNumber];
        }
        if (clientRespawnCount[client.clid]) {
            clientRespawnCount[client.clid].current--;
        }
        await ts3.sendTextMessage(client.clid, 1, `[color=red]Você saiu do respawn ${respawnNumber}.[/color]`);
    } else {
        const index = respawn.queue.findIndex(user => user.clid === client.clid);
        if (index !== -1) {
            respawn.queue.splice(index, 1);
            await ts3.sendTextMessage(client.clid, 1, `Você foi removido da fila do respawn ${respawnNumber}.`);
        } else {
            await ts3.sendTextMessage(client.clid, 1, "Você não está neste respawn ou na fila.");
        }
    }
    // Registra o bloqueio de 10 minutos para o usuário após usar !respdel
    respdelUsers[client.clid] = Date.now() + bloqueioDuracaoMs;
    await saveRespdelData();

    await saveRespawnsToFile();
    await updateRespawnChannel();
}

async function isMasterAdm(clientInfo) {
    const clientServerGroups = clientInfo.servergroups || [];
    return clientServerGroups.includes(masteradminGroupID.toString());
}

async function handleRespKickCommand(client, respawnNumber) {
    respawnNumber = respawnNumber.toUpperCase(); 
    const clientInfo = await ts3.getClientById(client.clid);
    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }
    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respkick.");
        return;
    }
    const respawn = activeRespawns[respawnNumber];
    if (!respawn) {
        await ts3.sendTextMessage(client.clid, 1, `Respawn número ${respawnNumber} não encontrado.`);
        return;
    }
    if (respawn.current) {
        const kickedClient = respawn.current;
        respawn.current = null;
        if (clientRespawnCount[kickedClient.clid]) {
            clientRespawnCount[kickedClient.clid].current--;
        }
        if (respawn.queue.length > 0) {
            const nextClient = respawn.queue.shift();
            respawn.current = nextClient;
            respawn.waitingForAccept = true;
            respawn.acceptanceTime = 15;
            await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.");
        } else {
            delete activeRespawns[respawnNumber];
        }
        await ts3.sendTextMessage(client.clid, 1, `Jogador ${kickedClient.clientNickname} foi removido do respawn ${respawnNumber}.`);
    } else {
        await ts3.sendTextMessage(client.clid, 1, "Não há jogador no respawn no momento.");
    }
    await saveRespawnsToFile();
    await updateRespawnChannel();
}

async function handleRespInfoCommand(client, respawnNumber) {
    respawnNumber = respawnNumber.toUpperCase(); 
    const clientInfo = await ts3.getClientById(client.clid);
    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }
    if (!await hasGuildBankPermission(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respinfo.");
        return;
    }
    if (!isValidRespawn(respawnNumber)) {
        await ts3.sendTextMessage(client.clid, 1, `O respawn número ${respawnNumber} não é válido.`);
        return;
    }
    const respawn = activeRespawns[respawnNumber];
    if (!respawn) {
        await ts3.sendTextMessage(client.clid, 1, `Não há informações para o respawn ${respawnNumber}.`);
        return;
    }
    const respawnName = getRespawnName(respawnNumber);
    let infoMessage = `Informações sobre o respawn ${respawnNumber} (${respawnName}):\n\n`;
    if (respawn.current) {
        infoMessage += `Ocupado por: ${respawn.current.clientNickname}\n`;
        if (respawn.waitingForAccept) {
            infoMessage += `Aguardando aceitação: ${respawn.acceptanceTime} minutos restantes\n`;
        } else {
            infoMessage += `Tempo restante: ${formatTime(respawn.time)}m\n`;
        }
        infoMessage += '\n';
    } else {
        infoMessage += "Atualmente livre\n\n";
    }
    if (respawn.queue.length > 0) {
        infoMessage += "Fila:\n";
        respawn.queue.forEach((user, index) => {
            infoMessage += `  ${index + 1}. ${user.clientNickname}\n`;
        });
    } else {
        infoMessage += "Fila: Vazia\n";
    }
    await ts3.sendTextMessage(client.clid, 1, infoMessage);
}

async function handleRespStopCommand(client) {
    const clientInfo = await ts3.getClientById(client.clid);
    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }
    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "Não tem permissão para usar o comando !respstop.");
        return;
    }
    if (isRespawnPaused) {
        await ts3.sendTextMessage(client.clid, 1, "O respawn já está pausado.");
        return;
    }
    isRespawnPaused = true;
    await ts3.sendTextMessage(client.clid, 1, "Sistema de Respawn Pausado. Use !respstart para ligar.");
}

async function handleRespStartCommand(client) {
    const clientInfo = await ts3.getClientById(client.clid);
    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }
    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respstart.");
        return;
    }
    if (!isRespawnPaused) {
        await ts3.sendTextMessage(client.clid, 1, "O sistema de respawn não está pausado.");
        return;
    }
    isRespawnPaused = false;
    await ts3.sendTextMessage(client.clid, 1, "O sistema de respawn foi retomado.");
}

async function handleRespNextCommand(client, respawnNumber) {
    const respawn = activeRespawns[respawnNumber];
    if (respawn && respawn.queue.length > 0) {
        const nextClient = respawn.queue.shift();
        respawn.current = nextClient;
        respawn.waitingForAccept = true;
        respawn.acceptanceTime = 15;
        await ts3.clientPoke(nextClient.clid, "Digite !aceitar em 15 minutos!");
    }
}

async function handleAceitarCommand(client) {
    for (const respawnNumber in activeRespawns) {
        const respawn = activeRespawns[respawnNumber];
        if (respawn.current.clid === client.clid && respawn.waitingForAccept) {
            respawn.waitingForAccept = false;
            const clientInfo = await ts3.getClientById(client.clid);
            respawn.maxTime = await getRespawnTimePorGrupo(clientInfo);
            respawn.time = respawn.maxTime;
            await ts3.sendTextMessage(client.clid, 1, `Aceito! Seu tempo de ${formatTime(respawn.maxTime)}h começou.`);
            await updateRespawnChannel();
        }
    }
}

// Evento para capturar a mensagem de texto
ts3.on("textmessage", (ev) => {
    // Para o comando !resp, mantemos o conteúdo original (não forçamos lower case para preservar o formato do tempo)
    if (ev.msg.trim().toLowerCase().startsWith("!resp ")) {
        // Remove "!resp" e passa o restante do comando para a função
        const commandBody = ev.msg.trim().substring(5).trim();
        handleRespCommand(ev.invoker, commandBody);
    } else if (ev.msg.trim().toLowerCase().startsWith("!respnext ")) {
        const respawnNumber = ev.msg.trim().split(" ")[1].toUpperCase();
        handleRespNextCommand(ev.invoker, respawnNumber);
    } else if (ev.msg.trim().startsWith("!respdel ")) {
        const respawnNumber = ev.msg.trim().split(" ")[1].toUpperCase();
        handleRespDelCommand(ev.invoker, respawnNumber);
    } else if (ev.msg.trim().startsWith("!respkick ")) {
        const respawnNumber = ev.msg.trim().split(" ")[1].toUpperCase();
        handleRespKickCommand(ev.invoker, respawnNumber);
    } else if (ev.msg.trim().startsWith("!setrespawntime ")) {
        const args = ev.msg.trim().split(" ");
        const groupId = args[1].toUpperCase();
        const time = args[2];
        handleSetRespawnTimeCommand(ev.invoker, groupId, time);
    } else if (ev.msg.trim().startsWith("!addextratime ")) {
        const args = ev.msg.trim().split(" ");
        const groupId = args[1].toUpperCase();
        const extraTime = args[2];
        handleAddExtraTimeCommand(ev.invoker, groupId, extraTime);
    } else if (ev.msg.trim().startsWith("!respinfo ")) {
        const respawnNumber = ev.msg.trim().split(" ")[1].toUpperCase();
        handleRespInfoCommand(ev.invoker, respawnNumber);
    } else if (ev.msg.trim() === "!respstop") {
        handleRespStopCommand(ev.invoker);
    } else if (ev.msg.trim() === "!respstart") {
        handleRespStartCommand(ev.invoker);
    } else if (ev.msg.trim() === "!aceitar") {
        handleAceitarCommand(ev.invoker);
    }
});

// Carregamento dos dados iniciais
loadGroupRespawnTimes();
loadRespawnsFromFile();
loadRespawnData();
loadRespdelData();


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////      COMANDO HELP      ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para exibir a ajuda
async function showHelp(client) {
    try {
        // Obter as informações do cliente
        const clientInfo = await ts3.getClientById(client.clid);

        if (!clientInfo) {
            throw new Error("Información del cliente no encontrada.");
        }

        // Verifica se o usuário é administrador (se o grupo ID 9 está presente)
        const isAdminUser = clientInfo.servergroups.includes(masteradminGroupID.toString()) || 
                    clientInfo.servergroups.includes(serveradminGroupID.toString())  || 
                    clientInfo.servergroups.includes(botadm.toString());


        // Comandos para todos
        let helpMessage = `
        [b]Todos:[/b]

        [b]!desc[/b]
        [i]Envia link para criação da descrição para registro no TS.[/i]

        [b]Respawn List:[/b]

        [b]!resp <numero>[/b]
        [i]Adiciona você a um respawn ou à fila do respawn especificado pelo número.[/i]

        [b]!respdel <numero>[/b]
        [i]Remove você do respawn ou da fila do respawn especificado pelo número.[/i]

        `;

        // Se for administrador, exibe também os comandos de administração
        if (isAdminUser) {
            helpMessage += `
            [b]Administração:[/b]
        
            [b]!mp <mensagem>[/b]
            [i]Envia uma mensagem para todos os membros do canal atual no TeamSpeak.[/i]
        
            [b]!mk <mensagem>[/b]
            [i]Kika todos usuarios do TS.[/i]

            [b]!ck <mensagem>[/b]
            [i]Kika todos usuarios do channel atual.[/i]
        
            [b]!massmove <mensagem>[/b]
            [i]Traz todos os usuarios para seu channel.[/i]
        
            [b]!scan <personagem>[/b]
            [i]Verifica personagens invisíveis de alguém no Tibia.[/i]
        
            [b]Guilds:[/b]
        
            [b]!addguildenemy <guild>[/b]
            [i]Adiciona uma guilda à lista de guildas inimigas.[/i]
        
            [b]!removeguildenemy <guild>[/b]
            [i]Remove uma guilda da lista de guildas inimigas.[/i]
            
            [b]!addguildally <guild>[/b]
            [i]Adiciona uma guilda à lista de guildas aliadas.[/i]
        
            [b]!removeguildally <guild>[/b]
            [i]Remove uma guilda da lista de guildas aliadas.[/i]

        
            [b]Respawn List:[/b]
        
            [b]!resp <numero>[/b]
            [i]Adiciona você a um respawn ou à fila do respawn especificado pelo número.[/i]
        
            [b]!respdel <numero>[/b]
            [i]Remove você do respawn ou da fila do respawn especificado pelo número.[/i]
        
            [b]!respkick <numero>[/b]
            [i]Remove o player atual do respawn especificado pelo número.[/i]
        
            [b]!respinfo <numero>[/b]
            [i]Mostra informações detalhadas sobre o respawn especificado pelo número.[/i]
        
            [b]!respstop[/b]
            [i]Pausa todos os temporizadores de respawn ativos.[/i]
        
            [b]!respstart[/b]
            [i]Retoma todos os temporizadores de respawn pausados.[/i]

            [b]!addenemy[/b]
            [i]Adiciona um inimigo individualmente.[/i]

            [b]!removeenemy[/b]
            [i]Remove o inimigo individualmente.[/i]
        
            [b]Configurações:[/b]
        
            [b]!tempoafk <numero>[/b]
            [i]Modifica o tempo do AFK para ser movido.[/i]
        
            [b]!tempoafk[/b]
            [i]Mostra qual o tempo que está setado para enviar o cliente ao canal de AFK.[/i]
        
            [b]!setrespawntime <groupId> <time>[/b]
            [i]Define o tempo de respawn para um grupo específico.[/i]
        
            [b]!addextratime <groupId> <time>[/b]
            [i]Adiciona tempo extra de respawn para um grupo específico.[/i]


            [b]!viewmaker[/b]
            [i]Mostra todas as regras, e quando utilizar !viewmaker Nome da Regra, mostra aquela regra especifica.[/i]
        
            [b]!setmaker "Nome da Regra" LevelMin-LevelMax "Elder Druid, Master Sorcerer" Mundo GroupID[/b]
            [i]Define as regras de makers do servidor, exemplo de comando: !setmaker "Inabra Maker" 49-110 "Elder Druid, Master Sorcerer" Inabra 75[/i]
        
            [b]!clearmaker Nome da Regra
            [i]Remove a regra de maker.[/i]


            `;
        }

        // Enviar a mensagem de ajuda para o usuário
        await ts3.sendTextMessage(client.clid, 1, helpMessage);
    } catch (err) {
        console.error('Erro ao obter informações do cliente ou enviar mensagem de ajuda:', err);
    }
}

// Exemplo de como o comando seria tratado
ts3.on("textmessage", async (event) => {
    const { msg, invoker } = event;

    if (msg.startsWith("!help")) {
        await showHelp(invoker);
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   ADIcONAR GUILD ALIADA ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para salvar ou atualizar descrições no arquivo JSON
const descriptionsFilePath = path.join(__dirname, 'client_descriptions.json');

async function saveClientDescriptions(clientDescriptions) {
    try {
        const data = JSON.stringify(clientDescriptions, null, 2);
        await fs.writeFile(descriptionsFilePath, data, 'utf8');
        console.log("Descrições dos clientes salvas/atualizadas com sucesso.");
    } catch (error) {
        console.error("Erro ao salvar descrições dos clientes:", error);
    }
}

// Função para carregar as descrições dos clientes
async function loadClientDescriptions() {
    try {
        const data = await fs.readFile(descriptionsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar descrições dos clientes:", error);
        return {};
    }
}

// Função para verificar se o nome do personagem (Main) está na descrição e se está online no TS3
async function checkPlayerStatus(playerName) {
    const clientDescriptions = await loadClientDescriptions();
    console.log("Descrições dos clientes:", clientDescriptions);
    console.log("Verificando status para:", playerName);

    // Verifica diretamente se o playerName existe nas descrições
    if (clientDescriptions[playerName]) {
        const clients = await getAllClients();
        for (const client of clients) {
            const clientInfo = await getFullClientInfo(client.clid);
            if (clientInfo && clientInfo.clientDescription) {
                const mainFieldRegex = /Main:\s*([^\/]+)/i;
                const makerFieldRegex = /Maker:\s*([^\/]+)/i;
                const mainMatch = clientInfo.clientDescription.match(mainFieldRegex);
                const makerMatch = clientInfo.clientDescription.match(makerFieldRegex);
                
                // Verifica se o playerName está no campo "Main" ou "Maker"
                if ((mainMatch && mainMatch[1].trim() === playerName.trim()) ||
                    (makerMatch && makerMatch[1].split(',').map(name => name.trim()).includes(playerName.trim()))) {
                    console.log(`${playerName} está online no TS3`);
                    return true;
                }
            }
        }
    }

    console.log(`${playerName} não está online no TS3`);
    return false;
}

async function updateClientDescriptions(clients) {
    const existingDescriptions = await loadClientDescriptions(); // Carrega as descrições existentes

    // Atualiza o objeto com novas descrições
    for (const client of clients) {
        const clientInfo = await getFullClientInfo(client.clid);
        if (clientInfo && clientInfo.clientDescription) {
            const mainFieldRegex = /Main:\s*([^\/]+)/i;
            const makerFieldRegex = /Maker:\s*([^\/]+)/i;
            const mainMatch = clientInfo.clientDescription.match(mainFieldRegex);
            const makerMatch = clientInfo.clientDescription.match(makerFieldRegex);

            let mainName = null;
            let makers = [];

            if (mainMatch) {
                mainName = mainMatch[1].trim(); // Remove espaços extras
            }

            if (makerMatch) {
                makers = makerMatch[1].split(',').map(name => name.trim());
            }

            // Se encontrou o valor após "Main:", usa esse valor como chave
            if (mainName) {
                existingDescriptions[mainName] = clientInfo.clientDescription; // Atualiza ou adiciona ao objeto existente
            }

            // Adiciona os makers ao objeto existente, se houver
            for (const maker of makers) {
                if (maker) {
                    existingDescriptions[maker] = clientInfo.clientDescription; // Atualiza ou adiciona ao objeto existente
                }
            }
        }
    }

    // Salva as descrições atualizadas no arquivo JSON, preservando as anteriores
    await saveClientDescriptions(existingDescriptions);
}

// Função para atualizar a descrição do canal com as informações da guilda
async function updateChannelDescriptionWithGuildInfo(channelId) {
    const guildUrl = `https://api.tibiadata.com/v4/guild/${guildAliada}`;
  
    try {
        const response = await fetch(guildUrl);
        const data = await response.json();

        if (data.guild && data.guild.members) {
            // Filtra os membros que estão online
            const onlineMembers = data.guild.members.filter(member => member.status === "online");
            const onlineCount = onlineMembers.length;
  
            // Atualiza o nome do canal com o número de membros online
            const newChannelName = `[cspacerJp]✖ Guild (${onlineCount}) ✖`;
            try {
                await ts3.channelEdit(channelId, { channel_name: newChannelName });
                console.log(`Nome do canal atualizado para: ${newChannelName}`);
            } catch (error) {
                console.error("Erro ao atualizar o nome do canal:", error);
            }
  
            if (onlineCount === 0) {
                console.log("Nenhum membro Online.");
                return; // Se não houver membros online, encerra a função
            }
  
            // Obtém todos os clientes no TeamSpeak
            const clients = await getAllClients();
  
            // Atualizar descrições dos clientes no JSON (função auxiliar)
            await updateClientDescriptions(clients);
  
            // Carregar as descrições atualizadas (função auxiliar)
            const clientDescriptions = await loadClientDescriptions();
  
            // Organiza os membros online no jogo por vocação
            const vocations = {
                "Elder Druid": [],
                "Master Sorcerer": [],
                "Elite Knight": [],
                "Royal Paladin": []
            };
  
            for (const member of onlineMembers) {
                const { name, level, vocation } = member;
  
                // Verifica se o jogador está online no TS usando clientDescriptions
                let status;
                if (clientDescriptions[name]) {
                    const isOnlineInTS = await checkPlayerStatus(name);
                    status = isOnlineInTS ? "✅" : "❎"; // ✅ = online no TS, ❎ = apenas no jogo
                } else {
                    status = "⚠️"; // ⚠️ = jogador sem registro
                }
  
                // Adiciona o jogador na categoria correta (por vocação)
                if (vocations[vocation]) {
                    vocations[vocation].push({ name, level, status });
                }
            }
  
            // Gerar a nova descrição do canal
            let channelDescription = "✅ Player online no jogo e no TS | ❎ Player online no jogo mas não no TS | ⚠️ Player sem registro\n\n";
  
            // Adiciona cada vocação e seus membros à descrição do canal
            Object.keys(vocations).forEach(vocation => {
                if (vocations[vocation].length > 0) {
                    channelDescription += `[b][size=+1]${vocation}:[/b]\n`;
                    vocations[vocation].forEach(member => {
                        channelDescription += ` [b][color=#7cac0e] ${member.name} [/b] [b](Level ${member.level})[/b] ${member.status}\n`;
                    });
                    channelDescription += '\n';
                }
            });
  
            console.log("Nova descrição do canal:", channelDescription);
  
            // Atualiza a descrição do canal no TS3
            try {
                await ts3.channelEdit(channelId, { channel_description: channelDescription });
                console.log("Descrição do canal atualizada com sucesso!");
            } catch (error) {
                console.error("Erro ao atualizar a descrição do canal:", error);
            }
        }
    } catch (error) {
        console.error("Erro ao buscar informações da guilda:", error);
    }
}

// Função para iniciar a atualização a cada 60 segundos
function startAutoUpdate(channelId, intervalMs = 10000) {
  updateChannelDescriptionWithGuildInfo(channelId); // Primeira execução imediata
  setInterval(() => {
      updateChannelDescriptionWithGuildInfo(channelId);
  }, intervalMs);
}

// Exemplo de uso: iniciar a atualização automática do canal de ID 33 a cada 60 segundos
startAutoUpdate(canalGuildAliada);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   ADIONAR MAKER LIST   ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para verificar e organizar Makers online por vocação e nível usando a API da guilda
async function updateMakersOnlineWithGuildInfo(channelId) {
    const guildUrl = `https://api.tibiadata.com/v4/guild/${guildAliada}`;

    try {
        const response = await fetch(guildUrl);
        const data = await response.json();
        if (data.guild && data.guild.members) {
            const members = data.guild.members;
            const clients = await getAllClients();

            // Atualizar descrições dos clientes no JSON
            await updateClientDescriptions(clients);

            // Carregar descrições atualizadas
            const clientDescriptions = await loadClientDescriptions();

            // Agrupar os Makers por vocação
            const vocations = {
                "Elder Druid": [],
                "Master Sorcerer": [],
                "Elite Knight": [],
                "Royal Paladin": [],
                "Unknown Vocation": [] // Caso a vocação não seja identificada
            };

            let onlineMakerCount = 0; // Contador para Makers online

            for (const member of members) {
                const { name, level, vocation, status } = member;

                // Verifica se o status do Maker está "online"
                if (status === "online") {
                    const makerFieldRegex = /Maker:\s*([^\/]+)/i;

                    // Verifica se o Maker está na descrição de algum cliente no TS3
                    for (const client of clients) {
                        const clientInfo = await getFullClientInfo(client.clid);
                        if (clientInfo && clientInfo.clientDescription) {
                            const makerMatch = clientInfo.clientDescription.match(makerFieldRegex);

                            if (makerMatch) {
                                const makers = makerMatch[1].split(',').map(m => m.trim());

                                // Verifica se o Maker da guilda está registrado no TS3
                                if (makers.includes(name)) {
                                    onlineMakerCount++; // Incrementa o contador de Makers online

                                    // Agrupa por vocação ou coloca em "Unknown Vocation" se a vocação for inválida
                                    const vocationGroup = vocations[vocation] ? vocation : "Unknown Vocation";
                                    vocations[vocationGroup].push({ name, level });
                                }
                            }
                        }
                    }
                }
            }

            // Atualizar o nome do canal com a quantidade de Makers online
            const newChannelName = `[cspacerJp]✖ Makers (${onlineMakerCount}) ✖`;

            try {
                await ts3.channelEdit(channelId, { channel_name: newChannelName });
                console.log(`Nome do canal atualizado para: ${newChannelName}`);
            } catch (error) {
                console.error("Erro ao atualizar o nome do canal:", error);
            }

            // Gerar a nova descrição do canal com a lista de Makers por vocação
            let channelDescription = "✅ Makers online:\n\n";

            Object.keys(vocations).forEach(vocation => {
                if (vocations[vocation].length > 0) {
                    channelDescription += `[b][size=+1]${vocation}:[/b]\n`;
                    vocations[vocation].forEach(maker => {
                        channelDescription += `✅ [b][color=#7cac0e]${maker.name}[/b] [b](Level ${maker.level})[/b]\n`;
                    });
                    channelDescription += '\n';
                }
            });

            console.log("Nova descrição do canal:", channelDescription);

            // Atualizar a descrição do canal no TS3
            try {
                await ts3.channelEdit(channelId, { channel_description: channelDescription });
                console.log("Descrição do canal atualizada com sucesso!");
            } catch (error) {
                console.error("Erro ao atualizar a descrição do canal:", error);
            }
        }
    } catch (error) {
        console.error("Erro ao buscar informações da guilda:", error);
    }
}

// Função para iniciar a atualização dos Makers online a cada 60 segundos
function startMakersUpdateWithGuildInfo(channelId, intervalMs = 60000) {
    updateMakersOnlineWithGuildInfo(channelId); // Primeira execução imediata
    setInterval(() => {
        updateMakersOnlineWithGuildInfo(channelId);
    }, intervalMs);
}

// Exemplo de uso: iniciar a atualização automática dos makers no canal de ID 32 a cada 60 segundos
startMakersUpdateWithGuildInfo(canalMakerAliado);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   ADIONAR ENEMY GUILD  ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Define o caminho para o arquivo JSON usando o módulo `path`
const jsonFilePath = path.join(__dirname, 'guild_enemy.json'); // Ajuste o caminho conforme necessário
let enemyGuilds = new Set(); // Usamos um Set para armazenar as guildas inimigas

// Função para carregar a lista de guildas inimigas do arquivo JSON
async function loadEnemyGuilds() {
    try {
        const data = await fs.readFile(jsonFilePath, 'utf8');
        const json = JSON.parse(data);
        enemyGuilds = new Set(json.guilds || []);
        console.log('Guildas inimigas carregadas:', Array.from(enemyGuilds));
    } catch (error) {
        console.error('Erro ao carregar as guildas inimigas:', error);
        enemyGuilds = new Set(); // Inicializa um Set vazio em caso de erro
    }
}

// Função para salvar a lista de guildas inimigas no arquivo JSON
async function saveEnemyGuilds() {
    try {
        const json = { guilds: Array.from(enemyGuilds) };
        await fs.writeFile(jsonFilePath, JSON.stringify(json, null, 2));
        console.log('Guildas inimigas salvas.');
    } catch (error) {
        console.error('Erro ao salvar as guildas inimigas:', error);
    }
}

// Função para adicionar uma guilda à lista de Enemigos
async function addEnemyGuild(guildName, user) {
    enemyGuilds.add(guildName);
    await saveEnemyGuilds();
    console.log(`Guild '${guildName}' adicionada na lista de inimigos.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Guild '${guildName}' añadida con éxito.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateEnemyGuildChannelDescription(canalEnemy);
}

// Função para remover uma guilda da lista de Enemigos
async function removeEnemyGuild(guildName, user) {
    enemyGuilds.delete(guildName);
    await saveEnemyGuilds();
    console.log(`Guild '${guildName}' removida da lista de inimigos.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Guild '${guildName}' eliminada con éxito.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateEnemyGuildChannelDescription(canalEnemy);
}

// Atualiza a descrição do canal com base na lista de guildas inimigas e notifica novos jogadores online
async function updateEnemyGuildChannelDescription(channelId) {
    if (enemyGuilds.size === 0) {
        console.log("Ninguna guild enemiga configurada.");
        try {
            await ts3.channelEdit(channelId, {
                channel_name: "[cspaceri7]✖ Enemy (0)✖",
                channel_description: "Nenhuma guild inimiga configurada."
            });
            console.log("Descrição do canal atualizada para 'Nenhuma guilda inimiga configurada'.");
        } catch (error) {
            console.error("Erro ao atualizar a descrição do canal:", error);
        }
        return;
    }

    let channelDescription = "Inimigos Online:\n\n";
    const currentOnlinePlayers = new Set(); // Armazena jogadores online atualmente

    for (const guildName of enemyGuilds) {
        const guildUrl = `https://api.tibiadata.com/v4/guild/${guildName}`;
        try {
            const response = await fetch(guildUrl);
            const data = await response.json();

            if (data.guild && data.guild.members) {
                const onlineMembers = data.guild.members.filter(member => member.status === "online");

                if (onlineMembers.length) {
                    const vocations = {
                        "Elder Druid": [],
                        "Master Sorcerer": [],
                        "Elite Knight": [],
                        "Royal Paladin": []
                    };

                    for (const member of onlineMembers) {
                        const { name, level, vocation } = member;
                        if (vocations[vocation]) {
                            vocations[vocation].push({ name, level });
                        }

                        currentOnlinePlayers.add(name);
                    }

                    channelDescription += `'${guildName}'\n\n`;
                    Object.keys(vocations).forEach(vocation => {
                        if (vocations[vocation].length > 0) {
                            channelDescription += `${vocation}:\n`;
                            vocations[vocation].forEach(member => {
                                channelDescription += `   ☠️[b][color=#228B22] ${member.name}[/b] [b] (Level ${member.level})[/b]\n`;
                            });
                            channelDescription += '\n';
                        }
                    });
                }
            }
        } catch (error) {
            console.error(`Erro ao buscar informações da guilda '${guildName}':`, error);
        }
    }

    try {
        await ts3.channelEdit(channelId, { channel_description: channelDescription });
        console.log("Descrição do canal atualizada com sucesso!");
    } catch (error) {
        console.error("Erro ao atualizar a descrição do canal:", error);
    }

    try {
        const onlineCount = currentOnlinePlayers.size;
        const channelName = `[cspaceri7]✖ Enemy (${onlineCount})✖`;
        await ts3.channelEdit(channelId, { channel_name: channelName });
        console.log(`Nome do canal atualizado para: ${channelName}`);
    } catch (error) {
        console.error("Erro ao atualizar o nome do canal:", error);
    }
}

// Função para iniciar a atualização a cada 60 segundos
function startEnemyGuildAutoUpdate(channelId, intervalMs = 60000) {
    updateEnemyGuildChannelDescription(channelId);
    setInterval(() => {
        updateEnemyGuildChannelDescription(channelId);
    }, intervalMs);
}

// Carregar a lista de guildas inimigas quando o bot iniciar
loadEnemyGuilds();
startEnemyGuildAutoUpdate(canalEnemy);

// Função para verificar se o invoker pertence a um dos grupos permitidos
async function isUserAuthorized(invoker) {
    const clientInfo = await ts3.getClientById(invoker.clid);
    if (!clientInfo) {
        console.error("Cliente não encontrado.");
        return false;
    }
    const clientServerGroups = clientInfo.servergroups || [];
    return [masteradminGroupID, botadm].some(group => clientServerGroups.includes(group.toString()));
}

// Manipulação dos comandos de texto
ts3.on("textmessage", async (ev) => {
    const message = ev.msg.toLowerCase();
    const args = message.split(" ");

    if (message.startsWith("!addguildenemy") || message.startsWith("!removeguildenemy")) {
        // Verifica se o usuário tem permissão para executar o comando
        if (!(await isUserAuthorized(ev.invoker))) {
            await ts3.sendTextMessage(ev.invoker.clid, 1, "Não tem permissão para usar esse comando..");
            return;
        }

        const guildName = args.slice(1).join(" ");
        if (message.startsWith("!addguildenemy")) {
            await addEnemyGuild(guildName, ev.invoker);
        } else if (message.startsWith("!removeguildenemy")) {
            await removeEnemyGuild(guildName, ev.invoker);
        }
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////         ADICIONAR + ALIADOS       ////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Definindo o caminho para o arquivo JSON das guildas aliadas
const GALLY = path.join(__dirname, 'guild_ally.json');
let allyGuilds = new Set(); // Usamos um Set para armazenar as guildas aliadas


// Função para carregar a lista de guildas aliadas do arquivo JSON
async function loadAllyGuilds() {
    try {
        const data = await fs.readFile(GALLY, 'utf8');
        const json = JSON.parse(data);
        allyGuilds = new Set(json.guilds || []);
        console.log('Guildas aliadas carregadas:', Array.from(allyGuilds));
    } catch (error) {
        console.error('Erro ao carregar as guildas aliadas:', error);
        allyGuilds = new Set(); // Inicializa um Set vazio em caso de erro
    }
}

// Função para salvar a lista de guildas aliadas no arquivo JSON
async function saveAllyGuilds() {
    try {
        const json = { guilds: Array.from(allyGuilds) };
        await fs.writeFile(GALLY, JSON.stringify(json, null, 2));
        console.log('Guildas aliadas salvas.');
    } catch (error) {
        console.error('Erro ao salvar as guildas aliadas:', error);
    }
}

// Função para adicionar uma guilda à lista de Aliados
async function addAllyGuild(guildName, user) {
    allyGuilds.add(guildName);
    await saveAllyGuilds();
    console.log(`Guild '${guildName}' adicionada à lista de aliados.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Guild '${guildName}' adicionada com sucesso.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateAllyGuildChannelDescription(75); // Atualize para o ID correto do canal de aliados
}

// Função para remover uma guilda da lista de Aliados
async function removeAllyGuild(guildName, user) {
    allyGuilds.delete(guildName);
    await saveAllyGuilds();
    console.log(`Guild '${guildName}' removida da lista de aliados.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Guild '${guildName}' removida com sucesso.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateAllyGuildChannelDescription(75); // Atualize para o ID correto do canal de aliados
}

// Função para atualizar a descrição do canal com a lista de guildas aliadas
async function updateAllyGuildChannelDescription(channelId) {
    if (allyGuilds.size === 0) {
        console.log("Nenhuma guilda aliada configurada.");
        try {
            await ts3.channelEdit(channelId, {
                channel_name: "[cspaceri7]✚ Aliados (0)✚",
                channel_description: "Nenhuma guilda aliada configurada."
            });
            console.log("Descrição do canal atualizada para 'Nenhuma guilda aliada configurada'.");
        } catch (error) {
            console.error("Erro ao atualizar a descrição do canal:", error);
        }
        return;
    }

    let channelDescription = "Miembros de guilds aliadas en línea:\n\n";
    const currentOnlineAllies = new Set();

    for (const guildName of allyGuilds) {
        const guildUrl = `https://api.tibiadata.com/v4/guild/${guildName}`;
        try {
            const response = await fetch(guildUrl);
            const data = await response.json();

            if (data.guild && data.guild.members) {
                const onlineMembers = data.guild.members.filter(member => member.status === "online");

                if (onlineMembers.length) {
                    const vocations = {
                        "Elder Druid": [],
                        "Master Sorcerer": [],
                        "Elite Knight": [],
                        "Royal Paladin": []
                    };

                    for (const member of onlineMembers) {
                        const { name, level, vocation } = member;
                        if (vocations[vocation]) {
                            vocations[vocation].push({ name, level });
                        }

                        currentOnlineAllies.add(name);
                    }

                    channelDescription += `Miembros de la guild '${guildName}' en línea:\n\n`;
                    Object.keys(vocations).forEach(vocation => {
                        if (vocations[vocation].length > 0) {
                            channelDescription += `${vocation}:\n`;
                            vocations[vocation].forEach(member => {
                                channelDescription += `   ✚[b][color=#0000FF] ${member.name}[/b] [b] (Level ${member.level})[/b]\n`;
                            });
                            channelDescription += '\n';
                        }
                    });
                }
            }
        } catch (error) {
            console.error(`Erro ao buscar informações da guilda '${guildName}':`, error);
        }
    }

    try {
        await ts3.channelEdit(channelId, { channel_description: channelDescription });
        console.log("Descrição do canal de aliados atualizada com sucesso!");
    } catch (error) {
        console.error("Erro ao atualizar a descrição do canal:", error);
    }

    try {
        const onlineCount = currentOnlineAllies.size;
        const channelName = `[cspaceri7]✚ Aliados (${onlineCount})✚`;
        await ts3.channelEdit(channelId, { channel_name: channelName });
        console.log(`Nome do canal atualizado para: ${channelName}`);
    } catch (error) {
        console.error("Erro ao atualizar o nome do canal:", error);
    }
}

// Função para iniciar a atualização a cada 60 segundos
function startAllyGuildAutoUpdate(channelId, intervalMs = 60000) {
    updateAllyGuildChannelDescription(channelId);
    setInterval(() => {
        updateAllyGuildChannelDescription(channelId);
    }, intervalMs);
}

// Carregar a lista de guildas aliadas quando o bot iniciar
loadAllyGuilds();
startAllyGuildAutoUpdate(canalAliadoAdicional); // Substitua pelo ID do canal de aliados

// Manipulação dos comandos de texto
ts3.on("textmessage", async (ev) => {
    const message = ev.msg.toLowerCase();
    const args = message.split(" ");

    // Verifica se o comando começa com !addguildally ou !removeguildally
    if (message.startsWith("!addguildally") || message.startsWith("!removeguildally")) {
        // Verifica se o usuário é autorizado
        if (!(await isUserAuthorized(ev.invoker))) {
            await ts3.sendTextMessage(ev.invoker.clid, 1, "Você não tem permissão para usar este comando.");
            return;
        }

        const guildName = args.slice(1).join(" ");
        if (message.startsWith("!addguildally")) {
            await addAllyGuild(guildName, ev.invoker);  // Função que adiciona a guilda
        } else if (message.startsWith("!removeguildally")) {
            await removeAllyGuild(guildName, ev.invoker);  // Função que remove a guilda
        }
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////         MASSMOVE       ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para mover todos os clientes para o canal do admin
async function moveAllClientsToAdminChannel(ts3, adminClid) {
    try {
        // Obter informações completas do admin
        const adminInfo = await ts3.getClientById(adminClid); // Usando getClientById para consistência
        if (!adminInfo) {
            console.error("Não foi possível obter informações do admin.");
            return;
        }

        const adminChannelId = adminInfo.cid; // 'cid' é o ID do canal atual do admin
        const clients = await ts3.clientList({ clientType: 0 }); // Lista todos os clientes conectados

        // Mover todos os clientes para o canal do admin
        for (const client of clients) {
            const clid = client.clid;
            if (clid !== adminClid) { // Não mover o admin
                await ts3.clientMove(clid, adminChannelId);
                console.log(`Cliente ${client.clientNickname} movido para o canal do admin.`);
            }
        }

    } catch (error) {
        console.error("Erro ao mover clientes:", error);
    }
}

// Função para verificar se um cliente é administrador
async function isAdmin(ts3, clid) {
    try {
        // Obter informações completas do cliente
        const clientInfo = await ts3.getClientById(clid); // Alterando para getClientById
        if (!clientInfo) {
            console.error("Não foi possível obter informações do cliente.");
            return false;
        }

        // Verificar se o cliente está no grupo de admin
        const clientServerGroups = clientInfo.servergroups || [];

        // Verifica se o cliente pertence ao grupo admin
        return [serveradminGroupID, masteradminGroupID, botadm, mmove].some(group => clientServerGroups.includes(group.toString()));
    } catch (error) {
        console.error("Erro ao verificar se o cliente é admin:", error);
        return false;
    }
}

// Função para processar o comando !massmove
async function handleMassMoveCommand(ts3, senderClid) {
    try {
        const isAdminUser = await isAdmin(ts3, senderClid);
        if (isAdminUser) {
            await moveAllClientsToAdminChannel(ts3, senderClid);
        } else {
            console.error("Você não tem permissões para usar este comando.");
            await ts3.sendTextMessage(senderClid, 1, "Não tem permissão para usar o comando  !massmove.");
        }
    } catch (error) {
        console.error("Erro ao processar comando !massmove:", error);
    }
}

// Evento para processar mensagens de texto
ts3.on("textmessage", async (event) => {
    const message = event.msg.trim();
    const senderClid = event.invoker.clid;

    if (message === "!massmove") {
        await handleMassMoveCommand(ts3, senderClid);
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////     MASSKICK     ///////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para kickar todos os clientes no servidor
async function kickAllClients(ts3, kickReason) {
    try {
        const clients = await ts3.clientList({ clientType: 0 }); // Lista todos os clientes conectados

        // Kickar todos os clientes
        for (const client of clients) {
            const clid = client.clid;

            // Kicka o cliente
            await ts3.clientKick(clid, 5, kickReason);
            console.log(`Cliente ${client.nickname} foi kickado do servidor.`);
        }
    } catch (error) {
        console.error("Erro ao kickar clientes no servidor:", error);
    }
}

// Função para kickar todos os clientes no mesmo canal
async function kickAllClientsInSameChannel(ts3, senderClid, kickReason) {
    try {
        // Obter informações completas do cliente invoker
        const senderInfo = await ts3.getClientById(senderClid);
        if (!senderInfo) {
            console.error("Não foi possível obter informações do invoker.");
            return;
        }

        const senderChannelId = senderInfo.cid; // 'cid' é o ID do canal atual do invoker
        const clients = await ts3.clientList({ clientType: 0 }); // Lista todos os clientes conectados

        // Kickar todos os clientes no mesmo canal que o invoker
        for (const client of clients) {
            const clid = client.clid;

            // Verifica se o cliente está no mesmo canal e não é o invoker
            if (client.cid === senderChannelId && clid !== senderClid) {
                await ts3.clientKick(clid, 5, kickReason);
                console.log(`Cliente ${client.nickname} foi kickado do canal.`);
            }
        }

        // Enviar uma mensagem para o invoker confirmando o kick dos clientes
        await ts3.sendTextMessage(senderClid, 1, `Todos os clientes no canal foram kickados com a razão: "${kickReason}".`);

    } catch (error) {
        console.error("Erro ao kickar clientes no mesmo canal:", error);
        await ts3.sendTextMessage(senderClid, 1, "Ocorreu um erro ao tentar kickar os clientes no mesmo canal.");
    }
}

// Função para processar o comando !mk
async function handleMassKickCommand(ts3, senderClid, message) {
    try {
        const isAdminUser = await isAdmin(ts3, senderClid); // Verifica se o invoker é admin
        if (isAdminUser) {
            // Obter a razão do kick a partir da mensagem do comando
            const kickReason = message.slice(4).trim(); // Remove "!mk " do início da mensagem

            if (kickReason) {
                await kickAllClients(ts3, kickReason); // Kicka todos os clientes no servidor com a razão
                await ts3.sendTextMessage(senderClid, 1, `Todos os clientes no servidor foram kickados com a razão: "${kickReason}".`);
            } else {
                await ts3.sendTextMessage(senderClid, 1, "Por favor, forneça uma razão para o kick após o comando !mk.");
            }
        } else {
            console.error("Você não tem permissões para usar este comando.");
            await ts3.sendTextMessage(senderClid, 1, "Você não tem permissões para usar o comando !mk.");
        }
    } catch (error) {
        console.error("Erro ao processar comando !mk:", error);
    }
}

// Função para processar o comando !ck
async function handleChannelKickCommand(ts3, senderClid, message) {
    try {
        const isAdminUser = await isAdmin(ts3, senderClid); // Verifica se o invoker é admin
        if (isAdminUser) {
            // Obter a razão do kick a partir da mensagem do comando
            const kickReason = message.slice(4).trim(); // Remove "!ck " do início da mensagem

            if (kickReason) {
                await kickAllClientsInSameChannel(ts3, senderClid, kickReason); // Kicka todos os clientes no canal atual
            } else {
                await ts3.sendTextMessage(senderClid, 1, "Por favor, forneça uma razão para o kick após o comando !ck.");
            }
        } else {
            console.error("Você não tem permissões para usar este comando.");
            await ts3.sendTextMessage(senderClid, 1, "Você não tem permissões para usar o comando !ck.");
        }
    } catch (error) {
        console.error("Erro ao processar comando !ck:", error);
    }
}

// Evento para processar mensagens de texto
ts3.on("textmessage", async (event) => {
    const message = event.msg.trim();
    const senderClid = event.invoker.clid;

    if (message.startsWith("!mk")) {
        await handleMassKickCommand(ts3, senderClid, message);
    } else if (message.startsWith("!ck")) {
        await handleChannelKickCommand(ts3, senderClid, message);
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////          FIM           ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para obter o nome da guilda inimiga a partir do arquivo guild_enemy.json
async function getGuildName() {
    try {
        const data = await fs.readFile(path.resolve(__dirname, 'guild_enemy.json'), 'utf8');
        const guildData = JSON.parse(data);
        return guildData.guilds[0].replace(/ /g, '%20'); // Retorna o nome da guilda com espaços convertidos para %20
    } catch (error) {
        console.error("Erro ao ler o arquivo guild_enemy.json:", error);
        return null;
    }
}

// Função para verificar e organizar personagens da guilda abaixo de level 200 e com status online
async function updateEnemyMakers(channelId) {
    const minLevel = 100; // Define o level máximo

    // Obtém o nome da guilda a partir do arquivo JSON
    const guildName = await getGuildName();
    if (!guildName) {
        console.warn("Nenhuma guilda foi encontrada ou houve erro ao ler o arquivo.");
        return;
    }

    const guildUrl = `https://api.tibiadata.com/v4/guild/${guildName}`;

    try {
        const response = await fetch(guildUrl);
        const data = await response.json();

        if (data.guild && data.guild.members) {
            const members = data.guild.members;

            // Filtrar membros abaixo de level 200 e online
            const onlineMakers = members.filter(member => member.level < minLevel && member.status === "online");

            // Atualizar o nome do canal com a quantidade de makers online
            const onlineCount = onlineMakers.length;
            const newChannelName = `[cspacerJp]✖ Enemy Makers (${onlineCount}) ✖`;

            try {
                await ts3.channelEdit(channelId, { channel_name: newChannelName });
                console.log(`Nome do canal atualizado para: ${newChannelName}`);
            } catch (error) {
                console.error("Erro ao atualizar o nome do canal:", error);
            }

            // Agrupar os personagens por vocação
            const vocations = {
                "Elder Druid": [],
                "Master Sorcerer": [],
                "Elite Knight": [],
                "Royal Paladin": [],
                "Sem Promotion": [] // Caso a vocação não seja identificada
            };

            for (const member of onlineMakers) {
                const { name, level, vocation } = member;
                // Agrupa por vocação ou coloca em "Unknown Vocation" se a vocação for inválida
                const vocationGroup = vocations[vocation] ? vocation : "Sem Promotion";
                vocations[vocationGroup].push({ name, level });
            }

            // Gerar a nova descrição do canal com a lista de personagens por vocação
            let channelDescription = "✅ Makers Online abaixo do Level 100:\n\n";

            Object.keys(vocations).forEach(vocation => {
                if (vocations[vocation].length > 0) {
                    channelDescription += `[b][size=+1]${vocation}:[/b]\n`;
                    vocations[vocation].forEach(maker => {
                        channelDescription += `✅ [b][color=#7cac0e]${maker.name}[/b] [b](Level ${maker.level})[/b]\n`;
                    });
                    channelDescription += '\n';
                }
            });

            console.log("Nova descrição do canal:", channelDescription);

            // Atualizar a descrição do canal no TS3
            try {
                await ts3.channelEdit(channelId, { channel_description: channelDescription });
                console.log("Descrição do canal atualizada com sucesso!");
            } catch (error) {
                console.error("Erro ao atualizar a descrição do canal:", error);
            }
        }
    } catch (error) {
        console.error("Erro ao buscar informações da guilda:", error);
    }
}

// Função para iniciar a atualização dos personagens online abaixo de Level 200 a cada 60 segundos
function startUpdateEnemyMakers(channelId, intervalMs = 60000) {
    updateEnemyMakers(channelId); // Primeira execução imediata
    setInterval(() => {
        updateEnemyMakers(channelId);
    }, intervalMs);
}

// Exemplo de uso: iniciar a atualização automática dos personagens no canal de ID 42 a cada 60 segundos
startUpdateEnemyMakers(canalMakerInimigo);

// Função para normalizar strings (remove acentos e caracteres especiais)
function normalizeString(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Função para buscar por clientes no banco de dados pelo nickname ou descrição
async function searchClientsByDescriptionOrNickname(searchTerm) {
    try {
        // Recuperar a lista de todos os clientes do banco de dados
        const dbClients = await ts3.clientDbList();
        console.log(`Encontrados ${dbClients.length} clientes no banco de dados.`);

        const matches = [];

        for (const dbClient of dbClients) {
            const cldbid = dbClient.cldbid;

            // Verificar se o cldbid é válido
            if (!cldbid) {
                console.warn(`Cliente sem cldbid encontrado: ${JSON.stringify(dbClient)}`);
                continue;  // Pular clientes sem cldbid
            }

            // Obter as informações completas do cliente offline
            const clientInfo = await ts3.clientDbInfo(cldbid).catch((err) => {
                console.error(`Erro ao buscar informações para cldbid ${cldbid}:`, err);
                return null;  // Retornar null em caso de erro
            });

            if (!clientInfo || clientInfo.length === 0) {
                console.error(`Informações de cliente não encontradas para cldbid ${cldbid}.`);
                continue;  // Pular clientes com informações inválidas
            }

            // O clientInfo retorna como um array, então pegamos o primeiro item
            const clientDetails = clientInfo[0];

            // Verificar se o nickname ou a descrição correspondem ao termo de busca
            const normalizedNickname = normalizeString(clientDetails.clientNickname || "");
            const normalizedDescription = normalizeString(clientDetails.clientDescription || "");

            if (normalizedNickname.includes(searchTerm) || normalizedDescription.includes(searchTerm)) {
                matches.push({
                    clientNickname: clientDetails.clientNickname,
                    clientDescription: clientDetails.clientDescription,
                    clientDatabaseId: clientDetails.clientDatabaseId,
                    clientUniqueIdentifier: clientDetails.clientUniqueIdentifier,
                    clientTotalConnections: clientDetails.clientTotalconnections,
                    clientLastIP: clientDetails.clientLastip,
                    clientTotalOnlineTime: clientDetails.clientTotalOnlineTime,
                    clientMonthOnlineTime: clientDetails.clientMonthOnlineTime,
                    clientLastConnected: clientDetails.clientLastconnected  // Adicionado
                });
            }
        }

        return matches;
    } catch (error) {
        console.error("Erro ao buscar clientes no banco de dados:", error);
        return [];
    }
}

// Função para converter timestamp Unix para data legível
// Função para converter timestamp Unix para data legível no formato DD/MM/YYYY
function convertTimestampToDate(timestamp) {
    const date = new Date(timestamp * 1000); // Multiplica por 1000 para converter de segundos para milissegundos

    // Obtém os componentes da data
    const day = String(date.getDate()).padStart(2, '0'); // Obtém o dia e adiciona zero à esquerda se necessário
    const month = String(date.getMonth() + 1).padStart(2, '0'); // O mês é baseado em 0, então adicionamos 1
    const year = date.getFullYear(); // Obtém o ano

    // Retorna a data formatada
    return `${day}/${month}/${year} ${date.toLocaleTimeString('pt-BR')}`; // Formata também a hora
}


// Função para processar o comando !cliente
async function processPlayerCommand(invoker, command) {
    const searchTerm = normalizeString(command.split(" ").slice(1).join(" "));  // Normalizar o termo de busca
    console.log(`Pesquisando por: ${searchTerm}`);
    const matches = await searchClientsByDescriptionOrNickname(searchTerm);

    if (matches.length > 0) {
        // Preparar a lista de clientes encontrados
        let response = "[b]Clientes encontrados:[/b]\n";
        for (const cliente of matches) {
            const lastConnectedDate = convertTimestampToDate(cliente.clientLastConnected); // Converter timestamp
        
            // Verificar se o IP do cliente é o que deve ser ocultado
            let clientIP = cliente.clientLastIP;
            if (clientIP === 'IP AQUI') {
                clientIP = '[IP ocultado]'; // Substituir o IP por uma mensagem personalizada
            }
        
            response += `
        [b]Nickname:[/b]     ${cliente.clientNickname}
        [b]Descrição:[/b]     ${cliente.clientDescription}
        [b]ID no Banco de dados:[/b]     ${cliente.clientDatabaseId}
        [b]Identificador Único:[/b]     ${cliente.clientUniqueIdentifier}
        [b]Total de conexões:[/b]     ${cliente.clientTotalConnections}
        [b]Último IP:[/b]     ${clientIP} 
        [b]Tempo Total Online:[/b]     ${cliente.clientTotalOnlineTime} segundos
        [b]Tempo Online no Mês:[/b]     ${cliente.clientMonthOnlineTime} segundos
        [b]Última Conexão:[/b]     ${lastConnectedDate}\n`;
        }
        

        // Enviar a resposta para o invoker
        await ts3.sendTextMessage(invoker.clid, 1, response);
    } else {
        // Nenhum cliente encontrado, enviar resposta apropriada
        await ts3.sendTextMessage(invoker.clid, 1, `[b]Não encontramos nenhum resultado para:[/b] ${searchTerm}.`);
    }
}

// Evento de mensagem de texto no TeamSpeak (funciona em qualquer tipo de chat: canal ou privado)
ts3.on("textmessage", async (event) => {
    const message = event.msg;
    const invoker = event.invoker;

    if (message.startsWith("!player")) {
        await processPlayerCommand(invoker, message);
    }
});

// Define o caminho para o arquivo JSON
const jsonnFilePath = path.join(__dirname, 'enemy_player.json');
let enemyPlayers = new Set();

// Função para carregar a lista de jogadores Enemigos do arquivo JSON
async function loadEnemyPlayers() {
    try {
        const data = await fs.readFile(jsonnFilePath, 'utf8');
        const json = JSON.parse(data);
        enemyPlayers = new Set(json.players || []);
        console.log('Jogadores Enemigos carregados:', Array.from(enemyPlayers));
    } catch (error) {
        console.error('Erro ao carregar os jogadores Enemigos:', error);
        enemyPlayers = new Set();
    }
}

// Função para salvar a lista de jogadores Enemigos no arquivo JSON
async function saveEnemyPlayers() {
    try {
        const json = { players: Array.from(enemyPlayers) };
        await fs.writeFile(jsonnFilePath, JSON.stringify(json, null, 2));
        console.log('Jogadores Enemigos salvos.');
    } catch (error) {
        console.error('Erro ao salvar os jogadores Enemigos:', error);
    }
}

// Função para adicionar um jogador à lista de Enemigos
async function addEnemyPlayer(playerName, user) {
    enemyPlayers.add(playerName);
    await saveEnemyPlayers();
    console.log(`Jogador '${playerName}' añadido a la lista de Enemigos.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Jogador '${playerName}' adicionado com sucesso.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateEnemyPlayerChannelDescription(canalHuntedIndividual);
}

// Função para remover um jogador da lista de Enemigos
async function removeEnemyPlayer(playerName, user) {
    enemyPlayers.delete(playerName);
    await saveEnemyPlayers();
    console.log(`Jogador '${playerName}' removido da lista de inimigos.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Jogador '${playerName}' excluido com sucesso.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateEnemyPlayerChannelDescription(canalHuntedIndividual);
}

// Atualiza a descrição do canal com base na lista de jogadores Enemigos
async function updateEnemyPlayerChannelDescription(channelId) {
    if (enemyPlayers.size === 0) {
        console.log("Ningún jugador enemigo configurado.");
        try {
            await ts3.channelEdit(channelId, {
                channel_name: "[cspaceri7]✖ Lista de Hunteds (0)✖",
                channel_description: "Nenhum jogador inimigo configurado."
            });
            console.log("Descrição do canal atualizada para 'Nenhum jogador inimigo configurado'.");
        } catch (error) {
            console.error("Erro ao atualizar a descrição do canal:", error);
        }
        return;
    }

    let channelDescription = "Jugadores enemigos online:\n\n";
    const currentOnlinePlayers = new Set();

    try {
        const response = await fetch(`https://api.tibiadata.com/v4/world/${mundo}`);
        const data = await response.json();

        if (data.world && data.world.online_players) {
            const onlinePlayers = data.world.online_players;

            for (const player of onlinePlayers) {
                if (enemyPlayers.has(player.name.toLowerCase())) { // Converte o nome do jogador online para minúsculas
                    channelDescription += `☠️[b][color=#228B22] ${player.name}[/b] [b] (Level ${player.level}, ${player.vocation})[/b]\n`;
                    currentOnlinePlayers.add(player.name);
                }
            }            
        }
    } catch (error) {
        console.error('Erro ao buscar informações do mundo:', error);
    }

    if (currentOnlinePlayers.size === 0) {
        channelDescription += "Não tem Hunted Online nesse momento.";
    }

    // Atualizar a descrição do canal
    try {
        await ts3.channelEdit(channelId, { channel_description: channelDescription });
        console.log("Descrição do canal atualizada com sucesso!");
    } catch (error) {
        console.error("Erro ao atualizar a descrição do canal:", error);
    }

    // Atualizar o nome do canal com a quantidade de jogadores online
    try {
        const onlineCount = currentOnlinePlayers.size;
        const channelName = `[cspaceri7]✖ Lista de Hunteds (${onlineCount})✖`;
        await ts3.channelEdit(channelId, { channel_name: channelName });
        console.log(`Nome do canal atualizado para: ${channelName}`);
    } catch (error) {
        console.error("Erro ao atualizar o nome do canal:", error);
    }
}

// Função para iniciar a atualização a cada 60 segundos
function startEnemyPlayerAutoUpdate(channelId, intervalMs = 60000) {
    updateEnemyPlayerChannelDescription(channelId); // Primeira execução imediata
    setInterval(() => {
        updateEnemyPlayerChannelDescription(channelId);
    }, intervalMs);
}

// Iniciar a atualização automática do canal de ID 91 a cada 60 segundos
startEnemyPlayerAutoUpdate(canalHuntedIndividual);

// Carregar a lista de jogadores Enemigos quando o bot iniciar
loadEnemyPlayers();

// Manipulação dos comandos de texto
ts3.on("textmessage", async (ev) => {
    const message = ev.msg.toLowerCase();
    const args = message.split(" ");

    if (message.startsWith("!addenemy")) {
        const playerName = args.slice(1).join(" "); // Captura o nome do jogador
        await addEnemyPlayer(playerName, ev.invoker);
    } else if (message.startsWith("!removeenemy")) {
        const playerName = args.slice(1).join(" "); // Captura o nome do jogador
        await removeEnemyPlayer(playerName, ev.invoker);
    }
});

//////////////////////////////
// Quando ocorrer um erro
ts3.on("error", (error) => {
    console.error("Erro:", error);
});
