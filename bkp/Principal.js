const { TeamSpeak, TextMessageTargetMode } = require("ts3-nodejs-library");
const axios = require("axios");
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const crypto = require('crypto');
const fsr = require('fs');
const {
  disableAlertsForUser,
  enableAlertsForUser,
  shouldReceiveAlerts,
  disableLevelAlertsForUser,
  enableLevelAlertsForUser,
  shouldReceiveLevelAlerts,
} = require("./alert-preferences");

// Importar o módulo de rastreamento de níveis
const { loadPlayerLevels, updatePlayerLevel, getPlayerLevel, getAllPlayerLevels } = require("./level-tracker");



// Conectar ao servidor TS3
const ts3 = new TeamSpeak({
  host: "69.62.98.88",        // IP do servidor TS3
  queryport: 10101,             // Porta do query
  serverport: 9987,             // Porta do servidor TS3
  username: "serveradmin",      // Usuário query
  password: "yJW5xsLCwRAz",     // Senha query
  nickname: "JowBot"       // Nome do bot
});

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
  { minLevel: 2000, maxLevel: 2099, groupName: '2000+' },
  { minLevel: 2100, maxLevel: 2199, groupName: '2100+' },
  { minLevel: 2200, maxLevel: 2299, groupName: '2200+' },
  { minLevel: 2300, maxLevel: 2399, groupName: '2300+' },
  { minLevel: 2400, maxLevel: 2499, groupName: '2400+' },
  { minLevel: 2500, maxLevel: 2599, groupName: '2500+' },
  { minLevel: 2600, maxLevel: 2699, groupName: '2600+' },
  { minLevel: 2700, maxLevel: 2799, groupName: '2700+' },
  { minLevel: 2800, maxLevel: 2899, groupName: '2800+' },
  { minLevel: 2900, maxLevel: 2999, groupName: '2900+' },
  { minLevel: 3000, maxLevel: Infinity, groupName: '3000+' }
];


const VOCATION_GROUPS = {
  'Elder Druid': 'Elder Druid',
  'Druid': 'Elder Druid',
  'Elite Knight': 'Elite Knight',
  'Knight': 'Elite Knight',
  'Royal Paladin': 'Royal Paladin',
  'Paladin': 'Royal Paladin',
  'Master Sorcerer': 'Master Sorcerer',
  'Sorcerer': 'Master Sorcerer',
  'Monk': 'Exalted Monk',
  'Exalted Monk': 'Exalted Monk'
};

// Lista de grupos especiais que não devem ser considerados como grupos de rank
const SPECIAL_GROUPS = [
  'Editor',
  'Server Admin',
  'Guest',
  'Admin',
  'Tobot Admin',
  'Tobot Move',
  'Tobot Poke',
  'No Move',
  'No Kick',
  'Forçar Push-to-Talk',
  'Resp Block',
  'Guild Bank',
  'GB Não Pago',
  'Maker 1',
  'Mulher (Respeitar)',
  'Suporte',
  'Streamer',
  'Devil Team',
  'Vip',
  'Planilhado',
  'Hatzudo',
  'Serviceiro',
  'Líder',
  'Maker 2',
  'Maker 3',
  'Demonio',
  'Pokemon',
  'Leader Aliado',
  'Vipspawn',
];


// Arquivo para armazenar usuários registrados
const REGISTERED_USERS_FILE = './registered_users.json';
// Arquivo para armazenar códigos de verificação
const VERIFICATION_CODES_FILE = './verification_codes.json';

// Inicializa o registro de usuários
let registeredUsers = {};
try {
  if (fsr.existsSync(REGISTERED_USERS_FILE)) {
      registeredUsers = JSON.parse(fsr.readFileSync(REGISTERED_USERS_FILE, 'utf8'));
      console.log('Usuários registrados carregados:', Object.keys(registeredUsers).length);
  } else {
      // Cria o arquivo se não existir
      fsr.writeFileSync(REGISTERED_USERS_FILE, JSON.stringify({}), 'utf8');
      console.log('Arquivo de usuários registrados criado.');
  }
} catch (error) {
  console.error('Erro ao carregar usuários registrados:', error);
  // Cria o arquivo se não existir
  fsr.writeFileSync(REGISTERED_USERS_FILE, JSON.stringify({}), 'utf8');
}

// Mapa para armazenar códigos de verificação temporários
const verificationCodes = new Map();

// Carrega códigos de verificação salvos
try {
  if (fsr.existsSync(VERIFICATION_CODES_FILE)) {
      const savedCodes = JSON.parse(fsr.readFileSync(VERIFICATION_CODES_FILE, 'utf8'));
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
      fsr.writeFileSync(VERIFICATION_CODES_FILE, JSON.stringify(codesObj, null, 2), 'utf8');
      console.log('Códigos de verificação salvos com sucesso.');
  } catch (error) {
      console.error('Erro ao salvar códigos de verificação:', error);
  }
}

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
      const setGuild = JSON.parse(fsr.readFileSync('./set_guild.json', 'utf8'));
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
      const clientInfo = await ts3.clientInfo(clid);
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
      const groups = await ts3.serverGroupList();
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

// Função para verificar se um cliente tem permissão de editor
async function hasEditorPermission(clientInfo) {
  if (!clientInfo || !clientInfo.clientServergroups) return false;

  try {
    const groupNames = ['Editor', 'Suporte', 'Leader'];

    // Buscar os IDs dos grupos
    const groupIds = await Promise.all(groupNames.map(getGroupIdByName));
    
    // Garantir que todos foram encontrados
    const validGroupIds = groupIds.filter(Boolean).map(Number);

    const clientGroups = typeof clientInfo.clientServergroups === 'string'
      ? clientInfo.clientServergroups.split(',').map(Number)
      : Array.isArray(clientInfo.clientServergroups)
        ? clientInfo.clientServergroups.map(Number)
        : [];

    return validGroupIds.some(id => clientGroups.includes(id));
  } catch (error) {
    console.error("Erro ao verificar permissões:", error);
    return false;
  }
}


// Função para salvar usuários registrados no arquivo
function saveRegisteredUsers() {
  try {
      fsr.writeFileSync(REGISTERED_USERS_FILE, JSON.stringify(registeredUsers, null, 2), 'utf8');
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
      await ts3.sendTextMessage(clid, TextMessageTargetMode.CLIENT, message);
      console.log(`Mensagem enviada para ${clid}: ${message}`);
  } catch (error) {
      console.error(`Erro ao enviar mensagem para ${clid}:`, error);
  }
}

// Função para enviar todas as instruções de registro de uma vez
async function sendAllRegistrationInstructions(clid, code) {
  try {
      const fullMessage = `[b][color=orange]📌 Para registrar seu personagem:[/color][/b]\n\n` +
      `[b]1.[/b] Acesse [u][url=https://www.tibia.com]Tibia.com[/url][/u]\n` +
      `[b]2.[/b] Adicione o seguinte código nos comentários do seu personagem:\n` +
      `[color=green][b]${code}[/b][/color]\n` +
      `[b]3.[/b] Aguarde 2 minutos e digite o comando abaixo aqui no TS:\n` +
      `[color=yellow][b]!register SeuPersonagem[/b][/color]\n\n` +
      `[i]Exemplo:[/i] [b]!register Setzer Gambler[/b]`;
      
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
// Modify the registerCharacter function to check guild membership and show character details
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
    
    // Verificar se o personagem pertence à guilda
    await sendSafeTextMessage(clid, `Verificando se o personagem ${character.name} pertence à guilda ${guildAliada}...`);
    const guildMember = await checkTibiaCharacterInGuild(character.name);
    
    if (!guildMember) {
        console.log(`Personagem ${character.name} não pertence à guilda ${guildAliada}`);
        await sendSafeTextMessage(clid, 
            `O personagem ${character.name} não pertence à guilda ${guildAliada}. Apenas membros da guilda podem se registrar.`);
        return;
    }
    
    console.log(`Personagem ${characterName} verificado com sucesso e pertence à guilda!`);
    
    // Enviar mensagem com detalhes do personagem antes de completar o registro
    const confirmationMessage = `[b][color=green]Personagem encontrado![/color][/b]\n\n` +
        `[b]Nome:[/b] ${character.name}\n` +
        `[b]Level:[/b] ${character.level}\n` +
        `[b]Vocação:[/b] ${character.vocation}\n` +
        `[b]Mundo:[/b] ${character.world}\n` +
        `[b]Guilda:[/b] ${guildAliada}\n` +
        `[b]Rank:[/b] ${guildMember.rank || "N/A"}\n\n` +
        `[color=yellow]Registrando seu personagem...[/color]`;
    
    await sendSafeTextMessage(clid, confirmationMessage);
    
    // Registrar usuário
    registeredUsers[clientUniqueIdentifier] = {
        characterName: character.name,
        registeredAt: new Date().toISOString(),
        level: character.level,
        vocation: character.vocation,
        world: character.world,
        guildRank: guildMember.rank || null // Usar o rank obtido da verificação da guilda
    };
    
    // Salvar registro
    saveRegisteredUsers();
    
    // Remover código de verificação
    verificationCodes.delete(clientUniqueIdentifier);
    saveVerificationCodes(); // Salvar após remover o código
    
    // Atualizar descrição do cliente com o personagem registrado
    try {
        // Definir a descrição apenas com o nome do personagem
        await ts3.clientEdit(clid, { clientDescription: character.name });
        console.log(`Descrição atualizada para ${clientNickname}: ${character.name}`);
    } catch (error) {
        console.error(`Erro ao atualizar descrição do cliente ${clientNickname}:`, error);
    }
    
    // Processar o cliente para atribuir grupos com base no personagem registrado
    await processRegisteredClient(clientInfo, character);
    
    await sendSafeTextMessage(clid, 
        `[b][color=green]Registro concluído com sucesso![/color][/b]\n\n` +
        `Seu personagem ${character.name} foi registrado e seus grupos foram atualizados de acordo com seu level, vocação e rank na guilda.`);
    
    console.log(`Usuário ${clientNickname} (${clientUniqueIdentifier}) registrado com personagem ${character.name}`);
} catch (error) {
    console.error(`Erro ao registrar personagem:`, error);
    await sendSafeTextMessage(clid, 
        "Ocorreu um erro ao processar seu registro. Por favor, tente novamente mais tarde.");
}
}

// Função para auto-registrar um usuário (para editores)
// Modify the autoRegisterUser function to check guild membership and show character details
async function autoRegisterUser(characterName, editorClid) {
try {
    console.log(`Iniciando auto-registro do personagem ${characterName} pelo editor ${editorClid}`);
    
    // Verificar informações do editor
    const editorInfo = await getFullClientInfo(editorClid);
    if (!editorInfo) {
        console.error(`Não foi possível obter informações do editor ${editorClid}`);
        return;
    }
    
    // Verificar se o editor tem permissão
    const isEditor = await hasEditorPermission(editorInfo);
    if (!isEditor) {
        console.log(`Usuário ${editorInfo.clientNickname} não tem permissão de editor.`);
        await sendSafeTextMessage(editorClid, "Você não tem permissão para usar este comando. Apenas editores podem registrar outros usuários.");
        return;
    }
    
    // Verificar informações do personagem
    const character = await getTibiaCharacterInfo(characterName);
    if (!character) {
        console.log(`Personagem ${characterName} não encontrado`);
        await sendSafeTextMessage(editorClid, 
            `Não foi possível encontrar o personagem ${characterName}. Verifique se o nome está correto e tente novamente.`);
        return;
    }
    
    // Verificar se o personagem pertence à guilda
    await sendSafeTextMessage(editorClid, `Verificando se o personagem ${character.name} pertence à guilda ${guildAliada}...`);
    const guildMember = await checkTibiaCharacterInGuild(character.name);
    
    if (!guildMember) {
        console.log(`Personagem ${character.name} não pertence à guilda ${guildAliada}`);
        await sendSafeTextMessage(editorClid, 
            `O personagem ${character.name} não pertence à guilda ${guildAliada}. Apenas membros da guilda podem ser registrados.`);
        return;
    }
    
    console.log(`Personagem ${characterName} verificado com sucesso e pertence à guilda!`);
    
    // Enviar mensagem com detalhes do personagem antes de completar o registro
    const confirmationMessage = `[b][color=green]Personagem encontrado![/color][/b]\n\n` +
        `[b]Nome:[/b] ${character.name}\n` +
        `[b]Level:[/b] ${character.level}\n` +
        `[b]Vocação:[/b] ${character.vocation}\n` +
        `[b]Mundo:[/b] ${character.world}\n` +
        `[b]Guilda:[/b] ${guildAliada}\n` +
        `[b]Rank:[/b] ${guildMember.rank || "N/A"}\n\n` +
        `[color=yellow]Buscando usuário para registrar...[/color]`;
    
    await sendSafeTextMessage(editorClid, confirmationMessage);
    
    // Buscar todos os clientes online
    const clients = await ts3.clientList();
    console.log(`Buscando cliente com descrição "${characterName}" entre ${clients.length} clientes online`);
    
    // Encontrar o cliente que tem o personagem na descrição
    let targetClient = null;
    for (const client of clients) {
        if (!client || !client.clid) continue;
        
        const clientInfo = await getFullClientInfo(client.clid);
        if (!clientInfo || !clientInfo.clientDescription) continue;
        
        console.log(`Verificando cliente ${clientInfo.clientNickname} com descrição: "${clientInfo.clientDescription}"`);
        
        // Verificar se a descrição é exatamente igual ao nome do personagem
        // ou se contém o nome do personagem (para ser mais flexível)
        if (clientInfo.clientDescription.toLowerCase() === characterName.toLowerCase() || 
            clientInfo.clientDescription.toLowerCase().includes(characterName.toLowerCase())) {
            targetClient = clientInfo;
            console.log(`Cliente encontrado: ${clientInfo.clientNickname} com descrição "${clientInfo.clientDescription}"`);
            break;
        }
    }
    
    if (!targetClient) {
        console.log(`Nenhum cliente encontrado com a descrição contendo ${characterName}`);
        await sendSafeTextMessage(editorClid, 
            `Nenhum usuário encontrado com a descrição contendo o personagem ${characterName}. Certifique-se de que o usuário tem o nome do personagem na descrição.`);
        return;
    }
    
    const { clientUniqueIdentifier, clientNickname, clid: targetClid } = targetClient;
    
    // Verificar se o usuário já está registrado
    if (registeredUsers[clientUniqueIdentifier]) {
        console.log(`Usuário ${clientNickname} já está registrado.`);
        await sendSafeTextMessage(editorClid, `O usuário ${clientNickname} já está registrado.`);
        return;
    }
    
    // Registrar usuário
    registeredUsers[clientUniqueIdentifier] = {
        characterName: character.name,
        registeredAt: new Date().toISOString(),
        level: character.level,
        vocation: character.vocation,
        world: character.world,
        guildRank: guildMember.rank || null, // Usar o rank obtido da verificação da guilda
        registeredBy: editorInfo.clientUniqueIdentifier // Registra quem fez o registro
    };
    
    // Salvar registro
    saveRegisteredUsers();
    
    // Atualizar descrição do cliente com o personagem registrado (caso ainda não esteja)
    try {
        // Definir a descrição apenas com o nome do personagem
        await ts3.clientEdit(targetClid, { clientDescription: character.name });
        console.log(`Descrição atualizada para ${clientNickname}: ${character.name}`);
    } catch (error) {
        console.error(`Erro ao atualizar descrição do cliente ${clientNickname}:`, error);
    }
    
    // Processar o cliente para atribuir grupos com base no personagem registrado
    await processRegisteredClient(targetClient, character);
    
    // Notificar o editor
    await sendSafeTextMessage(editorClid, 
        `[b][color=green]Registro concluído com sucesso![/color][/b]\n\n` +
        `Personagem ${character.name} registrado com sucesso para ${clientNickname}! Grupos atualizados de acordo com o level, vocação e rank na guilda.`);
    
    // Notificar o usuário registrado
    await sendSafeTextMessage(targetClid, 
        `[b][color=green]Seu personagem foi registrado![/color][/b]\n\n` +
        `Seu personagem ${character.name} foi registrado por um administrador. Seus grupos foram atualizados de acordo com seu level, vocação e rank na guilda.`);
    
    console.log(`Usuário ${clientNickname} (${clientUniqueIdentifier}) registrado com personagem ${character.name} pelo editor ${editorInfo.clientNickname}`);
} catch (error) {
    console.error(`Erro ao auto-registrar personagem:`, error);
    await sendSafeTextMessage(editorClid, 
        "Ocorreu um erro ao processar o auto-registro. Por favor, tente novamente mais tarde.");
}
}

