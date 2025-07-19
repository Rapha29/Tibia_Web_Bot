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
  nickname: "corporation"       // Nome do bot
});

//// permissoes ////

const adminGroupID = 4161;
const masteradminGroupID = 4116;
const serveradminGroupID = 4178;
const mpoke =  4166;
const mmove = 4167;
const botadm = 4165;
const respblockGroupID = 4185;
const guildBank = 207;

//////// canais /////////
const canalAFK = 81;
const canalResp = 27;
const canalGuildAliada = 22;
const canalMakerAliado = 28;
const canalEnemy = 30;
const canalAliadoAdicional = 25;
const canalMakerInimigo = 31;
const canalHuntedIndividual = 33;


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
            throw new Error("Información del cliente no encontrada.");
        }

        // Verificar se o invoker está no grupo admin ou dev
        const clientServerGroups = clientInfo.servergroups || [];
        if (![adminGroupID, serveradminGroupID, botadm, masteradminGroupID].some(group => clientServerGroups.includes(group.toString()))) {
            ts3.sendTextMessage(invokerID, 1, "No tienes permiso para usar este comando.");
            return;
        }

        // Se o comando for !tempoafk sem argumento, mostrar o tempo atual
        if (args.length === 1) {
            ts3.sendTextMessage(invokerID, 1, `El tiempo AFK del servidor está configurado en ${afkTime} minutos. Para modificarlo, escribe !tempoafk <minutos>.`);
        } else {
            // Modificar o tempo AFK se um valor for especificado
            const newAfkTime = parseInt(args[1], 10);
            if (isNaN(newAfkTime) || newAfkTime <= 0) {
                ts3.sendTextMessage(invokerID, 1, "Por favor, proporciona un valor válido de minutos para el tiempo AFK.");
            } else {
                afkTime = newAfkTime;
                ts3.sendTextMessage(invokerID, 1, `El tiempo AFK del servidor ha sido cambiado a ${afkTime} minutos.`);
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


/////////////////////////////////////////////////////////
////////////////////////////////////////////////////////



/////////////////////////////////////////
// Caminho do arquivo JSON para salvar a guild principal
const guildFilePath = path.join(__dirname, 'set_guild.json');

// Função para salvar a guilda principal no arquivo JSON
async function saveGuild(guildName) {
    try {
        const data = JSON.stringify({ guild: guildName }, null, 2);
        await fs.writeFile(guildFilePath, data, 'utf8'); // Usando fs.writeFile diretamente
        console.log("Guild principal salva com sucesso.");
    } catch (error) {
        console.error("Erro ao salvar a guild principal:", error);
    }
}

// Função para carregar a guilda principal do arquivo JSON
async function loadGuild() {
    try {
        const data = await fs.readFile(guildFilePath, 'utf8'); // Usando fs.readFile diretamente
        return JSON.parse(data).guild || null;
    } catch (error) {
        console.error("Erro ao carregar a guild principal:", error);
        return null;
    }
}

// Função para definir a guilda principal
async function setGuild(guildName, invoker) {
    const currentGuild = await loadGuild();
    await saveGuild(guildName);
    await ts3.sendTextMessage(invoker.clid, 1, `Você trocou sua guild principal de ${currentGuild || "nenhuma"} para ${guildName}.`);
}

// Função para limpar a guilda principal
async function clearGuild(invoker) {
    await saveGuild(null);
    await ts3.sendTextMessage(invoker.clid, 1, "A guild principal foi removida.");
}

// Evento para ouvir mensagens de texto
ts3.on("textmessage", async (ev) => {
    const message = ev.msg.toLowerCase();
    const args = message.split(" ");

    if (message.startsWith("!setguild") || message.startsWith("!clearguild")) {
        // Verifica se o usuário é admin
        if (!(await isAdmin(ts3, ev.invoker.clid))) {
            await ts3.sendTextMessage(ev.invoker.clid, 1, "Você não tem permissão para usar este comando.");
            return;
        }

        if (message.startsWith("!setguild")) {
            const guildName = args.slice(1).join(" ").replace(/ /g, '%20'); // Substitui espaços por %20
            if (!guildName) {
                await ts3.sendTextMessage(ev.invoker.clid, 1, "Por favor, forneça o nome da guild.");
                return;
            }
            await setGuild(guildName, ev.invoker);
        } else if (message.startsWith("!clearguild")) {
            await clearGuild(ev.invoker);
        }
    }
});


// Caminho do arquivo JSON para salvar o mundo
const worldFilePath = path.join(__dirname, 'set_world.json');

// Função para salvar o mundo no arquivo JSON
async function saveWorld(worldName) {
    try {
        const data = JSON.stringify({ world: worldName }, null, 2);
        await fs.writeFile(worldFilePath, data, 'utf8'); // Usando fs.writeFile diretamente
        console.log("Mundo salvo com sucesso.");
    } catch (error) {
        console.error("Erro ao salvar o mundo:", error);
    }
}

// Função para carregar o mundo do arquivo JSON
async function loadWorld() {
    try {
        const data = await fs.readFile(worldFilePath, 'utf8'); // Usando fs.readFile diretamente
        return JSON.parse(data).world || null;
    } catch (error) {
        console.error("Erro ao carregar o mundo:", error);
        return null;
    }
}

// Função para definir o mundo
async function setWorld(worldName, invoker) {
    const currentWorld = await loadWorld();
    await saveWorld(worldName);
    await ts3.sendTextMessage(invoker.clid, 1, `Você trocou seu mundo de ${currentWorld || "nenhum"} para ${worldName}.`);
}

// Evento para ouvir mensagens de texto
ts3.on("textmessage", async (ev) => {
    const message = ev.msg.toLowerCase();
    const args = message.split(" ");

    if (message.startsWith("!setworld")) {
        // Verifica se o usuário é admin
        if (!(await isAdmin(ts3, ev.invoker.clid))) {
            await ts3.sendTextMessage(ev.invoker.clid, 1, "Você não tem permissão para usar este comando.");
            return;
        }

        const worldName = args.slice(1).join(" ").replace(/ /g, '%20'); // Substitui espaços por %20
        if (!worldName) {
            await ts3.sendTextMessage(ev.invoker.clid, 1, "Por favor, forneça o nome do mundo.");
            return;
        }
        await setWorld(worldName, ev.invoker);
    }
});




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////     MENSAGEM LEVEL UP    ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
let playerLevels = {};

// Função para verificar os jogadores da guilda
async function checkGuildMembers() {
    try {
      // Pega o nome da guilda principal
      const guildName = await loadGuild(); // Carrega o nome da guilda a partir do arquivo JSON
      if (!guildName) {
        console.log("Nenhuma guilda principal definida.");
        return;
      }

   // Carrega o mundo salvo
   const worldName = await loadWorld() || "Aethera"; // Usa "Aethera" como padrão caso o mundo não esteja salvo


      // Pega a lista de membros da guilda
      const guildResponse = await axios.get(`https://api.tibiadata.com/v4/guild/${guildName}`);
      const guildMembers = guildResponse.data.guild.members;
  
      // Pega a lista de jogadores online no mundo Inabra
      const worldResponse = await axios.get(`https://api.tibiadata.com/v4/world/${worldName}`);
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   MENSAGEM BOAS VINDAS  ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enviar mensagem de boas-vindas para qualquer cliente que se conectar
ts3.on("clientconnect", async (event) => {
    try {
        const welcomeMessages = [
            `[color=blue][b]Servidor Hospedado y Configurado por Tobot[/b] Actualizaciones e Innovaciones diarias![/color]`,
            `[color=green][b]Estamos en fase BETA y contamos con tu ayuda para mejorar el servicio! Actualizaciones e Innovaciones diarias.![/color]`,
            `[color=red][b]¡Bienvenido![/color]`
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

///////////////////////////////////////////////////////////////////////////////////////////////


// Evento de mensagem no TeamSpeak
ts3.on("textmessage", async (event) => {
    const message = event.msg.trim();
    
    if (message.startsWith("!loot")) {
        try {
            const lootData = message.replace("!loot", "").trim(); // Dados fornecidos após o comando
            const { totalBalance, balancePerPerson, people, transactions } = processLootData(lootData);
            
            let responseMessage = `[b]Profit Total: ${formatNumber(totalBalance)} gp[/b]\n`;
            responseMessage += `[b]Players na PT: ${people.size}[/b]\n`;
            responseMessage += `[b]Balance por char: ${formatNumber(balancePerPerson)} gp[/b]\n\n`;
            transactions.forEach(({ from, to, amount }) => {
                responseMessage += `[color=blue]${from}[/color] deverá pagar 💰 ${formatNumber(amount)} gp para [color=orange]${to}[/color].\nCopie e cole no npc: [b] transfer ${formatNumber(amount)} to ${to}[/b]\n\n`;
            });

            // Enviar a mensagem com os resultados para o invocador
            await ts3.sendTextMessage(event.invoker.clid, 1, responseMessage);
            

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
        while (giver.amount > 0 && receivers.length > 0) {
            const receiver = receivers[0]; // Pega o primeiro recebedor
            const paymentAmount = Math.min(giver.amount, receiver.amount); // Paga o valor mínimo entre o que falta pagar e receber
            
            transactions.push({ from: giver.name, to: receiver.name, amount: paymentAmount });
            
            giver.amount -= paymentAmount;
            receiver.amount -= paymentAmount;

            // Se o recebedor foi pago completamente, removemos ele da lista
            if (receiver.amount === 0) {
                receivers.shift();
            }
        }
    }
  
    return transactions;
}


function parseNumber(text) {
    return Number(text.replace(/,/g, ""));
}

function formatNumber(number) {
    return number.toString(); // Converte o número para string sem formatação adicional
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////      COMANDO !DESC     ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////           SCAN          ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
            throw new Error("Información del cliente no encontrada.");
        }

        // Verificar se o usuário pertence ao grupo com permissão (ID 9)
        const clientServerGroups = clientInfo.servergroups || [];
        if (![masteradminGroupID, botadm].some(group => clientServerGroups.includes(group.toString()))) {
            ts3.sendTextMessage(event.invoker.clid, 1, "No tienes permiso para usar este comando.");
            console.log(`Intento de uso no autorizado del comando !scan por ${event.invoker.nickname}`);
            return;
        }

        // Obter o nome do personagem após o comando "!scan"
        const characterName = message.slice(6).trim();

        if (!characterName) {
            ts3.sendTextMessage(event.invoker.clid, 1, "Por favor, proporciona un nombre de personaje para escanear.");
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
            let replyMessage = `[b][color=#7cac0e]Personaje:[/color][/b] ${characterData.name}\n`
                + `[b][color=#7cac0e]Mundo:[/color][/b] ${characterData.world}\n`
                + `[b][color=#7cac0e]Vocación:[/color][/b] ${characterData.vocation}\n`
                + `[b][color=#7cac0e]Nivel:[/color][/b] ${characterData.level}\n`
                + `[b][color=#7cac0e]Último inicio de sesión:[/color][/b] ${new Date(characterData.lastLogin).toLocaleString()}`;

            // Exibir personagens visíveis
            if (characterData.otherVisibleCharacters.length > 0) {
                replyMessage += `\n[b][color=#7cac0e]Otros personajes visibles:[/color][/b] ${characterData.otherVisibleCharacters.join(", ")}`;
            }

            // Exibir possíveis personagens invisíveis, exceto "Teste"
            if (characterData.possibleInvisibleCharacters.length > 0) {
                replyMessage += `\n[b][color=#7cac0e]Posibles personajes:[/color][/b]\n`;
                
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
            ts3.sendTextMessage(event.invoker.clid, 1, "Error al buscar información del personaje.");
        }
    } catch (error) {
        console.error("Erro ao verificar permissões ou processar o comando:", error);
    }
}

});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////        MASSPOKE        ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
                    ts3.sendTextMessage(event.invoker.clid, 1, "Por favor, proporciona un mensaje para el masspoke.");
                }
            } else {
                // Se o usuário não tiver permissão
                ts3.sendTextMessage(event.invoker.clid, 1, "No tienes permiso para usar este comando.");
                console.log(`Tentativa de uso não autorizado do comando !mp por ${event.invoker.nickname}`);
            }
        } catch (error) {
            console.error("Erro ao verificar permissões:", error);
        }
    }
});
});



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////       AFK CLIENT       ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////       RESPAWN LIST     ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// Tempos de respawn personalizados por grupo

  
const defaultRespawnTime = 180; // 3 horas em minutos
  
