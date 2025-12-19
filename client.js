// client.js

function loadScript(src, callback) {
    const oldScript = document.querySelector(`script[src="${src}"]`);
    if (oldScript) {
        oldScript.remove();
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
        if (callback) callback();
    };
    document.body.appendChild(script);
}

function addSlot() {
    const container = document.getElementById('slotsInputContainer');
    if (!container) return;
    const newSlot = document.createElement('div');
    newSlot.className = 'input-group mb-2';
    newSlot.innerHTML = `
        <input type="text" class="form-control" name="role_name" placeholder="Nome da Função (Ex: Suporte)" required>
        <input type="number" class="form-control" name="role_count" value="1" min="1" required>
        <button class="btn btn-outline-danger" type="button" onclick="this.parentElement.remove()">-</button>
    `;
    container.appendChild(newSlot);
}

window.currentUser = null;

function formatFullTimestamp(isoString) {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        return isoString; // Retorna o original em caso de erro
    }
}

function timeAgo(dateString) {
    if (!dateString || !dateString.includes('-')) return '';

    const datePart = dateString.split(' ')[0];
    const parts = datePart.split('-');
    
    if (parts.length !== 3) return '';

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return '';

    const pastDate = new Date(year, month - 1, day);
    const now = new Date();
    
    now.setHours(0, 0, 0, 0);
    pastDate.setHours(0, 0, 0, 0);

    if (isNaN(pastDate.getTime())) return '';

    const diffTime = now - pastDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        return ''; // Não mostra nada se for hoje ou no futuro.
    } else if (diffDays === 1) {
        return `(1 dia atrás)`;
    } else {
        return `(${diffDays} dias atrás)`;
    }
}

function initializeWarPanelListeners() {
    console.log("DEBUG: Tentando inicializar listeners do War Panel..."); // Log

    const globalFilterInput = document.getElementById('global-war-filter-input');
    const applyFilterBtn = document.getElementById('apply-war-filter-btn');
    const clearFilterBtn = document.getElementById('clear-war-filter-btn');

    // Listener para o botão "Filtrar"
    if (applyFilterBtn) {
        // Remove listener antigo para evitar duplicação se loadPage for chamado de novo
        applyFilterBtn.removeEventListener('click', applyWarFilter);
        applyFilterBtn.addEventListener('click', applyWarFilter);
        console.log("DEBUG: Listener anexado ao botão Filtrar.");
    } else {
        console.error("ERRO: Botão Filtrar (#apply-war-filter-btn) não encontrado após carregar warpanel.");
    }

    // Listener para o botão "Limpar"
    if (clearFilterBtn && globalFilterInput) {
        clearFilterBtn.removeEventListener('click', clearWarFilter);
        clearFilterBtn.addEventListener('click', clearWarFilter);
        console.log("DEBUG: Listener anexado ao botão Limpar.");
    } else {
        if(!clearFilterBtn) console.error("ERRO: Botão Limpar (#clear-war-filter-btn) não encontrado após carregar warpanel.");
        if(!globalFilterInput) console.error("ERRO: Input Global (#global-war-filter-input) não encontrado para o botão Limpar após carregar warpanel.");
    }

    // Listener Opcional de 'Enter'
    if (globalFilterInput) {
        globalFilterInput.removeEventListener('keypress', handleWarFilterEnter);
        globalFilterInput.addEventListener('keypress', handleWarFilterEnter);
        console.log("DEBUG: Listener 'keypress' anexado ao input global.");
    }

    // Funções auxiliares para os listeners (para evitar duplicação de código)
    function applyWarFilter() {
        console.log("DEBUG: Botão Filtrar CLICADO ou Enter pressionado.");
        if (typeof filterWarPanelContent === 'function') {
            filterWarPanelContent();
        } else {
            console.error("ERRO: Função filterWarPanelContent não definida.");
        }
    }
    function clearWarFilter() {
         console.log("DEBUG: Botão Limpar CLICADO.");
         if(globalFilterInput) globalFilterInput.value = '';
         applyWarFilter(); // Chama a mesma função de filtro após limpar
    }
    function handleWarFilterEnter(event) {
         if (event.key === 'Enter') {
             event.preventDefault();
             applyWarFilter();
         }
    }
}

async function loadPage(pageName) {
    const contentPanel = document.getElementById('main-content-panel');
    if (!contentPanel) return;

    const loader = document.getElementById('page-loader-overlay');
    if (loader) {
        loader.classList.remove('loader-hidden'); 
    }
    const minDelay = new Promise(resolve => setTimeout(resolve, 1500));

    const maxRetries = 5;
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(`pages/${pageName}.html`);
            if (!response.ok) {
                throw new Error(`Erro ao carregar ${pageName}.html (Status: ${response.status})`);
            }

            const htmlText = await response.text();
            contentPanel.innerHTML = ''; // Limpa antes de adicionar

            // --- Lógica de Inserção do Conteúdo (sem alterações) ---
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');
            const styles = Array.from(doc.querySelectorAll('style'));
            const scripts = Array.from(doc.querySelectorAll('script'));
            const contentNodes = Array.from(doc.body.childNodes);
            contentNodes.forEach(node => {
                 if (node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
                     contentPanel.appendChild(node.cloneNode(true));
                 }
            });
            styles.forEach(style => { 
                 const newStyle = document.createElement('style');
                 newStyle.textContent = style.textContent;
                 document.head.appendChild(newStyle);
             });
            scripts.forEach(script => { 

                 const newScript = document.createElement('script');
                 newScript.textContent = script.textContent; 
                 document.body.appendChild(newScript); 
             });

            if (pageName === 'warpanel') {
                initializeWarPanelListeners(); 
                if(window.appSocket) window.appSocket.emit('war:getData', { dateRange: 'today' });
            }

            if (pageName === 'bosses') { 
                 if(window.appSocket) window.appSocket.emit('bosses:getData');
             }
            if (pageName === 'respawns' && window.cachedRespawnData) { 
                 updateRespawnTable(window.cachedRespawnData.fila, window.cachedRespawnData.respawns);
             }
            if (pageName === 'friends') { 
                 setTimeout(() => { if (typeof initializeFriendsPage === 'function') { initializeFriendsPage(window.appSocket); } }, 50);
             }

            document.querySelectorAll('.main-nav .nav-link.active').forEach(link => link.classList.remove('active'));
            const activeLink = document.querySelector(`.main-nav .nav-link[data-page="${pageName}"]`);
            if (activeLink) { activeLink.classList.add('active'); }
            else { const toolsBtn = document.getElementById('tools-dropdown-btn'); if (toolsBtn) toolsBtn.classList.add('active'); }

            await minDelay;
            if (loader) {
                loader.classList.add('loader-hidden');
            }

            return; 

        } catch (error) {
            lastError = error;
            console.warn(`Tentativa ${attempt} falhou para ${pageName}.`, error);
            if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }

    console.error(`Erro ao carregar ${pageName} após ${maxRetries} tentativas:`, lastError);
    contentPanel.innerHTML = `<div style="text-align: center; padding: 50px;"><h2 style="color: var(--danger-color);">Erro ao Carregar</h2><p>${lastError.message}</p><button onclick="loadPage('${pageName}')" class="action-btn">Tentar Novamente</button></div>`;
    await minDelay;
    if (loader) {
        loader.classList.add('loader-hidden');
    }
}