// Função para obter todos os grupos de nível, vocação e rank atuais do cliente
async function getCurrentManagedGroups(clientGroups) {
  const managedGroups = {
      level: null,
      vocation: null,
      rank: null
  };
  
  // Converter clientGroups para array de números
  const groups = typeof clientGroups === 'string' 
      ? clientGroups.split(',').map(Number) 
      : Array.isArray(clientGroups) 
          ? clientGroups.map(Number) 
          : [];
  
  // Obter todos os grupos do servidor
  const allGroups = await ts3.serverGroupList();
  
  // Verificar grupos de nível
  for (const levelGroup of LEVEL_GROUPS) {
      const groupId = await getGroupIdByName(levelGroup.groupName);
      if (groupId && groups.includes(Number(groupId))) {
          managedGroups.level = {
              id: groupId,
              name: levelGroup.groupName
          };
      }
  }
  
  // Verificar grupos de vocação
  for (const vocation in VOCATION_GROUPS) {
      const groupName = VOCATION_GROUPS[vocation];
      const groupId = await getGroupIdByName(groupName);
      if (groupId && groups.includes(Number(groupId))) {
          managedGroups.vocation = {
              id: groupId,
              name: groupName
          };
      }
  }
  
  // Verificar grupos de rank
  // Consideramos como grupo de rank qualquer grupo que o cliente tenha e que não seja de nível, vocação ou especial
  for (const group of allGroups) {
      if (!group.sgid || !group.name) continue;
      
      const isLevelGroup = LEVEL_GROUPS.some(lg => lg.groupName === group.name);
      const isVocationGroup = Object.values(VOCATION_GROUPS).includes(group.name);
      const isSpecialGroup = SPECIAL_GROUPS.includes(group.name);
      
      // Se não for nenhum dos tipos acima e o cliente tiver este grupo, pode ser um grupo de rank
      if (!isLevelGroup && !isVocationGroup && !isSpecialGroup && groups.includes(Number(group.sgid))) {
          managedGroups.rank = {
              id: group.sgid,
              name: group.name
          };
      }
  }
  
  return managedGroups;
}

