function initializeFriendsPage(socket) {
    const alliesListEl = document.getElementById('allies-list');
    const enemiesListEl = document.getElementById('enemies-list');
    const huntedsListEl = document.getElementById('hunteds-list');
    const adminPanel = document.getElementById('admin-guild-management');
    const toggleAdminBtn = document.getElementById('toggle-admin-panel-btn');
    const syncStatusEl = document.getElementById('sync-status');
    
    if (window.isAdmin) {
        if (toggleAdminBtn) toggleAdminBtn.style.display = 'inline-block';
        if (document.getElementById('open-admin-modal-btn'))
            document.getElementById('open-admin-modal-btn').style.display = 'inline-block';
    }

    if (toggleAdminBtn) {
        toggleAdminBtn.addEventListener('click', () => {
            adminPanel.style.display = adminPanel.style.display === 'none' ? 'block' : 'none';
        });
    }

    const style = document.createElement('style');
    style.textContent = `
        .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
        .status-indicator.online { background-color: #28a745; }
        .status-indicator.offline { background-color: #dc3545; }
        .player-name.online { color: #28a745; }
        .player-name.offline { color: #dc3545; }
        #source-allies-list li, #source-enemies-list li, #source-hunteds-list li { display: flex; justify-content: space-between; align-items: center; padding: 5px; border-radius: 3px; }
        #source-allies-list li:hover, #source-enemies-list li:hover, #source-hunteds-list li:hover { background-color: #21262d; }
        .remove-relation-btn { background: none; border: none; color: #DA3633; cursor: pointer; font-size: 1.1em; }
    `;
    document.head.appendChild(style);

    socket.on('friends:dataUpdated', (data) => {
        renderGroupedList(alliesListEl, data.players_allies, 'allies', 'allies-online-count');
        renderGroupedList(enemiesListEl, data.players_enemies, 'enemies', 'enemies-online-count');
        renderGroupedList(huntedsListEl, data.players_hunteds, 'hunteds', 'hunteds-online-count');
        
        if (syncStatusEl && data.last_sync)
            syncStatusEl.textContent = `Última sincronização: ${new Date(data.last_sync).toLocaleString('pt-BR')}`;
            
        // Adicionada a chamada para renderizar as listas do admin
        if (window.isAdmin) {
            renderAdminSourceLists(data);
        }
    });
    
    socket.emit('friends:getData');

    if (window.friendsUpdateInterval) clearInterval(window.friendsUpdateInterval);
    window.friendsUpdateInterval = setInterval(() => {
        socket.emit('friends:getData');
    }, 4 * 60 * 1000);
    
    if (window.isAdmin) {
        setupAdminControls(socket, adminPanel);
    }
}

function renderGroupedList(container, players, type, countId) {
    if (!container) return;
    container.innerHTML = '';
    const vocations = { Knights: [], Druids: [], Sorcerers: [], Paladins: [], Monks: [], Outros: [] };
    const online = [], offline = [];

    players.forEach(p => {
        const voc = p.vocation || 'N/A';
        let vocGroup = 'Outros';
        if (voc.includes('Knight')) vocGroup = 'Knights';
        else if (voc.includes('Druid')) vocGroup = 'Druids';
        else if (voc.includes('Sorcerer')) vocGroup = 'Sorcerers';
        else if (voc.includes('Paladin')) vocGroup = 'Paladins';
        else if (voc.includes('Monk')) vocGroup = 'Monks';
        p.vocGroup = vocGroup;
        if (p.online) online.push(p); else offline.push(p);
    });

    const vocOrder = ['Knights', 'Druids', 'Sorcerers', 'Paladins', 'Monks', 'Outros'];
    const renderGroup = (playersGroup, status) => {
        let html = '';
        for (const voc of vocOrder) {
            const list = playersGroup.filter(p => p.vocGroup === voc);
            if (list.length) {
                list.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
                html += `<div class="voc-section"><strong>${voc} (${list.length})</strong><ul class="list-unstyled">`;
                for (const p of list) {
                    html += `<li>
                        <span class="status-indicator ${status}"></span>
                        <span class="player-name fw-bold me-1">${p.name} </span>(${p.level})
                    </li>`;
                }
                html += `</ul></div>`;
            }
        }
        return html;
    };
    
    const html = `${renderGroup(online, 'online')} ${renderGroup(offline, 'offline')}`;
    container.innerHTML = html;
    const countLabel = document.getElementById(countId);
    if (countLabel) countLabel.textContent = `🟢 ${online.length} | 🔴 ${offline.length}`;
}

function handleGuildSubmit(e, socket, type) {
    e.preventDefault();
    const input = e.target.querySelector('input[name="guild_name"]');
    const name = input.value.trim();
    if (name) socket.emit('admin:addRelation', { type: `source_${type}`, name });
    e.target.reset();
}

// Nova função para renderizar as listas de fontes no painel de admin
function renderAdminSourceLists(relations) {
    const lists = {
        source_allies: document.getElementById('source-allies-list'),
        source_enemies: document.getElementById('source-enemies-list'),
        source_hunteds: document.getElementById('source-hunteds-list')
    };

    for (const key in lists) {
        if (lists[key]) lists[key].innerHTML = '';
    }

    if (lists.source_allies && relations.source_allies) {
        relations.source_allies.forEach(name => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${name}</span> <button class="remove-relation-btn" data-type="source_allies" data-name="${name}">🗑️</button>`;
            lists.source_allies.appendChild(li);
        });
    }

    if (lists.source_enemies && relations.source_enemies) {
        relations.source_enemies.forEach(name => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${name}</span> <button class="remove-relation-btn" data-type="source_enemies" data-name="${name}">🗑️</button>`;
            lists.source_enemies.appendChild(li);
        });
    }

    if (lists.source_hunteds && relations.source_hunteds) {
        relations.source_hunteds.forEach(hunted => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${hunted.name} (${hunted.reason})</span> <button class="remove-relation-btn" data-type="source_hunteds" data-name="${hunted.name}">🗑️</button>`;
            lists.source_hunteds.appendChild(li);
        });
    }
}

function setupAdminControls(socket, adminPanel) {
    const forms = {
        ally: document.getElementById('add-ally-form'),
        enemy: document.getElementById('add-enemy-form'),
        hunted: document.getElementById('add-hunted-form')
    };
    
    if (forms.ally) forms.ally.addEventListener('submit', e => handleGuildSubmit(e, socket, 'allies'));
    if (forms.enemy) forms.enemy.addEventListener('submit', e => handleGuildSubmit(e, socket, 'enemies'));
    if (forms.hunted) {
        forms.hunted.addEventListener('submit', e => {
            e.preventDefault();
            const name = e.target.hunted_name.value.trim();
            const reason = e.target.hunted_reason.value.trim();
            if (name && reason)
                socket.emit('admin:addRelation', { type: 'source_hunteds', name, reason });
            e.target.reset();
        });
    }

    // Listener para os botões de remover
    const sourceListsContainer = adminPanel.querySelector('.source-lists');
    if (sourceListsContainer) {
        sourceListsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.remove-relation-btn');
            if (btn) {
                const type = btn.dataset.type;
                const name = btn.dataset.name;
                if (type && name && confirm(`Tem certeza que deseja remover "${name}" da lista?`)) {
                    socket.emit('admin:removeRelation', { type, name });
                }
            }
        });
    }

    const syncBtn = document.getElementById('manual-sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            const syncStatus = document.getElementById('sync-status');
            if (syncStatus) syncStatus.innerHTML = '<span class="sync-spinner"></span> Sincronizando...';
            socket.emit('admin:syncRelations');
        });
    }
}