// Variável para controlar o estado de pausa global
let isRespawnPaused = false;

// Objeto para armazenar o número de respawns por cliente
let clientRespawnCount = {};

const extraRespawnTimes = {};

// Função para carregar o arquivo respawns.json
async function loadRespawnData() {
    const filePath = path.join(__dirname, 'respawns.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar os dados de respawn:", error);
        return {}; // Retorna um objeto vazio se o arquivo não existir
    }
}

// Função para carregar o arquivo fila_rushback.json
async function loadFilaRespawns() {
    const filePath = path.join(__dirname, 'fila_rushback.json');
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Erro ao carregar a fila de respawns:", error);
        return {}; // Retorna um objeto vazio se o arquivo não existir
    }
}

// Função para salvar no arquivo fila_rushback.json
async function saveFilaRespawns(filaRespawns) {
    const filePath = path.join(__dirname, 'fila_rushback.json');
    try {
        await fs.writeFile(filePath, JSON.stringify(filaRespawns, null, 2), 'utf8');
        console.log("Fila de respawns salva com sucesso.");
    } catch (error) {
        console.error("Erro ao salvar a fila de respawns:", error);
    }
}

// Função para verificar se o respawn é válido com base no respawns.json
async function isValidRespawn(respawnNumber) {
    const respawnData = await loadRespawnData();
    for (const city in respawnData) {
        if (respawnData[city][respawnNumber]) {
            return true;
        }
    }
    return false;
}

// Função para formatar o nome do usuário
async function formatClientName(nickname, uniqueIdentifier, clid) {
    const encodedNickname = nickname
        .replace(/\\/g, '%5C')
        .replace(/\[/g, '%5C%5B')
        .replace(/\]/g, '%5C%5D')
        .replace(/ /g, '%20');

    return `[URL=client://${clid}/${uniqueIdentifier}~${encodedNickname}]${nickname}[/URL]`;
}

async function updateRespawnChannel() {
  const respawnData = await loadRespawnData();
  const filaRespawns = await loadFilaRespawns();
  let description = "[b]Respawns Ativos:[/b]\n\n";
  description += "[table][tr][th]Respawn[/th][th]Ocupado por[/th][th]Tiempo restante[/th][th]Fila[/th][/tr]";

  for (const respawnNumber in filaRespawns) {
      const respawn = filaRespawns[respawnNumber];
      const respawnName = await getRespawnName(respawnNumber);

      if (respawn && respawn.current) {
          const clientInfo = await ts3.getClientById(respawn.current.clid);
          const formattedName = await formatClientName(clientInfo.nickname, clientInfo.uniqueIdentifier, clientInfo.clid);

          description += `[tr][td]${respawnNumber} (${respawnName})[/td]`;
          description += `[td]${formattedName}[/td]`;
          
          if (respawn.waitingForAccept) {
              description += `[td]Esperando aceptación (${respawn.acceptanceTime}m)[/td]`;
          } else {
              const hours = Math.floor(respawn.time / 60);
              const minutes = respawn.time % 60;
              description += `[td]${hours}h ${minutes}m[/td]`;
          }

          if (respawn.queue.length > 0) {
              const nextClient = respawn.queue[0];
              const nextClientInfo = await ts3.getClientById(nextClient.clid);
              const formattedNextClient = await formatClientName(nextClientInfo.nickname, nextClientInfo.uniqueIdentifier, nextClientInfo.clid);
              description += `[td]${formattedNextClient} (+${respawn.queue.length - 1})[/td][/tr]`;
          } else {
              description += "[td]Ninguna fila[/td][/tr]";
          }
      }
  }

  description += "[/table]";

  try {
      await ts3.channelEdit(27, { channel_description: description });
      console.log("Canal de respawn atualizado com sucesso.");
  } catch (error) {
      console.error("Erro ao atualizar o canal 6:", error);
  }
}

