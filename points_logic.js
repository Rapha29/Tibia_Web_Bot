// points_logic.js
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const POINTS_FILE = path.join(__dirname, 'points_current.json');
const WARZONE_FILE = path.join(__dirname, 'warzone_attendance.json');
const XP_FILE = path.join(__dirname, 'xp_monthly.json');
const ACCOUNTS_FILE = path.join(__dirname, 'clientaccount.json');
const CONFIG_FILE = path.join(__dirname, 'points_config.json');
const HISTORY_DIR = path.join(__dirname, 'points_history');

async function readJson(file, defaultValue = {}) {
    try {
        await fs.access(HISTORY_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(HISTORY_DIR);
        }
    }
    
    try {
        const fileContent = await fs.readFile(file, 'utf8');
        if (fileContent.trim() === '') {
            return defaultValue;
        }
        return JSON.parse(fileContent);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return defaultValue;
        }
        console.error(`Erro ao ler ${path.basename(file)}:`, error);
        return defaultValue;
    }
}

async function writeJson(file, data) {
    try {
        await fs.writeFile(file, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`[CRÍTICO] Falha ao escrever no arquivo JSON: ${file}`, error);
    }
}
function generateEntryId() {
    return Math.random().toString(36).substr(2, 9);
}

function parseCsvLine(line, delimiter) {
    const result = [];
    let current = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === delimiter && !insideQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    
    return result.map(v => v.trim());
}

