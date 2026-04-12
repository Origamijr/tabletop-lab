// UI Editor Module - Handles zone management and grid preview

class UIEditorModule {
    constructor() {
        this.gameData = null;
    }

    init(gameData) {
        this.gameData = gameData;
        this.setupEventListeners();
        this.render();
    }

    setupEventListeners() {
        const nameInput = document.getElementById('ui-game-name');
        const playersInput = document.getElementById('ui-players');
        const addZoneBtn = document.getElementById('btn-add-zone');

        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                this.gameData.gamename = e.target.value;
                window.editor.saveToLocalStorage();
            });
        }

        if (playersInput) {
            playersInput.addEventListener('change', (e) => {
                this.gameData.players = parseInt(e.target.value);
                window.editor.saveToLocalStorage();
            });
        }

        if (addZoneBtn) {
            addZoneBtn.addEventListener('click', () => this.addZone());
        }
    }

    render() {
        const nameInput = document.getElementById('ui-game-name');
        const playersInput = document.getElementById('ui-players');

        if (nameInput) nameInput.value = this.gameData.gamename;
        if (playersInput) playersInput.value = this.gameData.players;

        this.renderZones();
        this.renderGridPreview();
    }

    addZone() {
        // Generate a unique temporary ID for the empty row
        const tempId = `_new_${Date.now()}`;
        this.gameData.zones[tempId] = {
            quantity: 1,
            visibility: true,
            display_mode: 'spread-x'
        };
        window.editor.saveToLocalStorage();
        this.renderZones();
    }

    deleteZone(zoneName) {
        delete this.gameData.zones[zoneName];
        window.editor.saveToLocalStorage();
        this.renderZones();
        this.renderGridPreview();
    }

    updateZone(zoneName, property, value) {
        if (this.gameData.zones[zoneName]) {
            this.gameData.zones[zoneName][property] = value;
            window.editor.saveToLocalStorage();
            this.renderGridPreview();
        }
    }

    renameZone(oldName, newName) {
        if (!newName || newName === oldName) return false;
        if (this.gameData.zones[newName]) {
            alert('Zone name already exists');
            return false;
        }
        this.gameData.zones[newName] = this.gameData.zones[oldName];
        delete this.gameData.zones[oldName];
        window.editor.saveToLocalStorage();
        return true;
    }

    renderZones() {
        const list = document.getElementById('ui-zones-list');
        if (!list) return;

        list.innerHTML = '';

        // Create table header
        const header = document.createElement('div');
        header.className = 'zone-table-header';
        header.innerHTML = `
            <div class="zone-col-name">Name</div>
            <div class="zone-col-qty">Qty</div>
            <div class="zone-col-visibility">Visibility</div>
            <div class="zone-col-display">Display</div>
        `;
        list.appendChild(header);

        // Create table rows
        for (const [name, config] of Object.entries(this.gameData.zones)) {
            const isNew = name.startsWith('_new_');
            const row = document.createElement('div');
            row.className = 'zone-table-row';
            row.innerHTML = `
                <div class="zone-col-name"><input type="text" class="zone-name-input" value="${isNew ? '' : name}" placeholder="Zone name"></div>
                <div class="zone-col-qty"><input type="number" class="zone-qty-input" value="${config.quantity}" min="1"></div>
                <div class="zone-col-visibility">
                    <select class="zone-visibility-select">
                        <option value="true" ${config.visibility === true || config.visibility === 'true' ? 'selected' : ''}>Public</option>
                        <option value="false" ${config.visibility === false || config.visibility === 'false' ? 'selected' : ''}>Private</option>
                        <option value="player" ${config.visibility === 'player' ? 'selected' : ''}>Player</option>
                    </select>
                </div>
                <div class="zone-col-display">
                    <select class="zone-display-select">
                        <option value="spread-x" ${config.display_mode === 'spread-x' ? 'selected' : ''}>Spread-X</option>
                        <option value="spread-y" ${config.display_mode === 'spread-y' ? 'selected' : ''}>Spread-Y</option>
                        <option value="stack" ${config.display_mode === 'stack' ? 'selected' : ''}>Stack</option>
                        <option value="grid" ${config.display_mode === 'grid' ? 'selected' : ''}>Grid</option>
                    </select>
                </div>
                <button class="zone-delete-btn" type="button">×</button>
            `;

            // Add event listeners
            const nameInput = row.querySelector('.zone-name-input');
            const qtyInput = row.querySelector('.zone-qty-input');
            const visibilitySelect = row.querySelector('.zone-visibility-select');
            const displaySelect = row.querySelector('.zone-display-select');
            const deleteBtn = row.querySelector('.zone-delete-btn');

            nameInput.addEventListener('blur', () => {
                const newName = nameInput.value.trim();
                if (newName && isNew) {
                    // Rename from temp ID to actual name
                    if (this.renameZone(name, newName)) {
                        this.renderZones();
                    } else {
                        nameInput.value = '';
                    }
                } else if (newName && newName !== name) {
                    // Rename existing zone
                    if (this.renameZone(name, newName)) {
                        this.renderZones();
                    }
                }
            });

            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    nameInput.blur();
                }
            });

            qtyInput.addEventListener('change', () => {
                this.updateZone(name, 'quantity', parseInt(qtyInput.value) || 1);
            });

            visibilitySelect.addEventListener('change', () => {
                const value = visibilitySelect.value;
                this.updateZone(name, 'visibility', value === 'true' ? true : value === 'false' ? false : value);
            });

            displaySelect.addEventListener('change', () => {
                this.updateZone(name, 'display_mode', displaySelect.value);
            });

            deleteBtn.addEventListener('click', () => {
                this.deleteZone(name);
            });

            list.appendChild(row);
        }
    }

    renderGridPreview() {
        const preview = document.getElementById('ui-grid-preview');
        if (!preview) return;

        const realZones = Object.entries(this.gameData.zones).filter(([name]) => !name.startsWith('_new_'));

        if (realZones.length === 0) {
            preview.innerHTML = '<p class="placeholder">Add zones to preview grid layout</p>';
            return;
        }

        preview.innerHTML = '';
        for (const [name, config] of realZones) {
            const zone = document.createElement('div');
            zone.className = 'grid-zone';
            zone.textContent = `${name}\n×${config.quantity}`;
            preview.appendChild(zone);
        }
    }

    generateUIHTML(gameData) {
        const zones = Object.entries(gameData.zones).filter(([name]) => !name.startsWith('_new_'));
        const zoneRows = zones.map(([name, config]) => {
            const cols = Array(config.quantity || 1)
                .fill(0)
                .map((_, i) => `<div id="${name}-${i + 1}" class="zone" data-zone-name="${name}" data-zone-index="${i + 1}">${name}</div>`)
                .join('\n        ');
            return cols;
        }).join('\n        ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${gameData.gamename} - UI</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 1rem;
            background: #f0f0f0;
            font-family: Arial, sans-serif;
        }

        .game-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        h1 {
            margin-top: 0;
            color: #333;
        }

        .zones-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-top: 2rem;
        }

        .zone {
            min-height: 200px;
            border: 2px solid #ddd;
            border-radius: 8px;
            padding: 1rem;
            background: #fafafa;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            color: #666;
            text-align: center;
            font-weight: 500;
        }

        .zone:hover {
            background: #f5f5f5;
            border-color: #999;
        }

        @media (max-width: 768px) {
            .game-container {
                padding: 1rem;
            }

            .zones-grid {
                grid-template-columns: 1fr;
            }

            .zone {
                min-height: 150px;
            }
        }
    </style>
</head>
<body>
    <div class="game-container">
        <h1>${gameData.gamename}</h1>
        <p>Players: ${gameData.players}</p>
        <div class="zones-grid">
            ${zoneRows}
        </div>
    </div>
</body>
</html>`;
    }
}

// Initialize the UI editor module
window.UIEditor = new UIEditorModule();