async function processRespawns() {
  if (isRespawnPaused) return;

  const filaRespawns = await loadFilaRespawns();
  let mudancas = false;

  for (const respawnKey in filaRespawns) {
      const respawn = filaRespawns[respawnKey];
      if (respawn.waitingForAccept) {
          respawn.acceptanceTime--;
          if (respawn.acceptanceTime <= 0) {
              const removedPlayer = respawn.current;
              if (respawn.queue.length > 0) {
                  const nextClient = respawn.queue.shift();
                  respawn.current = nextClient;
                  respawn.waitingForAccept = true;
                  respawn.acceptanceTime = 15; // 15 minutes to accept
                  await ts3.clientPoke(nextClient.clid, "¡Es tu turno! Escribe !aceitar para comenzar tu tiempo de respawn.");
              } else {
                  delete filaRespawns[respawnKey];
              }
              await ts3.sendTextMessage(removedPlayer.clid, 1, "Fuiste removido del respawn por no aceptar a tiempo.");
              mudancas = true;
          }
      } else if (respawn.current) {
          respawn.time--;
          if (respawn.time <= 0) {
              await ts3.sendTextMessage(respawn.current.clid, 1, "Tu tiempo de respawn ha terminado.");
              if (respawn.queue.length > 0) {
                  const nextClient = respawn.queue.shift();
                  respawn.current = nextClient;
                  respawn.waitingForAccept = true;
                  respawn.acceptanceTime = 15; // 15 minutes to accept
                  await ts3.clientPoke(nextClient.clid, "¡Es tu turno! Escribe !aceitar para comenzar tu tiempo de respawn.");
              } else {
                  delete filaRespawns[respawnKey];
              }
              mudancas = true;
          } else {
              mudancas = true; // Always set mudancas to true when time is reduced
          }
      }
  }

  if (mudancas) {
      await saveFilaRespawns(filaRespawns);
  }

  await updateRespawnChannel();
}

// Iniciar o processamento dos respawns a cada minuto
setInterval(processRespawns, 60000);

async function hasGuildBankPermission(clientInfo) {
    const clientServerGroups = clientInfo.servergroups || [];
    return !clientServerGroups.includes(respblockGroupID.toString());
}

// Função para adicionar tempo extra a um grupo específico
async function handleAddExtraTimeCommand(client, groupId, extraTime) {
    const clientInfo = await ts3.getClientById(client.clid);

    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "No tienes permiso para usar el comando !addextratime.");
        return;
    }

    const groupIdNumber = parseInt(groupId);
    const extraTimeMinutes = parseInt(extraTime);

    if (isNaN(groupIdNumber) || isNaN(extraTimeMinutes)) {
        await ts3.sendTextMessage(client.clid, 1, "Por favor, proporciona un ID de grupo y un tiempo extra válidos.");
        return;
    }

    extraRespawnTimes[groupIdNumber] = extraTimeMinutes;
    await ts3.sendTextMessage(client.clid, 1, `Tiempo extra de ${extraTimeMinutes} minutos añadido al grupo ${groupIdNumber}.`);
}

// Função para obter o tempo de respawn com base no grupo do usuário
// Função para obter o tempo de respawn com base no grupo do usuário
async function getRespawnTime(clientInfo) {
  const clientServerGroups = clientInfo.servergroups || [];  // IDs dos grupos do cliente
  let baseTime = defaultRespawnTime;  // Tempo padrão (180 minutos)
  let extraTime = 0;  // Tempo extra

  console.log('Grupos do cliente:', clientServerGroups);  // Adiciona um log para ver os grupos do cliente

  // Verifica o tempo personalizado para cada grupo
  for (const groupId in customRespawnTimes) {
      console.log('Verificando grupo:', groupId);  // Log para verificar o grupo
      if (clientServerGroups.includes(groupId)) {  // Verifique se o grupo existe (como string)
          baseTime = customRespawnTimes[groupId];  // Altera o tempo de respawn com base no grupo do cliente
          console.log('Tempo de respawn para o grupo encontrado:', baseTime);  // Log para verificar o tempo
          break;  // Se encontrado, não precisa continuar a busca
      }
  }

  // Verifica os tempos de respawn adicionais baseados em grupos
  for (const groupId in extraRespawnTimes) {
      if (clientServerGroups.includes(groupId)) {  // Verifique se o grupo existe (como string)
          extraTime += extraRespawnTimes[groupId];  // Soma o tempo adicional para o cliente
      }
  }

  console.log('Tempo final de respawn:', baseTime + extraTime);  // Log para ver o tempo final
  return baseTime + extraTime;  // Retorna o tempo total de respawn
}



// Função para lidar com o comando !resp
async function handleRespCommand(client, respawnNumber) {
    const clientInfo = await ts3.getClientById(client.clid);

    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    if (!await hasGuildBankPermission(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "No tienes permiso para usar el comando !resp.");
        return;
    }

    if (!await isValidRespawn(respawnNumber)) {
        await ts3.sendTextMessage(client.clid, 1, `El respawn número ${respawnNumber} no es válido.`);
        return;
    }

    const clientServerGroups = clientInfo.servergroups || [];
    const isExempt = clientServerGroups.includes(serveradminGroupID.toString()) || 
                     clientServerGroups.includes(masteradminGroupID.toString());

    if (!clientRespawnCount[client.clid]) {
        clientRespawnCount[client.clid] = { current: 0, daily: 0, lastReset: new Date() };
    }

    const now = new Date();
    if (now.getDate() !== clientRespawnCount[client.clid].lastReset.getDate()) {
        clientRespawnCount[client.clid].daily = 0;
        clientRespawnCount[client.clid].lastReset = now;
    }

    if (!isExempt) {
        if (clientRespawnCount[client.clid].current >= 1000) {
            await ts3.sendTextMessage(client.clid, 1, "Ya has alcanzado el límite de 2 respawns simultáneos.");
            return;
        }

        if (clientRespawnCount[client.clid].daily >= 1000) {
            await ts3.sendTextMessage(client.clid, 1, "Ya has alcanzado el límite de 3 respawns por día.");
            return;
        }
    }

    const clientData = {
        clid: client.clid,
        clientNickname: client.nickname,
        clientUniqueIdentifier: clientInfo.uniqueIdentifier
    };

    const filaRespawns = await loadFilaRespawns();
    const respawnKey = respawnNumber;

    if (filaRespawns[respawnKey] && 
        (filaRespawns[respawnKey].current.clid === client.clid || 
         filaRespawns[respawnKey].queue.some(user => user.clid === client.clid))) {
        await ts3.sendTextMessage(client.clid, 1, "Ya estás en este respawn o en tu cola.");
        return;
    }

    const activeRespawnCount = Object.values(filaRespawns).filter(respawn => 
        respawn.current.clid === client.clid || 
        respawn.queue.some(user => user.clid === client.clid)
    ).length;

    if (!isExempt && activeRespawnCount >= 1000) {
        await ts3.sendTextMessage(client.clid, 1, "Ya estás en 2 respawns. Usa !respdel para salir de uno de ellos antes de entrar en otro.");
        return;
    }

    const respawnTime = await getRespawnTime(clientInfo, respawnNumber);

    if (!filaRespawns[respawnKey]) {
        filaRespawns[respawnKey] = { 
            current: clientData, 
            queue: [], 
            time: respawnTime,
            waitingForAccept: true,
            acceptanceTime: 15 // 15 minutes to accept
        };
        const respawnData = await loadRespawnData();
        const respawnName = await getRespawnName(respawnNumber);
        await ts3.sendTextMessage(client.clid, 1, `Estás en el respawn de ${respawnName} (${respawnNumber}). Escribe !aceitar para comenzar tu tiempo de ${respawnTime / 60} horas.`);
        
        if (!isExempt) {
            clientRespawnCount[client.clid].current++;
            clientRespawnCount[client.clid].daily++;
        }
    } else {
        filaRespawns[respawnKey].queue.push(clientData);
        const respawnName = await getRespawnName(respawnNumber);
        await ts3.sendTextMessage(client.clid, 1, `Te has unido a la cola del respawn ${respawnName} (${respawnNumber}). Espera tu turno.`);
    }

    await saveFilaRespawns(filaRespawns);
    await updateRespawnChannel();
}

