const fs = require("fs")
const path = require("path")

// Caminho para o arquivo que armazenará as preferências dos usuários
const PREFERENCES_FILE = path.join(__dirname, "death_alert_preferences.json")

// Função para carregar as preferências dos usuários
function loadAlertPreferences() {
  try {
    if (fs.existsSync(PREFERENCES_FILE)) {
      const data = fs.readFileSync(PREFERENCES_FILE, "utf8")
      const preferences = JSON.parse(data)

      // Garantir que a estrutura tenha todos os campos necessários
      if (!preferences.disabledUsers) {
        preferences.disabledUsers = []
      }

      // Adicionar campo para usuários com alertas de nível desativados
      if (!preferences.disabledLevelAlerts) {
        preferences.disabledLevelAlerts = []
      }

      return preferences
    } else {
      // Se o arquivo não existir, criar um objeto com todos os campos
      const emptyPreferences = {
        disabledUsers: [],
        disabledLevelAlerts: [],
      }
      saveAlertPreferences(emptyPreferences)
      return emptyPreferences
    }
  } catch (error) {
    console.error("Erro ao carregar preferências de alertas:", error)
    return {
      disabledUsers: [],
      disabledLevelAlerts: [],
    }
  }
}

// Função para salvar as preferências dos usuários
function saveAlertPreferences(preferences) {
  try {
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2), "utf8")
    console.log("Preferências de alertas salvas com sucesso")
  } catch (error) {
    console.error("Erro ao salvar preferências de alertas:", error)
  }
}

// Função para desativar alertas para um usuário
function disableAlertsForUser(uniqueId) {
  const preferences = loadAlertPreferences()

  // Verificar se o usuário já está na lista
  if (!preferences.disabledUsers.includes(uniqueId)) {
    preferences.disabledUsers.push(uniqueId)
    saveAlertPreferences(preferences)
    console.log(`Alertas desativados para o usuário ${uniqueId}`)
    return true
  }

  return false // Usuário já estava com alertas desativados
}

// Função para ativar alertas para um usuário
function enableAlertsForUser(uniqueId) {
  const preferences = loadAlertPreferences()

  // Verificar se o usuário está na lista
  const index = preferences.disabledUsers.indexOf(uniqueId)
  if (index !== -1) {
    preferences.disabledUsers.splice(index, 1)
    saveAlertPreferences(preferences)
    console.log(`Alertas ativados para o usuário ${uniqueId}`)
    return true
  }

  return false // Usuário já estava com alertas ativados
}

// Função para verificar se um usuário deve receber alertas
function shouldReceiveAlerts(uniqueId) {
  const preferences = loadAlertPreferences()
  return !preferences.disabledUsers.includes(uniqueId)
}

// Adicionar funções para gerenciar alertas de nível
function disableLevelAlertsForUser(uniqueId) {
  const preferences = loadAlertPreferences()

  // Verificar se o usuário já está na lista
  if (!preferences.disabledLevelAlerts.includes(uniqueId)) {
    preferences.disabledLevelAlerts.push(uniqueId)
    saveAlertPreferences(preferences)
    console.log(`Alertas de nível desativados para o usuário ${uniqueId}`)
    return true
  }

  return false // Usuário já estava com alertas desativados
}

function enableLevelAlertsForUser(uniqueId) {
  const preferences = loadAlertPreferences()

  // Verificar se o usuário está na lista
  const index = preferences.disabledLevelAlerts.indexOf(uniqueId)
  if (index !== -1) {
    preferences.disabledLevelAlerts.splice(index, 1)
    saveAlertPreferences(preferences)
    console.log(`Alertas de nível ativados para o usuário ${uniqueId}`)
    return true
  }

  return false // Usuário já estava com alertas ativados
}

function shouldReceiveLevelAlerts(uniqueId) {
  const preferences = loadAlertPreferences()
  return !preferences.disabledLevelAlerts.includes(uniqueId)
}

// Atualizar o módulo exports para incluir as novas funções
module.exports = {
  loadAlertPreferences,
  disableAlertsForUser,
  enableAlertsForUser,
  shouldReceiveAlerts,
  disableLevelAlertsForUser,
  enableLevelAlertsForUser,
  shouldReceiveLevelAlerts,
}