function updateRespawnTable(fila, allRespawnNames) {
    const respawnTableBody = document.getElementById('respawn-table-body');
    const updateTimeEl = document.getElementById('update-time');
    const searchInput = document.getElementById('respawn-search-input');
    if (!respawnTableBody || !updateTimeEl) return;
    const now = new Date();
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const formatMinutesToHHMM = (minutes) => {
        if (isNaN(minutes) || minutes < 0) return "00:00";
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    if (!fila || typeof fila !== 'object' || Object.keys(fila).length === 0) {
        respawnTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Atualizando cache, Aguarde...</td></tr>';
        if (updateTimeEl) updateTimeEl.innerText = `Atualizado: ${now.toLocaleTimeString()}`;
        return;
    }

    const rowsData = Object.entries(fila).map(([code, entry]) => ({
        ...entry,
        code,
        name: allRespawnNames[code.toUpperCase()] || "Desconhecido"
    }))
        .filter(entry =>
            entry.name.toLowerCase().includes(searchTerm) ||
            entry.code.toLowerCase().includes(searchTerm) ||
            (entry.current?.clientNickname || '').toLowerCase().includes(searchTerm) ||
            (entry.current?.makerName || '').toLowerCase().includes(searchTerm)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    if (rowsData.length === 0) {
        respawnTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum respawn encontrado com este filtro.</td></tr>';
        return;
    }

    respawnTableBody.innerHTML = rowsData.map(entry => {
        const { code, name } = entry;
        const current = entry.current;
        const queue = entry.queue || [];

        const isOwner = current?.clientNickname === window.activeCharacterName;
        const isInQueue = queue.some(u => u?.clientNickname === window.activeCharacterName);
        const highlightClass = (isOwner || isInQueue) ? 'user-highlight' :
            '';

        let tempoText;
        if (entry.paused) {
            const remainingOnPause = formatMinutesToHHMM(Math.ceil((entry.remainingTimeOnPause || 0) / 60000));
            tempoText = `<span class="paused-indicator">PAUSADO (${remainingOnPause})</span>`;
        } else if (entry.waitingForAccept) {
            tempoText = `<span class="red">Aguardando aceite...</span>`;
        } else {
            const endTime = new Date(entry.endTime);
            if (!entry.endTime || isNaN(endTime.getTime())) {
                tempoText = `<span class="red">Tempo inválido</span>`;
            } else {
                const remaining = Math.floor((endTime - now) / 60000);
                const displayRemaining = Math.max(0, remaining);

                const totalTimeFormatted = formatMinutesToHHMM(current?.allocatedTime || 0);
                const timeDetailsJson = JSON.stringify(current || {});

                tempoText = `
                    <span class="red">${formatMinutesToHHMM(displayRemaining)}</span> /
                    <a href="#" class="time-breakdown-link" data-user-details='${timeDetailsJson}'>
                        ${totalTimeFormatted}
                    </a>
                `;
            }
        }

        const renderPlayerName = (user) => {
            if (!user || !user.clientNickname) return 'Ninguém';
            const isAdmin = window.isAdmin;
            const plusStar = (user.plusExpiresAt && new Date(user.plusExpiresAt) > now) ? '<span class="plus-star" title="Usuário Plus">⭐</span>' : '';
            const streamIcon = (user.streamLink) ? ` <a href="${user.streamLink}" target="_blank" title="Assistir ao Vivo" class="stream-icon"><i class="fab fa-twitch"></i></a>` : '';
            
            let onlineIndicator = '';
            if (!user.isOnline) {
                onlineIndicator = '<span class="status-dot offline" title="Offline"></span>';
            }
            
            let kickButtonHtml = '';
            if (isAdmin) {
                const userToKick = user.isPlanilhado ? (user.groupLeader || user.clientNickname) : user.clientNickname;
                const isPlanilhadoData = user.isPlanilhado ? 'data-is-planilhado="true"' : '';
                kickButtonHtml = `<button title="Remover" class="respawn-action-btn admin-kick-btn" data-respawn-code="${code}" data-user-to-kick="${userToKick}" ${isPlanilhadoData}>❌</button>`;
            }

            if (user.isPlanilhado) {
                const groupDetailsJson = JSON.stringify(user.groupMembers || []);
                const leaderName = user.groupLeader || user.clientNickname;
                return `${onlineIndicator}<span style="color: lightblue;">Planilhado </span><a href="#" class="planilhado-group-link" data-group-details='${groupDetailsJson}'><span style="color: white;">${leaderName}</span></a> ${kickButtonHtml}`;
            } else if (user.isMakerHunt && user.makerName) {
                let makerOnlineIndicator = '';
                if (!user.isMakerOnline) {
                    makerOnlineIndicator = '<span class="status-dot offline" title="Maker Offline"></span>';
                }
                const mainCharHidden = `<span class="hidden-main-char-icon" title="Maker de: ${user.clientNickname}">&#128100;</span>`; 

                return `${plusStar} ${makerOnlineIndicator} <a href="#" class="character-log-link" data-character-name="${user.makerName}">${user.makerName}</a> ${mainCharHidden} ${kickButtonHtml}`;
            }

            return `${plusStar}${onlineIndicator}<a href="#" class="character-log-link" data-character-name="${user.clientNickname}">${user.clientNickname}</a>${streamIcon} ${kickButtonHtml}`;
        };

        const characterLink = renderPlayerName(current);
        let nextsContent = 'Nenhum';
        if (queue.length > 0) {
            const fullQueueItems = queue.map((p, i) => `<div class="queue-item">${i + 1}. ${renderPlayerName(p)}</div>`).join('');
            
            nextsContent = `
                <div class="nexts-container">
                    <button class="queue-expand-button" title="Clique para expandir/recolher a fila">Next (${queue.length})</button>
                    <div class="full-queue-list">
                        ${fullQueueItems}
                    </div>
                </div>
            `;
        }

        const respawnLink = window.isAdmin ?
            `<a href="#" class="respawn-log-link" data-respawn-code="${code}">${name}</a>` : name;
        let actionContent = '';
        if (isOwner || isInQueue || (current?.isPlanilhado && current?.groupMembers?.some(member => member.name.toLowerCase() === window.activeCharacterName.toLowerCase()))) {
            actionContent += `<button class="action-btn leave-respawn-btn" data-respawn-code="${code}">Sair</button>`;
        }
        if (window.isAdmin && current) {
            actionContent += entry.paused ?
                `<button title="Despausar" class="respawn-action-btn unpause" data-respawn-code="${code}">▶️</button>` : `<button title="Pausar" class="respawn-action-btn pause" data-respawn-code="${code}">⏸️</button>`;
        }

        return `<tr class="${highlightClass}">
            <td data-label="Respawn"><span class="code">[${code.toUpperCase()}]</span> ${respawnLink}</td>
            <td data-label="Tempo">${tempoText}</td>
            <td data-label="Ocupado por">${characterLink}</td>
            <td data-label="Nexts">${nextsContent}</td>
            <td data-label="Ações">${actionContent}</td>
         </tr>`;
    }).join('');
    if (updateTimeEl) updateTimeEl.innerText = `Atualizado: ${now.toLocaleTimeString()}`;
}

document.addEventListener('change', (e) => {
    // Verifica se o evento veio dos botões de rádio do painel de guerra
    if (e.target.name === 'warDateRange') {
        const selectedRange = e.target.value;
        console.log(`[WAR PANEL] Filtro de data alterado para: ${selectedRange}`);
        // Exibe "Carregando..." enquanto os novos dados são buscados
        const rangeDisplay = document.getElementById('war-selected-range');
        if(rangeDisplay) rangeDisplay.textContent = 'Carregando...';
        // Solicita os dados filtrados ao servidor
        window.appSocket.emit('war:getData', { dateRange: selectedRange });
    }
});

function moveChatTo(targetId) {
    const chatLog = document.getElementById('chat-log');
    const commandForm = document.getElementById('command-form');
    const target = document.getElementById(targetId);
    
    if (chatLog && commandForm && target) {
        target.appendChild(chatLog);
        target.appendChild(commandForm);
    }
}

// Lógica de Inicialização e Persistência
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('bot-exclusive-overlay');
    const token = localStorage.getItem('sessionToken');

    if (token) {
        // Se já tem token, oculta overlay e mantém chat no lugar original
        overlay.style.display = 'none';
        moveChatTo('original-chat-container');
    } else {
        // Se não tem login, move chat para a overlay
        overlay.style.display = 'flex';
        moveChatTo('chat-placeholder');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    let isFirstConnect = true; // Variável de controle

    window.appSocket = io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
    });

    document.dispatchEvent(new Event('socketReady'));

    window.appSocket.on('connect', () => {
        if (isFirstConnect) {
            // Lógica para a primeira conexão
            isFirstConnect = false;
            const now = new Date();
            const clientTime = {
                timestamp: now.toISOString(),
                timezoneOffset: now.getTimezoneOffset()
            };
            window.appSocket.emit('user:time_info', clientTime);
        } else {
            // Se não for a primeira conexão, é uma reconexão.
            // Força o recarregamento da página.
            window.location.reload();
        }

const globalFilterInput = document.getElementById('global-war-filter-input');
    const applyFilterBtn = document.getElementById('apply-war-filter-btn');
    const clearFilterBtn = document.getElementById('clear-war-filter-btn');
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');

    if (editUserModal) {
        const closeBtn = editUserModal.querySelector('.modal-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => editUserModal.classList.remove('show'));
        
        // Listener para o formulário de salvar
        if (editUserForm) {
            editUserForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const originalEmail = document.getElementById('edit-original-email').value;
                const name = document.getElementById('edit-user-name').value;
                const email = document.getElementById('edit-user-email').value;
                const phone = document.getElementById('edit-user-phone').value;

                window.appSocket.emit('admin:updateUser', {
                    originalEmail,
                    name,
                    email,
                    phone
                });
                editUserModal.classList.remove('show');
            });
        }
    }

    // Adicionar listener para o botão de editar na delegação de eventos do adminModal
    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            // ... outros listeners existentes (delete, view details) ...

            // Novo Listener: Editar Usuário
            const editBtn = e.target.closest('.edit-user-btn');
            if (editBtn) {
                const email = editBtn.dataset.email;
                // Pede os detalhes completos para preencher o formulário
                window.appSocket.emit('admin:getUserDetails', email);
                
                // Precisamos de um listener temporário única vez para receber os dados e abrir o modal
                // ou usamos o listener global 'admin:userDetailsResponse' e verificamos se o modal de edição deve abrir.
                // Abordagem simplificada: Vamos interceptar a resposta global.
                window.isEditingUser = true; // Flag global temporária
            }
        });
    }

    window.appSocket.on('warmode:status', (isActive) => {
    const warModeIndicator = document.getElementById('war-mode-indicator'); // Crie esse elemento no HTML se quiser visual
    if (isActive) {
        addLogMessage('Sistema', '⚠️ MODO DE GUERRA ATIVO. Acesso restrito.', 'warning');
        // Se estiver em uma página restrita, recarrega para limpar ou redireciona
        const restrictedPages = ['respawns', 'friends', 'planilhado'];
        const activePage = document.querySelector('.nav-link.active')?.dataset.page;
        if (restrictedPages.includes(activePage)) {
            loadPage('home'); // Redireciona para home ou refresh
        }
    } else {
        addLogMessage('Sistema', 'Modo de Guerra desativado.', 'info');
    }
});

    // Modificar o listener existente 'admin:userDetailsResponse' para suportar edição
    window.appSocket.on('admin:userDetailsResponse', (details) => {
        if (window.isEditingUser) {
            // Se a flag estiver ativa, abrimos o modal de edição em vez do de detalhes
            const modal = document.getElementById('edit-user-modal');
            if (modal) {
                document.getElementById('edit-original-email').value = details.email;
                document.getElementById('edit-user-name').value = details.name;
                document.getElementById('edit-user-email').value = details.email;
                document.getElementById('edit-user-phone').value = details.phone !== 'Não cadastrado' ? details.phone : '';
                
                modal.classList.add('show');
            }
            window.isEditingUser = false; // Reseta a flag
        } else {
            // Comportamento padrão (exibir modal de detalhes visualização)
            const modal = document.getElementById('user-details-modal');
            // ... (código existente de preencher modal de detalhes) ...
            if (modal) modal.classList.add('show');
        }
    });

    // Listener para o botão "Filtrar"
    if (applyFilterBtn) {
        console.log("DEBUG: Anexando listener ao botão Filtrar."); // Log para depuração
        applyFilterBtn.addEventListener('click', () => {
            console.log("DEBUG: Botão Filtrar CLICADO."); // Log para depuração
            if (typeof filterWarPanelContent === 'function') {
                filterWarPanelContent();
            } else {
                console.error("ERRO: Função filterWarPanelContent não definida ao clicar em Filtrar.");
            }
        });
    } else {
        console.error("ERRO: Botão Filtrar (#apply-war-filter-btn) não encontrado.");
    }

    // Listener para o botão "Limpar"
    if (clearFilterBtn && globalFilterInput) {
        console.log("DEBUG: Anexando listener ao botão Limpar."); // Log para depuração
        clearFilterBtn.addEventListener('click', () => {
            console.log("DEBUG: Botão Limpar CLICADO."); // Log para depuração
            globalFilterInput.value = ''; // Limpa o input
            if (typeof filterWarPanelContent === 'function') {
                filterWarPanelContent(); // Chama o filtro com input vazio
            } else {
                 console.error("ERRO: Função filterWarPanelContent não definida ao clicar em Limpar.");
            }
        });
    } else {
        if(!clearFilterBtn) console.error("ERRO: Botão Limpar (#clear-war-filter-btn) não encontrado.");
        if(!globalFilterInput) console.error("ERRO: Input Global (#global-war-filter-input) não encontrado para o botão Limpar.");
    }

    // Listener Opcional de 'Enter'
    if (globalFilterInput) {
        console.log("DEBUG: Anexando listener 'keypress' ao input global."); // Log para depuração
        globalFilterInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                console.log("DEBUG: Enter pressionado no filtro."); // Log para depuração
                event.preventDefault();
                if (typeof filterWarPanelContent === 'function') {
                    filterWarPanelContent();
                } else {
                     console.error("ERRO: Função filterWarPanelContent não definida ao pressionar Enter.");
                }
            }
        });
    }
    });

    window.isAdmin = false;
    let commandHistory = [];
    let historyIndex = -1;
    window.activeCharacterName = '';

    let allUsers = {};
    let allGroups = [];
    let allRespawns = {};
    let allRespawnGroups = {};
    let allCooldowns = {};
    let respawnTimes = {};
    let allPlanilhadoRespawns = [];
    let allPlanilhadoDoubleRespawns = [];
    let selectedGroupId = null;
    let selectedUserId = null;
    let selectedCharacterName = null;
    let selectedRespawnCode = null;
    let allRankRestrictions = {};


    function getCurrentHHMM() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
    }
    
    window.cachedRespawnData = { fila: {}, respawns: {} };

    const beepSound = new Audio('beep.mp3'); // Som Padrão (notificações, sucesso)
    beepSound.volume = 1;

    const bossSound = new Audio('boss.mp3'); // Som para Alertas de Boss
    bossSound.volume = 1;

    const levelupSound = new Audio('levelup.mp3'); // Som para Level Up
    levelupSound.volume = 1;
    
    const respawnSound = new Audio('resp.mp3'); // Som para 'Sua vez no Respawn'
    respawnSound.volume = 1;

    const alertSound = new Audio('hunted.mp3'); // Som para Hunted, Inimigo Online ou Morte
    alertSound.volume = 1;

    const expireSound = new Audio('expire.mp3'); // Som para Fim de Tempo do Respawn
    expireSound.volume = 1;

    window.cachedRespawnData = { fila: {}, respawns: {} };

        window.appSocket.on('system:force_disconnect', (message) => {
            alert(message);
            // Opcional: desabilitar a interface na aba antiga
            document.body.style.opacity = '0.5';
            document.body.style.pointerEvents = 'none';
        });

        window.appSocket.on('system:blocked', ({ duration }) => {
            document.body.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: #1a1a1d; color: #c3073f; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: sans-serif;">
                    <h1 style="font-size: 3em; color: #dc3545;">ACESSO TEMPORARIAMENTE BLOQUEADO</h1>
                    <p style="font-size: 1.2em; color: #f0f0f0;">O sistema recebeu multiplas conexções em um curto período, o sistema de segurança bloqueou temporáriamente novas conexões para evitar a queda dos serviços.</p>
                    <p style="font-size: 1.2em; color: #f0f0f0;">Seu acesso será restaurado em aproximadamente <strong>${duration} minuto(s)</strong>.</p>
                    <p style="font-size: 0.8em; color: #888; margin-top: 50px;">Esta é uma medida de segurança para proteger o serviço.</p>
                </div>
            `;
        });

        window.appSocket.on('admin:userDetailsResponse', (details) => {
            const modal = document.getElementById('user-details-modal');
            const modalTitle = document.getElementById('details-modal-title');
            const modalBody = document.getElementById('details-modal-body');

            if (!modal || !modalTitle || !modalBody) return;

            modalTitle.textContent = `Detalhes de ${details.name}`;

            const charactersHtml = details.tibiaCharacters.map(char => 
                `<li>
                    <strong>${char.characterName}</strong> (Level: ${char.level}, Voc: ${char.vocation}, Rank: ${char.guildRank})
                </li>`
            ).join('');

            modalBody.innerHTML = `
                <p><strong>Nome Completo:</strong> ${details.name}</p>
                <p><strong>Email:</strong> ${details.email}</p>
                <p><strong>Telefone:</strong> ${details.phone}</p>
                <h4>Personagens Registrados:</h4>
                <ul>${charactersHtml || '<li>Nenhum personagem registrado.</li>'}</ul>
            `;

            modal.classList.add('show');
        });

        const userDetailsModal = document.getElementById('user-details-modal');
        if (userDetailsModal) {
            const closeBtn = userDetailsModal.querySelector('.modal-close-btn');
            closeBtn.addEventListener('click', () => userDetailsModal.classList.remove('show'));
            userDetailsModal.addEventListener('click', (e) => {
                if (e.target === userDetailsModal) {
                    userDetailsModal.classList.remove('show');
                }
            });
        }


    // CACHE PARA OS DADOS DOS BOSSES
    window.cachedBossesData = null;
    
    const alertedBosses = new Set(); // Armazena bosses já alertados para evitar spam

    
setInterval(() => {
    const bossAlertCheckbox = document.getElementById('boss-alert-checkbox');
    const soundEnabledCheckbox = document.getElementById('sound-enabled-checkbox');

    if (!bossAlertCheckbox || !bossAlertCheckbox.checked || !window.cachedBossesData) {
        return;
    }
    
    const now = new Date();
    const THIRTY_MINUTES_IN_MS = 1800000;

    // Filtra bosses de ALTA CHANCE que não foram checados nos últimos 30 minutos (ou nunca foram checados)
    const bossesToAlert = window.cachedBossesData.bossList.filter(boss => {
        const isHighChance = boss.chance === 'Alta Chance';
        if (!isHighChance) {
            return false;
        }
        
        // Retorna true se o boss não tiver um check ou se o último check for mais antigo que 30 minutos
        const needsCheck = !boss.lastCheck || (now - new Date(boss.lastCheck.timestamp)) > THIRTY_MINUTES_IN_MS;
        return needsCheck;
    });

    // Se houver bosses que precisam de atenção, envia a notificação de status
    if (bossesToAlert.length > 0) {
        const bossNames = bossesToAlert.map(b => b.name);
        const message = `[b]STATUS DE BOSSES:[/b] Os seguintes bosses de chance alta precisam ser checados (sem check nos últimos 30 min): [b]${bossNames.join(', ')}[/b].`;
        addLogMessage('Sistema', message, 'bot');
        
        if (soundEnabledCheckbox.checked) {
            bossSound.play().catch(e => console.error("Erro ao tocar som de alerta de boss:", e)); 
        }
    }
}, 600000); // Executa a verificação a cada 10 minutos


// Função para painel de guerra

const warToggle = document.getElementById('toggle-war-module');
if (warToggle) {
    warToggle.addEventListener('change', () => {
        const isChecked = warToggle.checked;
        window.appSocket.emit('war:toggle', isChecked);
        
        if (isChecked) {
            addLogMessage('Bot', '⚔️ Alerta de Mortes ON. Você será notificado sobre mortes de aliados, inimigos e hunteds.', 'bot');
        } else {
            addLogMessage('Bot', '🛡️ Alerta de Mortes OFF. Notificações de mortes desativadas.', 'bot');
        }
    });
}

// Função auxiliar para criar o nome do arquivo a partir do nome do boss (versão corrigida)
const generateFilename = (bossName) => {
    if (!bossName) return 'unknown.gif';

    // 1. Extrai o nome base (remove o sufixo de localização, ex: " (Sul Camp)")
    const match = bossName.match(/^(.*?)\s\(/);
    const baseName = match ? match[1].trim() : bossName;

    // 2. Aplica a higienização padrão ao nome base
    return baseName
        .toLowerCase()
        // 1. Remove especificamente as entidades HTML para apóstrofo (&#x27; e &apos;)
        .replace(/&(?:#x27|apos);/g, '')
        // 2. Remove apóstrofos literais restantes (segurança extra)
        .replace(/'/g, '')
        // 3. Substitui outros caracteres inválidos (espaços, hífens, etc.) por underscore
        .replace(/[^a-z0-9_]+/g, '_')
        // 4. Remove underscores duplicados
        .replace(/_+/g, '_')
        // 5. Adiciona a extensão .gif
        + '.gif';
};

    // LISTENER PARA ATUALIZAÇÃO DOS DADOS
window.appSocket.on('bosses:dataUpdated', (data) => {
    console.log("[DEBUG] Evento 'bosses:dataUpdated' recebido."); // LOG 1: Confirma recebimento

    // LOG 2: Verifica o objeto de dados completo recebido
    if (!data) {
        console.error("[DEBUG] Erro: Objeto 'data' recebido é nulo ou indefinido.");
        // Opcional: Mostrar uma mensagem de erro na interface
        const listContainer = document.getElementById('boss-list-container');
        if (listContainer) listContainer.innerHTML = '<p style="color: red;">Erro: Não foi possível carregar os dados dos bosses do servidor.</p>';
        return; // Interrompe se não há dados
    }

    // LOG 3: Verifica especificamente a lista de bosses dentro dos dados
    if (!data.bossList || !Array.isArray(data.bossList)) {
        console.error("[DEBUG] Erro: 'data.bossList' não é um array válido ou está ausente.", data.bossList);
        // Opcional: Mostrar mensagem de erro
         const listContainer = document.getElementById('boss-list-container');
         if (listContainer) listContainer.innerHTML = '<p style="color: red;">Erro: Dados da lista de bosses inválidos recebidos do servidor.</p>';
        return; // Interrompe se a lista é inválida
    }

    console.log(`[DEBUG] Recebido ${data.bossList.length} bosses na lista.`); // LOG 4: Mostra quantos bosses foram recebidos

    window.cachedBossesData = data; // Armazena no cache (se necessário)

    const mainContent = document.getElementById('main-content-panel');
    // Verifica se estamos na página correta antes de tentar renderizar
    if (mainContent && mainContent.querySelector('#boss-list-container')) {
        console.log("[DEBUG] Chamando renderBossesPage..."); // LOG 5: Confirma que vai tentar renderizar
        try {
            renderBossesPage(data); // Chama a função de renderização
            console.log("[DEBUG] renderBossesPage concluída."); // LOG 6: Confirma que a renderização (aparentemente) terminou sem travar
        } catch (renderError) {
            console.error("[DEBUG] Erro CRÍTICO durante a execução de renderBossesPage:", renderError);
            // Mostra um erro na interface se a renderização falhar
            const listContainer = document.getElementById('boss-list-container');
            if(listContainer) listContainer.innerHTML = `<p style="color: red;">Erro fatal ao tentar exibir a lista de bosses: ${renderError.message}</p>`;
        }
    } else {
        console.log("[DEBUG] Não está na página de bosses, renderização adiada."); // LOG 7: Informa se não tentou renderizar
    }
});

    // FUNÇÃO PARA CALCULAR TEMPO RELATIVO
    function timeSince(date) {
        if (!date) return '';
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " anos atrás";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " meses atrás";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " dias atrás";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " horas atrás";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " min atrás";
        return Math.floor(seconds) + " seg atrás";
    }

window.appSocket.on('war:statusUpdate', (isActive) => {
    const warToggle = document.getElementById('toggle-war-module');
    if (warToggle) {
        warToggle.checked = isActive;
        // Adicionar feedback visual se necessário (ex: mudar cor do label)
    }
});

window.appSocket.on('war:dataUpdated', (data) => {
    console.log('Recebido war:dataUpdated:', JSON.stringify(data, null, 2));

    // Verifica um elemento específico que SÓ existe DEPOIS que warpanel.html for carregado
    // Por exemplo, a seção de filtros ou a primeira aba
    const specificWarPanelElement = document.getElementById('filter-toggle-section') || document.getElementById('war-panel-deaths-kills');
if (specificWarPanelElement) {
        try {
            renderWarPanelPage(data);
            // Aplica o filtro atual aos novos dados
            if (typeof filterWarPanelContent === 'function') filterWarPanelContent();
        } catch (renderError){
             console.error("[WAR PANEL] Erro CRÍTICO durante render/filter:", renderError);
             // Tenta encontrar o container para exibir o erro
             const container = document.querySelector('.war-panel-container');
             if (container) container.innerHTML = `<p style="color: red;">Erro ao renderizar dados: ${renderError.message}</p>`;
        }
    } else {
        // Opcional: Log para indicar que os dados chegaram mas a página não está pronta
        // console.log("[WAR PANEL] 'war:dataUpdated' recebido, mas conteúdo do warpanel ainda não carregado.");
    }
});


function renderBossesPage(data) {
    const killedContainer = document.getElementById('killed-yesterday-container');
    const listContainer = document.getElementById('boss-list-container');
    const searchInput = document.getElementById('boss-search-input');
    const checkRankingBody = document.getElementById('check-ranking-body');
    const foundRankingBody = document.getElementById('found-ranking-body');

    if (!killedContainer || !listContainer || !checkRankingBody || !foundRankingBody) {
        console.error("Erro: Um ou mais containers da página de bosses não foram encontrados.");
        return;
    }

    if (data && data.checkRanking) {
        checkRankingBody.innerHTML = data.checkRanking.map((player, index) => `
        <tr>
            <td>${index + 1}º</td>
            <td><a href="#" class="checker-history-link" data-checker="${player.name}">${player.name}</a></td>
            <td>${player.count}</td>
        </tr>`).join('');
    } else {
        checkRankingBody.innerHTML = '<tr><td colspan="3">Nenhum dado de ranking de checks.</td></tr>';
    }

    if (data && data.foundRanking) {
        foundRankingBody.innerHTML = data.foundRanking.map((player, index) => `
        <tr>
            <td>${index + 1}º</td>
            <td><a href="#" class="finder-history-link" data-finder="${player.name}">${player.name}</a></td>
            <td>${player.count}</td>
        </tr>`).join('');
    } else {
        foundRankingBody.innerHTML = '<tr><td colspan="3">Nenhum dado de ranking de encontrados.</td></tr>';
    }


    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (data && data.killedYesterday) {
        killedContainer.innerHTML = data.killedYesterday.map(boss => {
            const bossName = boss && boss.name ? boss.name : 'Nome Desconhecido';
            const filename = generateFilename(bossName); 
     
            return `
                <div class="boss-card">
                    <img src="https://static.tibia-statistic.com/images/monsters/${filename}" alt="${bossName}">
                    <p>${bossName}</p>
                </div>`;
        }).join('');
    } else {
        killedContainer.innerHTML = '<p>Nenhum boss registrado ontem.</p>';
    }

    const formatDateToDDMMAAAA = (dateString) => {
        if (!dateString || !dateString.includes('-')) return dateString;
        const datePart = dateString.split(' ')[0];
        const [year, month, day] = datePart.split('-');
        if (year && month && day && year.length === 4) return `${day}-${month}-${year}`;
        return dateString;
    };
    const filteredList = (data && data.bossList ? data.bossList : []).filter(boss => boss && boss.name && typeof boss.name === 'string' && boss.name.toLowerCase().includes(searchTerm));
    
const categories = {
        "Alta Chance": [], "Chance Média": [], "Baixa Chance": [], "Sem Chance": [],
    };

    filteredList.forEach(boss => {
        if (!boss || !boss.chance) return; 
        
        // Lógica atualizada para capturar "NoChance"
        if (boss.chance === "NoChance") {
            categories["Sem Chance"].push(boss);
        }
        else if (boss.chance === "Sem Previsão") {
            categories["Alta Chance"].push(boss);
        } 
        else if (categories[boss.chance]) {
            categories[boss.chance].push(boss);
        }
    });


    const parseDateForSort = (predictedDate) => {
        if (!predictedDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return today;
        }
        const datePart = predictedDate.split(' ')[0];
        const [year, month, day] = datePart.split('-');
        if (year && month && day && year.length === 4) {
            return new Date(year, month - 1, day);
        }
        return new Date(8640000000000000);
    };

    const renderBossItem = (boss) => {
        if (!boss || !boss.name || typeof boss.name !== 'string') {
             console.error("Tentativa de renderizar um boss inválido:", boss);
             return '<div class="boss-list-item error">Erro ao carregar dados deste boss.</div>'; 
        }
        try {
            const foundClass = boss.isFoundToday ? 'found-today' : '';
            const worldChangeClass = boss.chance === 'Sem Previsão' ? 'world-change-boss' : '';
            const formattedLastSeen = formatDateToDDMMAAAA(boss.lastSeen || '');
            const bossName = boss.name;
            const bossFilename = generateFilename(bossName); 
            const wikiLink = createWikiLink(bossName);
            const timeAgoText = timeAgo(formattedLastSeen);

            let eventHtml = 'Nenhum check registrado';
            if (boss.isFoundToday && boss.foundBy && boss.foundAt) {
                const foundDate = new Date(boss.foundAt);
                if (!isNaN(foundDate)) {
                    const hours = String(foundDate.getHours()).padStart(2, '0');
                    const minutes = String(foundDate.getMinutes()).padStart(2, '0');
                    eventHtml = `Encontrado por ${boss.foundBy} às ${hours}:${minutes}`;
                } else {
                    eventHtml = `Encontrado por ${boss.foundBy} (horário inválido)`;
                }
            } else if (boss.lastCheck && boss.lastCheck.timestamp && boss.lastCheck.checker) {
                try { 
                    eventHtml = `Último check: ${timeSince(boss.lastCheck.timestamp)} por ${boss.lastCheck.checker}`;
                } catch (timeSinceError) {
                    console.error("Erro na função timeSince:", timeSinceError, "Timestamp:", boss.lastCheck.timestamp);
                    eventHtml = `Último check por ${boss.lastCheck.checker} (tempo N/A)`;
                }
            }

            return `
                <div class="boss-list-item ${foundClass} ${worldChangeClass}">
                    <img src="https://static.tibia-statistic.com/images/monsters/${bossFilename}" alt="${bossName}">
                    <div class="boss-list-info">
     
                         <div>
                            <a href="#" class="boss-history-link boss-name" data-boss="${bossName}">${bossName}<a href="${wikiLink}" target="_blank" class="details-link">(Detalhes da Wiki)</a></a>
                            ${boss.pct > 0 ? `<span class="boss-percentage">(${boss.pct}%)</span>` : ''}
                        </div>
                        <p class="last-seen">Última aparição: ${formattedLastSeen} <span style="color: #a9a9a9; font-style: italic;">${timeAgoText}</span></p>
                        ${boss.predictedDate ? `<p class="predicted-date">Chance de aparecer: ${formatDateToDDMMAAAA(boss.predictedDate)}</p>` : `<p class="predicted-date">Possivél Chance de aparecer Hoje</p>`}
                    </div>
                    <div class="last-check-info">
                        ${eventHtml}
                    </div>
     
                     <button class="action-btn check-btn" data-boss="${bossName}">Check</button>
                    <button class="action-btn found-btn" data-boss="${bossName}">Encontrado</button>
                </div>
            `;
        } catch (renderError) {
            console.error("Erro ao renderizar item do boss:", bossName, renderError);
            return `<div class="boss-list-item error">Erro ao carregar dados para ${bossName || 'boss desconhecido'}.</div>`;
        }
    };

    listContainer.innerHTML = Object.entries(categories).map(([categoryName, bosses]) => {
        if (!bosses || bosses.length === 0) return '';

        bosses.sort((a, b) => {
             if (!a || !a.name) return 1;
             if (!b || !b.name) return -1;
             const dateA = parseDateForSort(a.predictedDate);
             const dateB = parseDateForSort(b.predictedDate);
       
              if (isNaN(dateA) && !isNaN(dateB)) return 1;
             if (!isNaN(dateA) && isNaN(dateB)) return -1;
             if (!isNaN(dateA) && !isNaN(dateB) && dateA.getTime() !== dateB.getTime()) {
                 return dateA - dateB;
             }
             return a.name.localeCompare(b.name);
        });

        let categoryHeader = `<h2 class="category-title">${categoryName}</h2>`;
        if (categoryName === "Alta Chance") {
             categoryHeader = `
                <div class="category-header-flex">
                    <h2 class="category-title">${categoryName}</h2>
                    <label class="checkbox-control">
                     
                     <input type="checkbox" id="ocultar-wc-bosses-chk">
                        Ocultar bosses de WorldChange
                    </label>
                </div>
                <p style="font-size: 0.8em; color: var(--text-color-secondary); margin-top: -5px; margin-bottom: 10px; font-style: italic;">Alguns bosses dependem de world change 
ou podem ser forçados a aparecer, selecione a caixinha acima para ocultar esses bosses.</p>`;
        }

        return `
            <div class="boss-category">
                ${categoryHeader}
                ${Array.isArray(bosses) ? bosses.map(renderBossItem).join('') : ''}
            </div>
        `;
    }).join('');

    try {
        const shouldHideWC = localStorage.getItem('bosses_hide_wc') === 'true';
        const toggleCheckbox = document.getElementById('ocultar-wc-bosses-chk');
        
        if (toggleCheckbox) {
            toggleCheckbox.checked = shouldHideWC;
            
            const categoryContainer = toggleCheckbox.closest('.boss-category');
            if (categoryContainer) {
                categoryContainer.classList.toggle('hide-wc-bosses', shouldHideWC);
            }
        }
    } catch (err) {
        console.warn("Não foi possível ler a preferência do localStorage.", err);
    }
}

document.getElementById('main-content-panel').addEventListener('change', e => {
    const toggleCheckbox = e.target.closest('#ocultar-wc-bosses-chk');
    if (toggleCheckbox) {
        try {
            localStorage.setItem('bosses_hide_wc', toggleCheckbox.checked);
        } catch (err) {
            console.warn("Não foi possível salvar a preferência no localStorage.", err);
        }

        const categoryContainer = toggleCheckbox.closest('.boss-category');
        if (categoryContainer) {
            categoryContainer.classList.toggle('hide-wc-bosses', toggleCheckbox.checked);
        }
    
    }
});

document.getElementById('main-content-panel').addEventListener('click', e => {
    const toggleBtn = e.target.closest('#toggle-rankings-btn');
    if (toggleBtn) {
        const rankingsWrapper = document.getElementById('rankings-wrapper');
        if (rankingsWrapper) {
            const isHidden = rankingsWrapper.style.display === 'none' || rankingsWrapper.style.display === '';
            // A classe .ranking-container usa 'flex', então alternamos para 'flex' para exibir
            rankingsWrapper.style.display = isHidden ? 'flex' : 'none';
        }
    }
    const historyLink = e.target.closest('.boss-history-link');
    const checkerLink = e.target.closest('.checker-history-link');
    const finderLink = e.target.closest('.finder-history-link');
    const bossHistoryModal = document.getElementById('boss-history-modal'); // Certifique-se de que o modal está acessível

    // Se clicou no nome de um BOSS
    if (historyLink) {
        e.preventDefault();
        const bossName = historyLink.dataset.boss;
        if (bossName) {
            const modalTitle = document.getElementById('boss-history-title');
            const modalBody = document.getElementById('boss-history-body');
            modalTitle.textContent = `Carregando histórico para ${bossName}...`;
            modalBody.innerHTML = '<p>Buscando dados...</p>';
            bossHistoryModal.classList.add('show');
            window.appSocket.emit('bosses:getHistory', { bossName });
        }
    } 
    // Se clicou no nome de um JOGADOR no ranking de CHECKS
    else if (checkerLink) {
        e.preventDefault();
        const characterName = checkerLink.dataset.checker;
        if (characterName) {
            const modalTitle = document.getElementById('boss-history-title');
            const modalBody = document.getElementById('boss-history-body');
            modalTitle.textContent = `Carregando histórico de checks para ${characterName}...`;
            modalBody.innerHTML = '<p>Buscando dados...</p>';
            bossHistoryModal.classList.add('show');
            window.appSocket.emit('bosses:getCheckerHistory', { characterName });
        }
    } 
    // Se clicou no nome de um JOGADOR no ranking de ENCONTRADOS
    else if (finderLink) {
        e.preventDefault();
        const characterName = finderLink.dataset.finder;
        if (characterName) {
            const modalTitle = document.getElementById('boss-history-title');
            const modalBody = document.getElementById('boss-history-body');
            modalTitle.textContent = `Carregando bosses encontrados por ${characterName}...`;
            modalBody.innerHTML = '<p>Buscando dados...</p>';
            bossHistoryModal.classList.add('show');
            window.appSocket.emit('bosses:getFinderHistory', { characterName });
        }
    }
});

const createWikiLink = (bossName) => {
    if (!bossName) return '';

    // 1. Extrai o nome base (remove o sufixo de localização, ex: " (Sul Camp)")
    const match = bossName.match(/^(.*?)\s\(/);
    const baseName = match ? match[1].trim() : bossName;

    // 2. Usa o nome base para gerar o link da wiki
    const urlEncodedName = encodeURIComponent(baseName.replace(/ /g, '_'));
    return `https://www.tibiawiki.com.br/wiki/${urlEncodedName}`;
};

// Adicione este novo listener para receber os dados de bosses encontrados
window.appSocket.on('bosses:finderHistoryData', ({ characterName, history }) => {
    const modalTitle = document.getElementById('boss-history-title');
    const modalBody = document.getElementById('boss-history-body');

    modalTitle.textContent = `Bosses Encontrados por: ${characterName}`;

    if (!history || history.length === 0) {
        modalBody.innerHTML = '<p>Nenhum boss encontrado por este jogador.</p>';
        return;
    }

    let tableHtml = `
        <table class="table">
            <thead>
                <tr><th>Boss</th><th>Data</th><th>Detalhes</th></tr>
            </thead>
            <tbody>
                ${history.map(found => {
                    let details = '';
                    if (found.deathTime) details += `Hora Morte: ${found.deathTime}<br>`;
                    if (found.tokens) details += `Tokens: ${found.tokens}<br>`;
                    if (found.observation) details += `Obs: ${found.observation}`;
                    return `
                        <tr>
                            <td>${found.bossName}</td>
                            <td>${formatFullTimestamp(found.timestamp)}</td>
                            <td>${details || '-'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    modalBody.innerHTML = tableHtml;
});

window.appSocket.on('bosses:checkerHistoryData', ({ characterName, history }) => {
    const modalTitle = document.getElementById('boss-history-title');
    const modalBody = document.getElementById('boss-history-body');

    modalTitle.textContent = `Histórico de Checks: ${characterName}`;

    if (!history || history.length === 0) {
        modalBody.innerHTML = '<p>Nenhum check registrado para este jogador.</p>';
        return;
    }

    let tableHtml = `
        <table class="table">
            <thead>
                <tr><th>Boss</th><th>Data do Check</th></tr>
            </thead>
            <tbody>
                ${history.map(check => `
                    <tr>
                        <td>${check.bossName}</td>
                        <td>${formatFullTimestamp(check.timestamp)} (${timeSince(check.timestamp)})</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    modalBody.innerHTML = tableHtml;
});

document.getElementById('main-content-panel').addEventListener('click', e => {
    const checkButton = e.target.closest('.check-btn');
    if (checkButton) {
        const bossName = checkButton.dataset.boss;
        // Se o usuário ESTÁ logado
        if (window.currentUser) {
            window.appSocket.emit('bosses:check', { bossName });
        } else {
            // Se o usuário NÃO ESTÁ logado
            const characterName = prompt("Por favor, digite o nome do seu personagem para registrar o check:");
            if (characterName && characterName.trim() !== "") {
                // Envia um evento diferente para o servidor
                window.appSocket.emit('bosses:anonymousCheck', { bossName, characterName: characterName.trim() });
            }
        }
    }
});

    const bossHistoryModal = document.getElementById('boss-history-modal');
const closeHistoryModalBtn = bossHistoryModal.querySelector('.modal-close-btn');

// Listener para fechar o modal
closeHistoryModalBtn.addEventListener('click', () => bossHistoryModal.classList.remove('show'));
bossHistoryModal.addEventListener('click', (e) => {
    if (e.target === bossHistoryModal) {
        bossHistoryModal.classList.remove('show');
    }
});

// Listener para abrir o modal ao clicar no nome do boss
document.getElementById('main-content-panel').addEventListener('click', e => {
    const historyLink = e.target.closest('.boss-history-link');
    if (historyLink) {
        e.preventDefault();
        const bossName = historyLink.dataset.boss;
        if (bossName) {
            // Mostra um feedback de carregamento
            const modalTitle = document.getElementById('boss-history-title');
            const modalBody = document.getElementById('boss-history-body');
            modalTitle.textContent = `Carregando histórico para ${bossName}...`;
            modalBody.innerHTML = '<p>Buscando dados...</p>';
            bossHistoryModal.classList.add('show');

            // Pede os dados ao servidor
            window.appSocket.emit('bosses:getHistory', { bossName });
        }
    }
});

// Listener para receber os dados do servidor e popular o modal
window.appSocket.on('bosses:historyData', ({ bossName, history }) => {
    const modalTitle = document.getElementById('boss-history-title');
    const modalBody = document.getElementById('boss-history-body');
    modalTitle.textContent = `Histórico de: ${bossName}`;

    if (!history || history.length === 0) {
        modalBody.innerHTML = '<p>Nenhum evento registrado para este boss.</p>';
        return;
    }

    let tableHtml = `
        <table class="table">
            <thead>
                <tr><th>Evento</th><th>Data</th><th>Jogador</th><th>Detalhes</th></tr>
            </thead>
            <tbody>
                ${history.map(event => {
                    if (event.type === 'check') {
                        return `
                            <tr>
                                <td><span class="badge bg-secondary">Check</span></td>
                                <td>${formatFullTimestamp(event.timestamp)}</td>
                                <td>${event.checker}</td>
                                <td>-</td>
                            </tr>
                        `;
                    } else if (event.type === 'found') {
                        let details = '';
                        if (event.deathTime) details += `Hora Morte: ${event.deathTime}<br>`;
                        if (event.tokens) details += `Tokens: ${event.tokens}<br>`;
                        if (event.observation) details += `Obs: ${event.observation}`;
                        return `
                            <tr style="background-color: #28a74533;">
                                <td><span class="badge bg-success">Encontrado</span></td>
                                <td>${formatFullTimestamp(event.timestamp)}</td>
                                <td>${event.finder}</td>
                                <td>${details || '-'}</td>
                            </tr>
                        `;
                    }
                    return '';
                }).join('')}
            </tbody>
        </table>
    `;
    modalBody.innerHTML = tableHtml;
});

    const contentPanel = document.getElementById('main-content-panel');
    const topNavbar = document.getElementById('top-navbar');
    const navUserAccount = document.getElementById('nav-user-account');
    const navUserChar = document.getElementById('nav-user-char');
    const logoutBtn = document.getElementById('logout-btn');
    const userIdentityText = document.getElementById('user-identity-text');
    const changeNameBtn = document.getElementById('change-name-btn');
    const chatLog = document.getElementById('chat-log');
    const commandForm = document.getElementById('command-form');
    const commandInput = document.getElementById('command-input');
    const acceptRespawnBtn = document.getElementById('accept-respawn-btn');
    const openRespawnFinderBtn = document.getElementById('open-respawn-finder-btn');
    const respawnFinderModal = document.getElementById('respawn-finder-modal');
    const closeFinderModalBtn = respawnFinderModal ? respawnFinderModal.querySelector('.modal-close-btn') : null;
    const openAdminModalBtn = document.getElementById('open-admin-modal-btn');
    const adminModal = document.getElementById('admin-modal');
    const closeAdminBtn = adminModal ? adminModal.querySelector('.modal-close-btn') : null;
    const adminTabs = adminModal ? adminModal.querySelectorAll('.tab-btn') : null;
    const adminTabContents = adminModal ? adminModal.querySelectorAll('.tab-content') : null;
    const adminUserSearch = document.getElementById('admin-user-search');
    const adminUserList = document.getElementById('admin-user-list');
    const adminSelectedUserPanel = document.getElementById('admin-selected-user-panel');
    const selectedUserName = document.getElementById('selected-user-name');
    const userGroupsChecklist = document.getElementById('user-groups-checklist');
    const saveUserGroupsBtn = document.getElementById('save-user-groups-btn');
    const adminGroupList = document.getElementById('admin-group-list');
    const adminGroupForm = document.getElementById('admin-group-form');
    const groupIdInput = adminGroupForm ? document.getElementById('group-id-input') : null;
    const groupNameInput = adminGroupForm ? document.getElementById('group-name-input') : null;
    const groupTimeInput = adminGroupForm ? document.getElementById('group-time-input') : null;
    const clearGroupFormBtn = document.getElementById('clear-group-form-btn');
    const adminRespawnList = document.getElementById('admin-respawn-list');
    const adminSelectedRespawnPanel = document.getElementById('admin-selected-respawn-panel');
    const selectedRespawnName = document.getElementById('selected-respawn-name');
    const respawnGroupsChecklist = document.getElementById('respawn-groups-checklist');
    const adminTimesList = document.getElementById('admin-times-list');
    const saveTimesBtn = document.getElementById('save-times-btn');
    const adminPauseAllBtn = document.getElementById('admin-pause-all-btn');
    const adminUnpauseAllBtn = document.getElementById('admin-unpause-all-btn');
    const logModal = document.getElementById('log-modal');
    const logModalTitle = logModal ? document.getElementById('log-modal-title') : null;
    const logModalBody = logModal ? document.getElementById('log-modal-body') : null;
    const closeLogModalBtn = logModal ? logModal.querySelector('.modal-close-btn') : null;
    const soundEnabledCheckbox = document.getElementById('sound-enabled-checkbox');
    const alertEnabledCheckbox = document.getElementById('alert-enabled-checkbox');

    const savedToken = localStorage.getItem('sessionToken');
    if (savedToken) { window.appSocket.emit('user:authenticate_with_token', savedToken); }

    document.querySelectorAll('.main-nav .nav-link[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            const page = e.currentTarget.dataset.page;
            loadPage(page);
        });
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('.planilhado-group-link');
        if (link) {
            e.preventDefault();
            try {
                const groupMembers = JSON.parse(link.dataset.groupDetails);
                showPlanilhadoGroupModal(groupMembers);
            } catch (err) {
                console.error('Erro ao ler os detalhes do grupo planilhado:', err);
            }
        }
    });

    // Função para exibir o modal de detalhes do grupo planilhado
    function showPlanilhadoGroupModal(members) {
        const modal = document.getElementById('planilhado-group-modal');
        const modalBody = document.getElementById('planilhado-group-body');

        if (!modal || !modalBody || !members) {
            return;
        }

        let membersHtml = '<ul>';
        if (members.length === 0) {
            membersHtml += '<li>Nenhum membro encontrado neste grupo.</li>';
        } else {
            members.forEach(member => {
                const onlineIndicator = member.isOnline ? '<span class="status-dot online" title="Online"></span>' : '<span class="status-dot offline" title="Offline"></span>';
                membersHtml += `<li>
                                    ${onlineIndicator}
                                    <strong>${member.name}</strong> 
                                    (${member.level}, ${member.vocation}, Rank: ${member.guildRank})
                                </li>`;
            });
        }
        membersHtml += '</ul>';

        modalBody.innerHTML = membersHtml;
        modal.classList.add('show');
    }

    // Listener para fechar o modal de detalhes do grupo planilhado
    const planilhadoGroupModal = document.getElementById('planilhado-group-modal');
    if (planilhadoGroupModal) {
        const closeBtn = planilhadoGroupModal.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => planilhadoGroupModal.classList.remove('show'));
        }
        planilhadoGroupModal.addEventListener('click', (e) => {
            if (e.target === planilhadoGroupModal) {
                planilhadoGroupModal.classList.remove('show');
            }
        });
    }

    const cooldownsList = document.getElementById('admin-cooldowns-list');
    if (cooldownsList) {
        cooldownsList.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-cooldown-btn');
            if (removeBtn) {
                const userId = removeBtn.dataset.userIdentifier;
                if (userId && confirm(`Tem certeza que deseja remover o cooldown para ${userId}?`)) {
                     window.appSocket.emit('admin:removeCooldown', userId);
                }
            }
        });
    }

    const toolsDropdownBtn = document.getElementById('tools-dropdown-btn');
    const toolsDropdownMenu = document.getElementById('tools-dropdown-menu');
    const dropdownContainer = document.querySelector('.nav-dropdown-container');
    if(toolsDropdownBtn){
        toolsDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = dropdownContainer.classList.toggle('active');
            toolsDropdownMenu.style.display = isActive ? 'block' : 'none';
        });
    }

    if(toolsDropdownMenu){
        toolsDropdownMenu.addEventListener('click', (e) => {
            const target = e.target.closest('.nav-dropdown-item');
            if (target) {
                e.preventDefault();
                const page = target.dataset.page;

                if (page === 'quem_e_quem') {
                    window.appSocket.emit('qeq:checkAccess');
                } else {
                    loadPage(page);
                }

                dropdownContainer.classList.remove('active');
                 toolsDropdownMenu.style.display = 'none';
            }
        });
    }

    window.addEventListener('click', (e) => {
        if (dropdownContainer && !dropdownContainer.contains(e.target)) {
            dropdownContainer.classList.remove('active');
            toolsDropdownMenu.style.display = 'none';
        }
    });
    window.appSocket.on('qeq:accessResponse', ({ hasAccess, isAdmin }) => {
        window.qeqIsAdmin = isAdmin;
        if (hasAccess) {
            loadPage('quem_e_quem');
        } else {
            loadPage('quem_e_quem_acesso_negado');
        }
    });

    window.appSocket.on('admin:usersUpdate', (users) => {
        allUsers = users;
        if (adminModal && adminModal.classList.contains('show')) {
            renderAdminPanel();
        }
    });


    // 1. O temporizador, dentro do 'login:success'
    window.appSocket.on('login:success', (data) => {
        if (data.token) {
            localStorage.setItem('sessionToken', data.token);
        }
        window.currentUser = data; 
        window.appSocket.emit('user:get_initial_data');
        setupLoggedInUI(data.account, data.character);

        // Inicia o temporizador global
        window.appSocket.emit('friends:getData');
        if (window.friendsUpdateInterval) {
            clearInterval(window.friendsUpdateInterval);
        }
        window.friendsUpdateInterval = setInterval(() => {
            if (window.appSocket.connected) {
                window.appSocket.emit('friends:getData');
            }
        }, 60000); // 60 segundos
        
    });

    window.appSocket.on('login:success', (data) => {
    // 1. Grava o token para persistência após o reload
    if (data.token) { 
        localStorage.setItem('sessionToken', data.token); 
    }

    // 2. Mostra o botão de acesso na overlay
    const accessArea = document.getElementById('access-area');
    if (accessArea) {
        accessArea.style.display = 'block'; // Torna o botão visível
        
        // Opcional: Rolar o chat para baixo para garantir que o usuário veja o botão
        const chatLog = document.getElementById('chat-log');
        if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
    }

    addLogMessage('Bot', `Login bem-sucedido! Bem-vindo, ${data.character.characterName}.`, 'success');
});

    // 2. O listener que atualiza a navbar
   window.appSocket.on('friends:dataUpdated', (data) => {
        const navTextElement = document.getElementById('friends-nav-text');
        if (!navTextElement) {
            return;
        }

        const validData = data || {};

        // --- Contagem de Amigos (Allies) ---
        const onlineFriends = (Array.isArray(validData.players_allies))
            ? validData.players_allies.filter(p => p.online).length
            : 0;

        // --- Contagem TOTAL de Inimigos (Enemies + Hunteds) ---
        const onlineGuildEnemies = (Array.isArray(validData.players_enemies))
            ? validData.players_enemies.filter(p => p.online).length
            : 0;
            
        const onlineHunteds = (Array.isArray(validData.players_hunteds))
            ? validData.players_hunteds.filter(p => p.online).length
            : 0;
        
        const onlineEnemies = onlineGuildEnemies + onlineHunteds;

        if (onlineFriends > 0 || onlineEnemies > 0) {
            navTextElement.textContent = `Friends (${onlineFriends}) / Enemies (${onlineEnemies})`;
            navTextElement.style.color = '#ffc107'; 
        } else {
            navTextElement.textContent = 'Friends / Enemies';
            navTextElement.style.color = '';
        }

        const friendsPageButton = document.querySelector('.main-nav .nav-link[data-page="friends"]');
        if (friendsPageButton && friendsPageButton.classList.contains('active') && typeof window.renderFriendsPageContent === 'function') {
            window.renderFriendsPageContent(data);
        }
        // Função técnica para mover o chat entre containers
function relocateChat(destinationId) {
    const chatLog = document.getElementById('chat-log');
    const commandForm = document.getElementById('command-form');
    const target = document.getElementById(destinationId);
    
    if (chatLog && commandForm && target) {
        target.appendChild(chatLog);
        target.appendChild(commandForm);
    }
}

// Lógica de Verificação Inicial (Executa ao carregar a página)
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('sessionToken');
    const overlay = document.getElementById('bot-exclusive-overlay');

    if (token) {
        // Usuário já possui sessão: mantém chat no lugar original e oculta overlay
        overlay.style.display = 'none';
        relocateChat('original-chat-container');
    } else {
        // Sem sessão: move o chat para a overlay e exibe o bloqueio
        overlay.style.display = 'flex';
        relocateChat('chat-placeholder');
    }
});



    });

    window.appSocket.on('user:status', (status) => {
        window.isAdmin = status.isAdmin;
        if(openAdminModalBtn) openAdminModalBtn.style.display = window.isAdmin ? 'flex' : 'none';
    });

    window.appSocket.on('admin:dataUpdate', (data) => {
        allGroups = data.groups;
        allRespawns = data.respawns;
        allRespawnGroups = data.respawnGroups;
        respawnTimes = data.respawnTimes || {};
        allCooldowns = data.cooldowns || {};
        allPlanilhadoRespawns = data.planilhadoRespawns || [];
        allPlanilhadoDoubleRespawns = data.planilhadoDoubleRespawns || [];
        allRankRestrictions = data.respawnRankRestrictions || {};

        if (adminModal && adminModal.classList.contains('show')) {
            renderAdminPanel();
        }
    });

    window.appSocket.on('respawn:update', ({ fila, respawns }) => {
        window.cachedRespawnData = { fila, respawns };
        const respawnTableBody = document.getElementById('respawn-table-body');
        if (respawnTableBody) {
            updateRespawnTable(fila, respawns);
        }
    });
    window.appSocket.on('bot:response', (message) => addLogMessage('Bot', message, 'bot'));
    window.appSocket.on('command:echo', ({ sender, text }) => addLogMessage(sender, text, 'user'));
    window.appSocket.on('bot:mass_message', ({ sender, message }) => {
        addBroadcastMessage(sender, message);
    });

    window.appSocket.on('bot:private_message', ({ sender, message }) => {
        addLogMessage('Bot', message, 'bot'); 
        if (soundEnabledCheckbox.checked) {
            if (typeof message === 'string' && message.includes('acabou!')) {
                expireSound.play().catch(e => console.error("Erro ao tocar som de expiração:", e));
            } else {
                beepSound.play().catch(e => console.error("Erro ao tocar som de notificação:", e));
            }
        }
        if (alertEnabledCheckbox.checked) {
            alert(`[${getCurrentHHMM()}] MENSAGEM DO BOT:\n\n${message}`); // [MODIFICADO]
        }
    });

    window.appSocket.on('bot:warning_notification', ({ message }) => {
        addLogMessage('Bot', message, 'bot');
        if (soundEnabledCheckbox.checked) {
            respawnSound.play().catch(e => console.error("Erro ao tocar som de aviso:", e));
        }
        if (alertEnabledCheckbox.checked) {
            alert(`[${getCurrentHHMM()}] AVISO DO BOT:\n\n${message}`); // [MODIFICADO]
        }
    });

    window.appSocket.on('bot:success_notification', ({ message }) => {
        addLogMessage('Bot', message, 'bot');
        if (soundEnabledCheckbox.checked) {
            beepSound.play().catch(e => console.error("Erro ao tocar som de sucesso:", e));
        }
    });

    window.appSocket.on('bot:warning_notification', ({ message }) => {
        addLogMessage('Bot', message, 'bot');
        if (soundEnabledCheckbox.checked) {
            respawnSound.play().catch(e => console.error("Erro ao tocar som de aviso:", e)); 
        }
        if (alertEnabledCheckbox.checked) {
            alert(`AVISO DO BOT:\n\n${message}`);
        }
    });

    window.appSocket.on('bot:broadcast_notification', ({ type, message }) => {

    const isDeathAlert = message.includes('[MORTE ALLY]') ||
                         message.includes('[MORTE ENEMY]') ||
                         message.includes('[MORTE HUNTED]');

    const isLevelUpAlert = message.includes('[LEVEL UP ALLY]') ||
                           message.includes('[LEVEL UP ENEMY]') ||
                           message.includes('[LEVEL UP HUNTED]');

    const isBossAlert = message.includes('Boss encontrado por');

    const deathCheckbox = document.getElementById('toggle-war-module');
    const bossCheckbox = document.getElementById('boss-alert-checkbox');
    const generalAlertCheckbox = document.getElementById('alert-enabled-checkbox');
    
    const soundEnabledCheckbox = document.getElementById('sound-enabled-checkbox');
    if (soundEnabledCheckbox && soundEnabledCheckbox.checked) {
        if (isBossAlert) {
            bossSound.play().catch(e => console.error("Erro ao tocar som de boss:", e));
        
        } else if (isLevelUpAlert) {
            if (deathCheckbox && deathCheckbox.checked) {
                levelupSound.play().catch(e => console.error("Erro ao tocar som de level up:", e));
            }
        
        } else if (isDeathAlert) { 
            if (deathCheckbox && deathCheckbox.checked) {
                alertSound.play().catch(e => console.error("Erro ao tocar som de alerta (morte):", e)); 
            }
        } else {
            if (generalAlertCheckbox && generalAlertCheckbox.checked) {
                beepSound.play().catch(e => console.error("Erro ao tocar som de notificação:", e));
            }
        }
    }

    if (isDeathAlert || isLevelUpAlert) {
        if (deathCheckbox && deathCheckbox.checked) {
            addBroadcastMessage('SISTEMA', message, type);
        }
    } else if (isBossAlert) {
            addBroadcastMessage('SISTEMA', message, type);
    } else {
         if (generalAlertCheckbox && generalAlertCheckbox.checked) {
             addBroadcastMessage('SISTEMA', message, type);
         }
    }
});

    window.appSocket.on('admin:showLog', ({title, entries}) => showLogModal(title, entries));

    window.appSocket.on('data:initial_data_response', (data) => {
        if (data.groups) {
            allGroups = data.groups;
        }
        if (window.currentUser) {
            setupLoggedInUI(window.currentUser.account, window.currentUser.character);
        }
    });
    window.appSocket.on('bot:hunted_online', (hunted) => {
        showHuntedAlert(hunted);
    });

    window.appSocket.on('bot:enemy_online', (enemy) => {
        showEnemyAlert(enemy);
    });

    if(soundEnabledCheckbox) {  
        soundEnabledCheckbox.addEventListener('change', () => {
            if (soundEnabledCheckbox.checked) {
                beepSound.play().then(() => {
                    addLogMessage('Bot', 'Som ON', 'bot');
                }).catch(error => {
                     console.error("O navegador bloqueou a primeira tentativa de áudio:", error);
                    addLogMessage('Bot', 'Som ON (áudio bloqueado pelo navegador)', 'bot');
                });
            } else {
                addLogMessage('Bot', 'Som OFF', 'bot');
             }
        });
    }

    if(alertEnabledCheckbox) {
        alertEnabledCheckbox.addEventListener('change', () => {
            if (alertEnabledCheckbox.checked) {
                addLogMessage('Bot', 'Alerta ON', 'bot');
            } else {
                addLogMessage('Bot', 'Alerta OFF', 'bot');
            }
         });
    }

    const bossAlertCheckbox = document.getElementById('boss-alert-checkbox');
    if(bossAlertCheckbox) {
        bossAlertCheckbox.addEventListener('change', () => {
            if (bossAlertCheckbox.checked) {
                addLogMessage('Bot', "🔔 Alerta de Boss ON. Você será notificado sobre bosses de 'Alta Chance' que precisam ser checados (a cada 10 min).", 'bot');
            } else {
                addLogMessage('Bot', "🔕 Alerta de Boss OFF. Você não receberá mais notificações sobre bosses que precisam ser checados. (Alertas de bosses encontrados continuarão aparecendo).", 'bot');
            }
        });
    }

    if(commandForm) {
        
        commandForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const command = commandInput.value.trim();
            if (command) {
                window.appSocket.emit('user:command', command);
                commandHistory.unshift(command);
                 if (commandHistory.length > 50) {
                    commandHistory.pop();
                }
                historyIndex = -1;
                commandInput.value = '';
            }
         });
    }

    if(commandInput) {
        commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    commandInput.value = commandHistory[historyIndex];
                }
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (historyIndex > -1) {
                    historyIndex--;
                    commandInput.value = (historyIndex === -1) ? '' : commandHistory[historyIndex];
                }
            }
        });
    }

    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            const token = localStorage.getItem('sessionToken');
            window.appSocket.emit('user:command', `!logout ${token}`);
            localStorage.removeItem('sessionToken');
            window.location.reload();
        });
    }

    if(changeNameBtn) {
        changeNameBtn.addEventListener('click', () => {
            window.appSocket.emit('user:command', '!startchangechar');
        });
    }

    if(acceptRespawnBtn) {
        acceptRespawnBtn.addEventListener('click', () => {
            window.appSocket.emit('user:command', '!aceitar');
        });
    }

    if(openRespawnFinderBtn && respawnFinderModal) {
        openRespawnFinderBtn.addEventListener('click', () => {
            respawnFinderModal.classList.add('show');
        });
    }

    if(respawnFinderModal) {
        const closeFinderModalBtn = respawnFinderModal.querySelector('.modal-close-btn');
        if(closeFinderModalBtn) {
            closeFinderModalBtn.addEventListener('click', () => {
                respawnFinderModal.classList.remove('show');
            });
        }
        respawnFinderModal.addEventListener('click', (e) => {
            if (e.target === respawnFinderModal) {
                respawnFinderModal.classList.remove('show');
            }
        });
    }

    if(chatLog) {
        chatLog.addEventListener('click', (e) => {
            const btn = e.target.closest('.chat-action-btn');
            if (btn) {
                const cmd = btn.dataset.command;
                if (cmd) {
                   window.appSocket.emit('user:command', cmd);
                    btn.closest('.chat-action-container').querySelectorAll('.chat-action-btn').forEach(b => {
                        b.disabled = true;
                        b.textContent = "Enviado!";
                    });
                 }
            }
        });
    }
    contentPanel.addEventListener('input', (e) => {
    if (e.target.id === 'respawn-search-input') {
        if(window.cachedRespawnData) {
            updateRespawnTable(window.cachedRespawnData.fila, window.cachedRespawnData.respawns);
        }
    }
    if (e.target.id === 'boss-search-input' && window.cachedBossesData) {
            renderBossesPage(window.cachedBossesData); // Chama a renderização/filtragem
        }
    const toggleChatBtn = document.getElementById('toggle-chat-btn');
    const chatPanel = document.querySelector('.chat-section');

    if (toggleChatBtn && chatPanel) {
        toggleChatBtn.addEventListener('click', () => {
            chatPanel.classList.toggle('visible');
        });
    }
});

