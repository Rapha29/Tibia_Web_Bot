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
    if (!container) return; // Garante que o container existe
    const newSlot = document.createElement('div');
    newSlot.className = 'input-group mb-2';
    newSlot.innerHTML = `
        <input type="text" class="form-control" name="role_name" placeholder="Nome da Função (Ex: Suporte)" required>
        <input type="number" class="form-control" name="role_count" value="1" min="1" required>
        <button class="btn btn-outline-danger" type="button" onclick="this.parentElement.remove()">-</button>
    `;
    container.appendChild(newSlot);
}

// Função para renderizar os grupos de boss no DOM
function renderBossGroups(groups) {
    const bossGroupsList = document.getElementById('bossGroupsList');
    const loadingBossesMessage = document.getElementById('loadingBossesMessage');

    if (!bossGroupsList) return;

    bossGroupsList.innerHTML = ''; // Limpa a lista existente
    if (loadingBossesMessage) loadingBossesMessage.style.display = 'none';

    if (groups.length === 0) {
        bossGroupsList.innerHTML = `
            <div class="col-12">
                <div class="alert alert-secondary text-center">Nenhum grupo agendado. Seja o primeiro a criar um!</div>
            </div>
        `;
        return;
    }

    // Para cada grupo de boss, cria o card HTML
    groups.forEach(group => {
        const groupCard = document.createElement('div');
        groupCard.className = 'col'; // Coluna para o grid

        let slotsHtml = '';
        group.slots.forEach((slot, index) => {
            const participantInfo = slot.participant
                ? `${slot.participant.name} <span class="text-muted small">(${slot.participant.vocation || 'N/A'})</span>`
                : '<span class="text-success fst-italic">Vaga Aberta</span>';

            let actionButton = '';
            // A lógica de permissão de "Participar", "Sair", "Remover"
            // Requer `window.activeCharacterName` e `window.isAdmin` que são globais.
            if (slot.participant) {
                // Se o slot é ocupado pelo personagem logado
                if (window.activeCharacterName && slot.participant.name === window.activeCharacterName) {
                    actionButton = `<button class="btn btn-sm btn-warning leave-boss-slot-btn" data-group-id="${group.id}" data-char-name="${slot.participant.name}">Sair</button>`;
                }
                // Se sou o criador do grupo ou admin e não sou eu na vaga
                else if (window.isAdmin || (window.activeCharacterName && group.creator === window.activeCharacterName)) {
                    actionButton = `<button class="btn btn-sm btn-outline-danger remove-boss-slot-btn" data-group-id="${group.id}" data-char-name="${slot.participant.name}">Remover</button>`;
                }
            } else {
                // Vaga aberta, permite participar se houver um personagem ativo
                if (window.activeCharacterName) {
                    actionButton = `<button class="btn btn-sm btn-success join-boss-slot-btn" data-group-id="${group.id}" data-slot-index="${index}">Participar</button>`;
                }
            }

            slotsHtml += `
                <tr>
                    <td class="fw-bold align-middle">${slot.role}</td>
                    <td class="align-middle">${participantInfo}</td>
                    <td class="text-end" style="width: 120px;">
                        ${actionButton}
                    </td>
                </tr>
            `;
        });

        // Botão de apagar grupo (apenas criador ou admin)
        let deleteForm = '';
        if (window.isAdmin || (window.activeCharacterName && group.creator === window.activeCharacterName)) {
            deleteForm = `
                <form class="d-inline delete-boss-group-form" data-group-id="${group.id}" onsubmit="return confirm('Tem certeza que deseja apagar este grupo?');">
                    <button type="submit" class="btn btn-sm btn-outline-danger" title="Apagar Grupo"><i class="fas fa-trash"></i></button>
                </form>
            `;
        }

        groupCard.innerHTML = `
            <div class="card h-100 shadow-sm">
                <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                    <div>
                        <h5 class="mb-0 text-truncate">${group.boss_name}</h5>
                        <small>Em: ${new Date(group.event_time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} | Por: <strong>${group.creator}</strong></small>
                    </div>
                    <div>
                        ${deleteForm}
                    </div>
                </div>
                <div class="card-body">
                    <table class="table table-sm table-hover">
                        <tbody>
                            ${slotsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        bossGroupsList.appendChild(groupCard);
    });
}

window.currentUser = null;

const originalLoadPage = window.loadPage;
window.loadPage = async function(pageName) {
    // Primeiro, chame a função loadPage original para carregar o conteúdo da página
    await originalLoadPage(pageName);

    // Agora, adicione a lógica específica para cada página
    if (pageName === 'bosses') {
        // Obtain references to HTML elements AFTER the page content has been loaded
        const createBossGroupBtn = document.getElementById('createBossGroupBtn');
        const createBossGroupModal = document.getElementById('createBossGroupModal');
        const closeBossGroupModalBtn = createBossGroupModal ? createBossGroupModal.querySelector('.modal-close-btn') : null;
        const createBossGroupForm = document.getElementById('createBossGroupForm');
        const slotsInputContainer = document.getElementById('slotsInputContainer');
        const addSlotBtn = document.getElementById('addSlotBtn');
        const bossGroupsList = document.getElementById('bossGroupsList'); // Get this reference once

        // Request boss groups when the page loads
        if (bossGroupsList) {
             // Display initial loading message
             bossGroupsList.innerHTML = `<div class="col-12"><div class="alert alert-info text-center" id="loadingBossesMessage">Carregando grupos de boss...</div></div>`;
        }
        window.appSocket.emit('boss:getGroups');

        // Event Listeners for the creation modal
        if (createBossGroupBtn) {
            createBossGroupBtn.onclick = () => {
                if (createBossGroupModal) createBossGroupModal.classList.add('show');
            };
        }
        if (closeBossGroupModalBtn) {
            closeBossGroupModalBtn.onclick = () => {
                if (createBossGroupModal) createBossGroupModal.classList.remove('show');
            };
        }
        if (createBossGroupModal) { // Close modal by clicking outside
            createBossGroupModal.onclick = (e) => {
                if (e.target === createBossGroupModal) {
                    createBossGroupModal.classList.remove('show');
                }
            };
        }

        // Logic for adding slots in the creation form
        if (addSlotBtn) {
            addSlotBtn.onclick = addSlot;
        }

        // Submission of the group creation form
        if (createBossGroupForm) {
            createBossGroupForm.onsubmit = (e) => {
                e.preventDefault();
                const boss_name = document.getElementById('bossNameInput').value.trim();
                const event_time = document.getElementById('eventTimeInput').value; // ISO string format

                if (!boss_name || !event_time) {
                    alert('Por favor, preencha o nome do boss e a data/hora.');
                    return;
                }

                // Collect slot data dynamically
                const roleInputs = slotsInputContainer.querySelectorAll('.input-group');
                const slots = Array.from(roleInputs).map(group => ({
                    role_name: group.querySelector('input[name="role_name"]').value.trim(),
                    role_count: group.querySelector('input[name="role_count"]').value,
                })).filter(s => s.role_name && parseInt(s.role_count, 10) > 0); // Filter empty/invalid slots

                if (slots.length === 0) {
                    alert('Por favor, adicione pelo menos um tipo de vaga.');
                    return;
                }

                window.appSocket.emit('boss:createGroup', { boss_name, event_time, slots });
                if (createBossGroupModal) createBossGroupModal.classList.remove('show');
                createBossGroupForm.reset(); // Reset form
                // Reset slots to default after resetting the form
                if (slotsInputContainer) {
                    slotsInputContainer.innerHTML = `
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" name="role_name" value="Blocker" required>
                            <input type="number" class="form-control" name="role_count" value="1" min="1" required>
                        </div>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" name="role_name" value="Healer" required>
                            <input type="number" class="form-control" name="role_count" value="1" min="1" required>
                        </div>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" name="role_name" value="Shooter" required>
                            <input type="number" class="form-control" name="role_count" value="2" min="1" required>
                        </div>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control" name="role_name" value="Next" required>
                            <input type="number" class="form-control" name="role_count" value="2" min="1" required>
                        </div>
                    `;
                }
            };
        }

        // Event delegation for slot and group action buttons (inside bossGroupsList)
        if (bossGroupsList) {
            // Remove any existing click handlers to prevent duplicates on subsequent page loads
            // This is important because loadPage can be called multiple times.
            bossGroupsList.onclick = null; // Clear previous handler

            bossGroupsList.onclick = (e) => {
                const target = e.target;

                // Join button
                if (target.classList.contains('join-boss-slot-btn')) {
                    e.preventDefault();
                    const groupId = target.dataset.groupId;
                    const slotIndex = parseInt(target.dataset.slotIndex, 10);
                    if (confirm('Tem certeza que deseja entrar nesta vaga?')) {
                        window.appSocket.emit('boss:joinSlot', { groupId, slotIndex });
                    }
                }
                // Leave / Remove button
                else if (target.classList.contains('leave-boss-slot-btn') || target.classList.contains('remove-boss-slot-btn')) {
                    e.preventDefault();
                    const groupId = target.dataset.groupId;
                    const charName = target.dataset.charName;
                    const actionText = target.classList.contains('leave-boss-slot-btn') ? 'sair desta vaga' : `remover ${charName} desta vaga`;
                    if (confirm(`Tem certeza que deseja ${actionText}?`)) {
                        window.appSocket.emit('boss:leaveSlot', { groupId, characterName: charName });
                    }
                }
                // Delete Group button (intercepts form submission)
                else if (target.closest('.delete-boss-group-form') && target.type === 'submit') { // Check if it's the submit button of the form
                    e.preventDefault(); // Prevent default form submission
                    const form = target.closest('.delete-boss-group-form');
                    const groupId = form.dataset.groupId;
                    if (confirm('Tem certeza que deseja apagar este grupo?')) {
                        window.appSocket.emit('boss:deleteGroup', groupId);
                    }
                }
            };
        }
    }
};

async function loadPage(pageName) {
    const contentPanel = document.getElementById('main-content-panel');
    if (!contentPanel) return;

    if (window.friendsUpdateInterval) {
        clearInterval(window.friendsUpdateInterval);
        window.friendsUpdateInterval = null;
    }

    try {
        const response = await fetch(`pages/${pageName}.html`);
        if (!response.ok) {
            throw new Error(`Página não encontrada: pages/${pageName}.html`);
        }
        const htmlText = await response.text();
        contentPanel.innerHTML = '';

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

        if (pageName === 'respawns' && window.cachedRespawnData) {
            updateRespawnTable(window.cachedRespawnData.fila, window.cachedRespawnData.respawns);
        }

        if (pageName === 'friends') {
            setTimeout(() => {
                if (typeof initializeFriendsPage === 'function') {
                    initializeFriendsPage(window.appSocket);
                }
            }, 50);
        }

        document.querySelectorAll('.main-nav .nav-link.active').forEach(link => {
            link.classList.remove('active');
        });

        const activeLink = document.querySelector(`.main-nav .nav-link[data-page="${pageName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        } else {
            const toolsBtn = document.getElementById('tools-dropdown-btn');
            if (toolsBtn) {
                toolsBtn.classList.add('active');
            }
        }

    } catch (error) {
        console.error("Erro ao carregar a página:", error);
        contentPanel.innerHTML = `<div style="text-align: center; padding: 50px;"><h2 style="color: var(--danger-color);">Erro ao Carregar</h2><p>${error.message}</p></div>`;
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
        if(updateTimeEl) updateTimeEl.innerText = `Atualizado: ${now.toLocaleTimeString()}`;
        return;
    }

    const rowsData = Object.entries(fila).map(([code, entry]) => ({
        ...entry,
        code,
        name: allRespawnNames[code.toUpperCase()] || "Desconhecido"
    }))
    .filter(entry => 
        entry.name.toLowerCase().includes(searchTerm) || 
        entry.code.toLowerCase().includes(searchTerm)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

    if (rowsData.length === 0) {
        respawnTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum respawn encontrado com este filtro.</td></tr>';
        return;
    }

    respawnTableBody.innerHTML = rowsData.map(entry => {
        const { code, name } = entry;
        const current = entry.current?.clientNickname || "Ninguém";
        const queue = entry.queue || [];
        
        const isOwner = entry.current?.clientNickname === window.activeCharacterName;
        const isInQueue = queue.some(u => u?.clientNickname === window.activeCharacterName);
        const highlightClass = (isOwner || isInQueue) ? 'user-highlight' : '';

        let tempoText;
        if (entry.paused) {
            const remainingOnPause = formatMinutesToHHMM(Math.ceil((entry.remainingTimeOnPause || 0) / 60000));
            tempoText = `<span class="paused-indicator">PAUSADO (${remainingOnPause})</span>`;
        } else if (entry.waitingForAccept) {
            tempoText = `<span class="red">Aguardando aceite...</span>`;
        } else {
            // --- INÍCIO DO BLOCO CORRIGIDO E MAIS ROBUSTO ---
            const endTime = new Date(entry.endTime);
            // Verificação mais segura para garantir que endTime existe e é válido
            if (!entry.endTime || isNaN(endTime.getTime())) {
                tempoText = `<span class="red">Tempo inválido</span>`;
            } else {
                const remaining = Math.floor((endTime - now) / 60000);
                const entitledTimeData = entry.current?.entitledTime;
                let totalTime = 0;
                let timeBreakdownHtml = '';

                // Determina o tempo total de forma segura
                if (entitledTimeData && typeof entitledTimeData === 'object') {
                    totalTime = entitledTimeData.total || 0;
                    // Lógica para montar o tooltip (inalterada)
                    let breakdownTitle = 'Detalhes do Tempo:&#10;';
                    breakdownTitle += `Rank ${entitledTimeData.breakdown.base.name}: ${formatMinutesToHHMM(entitledTimeData.breakdown.base.time)}&#10;`;
                    entitledTimeData.breakdown.groups.forEach(g => {
                        breakdownTitle += `Grupo ${g.name}: ${formatMinutesToHHMM(g.time)}&#10;`;
                    });
                    breakdownTitle += `Total: ${formatMinutesToHHMM(totalTime)}`;
                    timeBreakdownHtml = `<i class="fas fa-info-circle" title="${breakdownTitle}" style="cursor: help; color: var(--info-color); margin-left: 5px;"></i>`;
                } else {
                    // Fallback para caso os dados de tempo detalhado não existam
                    totalTime = entry.current?.allocatedTime || 0;
                }
                
                // Garante que o tempo restante exibido nunca seja negativo
                const displayRemaining = Math.max(0, remaining);

                tempoText = `<span class="red">${formatMinutesToHHMM(displayRemaining)}</span> / <span>${formatMinutesToHHMM(totalTime)}</span>${timeBreakdownHtml}`;
            }
            // --- FIM DO BLOCO CORRIGIDO ---
        }

        const star = (user) => (user && user.plusExpiresAt && new Date(user.plusExpiresAt) > now) ?
            '<span class="plus-star" title="Usuário Plus">⭐</span>' : '';
        const characterLink = current !== "Ninguém" ? `${star(entry.current)}<a href="#" class="character-log-link" data-character-name="${current}">${current}</a> ${window.isAdmin ?
            `<button title="Remover" class="respawn-action-btn admin-kick-btn" data-respawn-code="${code}" data-user-to-kick="${current}">❌</button>` : ''}` : "Ninguém";
        let nextsContent = 'Nenhum';
        if (queue.length > 0) {
            const firstInQueue = queue[0];
            const kickButton = window.isAdmin ? `<button title="Remover da Fila" class="respawn-action-btn admin-kick-btn" data-respawn-code="${code}" data-user-to-kick="${firstInQueue.clientNickname}">❌</button>` : '';
            const fullQueueList = queue.length > 1 ? `<div class="full-queue-list">` + queue.slice(1).map((p, i) => `<div class="queue-item">${i + 2}. ${star(p)}${p.clientNickname} ${window.isAdmin ? `<button title="Remover da Fila" class="respawn-action-btn admin-kick-btn" data-respawn-code="${code}" data-user-to-kick="${p.clientNickname}">❌</button>` : ''}</div>`).join('') + `</div>` : '';
            const expandButton = queue.length > 1 ? ` <button class="queue-expand-btn">(${queue.length})</button>` : '';
            nextsContent = `<div class="nexts-container"><span>1. ${star(firstInQueue)}${firstInQueue.clientNickname} ${kickButton}</span>${expandButton}${fullQueueList}</div>`;
        }
        const respawnLink = window.isAdmin ? `<a href="#" class="respawn-log-link" data-respawn-code="${code}">${name}</a>` : name;
        let actionContent = '';
        if (isOwner || isInQueue) {
            actionContent += `<button class="action-btn leave-respawn-btn" data-respawn-code="${code}">Sair</button>`;
        }
        if (window.isAdmin && entry.current) {
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
    if(updateTimeEl) updateTimeEl.innerText = `Atualizado: ${now.toLocaleTimeString()}`;
}

document.addEventListener('DOMContentLoaded', () => {
    window.appSocket = io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
    });

    window.isAdmin = false;
    let commandHistory = [];
    let historyIndex = -1;
    window.activeCharacterName = '';

    let allUsers = {};
    let allGroups = [];
    let allRespawns = {};
    let allRespawnGroups = {};
    let respawnTimes = {};

    let selectedUserId = null;
    let selectedCharacterName = null;
    let selectedRespawnCode = null;

    window.cachedRespawnData = { fila: {}, respawns: {} };

    const beepSound = new Audio('beep.mp3');
    beepSound.volume = 1;


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
    const saveRespawnGroupsBtn = document.getElementById('save-respawn-groups-btn');
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

    window.appSocket.on('boss:groupsList', (groups) => {
        renderBossGroups(groups);
    });

    // Listener for the history button (if you implement it)
    const showBossHistoryBtn = document.getElementById('showBossHistoryBtn');
    if (showBossHistoryBtn) {
        showBossHistoryBtn.addEventListener('click', () => {
            alert('Funcionalidade de histórico de bosses ainda não implementada.');
            window.appSocket.emit('boss:getHistory'); // You would need to implement this in server.js and boss_module.js
        });
    }


    window.appSocket.on('login:success', (data) => {
        if (data.token) {
            localStorage.setItem('sessionToken', data.token);
        }
        // Guarda os dados do usuário globalmente
        window.currentUser = data; 
        
        // Pede os dados iniciais (incluindo a lista de grupos) ao servidor
        window.appSocket.emit('user:get_initial_data');

        // A função abaixo vai rodar, mas pode não ter os grupos ainda.
        // Ela será chamada de novo quando a lista de grupos chegar.
        setupLoggedInUI(data.account, data.character);
    });

    window.appSocket.on('user:status', (status) => {
        window.isAdmin = status.isAdmin;
        if(openAdminModalBtn) openAdminModalBtn.style.display = window.isAdmin ? 'flex' : 'none';
    });

    window.appSocket.on('admin:dataUpdate', (data) => {
        allUsers = data.users;
        allGroups = data.groups;
        allRespawns = data.respawns;
        allRespawnGroups = data.respawnGroups;
        respawnTimes = data.respawnTimes || {};
        // A linha abaixo é a correção crucial para carregar os cooldowns
        allCooldowns = data.cooldowns || {};

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
        addLogMessage(sender, message, 'bot');
        if (soundEnabledCheckbox.checked) {
            beepSound.play().catch(e => console.error("Erro ao tocar som de notificação:", e));
        }
        if (alertEnabledCheckbox.checked) {
            alert(`MENSAGEM DO BOT:\n\n${message}`);
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
            beepSound.play().catch(e => console.error("Erro ao tocar som de aviso:", e));
        }
        if (alertEnabledCheckbox.checked) {
            alert(`AVISO DO BOT:\n\n${message}`);
        }
    });

    window.appSocket.on('bot:broadcast_notification', ({ type, message }) => {
        addBroadcastMessage('SISTEMA', message, type);
    });

    window.appSocket.on('admin:showLog', ({title, entries}) => showLogModal(title, entries));

    window.appSocket.on('data:initial_data_response', (data) => {
        if (data.groups) {
            allGroups = data.groups;
        }
        // Se já tivermos um usuário logado, atualiza a UI com os grupos corretos
        if (window.currentUser) {
            setupLoggedInUI(window.currentUser.account, window.currentUser.character);
        }
    });

    window.appSocket.on('bot:hunted_online', (hunted) => {
        showHuntedAlert(hunted);
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
    // NOVO: Verifica se o input é da barra de busca da página de respawns
    if (e.target.id === 'respawn-search-input') {
        if(window.cachedRespawnData) {
            updateRespawnTable(window.cachedRespawnData.fila, window.cachedRespawnData.respawns);
        }
    }
});

    contentPanel.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;
        const button = target.closest('button');
        if (button?.classList.contains('leave-respawn-btn')) {
            const code = button.dataset.respawnCode;
            if (code) window.appSocket.emit('user:command', `!respdel ${code}`);
        } else if (button?.classList.contains('admin-kick-btn')) {
            const respawnCode = button.dataset.respawnCode;
            const userToKick = button.dataset.userToKick;
            if (confirm(`Remover "${userToKick}" de ${respawnCode.toUpperCase()}?`)) {
                window.appSocket.emit('admin:kickUser', { respawnCode, userToKick });
            }
        } else if (button?.classList.contains('respawn-action-btn')) {
            const respawnCode = button.dataset.respawnCode;
            const isToPause = button.classList.contains('pause');
            window.appSocket.emit('admin:pauseRespawn', { respawnCode, isPaused: isToPause });
        } else if (target.closest('.queue-expand-btn')) {
            const expandButton = target.closest('.queue-expand-btn');
            const queueList = expandButton.nextElementSibling;
            if (queueList?.classList.contains('full-queue-list')) {
                const isShowing = queueList.classList.contains('show');
                document.querySelectorAll('.full-queue-list.show').forEach(list => list.classList.remove('show'));
                if (!isShowing) {
                    queueList.classList.add('show');
                }
            }
        } else if (window.isAdmin && target.closest('.respawn-log-link')) {
            e.preventDefault();
            const respawnCode = target.closest('.respawn-log-link').dataset.respawnCode;
            window.appSocket.emit('admin:getRespawnLog', respawnCode);
        } else if (window.isAdmin && target.closest('.character-log-link')) {
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
        
        // Listener para os inputs de busca
        adminModal.addEventListener('input', (e) => {
            if (e.target.id.includes('-search')) {
                renderAdminPanel();
            }
        });
    }

    if(adminUserSearch) adminUserSearch.addEventListener('input', renderUserList);

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

    if (saveRespawnGroupsBtn) {
        const respawnGroupsChecklist = document.getElementById('respawn-groups-checklist');
        saveRespawnGroupsBtn.addEventListener('click', () => {
            if (!selectedRespawnCode || !respawnGroupsChecklist) return;
            const checkedCheckboxes = respawnGroupsChecklist.querySelectorAll('input[type="checkbox"]:checked');
            const selectedGroupIds = Array.from(checkedCheckboxes).map(cb => cb.dataset.groupId);
            window.appSocket.emit('admin:updateRespawnGroups', { respawnCode: selectedRespawnCode, groups: selectedGroupIds });
            alert('Grupos do respawn salvos.');
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
        window.activeCharacterName = character ? character.characterName : '';
        if(navUserAccount) navUserAccount.textContent = account.name;

        if(navUserChar) {
            if (character && character.characterName) {
                let charDisplayHtml = '';
                
                if (character.plusExpiresAt && new Date(character.plusExpiresAt) > new Date()) {
                    charDisplayHtml += `<span class="plus-star" title="Usuário Plus">⭐</span>`;
                }

                charDisplayHtml += window.activeCharacterName;

                let groupNames = [];
                if (character.groups && character.groups.length > 0 && allGroups && allGroups.length > 0) {
                    groupNames = character.groups.map(groupId => {
                        const group = allGroups.find(g => g.id === groupId);
                        return group ? group.name : null;
                    }).filter(name => name !== null);
                }

                const guildRank = character.guildRank || 'N/A';
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
    if(!chatLog) return;
    const entry = document.createElement('div');
    entry.classList.add('log-entry', type);
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
        textSpan.textContent = (typeof message === 'object' && message !== null) ? JSON.stringify(message) : String(message);
        entry.appendChild(textSpan);

        // Add alert logic for general bot messages
        // Check if the sender is 'Bot' and if the alert checkbox is checked
        if (sender === 'Bot' && alertEnabledCheckbox.checked) {
            // You can add more sophisticated logic here
            // to decide which bot messages should trigger an alert.
            // For example, check if the message contains keywords like "Error", "Warning", etc.
            alert(`MENSAGEM DO BOT:\n\n${textSpan.textContent}`);
        }
    }
    chatLog.appendChild(entry);
    chatLog.scrollTop = chatLog.scrollHeight;
}

    function addBroadcastMessage(sender, message, type = 'broadcast') {
        if(!chatLog) return;
        const entry = document.createElement('div');
        entry.classList.add('log-entry', 'broadcast', `broadcast-${type}`);
        entry.innerHTML = `<span class="sender"><i class="fas fa-bullhorn"></i> ANÚNCIO DE ${sender.toUpperCase()}</span><span class="text">${message}</span>`;
        chatLog.appendChild(entry);
        chatLog.scrollTop = chatLog.scrollHeight;
        if (alertEnabledCheckbox.checked) { // Check if the alert checkbox is checked
            alert(`ANÚNCIO DE ${sender.toUpperCase()}:\n\n${message}`); // Trigger the alert
        }
    }

    function showHuntedAlert(hunted) {
        if (alertEnabledCheckbox && alertEnabledCheckbox.checked) {
            alert(`ALERTA! O hunted ${hunted.name} (level ${hunted.level}) está online!`);
        }
        const message = `🚨 ALERTA! Hunted ${hunted.name} (level ${hunted.level}) está online! 🚨`;
        addBroadcastMessage('Sistema de Alerta', message, 'hunted');
        if (soundEnabledCheckbox && soundEnabledCheckbox.checked) {
            beepSound.play().catch(e => console.error("Erro ao tocar som de alerta:", e));
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
        if (!usersListDiv || !searchInput) return;
        
        usersListDiv.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();
        
        const filteredUsers = Object.entries(allUsers).filter(([email, account]) => 
            account.name.toLowerCase().includes(searchTerm) || 
            email.toLowerCase().includes(searchTerm) || 
            (account.phone && account.phone.includes(searchTerm)) || 
            (account.tibiaCharacters || []).some(c => c && c.characterName && c.characterName.toLowerCase().includes(searchTerm))
        );

        if (filteredUsers.length === 0) {
            usersListDiv.innerHTML = '<p>Nenhum usuário encontrado.</p>';
            return;
        }

        filteredUsers
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .forEach(([email, account]) => {
                const item = document.createElement('div');
                item.className = 'user-item-full';
                const charsHtml = (account.tibiaCharacters && account.tibiaCharacters.length > 0) ? account.tibiaCharacters.map(char => `<div class="char-details">- <strong>${char.characterName}</strong> (Lvl: ${char.level || 'N/A'}, Voc: ${char.vocation || 'N/A'}, Rank: ${char.guildRank || 'N/A'})</div>`).join('') : '<div class="char-details">- Nenhum personagem registrado.</div>';
                item.innerHTML = `<div class="user-info-full"><strong>${account.name}</strong><div>Email: ${email}</div><div>Telefone: ${account.phone || 'Não cadastrado'}</div></div><div class="user-chars-list"><strong>Personagens:</strong>${charsHtml}</div>`;
                usersListDiv.appendChild(item);
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
            let accountName = userIdentifier, charName = 'N/A';
            const account = allUsers[userIdentifier];
            if (account) {
                accountName = account.name;
                const mainChar = account.tibiaCharacters?.[0];
                if (mainChar) charName = mainChar.characterName;
            }
            const item = document.createElement('div');
            item.className = 'cooldown-item';
            item.innerHTML = `<div class="cooldown-info"><span><strong>${charName}</strong> (${accountName})</span><span class="cooldown-time">Restam: ${remaining} minuto(s)</span></div><button class="action-btn danger-btn remove-cooldown-btn" data-user-identifier="${userIdentifier}">Remover</button>`;
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
                (account.tibiaCharacters && account.tibiaCharacters.some(c => c && c.characterName && c.characterName.toLowerCase().includes(searchTerm)))
            )
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .forEach(([email, account]) => {
                const mainChar = (account.tibiaCharacters && account.tibiaCharacters.length > 0) ? account.tibiaCharacters[0] : { characterName: 'N/A', guildRank: 'N/A', groups: [] };
                const item = document.createElement('div');
                item.className = 'user-item';
                if (mainChar.characterName === selectedCharacterName) item.classList.add('selected');
                item.dataset.characterName = mainChar.characterName;
                const userGroups = mainChar.groups || [];
                item.innerHTML = `<div class="user-info"><span>${account.name} (${mainChar.characterName})</span><span class="user-rank">${mainChar.guildRank || 'Sem Rank'}</span></div><div class="user-groups-pills">${userGroups.map(gid => { const group = allGroups.find(g => g.id === gid); return `<span class="group-pill">${group ? group.name : '??'}</span>`; }).join('')}</div>`;
                item.addEventListener('click', () => {
                    selectedCharacterName = mainChar.characterName;
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
        allGroups.sort((a,b) => a.name.localeCompare(b.name)).forEach(group => {
            const item = document.createElement('div');
            item.className = 'group-item';
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
                if(confirm(`Deletar o grupo "${group.name}"?`)) {
                    window.appSocket.emit('admin:deleteGroup', group.id);
                }
            });
            adminGroupList.appendChild(item);
        });
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
        adminSelectedUserPanel.style.display = 'block';
        let userAccount, char;
        for (const email in allUsers) {
            const account = allUsers[email];
            const foundChar = account.tibiaCharacters?.find(c => c.characterName === selectedCharacterName);
            if (foundChar) {
                userAccount = account;
                char = foundChar;
                break;
            }
        }
        if (!userAccount || !char) return;
        const selectedUserName = document.getElementById('selected-user-name');
        if(selectedUserName) selectedUserName.textContent = `${userAccount.name} (${char.characterName})`;

        const userGroupsChecklist = document.getElementById('user-groups-checklist');
        if(!userGroupsChecklist) return;
        const currentUserGroupIds = new Set(char.groups || []);
        userGroupsChecklist.innerHTML = '';
        if (allGroups.length === 0) {
            userGroupsChecklist.innerHTML = '<p>Nenhum grupo global criado.</p>';
            return;
        }
        allGroups.forEach(group => {
            const isChecked = currentUserGroupIds.has(group.id);
            const checkItem = document.createElement('div');
            checkItem.className = 'group-checklist-item';
            checkItem.innerHTML = `<input type="checkbox" id="user-group-chk-${group.id}" data-group-id="${group.id}" ${isChecked ? 'checked' : ''}><label for="user-group-chk-${group.id}">${group.name}</label>`;
            userGroupsChecklist.appendChild(checkItem);
        });
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
            item.querySelector('.respawn-info-selectable').addEventListener('click', () => {
                selectedRespawnCode = respawn.code;
                document.getElementById('admin-respawn-form').reset();
                renderAdminPanel();
            });
            adminRespawnList.appendChild(item);
        });
    }

    function renderSelectedRespawnPanel() {
        const adminSelectedRespawnPanel = document.getElementById('admin-selected-respawn-panel');
        const selectedRespawnName = document.getElementById('selected-respawn-name');
        const respawnGroupsChecklist = document.getElementById('respawn-groups-checklist');
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
        if(selectedRespawnName) selectedRespawnName.textContent = respawnName;

        if(!respawnGroupsChecklist) return;
        const currentRespawnGroupIds = new Set(allRespawnGroups[selectedRespawnCode] || []);
        respawnGroupsChecklist.innerHTML = '';
        if (allGroups.length === 0) {
            respawnGroupsChecklist.innerHTML = '<p>Nenhum grupo global criado.</p>';
            return;
        }
        allGroups.forEach(group => {
            const isChecked = currentRespawnGroupIds.has(group.id);
            const checkItem = document.createElement('div');
            checkItem.className = 'group-checklist-item';
            checkItem.innerHTML = `<input type="checkbox" id="respawn-group-chk-${group.id}" data-group-id="${group.id}" ${isChecked ? 'checked' : ''}><label for="respawn-group-chk-${group.id}">${group.name}</label>`;
            respawnGroupsChecklist.appendChild(checkItem);
        });
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
        // Listener para cliques nos botões de ação (delegação de evento)
        adminModal.addEventListener('click', (e) => {
            const target = e.target;
            
            // Botões na lista de Respawns
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

            // Botão na lista de Cooldowns
            const removeCooldownBtn = target.closest('.remove-cooldown-btn');
            if (removeCooldownBtn) {
                if (confirm(`Remover cooldown para ${removeCooldownBtn.dataset.userIdentifier}?`)) {
                    window.appSocket.emit('admin:removeCooldown', removeCooldownBtn.dataset.userIdentifier);
                }
                return;
            }

            // Botão na aba de Tempos
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
                    respawnTimes[rankName] = rankTime; // Adiciona ao estado local
                    renderTimesManagementPanel();     // Re-renderiza a lista
                    nameInput.value = '';
                } else {
                    alert('Nome de rank ou tempo inválido.');
                }
                return;
            }
        });

        // Listener para o formulário de edição de respawn
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