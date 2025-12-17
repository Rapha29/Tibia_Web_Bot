const fetch = require("node-fetch");
const fs = require('fs').promises;
const path = require('path');

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 10000;
const WAR_DATA_FILE = path.join(__dirname, 'war_data.json');
const RELATIONS_FILE = path.join(__dirname, 'relations.json');
const ENEMY_GUILDS_FILE = path.join(__dirname, 'guild_enemy.json');

// --- Funções Auxiliares (Novas) ---
const log = (message, error = false) => {
    const timestamp = new Date().toISOString();
    (error ? console.error : console.log)(`[${timestamp}] ${message}`);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const loadJsonFile = async (filePath, defaultValue = {}) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            log(`Arquivo não encontrado: ${filePath}. Usando valor padrão.`);
            return defaultValue;
        }
        log(`Erro ao ler ${filePath}: ${error.message}`, true);
        throw error;
    }
};

const saveJsonFile = async (filePath, data) => {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
    } catch (error) {
        log(`Erro ao salvar ${filePath}: ${error.message}`, true);
        throw error;
    }
};

// --- Funções de API (Copiadas do seu bot.txt) ---

/**
 * Faz fetch com retentativas e timeout. -128]
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
          if (response.status === 404) return { status: 404 };
          throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/**
 * Busca as mortes de hoje para um personagem específico. -150]
 * (Nota: A API TibiaData v4 retorna todas as mortes, não apenas as de hoje)
 */
async function fetchCharacterDeaths(characterName, type) {
    try {
        const encodedName = encodeURIComponent(characterName);
        const characterData = await fetchWithRetry(`https://api.tibiadata.com/v4/character/${encodedName}`);

        if (characterData && characterData.status === 404) return [];
        if (!characterData || !characterData.character || !characterData.character.deaths) return [];

        const charInfo = characterData.character.character;
        const deaths = characterData.character.deaths;
        return deaths
            .filter(death => {
                try { new Date(death.time); return true; } catch (e) { return false; }
            })
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
        return [];
    }
}

/**
 * Versão "Lite" do processAndStoreDeath 84]
 * Esta versão NÃO busca a vocação dos killers para acelerar o backfill. 
 */
async function processAndStoreDeath_Lite(deathInfo, warData, alliedPlayerNamesSet) {
    if (!deathInfo || !deathInfo.character || !deathInfo.type || !warData) {
        return;
    }

    const victimName = deathInfo.character;
    const victimVocation = deathInfo.vocation || "Unknown";
    const deathType = deathInfo.type;
    const deathLevel = deathInfo.level || 0;

    try {
        // Inicialização Robusta
        if (!warData.deaths) warData.deaths = { ally: {}, enemy: {}, hunted: {} };
        if (!warData.killsByPlayer) warData.killsByPlayer = { ally: {}, enemy: {} };
        if (!warData.killsByCreature) warData.killsByCreature = {};
        if (!warData.statsByVocation) warData.statsByVocation = {};
        if (!warData.deaths[deathType]) warData.deaths[deathType] = {};
        if (!warData.deaths[deathType][victimName]) {
            warData.deaths[deathType][victimName] = { count: 0, details: [], vocation: victimVocation };
        }
        if (!warData.statsByVocation[victimVocation]) {
            warData.statsByVocation[victimVocation] = { deaths: 0, kills: 0 };
        }

        // 1. Contabiliza a morte da vítima
        warData.deaths[deathType][victimName].count++;
        warData.deaths[deathType][victimName].details.unshift({
            time: deathInfo.time,
            reason: deathInfo.reason,
            killers: deathInfo.killers,
            level: deathLevel
        });
        // (Não vamos limitar a 20 detalhes no backfill)
        warData.deaths[deathType][victimName].vocation = victimVocation;
        warData.statsByVocation[victimVocation].deaths++;

        // 2. Contabiliza os kills (assassinos)
        if (Array.isArray(deathInfo.killers)) {
            for (const killer of deathInfo.killers) {
                const killerName = killer.name;
                if (!killerName || typeof killerName !== 'string') continue;

                if (killer.player) {
                    const isAllyKiller = alliedPlayerNamesSet && alliedPlayerNamesSet.has(killerName.toLowerCase());
                    const killerTypeKey = isAllyKiller ? 'ally' : 'enemy';

                    if (!warData.killsByPlayer[killerTypeKey][killerName]) {
                         warData.killsByPlayer[killerTypeKey][killerName] = { count: 0, details: [] };
                    }
                    warData.killsByPlayer[killerTypeKey][killerName].count++;
                    warData.killsByPlayer[killerTypeKey][killerName].details.unshift({ time: deathInfo.time, victim: victimName });

                    // --- Bloco de busca de vocação do killer REMOVIDO para performance ---
                    // 
                    /*
                    try {
                        const killerInfoData = await fetchWithRetry(`https://api.tibiadata.com/v4/character/${encodeURIComponent(killerName)}`);
                        if (killerInfoData && killerInfoData.status !== 404 && killerInfoData.character && killerInfoData.character.character) {
                            const killerVocation = killerInfoData.character.character.vocation || "Unknown";
                            if (!warData.statsByVocation[killerVocation]) {
                                warData.statsByVocation[killerVocation] = { deaths: 0, kills: 0 };
                            }
                            warData.statsByVocation[killerVocation].kills++;
                        }
                    } catch (fetchError) {}
                    */
                    // --- Fim do bloco removido ---

                } else { // Criatura
                    if (!warData.killsByCreature[killerName]) {
                         warData.killsByCreature[killerName] = { count: 0, details: [] };
                    }
                    warData.killsByCreature[killerName].count++;
                    warData.killsByCreature[killerName].details.unshift({ time: deathInfo.time, victim: victimName });
                }
            }
        }
    } catch (error) {
        log(`Erro GRAVE ao processar morte de ${victimName}: ${error.message}`, true);
    }
}