contentPanel.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;
    const button = target.closest('button');

    // Botão "Sair" de um respawn normal
    if (button?.classList.contains('leave-respawn-btn')) {
        const code = button.dataset.respawnCode;
        if (code) window.appSocket.emit('user:command', `!respdel ${code}`);
    }
    // Lógica UNIFICADA para o botão "Kick" (incluindo planilhado)
    else if (button?.classList.contains('admin-kick-btn')) {
        const respawnCode = button.dataset.respawnCode;
        const userToKick = button.dataset.userToKick; // Pode ser o nome do player ou do líder planilhado
        const isPlanilhado = button.dataset.isPlanilhado === 'true'; // Verifica o novo atributo

        let confirmMessage;
        let commandToEmit;

        if (isPlanilhado) {
            confirmMessage = `Tem certeza que deseja remover o grupo planilhado de ${userToKick} do respawn ${respawnCode.toUpperCase()}? (O agendamento na planilha será mantido.)`;
            commandToEmit = `!planilhadoremove ${respawnCode} ${userToKick}`;
        } else {
            confirmMessage = `Remover "${userToKick}" de ${respawnCode.toUpperCase()}?`;
            commandToEmit = { event: 'admin:kickUser', data: { respawnCode, userToKick } }; // Objeto para evento direto
        }

        if (confirm(confirmMessage)) {
            if (typeof commandToEmit === 'string') { // Se for um comando de texto para o bot
                window.appSocket.emit('user:command', commandToEmit);
            } else { // Se for um evento direto do socket
                window.appSocket.emit(commandToEmit.event, commandToEmit.data);
            }
        }
    }
    // Botão de Pause/Unpause (admin)
    else if (button?.classList.contains('respawn-action-btn') && (button.classList.contains('pause') || button.classList.contains('unpause'))) {
        const respawnCode = button.dataset.respawnCode;
        const isToPause = button.classList.contains('pause');
        window.appSocket.emit('admin:pauseRespawn', { respawnCode, isPaused: isToPause });
    }
    // Lógica para expandir/recolher a fila
    else if (target.closest('.queue-expand-btn')) {
        const expandButton = target.closest('.queue-expand-btn');
        const queueList = expandButton.nextElementSibling;
        if (queueList?.classList.contains('full-queue-list')) {
            const isShowing = queueList.classList.contains('show');
            document.querySelectorAll('.full-queue-list.show').forEach(list => list.classList.remove('show'));
            if (!isShowing) {
                queueList.classList.add('show');
            }
        }
    }
    // Lógica para links de log (se for admin)
    else if (window.isAdmin && target.closest('.respawn-log-link')) {
        e.preventDefault();
        const respawnCode = target.closest('.respawn-log-link').dataset.respawnCode;
        window.appSocket.emit('admin:getRespawnLog', respawnCode);
    }

        // Lógica para expandir/recolher a fila
    else if (button?.classList.contains('queue-expand-button')) { // Alterado para buscar a nova classe do botão
        const expandButton = button; // O próprio botão é o expandButton
        const queueList = expandButton.nextElementSibling; // Isso pegará o div .full-queue-list
        if (queueList?.classList.contains('full-queue-list')) {
            const isShowing = queueList.classList.contains('show');
            document.querySelectorAll('.full-queue-list.show').forEach(list => list.classList.remove('show')); // Esconde outras listas
            if (!isShowing) {
                queueList.classList.add('show'); // Mostra a lista clicada
            }
        }
    }
    // Lógica para links de log de personagem (se for admin)
    else if (window.isAdmin && target.closest('.character-log-link')) {
        e.preventDefault();
        const characterName = target.closest('.character-log-link').dataset.characterName;
        window.appSocket.emit('admin:getCharacterLog', characterName);
    }
});

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nexts-container')) {
            document.querySelectorAll('.full-queue-list.show').forEach(list => list.classList.remove('show'));
        }
    });
