// modules/boss_module.js
const fs = require('fs').promises;
const path = require('path');
const botLogic = require('./bot_logic'); // Importar bot_logic para usar as funções de arquivo

// Caminhos para os arquivos de dados dos bosses
const BOSS_GROUPS_FILE = path.join(__dirname, 'bossGroups.json'); 
const BOSS_SLOTS_FILE = path.join(__dirname, '.bossSlots.json'); 
const BOSS_HISTORY_FILE = path.join(__dirname, 'bossHistory.json');


// Função para gerar IDs únicos
function cryptoId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// Carrega e filtra grupos de boss ativos e arquiva os passados
async function getBossGroups() {
    const groups = await botLogic.loadJsonFile(BOSS_GROUPS_FILE, []);
    const today = new Date();
    const active = [];
    const archived = await botLogic.loadJsonFile(BOSS_HISTORY_FILE, []);
    
    // Filtra histórico para manter apenas os últimos 10 dias (ajuste conforme necessário)
    const keptHistory = archived.filter(g => {
        const eventDate = new Date(g.event_time);
        const diff = (today - eventDate) / (1000 * 60 * 60 * 24); // Diferença em dias
        return diff <= 10; // Mantém grupos que terminaram há menos de 10 dias
    });

    // Move grupos expirados para o histórico
    for (const g of groups) {
        const date = new Date(g.event_time);
        if (date >= today) {
            active.push(g);
        } else {
            // Adiciona ao histórico apenas se ainda não estiver lá (para evitar duplicação em caso de crash)
            if (!keptHistory.some(item => item.id === g.id)) {
                keptHistory.push(g);
            }
        }
    }

    await botLogic.saveJsonFile(BOSS_GROUPS_FILE, active);
    await botLogic.saveJsonFile(BOSS_HISTORY_FILE, keptHistory);

    return active;
}

// Cria um novo grupo de boss
async function createBossGroup({ creator, world, boss_name, event_time, slots }) {
    const groups = await botLogic.loadJsonFile(BOSS_GROUPS_FILE, []);
    const slotsData = await botLogic.loadJsonFile(BOSS_SLOTS_FILE, {});
    
    const id = cryptoId();
    const newGroup = { id, creator, world, boss_name, event_time, created_at: new Date().toISOString() };
    groups.push(newGroup);

    slotsData[id] = [];
    slots.forEach(s => {
        for (let i = 0; i < s.count; i++) {
            slotsData[id].push({ role: s.role, participant: null }); // role vem do frontend, ex: "Blocker"
        }
    });

    await botLogic.saveJsonFile(BOSS_GROUPS_FILE, groups);
    await botLogic.saveJsonFile(BOSS_SLOTS_FILE, slotsData);
    return newGroup;
}

// Entra em uma vaga de boss
async function joinSlot(groupId, character, index) {
    const slotsData = await botLogic.loadJsonFile(BOSS_SLOTS_FILE, {});
    const groupSlots = slotsData[groupId];
    
    if (!groupSlots || groupSlots.length <= index || index < 0) {
        console.warn(`Tentativa de entrar em slot inválido: groupId=${groupId}, index=${index}`);
        return false;
    }
    
    // Remove o personagem de qualquer outra vaga no MESMO grupo antes de adicionar
    let removedFromOtherSlot = false;
    for (const s of groupSlots) {
        if (s.participant && s.participant.name === character.name) {
            s.participant = null;
            removedFromOtherSlot = true;
        }
    }

    if (groupSlots[index].participant) { // Verifica se a vaga ainda está ocupada após a remoção
        console.log(`Vaga ${index} em ${groupId} já ocupada por ${groupSlots[index].participant.name}`);
        return false; // Vaga já ocupada
    }
    
    groupSlots[index].participant = character;

    await botLogic.saveJsonFile(BOSS_SLOTS_FILE, slotsData);
    console.log(`Personagem ${character.name} entrou na vaga ${index} do grupo ${groupId}`);
    return true;
}

// Sai de uma vaga de boss
async function leaveSlot(groupId, character) {
    const slotsData = await botLogic.loadJsonFile(BOSS_SLOTS_FILE, {});
    const groupSlots = slotsData[groupId];
    
    if (!groupSlots) {
        console.warn(`Tentativa de sair de grupo inexistente: groupId=${groupId}`);
        return;
    }
    
    let foundAndRemoved = false;
    for (const s of groupSlots) {
        if (s.participant && s.participant.name === character.name) {
            s.participant = null;
            foundAndRemoved = true;
        }
    }
    if (foundAndRemoved) {
        await botLogic.saveJsonFile(BOSS_SLOTS_FILE, slotsData);
        console.log(`Personagem ${character.name} saiu do grupo ${groupId}`);
    } else {
        console.log(`Personagem ${character.name} não encontrado no grupo ${groupId} para sair.`);
    }
}

// Apaga um grupo de boss (requer permissão de criador ou líder)
async function deleteGroup(groupId, character) {
    let groups = await botLogic.loadJsonFile(BOSS_GROUPS_FILE, []);
    const slotsData = await botLogic.loadJsonFile(BOSS_SLOTS_FILE, {});
    const group = groups.find(g => g.id === groupId);
    
    // Verifica se o usuário é o criador OU um líder
    if (!group || (group.creator !== character.name && !character.isLeader)) {
        console.log(`Permissão negada para apagar grupo ${groupId} por ${character.name}.`);
        return false;
    }

    groups = groups.filter(g => g.id !== groupId); // Remove o grupo da lista
    delete slotsData[groupId]; // Remove os slots associados

    await botLogic.saveJsonFile(BOSS_GROUPS_FILE, groups);
    await botLogic.saveJsonFile(BOSS_SLOTS_FILE, slotsData);
    console.log(`Grupo ${groupId} apagado por ${character.name}.`);
    return true;
}

// Obtém os slots de um grupo específico
async function getSlots(groupId) {
    const slotsData = await botLogic.loadJsonFile(BOSS_SLOTS_FILE, {});
    return slotsData[groupId] || [];
}

module.exports = {
    getBossGroups,
    createBossGroup,
    joinSlot,
    leaveSlot,
    deleteGroup,
    getSlots
};