const { TeamSpeak } = require("ts3-nodejs-library")
const fetch = require("node-fetch")
const fs = require("fs")
require("dotenv").config()

// Importar a função para verificar as preferências de alertas
const { shouldReceiveAlerts } = require("./alert-preferences")

const config = {
  host: "69.62.98.88",
  queryport: 10101,
  serverport: 9991,
  username: "serveradmin",
  password: "yJW5xsLCwRAz",
  nickname: "JowBot.Deaths",
}

const canalDeaths = 8
const MAX_RETRIES = 3
const REQUEST_TIMEOUT = 10000 // 10 segundos

let isChecking = false // Flag para controlar se uma verificação já está em andamento

function readJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8")
    return JSON.parse(data)
  } catch (error) {
    console.error(`Erro ao ler o arquivo ${filePath}:`, error)
    return null
  }
}

const setGuild = readJsonFile("./set_guild.json")
const guildAliada = setGuild && setGuild.guild ? setGuild.guild.replace(/ /g, "%20") : "New Corporation"

const guildEnemyData = readJsonFile("./guild_enemy.json")
const guildEnemies =
  guildEnemyData && guildEnemyData.guilds
    ? guildEnemyData.guilds.filter((guild) => guild.trim() !== "").map((guild) => guild.replace(/ /g, "%20"))
    : [""]

console.log(`Guild Aliada: ${guildAliada}`)
console.log(`Guildas inimigas: ${guildEnemies.join(", ")}`)

const lastSentDeaths = {}

async function startBot() {
  try {
    const ts3 = await TeamSpeak.connect(config)
    console.log("Conectado ao servidor TeaSpeak")

    // Verificar mortes a cada 30 segundos
    setInterval(() => checkDeaths(ts3), 30000)

    // Verificar HUNTED online a cada 30 segundos
    setInterval(() => checkHuntedOnline(ts3), 30000)
  } catch (error) {
    console.error("Erro ao conectar ao servidor TeaSpeak:", error)
  }
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      return await response.json()
    } catch (error) {
      if (i === retries - 1) throw error
      console.warn(`Tentativa ${i + 1} falhou. Tentando novamente...`, error)
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))) // Espera exponencial
    }
  }
}

async function fetchAllGuildDeaths(guilds) {
  const allDeaths = []
  for (const guildName of guilds) {
    const deaths = await fetchDeaths(guildName)
    allDeaths.push(...deaths)
  }
  return allDeaths
}

async function checkDeaths(ts3) {
  if (isChecking) {
    console.log("Uma verificação já está em andamento. Ignorando esta chamada.")
    return
  }

  isChecking = true // Marca que uma verificação está em andamento
  console.log("Iniciando verificação de mortes...")

  try {
    const enemyDeaths = await fetchAllGuildDeaths(guildEnemies)
    const alliedDeaths = await fetchDeaths(guildAliada)

    const allDeaths = [...enemyDeaths, ...alliedDeaths]
    console.log(`Mortes encontradas: ${allDeaths.length}`)

    await updateChannelDescription(ts3, canalDeaths, allDeaths)
    await sendNewDeathMessages(ts3, allDeaths)
    await massPoke(ts3, allDeaths)

    console.log("Verificação de mortes concluída.")
  } catch (error) {
    console.error("Erro ao verificar mortes:", error)
  } finally {
    isChecking = false // Libera a flag após a conclusão
  }
}

async function fetchDeaths(guildName) {
  console.log(`Buscando mortes da guild ${guildName}...`)
  const data = await fetchWithRetry(`https://api.tibiadata.com/v4/guild/${guildName}`)

  if (!data.guild || !data.guild.members) {
    console.error(`Nenhum dado encontrado para a guild ${guildName}`)
    return []
  }

  const onlineMembers = data.guild.members.filter((member) => member.status === "online")
  console.log(`Membros online de ${guildName}: ${onlineMembers.length}`)

  const allDeaths = await Promise.all(
    onlineMembers.map(async (member) => {
      console.log(`Buscando informações de ${member.name}...`)
      const characterData = await fetchWithRetry(
        `https://api.tibiadata.com/v4/character/${encodeURIComponent(member.name)}`,
      )
      return {
        name: characterData?.character?.character?.name || "Desconhecido",
        level: characterData?.character?.character?.level || 0,
        residence: characterData?.character?.character?.residence || "Desconhecido",
        deaths: characterData?.character?.deaths || [],
      }
    }),
  )

  const flatDeaths = allDeaths.flatMap((member) =>
    member.deaths.map((death) => ({
      character: member.name,
      level: member.level,
      residence: member.residence,
      reason: death.reason,
      time: death.time,
      guild: guildName,
      killers: death.killers,
    })),
  )

  const today = new Date()
  const todayDeaths = flatDeaths
    .filter((death) => {
      const deathDate = new Date(death.time)
      return (
        deathDate.getDate() === today.getDate() &&
        deathDate.getMonth() === today.getMonth() &&
        deathDate.getFullYear() === today.getFullYear()
      )
    })
    .sort((a, b) => new Date(b.time) - new Date(a.time))

  console.log(`Total de mortes hoje para ${guildName}: ${todayDeaths.length}`)
  return todayDeaths
}