if (openAdminModalBtn && adminModal) {
    openAdminModalBtn.addEventListener('click', () => {
        window.appSocket.emit('admin:getData');
        window.appSocket.emit('admin:getUsers');

        adminModal.classList.add('show');
    });
}

if (adminModal) {
    const closeAdminBtn = adminModal.querySelector('.modal-close-btn');
    if (closeAdminBtn) {
        closeAdminBtn.addEventListener('click', () => {
            adminModal.classList.remove('show');
        });
    }
    
    adminModal.addEventListener('click', (e) => {
        if (e.target === adminModal) {
                adminModal.classList.remove('show');
            }

            const detailsBtn = e.target.closest('.view-details-btn');
            if (detailsBtn) {   
                const userEmail = detailsBtn.dataset.email;
                if (userEmail) {
                    window.appSocket.emit('admin:getUserDetails', userEmail);
                }
            }

            // Lógica para selecionar um grupo da lista
            const groupItem = e.target.closest('.group-item');
            if (groupItem && groupItem.parentElement.id === 'admin-group-list' && !e.target.closest('.admin-action-btn')) {
                selectedGroupId = groupItem.dataset.groupId;
                renderAdminPanel();
            }

            // Lógica para o botão de remover usuário de um grupo
            const removeUserBtn = e.target.closest('.remove-user-from-group-btn');
            if (removeUserBtn) {
                const characterName = removeUserBtn.dataset.characterName;
                const groupId = removeUserBtn.dataset.groupId;
                if (confirm(`Tem certeza que deseja remover o grupo de "${characterName}"?`)) {
                    window.appSocket.emit('admin:removeUserFromGroup', { characterName, groupId });
                }
            }
        });

    adminModal.addEventListener('input', (e) => {
        if (e.target.id.includes('-search')) {
            renderAdminPanel();
        }
    });
}

    if(clearGroupFormBtn && adminGroupForm) {
        const groupIdInput = adminGroupForm.querySelector('#group-id-input');
        clearGroupFormBtn.addEventListener('click', () => {
            adminGroupForm.reset();
            if(groupIdInput) groupIdInput.value = '';
        });
    }

    if(adminPauseAllBtn) {
        adminPauseAllBtn.addEventListener('click', () => {
            if(confirm('Pausar TODOS os respawns ativos?')) {
                window.appSocket.emit('admin:pauseAll', true);
            }
        });
    }

    if(adminUnpauseAllBtn) {
        adminUnpauseAllBtn.addEventListener('click', () => {
            if(confirm('Despausar TODOS os respawns?')) {
                window.appSocket.emit('admin:pauseAll', false);
            }
        });
    }

    if (adminGroupForm) {
        adminGroupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const groupIdInput = adminGroupForm.querySelector('#group-id-input');
            const groupNameInput = adminGroupForm.querySelector('#group-name-input');
            const groupTimeInput = adminGroupForm.querySelector('#group-time-input');
            const groupData = {
                 id: groupIdInput.value || null,
                name: groupNameInput.value,
                extraTime: parseInt(groupTimeInput.value, 10)
            };
            window.appSocket.emit('admin:createOrUpdateGroup', groupData);
            adminGroupForm.reset();
            groupIdInput.value = '';
         });
    }

    if (saveUserGroupsBtn) {
        const userGroupsChecklist = document.getElementById('user-groups-checklist');
        saveUserGroupsBtn.addEventListener('click', () => {
            if (!selectedCharacterName || !userGroupsChecklist) return;
            const checkedCheckboxes = userGroupsChecklist.querySelectorAll('input[type="checkbox"]:checked');
            const selectedGroupIds = Array.from(checkedCheckboxes).map(cb => cb.dataset.groupId);
            window.appSocket.emit('admin:updateUserGroups', { characterName: selectedCharacterName, groups: selectedGroupIds });
            alert('Grupos do personagem salvos.');
        });
    }
    
    const saveRespawnOptionsBtn = document.getElementById('save-respawn-options-btn');
    if (saveRespawnOptionsBtn) {
        saveRespawnOptionsBtn.addEventListener('click', () => {
            if (!selectedRespawnCode) return;
            
            const respawnGroupsChecklist = document.getElementById('respawn-groups-checklist');
            const checkedGroupCheckboxes = respawnGroupsChecklist.querySelectorAll('input[type="checkbox"]:checked');
            const selectedGroupIds = Array.from(checkedGroupCheckboxes).map(cb => cb.dataset.groupId);
            window.appSocket.emit('admin:updateRespawnGroups', { respawnCode: selectedRespawnCode, groups: selectedGroupIds });
    
            const planilhadoCheckbox = document.getElementById('respawn-planilhado-chk');
            const planilhadoDoubleCheckbox = document.getElementById('respawn-planilhado-double-chk');
            const isNormal = planilhadoCheckbox.checked;
            const isDouble = planilhadoDoubleCheckbox.checked;
    
            let updatedNormal = [...allPlanilhadoRespawns];
            let updatedDouble = [...allPlanilhadoDoubleRespawns];
    
            if (isNormal && !updatedNormal.includes(selectedRespawnCode)) {
                updatedNormal.push(selectedRespawnCode);
            } else if (!isNormal) {
                updatedNormal = updatedNormal.filter(code => code !== selectedRespawnCode);
            }
    
            if (isDouble && !updatedDouble.includes(selectedRespawnCode)) {
                updatedDouble.push(selectedRespawnCode);
            } else if (!isDouble) {
                updatedDouble = updatedDouble.filter(code => code !== selectedRespawnCode);
            }
    
            window.appSocket.emit('admin:updatePlanilhadoRespawns', { normal: updatedNormal, double: updatedDouble });
            const respawnRanksChecklist = document.getElementById('respawn-ranks-checklist');
            const checkedRankCheckboxes = respawnRanksChecklist.querySelectorAll('input[type="checkbox"]:checked');
            const selectedRankNames = Array.from(checkedRankCheckboxes).map(cb => cb.dataset.rankName);

            window.appSocket.emit('admin:updateRespawnRankRestrictions', {
                respawnCode: selectedRespawnCode,
                restrictedRanks: selectedRankNames
            });

        });
    }

    if(saveTimesBtn) {
        const adminTimesList = document.getElementById('admin-times-list');
        saveTimesBtn.addEventListener('click', () => {
            if(!adminTimesList) return;
            const newTimesData = {};
            const inputs = adminTimesList.querySelectorAll('input[type="number"]');
            inputs.forEach(input => {
                const rank = input.dataset.rank;
                const time = parseInt(input.value, 10);
                 if (rank && !isNaN(time)) {
                    newTimesData[rank] = time;
                }
            });
            window.appSocket.emit('admin:updateRespawnTimes', newTimesData);
            alert('Tempos por rank salvos.');
         });
    }

    if (adminTabs) {
        adminTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const adminTabContents = adminModal.querySelectorAll('.tab-content');
                adminTabs.forEach(t => t.classList.remove('active'));
                adminTabContents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const content = document.getElementById(`tab-content-${tab.dataset.tab}`);
                if(content) content.classList.add('active');
            });
        });
    }

    if(logModal) {
        const closeLogModalBtn = logModal.querySelector('.modal-close-btn');
        if(closeLogModalBtn) closeLogModalBtn.addEventListener('click', () => logModal.classList.remove('show'));
        logModal.addEventListener('click', (e) => {
            if (e.target === logModal) {
                logModal.classList.remove('show');
            }
        });
    }

