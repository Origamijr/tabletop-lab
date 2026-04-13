/**
 * board/board.js
 * Visual zone-placement editor.
 * - Grid canvas with configurable cell size (stored in ui.json gridSize)
 * - Zones dragged from sidebar onto canvas, resizable
 * - Each zone instance labelled: absolute (hand-1, hand-2) or relative (hand-1p, hand-2p)
 * - Generates self-contained ui.html on export
 */

class BoardEditorModule {
    constructor() {
        this.selected = null;   // { zoneName, instanceIdx, el }
        this.snapEnabled = true;
        this._drag = null;      // active drag/resize state
        this._rendered = false;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
        if (!this._rendered) {
            this._buildDOM();
            this._rendered = true;
        }
        this._syncFromConfig();
    }

    refresh() {
        if (this._rendered) this._syncFromConfig();
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    _buildDOM() {
        const pane = document.getElementById('pane-board');
        pane.innerHTML = '';

        const root = document.createElement('div');
        root.className = 'board-editor';

        // Toolbar
        root.innerHTML = `
        <div class="board-toolbar">
            <button class="btn btn-sm" id="board-btn-clear-sel">Deselect</button>
            <button class="btn btn-sm btn-danger" id="board-btn-delete">Delete</button>
            <div class="toolbar-right">
                <label class="snap-toggle">
                    <input type="checkbox" id="board-snap" checked>
                    Snap to grid
                </label>
            </div>
        </div>
        <div class="board-main">
            <div class="board-sidebar">
                <div class="board-sidebar-section">
                    <h4>Zones</h4>
                    <button class="btn btn-sm" id="board-btn-add-zone" style="width:100%;margin-bottom:0.5rem;">+ Zone</button>
                    <div class="board-zone-list" id="board-zone-list"></div>
                </div>
                <div class="board-sidebar-section">
                    <div id="board-props-panel">
                        <p class="no-selection">Nothing selected</p>
                    </div>
                </div>
            </div>
            <div class="board-canvas-wrap" id="board-canvas-wrap">
                <div class="board-canvas" id="board-canvas"></div>
            </div>
            <div class="board-right-panel" id="board-right-panel" style="display:flex;flex-direction:row;">
                <div class="panel-collapse-toggle" id="board-settings-toggle">
                    <span id="board-settings-toggle-arrow">›</span>
                </div>
                <div style="display:flex;flex-direction:column;flex:1;min-width:0;">
                    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <span>Game Settings</span>
                    </div>
                    <div class="board-settings-body" id="board-settings-body">
                    <div class="form-group">
                        <label>Game Name</label>
                        <input type="text" id="board-game-name" placeholder="Game name">
                    </div>
                    <div class="form-group">
                        <label>Players</label>
                        <input type="number" id="board-game-players" min="1" max="20" placeholder="Number of players">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="board-game-description" placeholder="Game description" rows="4"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Rules</label>
                        <textarea id="board-game-rules" placeholder="Game rules" rows="4"></textarea>
                    </div>
                    <hr style="border:none;border-top:1px solid var(--color-border);margin:0.75rem 0;">
                    <div class="form-group">
                        <label>Grid Size (px)</label>
                        <div class="grid-config">
                            <div class="cfg-row">
                                <label>Width</label>
                                <input type="number" id="board-grid-w" min="8" max="400" value="63">
                            </div>
                            <div class="cfg-row">
                                <label>Height</label>
                                <input type="number" id="board-grid-h" min="8" max="400" value="88">
                            </div>
                        </div>
                    </div>
                    </div>
                </div>
            </div>
        </div>`;

        pane.appendChild(root);
        this._bindToolbar();
    }

    _bindToolbar() {
        document.getElementById('board-snap').addEventListener('change', e => {
            this.snapEnabled = e.target.checked;
        });

        document.getElementById('board-grid-w').addEventListener('change', e => {
            window.gameConfig.ui.gridSize.w = parseInt(e.target.value) || 63;
            this._applyGrid();
            window.editor.saveToStorage();
        });

        document.getElementById('board-grid-h').addEventListener('change', e => {
            window.gameConfig.ui.gridSize.h = parseInt(e.target.value) || 88;
            this._applyGrid();
            window.editor.saveToStorage();
        });

        // Game metadata
        document.getElementById('board-game-name').addEventListener('change', e => {
            window.gameConfig.setMetadata({ name: e.target.value });
            window.editor.saveToStorage();
        });

        document.getElementById('board-game-players').addEventListener('change', e => {
            window.gameConfig.setMetadata({ players: parseInt(e.target.value) || 1 });
            window.editor.saveToStorage();
        });

        document.getElementById('board-game-description').addEventListener('change', e => {
            window.gameConfig.setMetadata({ description: e.target.value });
            window.editor.saveToStorage();
        });

        document.getElementById('board-game-rules').addEventListener('change', e => {
            window.gameConfig.setMetadata({ rules: e.target.value });
            window.editor.saveToStorage();
        });

        // Settings panel collapse
        const settingsToggle = document.getElementById('board-settings-toggle');
        const settingsArrow = document.getElementById('board-settings-toggle-arrow');
        const settingsBody = document.getElementById('board-settings-body');
        const rightPanel = document.getElementById('board-right-panel');
        if (settingsToggle && settingsBody && rightPanel) {
            this._settingsCollapsed = false;
            settingsToggle.addEventListener('click', () => {
                this._settingsCollapsed = !this._settingsCollapsed;
                rightPanel.classList.toggle('collapsed', this._settingsCollapsed);
                if (settingsArrow) settingsArrow.textContent = this._settingsCollapsed ? '‹' : '›';
            });
        }

        // Add zone button
        document.getElementById('board-btn-add-zone').addEventListener('click', () => this._addZone());

        document.getElementById('board-btn-clear-sel').addEventListener('click', () => this._deselect());
        document.getElementById('board-btn-delete').addEventListener('click', () => this._deleteSelected());

        // Click on canvas background = deselect
        document.getElementById('board-canvas').addEventListener('mousedown', e => {
            if (e.target === document.getElementById('board-canvas')) this._deselect();
        });
    }

    // ── Sync ──────────────────────────────────────────────────────────────────

    _syncFromConfig() {
        const gs = window.gameConfig.getGridSize();
        const wInput = document.getElementById('board-grid-w');
        const hInput = document.getElementById('board-grid-h');
        if (wInput) wInput.value = gs.w;
        if (hInput) hInput.value = gs.h;

        // Populate metadata
        const meta = window.gameConfig.getMetadata();
        const nameInput = document.getElementById('board-game-name');
        const playersInput = document.getElementById('board-game-players');
        const descInput = document.getElementById('board-game-description');
        const rulesInput = document.getElementById('board-game-rules');
        
        if (nameInput) nameInput.value = meta?.name || '';
        if (playersInput) playersInput.value = meta?.players || '';
        if (descInput) descInput.value = meta?.description || '';
        if (rulesInput) rulesInput.value = meta?.rules || '';

        this._applyGrid();
        this._renderZoneList();
        this._renderCanvas();
    }

    _applyGrid() {
        const { w, h } = window.gameConfig.getGridSize();
        const canvas = document.getElementById('board-canvas');
        if (!canvas) return;
        canvas.style.backgroundSize = `${w}px ${h}px`;
        // Ensure canvas is large enough (at least 20×15 cells)
        canvas.style.width  = Math.max(canvas.parentElement.clientWidth,  w * 20) + 'px';
        canvas.style.height = Math.max(canvas.parentElement.clientHeight, h * 15) + 'px';
    }

    // ── Zone management ──────────────────────────────────────────────────────

    _addZone() {
        const zones = window.gameConfig.getZones();
        let num = 1;
        let name = `Zone${num}`;
        while (zones[name]) {
            num++;
            name = `Zone${num}`;
        }
        window.gameConfig.setZone(name, { quantity: 1, type: 'rect', style: {} });
        window.editor?.markDirty();
        this._renderZoneList();
    }

    // ── Zone sidebar list ─────────────────────────────────────────────────────

    _renderZoneList() {
        const list = document.getElementById('board-zone-list');
        if (!list) return;
        list.innerHTML = '';

        const zones   = window.gameConfig.getZones();
        const layout  = window.gameConfig.getLayout();

        for (const [name, cfg] of Object.entries(zones)) {
            const qty     = cfg.quantity || 1;
            const placed  = layout[name] ? layout[name].instances.length : 0;
            const entry   = document.createElement('div');
            entry.className = 'board-zone-entry' + (placed > 0 ? ' placed' : '');
            entry.innerHTML = `<span>${name}</span><span class="zone-entry-qty">${placed}/${qty}</span>`;
            entry.addEventListener('click', () => this._placeNextInstance(name, cfg));
            list.appendChild(entry);
        }

        if (Object.keys(zones).length === 0) {
            list.innerHTML = '<p class="no-selection">No zones defined.<br>Add zones in the game.json or here.</p>';
        }
    }

    // ── Canvas rendering ──────────────────────────────────────────────────────

    _renderCanvas() {
        const canvas = document.getElementById('board-canvas');
        if (!canvas) return;
        // Remove all zone divs, rebuild
        canvas.querySelectorAll('.board-zone-div').forEach(el => el.remove());

        const layout = window.gameConfig.getLayout();
        for (const [zoneName, zl] of Object.entries(layout)) {
            (zl.instances || []).forEach((inst, idx) => {
                this._createZoneDiv(zoneName, idx, inst, zl);
            });
        }
    }

    _createZoneDiv(zoneName, instanceIdx, inst, zl) {
        const canvas = document.getElementById('board-canvas');
        const isRel  = zl.indexing === 'relative';
        const label  = isRel
            ? `${zoneName}-${instanceIdx + 1}p`
            : `${zoneName}-${instanceIdx + 1}`;

        const el = document.createElement('div');
        el.className = 'board-zone-div' + (isRel ? ' relative-indexed' : '');
        el.dataset.zone  = zoneName;
        el.dataset.idx   = instanceIdx;
        el.style.left    = inst.x + 'px';
        el.style.top     = inst.y + 'px';
        el.style.width   = inst.w + 'px';
        el.style.height  = inst.h + 'px';

        el.innerHTML = `
            <div class="zone-div-label">${label}</div>
            <div class="zone-div-index">${instanceIdx + 1}</div>
            <div class="resize-handle"></div>`;

        el.addEventListener('mousedown', e => this._onDivMousedown(e, el, zoneName, instanceIdx));
        el.querySelector('.resize-handle').addEventListener('mousedown', e => {
            e.stopPropagation();
            this._onResizeMousedown(e, el, zoneName, instanceIdx);
        });

        canvas.appendChild(el);
        return el;
    }

    // ── Place / delete instances ───────────────────────────────────────────────

    _placeNextInstance(zoneName, zoneCfg) {
        const { w, h }   = window.gameConfig.getGridSize();
        const layout     = window.gameConfig.getLayout();
        const qty        = zoneCfg.quantity || 1;
        const zl         = layout[zoneName] || { indexing: 'absolute', instances: [] };
        const placed     = zl.instances.length;

        if (placed >= qty) {
            alert(`All ${qty} instance(s) of "${zoneName}" are already placed.`);
            return;
        }

        // Default position: offset by instance count
        const inst = { x: w * placed, y: 0, w, h };
        zl.instances.push(inst);
        window.gameConfig.setZoneLayout(zoneName, zl);

        this._createZoneDiv(zoneName, placed, inst, zl);
        this._renderZoneList();
        window.editor.saveToStorage();
    }

    _deleteSelected() {
        if (!this.selected) return;
        const { zoneName, instanceIdx, el } = this.selected;
        const layout = window.gameConfig.getLayout();
        const zl = layout[zoneName];
        if (!zl) return;

        zl.instances.splice(instanceIdx, 1);
        if (zl.instances.length === 0) {
            window.gameConfig.deleteZoneLayout(zoneName);
        } else {
            window.gameConfig.setZoneLayout(zoneName, zl);
        }

        el.remove();
        this._deselect();
        // Re-render to fix indices
        this._renderCanvas();
        this._renderZoneList();
        window.editor.saveToStorage();
    }

    // ── Selection ─────────────────────────────────────────────────────────────

    _select(zoneName, instanceIdx, el) {
        this._deselect();
        this.selected = { zoneName, instanceIdx, el };
        el.classList.add('selected');
        this._renderPropsPanel(zoneName, instanceIdx);
    }

    _deselect() {
        if (this.selected) {
            this.selected.el.classList.remove('selected');
            this.selected = null;
        }
        this._renderPropsPanel(null, null);
    }

    _renderPropsPanel(zoneName, instanceIdx) {
        const panel = document.getElementById('board-props-panel');
        if (!panel) return;

        if (zoneName === null) {
            panel.innerHTML = '<p class="no-selection">Nothing selected</p>';
            return;
        }

        const layout = window.gameConfig.getLayout();
        const zl     = layout[zoneName];
        const inst   = zl.instances[instanceIdx];

        panel.innerHTML = `
            <div class="board-props">
                <div class="prop-row">
                    <label>Zone</label>
                    <span style="font-size:var(--font-size-small); color:var(--color-text-accent)">${zoneName}</span>
                </div>
                <div class="prop-row">
                    <label>Index</label>
                    <span style="font-size:var(--font-size-small)">${instanceIdx + 1}</span>
                </div>
                <div class="prop-row">
                    <label>X (px)</label>
                    <input type="number" id="prop-x" value="${inst.x}">
                </div>
                <div class="prop-row">
                    <label>Y (px)</label>
                    <input type="number" id="prop-y" value="${inst.y}">
                </div>
                <div class="prop-row">
                    <label>W (px)</label>
                    <input type="number" id="prop-w" value="${inst.w}">
                </div>
                <div class="prop-row">
                    <label>H (px)</label>
                    <input type="number" id="prop-h" value="${inst.h}">
                </div>
                <div class="prop-row">
                    <label>Indexing</label>
                    <select id="prop-indexing">
                        <option value="absolute" ${zl.indexing === 'absolute' ? 'selected' : ''}>Absolute</option>
                        <option value="relative" ${zl.indexing === 'relative' ? 'selected' : ''}>Relative to player</option>
                    </select>
                </div>
            </div>`;

        // Bind prop inputs
        const update = () => {
            inst.x = parseInt(document.getElementById('prop-x').value) || 0;
            inst.y = parseInt(document.getElementById('prop-y').value) || 0;
            inst.w = parseInt(document.getElementById('prop-w').value) || 40;
            inst.h = parseInt(document.getElementById('prop-h').value) || 40;
            this.selected.el.style.left   = inst.x + 'px';
            this.selected.el.style.top    = inst.y + 'px';
            this.selected.el.style.width  = inst.w + 'px';
            this.selected.el.style.height = inst.h + 'px';
            window.editor.saveToStorage();
        };

        ['prop-x','prop-y','prop-w','prop-h'].forEach(id =>
            document.getElementById(id).addEventListener('change', update)
        );

        document.getElementById('prop-indexing').addEventListener('change', e => {
            zl.indexing = e.target.value;
            window.gameConfig.setZoneLayout(zoneName, zl);
            // Re-render canvas to update labels
            this._renderCanvas();
            this._select(zoneName, instanceIdx,
                document.querySelector(`.board-zone-div[data-zone="${zoneName}"][data-idx="${instanceIdx}"]`));
            window.editor.saveToStorage();
        });
    }

    // ── Drag (move) ───────────────────────────────────────────────────────────

    _onDivMousedown(e, el, zoneName, instanceIdx) {
        if (e.button !== 0) return;
        e.preventDefault();
        this._select(zoneName, instanceIdx, el);

        const startX = e.clientX - el.offsetLeft;
        const startY = e.clientY - el.offsetTop;

        const onMove = (me) => {
            let x = me.clientX - startX;
            let y = me.clientY - startY;
            if (this.snapEnabled) {
                const gs = window.gameConfig.getGridSize();
                x = Math.round(x / gs.w) * gs.w;
                y = Math.round(y / gs.h) * gs.h;
            }
            x = Math.max(0, x);
            y = Math.max(0, y);
            el.style.left = x + 'px';
            el.style.top  = y + 'px';
            // Update model
            const zl = window.gameConfig.getLayout()[zoneName];
            zl.instances[instanceIdx].x = x;
            zl.instances[instanceIdx].y = y;
            // Update prop inputs if visible
            const px = document.getElementById('prop-x');
            const py = document.getElementById('prop-y');
            if (px) px.value = x;
            if (py) py.value = y;
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            window.editor.saveToStorage();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ── Resize ────────────────────────────────────────────────────────────────

    _onResizeMousedown(e, el, zoneName, instanceIdx) {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = el.offsetWidth;
        const startH = el.offsetHeight;

        const onMove = (me) => {
            let w = startW + (me.clientX - startX);
            let h = startH + (me.clientY - startY);
            if (this.snapEnabled) {
                const gs = window.gameConfig.getGridSize();
                w = Math.round(w / gs.w) * gs.w;
                h = Math.round(h / gs.h) * gs.h;
            }
            w = Math.max(window.gameConfig.getGridSize().w, w);
            h = Math.max(window.gameConfig.getGridSize().h, h);
            el.style.width  = w + 'px';
            el.style.height = h + 'px';
            const zl = window.gameConfig.getLayout()[zoneName];
            zl.instances[instanceIdx].w = w;
            zl.instances[instanceIdx].h = h;
            const pw = document.getElementById('prop-w');
            const ph = document.getElementById('prop-h');
            if (pw) pw.value = w;
            if (ph) ph.value = h;
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            window.editor.saveToStorage();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ── HTML export ───────────────────────────────────────────────────────────

    generateHTML() {
        const layout  = window.gameConfig.getLayout();
        const meta    = window.gameConfig.getMeta();
        const gameName = meta.gamename || 'Game';

        let zoneDivs = '';
        let styles   = '';

        for (const [zoneName, zl] of Object.entries(layout)) {
            const isRel = zl.indexing === 'relative';
            (zl.instances || []).forEach((inst, idx) => {
                const id      = isRel ? `${zoneName}-${idx + 1}p` : `${zoneName}-${idx + 1}`;
                const pct = (canvas) => ''; // positions are absolute px → convert to % below
                // Use percentages of a 1200×900 reference viewport
                const REF_W = 1200, REF_H = 900;
                const xp = ((inst.x / REF_W) * 100).toFixed(2);
                const yp = ((inst.y / REF_H) * 100).toFixed(2);
                const wp = ((inst.w / REF_W) * 100).toFixed(2);
                const hp = ((inst.h / REF_H) * 100).toFixed(2);

                zoneDivs += `    <div id="${id}" class="zone${isRel ? ' zone-relative' : ''}" data-zone="${zoneName}" data-index="${idx + 1}" data-relative="${isRel}"></div>\n`;
                styles   += `    #${id} { left:${xp}%; top:${yp}%; width:${wp}%; height:${hp}%; }\n`;
            });
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${gameName}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1a1a1a; width: 100vw; height: 100vh; overflow: hidden; }
        #game-board { position: relative; width: 100%; height: 100%; }
        .zone {
            position: absolute;
            border: 1px solid #555;
            background: rgba(255,255,255,0.03);
            overflow: hidden;
        }
        .zone-relative { border-style: dashed; }
${styles}
    </style>
</head>
<body>
    <div id="game-board">
${zoneDivs}    </div>
    <script>
        // Perspective player index — set by game engine at runtime
        // Relative zones (id ending in 'p') are ordered from this player's perspective
        // zone-Np means "offset N-1 from perspective player, wrapping with modulo"
        window.perspectivePlayer = 1;
    <\/script>
</body>
</html>`;
    }
}

window.BoardEditor = new BoardEditorModule();
