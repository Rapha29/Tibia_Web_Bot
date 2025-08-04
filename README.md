## Tutorial Completo: WebBot - Preparação, Instalação e Uso

Este tutorial guiará você desde a preparação do ambiente até a implantação e gerenciamento do seu WebBot, além de fornecer manuais para líderes e usuários.

### 1. Preparação do Ambiente

Antes de iniciar, certifique-se de que seu sistema atende aos requisitos básicos.

#### Requisitos Essenciais

* **Node.js** : É a plataforma de tempo de execução JavaScript que o WebBot utiliza.
* **npm** (Node Package Manager): Vem junto com o Node.js e é usado para instalar as dependências do projeto.
* **Git** : Sistema de controle de versão, útil para clonar o repositório do WebBot.
* **Editor de Código** : Visual Studio Code, Sublime Text, Atom, etc. (recomendado para desenvolvimento).
* **Conexão com a Internet** : Necessária para baixar dependências e interagir com APIs externas.

### 2. Instalação em Ambiente de Teste (Windows)

Este ambiente é ideal para desenvolvimento e testes locais.

#### 2.1. Instalação do Node.js e npm

1. **Baixe o instalador do Node.js** :

* Acesse o site oficial: [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
* Baixe a versão LTS (Long Term Support), que é a mais estável e recomendada para a maioria dos usuários.

1. **Execute o instalador** :

* Siga as instruções do instalador (clique em "Next", aceite os termos, use as configurações padrão).
* Certifique-se de que a opção "Node.js runtime" e "npm package manager" estejam selecionadas.

1. **Verifique a instalação** :

* Abra o **Prompt de Comando** (CMD) ou  **PowerShell** .
* Digite `node -v` e pressione Enter. Você deverá ver a versão do Node.js instalada (ex: `v20.x.x`).
* Digite `npm -v` e pressione Enter. Você deverá ver a versão do npm instalada (ex: `10.x.x`).

#### 2.2. Instalação do Git

1. **Baixe o instalador do Git** :

* Acesse o site oficial: [https://git-scm.com/download/win](https://git-scm.com/download/win)

1. **Execute o instalador** :

* Siga as instruções (clique em "Next" várias vezes). As opções padrão geralmente são adequadas. Certifique-se de que "Git Bash" e "Git GUI" estejam selecionados, e que a opção "Git from the command line and also from 3rd-party software" esteja marcada para facilitar o uso no CMD/PowerShell.

#### 2.3. Configuração do WebBot

1. **Clone o repositório (ou copie os arquivos)** :

* Se você usa Git, abra o **Git Bash** (ou CMD/PowerShell) no local onde deseja salvar o projeto e execute:
  **Bash**

  ```
  git clone <URL_DO_SEU_REPOSITORIO>
  cd <NOME_DA_PASTA_DO_PROJETO>
  ```
* Se você tem os arquivos em um ZIP, extraia-os para uma pasta em seu computador.

1. **Instale as dependências** :

* Abra o **Prompt de Comando** (CMD) ou **PowerShell** na pasta raiz do projeto (onde está o `package.json`).
* Execute: `npm install`
* Isso baixará todas as bibliotecas necessárias para o projeto.

1. **Configurações iniciais (arquivos JSON)** :

* **`<span class="citation-345">ports.json</span>`** **: Este arquivo determina a porta e o nome do mundo (server) que o bot irá monitorar**. Crie-o na pasta raiz do projeto.
  **JSON**

    ``     [        {          "world": "issobra",          "port": 3001        }      ]     ``

    *`"world`: Nome exato do mundo que o bot monitorará (ex: "issobra").
     *`"port`: Porta em que o servidor web do bot será executado.

* **`set_guild.json`** : Define o nome da guilda para verificação de membros.
  **JSON**

    ``     {        "guild": "Nome da Sua Guilda"      }     ``

* **`set_world.json`** : (Este arquivo não foi citado explicitamente nas suas funções. Se o bot não o usa, pode ignorar). Se o bot usar para algo como World de origem, coloque:
  **JSON**

    ``     {        "world": "NomeDoMundo"      }     ``

* **Outros arquivos JSON vazios** : Se o `bot_logic.js` referencia arquivos como `clientaccount.json`, `fila.json`, `respawns.json`, `relations.json`, etc., certifique-se de que eles existam como arquivos JSON válidos, mesmo que vazios ( `{}` para objetos, `[]` para arrays, ou com um mínimo de dados de exemplo se souber a estrutura).
  * Exemplo para `clientaccount.json`:
  **JSON**

  ```
  {}
  ```

    * Exemplo para`fila.json`:
       **JSON**

    ``       {}       ``
     * Exemplo para `respawns.json`:
       **JSON**

    ``       {          "Carlin": {            "A1": "Minotaur Cult",            "A2": "Dragon Lair"          },          "Edron": {            "E1": "Hero Fortress"          }        }       ``
     * Exemplo para `relations.json`:
       **JSON**

    ``       {          "world": "issobra",          "source_allies": [],          "source_enemies": [],          "source_hunteds": [],          "players_allies": [],          "players_enemies": [],          "players_hunteds": [],          "last_sync": null        }       ``
     * Exemplo para `planilhado_groups.json`:
       **JSON**

    ``       []       ``
     * Exemplo para `planilhado_schedule.json`:
       **JSON**

    ``       {}       ``
     * Exemplo para `planilhado_double_schedule.json`:
       **JSON**

    ``       {}       ``
     * Exemplo para `respawn_rank_restrictions.json`:
       **JSON**

    ``       {}       ``
     * Exemplo para `respawnTimes.json`:
       **JSON**

    ``       {          "default": 150        }       ``
     * Exemplo para `webgroups.json`:
       **JSON**

    ``       []       ``
     * Exemplo para `cooldowns.json`:
       **JSON**

    ``       {}       ``
     * Exemplo para `underattack.json`: (Este arquivo é um log, então pode começar vazio ou ser criado na primeira escrita)
       ``       (vazio ou com uma linha JSON)       ``
     * Exemplo para `verification_codes.json`:
       **JSON**

    ``       {}       ``

#### 2.4. Iniciar o WebBot (Modo de Teste)

1. Abra o **Prompt de Comando** (CMD) ou **PowerShell** na pasta raiz do projeto.
2. Execute: `node serverIssobra.js`
3. **Você deverá ver mensagens no console indicando que o servidor iniciou (ex: **
   `<span class="citation-342">Servidor para o mundo [issobra] rodando na porta http://127.0.0.1:3001.</span>`).
4. **Abra seu navegador e acesse **
   `<span class="citation-341">http://127.0.0.1:3001</span>` (ou a porta que você configurou).

### 3. Instalação e Uso em Ambiente de Produção (Ubuntu Server)

Para produção, o PM2 é essencial para manter o aplicativo sempre online e gerenciar processos.

#### 3.1. Preparação do Servidor Ubuntu

1. **Conecte-se ao seu servidor Ubuntu via SSH** :
   **Bash**

```
   ssh usuario@seu_ip_do_servidor
```

1. **Atualize o sistema** :
   **Bash**

```
   sudo apt update
   sudo apt upgrade -y
```

1. **Instale Node.js e npm (recomendado NVM)** :

* **NVM (Node Version Manager)** : É a forma recomendada de instalar Node.js, pois permite gerenciar múltiplas versões.
  **Bash**

    ``     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash      source ~/.bashrc # ou ~/.zshrc se usar zsh      nvm install --lts # Instala a versão LTS mais recente      nvm use --lts      node -v # Verifique a instalação      npm -v # Verifique a instalação     ``

* Alternativa (direto do APT, menos flexível):
  **Bash**

  ```
  sudo apt install nodejs npm -y
  ```

1. **Instale Git** :
   **Bash**

```
   sudo apt install git -y
```

#### 3.2. Configuração do WebBot no Servidor

1. **Clone o repositório (ou transfira os arquivos)** :

* Navegue até o diretório onde deseja armazenar seu projeto (ex: `/var/www/`, ou na sua home `~/`).
* Exemplo: `cd /var/www/`
* Clone seu repositório:
  **Bash**

  ```
  sudo git clone <URL_DO_SEU_REPOSITORIO> webbot # 'webbot' será o nome da pasta
  sudo chown -R $USER:$USER webbot # Altere a posse para seu usuário
  cd webbot
  ```

1. **Instale as dependências** :
   **Bash**

```
   npm install
```

1. **Crie os arquivos de configuração JSON** :

* Crie ou copie seus arquivos `ports.json`, `set_guild.json`, `respawns.json`, `clientaccount.json`, etc., para a pasta raiz do projeto no servidor, exatamente como fez no ambiente de teste.
* Certifique-se de que os caminhos nos arquivos estejam corretos se você os moveu de outro lugar (ex: `path.join(__dirname, 'ports.json')`).

#### 3.3. Instalação e Uso do PM2

PM2 é um gerenciador de processos de produção para aplicativos Node.js.

1. **Instale PM2 globalmente** :
   **Bash**

```
   npm install pm2 -g
```

1. **Inicie seu aplicativo com PM2** :

* Na pasta raiz do seu projeto (onde está `serverIssobra.js`), execute:
  **Bash**

  ```
  pm2 start serverIssobra.js --name "webbot-issobra" --
  ```

  * `serverIssobra.js`: O arquivo principal do seu servidor Node.js.
  * `--name "webbot-issobra"`: Um nome amigável para identificar seu processo no PM2.
  * `--`: Sinaliza que os argumentos a seguir devem ser passados para o script Node.js (no seu caso, não há argumentos adicionais, mas é uma boa prática).

1. **Verifique o status do PM2** :
   **Bash**

```
   pm2 status
```

   Você deverá ver seu aplicativo `webbot-issobra` listado como `online`.

1. **Configure o PM2 para iniciar no boot do sistema** :
   **Bash**

```
   pm2 startup systemd
```

* Siga as instruções que aparecerão no terminal. Geralmente, ele fornecerá um comando `sudo systemctl enable ...` que você precisará copiar e colar.
* Isso garantirá que seu aplicativo inicie automaticamente se o servidor for reiniciado.

1. **Salve a configuração atual do PM2** :
   **Bash**

```
   pm2 save
```

   Isso salva a lista de processos gerenciados pelo PM2, para que ele possa restaurá-los no boot.

#### 3.4. Configuração de Firewall (UFW - Ubuntu Firewall)

Você precisará permitir o tráfego na porta que seu bot usa (ex: `3001`) e na porta HTTP/HTTPS padrão (`80`/`443`) se você for usar um proxy reverso.

1. **Permitir a porta do bot** :
   **Bash**

```
   sudo ufw allow 3001/tcp
```

1. **Permitir HTTP/HTTPS (se for usar Nginx/Apache)** :
   **Bash**

```
   sudo ufw allow 'Nginx Full' # Se usar Nginx
   # OU
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
```

1. **Ativar o firewall** :
   **Bash**

```
   sudo ufw enable
```

   Confirme com `y`.

1. **Verificar status do firewall** :
   **Bash**

```
   sudo ufw status
```

#### 3.5. Configuração de Proxy Reverso (Nginx - Recomendado)

Para acessar seu bot via nome de domínio (ex: `seubot.com`) e usar HTTPS, um proxy reverso como o Nginx é essencial.

1. **Instale Nginx** :
   **Bash**

```
   sudo apt install nginx -y
```

1. **Crie um arquivo de configuração para seu site** :
   **Bash**

```
   sudo nano /etc/nginx/sites-available/webbot-issobra
```

   Cole o seguinte conteúdo (substitua `seu_dominio.com` e a porta se for diferente):

   **Nginx**

```
   server {
       listen 80;
       server_name seu_dominio.com www.seu_dominio.com; # Adicione seu domínio

       location / {
           proxy_pass http://localhost:3001; # Porta do seu Node.js app
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; # Preserva o IP real do cliente
           proxy_set_header X-Real-IP $remote_addr; # Preserva o IP real do cliente
       }
   }
```

1. **Crie um link simbólico para `sites-enabled`** :
   **Bash**

```
   sudo ln -s /etc/nginx/sites-available/webbot-issobra /etc/nginx/sites-enabled/
```

1. **Teste a configuração do Nginx** :
   **Bash**

```
   sudo nginx -t
```

   Se tudo estiver "syntax is ok" e "test is successful", você pode prosseguir.

1. **Reinicie o Nginx** :
   **Bash**

```
   sudo systemctl restart nginx
```

Agora, seu bot deve ser acessível via `http://seu_dominio.com`. Para HTTPS, você precisará configurar o Certbot.

#### 3.6. Configuração de HTTPS (Certbot - Recomendado)

1. **Instale Certbot** :
   **Bash**

```
   sudo apt install certbot python3-certbot-nginx -y
```

1. **Obtenha o certificado SSL** :
   **Bash**

```
   sudo certbot --nginx -d seu_dominio.com -d www.seu_dominio.com
```

* Siga as instruções. Ele perguntará seu e-mail e pedirá para concordar com os termos.
* Escolha se deseja forçar HTTPS (recomendado: 2 - Redirect).

1. **Teste a renovação automática** :
   **Bash**

```
   sudo certbot renew --dry-run
```

   Se não houver erros, a renovação automática funcionará.

### 4. Gerenciamento do WebBot com PM2

PM2 é uma ferramenta poderosa. Aqui estão os comandos mais importantes:

#### 4.1. Formas de Iniciar

* **Iniciar um novo aplicativo (ou reiniciar se já existe com o mesmo nome)** :
  **Bash**

```
  pm2 start serverIssobra.js --name "webbot-issobra"
```

* **Iniciar todos os aplicativos salvos** :
  **Bash**

```
  pm2 resurrect
```

  (Usado após um reboot se o `pm2 startup` não funcionou por algum motivo, ou para restaurar uma configuração salva).

#### 4.2. Formas de Reiniciar

* **Reiniciar um aplicativo específico** :
  **Bash**

```
  pm2 restart webbot-issobra
```

  (Onde `webbot-issobra` é o nome que você deu ao seu processo).

* **Reiniciar todos os aplicativos** :
  **Bash**

```
  pm2 restart all
```

* **Recarregar um aplicativo (reinicialização sem downtime)** :
  **Bash**

```
  pm2 reload webbot-issobra
```

  (Tenta fazer um "graceful reload", ou seja, carrega a nova versão sem derrubar todas as conexões existentes. Nem todos os aplicativos Node.js suportam isso perfeitamente, mas vale a pena tentar).

#### 4.3. Formas de Parar

* **Parar um aplicativo específico** :
  **Bash**

```
  pm2 stop webbot-issobra
```

* **Parar todos os aplicativos** :
  **Bash**

```
  pm2 stop all
```

* **Excluir um aplicativo da lista de gerenciamento do PM2 (parando-o)** :
  **Bash**

```
  pm2 delete webbot-issobra
```

* **Excluir todos os aplicativos** :
  **Bash**

```
  pm2 delete all
```

#### 4.4. Outros Comandos Úteis do PM2

* **Ver status de todos os aplicativos** :
  **Bash**

```
  pm2 status
  # OU
  pm2 list
```

* **Ver logs em tempo real** :
  **Bash**

```
  pm2 logs webbot-issobra
  pm2 logs # Para todos os apps
  pm2 logs --lines 100 # Últimas 100 linhas
```

* **Monitorar o uso de recursos** :
  **Bash**

```
  pm2 monit
```

  (Abre um painel interativo no terminal).

* **Remover processos inativos do PM2** :
  **Bash**

```
  pm2 prune
```

### 5. Manual do Líder do WebBot

Este manual é para usuários com privilégios de "líder" ou "admin" no bot.

#### 5.1. Acessando o Painel de Gerenciamento (Web)

* **Onde encontrar** : No canto inferior direito da tela principal do bot, procure pelo botão "👑 Gerenciar". Este botão só aparece para usuários logados com ranks administrativos (líder da guilda, vice-líder, etc.) ou super-admins.
* **Funcionalidades Principais** :
* **Membros** : Gerencie usuários registrados, veja seus personagens e atribua/remova grupos.
* **Grupos** : Crie, edite ou exclua grupos personalizados que dão tempo extra de respawn ou privilégios. Veja quais usuários e respawns estão associados a cada grupo.
* **Respawns** : Adicione, edite ou exclua respawns da lista do bot. Configure grupos de acesso e restrições de rank para cada respawn.
* **Tempos** : Defina o tempo base de respawn que cada rank da guilda recebe.
* **Usuários** : Veja uma lista completa de todos os usuários registrados.
* **Cooldowns** : Remova cooldowns de jogadores específicos (útil em caso de erro ou emergência).
* **Pausar/Despausar Tudo** : Pause ou despause todos os respawns ativos do bot.
* **Logs** : Visualize logs de atividades por respawn ou por personagem.

#### 5.2. Comandos de Líder (Chat)

* `!mp [mensagem]`: Envia uma mensagem em massa para todos os usuários conectados ao bot.
  * **Uso** : Apenas ranks permitidos (líder alliance, líder, prodigy).
  * **Exemplo** : `!mp Atenção, reunião de guild hoje as 20h no TS.`
* `!planilhadoremove [código_respawn] [nome_do_líder]`: Remove um grupo planilhado de um respawn ativo (funciona como um "kick" do respawn).
  * **Uso** : Apenas líderes do grupo planilhado em questão ou admins. Não remove o agendamento da planilha, apenas libera o respawn no momento.
  * **Exemplo** : `!planilhadoremove P17 Ra nyx`

### 6. Manual do Usuário do WebBot

Este manual é para todos os usuários do bot.

#### 6.1. Primeiros Passos e Login

1. **Acessar o Bot** : Abra seu navegador e vá para o endereço do bot (ex: `http://seubot.com` ou `http://127.0.0.1:3001`).
2. **Login / Registro** :

* Ao entrar, o bot pode te dar uma mensagem de boas-vindas com botões de ação.
* `!showlogin`: Digite este comando no chat para iniciar o processo de login. Você será guiado para inserir seu e-mail e senha.
* `!showregistration`: Digite este comando para criar uma nova conta. O bot pedirá seu nome, e-mail, telefone e para criar uma senha.
* `!recover`: Use este comando se esqueceu sua senha e precisa recuperá-la.

1. **Registrar Personagem** : Após o login, se você não tiver um personagem, o bot pedirá para registrar um. Você precisará adicionar um código específico ao comentário do seu personagem no Tibia.com e usar `!confirmregister [nome_do_personagem]`.

* **Importante** : Seu personagem deve pertencer à guilda configurada no bot para poder usar a maioria dos comandos de respawn.

#### 6.2. Usando a Tabela de Respawns

* **Visualização** : A tela principal mostra a lista de respawns ativos.
* **[Código] Nome** : Identifica o respawn.
* **Restante/Total** : Tempo restante de hunt e tempo total alocado.
* **Ocupado por** : Quem está no respawn.
  * `Planilhado [Nome do Líder]`: Indica que é um grupo planilhado. Clicar no nome do líder abre um modal com os membros do grupo.
  * `[Ícone de pessoa] Nome do Maker`: Se for hunt com maker, mostra o nome do maker e um ícone para ver o personagem principal.
  * `[Bolinha vermelha]`: Indica que o jogador/maker está offline.
* **Nexts** : Quantidade de jogadores na fila. Clique no botão `Fila (X):` para expandir e ver os nomes.
* **Ações** : Botões para interagir com o respawn (ex: Sair).

#### 6.3. Comandos Comuns (Chat)

* `!help`: Exibe a lista de comandos disponíveis.
* `!resp [código]` ou `!resp [código] [HH:MM]`: Reserva um respawn.
  * `[código]`: O código do respawn (ex: `P17`, `A1`).
  * `[HH:MM]`: Tempo de reserva opcional (ex: `01:30` para 1 hora e 30 minutos). O tempo máximo é limitado pelo seu rank e grupos.
  * **Exemplo** : `!resp A1` ou `!resp P17 01:00`
* `!respmaker [código]`: Reserva um respawn especificamente para caçar com um maker.
  * **Exemplo** : `!respmaker P17`
* `!maker [nome_do_maker]`: Após usar `!respmaker`, use este comando para definir o nome do seu maker.
  * **Exemplo** : `!maker Yikzs`
* `!respdel [código]`: Libera o respawn que você está ocupando ou remove você da fila de um respawn.
  * **Exemplo** : `!respdel A1`
* `!aceitar`: Confirma que você está no respawn que reservou. Use este comando em até 10 minutos após reservar para não perder a reserva.
* `!plan [código_respawn]`: Comando especial para líderes de grupo planilhado assumirem um respawn agendado.
  * **Uso** : Você deve ser o líder do grupo na planilha para o respawn especificado.
  * **Exemplo** : `!plan P17`
* `!shared [seu_level]`: Calcula a faixa de níveis para shared XP com seu personagem.
  * **Exemplo** : `!shared 400`
* `!stream [link_da_stream]`: Adiciona ou atualiza o link da sua live de stream.
  * **Exemplo** : `!stream `
  * `https://twitch.twitch.tv/seu_canal`
* `!removestream`: Remove o link da sua live.
* `Sair` (botão): Ao lado de um respawn que você ocupa ou está na fila, este botão tem o mesmo efeito de `!respdel`.
* `Aceitar` (botão): No painel de chat, funciona como o comando `!aceitar`.
* `Resp List` (botão): Abre o modal de busca de respawns, onde você pode filtrar e pesquisar.

#### 6.4. Configurações de Notificação (Chat)

* **🔊 Som** : Ative/desative os sons de notificação do bot.
* **🔔 Alerta** : Ative/desative os alertas pop-up do navegador para mensagens importantes (ex: respawn disponível, hunted online).