// Função para lidar com o comando !respdel
async function handleRespDelCommand(client, respawnNumber) {
    const clientInfo = await ts3.getClientById(client.clid);

    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    if (!await hasGuildBankPermission(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "No tienes permiso para usar el comando !respdel.");
        return;
    }

    const filaRespawns = await loadFilaRespawns();
    const respawnKey = `${respawnNumber}`;
    const respawn = filaRespawns[respawnKey];

    if (!respawn) {
        await ts3.sendTextMessage(client.clid, 1, "Respawn no encontrado.");
        return;
    }

    if (respawn.current && respawn.current.clid === client.clid) {
        if (respawn.queue.length > 0) {
            const nextClient = respawn.queue.shift();
            respawn.current = nextClient;
            respawn.waitingForAccept = true;
            respawn.acceptanceTime = 15; // 15 minutes to accept
            
            await ts3.clientPoke(nextClient.clid, "¡Es tu turno! Escribe !aceitar para comenzar tu tiempo de respawn.");
        } else {
            delete filaRespawns[respawnKey];
        }

        if (clientRespawnCount[client.clid]) {
            clientRespawnCount[client.clid].current--;
        }

        await ts3.sendTextMessage(client.clid, 1, `Has salido del respawn  - ${respawnNumber}.`);
    } else {
        const index = respawn.queue.findIndex(user => user.clid === client.clid);
        if (index !== -1) {
            respawn.queue.splice(index, 1);
            await ts3.sendTextMessage(client.clid, 1, `Has sido removido de la cola del respawn - ${respawnNumber}.`);
        } else {
            await ts3.sendTextMessage(client.clid, 1, "No estás en este respawn ni en la cola.");
        }
    }

    await saveFilaRespawns(filaRespawns);
    await updateRespawnChannel();
}

// Função para verificar se o cliente pertence ao grupo de admin
async function isMasterAdm(clientInfo) {
    const clientServerGroups = clientInfo.servergroups || [];
    return clientServerGroups.includes(masteradminGroupID.toString());
}

// Função para lidar com o comando !respkick
async function handleRespKickCommand(client, respawnNumber) {
    const clientInfo = await ts3.getClientById(client.clid);

    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "No tienes permiso para usar el comando !respkick.");
        return;
    }

    const filaRespawns = await loadFilaRespawns();
    const respawnKey = `${respawnNumber}`;
    const respawn = filaRespawns[respawnKey];

    if (!respawn) {
        await ts3.sendTextMessage(client.clid, 1, `Respawn - ${respawnNumber} no encontrado.`);
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
            respawn.acceptanceTime = 15; // 15 minutes to accept
            
            await ts3.clientPoke(nextClient.clid, "¡Es tu turno! Escribe !aceitar para comenzar tu tiempo de respawn.");
        } else {
            delete filaRespawns[respawnKey];
        }

        await ts3.sendTextMessage(client.clid, 1, `El jugador ${kickedClient.clientNickname} fue removido del respawn  - ${respawnNumber}.`);
    } else {
        await ts3.sendTextMessage(client.clid, 1, "No hay jugador en el respawn en este momento.");
    }

    await saveFilaRespawns(filaRespawns);
    await updateRespawnChannel();
}
const respawnTimesFile = path.join(__dirname, 'respawnTimes.json');

// Tempo padrão de respawn (180 minutos)


// Inicializa o objeto para armazenar os tempos de respawn
let customRespawnTimes = {}; 

// Função para carregar os tempos de respawn do arquivo JSON
async function loadRespawnTimes() {
  try {
      const data = await fs.readFile(respawnTimesFile, 'utf-8');
      customRespawnTimes = JSON.parse(data); // Agora permitido porque customRespawnTimes é "let"
      console.log('Tempos de respawn carregados com sucesso:', customRespawnTimes);
  } catch (error) {
      if (error.code === 'ENOENT') {
          // O arquivo não existe; cria um arquivo vazio
          await saveRespawnTimes();
          console.log('Arquivo respawnTimes.json criado.');
      } else {
          console.error('Erro ao carregar o arquivo respawnTimes.json:', error);
      }
  }
}

async function saveRespawnTimes() {
  try {
      await fs.writeFile(respawnTimesFile, JSON.stringify(customRespawnTimes, null, 2));
      console.log('Tempos de respawn salvos com sucesso.');
  } catch (error) {
      console.error('Erro ao salvar o arquivo respawnTimes.json:', error);
  }
}

// Função para lidar com o comando !setrespawntime
async function handleSetRespawnTimeCommand(client, groupId, time) {
  const clientInfo = await ts3.getClientById(client.clid);

  if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.");
  }

  if (!await isMasterAdm(clientInfo)) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !setrespawntime.");
      return;
  }

  const groupIdNumber = parseInt(groupId);
  const timeInMinutes = parseInt(time);

  if (isNaN(groupIdNumber) || isNaN(timeInMinutes)) {
      await ts3.sendTextMessage(client.clid, 1, "Por favor, forneça um ID de grupo e um tempo válidos.");
      return;
  }

  // Atualiza o tempo de respawn no objeto
  customRespawnTimes[groupIdNumber] = timeInMinutes;

  // Salva os tempos de respawn no arquivo JSON
  await saveRespawnTimes();

  await ts3.sendTextMessage(client.clid, 1, `Tempo de respawn para o grupo ${groupIdNumber} definido como ${timeInMinutes} minutos.`);
}

// Função para verificar se o cliente é um administrador mestre (ou qualquer outra lógica de permissão)
async function isMasterAdm(clientInfo) {
  const clientServerGroups = clientInfo.servergroups || [];
  return clientServerGroups.includes(masteradminGroupID.toString());
}

// Carrega os tempos de respawn na inicialização do script
loadRespawnTimes();
// Função para lidar com o comando !respinfo
async function handleRespInfoCommand(client, respawnNumber) {
    const clientInfo = await ts3.getClientById(client.clid);

    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    if (!await hasGuildBankPermission(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "No tienes permiso para usar el comando !respinfo.");
        return;
    }

    if (!await isValidRespawn(respawnNumber)) {
        await ts3.sendTextMessage(client.clid, 1, `El respawn - ${respawnNumber} no es válido.`);
        return;
    }

    const filaRespawns = await loadFilaRespawns();
    const respawnKey = `${respawnNumber}`;
    const respawn = filaRespawns[respawnKey];
    if (!respawn) {
        await ts3.sendTextMessage(client.clid, 1, `No hay información para el respawn - ${respawnNumber}.`);
        return;
    }

    const respawnData = await loadRespawnData();
    const respawnName = respawnData[respawnNumber];
    let infoMessage = `Informações sobre o respawn - ${respawnNumber} (${respawnName}):\n\n`;

    if (respawn.current) {
        infoMessage += `Ocupado por: ${respawn.current.clientNickname}\n`;
        if (respawn.waitingForAccept) {
            infoMessage += `Esperando aceptación: ${respawn.acceptanceTime} minutos restantes\n`;
        } else {
            infoMessage += `Tiempo restante: ${Math.floor(respawn.time / 60)}h ${respawn.time % 60}m\n`;
        }
        infoMessage += '\n';
    } else {
        infoMessage += "Actualmente libre\n\n";
    }

    if (respawn.queue.length > 0) {
        infoMessage += "Cola:\n";
        respawn.queue.forEach((user, index) => {
            infoMessage += `  ${index + 1}. ${user.clientNickname}\n`;
        });
    } else {
        infoMessage += "Cola: Vazia\n";
    }

    await ts3.sendTextMessage(client.clid, 1, infoMessage);
}

// Função para lidar com o comando !respstop
async function handleRespStopCommand(client) {
    const clientInfo = await ts3.getClientById(client.clid);

    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "No tienes permiso para usar el comando !respstop.");
        return;
    }

    if (isRespawnPaused) {
        await ts3.sendTextMessage(client.clid, 1, "El sistema de respawn ya está pausado.");
        return;
    }

    isRespawnPaused = true;
    await ts3.sendTextMessage(client.clid, 1, "El sistema de respawn ha sido pausado. Usa !respstart para reanudar.");
}

// Função para lidar com o comando !respstart
async function handleRespStartCommand(client) {
    const clientInfo = await ts3.getClientById(client.clid);

    if (!clientInfo) {
        throw new Error("Información del cliente no encontrada.");
    }

    if (!await isMasterAdm(clientInfo)) {
        await ts3.sendTextMessage(client.clid, 1, "No tienes permiso para usar el comando !respstart.");
        return;
    }

    if (!isRespawnPaused) {
        await ts3.sendTextMessage(client.clid, 1, "El sistema de respawn no está pausado.");
        return;
    }

    isRespawnPaused = false;
    await ts3.sendTextMessage(client.clid, 1, "El sistema de respawn ha sido reanudado.");
}

