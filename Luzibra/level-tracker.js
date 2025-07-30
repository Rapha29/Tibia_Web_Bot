const fs = require("fs")
const path = require("path")

// Caminho para o arquivo que armazenará os níveis dos jogadores
const LEVELS_FILE = path.join(__dirname, "player_levels.json")

// Função para carregar os níveis dos jogadores
function loadPlayerLevels() {
  try {
    if (fs.existsSync(LEVELS_FILE)) {
      const data = fs.readFileSync(LEVELS_FILE, "utf8")
      return JSON.parse(data)
    } else {
      // Se o arquivo não existir, criar um objeto vazio
      const emptyLevels = {}
      savePlayerLevels(emptyLevels)
      return emptyLevels
    }
  } catch (error) {
    console.error("Erro ao carregar níveis dos jogadores:", error)
    return {}
  }
}

// Função para salvar os níveis dos jogadores
function savePlayerLevels(levels) {
  try {
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(levels, null, 2), "utf8")
    console.log("Níveis dos jogadores salvos com sucesso")
  } catch (error) {
    console.error("Erro ao salvar níveis dos jogadores:", error)
  }
}

// Função para atualizar o nível de um jogador
function updatePlayerLevel(playerName, level) {
  const levels = loadPlayerLevels()
  levels[playerName] = level
  savePlayerLevels(levels)
  return level
}

// Função para obter o nível de um jogador
function getPlayerLevel(playerName) {
  const levels = loadPlayerLevels()
  return levels[playerName] || null
}

// Função para obter todos os níveis
function getAllPlayerLevels() {
  return loadPlayerLevels()
}

module.exports = {
  loadPlayerLevels,
  savePlayerLevels,
  updatePlayerLevel,
  getPlayerLevel,
  getAllPlayerLevels,
}