function setupLoggedInUI(account, character) {
    window.activeCharacterName = character ?
    character.characterName : '';
    if(navUserAccount) navUserAccount.textContent = account.name;
    if(navUserChar) {
        if (character && character.characterName) {
            let charDisplayHtml = '';
            if (character.plusExpiresAt && new Date(character.plusExpiresAt) > new Date()) {
                charDisplayHtml += `<span class="plus-star" title="Usuário Plus">⭐</span>`;
            }

            charDisplayHtml += window.activeCharacterName;
            if (character.streamLink) {
                charDisplayHtml += ` <a href="${character.streamLink}" target="_blank" title="Assistir ao Vivo" class="stream-icon"><i class="fab fa-twitch"></i></a>`;
            }

            let groupNames = [];
            if (character.groups && character.groups.length > 0 && allGroups && allGroups.length > 0) {
                groupNames = character.groups.map(groupId => {
                    const group = allGroups.find(g => g.id === groupId);
                    return group ? group.name : 
                    null;
                }).filter(name => name !== null);
            }

            const guildRank = character.guildRank ||
            'N/A';
            const details = [];

            if (groupNames.length > 0) {
                details.push(`Grupos: ${groupNames.join(', ')}`);
            }
            details.push(`Rank: ${guildRank}`);
            if (details.length > 0) {
                charDisplayHtml += ` <span class="char-details-nav">(${details.join(' | ')})</span>`;
            }

            navUserChar.innerHTML = charDisplayHtml;
        } else {
            navUserChar.innerHTML = 'Nenhum personagem';
        }
    }

    if(topNavbar) topNavbar.classList.add('visible');
    if(userIdentityText) userIdentityText.textContent = `Logado como: ${character ? character.characterName : 'N/A'}`;
    const activeCharContainer = document.querySelector('.active-char-container');
    if (activeCharContainer) {
        activeCharContainer.style.display = 'flex';
    }
}