// Função para processar o registro de um cliente com informações do personagem
async function processRegisteredClient(client, character) {
  if (!client || !character) return;
  
  const { clientDatabaseId, clientNickname } = client;
  const level = character.level;
  const vocation = character.vocation;
  const guildRank = character.guild?.rank || null; // Obter o rank da guilda, se disponível
  
  console.log(`Processando cliente ${clientNickname} com level ${level}, vocação ${vocation} e rank ${guildRank || 'N/A'}`);
  
  let newLevelGroupId = null;
  let newVocationGroupId = null;
  let newRankGroupId = null;
  
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
      
      // Encontrar ID do grupo de rank da guilda diretamente pelo nome do rank, se disponível
      if (guildRank) {
          // Usar diretamente o nome do rank como nome do grupo
          newRankGroupId = await getGroupIdByName(guildRank);
          console.log(`Buscando grupo para rank: "${guildRank}" (ID encontrado: ${newRankGroupId || 'Não encontrado'})`);
          
          if (!newRankGroupId) {
              console.error(`Não foi possível encontrar o grupo com nome "${guildRank}" para o rank "${guildRank}"`);
          }
      }
      
      // Obter grupos atuais do cliente
      const currentGroups = typeof client.clientServergroups === 'string' 
          ? client.clientServergroups.split(',').map(Number) 
          : Array.isArray(client.clientServergroups) 
              ? client.clientServergroups.map(Number) 
              : [];
              
      console.log(`Grupos atuais do cliente ${clientNickname}:`, currentGroups);
      
      // Obter grupos gerenciados atuais (level, vocation, rank)
      const managedGroups = await getCurrentManagedGroups(currentGroups);
      
      // Remover grupo de level antigo se necessário
      if (managedGroups.level && managedGroups.level.id !== newLevelGroupId) {
          try {
              await ts3.clientDelServerGroup(clientDatabaseId, managedGroups.level.id);
              console.log(`${clientNickname} removido do grupo ${managedGroups.level.name} (level antigo)`);
          } catch (error) {
              console.error(`Erro ao remover ${clientNickname} do grupo ${managedGroups.level.name}:`, error);
          }
      }
      
      // Remover grupo de vocação antigo se necessário
      if (managedGroups.vocation && managedGroups.vocation.id !== newVocationGroupId) {
          try {
              await ts3.clientDelServerGroup(clientDatabaseId, managedGroups.vocation.id);
              console.log(`${clientNickname} removido do grupo ${managedGroups.vocation.name} (vocação antiga)`);
          } catch (error) {
              console.error(`Erro ao remover ${clientNickname} do grupo ${managedGroups.vocation.name}:`, error);
          }
      }
      
      // Remover grupo de rank antigo se necessário
      if (managedGroups.rank && guildRank && managedGroups.rank.name !== guildRank) {
          try {
              await ts3.clientDelServerGroup(clientDatabaseId, managedGroups.rank.id);
              console.log(`${clientNickname} removido do grupo ${managedGroups.rank.name} (rank antigo)`);
          } catch (error) {
              console.error(`Erro ao remover ${clientNickname} do grupo ${managedGroups.rank.name}:`, error);
          }
      }
      
      // Adicionar ao grupo de level se necessário
      if (newLevelGroupId && !currentGroups.includes(Number(newLevelGroupId))) {
          try {
              await ts3.clientAddServerGroup(clientDatabaseId, newLevelGroupId);
              console.log(`${clientNickname} adicionado ao grupo ${newLevelGroupId} (level)`);
          } catch (error) {
              if (error.msg && error.msg.includes('already a member')) {
                  console.log(`${clientNickname} já é membro do grupo ${newLevelGroupId} (level)`);
              } else {
                  console.error(`Erro ao adicionar ${clientNickname} ao grupo ${newLevelGroupId} (level):`, error);
              }
          }
      } else if (newLevelGroupId) {
          console.log(`${clientNickname} já é membro do grupo ${newLevelGroupId} (level)`);
      }
      
      // Adicionar ao grupo de vocação se necessário
      if (newVocationGroupId && !currentGroups.includes(Number(newVocationGroupId))) {
          try {
              await ts3.clientAddServerGroup(clientDatabaseId, newVocationGroupId);
              console.log(`${clientNickname} adicionado ao grupo ${newVocationGroupId} (vocation)`);
          } catch (error) {
              if (error.msg && error.msg.includes('already a member')) {
                  console.log(`${clientNickname} já é membro do grupo ${newVocationGroupId} (vocation)`);
              } else {
                  console.error(`Erro ao adicionar ${clientNickname} ao grupo ${newVocationGroupId} (vocation):`, error);
              }
          }
      } else if (newVocationGroupId) {
          console.log(`${clientNickname} já é membro do grupo ${newVocationGroupId} (vocation)`);
      }
      
      // Adicionar ao grupo de rank da guilda se necessário
      if (newRankGroupId && !currentGroups.includes(Number(newRankGroupId))) {
          try {
              console.log(`Tentando adicionar ${clientNickname} ao grupo de rank "${guildRank}" (ID: ${newRankGroupId})`);
              await ts3.clientAddServerGroup(clientDatabaseId, newRankGroupId);
              console.log(`${clientNickname} adicionado ao grupo "${guildRank}" (ID: ${newRankGroupId}) (rank)`);
          } catch (error) {
              if (error.msg && error.msg.includes('already a member')) {
                  console.log(`${clientNickname} já é membro do grupo "${guildRank}" (rank)`);
              } else {
                  console.error(`Erro ao adicionar ${clientNickname} ao grupo "${guildRank}" (rank):`, error);
              }
          }
      } else if (newRankGroupId) {
          console.log(`${clientNickname} já é membro do grupo "${guildRank}" (rank)`);
      }
      
      // Adicionar ao grupo de membro registrado
      const memberGroupId = await getGroupIdByName('Membro');
      if (memberGroupId && !currentGroups.includes(Number(memberGroupId))) {
          try {
              await ts3.clientAddServerGroup(clientDatabaseId, memberGroupId);
              console.log(`${clientNickname} adicionado ao grupo Membro`);
          } catch (error) {
              if (error.msg && error.msg.includes('already a member')) {
                  console.log(`${clientNickname} já é membro do grupo Membro`);
              } else {
                  console.error(`Erro ao adicionar ${clientNickname} ao grupo Membro:`, error);
              }
          }
      } else if (memberGroupId) {
          console.log(`${clientNickname} já é membro do grupo Membro`);
      }
  } catch (error) {
      console.error(`Erro ao processar registro para ${clientNickname}:`, error);
  }
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
      if (inactiveDays < 1 && clientNickname !== "NICK DO BOT") {
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
  
  // Obter informações completas do personagem
  const characterInfo = await getTibiaCharacterInfo(characterName);
  
  if (characterInfo) {
      const level = characterInfo.level;
      const vocation = characterInfo.vocation;
      const guildRank = characterInfo.guild?.rank || null; // Obter o rank da guilda, se disponível
      
      console.log(`Informações do personagem ${characterName}: Level ${level}, Vocação ${vocation}, Rank ${guildRank || 'N/A'}`);
      
      let newLevelGroupId = null;
      let newVocationGroupId = await getGroupIdByName(VOCATION_GROUPS[vocation] || 'Unknown');
      let newRankGroupId = null;

      // Encontra o novo grupo baseado no nível
      for (const group of LEVEL_GROUPS) {
          if (level >= group.minLevel && level <= group.maxLevel) {
              newLevelGroupId = await getGroupIdByName(group.groupName);
              break;
          }
      }
      
      // Encontrar ID do grupo de rank da guilda diretamente pelo nome do rank, se disponível
      if (guildRank) {
          // Usar diretamente o nome do rank como nome do grupo
          newRankGroupId = await getGroupIdByName(guildRank);
          console.log(`Buscando grupo para rank: "${guildRank}" (ID encontrado: ${newRankGroupId || 'Não encontrado'})`);
          
          if (!newRankGroupId) {
              console.error(`Não foi possível encontrar o grupo com nome "${guildRank}" para o rank "${guildRank}"`);
          }
      }

      try {
          // Garantir que clientServergroups seja tratado como string e convertido para array de números
          const currentGroups = typeof client.clientServergroups === 'string' 
              ? client.clientServergroups.split(',').map(Number) 
              : Array.isArray(client.clientServergroups) 
                  ? client.clientServergroups.map(Number) 
                  : [];
                  
          console.log(`Grupos atuais do cliente ${clientNickname}:`, currentGroups);
          
          // Obter grupos gerenciados atuais (level, vocation, rank)
          const managedGroups = await getCurrentManagedGroups(currentGroups);
          
          // Remover grupo de level antigo se necessário
          if (managedGroups.level && managedGroups.level.id !== newLevelGroupId) {
              try {
                  await ts3.clientDelServerGroup(clientDatabaseId, managedGroups.level.id);
                  console.log(`${clientNickname} removido do grupo ${managedGroups.level.name} (level antigo)`);
              } catch (error) {
                  console.error(`Erro ao remover ${clientNickname} do grupo ${managedGroups.level.name}:`, error);
              }
          }
          
          // Remover grupo de vocação antigo se necessário
          if (managedGroups.vocation && managedGroups.vocation.id !== newVocationGroupId) {
              try {
                  await ts3.clientDelServerGroup(clientDatabaseId, managedGroups.vocation.id);
                  console.log(`${clientNickname} removido do grupo ${managedGroups.vocation.name} (vocação antiga)`);
              } catch (error) {
                  console.error(`Erro ao remover ${clientNickname} do grupo ${managedGroups.vocation.name}:`, error);
              }
          }
          
          // Remover grupo de rank antigo se necessário
          if (managedGroups.rank && guildRank && managedGroups.rank.name !== guildRank) {
              try {
                  await ts3.clientDelServerGroup(clientDatabaseId, managedGroups.rank.id);
                  console.log(`${clientNickname} removido do grupo ${managedGroups.rank.name} (rank antigo)`);
              } catch (error) {
                  console.error(`Erro ao remover ${clientNickname} do grupo ${managedGroups.rank.name}:`, error);
              }
          }

          // Adiciona novos grupos de nível e vocação se necessário
          if (newLevelGroupId && !currentGroups.includes(Number(newLevelGroupId))) {
              try {
                  await ts3.clientAddServerGroup(clientDatabaseId, newLevelGroupId);
                  console.log(`${clientNickname} adicionado ao grupo ${newLevelGroupId}`);
              } catch (error) {
                  if (error.msg && error.msg.includes('already a member')) {
                      console.log(`${clientNickname} já é membro do grupo ${newLevelGroupId} (level)`);
                  } else {
                      console.error(`Erro ao adicionar ${clientNickname} ao grupo ${newLevelGroupId}:`, error);
                  }
              }
          }

          if (newVocationGroupId && !currentGroups.includes(Number(newVocationGroupId))) {
              try {
                  await ts3.clientAddServerGroup(clientDatabaseId, newVocationGroupId);
                  console.log(`${clientNickname} adicionado ao grupo ${newVocationGroupId} (vocation)`);
              } catch (error) {
                  if (error.msg && error.msg.includes('already a member')) {
                      console.log(`${clientNickname} já é membro do grupo ${newVocationGroupId} (vocation)`);
                  } else {
                      console.error(`Erro ao adicionar ${clientNickname} ao grupo ${newVocationGroupId}:`, error);
                  }
              }
          }
          
          // Adiciona o grupo de rank se necessário
          if (newRankGroupId && !currentGroups.includes(Number(newRankGroupId))) {
              try {
                  console.log(`Tentando adicionar ${clientNickname} ao grupo de rank "${guildRank}" (ID: ${newRankGroupId})`);
                  await ts3.clientAddServerGroup(clientDatabaseId, newRankGroupId);
                  console.log(`${clientNickname} adicionado ao grupo "${guildRank}" (ID: ${newRankGroupId}) (rank)`);
              } catch (error) {
                  if (error.msg && error.msg.includes('already a member')) {
                      console.log(`${clientNickname} já é membro do grupo "${guildRank}" (rank)`);
                  } else {
                      console.error(`Erro ao adicionar ${clientNickname} ao grupo "${guildRank}" (rank):`, error);
                  }
              }
          }
      } catch (groupError) {
          console.error(`Erro ao atualizar os grupos para ${clientNickname}:`, groupError);
      }
  } else {
      console.log(`Personagem ${characterName} não encontrado na API.`);
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

  // Comando para auto-registro (apenas para editores)
  if (normalizedMessage.startsWith("!auto-register ")) {
      console.log(`Comando !auto-register recebido de ${clid}`);
      
      const clientInfo = await getFullClientInfo(clid);
      if (!clientInfo) {
          console.error(`Não foi possível obter informações do cliente ${clid}`);
          return;
      }
      
      // Verificar se o usuário tem permissão de editor
      const isEditor = await hasEditorPermission(clientInfo);
      if (!isEditor) {
          console.log(`Usuário ${clientInfo.clientNickname} não tem permissão de editor.`);
          await sendSafeTextMessage(clid, "Você não tem permissão para usar este comando. Apenas editores podem registrar outros usuários.");
          return;
      }
      
      // Obter o nome do personagem
      const characterName = message.substring("!auto-register ".length).trim();
      if (!characterName) {
          await sendSafeTextMessage(clid, "Por favor, forneça o nome do personagem. Exemplo: !auto-register NomeDoPersonagem");
          return;
      }
      
      // Executar o auto-registro
      await autoRegisterUser(characterName, clid);
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

// Evento quando um cliente se conecta ao servidor
ts3.on('clientconnect', async (event) => {
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
          if (!isUserAlreadyRegistered(clientInfo) && clientNickname !== "JowBot") {
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
ts3.on('ready', async () => {
  console.log('Bot conectado ao servidor TeaSpeak.');

  // Verifica clientes a cada 40 segundos
  setInterval(async () => {
      try {
          const clients = await ts3.clientList();
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
ts3.on('textmessage', async (ev) => {
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
//// permissoes ////

const adminGroupID = 183;
const masteradminGroupID = 119;
const respconfiga = 188
const respconfigb = 164
const respconfigc = 168
const serveradminGroupID = 3;
const mpoke =  169;
const mmove = 170;
const botadm = 168;
const respblockGroupID = 185;
const convidado = 182;
const SemRegistro = 121;

//////// canais /////////
const canalAFK = 134;
const canalResp = 15;
const canalGuildAliada = 6;
const canalEnemy = 7;
const canalHuntedIndividual = 10;



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
            throw new Error("Informação não encontrada.");
        }

        // Verificar se o invoker está no grupo admin ou dev
        const clientServerGroups = clientInfo.servergroups || [];
        if (![adminGroupID, serveradminGroupID, botadm, masteradminGroupID].some(group => clientServerGroups.includes(group.toString()))) {
            ts3.sendTextMessage(invokerID, 1, "Você não tem permissão para usar esse comando.");
            return;
        }

        // Se o comando for !tempoafk sem argumento, mostrar o tempo atual
        if (args.length === 1) {
            ts3.sendTextMessage(invokerID, 1, `O tempo de AFK do servidor foi configurado em ${afkTime} minutos. Para mudar, escreva !tempoafk <minutos>.`);
        } else {
            // Modificar o tempo AFK se um valor for especificado
            const newAfkTime = parseInt(args[1], 10);
            if (isNaN(newAfkTime) || newAfkTime <= 0) {
                ts3.sendTextMessage(invokerID, 1, "Por favor, diga um valor válido de minutos para o tempo AFK.");
            } else {
                afkTime = newAfkTime;
                ts3.sendTextMessage(invokerID, 1, `O tempo de AFK do servidor foi configurado em ${afkTime} minutos.`);
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
// Armazenar os níveis dos jogadores em memória para uso durante a execução
let playerLevels = {}

// Função para verificar os jogadores da guilda
async function checkGuildMembers() {
  try {
    // Pega o nome da guilda principal
    const guildName = await loadGuild() // Carrega o nome da guilda a partir do arquivo JSON
    if (!guildName) {
      console.log("Nenhuma guilda principal definida.")
      return
    }
    console.log(`Guilda carregada: ${guildName}`)

    // Carrega o mundo salvo
    const worldName = (await loadWorld()) || "Aethera" // Usa "Aethera" como padrão caso o mundo não esteja salvo
    console.log(`Mundo carregado: ${worldName}`)

    // Carregar níveis salvos do arquivo
    playerLevels = loadPlayerLevels()
    console.log("Níveis carregados do arquivo:", JSON.stringify(playerLevels, null, 2))

    // Pega a lista de membros da guilda
    console.log(`Buscando membros da guilda ${guildName}...`)
    const guildResponse = await axios.get(`https://api.tibiadata.com/v4/guild/${guildName}`)
    const guildMembers = guildResponse.data.guild.members
    console.log(`Encontrados ${guildMembers.length} membros na guilda.`)

    // Pega a lista de jogadores online no mundo
    console.log(`Buscando jogadores online no mundo ${worldName}...`)
    const worldResponse = await axios.get(`https://api.tibiadata.com/v4/world/${worldName}`)
    const onlinePlayers = worldResponse.data.world.online_players
    console.log(`Encontrados ${onlinePlayers.length} jogadores online no mundo.`)

    // Filtra os jogadores da guilda que estão online no mundo
    const onlineGuildMembers = guildMembers.filter((member) =>
      onlinePlayers.some((player) => player.name === member.name),
    )
    console.log(`Encontrados ${onlineGuildMembers.length} membros da guilda online.`)

    // Verifica se houve mudança de nível
    for (const member of onlineGuildMembers) {
      const player = onlinePlayers.find((p) => p.name === member.name)
      if (!player) {
        console.log(`Jogador ${member.name} não encontrado na lista de jogadores online.`)
        continue
      }

      const currentLevel = player.level
      const savedLevel = getPlayerLevel(member.name)

      console.log(
        `Verificando nível de ${member.name}: atual=${currentLevel}, anterior=${savedLevel || "não registrado"}`,
      )

      if (savedLevel === null) {
        console.log(`Inicializando nível para ${member.name}: ${currentLevel}`)
        updatePlayerLevel(member.name, currentLevel) // Salva o nível inicial
      } else if (currentLevel > savedLevel) {
        console.log(`${member.name} subiu de nível: ${savedLevel} -> ${currentLevel}`)
        updatePlayerLevel(member.name, currentLevel) // Atualiza o nível no arquivo

        // Envia mensagem ao chat geral no TS3 para subida de level
        await sendLevelMessage(member.name, savedLevel, currentLevel, "up")
      } else if (currentLevel < savedLevel) {
        console.log(`${member.name} perdeu nível: ${savedLevel} -> ${currentLevel}`)
        updatePlayerLevel(member.name, currentLevel) // Atualiza o nível no arquivo

        // Envia mensagem ao chat geral no TS3 para perda de level
        await sendLevelMessage(member.name, savedLevel, currentLevel, "down")
      } else {
        console.log(`Nível de ${member.name} não mudou: ${currentLevel}`)
      }
    }

    // Atualizar a variável em memória com os dados mais recentes
    playerLevels = getAllPlayerLevels()
    console.log("Estado atual dos níveis:", JSON.stringify(playerLevels, null, 2))
  } catch (error) {
    console.error("Erro ao verificar guilda:", error)
  }
}

// Função para enviar mensagem no chat geral do TS3
async function sendLevelMessage(playerName, oldLevel, newLevel, action) {
  console.log(`Enviando mensagem de mudança de nível para ${playerName}: ${oldLevel} -> ${newLevel} (${action})`)

  const color = action === "up" ? "green" : "red" // Verde para "up", Vermelho para "down"
  const message =
    action === "up"
      ? `[AMIGO UPLVL] ${playerName} ${oldLevel} > ${newLevel}!`
      : `[AMIGO MUERTE] ${playerName} ${oldLevel} > ${newLevel}!`

  try {
    // Enviar mensagem no canal
    console.log(`Enviando mensagem para o canal: ${message}`)
    await ts3.sendTextMessage(1, 3, `[B][color=${color}]${message}[/color][/B]`)
    console.log(`Mensagem enviada: ${message}`)

    // Enviar poke para todos os clientes que têm alertas de nível ativados
    console.log("Buscando lista de clientes para enviar pokes...")
    const clients = await ts3.clientList({ clientType: 0 }) // Apenas clientes humanos
    console.log(`Encontrados ${clients.length} clientes.`)

    for (const client of clients) {
      try {
        // Obter informações completas do cliente
        console.log(`Obtendo informações do cliente ${client.nickname}...`)
        const clientInfo = await ts3.getClientById(client.clid)

        const shouldReceive = shouldReceiveLevelAlerts(clientInfo.uniqueIdentifier)
        console.log(`Cliente ${client.nickname} deve receber alertas de nível? ${shouldReceive}`)

        if (shouldReceive) {
          console.log(`Enviando poke para ${client.nickname}...`)
          
          console.log(`Poke de nível enviado para ${client.nickname}: ${message}`)
        } else {
          console.log(`Poke de nível não enviado para ${client.nickname}: alertas de nível desativados`)
        }
      } catch (error) {
        console.error(`Erro ao enviar poke para ${client.nickname}:`, error)
      }
    }
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err)
  }
}

// Comando para forçar uma verificação de níveis (para testes)
async function forceCheckLevels() {
  console.log("Forçando verificação de níveis...")
  await checkGuildMembers()
  console.log("Verificação forçada concluída.")
}

ts3.on("ready", () => {
  console.log("Bot conectado ao servidor TeamSpeak!")

  // Checar membros da guilda a cada 150 segundos
  setInterval(checkGuildMembers, 150000)
})


  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////   MENSAGEM BOAS VINDAS  ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Enviar mensagem de boas-vindas para qualquer cliente que se conectar
ts3.on("clientconnect", async (event) => {
    try {
        const welcomeMessages = [
            `[color=green][b]Estamos na fase *BETA*, e contamos com a sua ajuda para melhorar o serviço![/color]`,
            `[color=red][b]Seja bem-vindo![/color]`,
            `Para Claimar ou ficar de Next um respaw use: [b]!resp Codigo[/b] (Exemplo !resp C5) ou [b]!resp CODIGO 00:30 , para configurar o tempo do seu respawn`,
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
                throw new Error("Informações do cliente não encontradas.");
            }
    
            // Verificar se o usuário pertence ao grupo com permissão (ID 9)
            const clientServerGroups = clientInfo.servergroups || [];
            if (![masteradminGroupID, botadm].some(group => clientServerGroups.includes(group.toString()))) {
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
                    + `[b][color=#7cac0e]Nível:[/color][/b] ${characterData.level}\n`
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
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////        MASSPOKE        ////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


ts3.on("textmessage", async (event) => {
  const message = event.msg.trim();
// Handler para o comando !alert-death-off
if (message === "!alert-death-off") {
try {
  // Obter informações completas do cliente para ter o uniqueIdentifier
  const clientInfo = await ts3.getClientById(event.invoker.clid)

  if (!clientInfo) {
    throw new Error("Informações do cliente não encontradas.")
  }

  if (disableAlertsForUser(clientInfo.uniqueIdentifier)) {
    await ts3.sendTextMessage(
      event.invoker.clid,
      1,
      "Alertas de morte desativados com sucesso. Use !alert-death-on para ativar novamente.",
    )
    console.log(`Alertas de morte desativados para ${clientInfo.nickname} (${clientInfo.uniqueIdentifier})`)
  } else {
    await ts3.sendTextMessage(event.invoker.clid, 1, "Seus alertas de morte já estão desativados.")
  }
} catch (error) {
  console.error("Erro ao processar comando !alert-death-off:", error)
  try {
    await ts3.sendTextMessage(
      event.invoker.clid,
      1,
      "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
    )
  } catch (msgError) {
    console.error("Erro ao enviar mensagem de erro:", msgError)
  }
}
}

// Handler para o comando !alert-death-on
else if (message === "!alert-death-on") {
try {
  // Obter informações completas do cliente para ter o uniqueIdentifier
  const clientInfo = await ts3.getClientById(event.invoker.clid)

  if (!clientInfo) {
    throw new Error("Informações do cliente não encontradas.")
  }

  if (enableAlertsForUser(clientInfo.uniqueIdentifier)) {
    await ts3.sendTextMessage(
      event.invoker.clid,
      1,
      "Alertas de morte ativados com sucesso. Use !alert-death-off para desativar.",
    )
    console.log(`Alertas de morte ativados para ${clientInfo.nickname} (${clientInfo.uniqueIdentifier})`)
  } else {
    await ts3.sendTextMessage(event.invoker.clid, 1, "Seus alertas de morte já estão ativados.")
  }
} catch (error) {
  console.error("Erro ao processar comando !alert-death-on:", error)
  try {
    await ts3.sendTextMessage(
      event.invoker.clid,
      1,
      "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
    )
  } catch (msgError) {
    console.error("Erro ao enviar mensagem de erro:", msgError)
  }
}
}
// NOVOS COMANDOS PARA ALERTAS DE NÍVEL

// Handler para o comando !alert-level-off
else if (message === "!alert-level-off") {
  try {
    console.log(`Processando comando !alert-level-off de ${event.invoker.nickname}...`)
    // Obter informações completas do cliente para ter o uniqueIdentifier
    const clientInfo = await ts3.getClientById(event.invoker.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (disableLevelAlertsForUser(clientInfo.uniqueIdentifier)) {
      await ts3.sendTextMessage(
        event.invoker.clid,
        1,
        "Alertas de mudança de nível desativados com sucesso. Use !alert-level-on para ativar novamente.",
      )
      console.log(`Alertas de nível desativados para ${clientInfo.nickname} (${clientInfo.uniqueIdentifier})`)
    } else {
      await ts3.sendTextMessage(event.invoker.clid, 1, "Seus alertas de mudança de nível já estão desativados.")
    }
  } catch (error) {
    console.error("Erro ao processar comando !alert-level-off:", error)
    try {
      await ts3.sendTextMessage(
        event.invoker.clid,
        1,
        "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
      )
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Handler para o comando !alert-level-on
else if (message === "!alert-level-on") {
  try {
    console.log(`Processando comando !alert-level-on de ${event.invoker.nickname}...`)
    // Obter informações completas do cliente para ter o uniqueIdentifier
    const clientInfo = await ts3.getClientById(event.invoker.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (enableLevelAlertsForUser(clientInfo.uniqueIdentifier)) {
      await ts3.sendTextMessage(
        event.invoker.clid,
        1,
        "Alertas de mudança de nível ativados com sucesso. Use !alert-level-off para desativar.",
      )
      console.log(`Alertas de nível ativados para ${clientInfo.nickname} (${clientInfo.uniqueIdentifier})`)
    } else {
      await ts3.sendTextMessage(event.invoker.clid, 1, "Seus alertas de mudança de nível já estão ativados.")
    }
  } catch (error) {
    console.error("Erro ao processar comando !alert-level-on:", error)
    try {
      await ts3.sendTextMessage(
        event.invoker.clid,
        1,
        "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
      )
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Comando para forçar verificação de níveis (para testes)
else if (message === "!check-levels") {
  try {
    await ts3.sendTextMessage(event.invoker.clid, 1, "Iniciando verificação forçada de níveis...")
    await forceCheckLevels()
    await ts3.sendTextMessage(event.invoker.clid, 1, "Verificação de níveis concluída.")
  } catch (error) {
    console.error("Erro ao processar comando !check-levels:", error)
    try {
      await ts3.sendTextMessage(
        event.invoker.clid,
        1,
        "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
      )
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}
  // Adicione este bloco ao seu evento de mensagem de texto
if (message.startsWith("!shared")) {
  try {
    // Extrair o nível do comando
    const args = message.split(" ");
    
    if (args.length < 2) {
      ts3.sendTextMessage(event.invoker.clid, 1, "Uso correto: !shared [nível]");
      return;
    }
    
    const level = parseInt(args[1]);
    
    if (isNaN(level) || level <= 0) {
      ts3.sendTextMessage(event.invoker.clid, 1, "Por favor, forneça um nível válido (número positivo).");
      return;
    }
    
    // Calcular o nível mínimo que pode compartilhar com o nível fornecido (2/3 do nível)
    const minLevel = Math.ceil(level * (2/3));
    
    // Calcular o nível máximo com o qual o nível fornecido pode compartilhar (nível * 3/2)
    const maxLevel = Math.floor(level * (3/2));
    
    // Formatar a mensagem de resposta
    let responseMessage = `[b]Compartilhamento de Experiência para Nível ${level}:[/b]\n\n`;
    
    // Adicionar informações sobre níveis que podem compartilhar com o nível fornecido
    responseMessage += `[b]Níveis que podem compartilhar experiência com você:[/b]\n`;
    responseMessage += `- Nível mínimo: ${minLevel}\n`;
    responseMessage += `- Nível máximo: ${maxLevel}\n\n`;
    
    // Adicionar exemplos para melhor compreensão
    responseMessage += `[b]Exemplos:[/b]\n`;
    
    // Exemplo de nível mínimo
    const minExample = Math.max(1, minLevel - 5);
    responseMessage += `- Um personagem de nível ${minExample} [color=red]NÃO[/color] compartilhará experiência com você (abaixo do mínimo).\n`;
    
    // Exemplo de nível válido inferior
    const validLowerExample = Math.min(minLevel + 5, level - 1);
    if (validLowerExample >= minLevel && validLowerExample < level) {
      responseMessage += `- Um personagem de nível ${validLowerExample} [color=green]COMPARTILHARÁ[/color] experiência com você.\n`;
    }
    
    // Exemplo de nível válido superior
    const validUpperExample = Math.min(level + 10, maxLevel);
    if (validUpperExample > level && validUpperExample <= maxLevel) {
      responseMessage += `- Um personagem de nível ${validUpperExample} [color=green]COMPARTILHARÁ[/color] experiência com você.\n`;
    }
    
    // Exemplo de nível máximo
    const maxExample = maxLevel + 5;
    responseMessage += `- Um personagem de nível ${maxExample} [color=red]NÃO[/color] compartilhará experiência com você (acima do máximo).\n`;
    
    // Adicionar a regra geral
    responseMessage += `\n[b]Regra:[/b] Personagens compartilham experiência quando o nível menor não é inferior a 2/3 do nível maior.`;
    
    // Enviar a mensagem de resposta
    ts3.sendTextMessage(event.invoker.clid, 1, responseMessage);
    
  } catch (error) {
    console.error("Erro ao processar comando !shared:", error);
    try {
      ts3.sendTextMessage(event.invoker.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.");
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError);
    }
  }
}


  if (message.startsWith("!mp")) {
      try {
          // Obter informações completas do invoker (quem enviou o comando)
          const invokerClientId = event.invoker.clid;

          // Obter o cliente completo por ID
          const clientInfo = await ts3.getClientById(invokerClientId);

          if (!clientInfo) {
              throw new Error("Informações do cliente não encontradas.");
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
const defaultRespawnTime = 180 // 3 horas em minutos

// Variável para controlar o estado de pausa global
let isRespawnPaused = false

// Objeto para armazenar o número de respawns por cliente (usando uniqueIdentifier)
const clientRespawnCount = {}

// Objeto para armazenar os tempos de cooldown após usar !respdel (usando uniqueIdentifier)
const clientRespawnCooldowns = {}

const extraRespawnTimes = {}

// Respawns exclusivos para grupos específicos
let exclusiveRespawns = {}

// Respawns pausados individualmente
let pausedRespawns = {}

// Inicializa o objeto para armazenar os tempos de respawn
let customRespawnTimes = {}

// Função para carregar o arquivo respawns.json
async function loadRespawnData() {
  const filePath = path.join(__dirname, "respawns.json")
  try {
    const data = await fs.readFile(filePath, "utf8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Erro ao carregar os dados de respawn:", error)
    return {} // Retorna um objeto vazio se o arquivo não existir
  }
}

// Função para obter o nome do respawn a partir do número
async function getRespawnName(respawnNumber) {
  const respawnData = await loadRespawnData()
  // Normaliza o respawnNumber para minúsculo para comparação
  const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

  for (const city in respawnData) {
    for (const key in respawnData[city]) {
      if (key.toLowerCase() === normalizedRespawnNumber) {
        return `${city} - ${respawnData[city][key]}`
      }
    }
  }
  return "Desconhecido"
}

// Função para carregar o arquivo exclusiveRespawns.json
async function loadExclusiveRespawns() {
  const filePath = path.join(__dirname, "exclusiveRespawns.json")
  try {
    const data = await fs.readFile(filePath, "utf8")
    exclusiveRespawns = JSON.parse(data)
    console.log("Respawns exclusivos carregados com sucesso:", exclusiveRespawns)
  } catch (error) {
    if (error.code === "ENOENT") {
      // O arquivo não existe; cria um arquivo vazio
      await saveExclusiveRespawns()
      console.log("Arquivo exclusiveRespawns.json criado.")
    } else {
      console.error("Erro ao carregar o arquivo exclusiveRespawns.json:", error)
    }
  }
}

// Função para salvar no arquivo exclusiveRespawns.json
async function saveExclusiveRespawns() {
  const filePath = path.join(__dirname, "exclusiveRespawns.json")
  try {
    await fs.writeFile(filePath, JSON.stringify(exclusiveRespawns, null, 2), "utf8")
    console.log("Respawns exclusivos salvos com sucesso.")
  } catch (error) {
    console.error("Erro ao salvar o arquivo exclusiveRespawns.json:", error)
  }
}

// Função para carregar o arquivo pausedRespawns.json
async function loadPausedRespawns() {
  const filePath = path.join(__dirname, "pausedRespawns.json")
  try {
    const data = await fs.readFile(filePath, "utf8")
    pausedRespawns = JSON.parse(data)
    console.log("Respawns pausados carregados com sucesso:", pausedRespawns)
  } catch (error) {
    if (error.code === "ENOENT") {
      // O arquivo não existe; cria um arquivo vazio
      await savePausedRespawns()
      console.log("Arquivo pausedRespawns.json criado.")
    } else {
      console.error("Erro ao carregar o arquivo pausedRespawns.json:", error)
    }
  }
}

// Função para salvar no arquivo pausedRespawns.json
async function savePausedRespawns() {
  const filePath = path.join(__dirname, "pausedRespawns.json")
  try {
    await fs.writeFile(filePath, JSON.stringify(pausedRespawns, null, 2), "utf8")
    console.log("Respawns pausados salvos com sucesso.")
  } catch (error) {
    console.error("Erro ao salvar o arquivo pausedRespawns.json:", error)
  }
}

// Função para carregar o arquivo fila.json
async function loadFilaRespawns() {
  const filePath = path.join(__dirname, "fila.json")
  try {
    const data = await fs.readFile(filePath, "utf8")
    const filaRespawns = JSON.parse(data)

    // Validar e corrigir dados inconsistentes
    for (const respawnKey in filaRespawns) {
      const respawn = filaRespawns[respawnKey]

      // Verificar se o respawn tem a estrutura correta
      if (!respawn || typeof respawn !== "object") {
        delete filaRespawns[respawnKey]
        continue
      }

      // Verificar se current existe e é válido
      if (!respawn.current || typeof respawn.current !== "object") {
        // Se não houver jogador atual mas houver fila, mover o próximo da fila
        if (Array.isArray(respawn.queue) && respawn.queue.length > 0) {
          respawn.current = respawn.queue.shift()
          respawn.waitingForAccept = true
          respawn.acceptanceTime = 10
        } else {
          // Se não houver fila, remover o respawn
          delete filaRespawns[respawnKey]
          continue
        }
      }

      // Garantir que queue seja um array
      if (!Array.isArray(respawn.queue)) {
        respawn.queue = []
      }

      // Garantir que time seja um número válido
      if (typeof respawn.time !== "number" || isNaN(respawn.time) || respawn.time < 0) {
        respawn.time = defaultRespawnTime
      }

      // Garantir que waitingForAccept seja booleano
      if (typeof respawn.waitingForAccept !== "boolean") {
        respawn.waitingForAccept = false
      }

      // Garantir que acceptanceTime seja um número válido
      if (typeof respawn.acceptanceTime !== "number" || isNaN(respawn.acceptanceTime)) {
        respawn.acceptanceTime = 10
      }

      // Adicionar startTime se não existir
      if (!respawn.startTime) {
        respawn.startTime = new Date().toISOString()
      }

      // Adicionar endTime se não existir
      if (!respawn.endTime) {
        const startDate = new Date(respawn.startTime)
        const endDate = new Date(startDate.getTime() + respawn.time * 60000)
        respawn.endTime = endDate.toISOString()
      }
    }

    return filaRespawns
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("Arquivo fila.json não encontrado. Criando novo arquivo.")
      await saveFilaRespawns({})
      return {}
    }
    console.error("Erro ao carregar a fila de respawns:", error)
    return {} // Retorna um objeto vazio em caso de erro
  }
}

// Função para salvar no arquivo fila.json
async function saveFilaRespawns(filaRespawns) {
  const filePath = path.join(__dirname, "fila.json")
  try {
    // Criar uma cópia para evitar modificações durante o salvamento
    const filaRespawnsCopy = JSON.parse(JSON.stringify(filaRespawns))

    await fs.writeFile(filePath, JSON.stringify(filaRespawnsCopy, null, 2), "utf8")
    console.log("Fila de respawns salva com sucesso.")

    // Criar um backup do arquivo
    const backupPath = path.join(__dirname, "fila_backup.json")
    await fs.writeFile(backupPath, JSON.stringify(filaRespawnsCopy, null, 2), "utf8")
  } catch (error) {
    console.error("Erro ao salvar a fila de respawns:", error)
  }
}

// Função para verificar se o respawn é válido com base no respawns.json
async function isValidRespawn(respawnNumber) {
  const respawnData = await loadRespawnData()
  // Normaliza o respawnNumber para minúsculo para comparação
  const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

  for (const city in respawnData) {
    // Verifica se existe o respawn com a chave normalizada ou original
    for (const key in respawnData[city]) {
      if (key.toLowerCase() === normalizedRespawnNumber) {
        return true
      }
    }
  }
  return false
}

// Função para verificar se o cliente tem permissão para usar um respawn exclusivo
// Função para verificar se o cliente tem permissão para usar um respawn
async function canUseExclusiveRespawn(clientInfo, respawnNumber) {
  // Normaliza o respawnNumber para minúsculo para comparação
  const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()
  const clientServerGroups = clientInfo.servergroups || []

  // Verificar se o cliente pertence a algum grupo bloqueado
  if (blockedRespawns[normalizedRespawnNumber]) {
    for (const blockedGroupId of blockedRespawns[normalizedRespawnNumber]) {
      if (clientServerGroups.includes(blockedGroupId.toString())) {
        // Cliente pertence a um grupo bloqueado
        return false
      }
    }
  }

  // Verificar se o respawn é exclusivo
  if (exclusiveRespawns[normalizedRespawnNumber]) {
    const requiredGroupId = exclusiveRespawns[normalizedRespawnNumber]

    // Verificar se o cliente tem o grupo necessário
    return clientServerGroups.includes(requiredGroupId.toString())
  }

  // Se o respawn não for exclusivo e o cliente não estiver em um grupo bloqueado, qualquer um pode usar
  return true
}

async function formatClientName(nickname, uniqueIdentifier, clid) {
  try {
    // Usar getFullClientInfo em vez de ts3.getClientById
    const clientInfo = await getFullClientInfo(clid)
    
    // Usar a descrição do cliente se disponível, caso contrário usar o nickname
    const displayText = clientInfo && clientInfo.clientDescription ? clientInfo.clientDescription : nickname
    
    const encodedNickname = nickname
      .replace(/\\/g, "%5C")
      .replace(/\[/g, "%5C%5B")
      .replace(/\]/g, "%5C%5D")
      .replace(/ /g, "%20")

    return `[URL=client://${clid}/${uniqueIdentifier}~${encodedNickname}]${displayText}[/URL]`
  } catch (error) {
    console.error(`Erro ao obter descrição do cliente ${nickname}:`, error)
    // Em caso de erro, retornar o nickname original
    return `[URL=client://${clid}/${uniqueIdentifier}~${nickname}]${nickname}[/URL]`
  }
}

// Função para calcular o tempo restante com base no timestamp
function calculateRemainingTime(endTimeStr) {
  const now = new Date()
  const endTime = new Date(endTimeStr)

  // Calcular a diferença em minutos
  const diffMs = endTime.getTime() - now.getTime()
  const diffMinutes = Math.ceil(diffMs / 60000)

  return Math.max(0, diffMinutes) // Nunca retornar tempo negativo
}

// Adicione estas constantes no início do seu arquivo
const respawnHistoryFile = path.join(__dirname, "respawnHistory.json")

// Função para carregar o histórico de respawns
async function loadRespawnHistory() {
  try {
    const data = await fs.readFile(respawnHistoryFile, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    if (error.code === "ENOENT") {
      // O arquivo não existe; cria um arquivo vazio
      await saveRespawnHistory([])
      console.log("Arquivo respawnHistory.json criado.")
      return []
    } else {
      console.error("Erro ao carregar o arquivo respawnHistory.json:", error)
      return []
    }
  }
}

// Função para salvar o histórico de respawns
async function saveRespawnHistory(history) {
  try {
    await fs.writeFile(respawnHistoryFile, JSON.stringify(history, null, 2))
    console.log("Histórico de respawns salvo com sucesso.")
  } catch (error) {
    console.error("Erro ao salvar o arquivo respawnHistory.json:", error)
  }
}

// Função para adicionar um evento ao histórico de respawns
async function addToRespawnHistory(clientData, respawnNumber, respawnName, time, customTime) {
  try {
    const history = await loadRespawnHistory()
    
    // Criar um novo registro de histórico
    const historyEntry = {
      timestamp: new Date().toISOString(),
      clientNickname: clientData.clientNickname,
      clientUniqueIdentifier: clientData.clientUniqueIdentifier,
      respawnNumber: respawnNumber,
      respawnName: respawnName,
      allocatedTime: time, // Tempo em minutos
      customTime: customTime ? true : false, // Se foi um tempo personalizado
      date: new Date().toLocaleDateString("pt-BR") // Data formatada para facilitar a busca
    }
    
    // Adicionar ao histórico
    history.push(historyEntry)
    
    // Limitar o tamanho do histórico (opcional, para evitar arquivos muito grandes)
    if (history.length > 10000) {
      history.shift() // Remove o registro mais antigo
    }
    
    // Salvar o histórico atualizado
    await saveRespawnHistory(history)
  } catch (error) {
    console.error("Erro ao adicionar ao histórico de respawns:", error)
  }
}

// Função para lidar com o comando !resphistory
async function handleRespHistoryCommand(client, dateStr) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !resphistory.")
      return
    }

    // Carregar o histórico
    const history = await loadRespawnHistory()
    
    if (history.length === 0) {
      await ts3.sendTextMessage(client.clid, 1, "Não há registros no histórico de respawns.")
      return
    }

    let filteredHistory = history
    
    // Se uma data foi especificada, filtrar por ela
    if (dateStr) {
      // Verificar o formato da data (DD-MM-YYYY)
      const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/
      const match = dateStr.match(dateRegex)
      
      if (!match) {
        await ts3.sendTextMessage(client.clid, 1, "Formato de data inválido. Use DD-MM-YYYY (ex: 10-04-2025).")
        return
      }
      
      // Converter para o formato brasileiro (DD/MM/YYYY)
      const day = match[1]
      const month = match[2]
      const year = match[3]
      const formattedDate = `${day}/${month}/${year}`
      
      // Filtrar o histórico pela data
      filteredHistory = history.filter(entry => entry.date === formattedDate)
      
      if (filteredHistory.length === 0) {
        await ts3.sendTextMessage(client.clid, 1, `Não há registros para a data ${formattedDate}.`)
        return
      }
    }
    
    // Limitar a quantidade de registros para evitar mensagens muito grandes
    const maxEntries = 20
    const limitedHistory = filteredHistory.slice(-maxEntries)
    const hasMore = filteredHistory.length > maxEntries
    
    // Construir a mensagem de resposta
    let responseMessage = "[b]Histórico de Respawns[/b]\n\n"
    
    if (dateStr) {
      const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/
      const match = dateStr.match(dateRegex)
      const day = match[1]
      const month = match[2]
      const year = match[3]
      responseMessage += `[b]Data:[/b] ${day}/${month}/${year}\n\n`
    }
    
    // Adicionar cada entrada do histórico à mensagem
    limitedHistory.forEach((entry, index) => {
      const date = new Date(entry.timestamp)
      const formattedTime = date.toLocaleTimeString("pt-BR")
      
      responseMessage += `[b]${index + 1}.[/b] ${formattedTime} - ${entry.clientNickname}\n`
      responseMessage += `   Respawn: ${entry.respawnNumber} (${entry.respawnName})\n`
      
      // Formatar o tempo para exibição (horas e minutos)
      const hours = Math.floor(entry.allocatedTime / 60)
      const minutes = entry.allocatedTime % 60
      const timeDisplay = hours > 0
        ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`
        : `${minutes}m`
      
      responseMessage += `   Tempo: ${timeDisplay}${entry.customTime ? " (personalizado)" : ""}\n\n`
    })
    
    if (hasMore) {
      responseMessage += `[i]Mostrando os ${maxEntries} registros mais recentes de ${filteredHistory.length} encontrados.[/i]\n`
    }
    
    // Enviar a mensagem
    await ts3.sendTextMessage(client.clid, 1, responseMessage)
  } catch (error) {
    console.error("Erro ao processar comando !resphistory:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}
// Adicione esta variável global no início do arquivo
let blockedRespawns = {}

// Função para carregar o arquivo blockedRespawns.json
async function loadBlockedRespawns() {
  const filePath = path.join(__dirname, "blockedRespawns.json")
  try {
    const data = await fs.readFile(filePath, "utf8")
    blockedRespawns = JSON.parse(data)
    console.log("Respawns bloqueados carregados com sucesso:", blockedRespawns)
  } catch (error) {
    if (error.code === "ENOENT") {
      // O arquivo não existe; cria um arquivo vazio
      await saveBlockedRespawns()
      console.log("Arquivo blockedRespawns.json criado.")
    } else {
      console.error("Erro ao carregar o arquivo blockedRespawns.json:", error)
    }
  }
}

// Função para salvar no arquivo blockedRespawns.json
async function saveBlockedRespawns() {
  const filePath = path.join(__dirname, "blockedRespawns.json")
  try {
    await fs.writeFile(filePath, JSON.stringify(blockedRespawns, null, 2), "utf8")
    console.log("Respawns bloqueados salvos com sucesso.")
  } catch (error) {
    console.error("Erro ao salvar o arquivo blockedRespawns.json:", error)
  }
}

// Função para lidar com o comando !respblock
async function handleRespBlockCommand(client, respawnNumber, groupId) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respblock.")
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    if (!(await isValidRespawn(normalizedRespawnNumber))) {
      await ts3.sendTextMessage(client.clid, 1, `O respawn número ${respawnNumber} não é válido.`)
      return
    }

    const groupIdNumber = Number.parseInt(groupId)

    if (isNaN(groupIdNumber)) {
      await ts3.sendTextMessage(client.clid, 1, "Por favor, forneça um ID de grupo válido.")
      return
    }

    // Definir o respawn como bloqueado para o grupo especificado
    if (!blockedRespawns[normalizedRespawnNumber]) {
      blockedRespawns[normalizedRespawnNumber] = []
    }
    
    // Verificar se o grupo já está bloqueado
    if (blockedRespawns[normalizedRespawnNumber].includes(groupIdNumber)) {
      await ts3.sendTextMessage(
        client.clid,
        1,
        `O grupo ${groupIdNumber} já está bloqueado no respawn ${respawnNumber}.`
      )
      return
    }
    
    // Adicionar o grupo à lista de bloqueados
    blockedRespawns[normalizedRespawnNumber].push(groupIdNumber)
    await saveBlockedRespawns()

    await ts3.sendTextMessage(
      client.clid,
      1,
      `O grupo ${groupIdNumber} agora está bloqueado de usar o respawn ${respawnNumber}.`
    )
  } catch (error) {
    console.error("Erro ao processar comando !respblock:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}



// Função para lidar com o comando !respunblock (para remover um bloqueio)
async function handleRespUnblockCommand(client, respawnNumber, groupId) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respunblock.")
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    if (!(await isValidRespawn(normalizedRespawnNumber))) {
      await ts3.sendTextMessage(client.clid, 1, `O respawn número ${respawnNumber} não é válido.`)
      return
    }

    const groupIdNumber = Number.parseInt(groupId)

    if (isNaN(groupIdNumber)) {
      await ts3.sendTextMessage(client.clid, 1, "Por favor, forneça um ID de grupo válido.")
      return
    }

    // Verificar se o respawn tem grupos bloqueados
    if (!blockedRespawns[normalizedRespawnNumber] || !blockedRespawns[normalizedRespawnNumber].includes(groupIdNumber)) {
      await ts3.sendTextMessage(
        client.clid,
        1,
        `O grupo ${groupIdNumber} não está bloqueado no respawn ${respawnNumber}.`
      )
      return
    }
    
    // Remover o grupo da lista de bloqueados
    blockedRespawns[normalizedRespawnNumber] = blockedRespawns[normalizedRespawnNumber].filter(id => id !== groupIdNumber)
    
    // Se não houver mais grupos bloqueados, remover o respawn da lista
    if (blockedRespawns[normalizedRespawnNumber].length === 0) {
      delete blockedRespawns[normalizedRespawnNumber]
    }
    
    await saveBlockedRespawns()

    await ts3.sendTextMessage(
      client.clid,
      1,
      `O grupo ${groupIdNumber} foi desbloqueado do respawn ${respawnNumber}.`
    )
  } catch (error) {
    console.error("Erro ao processar comando !respunblock:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para listar todos os bloqueios de um respawn
async function handleRespBlockListCommand(client, respawnNumber) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respblocklist.")
      return
    }

    // Se não foi especificado um respawn, listar todos os bloqueios
    if (!respawnNumber) {
      let message = "Lista de todos os respawns com bloqueios:\n\n"
      
      if (Object.keys(blockedRespawns).length === 0) {
        message = "Não há respawns com bloqueios configurados."
      } else {
        for (const respKey in blockedRespawns) {
          const respawnName = await getRespawnName(respKey)
          message += `Respawn ${respKey} (${respawnName}):\n`
          message += `  Grupos bloqueados: ${blockedRespawns[respKey].join(", ")}\n\n`
        }
      }
      
      await ts3.sendTextMessage(client.clid, 1, message)
      return
    }
    
    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    if (!(await isValidRespawn(normalizedRespawnNumber))) {
      await ts3.sendTextMessage(client.clid, 1, `O respawn número ${respawnNumber} não é válido.`)
      return
    }

    // Verificar se o respawn tem grupos bloqueados
    if (!blockedRespawns[normalizedRespawnNumber] || blockedRespawns[normalizedRespawnNumber].length === 0) {
      await ts3.sendTextMessage(
        client.clid,
        1,
        `O respawn ${respawnNumber} não tem grupos bloqueados.`
      )
      return
    }
    
    const respawnName = await getRespawnName(respawnNumber)
    let message = `Grupos bloqueados no respawn ${respawnNumber} (${respawnName}):\n\n`
    message += blockedRespawns[normalizedRespawnNumber].join(", ")
    
    await ts3.sendTextMessage(client.clid, 1, message)
  } catch (error) {
    console.error("Erro ao processar comando !respblocklist:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}


async function updateRespawnChannel() {
  try {
    console.log("[UPDATE] Iniciando atualização do canal de respawn")
    const respawnData = await loadRespawnData()
    const filaRespawns = await loadFilaRespawns()
    const currentDate = new Date()
    const formattedDate = `${currentDate.toLocaleDateString("pt-BR")} ${currentDate.toLocaleTimeString("pt-BR")}`

    // Obter todos os clientes conectados uma única vez para melhorar a performance
    console.log("[UPDATE] Obtendo lista de todos os clientes conectados")
    const allClients = await ts3.clientList()
    const clientMap = new Map() // Mapa de uniqueIdentifier -> clientInfo
    
    // Criar um mapa de clientes para consulta rápida
    allClients.forEach(client => {
      if (client.uniqueIdentifier) {
        clientMap.set(client.uniqueIdentifier, client)
      }
    })
    
    console.log(`[UPDATE] ${clientMap.size} clientes conectados mapeados`)

    // Começar com o cabeçalho
    let description = `[size=+3]RESPAWN LIST[/size]\n[i]${formattedDate}[/i]\n`

    // Iniciar a tabela com o cabeçalho
    description += `[table][tr][td][/td][td][B]Respawn[/B][/td][td][B]Tempo / Restante[/B][/td][td][B]Ocupado por[/B][/td][td][B]Nexts[/B][/td][/tr][tr][td][/td][td][/td][td][/td][td][/td][td][/td][/tr]\n`

    let mudancas = false // Flag para controlar se houve alterações nos dados

    for (const respawnNumber in filaRespawns) {
      const respawn = filaRespawns[respawnNumber]
      if (!respawn || !respawn.current) continue

      const respawnName = await getRespawnName(respawnNumber)
      console.log(`[UPDATE] Processando respawn ${respawnNumber} (${respawnName})`)

      try {
        // Processar o cliente atual
        let formattedName = ""
        
        // IMPORTANTE: Sempre verificar pelo uniqueIdentifier primeiro
        if (!respawn.current.clientUniqueIdentifier) {
          console.error(`[UPDATE] Cliente atual no respawn ${respawnNumber} não tem uniqueIdentifier`)
          formattedName = `${respawn.current.clientNickname} [b][color=orange][ERRO][/color][/b]`
        } else {
          // Verificar se o cliente está online usando o mapa de clientes
          const onlineClient = clientMap.get(respawn.current.clientUniqueIdentifier)
          
          if (onlineClient) {
            // Cliente está online, atualizar o CLID
            if (respawn.current.clid !== onlineClient.clid) {
              console.log(`[UPDATE] Atualizando CLID do cliente ${respawn.current.clientNickname}: ${respawn.current.clid} -> ${onlineClient.clid}`)
              respawn.current.clid = onlineClient.clid
              mudancas = true
            }
            formattedName = await formatClientName(onlineClient.nickname, onlineClient.uniqueIdentifier, onlineClient.clid)
          } else {
            // Cliente não está online
            console.log(`[UPDATE] Cliente ${respawn.current.clientNickname} não está online`)
            formattedName = `${respawn.current.clientNickname} [b][color=red][OFFLINE][/color][/b]`
          }
        }

        // Coluna Tempo (código existente)
        let tempoText = ""
        if (respawn.waitingForAccept) {
          tempoText = `[color=red]Aguardando (${respawn.acceptanceTime}m)[/color]`
        } else {
          // Calcular tempo decorrido e tempo total
          let elapsedTime, totalTime

          // Verificar se o respawn está pausado
          if (pausedRespawns[respawnNumber]) {
            // Para respawns pausados
            const totalHours = Math.floor(respawn.time / 60)
            const totalMinutes = respawn.time % 60

            // Calcular tempo decorrido desde o início
            const startDate = new Date(respawn.startTime)
            const now = new Date()
            const elapsedMs = now - startDate
            const elapsedMinutes = Math.floor(elapsedMs / 60000)
            const elapsedHours = Math.floor(elapsedMinutes / 60)
            const elapsedMins = elapsedMinutes % 60

            elapsedTime = `${elapsedHours.toString().padStart(2, "0")}h${elapsedMins.toString().padStart(2, "0")}m`
            totalTime = `${totalHours.toString().padStart(2, "0")}h${totalMinutes.toString().padStart(2, "0")}m`

            // Tempo formatado
            tempoText = `[b][color=#1D8F24]${elapsedTime}/${totalTime}[/color][/b]`
          } else {
            // Para respawns ativos
            const totalHours = Math.floor(respawn.time / 60)
            const totalMinutes = respawn.time % 60

            // Calcular tempo decorrido desde o início
            const startDate = new Date(respawn.startTime)
            const now = new Date()
            const elapsedMs = now - startDate
            const elapsedMinutes = Math.floor(elapsedMs / 60000)
            const elapsedHours = Math.floor(elapsedMinutes / 60)
            const elapsedMins = elapsedMinutes % 60

            elapsedTime = `${elapsedHours.toString().padStart(2, "0")}h${elapsedMins.toString().padStart(2, "0")}m`
            totalTime = `${totalHours.toString().padStart(2, "0")}h${totalMinutes.toString().padStart(2, "0")}m`

            // Tempo formatado
            tempoText = `[b][color=#1D8F24]${elapsedTime}/${totalTime}      [/color][/b]`
          }
        }

        // Coluna Next
        let nextText = ""
        if (respawn.waitingForAccept) {
          nextText = `[b][color=red]Pendente[/color][/b]`
        } else if (pausedRespawns[respawnNumber]) {
          nextText = `[b][color=red]PAUSADO[/color][/b]`
        } else {
          // Fila na coluna Nexts
          if (respawn.queue && respawn.queue.length > 0) {
            // Verificar e limpar entradas inválidas na fila
            const validQueue = respawn.queue.filter(client => client && client.clientUniqueIdentifier)
            
            if (validQueue.length !== respawn.queue.length) {
              console.log(`[UPDATE] Removendo ${respawn.queue.length - validQueue.length} entradas inválidas da fila do respawn ${respawnNumber}`)
              respawn.queue = validQueue
              mudancas = true
            }
            
            if (respawn.queue.length > 0) {
              const nextClient = respawn.queue[0]
              
              // IMPORTANTE: Sempre verificar pelo uniqueIdentifier primeiro
              if (!nextClient.clientUniqueIdentifier) {
                console.error(`[UPDATE] Próximo cliente na fila do respawn ${respawnNumber} não tem uniqueIdentifier`)
                nextText = `[u]${nextClient.clientNickname} [color=orange][ERRO][/color][/u]`
              } else {
                // Verificar se o cliente está online usando o mapa de clientes
                const onlineNextClient = clientMap.get(nextClient.clientUniqueIdentifier)
                
                if (onlineNextClient) {
                  // Cliente está online, atualizar o CLID
                  if (nextClient.clid !== onlineNextClient.clid) {
                    console.log(`[UPDATE] Atualizando CLID do cliente na fila ${nextClient.clientNickname}: ${nextClient.clid} -> ${onlineNextClient.clid}`)
                    nextClient.clid = onlineNextClient.clid
                    mudancas = true
                  }
                  
                  const formattedNextClient = await formatClientName(
                    onlineNextClient.nickname,
                    onlineNextClient.uniqueIdentifier,
                    onlineNextClient.clid
                  )

                  // Mostrar próximo na fila e quantos mais estão esperando
                  if (respawn.queue.length > 1) {
                    nextText = `${formattedNextClient} [color=#95A5A6](+${respawn.queue.length - 1})    [/color]`
                  } else {
                    nextText = `${formattedNextClient}    `
                  }
                } else {
                  // Cliente na fila não está online
                  console.log(`[UPDATE] Cliente na fila ${nextClient.clientNickname} não está online`)
                  nextText = `[u]${nextClient.clientNickname} [color=red][OFFLINE][/color][/u]`
                }
              }
            } else {
              nextText = `[color=black]Nenhum[/color]`
            }
          } else {
            nextText = `[color=black]Nenhum[/color]`
          }
        }

        // Adicionar linha à tabela
        description += `[tr][td][[color=#E67E22][b]${respawnNumber.toUpperCase()}[/b][/color]][/td][td] ${respawnName.toUpperCase()} [/td][td]${tempoText}[/td][td]${formattedName}[/td][td]${nextText}[/td][/tr]\n`
      } catch (error) {
        console.error(`[UPDATE] Erro ao processar respawn ${respawnNumber}: ${error.message}`)
        // Não vamos remover o respawn em caso de erro
        description += `[tr][td][[color=#E67E22][b]${respawnNumber.toUpperCase()}[/b][/color]][/td][td] ${respawnName.toUpperCase()} [/td][td][color=red]ERRO[/color][/td][td][color=red]ERRO[/color][/td][td][color=red]ERRO[/color][/td][/tr]\n`
      }
    }

    // Fechar a tabela
    description += "[/table]\n\n"

    // Adicionar rodapé
    description += "[center][size=8]Última atualização: " + new Date().toLocaleString() + "[/size][/center]"

    try {
      await ts3.channelEdit(canalResp, { channel_description: description })
      console.log("[UPDATE] Canal de respawn atualizado com sucesso.")
    } catch (error) {
      console.error("[UPDATE] Erro ao atualizar o canal de respawn:", error)
    }

    // Salvar as alterações feitas durante a atualização apenas se houver mudanças
    if (mudancas) {
      console.log("[UPDATE] Salvando alterações nos dados de respawn")
      await saveFilaRespawns(filaRespawns)
    }
    
    console.log("[UPDATE] Atualização do canal concluída")
  } catch (error) {
    console.error("[UPDATE] Erro geral na função updateRespawnChannel:", error)
  }
}
  
// Função auxiliar para calcular o tempo decorrido desde o início
function calculateElapsedTime(startTimeStr) {
  const startTime = new Date(startTimeStr)
  const now = new Date()
  
  // Calcular a diferença em minutos
  const diffMs = now.getTime() - startTime.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  
  return Math.max(0, diffMinutes) // Nunca retornar tempo negativo
}

// Função para verificar se o cliente está em cooldown (usando uniqueIdentifier)
function isClientInCooldown(clientInfo) {
  const uniqueId = clientInfo.uniqueIdentifier
  
  if (!clientRespawnCooldowns[uniqueId]) {
    return false
  }

  const now = Date.now()
  const cooldownTime = clientRespawnCooldowns[uniqueId]

  console.log(
    `Verificando cooldown para ${clientInfo.nickname} (${uniqueId}): Tempo atual: ${now}, Cooldown até: ${cooldownTime}, Diferença: ${(cooldownTime - now) / 1000} segundos`,
  )

  return cooldownTime > now
}

// Modificação na função processRespawns para usar uniqueIdentifier
async function processRespawns() {
  if (isRespawnPaused) {
    console.log("Sistema de respawn está pausado globalmente")
    return
  }

  try {
    const filaRespawns = await loadFilaRespawns()
    let mudancas = false

    // Processar cooldowns de respawn
    const now = Date.now()
    for (const uniqueId in clientRespawnCooldowns) {
      if (clientRespawnCooldowns[uniqueId] <= now) {
        console.log(`Cooldown expirado para o cliente ${uniqueId}`)
        delete clientRespawnCooldowns[uniqueId]
        mudancas = true
      }
    }

    for (const respawnKey in filaRespawns) {
      const respawn = filaRespawns[respawnKey]

      // Verificar se o respawn tem estrutura válida
      if (!respawn || !respawn.current) {
        delete filaRespawns[respawnKey]
        mudancas = true
        continue
      }

      // Verificar se o respawn está pausado individualmente
      if (pausedRespawns[respawnKey]) {
        console.log(`Respawn ${respawnKey} está pausado individualmente`)
        continue
      }

      if (respawn.waitingForAccept) {
        respawn.acceptanceTime--
        console.log(`Respawn ${respawnKey}: Aguardando aceitação, tempo restante: ${respawn.acceptanceTime}m`)

        if (respawn.acceptanceTime <= 0) {
          console.log(`Respawn ${respawnKey}: Tempo de aceitação esgotado`)
          const removedPlayer = respawn.current

          try {
            // Tentar enviar mensagem, mas pode falhar se o jogador estiver offline
            await ts3.sendTextMessage(removedPlayer.clid, 1, "Você foi removido do respawn por não aceitar a tempo.")
          } catch (error) {
            console.error(`Erro ao enviar mensagem para cliente removido: ${error.message}`)
          }

          if (respawn.queue.length > 0) {
            const nextClient = respawn.queue.shift()
            respawn.current = nextClient
            respawn.waitingForAccept = true
            respawn.acceptanceTime = 10 // 10 minutes to accept

            // Tentar obter informações atualizadas do cliente
            try {
              // Primeiro tentar pelo CLID
              let nextClientInfo = null
              try {
                nextClientInfo = await ts3.getClientById(nextClient.clid)
              } catch (error) {
                // Se falhar, tentar encontrar pelo uniqueIdentifier
                const allClients = await ts3.clientList()
                const matchingClient = allClients.find(c => c.uniqueIdentifier === nextClient.clientUniqueIdentifier)
                
                if (matchingClient) {
                  nextClient.clid = matchingClient.clid
                  nextClientInfo = matchingClient
                }
              }
              
              if (nextClientInfo) {
                // Obter o tempo personalizado baseado no grupo do cliente
                respawn.time = await getRespawnTime(nextClientInfo)
                console.log(`Tempo personalizado definido para o próximo cliente: ${respawn.time} minutos`)
              }
            } catch (error) {
              console.error(`Erro ao obter tempo personalizado para o próximo cliente: ${error.message}`)
              // Manter o tempo atual em caso de erro
            }

            // Definir novos timestamps com o tempo possivelmente atualizado
            respawn.startTime = new Date().toISOString()
            const endDate = new Date()
            endDate.setMinutes(endDate.getMinutes() + respawn.time)
            respawn.endTime = endDate.toISOString()

            try {
              await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.")
            } catch (error) {
              console.error(`Erro ao notificar próximo cliente: ${error.message}`)
            }
          } else {
            delete filaRespawns[respawnKey]
          }
          mudancas = true
        } else {
          mudancas = true
        }
      } else if (respawn.current) {
        // Usar timestamp para calcular o tempo restante
        const now = new Date()
        const endTime = new Date(respawn.endTime)

        // Se o tempo acabou
        if (now >= endTime) {
          console.log(`Respawn ${respawnKey}: Tempo esgotado`)

          try {
            // Tentar enviar mensagem, mas pode falhar se o jogador estiver offline
            await ts3.sendTextMessage(respawn.current.clid, 1, "Seu tempo de respawn terminou.")
          } catch (error) {
            console.error(`Erro ao enviar mensagem de término: ${error.message}`)
          }

          if (respawn.queue.length > 0) {
            const nextClient = respawn.queue.shift()
            respawn.current = nextClient
            respawn.waitingForAccept = true
            respawn.acceptanceTime = 10 // 10 minutes to accept

            // Tentar obter informações atualizadas do cliente
            try {
              // Primeiro tentar pelo CLID
              let nextClientInfo = null
              try {
                nextClientInfo = await ts3.getClientById(nextClient.clid)
              } catch (error) {
                // Se falhar, tentar encontrar pelo uniqueIdentifier
                const allClients = await ts3.clientList()
                const matchingClient = allClients.find(c => c.uniqueIdentifier === nextClient.clientUniqueIdentifier)
                
                if (matchingClient) {
                  nextClient.clid = matchingClient.clid
                  nextClientInfo = matchingClient
                }
              }
              
              if (nextClientInfo) {
                // Obter o tempo personalizado baseado no grupo do cliente
                respawn.time = await getRespawnTime(nextClientInfo)
                console.log(`Tempo personalizado definido para o próximo cliente: ${respawn.time} minutos`)
              }
            } catch (error) {
              console.error(`Erro ao obter tempo personalizado para o próximo cliente: ${error.message}`)
              // Manter o tempo atual em caso de erro
            }

            // Definir novos timestamps
            respawn.startTime = new Date().toISOString()
            const endDate = new Date()
            endDate.setMinutes(endDate.getMinutes() + respawn.time)
            respawn.endTime = endDate.toISOString()

            try {
              await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.")
            } catch (error) {
              console.error(`Erro ao notificar próximo cliente: ${error.message}`)
            }
          } else {
            delete filaRespawns[respawnKey]
          }
          mudancas = true
        } else {
          // Atualizar o tempo restante
          const diffMs = endTime.getTime() - now.getTime()
          const diffMinutes = Math.ceil(diffMs / 60000)
          respawn.time = diffMinutes

          console.log(`Respawn ${respawnKey}: Tempo restante atualizado para ${respawn.time}m`)
          mudancas = true
        }
      }
    }

    if (mudancas) {
      await saveFilaRespawns(filaRespawns)
      await updateRespawnChannel()
    }
  } catch (error) {
    console.error("Erro na função processRespawns:", error)
  }
}

// IMPORTANTE: Remover o setInterval duplicado e manter apenas um
// Iniciar o processamento dos respawns a cada minuto
let processInterval = null

function startRespawnProcessing() {
  // Limpar intervalo existente se houver
  if (processInterval) {
    clearInterval(processInterval)
  }

  // Iniciar novo intervalo
  processInterval = setInterval(processRespawns, 60000)
  console.log("Processamento de respawns iniciado")
}

async function hasGuildBankPermission(clientInfo) {
  const clientServerGroups = clientInfo.servergroups || []
  return !clientServerGroups.includes(respblockGroupID.toString()) &&
         !clientServerGroups.includes(convidado.toString()) &&
         !clientServerGroups.includes(SemRegistro.toString())
}

// Função para adicionar tempo extra a um grupo específico
async function handleAddExtraTimeCommand(client, groupId, extraTime) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !addextratime.")
      return
    }

    const groupIdNumber = Number.parseInt(groupId)
    const extraTimeMinutes = Number.parseInt(extraTime)

    if (isNaN(groupIdNumber) || isNaN(extraTimeMinutes)) {
      await ts3.sendTextMessage(client.clid, 1, "Por favor, forneça um ID de grupo e um tempo extra válidos.")
      return
    }

    extraRespawnTimes[groupIdNumber] = extraTimeMinutes
    await ts3.sendTextMessage(
      client.clid,
      1,
      `Tempo extra de ${extraTimeMinutes} minutos adicionado ao grupo ${groupIdNumber}.`,
    )
  } catch (error) {
    console.error("Erro ao processar comando !addextratime:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (error) {
      console.error("Erro ao enviar mensagem de erro:", error)
    }
  }
}

// Função para obter o tempo de respawn com base no grupo do usuário
async function getRespawnTime(clientInfo) {
  const clientServerGroups = clientInfo.servergroups || [] // IDs dos grupos do cliente
  let baseTime = defaultRespawnTime // Tempo padrão (180 minutos)
  let extraTime = 0 // Tempo extra

  console.log("Grupos do cliente:", clientServerGroups) // Adiciona um log para ver os grupos do cliente

  // Verifica o tempo personalizado para cada grupo
  for (const groupId in customRespawnTimes) {
    console.log("Verificando grupo:", groupId) // Log para verificar o grupo
    if (clientServerGroups.includes(groupId)) {
      // Verifique se o grupo existe (como string)
      baseTime = customRespawnTimes[groupId] // Altera o tempo de respawn com base no grupo do cliente
      console.log("Tempo de respawn para o grupo encontrado:", baseTime) // Log para verificar o tempo
      break // Se encontrado, não precisa continuar a busca
    }
  }

  // Verifica os tempos de respawn adicionais baseados em grupos
  for (const groupId in extraRespawnTimes) {
    if (clientServerGroups.includes(groupId)) {
      // Verifique se o grupo existe (como string)
      extraTime += extraRespawnTimes[groupId] // Soma o tempo adicional para o cliente
    }
  }

  console.log("Tempo final de respawn:", baseTime + extraTime) // Log para ver o tempo final
  return baseTime + extraTime // Retorna o tempo total de respawn
}

// Função para analisar o tempo personalizado
function parseCustomTime(timeString) {
  // Verificar se o formato é "MM" (apenas minutos)
  if (/^\d+$/.test(timeString)) {
    return Number.parseInt(timeString)
  }

  // Verificar se o formato é "HH:MM" (horas e minutos)
  const match = timeString.match(/^(\d+):(\d+)$/)
  if (match) {
    const hours = Number.parseInt(match[1])
    const minutes = Number.parseInt(match[2])
    return hours * 60 + minutes
  }

  // Formato inválido
  return 0
}

// Função para obter o tempo restante de cooldown em minutos
function getRemainingCooldownMinutes(uniqueId) {
  if (!clientRespawnCooldowns[uniqueId]) return 0

  const remainingMs = clientRespawnCooldowns[uniqueId] - Date.now()
  return Math.ceil(remainingMs / 60000) // Converte ms para minutos e arredonda para cima
}

// Função para lidar com o comando !resp com tempo personalizado
// Modify the handleRespCommand function to check time limits
// Função para lidar com o comando !resp com tempo personalizado
async function handleRespCommand(client, respawnNumber, customTime) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await hasGuildBankPermission(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !resp.")
      return
    }

    // Verifica se o cliente está em cooldown (usando uniqueIdentifier)
    const uniqueId = clientInfo.uniqueIdentifier
    if (isClientInCooldown(clientInfo)) {
      const remainingMinutes = getRemainingCooldownMinutes(uniqueId)
      await ts3.sendTextMessage(
        client.clid,
        1,
        `Você precisa esperar mais ${remainingMinutes} minutos antes de pegar outro respawn.`,
      )
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    if (!(await isValidRespawn(normalizedRespawnNumber))) {
      await ts3.sendTextMessage(client.clid, 1, `O respawn número ${respawnNumber} não é válido.`)
      return
    }

    // Verificar se o respawn é exclusivo para um grupo específico
    if (!(await canUseExclusiveRespawn(clientInfo, normalizedRespawnNumber))) {
      await ts3.sendTextMessage(
        client.clid,
        1,
        `Você não tem permissão para usar o respawn ${respawnNumber}. Este respawn é exclusivo para um grupo específico.`,
      )
      return
    }

    const clientServerGroups = clientInfo.servergroups || []
    const isExempt =
      clientServerGroups.includes(serveradminGroupID.toString()) ||
      clientServerGroups.includes(masteradminGroupID.toString())

    // Inicializar contagem de respawns para o cliente usando uniqueIdentifier
    if (!clientRespawnCount[uniqueId]) {
      clientRespawnCount[uniqueId] = { current: 0, daily: 0, lastReset: new Date() }
    }

    const now = new Date()
    if (now.getDate() !== clientRespawnCount[uniqueId].lastReset.getDate()) {
      clientRespawnCount[uniqueId].daily = 0
      clientRespawnCount[uniqueId].lastReset = now
    }

    if (!isExempt) {
      if (clientRespawnCount[uniqueId].current >= 9999) {
        await ts3.sendTextMessage(client.clid, 1, "Você já atingiu o limite de 2 respawns simultâneos.")
        return
      }

      if (clientRespawnCount[uniqueId].daily >= 9999) {
        await ts3.sendTextMessage(client.clid, 1, "Você já atingiu o limite de 3 respawns por dia.")
        return
      }
    }

    // Criar objeto de dados do cliente com uniqueIdentifier
    const clientData = {
      clid: client.clid,
      clientNickname: client.nickname,
      clientUniqueIdentifier: clientInfo.uniqueIdentifier,
    }

    const filaRespawns = await loadFilaRespawns()

    // Encontrar a chave correta do respawn (independente de maiúsculas/minúsculas)
    let respawnKey = respawnNumber
    for (const key in filaRespawns) {
      if (key.toLowerCase() === normalizedRespawnNumber) {
        respawnKey = key
        break
      }
    }

    // Verificar se o cliente já está no respawn ou na fila (usando uniqueIdentifier)
    if (filaRespawns[respawnKey]) {
      const isCurrentPlayer = filaRespawns[respawnKey].current && 
                             filaRespawns[respawnKey].current.clientUniqueIdentifier === uniqueId
      
      const isInQueue = filaRespawns[respawnKey].queue.some(user => user.clientUniqueIdentifier === uniqueId)
      
      if (isCurrentPlayer || isInQueue) {
        await ts3.sendTextMessage(client.clid, 1, "Você já está neste respawn ou na fila.")
        return
      }
    }

    // Verificar quantos respawns ativos o cliente tem (usando uniqueIdentifier)
    const activeRespawnCount = Object.values(filaRespawns).filter(
      (respawn) => 
        (respawn.current && respawn.current.clientUniqueIdentifier === uniqueId) || 
        respawn.queue.some((user) => user.clientUniqueIdentifier === uniqueId)
    ).length

    if (!isExempt && activeRespawnCount >= 2) {
      await ts3.sendTextMessage(
        client.clid,
        1,
        "Você já está em 2 respawns. Use !respdel para sair de um deles antes de entrar em outro.",
      )
      return
    }

    // Obter o tempo máximo permitido para o grupo do usuário
    const maxAllowedTime = await getRespawnTime(clientInfo)

    // Determinar o tempo de respawn (personalizado ou padrão)
    let respawnTime

    if (customTime) {
      // Converter o tempo personalizado para minutos
      const timeInMinutes = parseCustomTime(customTime)

      // Verificar se o tempo é válido (maior que 0)
      if (timeInMinutes <= 0) {
        await ts3.sendTextMessage(client.clid, 1, "O tempo personalizado deve ser maior que 0 minutos.")
        return
      }

      // Verificar se o tempo solicitado excede o limite máximo permitido para o grupo do usuário
      if (timeInMinutes > maxAllowedTime) {
        await ts3.sendTextMessage(
          client.clid, 
          1, 
          `O tempo solicitado (${timeInMinutes} minutos) excede seu limite máximo de ${maxAllowedTime} minutos.`
        )
        return
      }

      respawnTime = timeInMinutes
    } else {
      // Usar o tempo padrão baseado no grupo
      respawnTime = maxAllowedTime
    }

    if (!filaRespawns[respawnKey]) {
      // Criar timestamps para controle de tempo
      const startTime = new Date()
      const endTime = new Date(startTime.getTime() + respawnTime * 60000)

      filaRespawns[respawnKey] = {
        current: clientData,
        queue: [],
        time: respawnTime,
        waitingForAccept: true,
        acceptanceTime: 10, // 10 minutes to accept
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      }
      const respawnName = await getRespawnName(respawnNumber)

      // Formatar o tempo para exibição (horas e minutos)
      const hours = Math.floor(respawnTime / 60)
      const minutes = respawnTime % 60
      const timeDisplay =
        hours > 0
          ? `${hours} hora${hours > 1 ? "s" : ""} e ${minutes} minuto${minutes !== 1 ? "s" : ""}`
          : `${minutes} minuto${minutes !== 1 ? "s" : ""}`

      await ts3.sendTextMessage(
        client.clid,
        1,
        `Você está no respawn de ${respawnName} (${respawnNumber}). Digite !aceitar para começar seu tempo de ${timeDisplay}.`,
      )

      // Adicionar ao histórico de respawns
      await addToRespawnHistory(clientData, respawnNumber, respawnName, respawnTime, customTime)

      if (!isExempt) {
        clientRespawnCount[uniqueId].current++
        clientRespawnCount[uniqueId].daily++
      }
    } else {
      filaRespawns[respawnKey].queue.push(clientData)
      const respawnName = await getRespawnName(respawnNumber)
      await ts3.sendTextMessage(
        client.clid,
        1,
        `Você entrou na fila do respawn ${respawnName} (${respawnNumber}). Aguarde sua vez.`,
      )
    }

    await saveFilaRespawns(filaRespawns)
    await updateRespawnChannel()
  } catch (error) {
    console.error("Erro ao processar comando !resp:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para lidar com o comando !respdel
async function handleRespDelCommand(client, respawnNumber) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await hasGuildBankPermission(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respdel.")
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    const filaRespawns = await loadFilaRespawns()

    // Encontrar a chave correta do respawn (independente de maiúsculas/minúsculas)
    let respawnKey = null
    for (const key in filaRespawns) {
      if (key.toLowerCase() === normalizedRespawnNumber) {
        respawnKey = key
        break
      }
    }

    if (!respawnKey || !filaRespawns[respawnKey]) {
      await ts3.sendTextMessage(client.clid, 1, "Respawn não encontrado.")
      return
    }

    const respawn = filaRespawns[respawnKey]
    const uniqueId = clientInfo.uniqueIdentifier

    // Verificar se o cliente é o atual no respawn (usando uniqueIdentifier)
    if (respawn.current && respawn.current.clientUniqueIdentifier === uniqueId) {
      // Definir o cooldown de 10 minutos para o cliente
      const clientServerGroups = clientInfo.servergroups || []
      const isExempt =
        clientServerGroups.includes(serveradminGroupID.toString()) ||
        clientServerGroups.includes(masteradminGroupID.toString())

      if (!isExempt) {
        // Adiciona 10 minutos de cooldown (em milissegundos) usando uniqueIdentifier
        clientRespawnCooldowns[uniqueId] = Date.now() + 10 * 60 * 1000
        const cooldownDate = new Date(clientRespawnCooldowns[uniqueId])
        console.log(
          `Cooldown definido para o cliente ${client.nickname} (${uniqueId}): ${cooldownDate.toISOString()}, Tempo atual: ${new Date().toISOString()}`,
        )
      }

      if (respawn.queue.length > 0) {
        const nextClient = respawn.queue.shift()
        respawn.current = nextClient
        respawn.waitingForAccept = true
        respawn.acceptanceTime = 10 // 10 minutes to accept

        // CORREÇÃO: Obter o tempo personalizado para o próximo cliente
        try {
          // Tentar obter o cliente pelo CLID atual
          let nextClientInfo = null
          try {
            nextClientInfo = await ts3.getClientById(nextClient.clid)
          } catch (error) {
            // Se falhar, tentar encontrar pelo uniqueIdentifier
            const allClients = await ts3.clientList()
            const matchingClient = allClients.find(c => c.uniqueIdentifier === nextClient.clientUniqueIdentifier)
            
            if (matchingClient) {
              nextClient.clid = matchingClient.clid
              nextClientInfo = matchingClient
            }
          }
          
          if (nextClientInfo) {
            // Obter o tempo personalizado baseado no grupo do cliente
            respawn.time = await getRespawnTime(nextClientInfo)
            console.log(`Tempo personalizado definido para o próximo cliente: ${respawn.time} minutos`)
          }
        } catch (error) {
          console.error(`Erro ao obter tempo personalizado para o próximo cliente: ${error.message}`)
          // Manter o tempo atual em caso de erro
        }

        // Criar timestamps para controle de tempo
        const startTime = new Date()
        const endTime = new Date(startTime.getTime() + respawn.time * 60000)
        respawn.startTime = startTime.toISOString()
        respawn.endTime = endTime.toISOString()

        try {
          await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.")
        } catch (error) {
          console.error(`Erro ao notificar próximo cliente: ${error.message}`)
        }
      } else {
        delete filaRespawns[respawnKey]
      }

      if (clientRespawnCount[uniqueId]) {
        clientRespawnCount[uniqueId].current--
      }

      await ts3.sendTextMessage(client.clid, 1, `Você saiu do respawn - ${respawnKey}.`)

      if (!isExempt) {
        await ts3.sendTextMessage(client.clid, 1, "Você precisa esperar 10 minutos antes de pegar outro respawn.")
      }
    } else {
      // Verificar se o cliente está na fila (usando uniqueIdentifier)
      const index = respawn.queue.findIndex((user) => user.clientUniqueIdentifier === uniqueId)
      if (index !== -1) {
        respawn.queue.splice(index, 1)
        await ts3.sendTextMessage(client.clid, 1, `Você foi removido da fila do respawn - ${respawnKey}.`)
      } else {
        await ts3.sendTextMessage(client.clid, 1, "Você não está neste respawn nem na fila.")
      }
    }

    await saveFilaRespawns(filaRespawns)
    await updateRespawnChannel()
  } catch (error) {
    console.error("Erro ao processar comando !respdel:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para verificar se o cliente pertence ao grupo de admin
async function isMasterAdm(clientInfo) {
  const clientServerGroups = clientInfo.servergroups || []

  return (
    clientServerGroups.includes(masteradminGroupID.toString()) ||
    clientServerGroups.includes(respconfiga.toString()) ||
    clientServerGroups.includes(respconfigb.toString()) ||
    clientServerGroups.includes(respconfigc.toString())
  )
}

// Função para lidar com o comando !respkick
async function handleRespKickCommand(client, respawnNumber) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respkick.")
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    const filaRespawns = await loadFilaRespawns()

    // Encontrar a chave correta do respawn (independente de maiúsculas/minúsculas)
    let respawnKey = null
    for (const key in filaRespawns) {
      if (key.toLowerCase() === normalizedRespawnNumber) {
        respawnKey = key
        break
      }
    }

    if (!respawnKey || !filaRespawns[respawnKey]) {
      await ts3.sendTextMessage(client.clid, 1, `Respawn - ${respawnNumber} não encontrado.`)
      return
    }

    const respawn = filaRespawns[respawnKey]

    if (respawn.current) {
      const kickedClient = respawn.current
      respawn.current = null

      // Atualizar contagem de respawns usando uniqueIdentifier
      if (clientRespawnCount[kickedClient.clientUniqueIdentifier]) {
        clientRespawnCount[kickedClient.clientUniqueIdentifier].current--
      }

      if (respawn.queue.length > 0) {
        const nextClient = respawn.queue.shift()
        respawn.current = nextClient
        respawn.waitingForAccept = true
        respawn.acceptanceTime = 10 // 10 minutes to accept

        // Criar timestamps para controle de tempo
        const startTime = new Date()
        const endTime = new Date(startTime.getTime() + respawn.time * 60000)
        respawn.startTime = startTime.toISOString()
        respawn.endTime = endTime.toISOString()

        try {
          await ts3.clientPoke(nextClient.clid, "É a sua vez! Digite !aceitar para começar seu tempo de respawn.")
        } catch (error) {
          console.error(`Erro ao notificar próximo cliente: ${error.message}`)
        }
      } else {
        delete filaRespawns[respawnKey]
      }

      await ts3.sendTextMessage(
        client.clid,
        1,
        `O jogador ${kickedClient.clientNickname} foi removido do respawn - ${respawnKey}.`,
      )

      try {
        await ts3.sendTextMessage(
          kickedClient.clid,
          1,
          `Você foi removido do respawn ${respawnKey} por um administrador.`,
        )
      } catch (error) {
        console.error(`Erro ao notificar cliente removido: ${error.message}`)
      }
    } else {
      await ts3.sendTextMessage(client.clid, 1, "Não há jogador no respawn no momento.")
    }

    await saveFilaRespawns(filaRespawns)
    await updateRespawnChannel()
  } catch (error) {
    console.error("Erro ao processar comando !respkick:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para lidar com o comando !respexclusivo
async function handleRespExclusivoCommand(client, respawnNumber, groupId) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respexclusivo.")
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    if (!(await isValidRespawn(normalizedRespawnNumber))) {
      await ts3.sendTextMessage(client.clid, 1, `O respawn número ${respawnNumber} não é válido.`)
      return
    }

    const groupIdNumber = Number.parseInt(groupId)

    if (isNaN(groupIdNumber)) {
      await ts3.sendTextMessage(client.clid, 1, "Por favor, forneça um ID de grupo válido.")
      return
    }

    // Definir o respawn como exclusivo para o grupo especificado
    exclusiveRespawns[normalizedRespawnNumber] = groupIdNumber
    await saveExclusiveRespawns()

    await ts3.sendTextMessage(
      client.clid,
      1,
      `O respawn ${respawnNumber} agora é exclusivo para o grupo ${groupIdNumber}.`,
    )
  } catch (error) {
    console.error("Erro ao processar comando !respexclusivo:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para lidar com o comando !resppause
async function handleRespPauseCommand(client, respawnNumber) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !resppause.")
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    const filaRespawns = await loadFilaRespawns()

    // Encontrar a chave correta do respawn (independente de maiúsculas/minúsculas)
    let respawnKey = null
    for (const key in filaRespawns) {
      if (key.toLowerCase() === normalizedRespawnNumber) {
        respawnKey = key
        break
      }
    }

    if (!respawnKey || !filaRespawns[respawnKey]) {
      await ts3.sendTextMessage(client.clid, 1, `Respawn - ${respawnNumber} não encontrado.`)
      return
    }

    // Verificar se o respawn já está pausado
    if (pausedRespawns[respawnKey]) {
      // Despausar o respawn
      delete pausedRespawns[respawnKey]

      // Recalcular o tempo restante e atualizar o endTime
      const respawn = filaRespawns[respawnKey]
      const now = new Date()
      const endTime = new Date(now.getTime() + respawn.time * 60000)
      respawn.endTime = endTime.toISOString()

      await ts3.sendTextMessage(client.clid, 1, `O respawn ${respawnKey} foi despausado.`)
    } else {
      // Pausar o respawn
      pausedRespawns[respawnKey] = true
      await ts3.sendTextMessage(client.clid, 1, `O respawn ${respawnKey} foi pausado.`)
    }

    await savePausedRespawns()
    await saveFilaRespawns(filaRespawns)
    await updateRespawnChannel()
  } catch (error) {
    console.error("Erro ao processar comando !resppause:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

const respawnTimesFile = path.join(__dirname, "respawnTimes.json")

// Função para carregar os tempos de respawn do arquivo JSON
async function loadRespawnTimes() {
  try {
    const data = await fs.readFile(respawnTimesFile, "utf-8")
    customRespawnTimes = JSON.parse(data) // Agora permitido porque customRespawnTimes é "let"
    console.log("Tempos de respawn carregados com sucesso:", customRespawnTimes)
  } catch (error) {
    if (error.code === "ENOENT") {
      // O arquivo não existe; cria um arquivo vazio
      await saveRespawnTimes()
      console.log("Arquivo respawnTimes.json criado.")
    } else {
      console.error("Erro ao carregar o arquivo respawnTimes.json:", error)
    }
  }
}

async function saveRespawnTimes() {
  try {
    await fs.writeFile(respawnTimesFile, JSON.stringify(customRespawnTimes, null, 2))
    console.log("Tempos de respawn salvos com sucesso.")
  } catch (error) {
    console.error("Erro ao salvar o arquivo respawnTimes.json:", error)
  }
}

// Função para lidar com o comando !setrespawntime
async function handleSetRespawnTimeCommand(client, groupId, time) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !setrespawntime.")
      return
    }

    const groupIdNumber = Number.parseInt(groupId)
    const timeInMinutes = Number.parseInt(time)

    if (isNaN(groupIdNumber) || isNaN(timeInMinutes)) {
      await ts3.sendTextMessage(client.clid, 1, "Por favor, forneça um ID de grupo e um tempo válidos.")
      return
    }

    // Atualiza o tempo de respawn no objeto
    customRespawnTimes[groupIdNumber] = timeInMinutes

    // Salva os tempos de respawn no arquivo JSON
    await saveRespawnTimes()

    await ts3.sendTextMessage(
      client.clid,
      1,
      `Tempo de respawn para o grupo ${groupIdNumber} definido como ${timeInMinutes} minutos.`,
    
    )
  } catch (error) {
    console.error("Erro ao processar comando !setrespawntime:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para lidar com o comando !respinfo
async function handleRespInfoCommand(client, respawnNumber) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await hasGuildBankPermission(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respinfo.")
      return
    }

    // Normaliza o respawnNumber para garantir que funcione independente de maiúsculas/minúsculas
    const normalizedRespawnNumber = respawnNumber.toString().toLowerCase()

    if (!(await isValidRespawn(normalizedRespawnNumber))) {
      await ts3.sendTextMessage(client.clid, 1, `O respawn - ${respawnNumber} não é válido.`)
      return
    }

    const filaRespawns = await loadFilaRespawns()

    // Encontrar a chave correta do respawn (independente de maiúsculas/minúsculas)
    let respawnKey = null
    for (const key in filaRespawns) {
      if (key.toLowerCase() === normalizedRespawnNumber) {
        respawnKey = key
        break
      }
    }

    if (!respawnKey || !filaRespawns[respawnKey]) {
      await ts3.sendTextMessage(client.clid, 1, `Não há informações para o respawn - ${respawnNumber}.`)
      return
    }

    const respawnData = await loadRespawnData()
    const respawnName = await getRespawnName(respawnNumber)
    let infoMessage = `Informações sobre o respawn - ${respawnNumber} (${respawnName}):\n\n`

    if (filaRespawns[respawnKey].current) {
      infoMessage += `Ocupado por: ${filaRespawns[respawnKey].current.clientNickname}\n`

      if (filaRespawns[respawnKey].waitingForAccept) {
        infoMessage += `Aguardando aceitação: ${filaRespawns[respawnKey].acceptanceTime} minutos restantes\n`
      } else {
        // Verificar se o respawn está pausado
        if (pausedRespawns[respawnKey]) {
          infoMessage += `Status: PAUSADO\n`
          infoMessage += `Tempo restante: ${Math.floor(filaRespawns[respawnKey].time / 60)}h ${filaRespawns[respawnKey].time % 60}m\n`
        } else {
          // Calcular tempo restante com base no timestamp
          const remainingTime = calculateRemainingTime(filaRespawns[respawnKey].endTime)
          const hours = Math.floor(remainingTime / 60)
          const minutes = remainingTime % 60
          infoMessage += `Status: Ativo\n`
          infoMessage += `Tempo restante: ${hours}h ${minutes}m\n`
        }
      }

      // Adicionar informações sobre exclusividade
      if (exclusiveRespawns[normalizedRespawnNumber]) {
        infoMessage += `Exclusivo para o grupo: ${exclusiveRespawns[normalizedRespawnNumber]}\n`
      }

      infoMessage += "\n"
    } else {
      infoMessage += "Atualmente livre\n\n"
    }

    if (filaRespawns[respawnKey].queue.length > 0) {
      infoMessage += "Fila:\n"
      filaRespawns[respawnKey].queue.forEach((user, index) => {
        infoMessage += `  ${index + 1}. ${user.clientNickname}\n`
      })
    } else {
      infoMessage += "Fila: Vazia\n"
    }

    await ts3.sendTextMessage(client.clid, 1, infoMessage)
  } catch (error) {
    console.error("Erro ao processar comando !respinfo:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para lidar com o comando !respstop
async function handleRespStopCommand(client) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respstop.")
      return
    }

    if (isRespawnPaused) {
      await ts3.sendTextMessage(client.clid, 1, "O sistema de respawn já está pausado.")
      return
    }

    isRespawnPaused = true
    await ts3.sendTextMessage(client.clid, 1, "O sistema de respawn foi pausado. Use !respstart para retomar.")
  } catch (error) {
    console.error("Erro ao processar comando !respstop:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para lidar com o comando !respstart
async function handleRespStartCommand(client) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)

    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }

    if (!(await isMasterAdm(clientInfo))) {
      await ts3.sendTextMessage(client.clid, 1, "Você não tem permissão para usar o comando !respstart.")
      return
    }

    if (!isRespawnPaused) {
      await ts3.sendTextMessage(client.clid, 1, "O sistema de respawn não está pausado.")
      return
    }

    isRespawnPaused = false
    await ts3.sendTextMessage(client.clid, 1, "O sistema de respawn foi retomado.")

    // Reiniciar o intervalo para garantir que ele funcione corretamente
    startRespawnProcessing()
  } catch (error) {
    console.error("Erro ao processar comando !respstart:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para lidar com o comando !aceitar
// Função para lidar com o comando !aceitar
async function handleAceitarCommand(client) {
  try {
    const clientInfo = await ts3.getClientById(client.clid)
    if (!clientInfo) {
      throw new Error("Informações do cliente não encontradas.")
    }
    
    const uniqueId = clientInfo.uniqueIdentifier
    const filaRespawns = await loadFilaRespawns()
    
    for (const respawnKey in filaRespawns) {
      const respawn = filaRespawns[respawnKey]
      // Verificar se o cliente é o atual no respawn usando uniqueIdentifier
      if (respawn.current && respawn.current.clientUniqueIdentifier === uniqueId && respawn.waitingForAccept) {
        respawn.waitingForAccept = false
        
        // Atualizar o CLID atual do cliente
        respawn.current.clid = client.clid

        // NÃO sobrescrever o tempo que já foi definido anteriormente
        // Apenas usar o tempo que já está no objeto respawn
        const currentTime = respawn.time;

        // Definir novos timestamps com o tempo já definido
        const startTime = new Date()
        const endTime = new Date(startTime.getTime() + currentTime * 60000)
        respawn.startTime = startTime.toISOString()
        respawn.endTime = endTime.toISOString()

        // Formatar o tempo para exibição
        const hours = Math.floor(currentTime / 60)
        const minutes = currentTime % 60
        const timeDisplay =
          hours > 0
            ? `${hours} hora${hours > 1 ? "s" : ""} e ${minutes} minuto${minutes !== 1 ? "s" : ""}`
            : `${minutes} minuto${minutes !== 1 ? "s" : ""}`

        await ts3.sendTextMessage(
          client.clid,
          1,
          `Você aceitou o respawn ${respawnKey}. Seu tempo de ${timeDisplay} começou.`,
        )
        await saveFilaRespawns(filaRespawns)
        await updateRespawnChannel()
        return
      }
    }
    await ts3.sendTextMessage(client.clid, 1, "Você não tem nenhum respawn para aceitar no momento.")
  } catch (error) {
    console.error("Erro ao processar comando !aceitar:", error)
    try {
      await ts3.sendTextMessage(client.clid, 1, "Ocorreu um erro ao processar seu comando. Por favor, tente novamente.")
    } catch (msgError) {
      console.error("Erro ao enviar mensagem de erro:", msgError)
    }
  }
}

// Função para recuperar o estado após reinicialização
async function recoverStateAfterRestart() {
  try {
    console.log("Iniciando recuperação de estado após reinicialização...")

    // Carregar tempos de respawn personalizados
    await loadRespawnTimes()

    // Carregar respawns exclusivos
    await loadExclusiveRespawns()

    // Carregar respawns pausados
    await loadPausedRespawns()

    // Carregar e validar a fila de respawns
    const filaRespawns = await loadFilaRespawns()

    // Atualizar os tempos com base nos timestamps
    for (const respawnKey in filaRespawns) {
      const respawn = filaRespawns[respawnKey]
      if (respawn && respawn.current && !respawn.waitingForAccept) {
        if (respawn.endTime) {
          // Calcular o tempo restante com base no timestamp
          const remainingTime = calculateRemainingTime(respawn.endTime)
          respawn.time = remainingTime
        }
      }
    }

    await saveFilaRespawns(filaRespawns)

    // Verificar se há respawns ativos
    if (Object.keys(filaRespawns).length > 0) {
      console.log(`Recuperados ${Object.keys(filaRespawns).length} respawns ativos`)

      // Atualizar o canal de respawn
      await updateRespawnChannel()
    } else {
      console.log("Nenhum respawn ativo para recuperar")
    }

    console.log("Recuperação de estado concluída com sucesso")
  } catch (error) {
    console.error("Erro ao recuperar estado após reinicialização:", error)
  }
}

// Função para limpar clientes desconectados periodicamente
async function cleanupDisconnectedClients() {
  try {
    console.log("Iniciando limpeza de clientes desconectados...")
    const filaRespawns = await loadFilaRespawns()
    let mudancas = false

    // Obter lista de todos os clientes conectados
    const allClients = await ts3.clientList()
    const connectedUniqueIds = allClients.map(client => client.uniqueIdentifier)

    for (const respawnKey in filaRespawns) {
      const respawn = filaRespawns[respawnKey]

      // Não vamos mais verificar se o cliente atual está online
      // Isso permite que o jogador mantenha seu respawn mesmo quando offline

      // Verificar a fila - podemos manter essa verificação para limpar a fila
      if (respawn.queue && respawn.queue.length > 0) {
        const newQueue = []
        for (const queuedClient of respawn.queue) {
          // Verificar se o cliente está online usando uniqueIdentifier
          if (connectedUniqueIds.includes(queuedClient.clientUniqueIdentifier)) {
            // Atualizar o CLID se necessário
            const matchingClient = allClients.find(c => c.uniqueIdentifier === queuedClient.clientUniqueIdentifier)
            if (matchingClient && matchingClient.clid !== queuedClient.clid) {
              queuedClient.clid = matchingClient.clid
              console.log(`CLID atualizado para cliente na fila: ${queuedClient.clientNickname}`)
            }
            newQueue.push(queuedClient)
          } else {
            console.log(
              `Cliente ${queuedClient.clientNickname} (${queuedClient.clientUniqueIdentifier}) na fila não está mais conectado, removendo da fila do respawn ${respawnKey}`,
            )
            mudancas = true
          }
        }

        if (newQueue.length !== respawn.queue.length) {
          respawn.queue = newQueue
        }
      }
    }

    if (mudancas) {
      await saveFilaRespawns(filaRespawns)
      await updateRespawnChannel()
      console.log("Limpeza de clientes desconectados concluída com mudanças.")
    } else {
      console.log("Limpeza de clientes desconectados concluída sem mudanças.")
    }
  } catch (error) {
    console.error("Erro durante a limpeza de clientes desconectados:", error)
  }
}

// Executar a limpeza a cada 5 minutos
setInterval(cleanupDisconnectedClients, 300000)

// Evento para capturar a mensagem de texto
ts3.on("textmessage", (ev) => {
  try {
    const message = ev.msg.toLowerCase()
    const args = message.split(" ")

    if (message.startsWith("!resp ")) {
      // Verificar se há argumentos suficientes
      if (args.length >= 2) {
        const respawnNumber = args[1]

        // Verificar se há um tempo personalizado (pode estar no formato "30" ou "00:30")
        let customTime = null
        if (args.length >= 3) {
          // Remover a vírgula se presente
          customTime = args[2].replace(",", "")
        }

        handleRespCommand(ev.invoker, respawnNumber, customTime)
      } else {
        ts3.sendTextMessage(ev.invoker.clid, 1, "Uso correto: !resp [número] [tempo opcional]")
      }
    } else if (message.startsWith("!respdel ")) {
      const [, respawnNumber] = args
      handleRespDelCommand(ev.invoker, respawnNumber)
    } else if (message.startsWith("!respkick ")) {
      const [, respawnNumber] = args
      handleRespKickCommand(ev.invoker, respawnNumber)
    } else if (message.startsWith("!setrespawntime ")) {
      const groupId = args[1]
      const time = args[2]
      handleSetRespawnTimeCommand(ev.invoker, groupId, time)
    } else if (message.startsWith("!addextratime ")) {
      const groupId = args[1]
      const extraTime = args[2]
      handleAddExtraTimeCommand(ev.invoker, groupId, extraTime)
    } else if (message.startsWith("!respinfo ")) {
      const respawnNumber = args[1]
      handleRespInfoCommand(ev.invoker, respawnNumber)
    } else if (message === "!respstop") {
      handleRespStopCommand(ev.invoker)
    } else if (message === "!respstart") {
      handleRespStartCommand(ev.invoker)
    } else if (message === "!aceitar") {
      handleAceitarCommand(ev.invoker)
    } else if (message.startsWith("!respexclusivo ")) {
      if (args.length >= 3) {
        const respawnNumber = args[1]
        const groupId = args[2]
        handleRespExclusivoCommand(ev.invoker, respawnNumber, groupId)
      } else {
        ts3.sendTextMessage(ev.invoker.clid, 1, "Uso correto: !respexclusivo [número] [ID do grupo]")
      }
    } else if (message.startsWith("!resppause ")) {
      const respawnNumber = args[1]
      handleRespPauseCommand(ev.invoker, respawnNumber)
    } else if (message === "!respfix") {
      // Comando adicional para forçar a recuperação do estado
      recoverStateAfterRestart()
      ts3.sendTextMessage(ev.invoker.clid, 1, "Tentando recuperar o estado do sistema de respawn...")
    }
    else if (message.startsWith("!resphistory")) {
      // Verificar se há uma data especificada
      let dateStr = null
      if (args.length >= 2) {
        dateStr = args[1]
      }
      handleRespHistoryCommand(ev.invoker, dateStr)
    }
    else if (message.startsWith("!respblock ")) {
      if (args.length >= 3) {
        const respawnNumber = args[1]
        const groupId = args[2]
        handleRespBlockCommand(ev.invoker, respawnNumber, groupId)
      } else {
        ts3.sendTextMessage(ev.invoker.clid, 1, "Uso correto: !respblock [número] [ID do grupo]")
      }
    }
    else if (message.startsWith("!respunblock ")) {
      if (args.length >= 3) {
        const respawnNumber = args[1]
        const groupId = args[2]
        handleRespUnblockCommand(ev.invoker, respawnNumber, groupId)
      } else {
        ts3.sendTextMessage(ev.invoker.clid, 1, "Uso correto: !respunblock [número] [ID do grupo]")
      }
    }
    else if (message.startsWith("!respblocklist")) {
      const respawnNumber = args.length >= 2 ? args[1] : null
      handleRespBlockListCommand(ev.invoker, respawnNumber)
    }
  } catch (error) {
    console.error("Erro ao processar mensagem de texto:", error)
  }
})

// Inicialização do sistema
;(async function initSystem() {
  try {

    await loadBlockedRespawns()
    // Carregar os dados de respawn ao iniciar
    await loadRespawnData()

    // Carregar tempos de respawn personalizados
    await loadRespawnTimes()

    // Carregar respawns exclusivos
    await loadExclusiveRespawns()

    // Carregar respawns pausados
    await loadPausedRespawns()

    // Recuperar estado após reinicialização
    await recoverStateAfterRestart()

    // Iniciar o processamento dos respawns (apenas uma vez)
    startRespawnProcessing()

    console.log("Sistema de respawn inicializado com sucesso")
  } catch (error) {
    console.error("Erro ao inicializar o sistema de respawn:", error)
  }
})()

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

      [b]!register Nome do Personagem[/b]
      [i]Faz o registro do seu personagem no TS.[/i]

      [b]!alert-level-on / !alert-level-off[/b]
      [i]Ativa/Desativa os avisos de level up dos amigos.[/i]

      [b]!alert-death-on / !alert-death-off[/b]
      [i]Ativa/Desativa os avisos de deaths.[/i]

      [b]!shared 300[/b]
      [i]Mostra level min e maximo para dividir xp com o level informado.[/i]


      `;

      // Se for administrador, exibe também os comandos de administração
      if (isAdminUser) {
          helpMessage += `
          [b]Administração:[/b]

          [b]!mp <mensagem>[/b]
          [i]Envia uma mensagem para todos os membros do canal atual no TeamSpeak.[/i]

          [b]!masskick <mensagem>[/b]
          [i]Expulsa todos os usuários do canal atual.[/i]

          [b]!massmove <mensagem>[/b]
          [i]Transfere todos os usuários para o seu canal.[/i]

          [b]!scan <personagem>[/b]
          [i]Verifica personagens invisíveis de alguém no Tibia.[/i]
      
          [b]Guildas:[/b]

          [b]!addguildenemy <guilda>[/b]
          [i]Adiciona uma guilda à lista de guildas inimigas.[/i]

          [b]!removeguildenemy <guilda>[/b]
          [i]Remove uma guilda da lista de guildas inimigas.[/i]

          [b]!addguildally <guilda>[/b]
          [i]Adiciona uma guilda à lista de guildas aliadas.[/i]

          [b]!removeguildally <guilda>[/b]
          [i]Remove uma guilda da lista de guildas aliadas.[/i]
      
          [b]Lista de Respawns:[/b]

          [b]!resp <número>[/b]
          [i]Adiciona você a um respawn ou à fila do respawn especificado pelo número.[/i]

          [b]!resp <respawn> <hora>[/b]
          [i]Adiciona você a um respawn com tempo determinado (Exemplo !resp 30 00:15) para caçar 15 minutos).[/i]

          [b]!respdel <número>[/b]
          [i]Remove você do respawn ou da fila do respawn especificado pelo número.[/i]

          [b]!respkick <número>[/b]
          [i]Remove o jogador atual do respawn especificado pelo número.[/i]

          [b]!respinfo <número>[/b]
          [i]Mostra informações detalhadas sobre o respawn especificado pelo número.[/i]

          [b]!respstop[/b]
          [i]Pausa todos os temporizadores de respawn ativos.[/i]

          [b]!resppause <respawn>[/b]
          [i]Pausa apenas o respawn especifico.[/i]

          [b]!respstart[/b]
          [i]Reinicia todos os temporizadores de respawn pausados.[/i]

          [b]!respexclusivo <Respawn> <GroupId>[/b]
          [i]Transforma um respawn exclusivo para o Grupo Especifico.[/i]

          [b]!setrespawntime <groupId> <time>[/b]
          [i]Estabelece o tempo de respawn para um grupo específico.[/i]

          [b]!addextratime <groupId> <time>[/b]
          [i]Adiciona tempo extra de respawn para um grupo específico.[/i]

          [b]!resphistory DD-MM-AAAA[/b]
          [i]Mostra o historico de acordo o Dia Mês e Ano. Ex: 04-04-2024[/i]

          [b]!respblock <Respawn> <GroupId>[/b]
          [i]Bloqueia um grupo a claimar respawn especifico.[/i]

          [b]!respunblock <groupId> <time>[/b]
          [i]Desbloqueia grupo de claimar respawn especifico.[/i]

          [b]!respblocklist[/b]
          [i]Lista de todos respawns bloqueados.[/i]


          [b]Configurações:[/b]

          [b]!setguild <Nome da Guilda>[/b]
          [i]Configura a guilda no TS3.[/i]

          [b]!setworld[/b]
          [i]Configura o mundo no TS3.[/i]

          [b]!tempoafk <número>[/b]
          [i]Modifica o tempo de inatividade (AFK) para ser movido.[/i]

          [b]!tempoafk[/b]
          [i]Mostra o tempo estabelecido para enviar o cliente ao canal de AFK.[/i]

          [b]!addenemy[/b]
          [i]Adiciona um inimigo individualmente.[/i]

          [b]!removeenemy[/b]
          [i]Remove um inimigo individualmente.[/i]

          [b]!viewmaker[/b]
          [i]Mostra todas as regras, e ao utilizar !viewmaker Nome da Regra, mostra essa regra específica.[/i]

          [b]!setmaker "Nome da Regra" LevelMin-LevelMax "Elder Druid, Master Sorcerer" Mundo GroupID[/b]
          [i]Define as regras de makers do servidor, exemplo de comando: !setmaker "Inabra Maker" 49-110 "Elder Druid, Master Sorcerer" Inabra 75[/i]

          [b]!clearmaker Nome da Regra[/b]
          [i]Remove a regra de maker.[/i]

          [b]!check-levels[/b]
          [i]Força o Level dos Jogadores e Rank.[/i]

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

// Função para carregar o nome da guilda do arquivo set_guild.json
async function loadGuild() {
    try {
        const data = await fs.readFile(guildFilePath, 'utf8');
        const guildData = JSON.parse(data);
        return guildData.guild.replace(/ /g, '%20'); // Retorna o nome da guilda com espaços convertidos para %20
    } catch (error) {
        console.error("Erro ao ler o arquivo set_guild.json:", error);
        return "Rushback"; // Retorna Rushback como padrão em caso de erro
    }
}

// Objeto para armazenar os tempos de entrada de cada jogador
const onlineTimes = {};
// Objeto para armazenar o status anterior de cada jogador
const previousStatus = {};

// Função para verificar se o personagem está online no TS3
async function checkPlayerStatus(playerName) {
    const clientDescriptions = await loadClientDescriptions();
    console.log("Verificando status para:", playerName);

    // Verifica diretamente se o playerName existe nas descrições
    if (clientDescriptions[playerName]) {
        const clients = await getAllClients();
        for (const client of clients) {
            const clientInfo = await getFullClientInfo(client.clid);
            if (clientInfo && clientInfo.clientDescription) {
                // A descrição agora é apenas o nome do personagem
                const characterName = clientInfo.clientDescription.trim();
                
                if (characterName === playerName.trim()) {
                    console.log(`${playerName} está online no TS3`);
                    
                    // Se o jogador estava offline antes e agora está online, reinicia o contador
                    if (previousStatus[playerName] === false) {
                        onlineTimes[playerName] = Date.now();
                        console.log(`Reiniciando contador para ${playerName}`);
                    }
                    
                    // Atualiza o status anterior
                    previousStatus[playerName] = true;
                    return true;
                }
            }
        }
    }

    // Se chegou aqui, o jogador está offline
    console.log(`${playerName} não está online no TS3`);
    
    // Atualiza o status anterior
    previousStatus[playerName] = false;
    return false;
}

async function updateClientDescriptions(clients) {
    const existingDescriptions = await loadClientDescriptions(); // Carrega as descrições existentes

    // Atualiza o objeto com novas descrições
    for (const client of clients) {
        const clientInfo = await getFullClientInfo(client.clid);
        if (clientInfo && clientInfo.clientDescription) {
            // A descrição agora é apenas o nome do personagem
            const characterName = clientInfo.clientDescription.trim();
            
            if (characterName) {
                existingDescriptions[characterName] = characterName; // Atualiza ou adiciona ao objeto existente
            }
        }
    }

    // Salva as descrições atualizadas no arquivo JSON, preservando as anteriores
    await saveClientDescriptions(existingDescriptions);
}

// Função para formatar o tempo online no formato "Xh Ym"
function formatTimeOnline(playerName) {
    const timestamp = onlineTimes[playerName];
    if (!timestamp) {
        return 'Desconhecido'; // Se o jogador não tiver tempo registrado, retorna "Desconhecido"
    }

    const now = Date.now();
    const duration = now - timestamp;
    const totalMinutes = Math.floor(duration / (1000 * 60)); // Calcula o tempo total em minutos
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// Função para atualizar as descrições dos jogadores no canal
async function updateChannelDescriptionWithGuildInfo(channelId) {
    // Carrega o nome da guilda do arquivo set_guild.json
    const guildName = await loadGuild();
    const guildUrl = `https://api.tibiadata.com/v4/guild/${guildName}`;
  
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
                "Royal Paladin": [],
                "Exalted Monk": []
            };

            // Adiciona os membros online, calculando o tempo de entrada
            for (const member of onlineMembers) {
                const { name, level, vocation } = member;
  
                // Verifica o status e calcula o tempo online
                let status;
                const isOnlineInTS = await checkPlayerStatus(name);
                
                if (clientDescriptions[name]) {
                    status = isOnlineInTS ? "✅" : "❎"; // ✅ = online no TS, ❎ = apenas no jogo
                } else {
                    status = "⚠️"; // ⚠️ = jogador sem registro
                }

                // Registra o tempo do jogador online se for a primeira vez ou se ele voltou online
                if (!onlineTimes[name] || (isOnlineInTS && previousStatus[name] === false)) {
                    onlineTimes[name] = Date.now(); // Registra o tempo de entrada do jogador
                    console.log(`Iniciando/Reiniciando contador para ${name}`);
                }

                // Adiciona o jogador na categoria correta (por vocação)
                if (vocations[vocation]) {
                    vocations[vocation].push({ name, level, status, onlineTime: formatTimeOnline(name) });
                }
            }
  
            // Gerar a nova descrição do canal com BBCode melhorado
            let channelDescription = "[b][size=12]Status dos Jogadores:[/size][/b]\n";
            channelDescription += "[size=10]✅ Online no jogo e TS | ❎ Online no jogo | ⚠️ Não registrado[/size]\n\n";
  
            // Adiciona cada vocação e seus membros à descrição do canal com BBCode melhorado
            Object.keys(vocations).forEach(vocation => {
                if (vocations[vocation].length > 0) {
                    channelDescription += `[b][size=11][color=#FFD700]${vocation}:[/color][/size][/b]\n`;
                    
                    vocations[vocation].forEach(member => {
                        // Cor diferente para cada status
                        let statusColor;
                        if (member.status === "✅") statusColor = "#00FF00"; // Verde para online no TS
                        else if (member.status === "❎") statusColor = "#FFA500"; // Laranja para online só no jogo
                        else statusColor = "#FF0000"; // Vermelho para não registrado
                        
                        channelDescription += `[b][color=#7cac0e]${member.name}[/color][/b] [size=9](Lvl ${member.level})[/size] [color=${statusColor}]${member.status}[/color] [size=9][i](${member.onlineTime})[/i][/size]\n`;
                    });
                    
                    channelDescription += '\n';
                }
            });
            
            // Adiciona rodapé com última atualização
            const updateTime = new Date().toLocaleTimeString();
            channelDescription += `[size=8][i]Última atualização: ${updateTime}[/i][/size]`;
  
            console.log("Nova descrição do canal gerada");
  
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

// Função para iniciar a atualização a cada 10 segundos
function startAutoUpdate(channelId, intervalMs = 150000) {
  updateChannelDescriptionWithGuildInfo(channelId); // Primeira execução imediata
  setInterval(() => {
      updateChannelDescriptionWithGuildInfo(channelId);
  }, intervalMs);
}

// Exemplo de uso: iniciar a atualização automática do canal
startAutoUpdate(canalGuildAliada);





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
                          "Royal Paladin": [],
                          "Exalted Monk": []
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
  function startEnemyGuildAutoUpdate(channelId, intervalMs = 120000) {
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
            await ts3.sendTextMessage(senderClid, 1, "Você não tem permissões para usar o comando !massmove.");
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
        await ts3.sendTextMessage(senderClid, 1, `Todos os clientes no canal foram expulsos com o motivo: "${kickReason}".`);

    } catch (error) {
        console.error("Erro ao kickar clientes no mesmo canal:", error);
        await ts3.sendTextMessage(senderClid, 1, "Ocorreu um erro ao tentar expulsar os clientes no mesmo canal.");
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
                await ts3.sendTextMessage(senderClid, 1, "Por favor, forneça um motivo para a expulsão após o comando !masskick.");
            }
        } else {
            console.error("Você não tem permissões para usar este comando.");
            await ts3.sendTextMessage(senderClid, 1, "Você não tem permissões para usar o comando !masskick.");
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
            let clientIP = cliente.clientLastIP === '147.79.106.224' 
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

// Função para carregar a lista de jogadores Inimigos do arquivo JSON
async function loadEnemyPlayers() {
    try {
        const data = await fs.readFile(jsonnFilePath, 'utf8');
        const json = JSON.parse(data);
        enemyPlayers = new Set(json.players || []);
        console.log('Jogadores Inimigos carregados:', Array.from(enemyPlayers));
    } catch (error) {
        console.error('Erro ao carregar os jogadores Inimigos:', error);
        enemyPlayers = new Set();
    }
}

// Função para salvar a lista de jogadores Inimigos no arquivo JSON
async function saveEnemyPlayers() {
    try {
        const json = { players: Array.from(enemyPlayers) };
        await fs.writeFile(jsonnFilePath, JSON.stringify(json, null, 2));
        console.log('Jogadores Inimigos salvos.');
    } catch (error) {
        console.error('Erro ao salvar os jogadores Inimigos:', error);
    }
}

// Função para adicionar um jogador à lista de Inimigos
async function addEnemyPlayer(playerName, user) {
    enemyPlayers.add(playerName);
    await saveEnemyPlayers();
    console.log(`Jogador '${playerName}' adicionado à lista de Inimigos.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Jogador '${playerName}' adicionado com sucesso.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateEnemyPlayerChannelDescription(canalHuntedIndividual);
}

// Função para remover um jogador da lista de Inimigos
async function removeEnemyPlayer(playerName, user) {
    enemyPlayers.delete(playerName);
    await saveEnemyPlayers();
    console.log(`Jogador '${playerName}' removido da lista de Inimigos.`);

    // Enviar mensagem de confirmação no chat
    await ts3.sendTextMessage(user.clid, 1, `Jogador '${playerName}' removido com sucesso.`);
    
    // Atualizar a descrição do canal imediatamente
    await updateEnemyPlayerChannelDescription(canalHuntedIndividual);
}

// Atualiza a descrição do canal com base na lista de jogadores Inimigos
async function updateEnemyPlayerChannelDescription(channelId) {
    if (enemyPlayers.size === 0) {
        console.log("Nenhum jogador inimigo configurado.");
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

    let channelDescription = "Jogadores inimigos online:\n\n";
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
        channelDescription += "Nenhum jogador inimigo online no momento.";
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
function startEnemyPlayerAutoUpdate(channelId, intervalMs = 150000) {
    updateEnemyPlayerChannelDescription(channelId); // Primeira execução imediata
    setInterval(() => {
        updateEnemyPlayerChannelDescription(channelId);
    }, intervalMs);
}

// Iniciar a atualização automática do canal de ID 91 a cada 60 segundos
startEnemyPlayerAutoUpdate(canalHuntedIndividual);

// Carregar a lista de jogadores Inimigos quando o bot iniciar
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






//////////////////////////////
// Quando ocorrer um erro
ts3.on("error", (error) => {
    console.error("Erro:", error);
});