const pointsLogic = {

    async addWarzoneAttendance(logText) {
    const names = new Set();
    const lines = logText.split('\n');
    
    const sessionDateMatch = lines[0].match(/Session data: From (\d{4}-\d{2}-\d{2})/);
    if (!sessionDateMatch) {
        return { success: false, message: 'Data da sessão não encontrada no log.' };
    }
    const fullDate = sessionDateMatch[1];
    const logMonthYear = fullDate.substring(0, 7); // Mês do log
    const day = parseInt(fullDate.substring(8), 10).toString();
    
    let playersSectionStarted = false;
    for (const line of lines) {
        const trimmedLine = line.trim();
         
        if (trimmedLine.startsWith('Balance:')) {
            playersSectionStarted = true;
            continue;
        }

        if (playersSectionStarted && trimmedLine.length > 0 && !line.startsWith('\t')) {
              const name = trimmedLine.replace(/:$/, '').replace(/\s*\(Leader\)\s*$/i, '').trim();
            if (name && !['Loot Type'].includes(name)) {
                names.add(name);
            }
        }
    }

    if (names.size === 0) {
        return { success: false, message: 'Nenhum nome de jogador válido encontrado no log.' };
    }

    const accounts = await readJson(ACCOUNTS_FILE, {});
    const charToMainMap = {};
    for (const account of Object.values(accounts)) {
        if (account.tibiaCharacters && account.tibiaCharacters.length > 0) {
            const mainCharName = account.tibiaCharacters[0].characterName;
            for (const char of account.tibiaCharacters) {
                if (char.characterName) {
                    charToMainMap[char.characterName.toLowerCase()] = mainCharName;
                }
            }
        }
    }

    const attendance = await readJson(WARZONE_FILE, {});
    const fileMonthYear = Object.keys(attendance)[0];
    const monthYear = fileMonthYear || logMonthYear; 

    if (fileMonthYear && fileMonthYear !== logMonthYear) {
        return { success: false, message: `❌ Erro: O log é de (${logMonthYear}), mas o ranking ativo é de (${fileMonthYear}). Rode o comando !novomes primeiro.` };
    }

    if (!attendance[monthYear]) {
        attendance[monthYear] = {};
    }

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    const creditedNames = new Set();

    for (const name of names) {
        const targetName = charToMainMap[name.toLowerCase()] || name;
        creditedNames.add(targetName);

        if (!attendance[monthYear][targetName]) {
            attendance[monthYear][targetName] = {};
            for (let i = 1; i <= daysInMonth; i++) {
                attendance[monthYear][targetName][i.toString()] = false;
            }
        }
        attendance[monthYear][targetName][day] = true;
    }

    await writeJson(WARZONE_FILE, attendance);
    return { success: true, message: `${creditedNames.size} jogadores (incluindo principais de makers) marcados na Warzone para o dia ${fullDate}.` };
},

async addPoints(category, points, players, reason) {
    const pointsData = await readJson(POINTS_FILE, {});
    const accounts = await readJson(ACCOUNTS_FILE, {});

    // Cria um mapa para busca rápida: {nomeDoPersonagem: nomeDoPrincipal}
    const charToMainMap = {};
    for (const account of Object.values(accounts)) {
        if (account.tibiaCharacters && account.tibiaCharacters.length > 0) {
            const mainCharName = account.tibiaCharacters[0].characterName;
            for (const char of account.tibiaCharacters) {
                if (char.characterName) {
                    charToMainMap[char.characterName.toLowerCase()] = mainCharName;
                }
            }
        }
    }

    for (const playerName of players) {
        const sanitizedName = playerName.trim();
        if (!sanitizedName) continue;

        // Identifica o nome do personagem principal associado, ou usa o próprio nome se não for encontrado
        const targetName = charToMainMap[sanitizedName.toLowerCase()] || sanitizedName;

        if (!pointsData[targetName]) {
            pointsData[targetName] = { details: {} };
        }
        if (!pointsData[targetName].details[category]) {
            pointsData[targetName].details[category] = [];
        }
        pointsData[targetName].details[category].push({
            id: generateEntryId(),
            points,
            reason,
            date: new Date().toISOString()
        });
    }
    await writeJson(POINTS_FILE, pointsData);
    return { success: true };
},

    async addEventPoints(players, participations) {
        return this.addPoints('Eventos', 10 * participations, players, `Participou ${participations}x`);
    },
    async addHivePoints(players, tasks) {
        const points = Math.floor(tasks / 10);
        return this.addPoints('Hive', points, players, `${tasks} tasks`);
    },
    async addKSPoints(players, hours) {
        return this.addPoints('KS', 3 * hours, players, `${hours} horas`);
    },
    async addMountainPiecePoints(players, pieces) {
        const points = pieces * 2;
        return this.addPoints('MountainPiece', points, players, `${pieces} peças`);
    },

    async saveWarzoneChanges(changes) {
        const attendance = await readJson(WARZONE_FILE, {});
        const now = new Date();
        const monthYear = Object.keys(attendance)[0] || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        if (!attendance[monthYear]) {
            attendance[monthYear] = {};
        }
        
        for (const playerName in changes) {
            if (!attendance[monthYear][playerName]) {
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                attendance[monthYear][playerName] = {};
                for (let i = 1; i <= daysInMonth; i++) {
                    attendance[monthYear][playerName][i.toString()] = false;
                }
            }
            for (const day in changes[playerName]) {
                attendance[monthYear][playerName][day] = changes[playerName][day];
            }
        }
        await writeJson(WARZONE_FILE, attendance);
        return { success: true, message: 'Alterações da Warzone salvas com sucesso.' };
    },

    async calculateWarzonePoints() {
        const attendance = await readJson(WARZONE_FILE, {});
        const playerAttendance = {};
        const monthYear = Object.keys(attendance)[0]; 
        if (!monthYear) {
            return {}; 
        }

        const [year, month] = monthYear.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        
        const currentMonthAttendance = attendance[monthYear] || {};
        for (const playerName in currentMonthAttendance) {
            let presenceCount = 0;
            for (const day in currentMonthAttendance[playerName]) {
                if (currentMonthAttendance[playerName][day]) {
                    presenceCount++;
                }
            }
            if (presenceCount > 0) {
                playerAttendance[playerName] = presenceCount;
            }
        }
        
        const warzonePoints = {};
        for (const playerName in playerAttendance) {
            const presenceCount = playerAttendance[playerName];
            const percentage = (presenceCount / daysInMonth) * 100;
            let points = 0;
            if (percentage > 70) {
                points = 8;
            } else if (percentage > 40) {
                points = 5;
            } else if (percentage > 20) {
                points = 2;
            }

            if (points > 0) {
                warzonePoints[playerName] = {
                    id: 'warzone-monthly',
                    points: points,
                    reason: `${presenceCount} de ${daysInMonth} presenças (${percentage.toFixed(1)}%)`,
                    date: new Date().toISOString()
                };
            }
        }
        return warzonePoints;
    },

async calculateXpPoints() {
    const xpDataFile = await readJson(XP_FILE, {});
    const monthlyXpData = xpDataFile.data || {};
    const accounts = await readJson(ACCOUNTS_FILE, {});

    const xpGoals = {
    100: 100000000, 200: 200000000, 300: 300000000, 400: 400000000,
    500: 500000000, 600: 600000000, 700: 700000000, 800: 800000000,
    900: 900000000, 1000: 1000000000, 1100: 1100000000, 1200: 1200000000,
    1300: 1300000000, 1400: 1400000000, 1500: 1500000000, 1600: 1600000000,
    1700: 1700000000, 1800: 1800000000, 1900: 1900000000, 2000: 2000000000,
    2100: 2100000000, 2200: 2200000000, 2300: 2300000000, 2400: 2400000000,
    2500: 2500000000, 2600: 2600000000, 2700: 2700000000, 2800: 2800000000,
    2900: 2900000000, 3000: 3000000000
};

// Também ajuste a constante MAX_GOAL_BRACKET se ela existir em outro lugar do código
const MAX_GOAL_BRACKET = 3000;

    const xpPoints = {};

    for (const acc of Object.values(accounts)) {
        const mainChar = (acc.tibiaCharacters || [])[0];
        if (!mainChar || !monthlyXpData[mainChar.characterName] || !mainChar.level) continue; 

        const name = mainChar.characterName;
        const level = mainChar.level;
        const xp = monthlyXpData[name];
        let levelBracket = Math.floor(level / 100) * 100;

        if (levelBracket < 100) {
            levelBracket = 100;
        }
        if (levelBracket > MAX_GOAL_BRACKET) {
            levelBracket = MAX_GOAL_BRACKET;
        }

        const xpGoal = xpGoals[levelBracket];

        if (!xpGoal) { 
             console.warn(`[XP Points] Meta não encontrada para level ${level}, bracket ${levelBracket}. Pulando ${name}.`);
             continue;
        }

        let points = 0;
        const perc = (xp / xpGoal) * 100;

        if (perc >= 100) {
            const bonusPercentage = perc - 100;
            points = 1 + Math.floor(bonusPercentage / 10);
        }
        points = Math.min(points, 10); 

        const formattedXp = xp.toLocaleString('pt-BR');
        const formattedGoal = xpGoal.toLocaleString('pt-BR');
        const formattedPerc = perc.toFixed(2);
        xpPoints[name] = {
            id: 'xp-monthly',
            points: points,
            reason: `XP: ${formattedXp} (${formattedPerc}% da meta de ${formattedGoal} para Lvl ${levelBracket}+)`,
            date: new Date().toISOString()
        };
    }
    return xpPoints;
},

async getPointsData() {
        const pointsData = await readJson(POINTS_FILE, {});
        const wzPoints = await this.calculateWarzonePoints();
        const xpPoints = await this.calculateXpPoints();
        const warzoneAttendance = await readJson(WARZONE_FILE, {});
        const accounts = await readJson(ACCOUNTS_FILE, {});

        const finalData = {};
        // 2. Constrói a lista principal APENAS com personagens principais
        for (const account of Object.values(accounts)) {
            const mainChar = account.tibiaCharacters?.[0];
            if (mainChar && mainChar.characterName) {
                const playerName = mainChar.characterName;
                finalData[playerName] = {
                    details: {},
                    total: 0,
                    rank: 'Recruta',
                    guildRank: mainChar.guildRank ||
    'N/A',
                    categoryTotals: {}
                };
            }
        }

        // 3. Mescla os dados de pontos existentes na lista principal
        for (const playerName in pointsData) {
            if (finalData[playerName] && pointsData[playerName].details) {
                finalData[playerName].details = pointsData[playerName].details;
            }
        }

        // 4. Mescla os dados de Warzone e XP na lista principal
        for (const p in wzPoints) {
            if (finalData[p]) {
                if (!finalData[p].details['Warzone']) finalData[p].details['Warzone'] = [];
                finalData[p].details['Warzone'].push(wzPoints[p]);
            }
        }
        for (const p in xpPoints) {
            if (finalData[p]) {
                if (!finalData[p].details['XP Mensal']) finalData[p].details['XP Mensal'] = [];
                finalData[p].details['XP Mensal'].push(xpPoints[p]);
            }
        }
        
        // 5. Define os limites e recalcula os totais para TODOS os jogadores
        const MAX_POINTS_PER_CATEGORY = {
            'Warzone': 8, 'Eventos': 10, 'MountainPiece': 2, 'KS': 5,
            'Services': 3, 'Hive': 5, 'XP Mensal': 10
        };
        for (const playerName in finalData) {
            let grandTotal = 0;
            finalData[playerName].categoryTotals = {};
            for (const categoryName in MAX_POINTS_PER_CATEGORY) {
                let categoryRawTotal = 0;
                if (finalData[playerName].details[categoryName]) {
                    categoryRawTotal = finalData[playerName].details[categoryName].reduce((sum, entry) => sum + (Number(entry.points) || 0), 0);
                }
                
                const cappedTotal = Math.min(categoryRawTotal, MAX_POINTS_PER_CATEGORY[categoryName]);
                finalData[playerName].categoryTotals[categoryName] = cappedTotal;
                grandTotal += cappedTotal;
            }
            
            finalData[playerName].total = grandTotal;
            if (grandTotal >= 18) {
                finalData[playerName].rank = 'Rising';
            } else if (grandTotal >= 10) {
                finalData[playerName].rank = 'Member';
            } else {
                finalData[playerName].rank = 'Recruta';
            }
        }
        
        // --- INÍCIO DA MODIFICAÇÃO ---
        // Carrega os dados brutos de XP para o ranking
        const xpDataFile = await readJson(XP_FILE, {});
        const monthlyXpData = xpDataFile.data || {};

        // Cria o ranking de XP bruta
        const rawXpRanking = Object.entries(monthlyXpData)
            .map(([name, xp]) => ({ name, xp })) // Converte {Nome: 123} para [{name: "Nome", xp: 123}]
            .sort((a, b) => b.xp - a.xp) // Ordena por XP (maior primeiro)
            .slice(0, 50); // Pega os top 50

        // Adiciona o novo ranking ao objeto final
        finalData.xpRanking = rawXpRanking;
        // --- FIM DA MODIFICAÇÃO ---
        
        finalData.warzone = warzoneAttendance;
        return finalData;
    },

    async editPointEntry(player, category, entryId, newData) {
        const pointsData = await readJson(POINTS_FILE, {});
        if (!pointsData[player] || !pointsData[player].details[category]) {
            return { success: false, message: 'Jogador ou categoria não encontrada.' };
        }
        const idx = pointsData[player].details[category].findIndex(e => e.id === entryId);
        if (idx === -1) {
            return { success: false, message: 'Registo de ponto não encontrado.' };
        }
        pointsData[player].details[category][idx].points = parseInt(newData.points, 10);
        pointsData[player].details[category][idx].reason = newData.reason;
        await writeJson(POINTS_FILE, pointsData);
        return { success: true, message: 'Registo atualizado.' };
    },

    async removePointEntry(player, category, entryId) {
        const pointsData = await readJson(POINTS_FILE, {});
        if (!pointsData[player] || !pointsData[player].details[category]) {
            return { success: false, message: 'Jogador ou categoria não encontrada.' };
        }
        const lenBefore = pointsData[player].details[category].length;
        pointsData[player].details[category] = pointsData[player].details[category].filter(e => e.id !== entryId);
        if (pointsData[player].details[category].length < lenBefore) {
            await writeJson(POINTS_FILE, pointsData);
            return { success: true, message: 'Registo removido.' };
        }
        return { success: false, message: 'Não foi possível remover o registo.' };
    },

    async archiveCurrentMonth() {
        const now = new Date();
        const previousMonthDate = new Date(now.getFullYear(), now.getMonth(), 0);
        const monthStr = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
        
        const histFile = path.join(HISTORY_DIR, `points_${monthStr}.json`);
        const warzoneHistFile = path.join(HISTORY_DIR, `warzone_${monthStr}.json`);

        // Verifica se o arquivo de histórico principal já existe
        try {
            await fs.access(histFile);
            // Se fs.access não der erro, o arquivo existe.
            return { success: false, message: `❌ Arquivamento para ${monthStr} já existe. Nenhuma ação realizada.` };
        } catch (error) {
            // Se o erro for 'ENOENT', o arquivo não existe, então podemos continuar.
            if (error.code !== 'ENOENT') {
                // Se for outro erro (ex: permissão), retorna erro.
                console.error(`Erro ao verificar arquivo de histórico ${histFile}:`, error);
                return { success: false, message: `❌ Erro ao verificar arquivo de histórico para ${monthStr}.` };
            }
            // Arquivo não existe, prosseguir com o arquivamento...
        }
        
        // 1. Arquivar pontos principais (do mês anterior)
        const current = await this.getPointsData();
        const dataKeys = Object.keys(current).filter(k => k !== 'warzone');
        if (dataKeys.length === 0) {
            return { success: false, message: 'Nada para arquivar.' };
        }
        await writeJson(histFile, current);

        // 2. Arquivar dados brutos da Warzone (do mês anterior)
        const currentWarzoneData = await readJson(WARZONE_FILE, {});
        await writeJson(warzoneHistFile, currentWarzoneData);

        // 3. Limpar arquivos atuais para iniciar o novo mês (SÓ SE O ARQUIVAMENTO FOI FEITO)
        await writeJson(POINTS_FILE, {});
        await writeJson(WARZONE_FILE, {});
        await writeJson(XP_FILE, {});

        return { success: true, message: `✅ Pontos e Warzone de ${monthStr} arquivados. Novo mês iniciado.` };
    },

    async markWarzoneAbsence(playerNames) {
        if (!playerNames || playerNames.length === 0) {
            return { success: false, message: 'Nenhum jogador fornecido.' };
        }

    const attendance = await readJson(WARZONE_FILE, {});
        const now = new Date();
        const monthYear = Object.keys(attendance)[0] || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const day = now.getDate().toString();
        
        if (!attendance[monthYear]) {
            attendance[monthYear] = {};
        }

        for (const name of playerNames) {
            const sanitizedName = name.trim();
            if (!sanitizedName) continue;

            if (!attendance[monthYear][sanitizedName]) {
                const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                attendance[monthYear][sanitizedName] = {};
                for (let i = 1; i <= daysInMonth; i++) {
                    attendance[monthYear][sanitizedName][i.toString()] = false;
                }
            }
            attendance[monthYear][sanitizedName][day] = false; // Define a presença como falta
        }

        await writeJson(WARZONE_FILE, attendance);
        return { success: true, message: `Falta na Warzone registrada para ${playerNames.length} jogador(es).` };
    },

    async updateXpCsvUrl(newUrl) {
        const config = await readJson(CONFIG_FILE, {});
        config.xpCsvUrl = newUrl;
        await writeJson(CONFIG_FILE, config);
        return { success: true, message: 'URL atualizado.' };
    },


async updateAttendanceForMissedWarzoneDays() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        
        const currentHour = now.getHours();
        let effectiveCurrentDay = now.getDate();

        if (currentHour < 4) {
            effectiveCurrentDay = effectiveCurrentDay - 1;
        }

        const attendanceData = await readJson(WARZONE_FILE, {});
        const monthYear = Object.keys(attendanceData)[0] || `${year}-${String(month + 1).padStart(2, '0')}`;
        
        const accounts = await readJson(ACCOUNTS_FILE, {});
        const allPlayers = Object.values(accounts).map(acc => acc.tibiaCharacters?.[0]?.characterName).filter(Boolean);

        if (!attendanceData[monthYear]) {
            attendanceData[monthYear] = {};
        }

        const currentMonthAttendance = attendanceData[monthYear];
        allPlayers.forEach(player => {
            if (!currentMonthAttendance[player]) {
                currentMonthAttendance[player] = {};
            }
        });

        const daysWithWarzone = new Set();
        for (const playerName in currentMonthAttendance) {
            for (const day in currentMonthAttendance[playerName]) {
                if (currentMonthAttendance[playerName][day] === true) {
                    daysWithWarzone.add(day);
                }
            }
        }

        let changesMade = false;
        for (let day = 1; day < effectiveCurrentDay; day++) {
            const dayStr = day.toString();
            
            // Verifica se NÃO houve Warzone neste dia.
            if (!daysWithWarzone.has(dayStr)) { 
                allPlayers.forEach(player => {
                    // Verifica se o jogador NÃO tem nenhum registro para este dia (nem true, nem false).
                    if (currentMonthAttendance[player][dayStr] === undefined) { 
                        // --- ALTERAÇÃO APLICADA AQUI ---
                        currentMonthAttendance[player][dayStr] = true; // Marca como PRESENTE
                        // --- FIM DA ALTERAÇÃO ---
                        changesMade = true;
                    }
                });
            }
        }

        if (changesMade) {
            await writeJson(WARZONE_FILE, attendanceData);
            // Mensagem de sucesso atualizada para refletir a nova lógica.
            return { success: true, message: "✅ Presenças automáticas da Warzone (dias sem WZ) foram preenchidas como presença." };
        } else {
            return { success: true, message: "✅ Verificação da Warzone concluída. Nenhuma atualização automática necessária." };
        }
    
    } catch (error) {
        console.error('[POINTS LOGIC - Warzone] Erro ao atualizar presenças:', error);
        return { success: false, message: "❌ Ocorreu um erro interno ao processar as presenças da Warzone." };
    }
},

    async getAvailableHistory() {
        try {
            const files = await fs.readdir(HISTORY_DIR);
            const months = files
                .filter(file => file.startsWith('points_') && file.endsWith('.json'))
                .map(file => file.substring(7, 14)) // Extrai o 'AAAA-MM'
                .sort((a, b) => b.localeCompare(a)); // Ordena do mais recente para o mais antigo
            return months;
        } catch (error) {
            console.error("Erro ao ler diretório de histórico:", error);
            return [];
        }
    },

    async getHistoryData(monthStr) {
        // Validação simples para segurança
        if (!/^\d{4}-\d{2}$/.test(monthStr)) {
            return { success: false, message: 'Formato de mês inválido.' };
        }
        const histFile = path.join(HISTORY_DIR, `points_${monthStr}.json`);
        try {
            const historyData = await readJson(histFile, null);
            if (historyData) {
                return { success: true, data: historyData };
            }
            return { success: false, message: 'Histórico não encontrado para o mês selecionado.' };
        } catch (error) {
            console.error(`Erro ao ler arquivo de histórico ${histFile}:`, error);
            return { success: false, message: 'Erro ao ler arquivo de histórico.' };
        }
    },

    async fetchAndProcessXP() {
        const config = await readJson(CONFIG_FILE, {});
        const url = config.xpCsvUrl;
        if (!url) {
            console.error("[XP SYNC] URL do CSV de XP não configurada.");
            return;
        }
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error("[XP SYNC] Erro ao buscar CSV de XP:", response.statusText);
                return;
            }
            const csvText = await response.text();
            const lines = csvText.trim().split(/\r?\n/);
            const xpData = {};

            const delimiter = lines[0].includes('\t') ? '\t' : ',';
            for (let i = 1; i < lines.length; i++) {
                const columns = parseCsvLine(lines[i], delimiter);
                if (columns.length >= 8) {
                    const playerName = columns[4]?.replace(/^"|"$/g, '');
                    let monthlyXpStr = columns[7]?.replace(/^"|"$/g, '');

                    monthlyXpStr = monthlyXpStr.replace(/\./g, '');
                    monthlyXpStr = monthlyXpStr.replace(/,/g, '.');

                    const monthlyXp = parseInt(monthlyXpStr, 10);
                    if (playerName && !isNaN(monthlyXp)) {
                        xpData[playerName] = monthlyXp;
                    }
                }
            }

            await writeJson(XP_FILE, { date: new Date().toISOString(), data: xpData });
            console.log(`[XP SYNC] XP mensal sincronizado para ${Object.keys(xpData).length} jogadores.`);
        
        } catch (error) {
            console.error('[XP SYNC] Falha ao sincronizar XP:', error);
        }
        
    }

    
    
};


module.exports = pointsLogic;

