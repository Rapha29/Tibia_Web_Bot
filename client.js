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

const originalLoadPage = window.loadPage;
window.loadPage = async function(pageName) {
    if (typeof originalLoadPage === 'function' && originalLoadPage !== window.loadPage) {
        await originalLoadPage(pageName);
    }
    
    if (pageName === 'bosses') {
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
        const highlightClass = (isOwner || isInQueue) ? 'user-highlight' : '';

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
                tempoText = `<span class="red">${formatMinutesToHHMM(displayRemaining)}</span> / <span>${formatMinutesToHHMM(current?.allocatedTime || 0)}</span>`;
            }
        }

        const renderPlayerName = (user) => {
            if (!user || !user.clientNickname) return 'Ninguém';
            
            const isAdmin = window.isAdmin;
            const star = (user.plusExpiresAt && new Date(user.plusExpiresAt) > now) ? '<span class="plus-star" title="Usuário Plus">⭐</span>' : '';
            const createStreamIcon = (link) => link ? ` <a href="${link}" target="_blank" title="Assistir ao Vivo" class="stream-icon"><i class="fab fa-twitch"></i></a>` : '';

            if (user.isMakerHunt && user.makerName) {
                if (user.isMakerOnline) {
                    const onlineClass = 'status-online';
                    const tooltip = `maker de ${user.clientNickname}`;
                    const makerAlertIcon = `<span title="${tooltip}" style="cursor:help;">⚠️</span>`;
                    const kickButton = isAdmin ? `<button title="Remover" class="respawn-action-btn admin-kick-btn" data-respawn-code="${code}" data-user-to-kick="${user.clientNickname}">❌</button>` : '';
                    return `${star} ${makerAlertIcon} <a href="#" class="character-log-link ${onlineClass}" data-character-name="${user.makerName}">${user.makerName}</a> ${kickButton}`;
                } else {
                    const onlineClass = user.isOnline ? 'status-online' : 'status-offline';
                    const kickButton = isAdmin ? `<button title="Remover" class="respawn-action-btn admin-kick-btn" data-respawn-code="${code}" data-user-to-kick="${user.clientNickname}">❌</button>` : '';
                    const makerOfflineAlert = `<span style="font-size: 0.8em; color: #ffc107;">(Maker offline)</span>`;
                    return `${star}<a href="#" class="character-log-link ${onlineClass}" data-character-name="${user.clientNickname}">${user.clientNickname}</a> ${makerOfflineAlert} ${createStreamIcon(user.streamLink)} ${kickButton}`;
                }
            }

            const onlineClass = user.isOnline ? 'status-online' : 'status-offline';
            const kickButton = isAdmin ? `<button title="Remover" class="respawn-action-btn admin-kick-btn" data-respawn-code="${code}" data-user-to-kick="${user.clientNickname}">❌</button>` : '';
            return `${star}<a href="#" class="character-log-link ${onlineClass}" data-character-name="${user.clientNickname}">${user.clientNickname}</a>${createStreamIcon(user.streamLink)} ${kickButton}`;
        };
        
        const characterLink = renderPlayerName(current);
        let nextsContent = 'Nenhum';
        if (queue.length > 0) {
            const fullQueueList = queue.slice(1).map((p, i) => `<div class="queue-item">${i + 2}. ${renderPlayerName(p)}</div>`).join('');
            const expandButton = queue.length > 1 ? ` <button class="queue-expand-btn">(${queue.length})</button>` : '';
            nextsContent = `<div class="nexts-container"><span>1. ${renderPlayerName(queue[0])}</span>${expandButton}<div class="full-queue-list">${fullQueueList}</div></div>`;
        }
        
        const respawnLink = window.isAdmin ? `<a href="#" class="respawn-log-link" data-respawn-code="${code}">${name}</a>` : name;
        let actionContent = '';
        if (isOwner || isInQueue) {
            actionContent += `<button class="action-btn leave-respawn-btn" data-respawn-code="${code}">Sair</button>`;
        }
        if (window.isAdmin && current) {
            actionContent += entry.paused ? `<button title="Despausar" class="respawn-action-btn unpause" data-respawn-code="${code}">▶️</button>` : `<button title="Pausar" class="respawn-action-btn pause" data-respawn-code="${code}">⏸️</button>`;
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

    document.dispatchEvent(new Event('socketReady'));

    window.appSocket.on('connect', () => {
        const now = new Date();
        const clientTime = {
            // Envia a data completa no padrão ISO (UTC)
            timestamp: now.toISOString(),
            // Envia o "offset" do fuso horário em minutos. Ex: -180 para GMT-3
            timezoneOffset: now.getTimezoneOffset()
        };
        window.appSocket.emit('user:time_info', clientTime);
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

    window.cachedRespawnData = { fila: {}, respawns: {} };

    const beepSound = new Audio('beep.mp3');
    beepSound.volume = 1;

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

    window.appSocket.on('login:success', (data) => {
        if (data.token) {
            localStorage.setItem('sessionToken', data.token);
        }
        window.currentUser = data; 
        
        window.appSocket.emit('user:get_initial_data');
        setupLoggedInUI(data.account, data.character);
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
    if(!chatLog) return;
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
        textSpan.textContent = (typeof message === 'object' && message !== null) ? JSON.stringify(message) : String(message);
        entry.appendChild(textSpan);
        if (sender === 'Bot' && alertEnabledCheckbox.checked) {

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
        if (alertEnabledCheckbox.checked) { 
            alert(`ANÚNCIO DE ${sender.toUpperCase()}:\n\n${message}`);
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

    function showEnemyAlert(enemy) {
        if (alertEnabledCheckbox && alertEnabledCheckbox.checked) {
            alert(`ALERTA! O inimigo ${enemy.name} (level ${enemy.level}) está online!`);
        }
        const message = `⚔️ ALERTA! Inimigo ${enemy.name} (level ${enemy.level}, ${enemy.vocation}) está online! ⚔️`;
        addBroadcastMessage('Sistema de Alerta', message, 'enemy'); // Usando um novo tipo 'enemy'
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
        (account.characterName && account.characterName.toLowerCase().includes(searchTerm))
    );

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
                <div class="user-info-full">
                    <strong>${account.name}</strong>
                    <button class="action-btn view-details-btn" data-email="${email}">Ver Detalhes</button>
                </div>
                <div class="user-chars-list">
                    <strong>Personagem Principal:</strong>
                    <div class="char-details">${charHtml}</div>
                </div>
            `;
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
                    <button class="admin-action-btn danger-btn remove-user-from-group-btn" data-character-name="${user.characterName}" data-group-id="${selectedGroupId}">Remover</button>
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
    if(selectedUserNameEl) selectedUserNameEl.textContent = `${userAccount.name} (${userAccount.characterName})`;

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
        if (selectedRespawnNameEl) selectedRespawnNameEl.textContent = respawnName;
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