function addLogMessage(sender, message, type) {
    if (!chatLog) return;
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = `[${timeString}] `;
    const entry = document.createElement('div');
    entry.classList.add('log-entry', type);

    entry.appendChild(timeSpan);

    const senderSpan = document.createElement('span');
    senderSpan.className = 'sender';
    senderSpan.textContent = `${sender}: `;
    entry.appendChild(senderSpan);

    if (typeof message === 'object' && message !== null && message.type === 'actionable_message') {
        const textSpan = document.createElement('span');
        textSpan.innerHTML = message.text.replace(/\n/g, '<br>').replace(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>');
        entry.appendChild(textSpan);
        const actions = message.actions || [];
        if (actions.length > 0) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'chat-action-container';
            buttonContainer.style.marginTop = '10px';
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '10px';
            actions.forEach(action => {
                const actionButton = document.createElement('button');
                actionButton.className = 'chat-action-btn';
                actionButton.textContent = action.buttonText;
                actionButton.setAttribute('data-command', action.command_to_run);
                buttonContainer.appendChild(actionButton);
            });
            entry.appendChild(buttonContainer);
        }
    } else {
        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        let messageText = (typeof message === 'object' && message !== null) ? JSON.stringify(message) : String(message);

        // Conversão de tags para HTML
messageText = messageText
    .replace(/\n/g, '<br>') // Mantém a quebra de linha padrão para outras mensagens
    .replace(/;/g, ';<br>') // Adiciona a nova regra para quebra de linha com ';'
    .replace(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>')
    .replace(/\[url=(.*?)\](.*?)\[\/url\]/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: white;">$2</a>');

        textSpan.innerHTML = messageText;

        entry.appendChild(textSpan);
        if (sender === 'Bot' && alertEnabledCheckbox.checked) {
            alert(`MENSAGEM DO BOT:\n\n${message}`);
        }
    }
    chatLog.appendChild(entry);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function addBroadcastMessage(sender, message, type = 'broadcast') {
    if (!chatLog) return;
    const timeString = getCurrentHHMM();

    // Formata a mensagem como antes
    let formattedMessage = String(message)
        .replace(/\n/g, '<br>')
        .replace(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>')
        .replace(/\[url=(.*?)\](.*?)\[\/url\]/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: white;">$2</a>');

    const entry = document.createElement('div');
    entry.classList.add('log-entry', 'broadcast'); // Classes base

    // --- INÍCIO DA MODIFICAÇÃO ---
    // Adiciona classe específica baseada no conteúdo da mensagem
    if (message.startsWith('[LEVEL UP ALLY]')) {
        entry.classList.add('levelup-ally'); // Nova classe para level up de aliado
    } else if (message.startsWith('[LEVEL UP ENEMY]') || message.startsWith('[LEVEL UP HUNTED]')) {
        entry.classList.add('levelup-other'); // Classe opcional para outros level ups (vermelho/amarelo)
    } else {
        // Mantém a classe original baseada no 'type' para outras notificações broadcast
        entry.classList.add(`broadcast-${type}`);
    }
    // --- FIM DA MODIFICAÇÃO ---

    // Define o conteúdo HTML
entry.innerHTML = `<span class="chat-time">[${timeString}] </span><span class="sender"><i class="fas fa-bullhorn"></i> ANÚNCIO DE ${sender.toUpperCase()}</span><span class="text">${formattedMessage}</span>`;
    chatLog.appendChild(entry);
    chatLog.scrollTop = chatLog.scrollHeight;

    const generalAlertCheckbox = document.getElementById('alert-enabled-checkbox');
    if (generalAlertCheckbox && generalAlertCheckbox.checked) {
        // Remove tags BBCode para o alerta simples
        const alertMessage = String(message)
            .replace(/\[b\]/g, '')
            .replace(/\[\/b\]/g, '')
            .replace(/\[url=.*?\]/g, '')
            .replace(/\[\/url\]/g, '');
        // Adiciona o horário ao popup
        alert(`[${timeString}] ANÚNCIO DE ${sender.toUpperCase()}:\n\n${alertMessage}`);
    }
}

    function showHuntedAlert(hunted) {
        if (alertEnabledCheckbox && alertEnabledCheckbox.checked) {
            alert(`[${getCurrentHHMM()}] ALERTA! O hunted ${hunted.name} (level ${hunted.level}) está online!`); // [MODIFICADO]
        }
        const message = `🚨 ALERTA! Hunted ${hunted.name} (level ${hunted.level}) está online! 🚨`;
        addBroadcastMessage('Sistema de Alerta', message, 'hunted');
        if (soundEnabledCheckbox && soundEnabledCheckbox.checked) {
            alertSound.play().catch(e => console.error("Erro ao tocar som de alerta:", e));
        }
    }

    function showEnemyAlert(enemy) {
        if (alertEnabledCheckbox && alertEnabledCheckbox.checked) {
            alert(`[${getCurrentHHMM()}] ALERTA! O inimigo ${enemy.name} (level ${enemy.level}) está online!`); // [MODIFICADO]
        }
        const message = `⚔️ ALERTA! Inimigo ${enemy.name} (level ${enemy.level}, ${enemy.vocation}) está online! ⚔️`;
        addBroadcastMessage('Sistema de Alerta', message, 'enemy');
        if (soundEnabledCheckbox && soundEnabledCheckbox.checked) {
            alertSound.play().catch(e => console.error("Erro ao tocar som de alerta:", e));
        }
    }

    function showLogModal(title, entries) {
        if(!logModal) return;
        const logModalTitle = logModal.querySelector('#log-modal-title');
        const logModalBody = logModal.querySelector('#log-modal-body');
        if(!logModalTitle || !logModalBody) return;
        logModalTitle.textContent = title;
        logModalBody.innerHTML = '';
        if (!entries || entries.length === 0) {
            logModalBody.innerHTML = '<p>Nenhum registro encontrado.</p>';
        } else {
            const table = document.createElement('table');
            table.className = 'log-table';
            let tableHtml = '<thead><tr><th>Data/Hora</th><th>Usuário/Respawn</th><th>Ação</th></tr></thead><tbody>';
            entries.forEach(entry => {
                const date = new Date(entry.timestamp);
                const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                const subject = entry.user || entry.respawn;
                tableHtml += `<tr><td>${formattedDate}</td><td>${subject}</td><td>${entry.action}</td></tr>`;
            
            });
            tableHtml += '</tbody>';
            table.innerHTML = tableHtml;
            logModalBody.appendChild(table);
        }
        logModal.classList.add('show');
    }

function renderAllUsersTab() {
    const usersListDiv = document.getElementById('admin-all-users-list');
    const searchInput = document.getElementById('admin-all-users-search');
    const rankFilter = document.getElementById('admin-all-users-rank-filter');

    if (!usersListDiv || !searchInput || !rankFilter) return;
    
    // 1. Popular o filtro de Ranks (apenas se as opções ainda não existirem ou se a lista mudou drasticamente)
    // Preservamos o valor selecionado atualmente
    const currentRankFilter = rankFilter.value;
    const uniqueRanks = new Set();
    Object.values(allUsers).forEach(acc => {
        uniqueRanks.add(acc.guildRank || 'N/A');
    });
    
    // Limpa e reconstrói apenas se o número de ranks mudar (simples otimização) ou se estiver vazio
    if (rankFilter.options.length <= 1) { 
        rankFilter.innerHTML = '<option value="">Todos os Ranks</option>';
        Array.from(uniqueRanks).sort().forEach(rank => {
            const option = document.createElement('option');
            option.value = rank;
            option.textContent = rank;
            rankFilter.appendChild(option);
        });
        rankFilter.value = currentRankFilter; // Restaura seleção
    }

    usersListDiv.innerHTML = '';
    const searchTerm = searchInput.value.toLowerCase();
    const selectedRank = rankFilter.value;

    const filteredUsers = Object.entries(allUsers).filter(([email, account]) => {
        const nameMatches = account.name.toLowerCase().includes(searchTerm) || 
                            (account.characterName && account.characterName.toLowerCase().includes(searchTerm)) ||
                            email.toLowerCase().includes(searchTerm);
        
        const rankMatches = selectedRank === "" || (account.guildRank || 'N/A') === selectedRank;

        return nameMatches && rankMatches;
    });

    if (filteredUsers.length === 0) {
        usersListDiv.innerHTML = '<p>Nenhum usuário encontrado.</p>';
        return;
    }

filteredUsers
        .sort(([, a], [, b]) => a.name.localeCompare(b.name)) 
        .forEach(([email, account]) => {
            const item = document.createElement('div');
            item.className = 'user-item-full';
            const charHtml = `<strong>${account.characterName || 'N/A'}</strong> (Rank: ${account.guildRank || 'N/A'})`;
            
            item.innerHTML = `
                <div class="user-info-full" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div style="flex-grow: 1;">
                        <strong>${account.name}</strong> <span style="font-size: 0.8em; color: #888;">(${email})</span>
                        <div class="user-chars-list" style="margin-top: 5px;">
                            <div class="char-details">${charHtml}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="action-btn edit-user-btn" data-email="${email}" title="Editar Dados">✏️</button>
                        <button class="action-btn view-details-btn" data-email="${email}">Detalhes</button>
                        <button class="action-btn danger-btn delete-user-btn" data-email="${email}" data-name="${account.name}" title="Deletar Usuário">🗑️</button>
                    </div>
                </div>
            `;
            usersListDiv.appendChild(item);
        });
}

// Adicionar listener para o filtro de rank no adminModal event listener
if (adminModal) {
    adminModal.addEventListener('change', (e) => { // Alterado de input para change para capturar o select
        if (e.target.id === 'admin-all-users-rank-filter') {
            renderAllUsersTab();
        }
    });
    
    // Listener para o botão de deletar usuário (delegação de evento)
    adminModal.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-user-btn');
        if (deleteBtn) {
            const email = deleteBtn.dataset.email;
            const name = deleteBtn.dataset.name;
            
            if (confirm(`⚠️ PERIGO: Tem certeza que deseja deletar PERMANENTEMENTE o usuário "${name}" (${email})?\n\nIsso removerá a conta e todos os personagens associados. Esta ação não pode ser desfeita.`)) {
                window.appSocket.emit('admin:deleteUser', email);
            }
        }
    });
}

function renderCooldownsTab() {
    const cooldownsListDiv = document.getElementById('admin-cooldowns-list');
    if (!cooldownsListDiv) return;

    cooldownsListDiv.innerHTML = '';
    const now = Date.now();
    const cooldownEntries = Object.entries(allCooldowns);

    if (cooldownEntries.length === 0) {
        cooldownsListDiv.innerHTML = '<p>Nenhum usuário em cooldown.</p>';
        return;
    }

    cooldownEntries.forEach(([userIdentifier, expiryTimestamp]) => {
        const remaining = Math.ceil((expiryTimestamp - now) / 60000);
        if (remaining <= 0) return;

        // --- LÓGICA CORRIGIDA AQUI ---
        let accountName = userIdentifier;
        let charName = 'N/A'; // Valor padrão
        
        const account = allUsers[userIdentifier];
        if (account) {
            accountName = account.name;
            // CORREÇÃO: Usar a propriedade 'characterName' que já existe,
            // em vez de tentar acessar 'tibiaCharacters'.
            charName = account.characterName || 'N/A'; 
        }
        // --- FIM DA CORREÇÃO ---

        const item = document.createElement('div');
        item.className = 'cooldown-item';
        item.innerHTML = `<div class="cooldown-info"><span><strong>${charName}</strong> (${accountName})</span><span class="cooldown-time"> Restam: ${remaining} minuto(s)</span></div><button class="action-btn danger-btn remove-cooldown-btn" data-user-identifier="${userIdentifier}">Remover</button>`;
        cooldownsListDiv.appendChild(item);
    });
}

function renderAdminPanel() {
    if (!adminModal || !adminModal.classList.contains('show')) return;
    renderUserList();
    renderGroupList();
    renderSelectedUserPanel();
    renderRespawnManagementPanel();
    renderSelectedRespawnPanel();
    renderTimesManagementPanel();
    renderAllUsersTab();
    renderCooldownsTab();
    renderSelectedGroupPanel();
    renderBatchGroupManagement();
}

function renderBatchGroupManagement() {
    const batchManagementDiv = document.getElementById('admin-batch-group-management');
    if (!batchManagementDiv) return;

    // Constrói a lista de grupos com checkboxes
    const groupListHtml = allGroups.map(group => `
        <div class="batch-group-item">
            <input type="checkbox" id="batch-group-chk-${group.id}" value="${group.id}">
            <label for="batch-group-chk-${group.id}">${group.name}</label>
        </div>
    `).join('');

    batchManagementDiv.innerHTML = `
        <div class="batch-panel">
            <h4>1. Digite a lista de Jogadores</h4>
            <p>Separe os nomes por vírgula ou por linha.</p>
            <textarea id="batch-player-list" rows="10" placeholder="Nome do Jogador 1, Nome do Jogador 2, ..."></textarea>
        </div>
        <div class="batch-panel">
            <h4>2. Selecione os Grupos</h4>
            <div id="batch-group-list" class="admin-list">
                ${groupListHtml}
            </div>
            <div class="batch-actions">
                <button class="action-btn success-btn" id="batch-add-groups-btn">Adicionar Grupos</button>
                <button class="action-btn danger-btn" id="batch-remove-groups-btn">Remover Grupos</button>
            </div>
        </div>
    `;

    // Adiciona listeners para os botões de ação
    document.getElementById('batch-add-groups-btn').addEventListener('click', () => handleBatchGroupUpdate('add'));
    document.getElementById('batch-remove-groups-btn').addEventListener('click', () => handleBatchGroupUpdate('remove'));
}

function handleBatchGroupUpdate(action) {
    const playerListText = document.getElementById('batch-player-list').value;
    // Processa a string de nomes, removendo espaços em branco e filtrando vazios
    const selectedUsers = playerListText.split(/,|\n/).map(name => name.trim()).filter(name => name.length > 0);

    const selectedGroups = Array.from(document.querySelectorAll('#batch-group-list input[type="checkbox"]:checked'))
        .map(input => input.value);

    if (selectedUsers.length === 0 || selectedGroups.length === 0) {
        alert('Por favor, digite os nomes dos jogadores e selecione pelo menos um grupo.');
        return;
    }

    const confirmMessage = action === 'add'
        ? `Tem certeza que deseja ADICIONAR os grupos selecionados a ${selectedUsers.length} jogador(es)?`
        : `Tem certeza que deseja REMOVER os grupos selecionados de ${selectedUsers.length} jogador(es)?`;

    if (confirm(confirmMessage)) {
        window.appSocket.emit('admin:updateMultipleUserGroups', {
            characterNames: selectedUsers,
            groupIds: selectedGroups,
            action: action
        });
        // Feedback visual e limpa a seleção
        alert('Solicitação enviada. As alterações serão aplicadas em breve.');
        document.getElementById('batch-player-list').value = '';
        document.querySelectorAll('#admin-batch-group-management input[type="checkbox"]').forEach(chk => chk.checked = false);
    }
}

function renderUserList() {
    const adminUserList = document.getElementById('admin-user-list');
    const adminUserSearch = document.getElementById('admin-user-search');
    if (!adminUserList || !adminUserSearch) return;

    adminUserList.innerHTML = '';
    const searchTerm = adminUserSearch.value.toLowerCase();
    
    Object.entries(allUsers)
        .filter(([email, account]) => 
            account.name.toLowerCase().includes(searchTerm) ||
            (account.characterName && account.characterName.toLowerCase().includes(searchTerm))
        )
        .sort(([, a], [, b]) => a.name.localeCompare(b.name))
        .forEach(([email, account]) => {
            const item = document.createElement('div');
            item.className = 'user-item';
            if (account.characterName === selectedCharacterName) item.classList.add('selected');
            item.dataset.characterName = account.characterName;
            
            const userGroups = account.groups || [];
            item.innerHTML = `<div class="user-info"><span>${account.name} (${account.characterName})</span><span class="user-rank">${account.guildRank || 'Sem Rank'}</span></div><div class="user-groups-pills">${userGroups.map(gid => { const group = allGroups.find(g => g.id === gid); return `<span class="group-pill">${group ? group.name : '??'}</span>`; }).join('')}</div>`;
            
            item.addEventListener('click', () => {
                selectedCharacterName = account.characterName;
                renderAdminPanel();
            });
            adminUserList.appendChild(item);
        });
}

function renderGroupList() {
    const adminGroupList = document.getElementById('admin-group-list');
    const adminGroupForm = document.getElementById('admin-group-form');
    if (!adminGroupList || !adminGroupForm) return;
    const groupIdInput = adminGroupForm.querySelector('#group-id-input');
    const groupNameInput = adminGroupForm.querySelector('#group-name-input');
    const groupTimeInput = adminGroupForm.querySelector('#group-time-input');
    adminGroupList.innerHTML = '';
    allGroups.sort((a, b) => a.name.localeCompare(b.name)).forEach(group => {
        const item = document.createElement('div');
        item.className = 'group-item';
        item.dataset.groupId = group.id;
        if (group.id === selectedGroupId) {
            item.classList.add('selected');
        }
        item.innerHTML = `
            <span>${group.name} (+${group.extraTime} min)</span>
            <div>
                <button class="admin-action-btn edit" title="Editar">✏️</button>
                <button class="admin-action-btn delete" title="Deletar">🗑️</button>
            </div>
        `;
        item.querySelector('.edit').addEventListener('click', () => {
            groupIdInput.value = group.id;
            groupNameInput.value = group.name;
            groupTimeInput.value = group.extraTime;
        });
        item.querySelector('.delete').addEventListener('click', () => {
            if (confirm(`Deletar o grupo "${group.name}"?`)) {
                window.appSocket.emit('admin:deleteGroup', group.id);
            }
        });
        adminGroupList.appendChild(item);
    });
}


function renderSelectedGroupPanel() {
    const selectedPanel = document.getElementById('admin-selected-group-panel');
    if (!selectedPanel) return;

    if (!selectedGroupId) {
        selectedPanel.style.display = 'none';
        return;
    }

    const selectedGroup = allGroups.find(g => g.id === selectedGroupId);
    if (!selectedGroup) {
        selectedPanel.style.display = 'none';
        return;
    }

    selectedPanel.style.display = 'block';

    const groupNameEl = document.getElementById('selected-group-name-details');
    const usersListEl = document.getElementById('admin-group-users-list');
    const respawnsListEl = document.getElementById('admin-group-respawns-list');

    if (!groupNameEl || !usersListEl || !respawnsListEl) return;

    groupNameEl.textContent = selectedGroup.name;

    usersListEl.innerHTML = '';
    const usersInGroup = Object.values(allUsers).filter(user =>
        user.groups && user.groups.includes(selectedGroupId)
    ).sort((a, b) => (a.characterName || '').localeCompare(b.characterName));

    if (usersInGroup.length === 0) {
        usersListEl.innerHTML = '<p>Nenhum usuário neste grupo.</p>';
    } else {
        usersInGroup.forEach(user => {
            const item = document.createElement('div');
            item.className = 'group-member-item'; 
            item.innerHTML = `
                <span>${user.characterName} (${user.name})</span>
                <button class="action-btn.success-btn danger-btn remove-user-from-group-btn" data-character-name="${user.characterName}" data-group-id="${selectedGroupId}">Remover</button>
            `;
            usersListEl.appendChild(item);
        });
    }

    respawnsListEl.innerHTML = '';
    const allRespawnsFlat = [];
    for (const region in allRespawns) {
        for (const code in allRespawns[region]) {
            allRespawnsFlat.push({ code, name: allRespawns[region][code], region });
        }
    }

    const respawnsInGroup = allRespawnsFlat.filter(r =>
        allRespawnGroups[r.code] && allRespawnGroups[r.code].includes(selectedGroupId)
    ).sort((a, b) => a.name.localeCompare(b.name));

    if (respawnsInGroup.length === 0) {
        respawnsListEl.innerHTML = '<p>Nenhum respawn requer este grupo.</p>';
    } else {
        respawnsInGroup.forEach(respawn => {
            const item = document.createElement('div');
            item.className = 'group-respawn-item'; // Classe para estilização
            item.innerHTML = `<span>${respawn.name} [${respawn.code}]</span>`;
            respawnsListEl.appendChild(item);
        });
    }
}


 function renderTimesManagementPanel() {
        const adminTimesListDiv = document.getElementById('admin-times-list');
        const searchInput = document.getElementById('admin-times-search');
        if (!adminTimesListDiv || !searchInput) return;
        
        adminTimesListDiv.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();
        const filteredRanks = Object.keys(respawnTimes)
            .filter(rank => rank.toLowerCase().includes(searchTerm));
        if (filteredRanks.length === 0) {
            adminTimesListDiv.innerHTML = '<p>Nenhum rank encontrado.</p>';
            return;
        }
        
        filteredRanks
            .sort((a, b) => (a === 'default') ? 1 : (b === 'default') ? -1 : a.localeCompare(b))
            .forEach(rank => {
                const time = respawnTimes[rank];
                const itemDiv = document.createElement('div');
                 itemDiv.className = 'admin-list-item time-item';
                itemDiv.innerHTML = `<label for="time-for-${rank}">${rank}</label><input type="number" id="time-for-${rank}" value="${time}" min="0" data-rank="${rank}">`;
                adminTimesListDiv.appendChild(itemDiv);
            });
    }

function renderSelectedUserPanel() {
    const adminSelectedUserPanel = document.getElementById('admin-selected-user-panel');
    if (!selectedCharacterName || !adminSelectedUserPanel) {
        if (adminSelectedUserPanel) adminSelectedUserPanel.style.display = 'none';
        return;
    }

    if (Object.keys(allUsers).length === 0) {
        return;
    }
    
    const userEntry = Object.entries(allUsers).find(([, account]) => account.characterName === selectedCharacterName);
    if (!userEntry) {
        adminSelectedUserPanel.style.display = 'none';
        return;
    }
    
    const [userEmail, userAccount] = userEntry;

    adminSelectedUserPanel.style.display = 'block';
    const selectedUserNameEl = document.getElementById('selected-user-name');
    
    if(selectedUserNameEl) {
        selectedUserNameEl.innerHTML = `${userAccount.name} (<a href="#" class="character-log-link" data-character-name="${userAccount.characterName}">${userAccount.characterName}</a>)`;
    }

    const userGroupsChecklist = document.getElementById('user-groups-checklist');
    if(!userGroupsChecklist) return;
    
    const currentUserGroupIds = new Set(userAccount.groups || []);
    userGroupsChecklist.innerHTML = '';
    
    if (allGroups.length === 0) {
        userGroupsChecklist.innerHTML = '<p>Nenhum grupo global criado.</p>';
    } else {
        allGroups.forEach(group => {
            const isChecked = currentUserGroupIds.has(group.id);
            const checkItem = document.createElement('div');
            checkItem.className = 'group-checklist-item';
            checkItem.innerHTML = `<input type="checkbox" id="user-group-chk-${group.id}" data-group-id="${group.id}" ${isChecked ? 'checked' : ''}><label for="user-group-chk-${group.id}">${group.name}</label>`;
            userGroupsChecklist.appendChild(checkItem);
        });
    }
}

function renderRespawnManagementPanel() {
        const adminRespawnList = document.getElementById('admin-respawn-list');
        const searchInput = document.getElementById('admin-respawn-search');
        if (!adminRespawnList || !searchInput) return;

        adminRespawnList.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();
        
        const allRespawnsFlat = [];
        for (const region in allRespawns) {
            for (const code in allRespawns[region]) {
                allRespawnsFlat.push({ code, name: allRespawns[region][code], region });
            }
        }
        
        const filteredRespawns = allRespawnsFlat
            .filter(r => r.name.toLowerCase().includes(searchTerm) || r.code.toLowerCase().includes(searchTerm))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (filteredRespawns.length === 0) {
            adminRespawnList.innerHTML = '<p>Nenhum respawn encontrado.</p>';
            return;
        }

        filteredRespawns.forEach(respawn => {
            const item = document.createElement('div');
            item.className = 'admin-respawn-item-action';
            if (respawn.code === selectedRespawnCode) item.classList.add('selected');
            item.innerHTML = `<div class="respawn-info-selectable" data-respawn-code="${respawn.code}"><span>${respawn.name}</span><span class="code">[${respawn.code}]</span></div><div class="respawn-actions"><button class="admin-action-btn edit-respawn" title="Editar" data-code="${respawn.code}" data-name="${respawn.name}" data-region="${respawn.region}">✏️</button><button class="admin-action-btn delete-respawn" title="Deletar" data-code="${respawn.code}" data-name="${respawn.name}">🗑️</button></div>`;
            item.querySelector('.respawn-info-selectable').addEventListener('click', () => 
            {
                selectedRespawnCode = respawn.code;
                document.getElementById('admin-respawn-form').reset();
                renderAdminPanel();
            });
            adminRespawnList.appendChild(item);
        });
    }

    function renderSelectedRespawnPanel() {
    const adminSelectedRespawnPanel = document.getElementById('admin-selected-respawn-panel');
    const selectedRespawnNameEl = document.getElementById('selected-respawn-name');
    const respawnGroupsChecklist = document.getElementById('respawn-groups-checklist');
    const planilhadoCheckbox = document.getElementById('respawn-planilhado-chk');
    const planilhadoDoubleCheckbox = document.getElementById('respawn-planilhado-double-chk');
    const respawnRanksChecklist = document.getElementById('respawn-ranks-checklist');
    if (!selectedRespawnCode || !adminSelectedRespawnPanel) {
        if (adminSelectedRespawnPanel) adminSelectedRespawnPanel.style.display = 'none';
        return;
    }
    adminSelectedRespawnPanel.style.display = 'block';
    
    let respawnName = 'Desconhecido';
    for (const region in allRespawns) {
        if (allRespawns[region][selectedRespawnCode]) {
            respawnName = allRespawns[region][selectedRespawnCode];
            break;
        }
    }
    
    if (selectedRespawnNameEl) {
        selectedRespawnNameEl.innerHTML = `${respawnName} <a href="#" class="respawn-log-link" data-respawn-code="${selectedRespawnCode}" title="Ver Log do Respawn"><i class="fas fa-history"></i></a>`;
    }

    if (!respawnGroupsChecklist || !planilhadoCheckbox || !planilhadoDoubleCheckbox || !respawnRanksChecklist) return;
    if (!respawnGroupsChecklist || !planilhadoCheckbox || !planilhadoDoubleCheckbox) return;

    planilhadoCheckbox.checked = allPlanilhadoRespawns.includes(selectedRespawnCode);
    planilhadoDoubleCheckbox.checked = allPlanilhadoDoubleRespawns.includes(selectedRespawnCode);

    const currentRespawnGroupIds = new Set(allRespawnGroups[selectedRespawnCode] || []);
    respawnGroupsChecklist.innerHTML = '';
    if (allGroups.length === 0) {
        respawnGroupsChecklist.innerHTML = '<p>Nenhum grupo global criado.</p>';
    } else {
        allGroups.forEach(group => {
            const isChecked = currentRespawnGroupIds.has(group.id);
            const checkItem = document.createElement('div');
            checkItem.className = 'group-checklist-item';
            checkItem.innerHTML = `<input type="checkbox" id="respawn-group-chk-${group.id}" data-group-id="${group.id}" ${isChecked ? 'checked' : ''}><label for="respawn-group-chk-${group.id}">${group.name}</label>`;
            respawnGroupsChecklist.appendChild(checkItem);
        });
    }
    respawnRanksChecklist.innerHTML = '';
    const allRanks = Object.keys(respawnTimes).sort((a, b) => (a === 'default') ? 1 : (b === 'default') ? -1 : a.localeCompare(b));
    const currentRestrictedRanks = new Set(allRankRestrictions[selectedRespawnCode] || []);

    if (allRanks.length === 0) {
        respawnRanksChecklist.innerHTML = '<p>Nenhum rank encontrado.</p>';
    } else {
        allRanks.forEach(rank => {
            if (rank === 'default') return;
            const isChecked = currentRestrictedRanks.has(rank);
            const checkItem = document.createElement('div');
            checkItem.className = 'group-checklist-item';
            checkItem.innerHTML = `<input type="checkbox" id="respawn-rank-chk-${rank}" data-rank-name="${rank}" ${isChecked ? 'checked' : ''}><label for="respawn-rank-chk-${rank}">${rank}</label>`;
            respawnRanksChecklist.appendChild(checkItem);
        });
    }
}

    function initializeRespawnFinder() {
        if(!respawnFinderModal) return;
        const cityFilter = respawnFinderModal.querySelector('#city-filter');
        const creatureSearchInput = respawnFinderModal.querySelector('#creature-search');
        if (!cityFilter || !creatureSearchInput) return;

        let respawnData = {};
        const cityRespawnsDiv = respawnFinderModal.querySelector('#city-respawns');
        const searchResultsDiv = respawnFinderModal.querySelector('#search-results');
        const allRespawnsDiv = respawnFinderModal.querySelector('#all-respawns');
        fetch('respawns.json').then(response => response.json()).then(data => {
            respawnData = data;
            populateCityFilter(data);
            displayAllRespawns(data);
        }).catch(error => console.error('Erro ao carregar respawns.json:', error));
        function populateCityFilter(data) {
            const sortedCities = Object.keys(data).sort();
            cityFilter.innerHTML = '<option value="">Todas as Cidades</option>';
            sortedCities.forEach(city => {
                const option = document.createElement('option');
                option.value = city;
                option.textContent = city;
                cityFilter.appendChild(option);
            });
        }

        function displayRespawnsInDiv(div, respawnsArray) {
            if(!div) return;
            div.innerHTML = '';
            if (respawnsArray.length === 0) {
                div.innerHTML = '<p>Nenhum respawn encontrado.</p>';
                return;
            }
            respawnsArray.sort((a, b) => a.name.localeCompare(b.name));
            respawnsArray.forEach(respawn => {
                const itemDiv = createRespawnItem(respawn.name, respawn.code);
                div.appendChild(itemDiv);
            });
        }

        function displayAllRespawns(data) {
            const allRespawnsArray = [];
            for (const city in data) {
                for (const code in data[city]) {
                    allRespawnsArray.push({ name: `${city} - ${data[city][code]}`, code: code });
                }
            }
            displayRespawnsInDiv(allRespawnsDiv, allRespawnsArray);
        }

        function createRespawnItem(name, code) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'respawn-item';
            itemDiv.innerHTML = `
                <span class="respawn-name">${name}</span>
                <span class="code">${code.toUpperCase()}</span>
                <button class="claim-respawn-modal-btn" data-code="${code}">Reservar</button>
            `;
            const claimButton = itemDiv.querySelector('.claim-respawn-modal-btn');
            claimButton.addEventListener('click', () => {
                const command = `!resp ${code}`;
                window.appSocket.emit('user:command', command);
                respawnFinderModal.classList.remove('show');
            });
            return itemDiv;
        }

        cityFilter.addEventListener('change', (event) => {
            const city = event.target.value;
            let respawns = [];
            if (city && respawnData[city]) {
                for (const code in respawnData[city]) {
                    
                    respawns.push({ name: respawnData[city][code], code: code });
                }
            }
            displayRespawnsInDiv(cityRespawnsDiv, respawns);
        });
        creatureSearchInput.addEventListener('input', (event) => {
            const searchTerm = event.target.value.toLowerCase();
            if (searchTerm.length < 2) {
                if(searchResultsDiv) searchResultsDiv.innerHTML = '<p>Digite pelo menos 2 caracteres.</p>';
                return;
            }
            let foundRespawns = [];
            for (const city in respawnData) {
                for (const code in respawnData[city]) {
                    if (respawnData[city][code].toLowerCase().includes(searchTerm)) {
                        foundRespawns.push({ name: `${city} - ${respawnData[city][code]}`, code: code });
                     }
                }
            }
            displayRespawnsInDiv(searchResultsDiv, foundRespawns);
        });
        if (adminModal) {
            adminModal.addEventListener('click', (e) => {
                const target = e.target;
                
                const editRespawnBtn = target.closest('.edit-respawn');
                if (editRespawnBtn) {
                    document.getElementById('respawn-code-input').value = editRespawnBtn.dataset.code;
                    document.getElementById('respawn-name-input').value = editRespawnBtn.dataset.name;
                    document.getElementById('respawn-region-input').value = editRespawnBtn.dataset.region;
                    return;
                }
                const deleteRespawnBtn = target.closest('.delete-respawn');
                if (deleteRespawnBtn) {
                    if (confirm(`DELETAR o respawn "${deleteRespawnBtn.dataset.name}"?`)) {
                        window.appSocket.emit('admin:deleteRespawn', deleteRespawnBtn.dataset.code);
                    }
                    return;
                }
    
                const removeCooldownBtn = target.closest('.remove-cooldown-btn');
                if (removeCooldownBtn) {
                    if (confirm(`Remover cooldown para ${removeCooldownBtn.dataset.userIdentifier}?`)) {
                        window.appSocket.emit('admin:removeCooldown', removeCooldownBtn.dataset.userIdentifier);
                    }
                    return;
                }
    
                const addRankBtn = target.closest('#add-rank-btn');
                if (addRankBtn) {
                    const nameInput = document.getElementById('new-rank-name-input');
                    const timeInput = document.getElementById('new-rank-time-input');
                    const rankName = nameInput.value.trim();
                    const rankTime = parseInt(timeInput.value, 10);
                    if (rankName && !isNaN(rankTime)) {
                        if (respawnTimes[rankName] !== undefined) {
                            alert('Este rank já existe.');
                            return;
                        }
                        respawnTimes[rankName] = rankTime;
                        renderTimesManagementPanel();
                        nameInput.value = '';
                    } else {
                        alert('Nome de rank ou tempo inválido.');
                    }
                    return;
                }
                if (adminModal) {
                    adminModal.addEventListener('click', (e) => {
                        // Lógica para o novo link de log do respawn no painel de admin
                        const respawnLogLink = e.target.closest('.respawn-log-link');
                        if (respawnLogLink) {
                            e.preventDefault();
                            const respawnCode = respawnLogLink.dataset.respawnCode;
                            window.appSocket.emit('admin:getRespawnLog', respawnCode);
                        }

                        // Lógica para o novo link de log do personagem no painel de admin
                        const charLogLink = e.target.closest('.character-log-link');
                        if (charLogLink) {
                            e.preventDefault();
                            const characterName = charLogLink.dataset.characterName;
                            window.appSocket.emit('admin:getCharacterLog', characterName);
                        }
                    });
                }
            });
    
            const respawnForm = document.getElementById('admin-respawn-form');
            if (respawnForm) {
                respawnForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const data = {
                        code: document.getElementById('respawn-code-input').value.toUpperCase().trim(),
                        name: document.getElementById('respawn-name-input').value.trim(),
                         region: document.getElementById('respawn-region-input').value.trim(),
                    };
                    if (!data.code || !data.name || !data.region) return alert('Todos os campos são obrigatórios.');
                    window.appSocket.emit('admin:createOrUpdateRespawn', data);
                    respawnForm.reset();
                 });
            }
        }
    }

    loadPage('respawns');
    initializeRespawnFinder();
});

