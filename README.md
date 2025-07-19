# TibiaWebBot


```
 # Tibia Web Bot & Sistema de Gerenciamento

Um sistema web completo para gerenciamento de respawns, guildas e segurança para servidores de Tibia, com suporte a múltiplos mundos através de um gateway central.

## Funcionalidades Principais

- **Gerenciamento de Fila de Respawns:** Sistema de fila em tempo real para controle de "hunts".
- **Painel de Administração:** Interface completa para gerenciar usuários, grupos de acesso, respawns e tempos de hunt.
- **Lista de Amigos/Inimigos/Hunteds:** Sincronização automática com guildas aliadas e inimigas, e uma lista manual de "hunteds".
- **Alertas em Tempo Real:** Notificações no navegador quando inimigos ou "hunteds" ficam online.
- **Segurança Avançada:** Múltiplas camadas de defesa contra ataques de usuários e externos.
- **Suporte a Múltiplos Mundos:** A arquitetura com gateway permite que uma única instalação gerencie bots para vários mundos de jogo simultaneamente.

## Arquitetura do Sistema

O projeto é dividido em duas partes principais que rodam ao mesmo tempo:

1.  **Gateway (`gateway.js`):** Um servidor proxy reverso que atua como porta de entrada. Ele direciona o tráfego do domínio (ex: `issobra.newcorporation.com.br`) para a instância correta do bot rodando em uma porta local.
2.  **Instâncias do Bot (`server<MUNDO>.js`):** Cada mundo de jogo (ex: Issobra, Etebra) tem seu próprio processo de servidor rodando em uma porta interna específica. Cada instância gerencia seus próprios dados (filas, contas, etc.).

## Pré-requisitos

- **Node.js:** Versão 16 ou superior.
- **NPM:** (geralmente instalado com o Node.js).
- **PM2 (Recomendado):** Uma ferramenta para gerenciar múltiplos processos Node.js em produção.

## Instalação

1.  **Clone o Repositório:**
    ```bash
    git clone https://github.com/Rapha29/Tibia_Web_Bot.git
    cd /Tibia_Web_Bot
    ```

2.  **Instale as Dependências:**
    Este comando instalará todos os pacotes necessários para o gateway e para os bots.
    ```bash
    npm install express socket.io http-proxy vhost node-fetch
    ```

3.  **Instale o PM2 (Recomendado):**
    ```bash
    npm install pm2 -g
    ```

## Configuração

A configuração correta é **crucial** para que o sistema funcione.

#### 1. Crie os Arquivos de Servidor por Mundo

Para cada mundo que você quer gerenciar, crie uma cópia do arquivo `server.js` e renomeie-o seguindo o padrão `server<NOME_DO_MUNDO>.js`.
-   Exemplo: `serverIssobra.js`, `serverEtebra.js`, `serverYubra.js`.

O sistema identifica o mundo automaticamente a partir do nome do arquivo.

#### 2. Configure as Portas (`ports.json`)

Crie um arquivo `ports.json` na raiz do projeto. Ele mapeia o nome de cada mundo (o mesmo usado no nome do arquivo) para uma porta interna.

**Exemplo de `ports.json`:**
```json
[
  { "world": "issobra", "port": 8081 },
  { "world": "etebra", "port": 8082 },
  { "world": "yubra", "port": 8083 },
  { "world": "ustebra", "port": 8084 },
  { "world": "luzibra", "port": 8085 }
]
```

#### 3. Configure o Gateway (`gateway.js`)

Abra o arquivo `gateway.js` e edite o objeto `routes` para mapear os domínios de acesso para as portas corretas definidas no `ports.json`.

**Exemplo de `routes` em `gateway.js`:**

**JavaScript**

```
const routes = {
    'issobra.newcorporation.com.br': 'http://localhost:8081',
    'etebra.jowbot.com.br': 'http://localhost:8082',
    'yubra.jowbot.com.br': 'http://localhost:8083',
    // ... e assim por diante
    'localhost': 'http://localhost:3001' // Para testes locais
};
```

**Importante:** O `target` (ex:`http://localhost:3001`) deve corresponder exatamente à porta definida para aquele mundo no `ports.json`.

#### 4. Outras Configurações

Certifique-se de configurar outros arquivos `.json` conforme necessário, como `set_guild.json` e `relations.json`, para cada instância de bot.

## Uso (Como Rodar o Sistema)

Usar o `pm2` é a forma recomendada para iniciar e gerenciar todos os processos.

1. **Inicie o Gateway:**
   **Bash**

   ```
   pm2 start gateway.js --name "gateway"
   ```
2. **Inicie cada Bot:**
   Você precisa iniciar um processo para cada arquivo de servidor que você criou.
   **Bash**

   ```
   pm2 start serverIssobra.js --name "bot-issobra"
   pm2 start serverEtebra.js --name "bot-etebra"
   pm2 start serverYubra.js --name "bot-yubra"
   ```
3. **Gerencie os Processos:**

   * Para listar todos os processos rodando:`pm2 list`
   * Para ver os logs de um processo específico:`pm2 logs bot-issobra`
   * Para parar um processo:`pm2 stop gateway`
   * Para reiniciar um processo:`pm2 restart bot-etebra`

Após iniciar todos os processos, seu sistema estará online e acessível através dos domínios configurados no gateway.

## Funcionalidades de Segurança Implementadas

Este projeto conta com um robusto sistema de segurança para garantir a estabilidade e a integridade da plataforma.

* **Anti-DDoS/Flood de Conexão:** Bloqueio automático por IP para quem recarregar a página excessivamente.
* **Anti-Spam de Comandos:** Bloqueio temporário para usuários que enviam comandos em excesso.
* **Sessão Única:** Impede que um usuário faça login com a mesma conta em múltiplos locais.
* **Cabeçalhos de Segurança:** Proteção contra vulnerabilidades web comuns como XSS e Clickjacking.
* **Log de Ataques:** Todas as atividades maliciosas são registradas no arquivo `underattack.json` para análise.
