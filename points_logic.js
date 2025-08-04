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
    await fs.writeFile(file, JSON.stringify(data, null, 2));
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
        const monthYear = fullDate.substring(0, 7);
        const day = parseInt(fullDate.substring(8), 10).toString();
        
        let playersSectionStarted = false;
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.startsWith('Balance:')) {
                playersSectionStarted = true;
                continue;
            }

            if (playersSectionStarted && trimmedLine.length > 0 && !line.startsWith('\t')) {
                 const name = trimmedLine.replace(/:$/, '');
                if (name && !['Loot Type'].includes(name)) {
                    names.add(name);
                }
            }
        }

        if (names.size === 0) {
            return { success: false, message: 'Nenhum nome de jogador válido encontrado no log.' };
        }

        const attendance = await readJson(WARZONE_FILE, {});
        if (!attendance[monthYear]) {
            attendance[monthYear] = {};
        }

        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        
        for (const name of names) {
            if (!attendance[monthYear][name]) {
                attendance[monthYear][name] = {};
                for (let i = 1; i <= daysInMonth; i++) {
                    attendance[monthYear][name][i.toString()] = false;
                }
            }
            attendance[monthYear][name][day] = true;
        }

        await writeJson(WARZONE_FILE, attendance);
        return { success: true, message: `${names.size} jogadores marcados na Warzone para o dia ${fullDate}.` };
    },

    async addPoints(category, points, players, reason) {
        const pointsData = await readJson(POINTS_FILE, {});
        for (const playerName of players) {
            const sanitizedName = playerName.trim();
            if (!sanitizedName) continue;

            if (!pointsData[sanitizedName]) {
                pointsData[sanitizedName] = { details: {} };
            }
            if (!pointsData[sanitizedName].details[category]) {
                pointsData[sanitizedName].details[category] = [];
            }
            pointsData[sanitizedName].details[category].push({
                id: generateEntryId(),
                points,
                reason,
                date: new Date().toISOString()
            });
        }
        await writeJson(POINTS_FILE, pointsData);
        return { success: true };
    },

    async addEventPoints(player, participations) {
        return this.addPoints('Eventos', 10 * participations, [player], `Participou ${participations}x`);
    },
    async addHivePoints(player, tasks) {
        const points = Math.floor(tasks / 10);
        return this.addPoints('Hive', points, [player], `${tasks} tasks`);
    },
    async addKSPoints(player, hours) {
        return this.addPoints('KS', 3 * hours, [player], `${hours} horas`);
    },
    async addMountainPiecePoints(players, pieces) {
        const points = pieces * 2;
        return this.addPoints('MountainPiece', points, players, `${pieces} peças`);
    },

    async saveWarzoneChanges(changes) {
        const attendance = await readJson(WARZONE_FILE, {});
        const now = new Date();
        const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
        const now = new Date();
        const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        
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
            1700: 1700000000, 1800: 1800000000, 1900: 1900000000, 2000: 2000000000
        };

        const xpPoints = {};

        for (const acc of Object.values(accounts)) {
            const mainChar = (acc.tibiaCharacters || [])[0];
            if (!mainChar || !monthlyXpData[mainChar.characterName]) continue;

            const name = mainChar.characterName;
            const level = mainChar.level;
            const xp = monthlyXpData[name];
            const levelBracket = Math.ceil(level / 100) * 100;
            const xpGoal = xpGoals[levelBracket] || xpGoals[2000];
            
            let points = 0;
            const perc = (xp / xpGoal) * 100;

            // NOVA REGRA DE XP: Pontos só a partir de 100% da meta
            if (perc >= 100) {
                // 1 ponto por atingir 100%, mais 1 ponto a cada 10% acima.
                const bonusPercentage = perc - 100;
                points = 1 + Math.floor(bonusPercentage / 10);
            }

            // Garante que a pontuação não ultrapasse o limite de 10 pontos.
            points = Math.min(points, 10);

            if (points > 0) {
                const formattedXp = xp.toLocaleString('pt-BR');
                const formattedPerc = perc.toFixed(2);
                xpPoints[name] = {
                    id: 'xp-monthly',
                    points,
                    reason: ` ${formattedXp} de XP este mês (${formattedPerc}% da meta)`,
                    date: new Date().toISOString()
                };
            }
        }
        return xpPoints;
    },