// Função para lidar com o comando !aceitar
async function handleAceitarCommand(client) {
    const filaRespawns = await loadFilaRespawns();
    for (const respawnKey in filaRespawns) {
        const respawn = filaRespawns[respawnKey];
        if (respawn.current && respawn.current.clid === client.clid && respawn.waitingForAccept) {
            respawn.waitingForAccept = false;
            const clientInfo = await ts3.getClientById(client.clid);
            respawn.time = await getRespawnTime(clientInfo);
            await ts3.sendTextMessage(client.clid, 1, `Has aceptado el respawn ${respawnKey}. Tu tiempo de ${respawn.time / 60} horas ha comenzado.`);
            await saveFilaRespawns(filaRespawns);
            await updateRespawnChannel();
            return;
        }
    }
    await ts3.sendTextMessage(client.clid, 1, "No tienes ningún respawn para aceptar en este momento.");
}

async function getRespawnName(respawnNumber) {
    const respawnData = await loadRespawnData();
    for (const city in respawnData) {
        if (respawnData[city][respawnNumber]) {
            return `${city} - ${respawnData[city][respawnNumber]}`;
        }
    }
    return "Desconhecido";
}

// Evento para capturar a mensagem de texto
ts3.on("textmessage", (ev) => {
    const message = ev.msg.toLowerCase();
    const args = message.split(" ");

    if (message.startsWith("!resp ")) {
        const respawnNumber = args[1];
        handleRespCommand(ev.invoker, respawnNumber);
    } else if (message.startsWith("!respdel ")) {
        const [, respawnNumber] = args;
        handleRespDelCommand(ev.invoker, respawnNumber);
    } else if (message.startsWith("!respkick ")) {
        const [, respawnNumber] = args;
        handleRespKickCommand(ev.invoker, respawnNumber);
    } else if (message.startsWith("!setrespawntime ")) {
        const groupId = args[1];
        const time = args[2];
        handleSetRespawnTimeCommand(ev.invoker, groupId, time);
    } else if (message.startsWith("!addextratime ")) {
        const groupId = args[1];
        const extraTime = args[2];
        handleAddExtraTimeCommand(ev.invoker, groupId, extraTime);
    } else if (message.startsWith("!respinfo ")) {
        const respawnNumber = args[1];
        handleRespInfoCommand(ev.invoker, respawnNumber);
    } else if (message === "!respstop") {
        handleRespStopCommand(ev.invoker);
    } else if (message === "!respstart") {
        handleRespStartCommand(ev.invoker);
    } else if (message === "!aceitar") {
        handleAceitarCommand(ev.invoker);
    }
});

// Carregar os dados de respawn ao iniciar
loadRespawnData();

// Iniciar o processamento dos respawns a cada minuto
setInterval(processRespawns, 60000);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////      COMANDO HELP      ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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

        [b]!loot[/b]
        [i]Faz a divisão dos loots.[/i]
        `;

        // Se for administrador, exibe também os comandos de administração
        if (isAdminUser) {
            helpMessage += `
            [b]Administración:[/b]

            [b]!mp <mensaje>[/b]
            [i]Envía un mensaje a todos los miembros del canal actual en TeamSpeak.[/i]

            [b]!masskick <mensaje>[/b]
            [i]Expulsa a todos los usuarios del canal actual.[/i]

            [b]!massmove <mensaje>[/b]
            [i]Traslada a todos los usuarios a tu canal.[/i]

            [b]!scan <personaje>[/b]
            [i]Verifica personajes invisibles de alguien en Tibia.[/i]
        
            [b]Guilds:[/b]

            [b]!addguildenemy <guild>[/b]
            [i]Agrega una guild a la lista de guilds enemigas.[/i]

            [b]!removeguildenemy <guild>[/b]
            [i]Elimina una guild de la lista de guilds enemigas.[/i]

            [b]!addguildally <guild>[/b]
            [i]Agrega una guild a la lista de guilds aliados.[/i]

            [b]!removeguildally <guild>[/b]
            [i]Elimina una guild de la lista de guilds aliados.[/i]
        
            [b]Lista de Respawns:[/b]

            [b]!resp <número>[/b]
            [i]Te añade a un respawn o a la cola del respawn especificado por el número.[/i]

            [b]!respdel <número>[/b]
            [i]Te quita del respawn o de la cola del respawn especificado por el número.[/i]

            [b]!respkick <número>[/b]
            [i]Elimina al jugador actual del respawn especificado por el número.[/i]

            [b]!respinfo <número>[/b]
            [i]Muestra información detallada sobre el respawn especificado por el número.[/i]

            [b]!respstop[/b]
            [i]Pausa todos los temporizadores de respawn activos.[/i]

            [b]!respstart[/b]
            [i]Reanuda todos los temporizadores de respawn pausados.[/i]

            [b]!addenemy[/b]
            [i]Añade un enemigo individualmente.[/i]

            [b]!removeenemy[/b]
            [i]Elimina un enemigo individualmente.[/i]
        
            [b]Configuraciones:[/b]

            [b]!setguild <Nombre del Guild>[/b]
            [i]Configura el guild en TS3.[/i]

            [b]!setworld[/b]
            [i]Configura el world en TS3.[/i]

            [b]!tempoafk <número>[/b]
            [i]Modifica el tiempo de inactividad (AFK) para ser movido.[/i]

            [b]!tempoafk[/b]
            [i]Muestra el tiempo establecido para enviar al cliente al canal de AFK.[/i]

            [b]!setrespawntime <groupId> <time>[/b]
            [i]Establece el tiempo de respawn para un grupo específico.[/i]

            [b]!addextratime <groupId> <time>[/b]
            [i]Añade tiempo extra de respawn para un grupo específico.[/i]

            [b]!viewmaker[/b]
            [i]Muestra todas las reglas, y al utilizar !viewmaker Nombre de la Regla, muestra esa regla específica.[/i]

            [b]!setmaker "Nombre de la Regla" LevelMin-LevelMax "Elder Druid, Master Sorcerer" Mundo GroupID[/b]
            [i]Define las reglas de makers del servidor, ejemplo de comando: !setmaker "Inabra Maker" 49-110 "Elder Druid, Master Sorcerer" Inabra 75[/i]

            [b]!clearmaker Nombre de la Regla[/b]
            [i]Elimina la regla de maker.[/i]
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   ADIcONAR GUILD ALIADA ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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


const onlineTimes = {}; // Objeto para armazenar os tempos de entrada de cada jogador

// Função para formatar o tempo online (em minutos)
function formatTimeOnline(playerName) {
    const timestamp = onlineTimes[playerName];
    if (!timestamp) {
        return 'Desconhecido'; // Se o jogador não tiver tempo registrado, retorna "Desconhecido"
    }

    const now = Date.now();
    const duration = now - timestamp;
    const minutes = Math.floor(duration / (1000 * 60)); // Calcula o tempo em minutos
    return `${minutes} min`;
}