function showTimeBreakdownModal(userDetails) {
    const modal = document.getElementById('time-breakdown-modal');
    const modalTitle = document.getElementById('time-breakdown-title');
    const modalBody = document.getElementById('time-breakdown-body');

    if (!modal || !modalTitle || !modalBody || !userDetails || !userDetails.entitledTime) {
        return;
    }
    
    const { total, breakdown } = userDetails.entitledTime;
    const { base, groups, calculated } = breakdown;
    
    modalTitle.textContent = `Detalhes do Tempo de ${userDetails.clientNickname}`;
    
    const formatMinutes = (min) => {
        if (isNaN(min)) return "0h 0min";
        return `${Math.floor(min / 60)}h ${min % 60}min`;
    };

    let descriptionHTML = `<p>Tempo Base (${base.name}): <strong>${formatMinutes(base.time)}</strong></p>`;
    
    if (groups && groups.length > 0) {
        descriptionHTML += '<p>Bônus de Grupos:</p><ul style="list-style-position: inside; padding-left: 10px;">';
        groups.forEach(g => {
            descriptionHTML += `<li>${g.name}: <strong>+${formatMinutes(g.time)}</strong></li>`;
        });
        descriptionHTML += '</ul>';
    }

    descriptionHTML += `<hr style="margin: 15px 0;">`;
    descriptionHTML += `<p>Soma (Base + Bônus): <strong>${formatMinutes(calculated)}</strong></p>`;

    if (calculated > total) {
        descriptionHTML += `<p style="color: #ffc107; font-size: 0.9em;">(Seu tempo foi limitado ao máximo de 3h 30min)</p>`;
    }
    
    descriptionHTML += `<h3 style="margin-top: 15px;">Tempo Total Permitido: <strong>${formatMinutes(total)}</strong></h3>`;

    modalBody.innerHTML = descriptionHTML;
    modal.classList.add('show');
}

// Listener para abrir o modal de detalhamento de tempo
document.addEventListener('click', (e) => {
    const link = e.target.closest('.time-breakdown-link');
    if (link) {
        e.preventDefault();
        try {
            const userDetails = JSON.parse(link.dataset.userDetails);
            showTimeBreakdownModal(userDetails);
        } catch (err) {
            console.error('Erro ao ler os detalhes do tempo:', err);
        }
    }
});

// Listener para fechar o modal
const timeBreakdownModal = document.getElementById('time-breakdown-modal');
if (timeBreakdownModal) {
    const closeBtn = timeBreakdownModal.querySelector('.modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => timeBreakdownModal.classList.remove('show'));
    }
    timeBreakdownModal.addEventListener('click', (e) => {
        if (e.target === timeBreakdownModal) {
            timeBreakdownModal.classList.remove('show');
        }
    });
}

const bossFoundModal = document.getElementById('boss-found-modal');
const closeFoundModalBtn = bossFoundModal.querySelector('.modal-close-btn');
const bossFoundForm = document.getElementById('boss-found-form');
let currentBossToFind = null;

closeFoundModalBtn.addEventListener('click', () => bossFoundModal.classList.remove('show'));