async getPointsData() {
        await this.updateAttendanceForMissedWarzoneDays();
        
        const pointsData = await readJson(POINTS_FILE, {});
        const wzPoints = await this.calculateWarzonePoints();
        const xpPoints = await this.calculateXpPoints();
        const warzoneAttendance = await readJson(WARZONE_FILE, {});
        const accounts = await readJson(ACCOUNTS_FILE, {});
        
        const guildRankMap = new Map();
        for (const account of Object.values(accounts)) {
            if (account.tibiaCharacters) {
                account.tibiaCharacters.forEach(char => {
                    if (char.characterName && char.guildRank) {
                        guildRankMap.set(char.characterName, char.guildRank);
                    }
                });
            }
        }

        const finalData = JSON.parse(JSON.stringify(pointsData));

        for (const p in finalData) {
            if (p === 'warzone') continue;
            if (finalData[p].details['Warzone']) {
                finalData[p].details['Warzone'] = finalData[p].details['Warzone'].filter(e => e.id !== 'warzone-monthly');
            }
        }
        for (const p in wzPoints) {
            if (!finalData[p]) finalData[p] = { details: {} };
            if (!finalData[p].details['Warzone']) finalData[p].details['Warzone'] = [];
            finalData[p].details['Warzone'].push(wzPoints[p]);
        }
        
        for (const p in xpPoints) {
            if (!finalData[p]) finalData[p] = { details: {} };
            finalData[p].details['XP Mensal'] = [xpPoints[p]];
        }
        
        const MAX_POINTS_PER_CATEGORY = {
            'Warzone': 8, 'Eventos': 10, 'MountainPiece': 2, 'KS': 5,
            'Services': 3, 'Hive': 5, 'XP Mensal': 10
        };

        for (const playerName in finalData) {
            if (playerName === 'warzone') continue;

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
            finalData[playerName].guildRank = guildRankMap.get(playerName) || 'N/A';

            if (grandTotal >= 18) {
                finalData[playerName].rank = 'Rising';
            } else if (grandTotal >= 10) {
                finalData[playerName].rank = 'Member';
            } else {
                finalData[playerName].rank = 'Recruta';
            }
        }
        
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
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const histFile = path.join(HISTORY_DIR, `points_${monthStr}.json`);
        
        const current = await this.getPointsData();
        if (Object.keys(current).length === 0) {
            return { success: false, message: 'Nada para arquivar.' };
        }
        await writeJson(histFile, current);
        
        await writeJson(POINTS_FILE, {});
        await writeJson(WARZONE_FILE, {});
        await writeJson(XP_FILE, {});

        return { success: true, message: `Pontos de ${monthStr} arquivados.` };
    },

    async updateXpCsvUrl(newUrl) {
        const config = await readJson(CONFIG_FILE, {});
        config.xpCsvUrl = newUrl;
        await writeJson(CONFIG_FILE, config);
        return { success: true, message: 'URL atualizado.' };
    },

    // (Adicione esta função dentro do objeto 'pointsLogic')

    async updateAttendanceForMissedWarzoneDays() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const currentDay = now.getDate();
        const monthYear = `${year}-${String(month + 1).padStart(2, '0')}`;

        const attendanceData = await readJson(WARZONE_FILE, {});
        const accounts = await readJson(ACCOUNTS_FILE, {});
        const allPlayers = Object.values(accounts).map(acc => acc.tibiaCharacters?.[0]?.characterName).filter(Boolean);

        if (!attendanceData[monthYear]) {
            attendanceData[monthYear] = {};
        }

        const currentMonthAttendance = attendanceData[monthYear];
        
        // Garante que todos os jogadores estejam no registro de presença do mês
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
        // Itera sobre os dias do mês que já passaram
        for (let day = 1; day < currentDay; day++) {
            const dayStr = day.toString();
            // Se o dia não teve Warzone registrada...
            if (!daysWithWarzone.has(dayStr)) {
                // ...marca presença para todos os jogadores.
                allPlayers.forEach(player => {
                    if (currentMonthAttendance[player][dayStr] !== true) {
                        currentMonthAttendance[player][dayStr] = true;
                        changesMade = true;
                    }
                });
            }
        }

        // Se alguma alteração foi feita, salva o arquivo
        if (changesMade) {
            await writeJson(WARZONE_FILE, attendanceData);
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