async function formatDeathReason(death) {
  const killers = death.killers || []

  // Formata os 4 primeiros assassinos
  const formattedKillers = await Promise.all(
    killers.slice(0, 4).map(async (killer) => {
      if (killer.player) {
        try {
          const response = await fetch(`https://api.tibiadata.com/v4/character/${encodeURIComponent(killer.name)}`)
          const data = await response.json()
          const char = data.character.character
          return `[color=orange][b][${char.level}][/b][/color][[color=red][b]${shortenVocation(char.vocation)}][/b][/color] ${char.name}`
        } catch (error) {
          console.error(`Erro ao buscar informações de ${killer.name}:`, error)
          return killer.name // Retorna apenas o nome em caso de erro
        }
      } else {
        return killer.name // Não é jogador
      }
    }),
  )

  // Calcula o número de assassinos restantes (se houver)
  const remainingCount = killers.length - 4
  const additionalText = remainingCount > 0 ? ` e +${remainingCount}` : "" // Adiciona "+X" se houver mais assassinos

  return `Killed at Level ${death.level} by ${formattedKillers.join(", ")}${additionalText}.`
}

function shortenVocation(vocation) {
  switch (vocation) {
    case "Master Sorcerer":
      return "MS"
    case "Elder Druid":
      return "ED"
    case "Royal Paladin":
      return "RP"
    case "Elite Knight":
      return "EK"
    case "Sorcerer":
      return "MS"
    case "Druid":
      return "ED"
    case "Paladin":
      return "RP"
    case "Knight":
      return "EK"
    default:
      return vocation.slice(0, 2) // Abreviação genérica
  }
}

async function updateChannelDescription(ts3, channelId, deaths) {
  console.log(`Atualizando descrição do canal ${channelId}...`)

  const today = new Date()
  const todayDate = today.toLocaleDateString("pt-BR")

  const friendDeaths = deaths.filter((death) => death.guild === guildAliada).length
  const huntedDeaths = deaths.filter((death) => death.guild !== guildAliada).length

  let description = `🛑 Mortes Hoje hoje (${todayDate}):\n\n`
  description += `[color=red]AMIGO: ${friendDeaths} Morte(s)[/color]\n`
  description += `[color=green]HUNTED: ${huntedDeaths} Morte(s)[/color]\n\n`

  if (deaths.length === 0) {
    description += "Nenhuma morte hoje."
  } else {
    for (const death of deaths) {
      const guildPrefix = death.guild === guildAliada ? "" : ""
      const color = death.guild === guildAliada ? "#FF0000" : "#00FF00"
      const formattedReason = await formatDeathReason(death) // Chamada para a nova função
      description += `[color=${color}][b]${guildPrefix} ${death.character}:[/b]\n`
      description += `> ${formattedReason}[/color]\n\n` // Usar a reason formatada
    }
  }

  try {
    await ts3.channelEdit(channelId, { channel_description: description })
    console.log("Descrição do canal atualizada com sucesso!")
  } catch (error) {
    console.error("Erro ao atualizar a descrição do canal:", error)
  }
}

async function sendNewDeathMessages(ts3, deaths) {
  console.log("Enviando mensagens de novas mortes...")
  const mainChannelId = 1

  for (const death of deaths) {
    if (!lastSentDeaths[death.character] || new Date(lastSentDeaths[death.character].time) < new Date(death.time)) {
      const guildPrefix = death.guild === guildAliada ? "[AMIGO MORREU]" : "[HUNTED MORREU]"
      const color = death.guild === guildAliada ? "red" : "green"
      const formattedReason = await formatDeathReason(death)
      const deathDescription = `[color=${color}][b]💀 ${guildPrefix} [b]${death.character}[/b] 🔸 [color=black][b]${formattedReason}[/b][/color]`

      try {
        await ts3.sendTextMessage(mainChannelId, 3, deathDescription)
        console.log(`Nova morte enviada: ${death.character}`)
        lastSentDeaths[death.character] = death
      } catch (error) {
        console.error("Erro ao enviar mensagem no canal:", error)
      }
    }
  }
  console.log("Envio de mensagens concluído.")
}

const lastPokedDeaths = {}