// Função para atualizar as descrições dos jogadores no canal
async function updateChannelDescriptionWithGuildInfo(channelId) {
    const guildUrl = 'https://api.tibiadata.com/v4/guild/Rushback';
  
    try {
        const response = await fetch(guildUrl);
        const data = await response.json();

        if (data.guild && data.guild.members) {
            const onlineMembers = data.guild.members.filter(member => member.status === "online");
            const onlineCount = onlineMembers.length;

            // Atualiza o nome do canal com o número de membros online
            const newChannelName = `[cspacerJp]✖ Friend (${onlineCount}) ✖`;
            try {
                await ts3.channelEdit(channelId, { channel_name: newChannelName });
                console.log(`Nome do canal atualizado para: ${newChannelName}`);
            } catch (error) {
                console.error("Erro ao atualizar o nome do canal:", error);
            }

            if (onlineCount === 0) {
                console.log("Nenhum membro da guilda está online.");
                return;
            }

            const clients = await getAllClients();
  
            // Atualizar descrições dos clientes no JSON
            await updateClientDescriptions(clients);
  
            // Carregar as descrições atualizadas
            const clientDescriptions = await loadClientDescriptions();
  
            // Organiza os membros online no jogo por vocação
            const vocations = {
                "Elder Druid": [],
                "Master Sorcerer": [],
                "Elite Knight": [],
                "Royal Paladin": []
            };

            // Adiciona os membros online, calculando o tempo de entrada
            for (const member of onlineMembers) {
                const { name, level, vocation } = member;
  
                // Verifica o status e calcula o tempo online
                let status;
                if (clientDescriptions[name]) {
                    const isOnlineInTS = await checkPlayerStatus(name);
                    status = isOnlineInTS ? "✅" : "❎"; // ✅ = online no TS, ❎ = apenas no jogo
                } else {
                    status = "⚠️"; // ⚠️ = jogador sem registro
                }

                // Registra o tempo do jogador online
                if (!onlineTimes[name]) {
                    onlineTimes[name] = Date.now(); // Registra o tempo de entrada do jogador
                }

                // Adiciona o jogador na categoria correta (por vocação)
                if (vocations[vocation]) {
                    vocations[vocation].push({ name, level, status, onlineTime: formatTimeOnline(name) });
                }
            }
  
            // Gerar a nova descrição do canal
            let channelDescription = "✅ Player online in game and TS | ❎ Player online in game, but not in TS | ⚠️ Player unregistered\n\n";
  
            // Adiciona cada vocação e seus membros à descrição do canal
            Object.keys(vocations).forEach(vocation => {
                if (vocations[vocation].length > 0) {
                    channelDescription += `[b][size=+1]${vocation}:[/b]\n`;
                    vocations[vocation].forEach(member => {
                        channelDescription += ` [b][color=#7cac0e] ${member.name} [/b] [b](Level ${member.level})[/b] ${member.status} (Online por: ${member.onlineTime})\n`;
                    });
                    channelDescription += '\n';
                }
            });
  
            console.log("Nova descrição do canal:", channelDescription);
  
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
startAutoUpdate(29);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   ADIONAR MAKER LIST   ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Função para verificar e organizar Makers online por vocação e nível usando a API da guilda
async function updateMakersOnlineWithGuildInfo(channelId) {
    try {
        // Carregar o nome da guilda a partir do arquivo JSON
        const guildName = await loadGuild();  // Carrega o nome da guilda
        if (!guildName) {
            console.log("Nenhuma guilda principal definida.");
            return;
        }

        const guildUrl = `https://api.tibiadata.com/v4/guild/${guildName}`; // Usa o nome da guilda carregado

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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   ADIONAR ENEMY GUILD  ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
  
  // Função para adicionar uma guilda à lista de inimigos
  async function addEnemyGuild(guildName, user) {
      enemyGuilds.add(guildName);
      await saveEnemyGuilds();
      console.log(`Guilda '${guildName}' adicionada à lista de inimigos.`);
  
      // Enviar mensagem de confirmação no chat
      await ts3.sendTextMessage(user.clid, 1, `Guilda '${guildName}' adicionada com sucesso!`);
      
      // Atualizar a descrição do canal imediatamente
      await updateEnemyGuildChannelDescription(canalEnemy);
  }
  
  // Função para remover uma guilda da lista de inimigos
  async function removeEnemyGuild(guildName, user) {
      enemyGuilds.delete(guildName);
      await saveEnemyGuilds();
      console.log(`Guilda '${guildName}' removida da lista de inimigos.`);
  
      // Enviar mensagem de confirmação no chat
      await ts3.sendTextMessage(user.clid, 1, `Guilda '${guildName}' removida com sucesso!`);
      
      // Atualizar a descrição do canal imediatamente
      await updateEnemyGuildChannelDescription(canalEnemy);
  }
  
  
  // Atualiza a descrição do canal com base na lista de guildas inimigas e notifica novos jogadores online
  async function updateEnemyGuildChannelDescription(channelId) {
      if (enemyGuilds.size === 0) {
          console.log("Nenhuma guilda inimiga configurada.");
          try {
              await ts3.channelEdit(channelId, {
                  channel_name: "[cspaceri7]✖ Inimigos (0)✖", // Atualiza o nome do canal para 0 inimigos online
                  channel_description: "Nenhuma guilda inimiga configurada."
              });
              console.log("Descrição do canal atualizada para 'Nenhuma guilda inimiga configurada'.");
          } catch (error) {
              console.error("Erro ao atualizar a descrição do canal:", error);
          }
          return;
      }
  
      let channelDescription = "Membros das guildas inimigas online:\n\n";
      const currentOnlinePlayers = new Set(); // Armazena jogadores online atualmente
  
      for (const guildName of enemyGuilds) {
          const guildUrl = `https://api.tibiadata.com/v4/guild/${guildName}`; // URL da guilda inimiga
          try {
              const response = await fetch(guildUrl);
              const data = await response.json();
  
              if (data.guild && data.guild.members) {
                  const onlineMembers = data.guild.members.filter(member => member.status === "online");
  
                  if (onlineMembers.length) {
                      // Organizar por vocações
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
  
                          // Adiciona o jogador ao conjunto de jogadores online atuais
                          currentOnlinePlayers.add(name);
                      }
  
                      // Gerar descrição do canal
                      channelDescription += `Membros da guilda '${guildName}' online:\n\n`;
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
          const channelName = `[cspaceri7]✖ Inimigos (${onlineCount})✖`; // Atualiza o nome com a quantidade de inimigos online
          await ts3.channelEdit(channelId, { channel_name: channelName });
          console.log(`Nome do canal atualizado para: ${channelName}`);
      } catch (error) {
          console.error("Erro ao atualizar o nome do canal:", error);
      }
  }
  
  
  
  // Exemplo de uso: iniciar a atualização automática do canal de ID 34 a cada 60 segundos
  startEnemyGuildAutoUpdate(canalEnemy);
  
  
  
  // Função para iniciar a atualização a cada 60 segundos
  function startEnemyGuildAutoUpdate(channelId, intervalMs = 60000) {
      updateEnemyGuildChannelDescription(channelId); // Primeira execução imediata
      setInterval(() => {
          updateEnemyGuildChannelDescription(channelId);
      }, intervalMs);
  }
  
  // Exemplo de uso: iniciar a atualização automática do canal de ID 34 a cada 60 segundos
  startEnemyGuildAutoUpdate(canalEnemy);
  
  // Carregar a lista de guildas inimigas quando o bot iniciar
  loadEnemyGuilds();
  
  // Manipulação dos comandos de texto
  ts3.on("textmessage", async (ev) => {
      const message = ev.msg.toLowerCase();
      const args = message.split(" ");
  
      if (message.startsWith("!addguildenemy")) {
          const guildName = args.slice(1).join(" "); // Captura o nome da guilda
          await addEnemyGuild(guildName, ev.invoker);
      } else if (message.startsWith("!removeguildenemy")) {
          const guildName = args.slice(1).join(" "); // Captura o nome da guilda
          await removeEnemyGuild(guildName, ev.invoker);
      }
  });



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////         ADICIONAR + ALIADOS       ////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////         MASSMOVE       ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
            await ts3.sendTextMessage(senderClid, 1, "No tienes permisos para usar el comando !massmove.");
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////     MASSKICK     ///////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


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

            // Obter informações completas do cliente
            const clientInfo = await ts3.getClientById(clid);
            if (!clientInfo) {
                console.error(`Não foi possível obter informações do cliente ${clid}.`);
                continue;
            }

            // Verifica se o cliente está no mesmo canal e não é o invoker
            if (clientInfo.cid === senderChannelId && clid !== senderClid) {
                await ts3.clientKick(clid, 5, kickReason);
                console.log(`Cliente ${clientInfo.clientNickname} kickado por: ${kickReason}`);
            }
        }

        // Enviar uma mensagem para o invoker confirmando o kick dos clientes
        await ts3.sendTextMessage(senderClid, 1, `Todos los clientes en el canal fueron expulsados con la razón: "${kickReason}".`);

    } catch (error) {
        console.error("Erro ao kickar clientes no mesmo canal:", error);
        await ts3.sendTextMessage(senderClid, 1, "Ocurrió un error al intentar expulsar a los clientes en el mismo canal.");
    }
}

// Função para processar o comando !masskick
async function handleMassKickCommand(ts3, senderClid, message) {
    try {
        const isAdminUser = await isAdmin(ts3, senderClid); // Verifica se o invoker é admin
        if (isAdminUser) {
            // Obter a razão do kick a partir da mensagem do comando
            const kickReason = message.slice(11).trim(); // Remove "!masskick " do início da mensagem

            if (kickReason) {
                await kickAllClientsInSameChannel(ts3, senderClid, kickReason); // Kicka todos no mesmo canal com a razão
            } else {
                await ts3.sendTextMessage(senderClid, 1, "Por favor, proporciona una razón para la expulsión después del comando !masskick.");
            }
        } else {
            console.error("Você não tem permissões para usar este comando.");
            await ts3.sendTextMessage(senderClid, 1, "No tienes permisos para usar el comando !masskick.");
        }
    } catch (error) {
        console.error("Erro ao processar comando !masskick:", error);
    }
}

// Evento para processar mensagens de texto
ts3.on("textmessage", async (event) => {
    const message = event.msg.trim();
    const senderClid = event.invoker.clid;

    if (message.startsWith("!masskick")) {
        await handleMassKickCommand(ts3, senderClid, message);
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////          FIM           ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


////////////////////////////////////////

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
                "Unknown Vocation": [] // Caso a vocação não seja identificada
            };

            for (const member of onlineMakers) {
                const { name, level, vocation } = member;
                // Agrupa por vocação ou coloca em "Unknown Vocation" se a vocação for inválida
                const vocationGroup = vocations[vocation] ? vocation : "Unknown Vocation";
                vocations[vocationGroup].push({ name, level });
            }

            // Gerar a nova descrição do canal com a lista de personagens por vocação
            let channelDescription = "✅ Personajes en línea debajo del nivel 100:\n\n";

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


/////////////////////////////


async function isEditor(ts3, clid) {
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
        return [masteradminGroupID, botadm].some(group => clientServerGroups.includes(group.toString()));
    } catch (error) {
        console.error("Erro ao verificar se o cliente é admin:", error);
        return false;
    }
}

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
    
    const isInvokerEditor = await isEditor(ts3, invoker.clid); // Verificar se o invocador é um "IsEditor"
    const matches = await searchClientsByDescriptionOrNickname(searchTerm);

    if (matches.length > 0) {
        // Preparar a lista de clientes encontrados
        let response = "[b]Clientes encontrados:[/b]\n";
        for (const cliente of matches) {
            const lastConnectedDate = convertTimestampToDate(cliente.clientLastConnected); // Converter timestamp
        
            // Verificar se o IP é o específico a ser ocultado
            let clientIP = cliente.clientLastIP === '69.62.98.88' 
                ? '[IP ocultado]'  // Ocultar sempre este IP específico
                : (isInvokerEditor ? cliente.clientLastIP : '[IP ocultado]');
        
            response += `
        [b]Nickname:[/b]     ${cliente.clientNickname}
        [b]Descrição:[/b]     ${cliente.clientDescription}
        [b]ID de la Base de Datos:[/b]     ${cliente.clientDatabaseId}
        [b]Identificador Único:[/b]     ${cliente.clientUniqueIdentifier}
        [b]Conexiones Totales:[/b]     ${cliente.clientTotalConnections}
        [b]Última IP:[/b]     ${clientIP} 
        [b]Tiempo Total en Línea:[/b]     ${cliente.clientTotalOnlineTime} segundos
        [b]Tiempo en Línea en el Mes:[/b]     ${cliente.clientMonthOnlineTime} segundos
        [b]Última Conexión:[/b]     ${lastConnectedDate}\n`;
        }

        // Enviar a resposta para o invoker
        await ts3.sendTextMessage(invoker.clid, 1, response);
    } else {
        // Nenhum cliente encontrado, enviar resposta apropriada
        await ts3.sendTextMessage(invoker.clid, 1, `[b]No se encontró ningún cliente con el término:[/b] ${searchTerm}.`);
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



///////////////////////////////////////////////////////////////////////////////

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
    await ts3.sendTextMessage(user.clid, 1, `Jugador '${playerName}' añadido con éxito.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateEnemyPlayerChannelDescription(canalHuntedIndividual);
}

// Função para remover um jogador da lista de Enemigos
async function removeEnemyPlayer(playerName, user) {
    enemyPlayers.delete(playerName);
    await saveEnemyPlayers();
    console.log(`Jogador '${playerName}' eliminado de la lista de Enemigos.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Jugador '${playerName}' eliminado con éxito.`);
    
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
                channel_description: "Ningún jugador enemigo configurado."
            });
            console.log("Descrição do canal atualizada para 'Nenhum jogador inimigo configurado'.");
        } catch (error) {
            console.error("Erro ao atualizar a descrição do canal:", error);
        }
        return;
    }

    let channelDescription = "Jugadores enemigos online:\n\n";
    const worldName = await loadWorld() || "Aethera"; // Usa "Aethera" como padrão caso o mundo não esteja salvo

    try {
        // Faz a chamada para o mundo salvo em set_world.json
        const response = await fetch(`https://api.tibiadata.com/v4/world/${worldName}`);
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
        channelDescription += "Ningún jugador enemigo en línea en este momento.";
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


//////////////////////////////////////
/////////////////////////////////
////////////////////////////////
/////////////////////////////////////



const guildbankchannelId = 5;
const groupId = 4160; // ID do grupo 207 que será verificado
const dataFilePathh = './guildbank_data.json';

// Função assíncrona para carregar os dados do arquivo JSON
async function loadGuildBankData() {
    try {
        const rawData = await fs.readFile(dataFilePathh, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.log("Arquivo de dados não encontrado ou erro ao carregar, iniciando com dados vazios.");
        return {}; // Retorna um objeto vazio se não houver dados
    }
}

// Função assíncrona para salvar os dados no arquivo JSON
async function saveGuildBankData(data) {
    try {
        await fs.writeFile(dataFilePathh, JSON.stringify(data, null, 2));
        console.log("Dados salvos com sucesso.");
    } catch (error) {
        console.error("Erro ao salvar os dados no arquivo:", error);
    }
}

// Carregar dados do guildbank
let guildBankData = {};

// Função para limpar entradas indefinidas
async function cleanupUndefinedEntries() {
    if (guildBankData.undefined) {
        console.log("Cleaning up undefined entry...");
        const undefinedData = guildBankData.undefined;
        delete guildBankData.undefined;
        
        // Generate a new unique ID for this entry
        const newId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        guildBankData[newId] = undefinedData;
        
        await saveGuildBankData(guildBankData);
        console.log("Undefined entry cleaned up and reassigned.");
    }
}

// Inicializa os dados do guildBank
(async () => {
    guildBankData = await loadGuildBankData();
    await cleanupUndefinedEntries();
    await updateGuildBankChannel();
})();

// Função para normalizar strings (remove acentos e caracteres especiais)
function normalizeString(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Função para converter timestamp Unix para data legível no formato DD/MM/YYYY
function convertTimestampToDate(timestamp) {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Função para calcular a contagem regressiva em dias, horas, minutos e segundos
function calculateCountdown(dueDate) {
    const now = new Date();
    const remainingTime = new Date(dueDate) - now;

    if (remainingTime <= 0) return "Expirado";

    const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

    return `${days} dias ${hours}:${minutes}:${seconds}`;
}

// Função para obter informações completas do cliente pelo clid
async function getFullClientInfow(clid) {
    try {
        const clientInfo = await ts3.clientInfo(clid);
        return Array.isArray(clientInfo) ? clientInfo[0] : clientInfo; // Retorna o primeiro item se for um array
    } catch (error) {
        console.error("Erro ao obter informações completas do cliente:", error);
        return null; // Retorna null se ocorrer um erro
    }
}

// Função para adicionar um cliente na lista do Guild Bank
async function addToGuildBank(invoker) {
    const clientInfo = await getFullClientInfow(invoker.clid);
    if (!clientInfo) {
        await ts3.sendTextMessage(invoker.clid, 1, "Erro ao obter informações do cliente.");
        return;
    }

    const clientNickname = clientInfo.clientNickname || "Nickname não encontrado";
    const clientMain = clientInfo.clientDescription.split("/ Main: ")[1]?.split("/")[0]?.trim() || "Nome do personagem não encontrado";
    const serverGroups = clientInfo.servergroups || [];
    const searchTermNickname = normalizeString(clientNickname);
    const searchTermMain = normalizeString(clientMain);

    // Verifica se o cliente já está na lista pelo nickname ou pelo Main
    const existingClientId = Object.keys(guildBankData).find(id => 
        normalizeString(guildBankData[id].nickname) === searchTermNickname || 
        normalizeString(guildBankData[id].main) === searchTermMain
    );

    if (existingClientId) {
        await ts3.sendTextMessage(invoker.clid, 1, "Você ou seu personagem principal já está na lista do Guild Bank.");
        return;
    }

    // Use o clientDatabaseId como chave, ou gere um ID único se não estiver disponível
    const clientId = invoker.cldbid || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    guildBankData[clientId] = {
        nickname: clientNickname,
        main: clientMain,
        status: "pendente",
        dateAdded: new Date().toISOString(),
        dueDate: null,
        serverGroups: serverGroups
    };

    await saveGuildBankData(guildBankData);
    await updateGuildBankChannel();
    await ts3.sendTextMessage(invoker.clid, 1, "Você foi adicionado à lista para aprovação no Guild Bank.");
}

// Função para verificar e atualizar o status do cliente
async function checkClientStatus(invoker, identifier) {
    const normalizedIdentifier = normalizeString(identifier);

    const clientId = Object.keys(guildBankData).find(id => 
        normalizeString(guildBankData[id].nickname) === normalizedIdentifier || 
        normalizeString(guildBankData[id].main) === normalizedIdentifier
    );

    if (!clientId) {
        await ts3.sendTextMessage(invoker.clid, 1, "Cliente ou personagem principal não encontrado na lista do Guild Bank.");
        return;
    }

    guildBankData[clientId].status = "pago";

    const now = new Date();
    const dueDate = new Date(now.setDate(now.getDate() + 30));
    guildBankData[clientId].dueDate = dueDate.toISOString();

    await saveGuildBankData(guildBankData);
    await updateGuildBankChannel();
    await ts3.sendTextMessage(invoker.clid, 1, `Status de ${guildBankData[clientId].nickname} (Main: ${guildBankData[clientId].main}) atualizado para "pago" e timer de 30 dias iniciado.`);
}

// Função para verificar se um cliente faz parte do grupo 207 e iniciar o timer de 30 dias se fizer parte
async function checkAndStartTimerForGroup207() {
    const clients = await ts3.clientList({ client_type: 0 });
    const now = new Date();

    for (const client of clients) {
        const clientId = client.cldbid;

        if (!guildBankData[clientId]) continue; // Ignora clientes que não estão na lista

        // Obtém os grupos do cliente do TeamSpeak
        const serverGroups = await ts3.clientServerGroups(client.clid);
        const groupIds = serverGroups.map(group => group.sgid); // IDs dos grupos do cliente
        guildBankData[clientId].serverGroups = groupIds; // Grava os grupos no JSON

        const isInGroup207 = groupIds.includes(groupId);

        if (isInGroup207 && !guildBankData[clientId].dueDate) {
            // Inicia o timer de 30 dias se ainda não tiver sido iniciado
            const dueDate = new Date(now.setDate(now.getDate() + 30)); // 30 dias a partir de agora
            guildBankData[clientId].dueDate = dueDate.toISOString();
            guildBankData[clientId].status = "ativo"; // Atualiza o status para ativo

            await saveGuildBankData(guildBankData);
        }
    }
    await updateGuildBankChannel();
}

// Função para remover automaticamente o cliente após 30 dias
async function removeExpiredClients() {
    const now = new Date();
    for (const clientId in guildBankData) {
        const client = guildBankData[clientId];

        if (client.dueDate && new Date(client.dueDate) < now) {
            // Remove o cliente do grupo 207
            await ts3.clientDelServerGroup(clientId, groupId);
            console.log(`Cliente ${client.nickname} foi removido do grupo 207.`);

            delete guildBankData[clientId]; // Remove o cliente da lista
            await saveGuildBankData(guildBankData);
            await updateGuildBankChannel();
        }
    }
}

// Função para atualizar a descrição do canal
async function updateGuildBankChannel() {
    let description = `[b]Guild Bank[/b]\n\n`;
    description += `\n[b]Nickname | Main | Status | Data de Adição | Tempo Restante[/b]\n`;

    for (const clientId in guildBankData) {
        const client = guildBankData[clientId];
        const countdown = client.dueDate ? calculateCountdown(client.dueDate) : "Pendente";

        description += `${client.nickname} | ${client.main} | ${client.status} | ${convertTimestampToDate(new Date(client.dateAdded).getTime())} | ${countdown}\n`;
    }

    try {
        await ts3.channelEdit(guildbankchannelId, { channel_description: description });
        console.log("Descrição do canal atualizada com sucesso.");
    } catch (error) {
        console.error("Erro ao atualizar a descrição do canal:", error);
    }
}

// Função para atualizar os status dos clientes
async function updateClientStatuses() {
    const now = new Date();
    for (const clientId in guildBankData) {
        const client = guildBankData[clientId];
        if (client.dueDate) {
            const dueDate = new Date(client.dueDate);
            if (dueDate < now) {
                client.status = "expirado";
            } else if ((dueDate.getTime() - now.getTime()) <= 7 * 24 * 60 * 60 * 1000) { // 7 dias em milissegundos
                client.status = "prestes a expirar";
            }
        }
    }
    await saveGuildBankData(guildBankData);
    await updateGuildBankChannel();
}

// Comandos do bot
ts3.on("textmessage", async (event) => {
    const message = event.msg.toLowerCase();
    const invoker = event.invoker;

    // Comando !guildbank para adicionar usuário à lista de aprovação
    if (message.startsWith("!guildbank")) {
        await addToGuildBank(invoker);
    }

    // Comando !check para atualizar o status do cliente
    if (message.startsWith("!checkgbrushback ")) {
        const identifier = message.split("!checkgbrushback ")[1].trim(); // Obtém o nickname ou main
        await checkClientStatus(invoker, identifier); // Chama a função para atualizar o status
    }
});

// Função para verificar a cada 1 minuto se há clientes expirados e atualizar o canal
setInterval(async () => {
    await removeExpiredClients();
    await checkAndStartTimerForGroup207();
    await updateClientStatuses();
}, 60 * 1000); // A cada 60 segundos


// Função para salvar a conta no JSON
async function saveAccount(email, senha) {
    try {
        let data = {};

        // Verifica se o arquivo já existe
        try {
            const fileContent = await fs.readFile('senha_rubinot.json', 'utf8');
            data = JSON.parse(fileContent); // Carregar o conteúdo do JSON existente
        } catch (error) {
            // Se o arquivo não existir, ele será criado
            console.log("Arquivo JSON não encontrado. Um novo arquivo será criado.");
        }

        // Atualiza ou adiciona a conta
        data[email] = senha;

        // Salva o JSON atualizado no arquivo
        const updatedData = JSON.stringify(data, null, 2);
        await fs.writeFile('senha_rubinot.json', updatedData, 'utf8');
        console.log(`A conta do email ${email} foi atualizada com sucesso.`);
    } catch (error) {
        console.error("Erro ao salvar a conta:", error);
    }
}

// Função para verificar se o usuário é admin e processar o comando !accountgb
async function processAccountCommand(client, message) {
    try {
        const clientInfo = await ts3.getClientById(client.clid);
        if (!clientInfo) {
            throw new Error("Informações do cliente não encontradas.");
        }

        // Verifica se o usuário é administrador
        const isAdminUser = clientInfo.servergroups.includes(masteradminGroupID.toString());

        if (!isAdminUser) {
            await ts3.sendTextMessage(client.clid, 1, "Apenas administradores podem usar esse comando.");
            return;
        }

        // Verifica o comando !accountgb <email> <senha>
        const args = message.split(' ');
        if (args.length === 3 && args[0] === '!accountgb') {
            const email = args[1];
            const senha = args[2];

            // Salva ou atualiza a conta no JSON
            await saveAccount(email, senha);
            await ts3.sendTextMessage(client.clid, 1, `A conta do email ${email} foi atualizada com sucesso.`);
        } else {
            await ts3.sendTextMessage(client.clid, 1, "Formato do comando incorreto. Use: !accountgb <email> <senha>");
        }
    } catch (error) {
        console.error("Erro ao processar o comando !accountgb:", error);
    }
}

// Evento para receber mensagens
// Evento para receber mensagens
ts3.on("textmessage", async (event) => {
    // Verifica se a mensagem existe antes de continuar
    if (!event.msg) {
        console.error("Mensagem não definida no evento.");
        return;
    }

    const { msg, invoker } = event;

    // Separa a mensagem em palavras
    const args = msg.split(' ');

    // Verifica apenas o comando para lowercase, mantendo o e-mail e a senha como foram inseridos
    const command = args[0].toLowerCase();

    // Processa o comando !accountgb
    if (command === "!accountgb") {
        if (args.length === 3) {
            const email = args[1]; // mantém o email e a senha sem alterar maiúsculas/minúsculas
            const senha = args[2];
            
            await processAccountCommand(invoker, msg);
        } else {
            await ts3.sendTextMessage(invoker.clid, 1, "Formato do comando incorreto. Use: !accountgb <email> <senha>");
        }
    } else {
        // Para outros comandos (como !desc, !guildbank, etc.), o bot não faz nada
        // ou você pode adicionar o processamento de outros comandos aqui.
        console.log(`Comando diferente: ${command}`);
    }
});




//////////////////////////////
// Quando ocorrer um erro
ts3.on("error", (error) => {
    console.error("Erro:", error);
});
