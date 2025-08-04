### Documentação Técnica do Sistema WebBot

Esta documentação detalha a arquitetura, os arquivos de configuração, o processo de instalação e implantação, os procedimentos de edição e depuração, além dos sistemas de segurança e estilos visuais do WebBot.

---

#### 1. Visão Geral e Arquitetura do Sistema

O WebBot é uma aplicação Node.js projetada para auxiliar a gestão de guilds no jogo Tibia. Sua arquitetura é modular, separando a lógica de servidor (`server.js`) da lógica de negócios (`bot_logic.js`) e utilizando arquivos JSON para persistir os dados.

* **`server.js`** : Atua como o ponto de entrada da aplicação. Ele é responsável por iniciar o servidor HTTP e a comunicação WebSocket com `socket.io`. Gerencia as rotas da API REST (como o endpoint `/api/stalker/:name`), lida com a autenticação e conexões dos clientes, aplicando lógicas de segurança como a detecção de flood de conexões e comandos, e executa tarefas automáticas, como a verificação de respawns expirados e a sincronização de relações de guilda.
* **`bot_logic.js`** : Contém toda a lógica de negócios e é chamado pelo `server.js`. Suas responsabilidades incluem processar comandos de chat (`!resp`, `!plan`, etc.), gerenciar a fila de respawns e a lógica de alocação de tempo, interagir com arquivos JSON para salvar e carregar o estado do sistema, e comunicar-se com APIs externas para obter dados de personagens e guildas.
* **Arquivos de Dados JSON** : Diversos arquivos `.json` na pasta raiz do projeto são usados para persistência de dados. A edição manual desses arquivos é fundamental para a configuração do ambiente de teste.
* **`client.js` e `style.css`** : Gerenciam a interface do usuário no navegador. O `client.js` lida com a renderização dinâmica, eventos de clique e a comunicação com o `server.js` via WebSocket.

---

#### 2. Configuração e Edição de Arquivos para o Ambiente de Teste

Para um ambiente de teste, a configuração é feita principalmente através de arquivos JSON na raiz do projeto. Alterar estes arquivos permite testar diferentes cenários sem modificar o código-fonte principal.

##### 2.1. Arquivos de Configuração Essenciais

* **`ports.json`** : Este arquivo define a porta que o servidor irá usar e o nome do mundo (servidor de jogo) que o bot irá monitorar.
* **Localização** : Raiz do projeto.
* **Como Modificar** : O `"world"` é o nome exato do mundo que o bot irá rastrear, e a `"port"` é a porta de rede que o servidor irá escutar. Para um ambiente de teste local, `3001` é um valor seguro.
* **`set_guild.json`** : Define o nome da guilda para verificação de membros.
* **Localização** : Raiz do projeto.
* **Como Modificar** : Altere o valor de `"guild"` para o nome da guilda que você está testando.

##### 2.2. Arquivos de Dados para Teste e Simulação

* **`clientaccount.json`** : Armazena as contas de usuário.
* **Propósito** : Persistir informações como nome, e-mail, hash de senha, e uma lista de personagens.
* **Como Testar** : Você pode editar este arquivo manualmente para criar contas de teste com diferentes personagens, ranks de guilda e grupos. A cada login, o sistema atualiza o nível, vocação, rank e o token de sessão do usuário.
* **`webgroups.json`** : Define grupos personalizados com tempo extra de reserva.
* **Propósito** : Permite criar grupos com privilégios específicos que podem ser atribuídos a personagens.
* **Como Testar** : Adicione objetos à lista para criar novos grupos de teste e atribua os `id`s desses grupos aos personagens no `clientaccount.json`.
* **`relations.json`** : Contém a lista de guildas aliadas, inimigas e jogadores "hunted".
* **Propósito** : As listas `source_allies` e `source_enemies` são usadas para popular automaticamente `players_allies` e `players_enemies` durante a sincronização de relações. A lista `source_hunteds` é monitorada para alertas.
* **Como Testar** : Adicione nomes de guildas ou personagens nas listas `source` e force uma sincronização no painel de admin ou reinicie o bot para ver as listas de `players` sendo populadas.