async function massPoke(ts3, deaths) {
  console.log("Fazendo massPoke nos membros...")

  try {
    const clients = await ts3.clientList({ clientType: 0 }) // Apenas clientes humanos

    for (const death of deaths) {
      const deathKey = `${death.character}-${death.time}`

      if (!lastPokedDeaths[deathKey]) {
        const deathDate = new Date(death.time)
        const now = new Date()
        const timeDifference = Math.floor((now - deathDate) / 60000) // Diferença em minutos

        if (timeDifference <= 60) {
          if (death.guild === guildAliada && death.level <= 500) {
            console.log(`Ignorando morte de FRIEND ${death.character} com level ${death.level}, pois é inferior a 200.`)
            continue
          }

          const formattedReason = await formatDeathReason(death)
          const guildPrefix =
            death.guild === guildAliada
              ? "[color=red][b][FRIEND DEATH][/b][/color]"
              : "[color=green][b][HUNTED DEATH][/b][/color]"

          const pokeMessage = `💀 [color=blue][b]Killed ${timeDifference} minutes ago.[/b][/color] ${guildPrefix} [b]${death.character}[/b] 🔸 [color=black][b]${formattedReason}[/b][/color]`

          for (const client of clients) {
            try {
              // Obter informações completas do cliente para ter o uniqueIdentifier
              const clientInfo = await ts3.getClientById(client.clid)

              // Verificar se o cliente deve receber alertas
              if (shouldReceiveAlerts(clientInfo.uniqueIdentifier)) {
                await ts3.clientPoke(client.clid, pokeMessage)
                console.log(`Poke enviado para ${client.nickname}: ${pokeMessage}`)
              } else {
                console.log(`Poke não enviado para ${client.nickname}: alertas desativados`)
              }
            } catch (error) {
              console.error(`Erro ao enviar poke para ${client.nickname}:`, error)
            }
          }

          lastPokedDeaths[deathKey] = true
        }
      }
    }

    console.log("MassPoke concluído com as mortes novas.")
  } catch (error) {
    console.error("Erro ao fazer massPoke:", error)
  }
}

const lastHuntedOnline = {}
const lastLevels = {} // Armazena o último nível conhecido de cada jogador

async function checkHuntedOnline(ts3) {
  console.log("Iniciando verificação de HUNTED online...")
  try {
    const huntedGuild = guildEnemies
    const huntedMembers = await fetchOnlineMembers(huntedGuild)

    if (huntedMembers.length > 0) {
      for (const member of huntedMembers) {
        const playerName = member.name
        const playerLevel = member.level

        // Verifica se já foi enviada a mensagem de HUNTED online para esse jogador
        if (!lastHuntedOnline[playerName]) {
          const message = `[HUNTED ONLINE] ${playerName}`
          await sendChannelMessage(ts3, message)

          // Marca o jogador como já notificado
          lastHuntedOnline[playerName] = true
          console.log(`Mensagem e masspoke enviados para HUNTED: ${playerName}`)
        }

        // Verifica se o jogador subiu de nível
        if (lastLevels[playerName] && playerLevel > lastLevels[playerName]) {
          const oldLevel = lastLevels[playerName]
          const newLevel = playerLevel
          const levelUpMessage = `[HUNTED UPLEVEL] ${playerName}: ${oldLevel} > ${newLevel}`

          await sendChannelMessage(ts3, levelUpMessage)
          console.log(`Uplevel detectado para ${playerName}: ${oldLevel} > ${newLevel}`)
        }

        // Atualiza o nível do jogador
        lastLevels[playerName] = playerLevel
      }
    } else {
      console.log("Nenhum HUNTED online no momento.")
    }
  } catch (error) {
    console.error("Erro ao verificar HUNTED online:", error)
  }
}

async function fetchOnlineMembers(guildName) {
  console.log(`Buscando membros online da guild ${guildName}...`)
  const response = await fetch(`https://api.tibiadata.com/v4/guild/${guildName}`)
  const data = await response.json()

  if (!data.guild || !data.guild.members) {
    console.error(`Nenhum dado encontrado para a guild ${guildName}`)
    return []
  }

  const onlineMembers = data.guild.members.filter((member) => member.status === "online")
  console.log(`Membros online de ${guildName}: ${onlineMembers.length}`)
  return onlineMembers
}

async function sendChannelMessage(ts3, message) {
  const mainChannelId = 1 // ID do canal principal
  try {
    await ts3.sendTextMessage(mainChannelId, 3, message)
    console.log(`Mensagem enviada no canal: ${message}`)
  } catch (error) {
    console.error("Erro ao enviar mensagem no canal:", error)
  }
}

async function massPokeHunted(ts3, message) {
  console.log("Fazendo massPoke para HUNTED online...")
  try {
    const clients = await ts3.clientList({ clientType: 0 }) // Apenas clientes humanos
    for (const client of clients) {
      try {
        // Obter informações completas do cliente para ter o uniqueIdentifier
        const clientInfo = await ts3.getClientById(client.clid)

        // Verificar se o cliente deve receber alertas
        if (shouldReceiveAlerts(clientInfo.uniqueIdentifier)) {
          await ts3.clientPoke(client.clid, message)
          console.log(`Poke enviado para ${client.nickname}: ${message}`)
        } else {
          console.log(`Poke não enviado para ${client.nickname}: alertas desativados`)
        }
      } catch (error) {
        console.error(`Erro ao enviar poke para ${client.nickname}:`, error)
      }
    }
  } catch (error) {
    console.error("Erro ao fazer massPoke:", error)
  }
}

startBot()

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
})

console.log("Bot iniciado. Aguardando eventos...")