// --- Função Principal do Downloader ---

async function runDownloader() {
    log("Iniciando downloader do histórico de mortes...");
    let totalNewDeathsProcessed = 0;

    // 1. Carregar configurações
    log("Carregando arquivos de configuração...");
    const relationsData = await loadJsonFile(RELATIONS_FILE, { players_allies: [], players_hunteds: [] }); 
    const enemyGuildData = await loadJsonFile(ENEMY_GUILDS_FILE, { guilds: [] }); 
    
    const alliedPlayers = (relationsData.players_allies || []).map(p => p.name);
    const huntedPlayers = (relationsData.players_hunteds || []).map(p => p.name);
    const enemyGuildNames = (enemyGuildData.guilds || []).filter(g => typeof g === 'string' && g.trim() !== "");
    
    const alliedPlayerNamesSet = new Set(alliedPlayers.map(p => p.toLowerCase())); 

    // 2. Carregar (ou criar) war_data.json
    log("Carregando war_data.json existente (ou criando um novo)...");
    const warData = await loadJsonFile(WAR_DATA_FILE, {
        lastChecked: null,
        deaths: { ally: {}, enemy: {}, hunted: {} },
        killsByPlayer: { ally: {}, enemy: {} },
        killsByCreature: {},
        statsByVocation: {}
    }); 

    // 3. Criar índice de mortes existentes para evitar duplicatas 31]
    const existingDeathKeys = new Set();
    for (const type of ['ally', 'enemy', 'hunted']) {
        const deaths = warData.deaths[type];
        if (deaths) {
            for (const charName in deaths) {
                deaths[charName].details.forEach(detail => {
                    existingDeathKeys.add(`${charName}-${detail.time}`);
                });
            }
        }
    }
    log(`Encontradas ${existingDeathKeys.size} mortes já registradas.`);

    // 4. Buscar membros das guildas inimigas
    log(`Buscando membros de ${enemyGuildNames.length} guildas inimigas...`);
    const enemyPlayerSet = new Set();
    for (const guildName of enemyGuildNames) {
        log(`Buscando guilda: ${guildName}`);
        try {
            const data = await fetchWithRetry(`https://api.tibiadata.com/v4/guild/${encodeURIComponent(guildName)}`); 
            if (data && data.guild && data.guild.members) {
                data.guild.members.forEach(member => enemyPlayerSet.add(member.name)); 
            } else {
                log(`Guilda ${guildName} não encontrada ou sem membros.`);
            }
        } catch (e) {
            log(`Falha ao buscar guilda ${guildName}: ${e.message}`, true);
        }
        await sleep(500); // Pausa entre guildas
    }
    log(`Total de ${enemyPlayerSet.size} membros inimigos únicos encontrados.`);

    // 5. Criar lista de tarefas
    const tasks = [];
    alliedPlayers.forEach(name => tasks.push({ name, type: 'ally' }));
    huntedPlayers.forEach(name => tasks.push({ name, type: 'hunted' }));
    Array.from(enemyPlayerSet).forEach(name => tasks.push({ name, type: 'enemy' }));
    
    log(`Iniciando busca de histórico de mortes para ${tasks.length} jogadores... (Isso pode demorar MUITO)`);

    // 6. Processar tarefas
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        log(`(${i + 1}/${tasks.length}) Buscando ${task.type}: ${task.name}`);
        
        try {
            const deaths = await fetchCharacterDeaths(task.name, task.type); 
            if (deaths.length === 0) {
                log(`... Nenhuma morte encontrada para ${task.name}.`);
                await sleep(500); // Pausa de 0.5s
                continue;
            }

            let newDeathsForPlayer = 0;
            for (const death of deaths) {
                const deathKey = `${death.character}-${death.time}`;
                if (!existingDeathKeys.has(deathKey)) {
                    // Usando a versão Lite para processar 
                    await processAndStoreDeath_Lite(death, warData, alliedPlayerNamesSet);
                    existingDeathKeys.add(deathKey);
                    newDeathsForPlayer++;
                    totalNewDeathsProcessed++;
                }
            }
            log(`... Processadas ${deaths.length} mortes. ${newDeathsForPlayer} novas adicionadas.`);
            
            await sleep(500); // Pausa de 0.5s entre cada jogador

        } catch (e) {
            log(`Falha ao processar ${task.name}: ${e.message}`, true);
            await sleep(2000); // Pausa maior em caso de erro
        }
    }

    // 7. Salvar resultados
    log("Processamento concluído.");
    warData.lastChecked = new Date().toISOString(); 
    await saveJsonFile(WAR_DATA_FILE, warData);
    
    log(`--- DOWNLOAD CONCLUÍDO ---`);
    log(`Total de ${totalNewDeathsProcessed} novas mortes adicionadas.`);
    log(`Arquivo ${WAR_DATA_FILE} foi atualizado com sucesso.`);
}

// --- Iniciar o script ---
runDownloader().catch(e => {
    log(`Erro fatal no downloader: ${e.message}`, true);
    console.error(e);
});