document.getElementById('main-content-panel').addEventListener('click', e => {
    const foundBtn = e.target.closest('.found-btn');
    if (foundBtn) {
        e.preventDefault();
        currentBossToFind = foundBtn.dataset.boss;
        document.getElementById('boss-found-title').textContent = `Registrar "${currentBossToFind}"`;
        bossFoundForm.reset();

const anonymousWrapper = document.getElementById('anonymous-char-wrapper');
const anonymousInput = document.getElementById('anonymous-char-input'); // Adicionar esta linha

if (!window.currentUser) {
    // Se for anônimo, mostra e habilita o campo
    anonymousWrapper.style.display = 'block';
    anonymousInput.disabled = false;
} else {
    // Se estiver logado, esconde e desabilita o campo
    anonymousWrapper.style.display = 'none';
    anonymousInput.disabled = true;
}

bossFoundModal.classList.add('show');
    }
});

bossFoundForm.addEventListener('submit', e => {
    e.preventDefault();
    console.log('Botão "Enviar Registro" clicado.'); // LOG 1

    const data = {
        bossName: currentBossToFind,
        deathTime: document.getElementById('death-time-input').value,
        tokens: document.getElementById('tokens-input').value,
        observation: document.getElementById('observation-input').value,
        characterName: null
    };

    console.log('Estado do usuário (window.currentUser):', window.currentUser); // LOG 2

    if (window.currentUser && window.currentUser.character && window.currentUser.character.characterName) {
        // Usuário logado com personagem
        data.characterName = window.currentUser.character.characterName;
        console.log('Usuário logado identificado. Personagem:', data.characterName); // LOG 3

    } else if (window.currentUser) {
        // Usuário logado sem personagem
        console.error('Falha: Usuário logado, mas sem personagem registrado.'); // LOG 4
        alert('Você precisa registrar um personagem em sua conta para usar esta função. Use o comando !register [nome].');
        return;

    } else {
        // Usuário anônimo
        const anonName = document.getElementById('anonymous-char-input').value.trim();
        if (!anonName) {
            alert('O nome do personagem é obrigatório.');
            return;
        }
        data.characterName = anonName;
        console.log('Usuário anônimo identificado. Personagem:', data.characterName); // LOG 5
    }

    console.log('Enviando dados para o servidor:', data); // LOG 6
    window.appSocket.emit('bosses:recordFound', data);

    bossFoundModal.classList.remove('show');
});

function renderWarPanelPage(data) {
    console.log("[WAR PANEL] Recebido para renderizar:", data); // Log para depuração

    // Garante que 'data' seja um objeto, mesmo que vazio, para evitar erros
    const safeData = data || { summary: {}, rankings: {}, statsByVocation: {} };

    // --- 1. Lógica do Filtro (deve funcionar como antes) ---
    const searchInput = document.getElementById('war-search-input');
    if (searchInput) {
        searchInput.removeEventListener('input', filterWarPanelTables); // Evita duplicar listener
        searchInput.addEventListener('input', filterWarPanelTables);
    }

    // --- 2. Renderização Padrão (Cabeçalho e Filtro de Data) ---
    const rangeDisplay = document.getElementById('war-selected-range');
    if (rangeDisplay) {
        rangeDisplay.textContent = `Exibindo dados de: ${safeData.filterRangeDescription || 'Período não especificado'}`;
    }

    const lastUpdateEl = document.getElementById('war-last-update');
    // Não temos 'lastUpdate' no HTML fornecido, então esta parte pode ser removida ou comentada
    // if (lastUpdateEl) { ... }

    // --- 3. Renderização dos Resumos (Mortes E Level Ups) ---
    const summary = safeData.summary || {}; // Garante que summary exista

    // Seleciona os elementos pelos IDs CORRETOS e ÚNICOS
    const allyDeathsEl = document.getElementById('ally-deaths-count');
    const enemyDeathsEl = document.getElementById('enemy-deaths-count');
    const huntedDeathsEl = document.getElementById('hunted-deaths-count');
    const allyLevelUpsEl = document.getElementById('ally-levelup-count');
    const enemyLevelUpsEl = document.getElementById('enemy-levelup-count');
    const huntedLevelUpsEl = document.getElementById('hunted-levelup-count');

    // Preenche contadores de Morte
    if(allyDeathsEl) allyDeathsEl.textContent = summary.allyDeaths || 0;
    if(enemyDeathsEl) enemyDeathsEl.textContent = summary.enemyDeaths || 0;
    if(huntedDeathsEl) huntedDeathsEl.textContent = summary.huntedDeaths || 0;
    // Remove placeholder (se houver)
    [allyDeathsEl, enemyDeathsEl, huntedDeathsEl].forEach(el => el?.classList.remove('placeholder-text'));

    // Preenche contadores de Level Up
    if(allyLevelUpsEl) allyLevelUpsEl.textContent = summary.allyLevelUps || 0;
    if(enemyLevelUpsEl) enemyLevelUpsEl.textContent = summary.enemyLevelUps || 0;
    if(huntedLevelUpsEl) huntedLevelUpsEl.textContent = summary.huntedLevelUps || 0;
    // Remove placeholder (se houver)
    [allyLevelUpsEl, enemyLevelUpsEl, huntedLevelUpsEl].forEach(el => el?.classList.remove('placeholder-text'));


    // --- 4. Função Auxiliar de Renderização de Tabela (Mais Robusta) ---
    const renderRankingTable = (tableId, rankingData, type = 'kill') => { // type: 'kill', 'death', 'levelup'
        const tableBody = document.querySelector(`#${tableId} tbody`);
        if (!tableBody) {
             console.error(`[WAR PANEL] Tabela não encontrada: #${tableId}`);
             return;
        }

        tableBody.innerHTML = ''; // Limpa o conteúdo antigo
        const safeRankingData = rankingData || []; // Garante que seja um array

        if (safeRankingData.length > 0) {
            tableBody.innerHTML = safeRankingData.map((item, index) => {
                if (!item || typeof item !== 'object') return ''; // Pula itens inválidos

                try {
                    if (type === 'death') {
                        const name = item.name || 'Desconhecido';
                        const timeStr = item.time || null; // Vem como ISO string
                        const shortReason = item.reason && typeof item.reason === 'string'
                            ? (item.reason.length > 50 ? item.reason.substring(0, 47) + '...' : item.reason)
                            : 'Desconhecida';
                        const level = item.level || '?';
                        // Opcional: Formatar 'timeStr' se necessário antes de exibir
                        return `
                              <tr>
                                <td>${name}</td>
                                <td>${level}</td>
                                <td>${shortReason}</td>
                            </tr>
                        `;
                    } else if (type === 'levelup') {
                    // Verifica se 'item' e 'item.name' existem
                    if (!item || typeof item.name === 'undefined' || typeof item.newLevel === 'undefined') {
                        return ''; // Pula item inválido
                    }

                    const name = item.name;
                    const timeStr = item.time || null;
                    const newLevel = item.newLevel || '?';
                    const oldLevel = item.oldLevel || (typeof newLevel === 'number' ? newLevel - 1 : '?');

                    // --- INÍCIO DA MODIFICAÇÃO ---
                    // 1. Codifica o nome para a URL
                    const encodedName = encodeURIComponent(name);
                    // 2. Cria o URL do GuildStats
                    const guildStatsUrl = `https://guildstats.eu/character?nick=${encodedName}&tab=9`;
                    // 3. Cria o HTML do link
                    const nameHtml = `<a href="${guildStatsUrl}" target="_blank" style="color: white; text-decoration: none;">${name}</a>`;
                    // --- FIM DA MODIFICAÇÃO ---

                    return `
                        <tr>
                            <td>${nameHtml}</td> <td>${oldLevel} ➔ ${newLevel}</td>
                            <td>${timeStr ? formatFullTimestamp(timeStr) : 'N/A'}</td>
                        </tr>
                    `;
                    } else { // type === 'kill' (padrão)
                        const name = item.name || 'Desconhecido';
                        const count = item.count || 0;
                        const isPlayerKillTable = (tableId === 'kill-ranking-player-ally' || tableId === 'kill-ranking-player-enemy');
                        let victimsColumnHtml = '';
                        if (isPlayerKillTable) {
                            // Ordena vítimas pela hora (mais recente primeiro) se 'time' existir
                            const sortedVictims = (item.details || []).sort((a, b) => (b.time || 0) - (a.time || 0));
                            const victimsList = sortedVictims.map(detail => detail.victim || '?').join(', ');
                            const shortVictimsList = victimsList.length > 150 ?
                                victimsList.substring(0, 147) + '...' : (victimsList || '-');
                            victimsColumnHtml = `<td>${shortVictimsList}</td>`;
                        }
                        return `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${name}</td>
                                <td>${count}</td>
                                ${victimsColumnHtml}
                            </tr>
                        `;
                    }
                } catch (rowError) {
                    console.error(`[WAR PANEL] Erro ao renderizar linha para ${tableId}:`, item, rowError);
                    // Determina colspan correto baseado no tipo
                    let colspan = (type === 'kill' && (tableId === 'kill-ranking-player-ally' || tableId === 'kill-ranking-player-enemy')) ? 4 : 3;
                    return `<tr><td colspan="${colspan}" class="placeholder-text-cell">Erro ao renderizar linha</td></tr>`;
                }
            }).join('');
        } else {
            // Determina colspan correto baseado no tipo/ID para a mensagem "Nenhum dado"
             let colspan = 3; // Padrão para death, levelup, creature kill
             if (tableId === 'kill-ranking-player-ally' || tableId === 'kill-ranking-player-enemy') {
                 colspan = 4; // Para kill de player
             }
            tableBody.innerHTML = `<tr><td colspan="${colspan}" class="placeholder-text-cell">Nenhum dado neste período.</td></tr>`;
        }
    };

    // --- 5. Renderização das Tabelas (usando 'safeData') ---
    const rankings = safeData.rankings || {}; // Garante que rankings exista

    // Mortes (Renderiza na aba 'Mortes & Kills')
    renderRankingTable('death-ranking-ally', rankings.deathAlly, 'death');
    renderRankingTable('death-ranking-enemy', rankings.deathEnemy, 'death');
    renderRankingTable('death-ranking-hunted', rankings.deathHunted, 'death');

    // Level Ups (Renderiza na aba 'Level Ups')
    renderRankingTable('levelup-ranking-ally', rankings.levelUpAlly, 'levelup');
    renderRankingTable('levelup-ranking-enemy', rankings.levelUpEnemy, 'levelup');
    renderRankingTable('levelup-ranking-hunted', rankings.levelUpHunted, 'levelup');

    // Kills (Renderiza na aba 'Mortes & Kills')
    renderRankingTable('kill-ranking-player-ally', rankings.killPlayerAlly, 'kill');
    renderRankingTable('kill-ranking-player-enemy', rankings.killPlayerEnemy, 'kill');
    renderRankingTable('kill-ranking-creature', rankings.killCreature, 'kill');

    // --- 6. Renderização de Vocações (Atualizada para 4 colunas) ---
    const vocationTableBody = document.querySelector('#vocation-stats tbody');
    if (vocationTableBody) {
        const vocationStats = safeData.statsByVocation || {};
        const sortedVocations = Object.entries(vocationStats)
            .sort(([, statsA], [, statsB]) =>
                ((statsB.deaths || 0) + (statsB.kills || 0) + (statsB.levelUps || 0)) -
                ((statsA.deaths || 0) + (statsA.kills || 0) + (statsA.levelUps || 0))
            );

        if (sortedVocations.length > 0) {
             vocationTableBody.innerHTML = sortedVocations.map(([vocation, stats]) => {
                 // Usa || 0 para garantir que é um número
                 const deaths = stats?.deaths || 0;
                 const kills = stats?.kills || 0;
                 const levelUps = stats?.levelUps || 0;
                 return `
                     <tr>
                        <td>${vocation || 'Desconhecida'}</td>
                        <td>${deaths}</td>
                        <td>${kills}</td>
                        <td>${levelUps}</td>
                    </tr>
                 `;
             }).join('');
        } else {
            vocationTableBody.innerHTML = '<tr><td colspan="4" class="placeholder-text-cell">Nenhum dado neste período.</td></tr>'; // Colspan 4
        }
    } else {
        console.error("[WAR PANEL] Tabela de vocações não encontrada: #vocation-stats tbody");
    }

}

function filterWarPanelContent() {
const searchInput = document.getElementById('global-war-filter-input');
    if (!searchInput) {
        console.error("Filtro global '#global-war-filter-input' não encontrado.");
        return;
    }

    const searchTerm = searchInput.value.toLowerCase().trim();

    // Determina qual painel (aba) está visível
    const deathsKillsPanel = document.getElementById('war-panel-deaths-kills');
    const levelupsPanel = document.getElementById('war-panel-levelups');
    // Assume deathsKillsPanel como padrão se levelupsPanel não estiver explicitamente visível
    const visiblePanel = levelupsPanel?.style.display === 'block' ? levelupsPanel : deathsKillsPanel;

    // Sai se nenhum painel estiver visível (improvável, mas seguro)
    if (!visiblePanel) {
        console.error("Nenhum painel de conteúdo do War Panel está visível.");
        return;
    }

    // Seleciona todas as tabelas de ranking DENTRO do painel visível
    const tablesToFilter = visiblePanel.querySelectorAll('.war-ranking-table');

    tablesToFilter.forEach(table => {
        const tableBody = table.querySelector('tbody');
        if (!tableBody) return; // Pula se a tabela não tiver tbody

        const rows = tableBody.querySelectorAll('tr');
        let hasVisibleRows = false;
        let placeholderRow = null; // Para guardar a linha de "Nenhum dado"
        let nameCellIndex = 0; // Índice da coluna com o nome (0-based)

        // Determina qual coluna contém o nome/identificador a ser filtrado
        const tableId = table.id;
        if (tableId.startsWith('kill-ranking-player-') || tableId === 'kill-ranking-creature') {
            // Tabelas de Kill: Pos | Nome/Criatura | Kills | Vítimas?
            nameCellIndex = 1; // Segunda coluna
        } else if (tableId.startsWith('death-ranking-') || tableId.startsWith('levelup-ranking-') || tableId === 'vocation-stats') {
            // Tabelas de Morte, Level Up, Vocação: Nome/Vocação | ...
            nameCellIndex = 0; // Primeira coluna
        } else {
            console.warn(`Tabela com ID desconhecido encontrada: ${tableId}. Não será filtrada.`);
            return; // Não filtra tabelas não reconhecidas
        }

        // Itera sobre as linhas da tabela
        rows.forEach(row => {
            const placeholderCell = row.querySelector('.placeholder-text-cell');
            if (placeholderCell) {
                placeholderRow = row; // Armazena a linha do placeholder
                row.style.display = 'none'; // Oculta temporariamente
                return; // Não filtra a linha do placeholder em si
            }

            // Encontra a célula correta que contém o nome
            const nameCell = row.querySelector(`td:nth-child(${nameCellIndex + 1})`); // nth-child é 1-based

            if (nameCell) {
                // Pega o texto, considerando se está dentro de um link <a>
                const linkInside = nameCell.querySelector('a');
                const cellText = (linkInside ? linkInside.textContent : nameCell.textContent).toLowerCase();

                // Aplica a lógica do filtro
                if (searchTerm === '' || cellText.includes(searchTerm)) {
                    // Se o filtro está vazio OU o texto da célula contém o termo de busca
                    row.style.display = ''; // Mostra a linha
                    hasVisibleRows = true; // Marca que pelo menos uma linha está visível
                } else {
                    // Se o filtro não está vazio E o texto não contém o termo
                    row.style.display = 'none'; // Oculta a linha
                }
            } else {
                 // Oculta linhas que não têm a célula esperada (pode ocorrer durante carregamento)
                 row.style.display = 'none';
            }
        });

        // Após verificar todas as linhas, decide o que fazer com a linha do placeholder
        if (placeholderRow) {
             const tdContent = placeholderRow.querySelector('td');
             if(tdContent){
                 if (!hasVisibleRows) {
                     // Se nenhuma linha de dados ficou visível
                     if (searchTerm === '') {
                         // Filtro está vazio, mostra mensagem padrão
                         tdContent.textContent = 'Nenhum dado neste período.';
                     } else {
                         // Filtro tem texto, mostra mensagem de "nenhum resultado"
                         tdContent.textContent = `Nenhum resultado para "${searchTerm}"`;
                     }
                     placeholderRow.style.display = ''; // Mostra a linha do placeholder
                 } else {
                     // Se há linhas de dados visíveis, oculta a linha do placeholder
                     placeholderRow.style.display = 'none';
                 }
             }
        }
        // Se não existia uma linha de placeholder e nenhuma linha de dados é visível,
        // a tabela simplesmente ficará vazia (sem linhas no tbody).
    });
}

// O listener que chama renderWarPanelPage deve estar assim:
window.appSocket.on('war:dataUpdated', (data) => {
    // Adicione este log para verificar os dados recebidos no console do navegador
    console.log('Recebido war:dataUpdated:', JSON.stringify(data, null, 2));

    const warPanelContent = document.getElementById('war-panel-deaths-kills'); // Ou qualquer elemento principal da página
    if (warPanelContent) { // Verifica se estamos na página do warpanel
        try { // Adiciona try...catch em volta da renderização
            renderWarPanelPage(data);
        } catch (renderError) {
             console.error("[WAR PANEL] Erro CRÍTICO durante renderWarPanelPage:", renderError);
             // Opcional: Mostrar erro na interface
             if (warPanelContent) warPanelContent.innerHTML = `<p style="color: red;">Erro ao renderizar dados do painel: ${renderError.message}</p>`;
        }
    }
});