---

#### 3. Sistemas de Segurança

O WebBot incorpora várias camadas de segurança para proteger a integridade do sistema e dos dados do usuário.

* **Validação e Sanitização de Dados** : O sistema valida e sanitiza dados recebidos para prevenir ataques comuns.
* **Firewall de Conexões** : Limita as tentativas de conexão por IP. Um IP que tenta se conectar mais de 5 vezes em 1 minuto é bloqueado por 10 minutos. Essa atividade é registrada no arquivo `underattack.json` como 'Connection Flood'.
* **Limite de Comandos (Rate Limit)** : Usuários que enviam mais de 5 comandos em 10 segundos são "mutados" por 5 minutos. Essa atividade é registrada como 'Command Flood' no `underattack.json`.
* **Sessão Única** : Quando um usuário se conecta com um token de sessão, o sistema verifica se já existe uma sessão ativa para aquele e-mail. Se existir, a sessão antiga é desconectada, evitando que a conta seja usada em dois lugares ao mesmo tempo.
* **`X-Frame-Options`** : O cabeçalho `X-Frame-Options` é configurado como `SAMEORIGIN` para evitar que a página seja carregada em `iframes` de outros domínios, prevenindo ataques de `clickjacking`.
* **`X-Content-Type-Options`** : O cabeçalho `X-Content-Type-Options` é definido como `nosniff`, impedindo que o navegador tente adivinhar o tipo MIME do conteúdo, o que pode mitigar ataques de injeção de scripts.

---

#### 4. Estilos e Sistema Visual

O sistema WebBot adota um tema escuro consistente e moderno, com elementos visuais bem definidos para uma experiência agradável.

* **Paleta de Cores** : As cores são definidas usando variáveis CSS para facilitar a manutenção. O tema é predominantemente escuro, com tons de cinza-azulado (`--bg-color: #0D1117`, `--panel-bg-color: #161B22`). As cores de destaque e ações usam tons vibrantes como verde (`--success-color: #3FB950`), vermelho (`--danger-color: #F85149`) e azul (`--accent-color: #58A6FF`) para dar feedback visual.
* **Responsividade** : O layout é projetado para ser responsivo e se adaptar a diferentes tamanhos de tela. **(Ainda não implementado** Em dispositivos menores, os painéis de conteúdo e chat são ocultados, e botões de toggle permitem ao usuário alternar a visualização entre eles. O menu de navegação também se torna um menu "hambúrguer" que se expande e recolhe).
* **Indicadores de Status** : O status online dos jogadores é visualmente representado por bolinhas coloridas. Na tabela de respawns, apenas a bolinha vermelha é exibida para indicar que um jogador está offline. No modal de detalhes do grupo planilhado, tanto a bolinha verde quanto a vermelha são exibidas para indicar os status online e offline dos membros.
* **Feedback Visual** : Ações como hover em botões, links e linhas de tabela recebem transições suaves e mudanças de cor para fornecer feedback visual ao usuário. A linha da tabela de respawns do usuário logado é destacada para fácil identificação.

---

#### 5. Depuração e Monitoramento

* **Logs no Console** : O `server.js` usa `console.log` para fornecer informações em tempo real sobre a atividade do bot, como conexões de usuário, alertas de segurança e o status das tarefas automáticas.
* **Logs de Arquivos** : O bot armazena logs de atividades em arquivos `.json` na raiz do projeto. Esses logs podem ser visualizados na interface de admin.
* **Ferramentas do Desenvolvedor** : O console do navegador (F12) é essencial para depurar o `client.js`. A aba `Console` mostra logs e erros de JavaScript, enquanto a aba `Network` pode ser usada para inspecionar a comunicação WebSocket.
