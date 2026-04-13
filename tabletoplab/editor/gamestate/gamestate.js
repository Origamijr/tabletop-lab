/**
 * gamestate/gamestate.js
 * Visual FSM editor.
 *
 * Left sidebar  — action list (CRUD)
 * Center canvas — draggable state blocks, SVG transition arrows
 * Right panel   — inspector for selected state or transition
 *
 * Data model mirrors game.json:
 *   gameConfig.game.gamestates[name] = { initial?, on_enter[], transitions[] }
 *   gameConfig.game.actions[name]    = { condition[], targets[], execution[] }
 *
 * State positions stored in gameConfig.ui._fsmLayout[name] = {x, y}
 * (underscore prefix = editor-only, stripped on clean export if desired)
 */

class GameStateEditorModule {
    constructor() {
        this._rendered   = false;
        this._selState   = null;   // selected state name
        this._selTrans   = null;   // { fromState, idx }
        this._wireFrom   = null;   // name of state being wired from
        this._dragging   = null;   // { name, startX, startY }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
        if (!this._rendered) { this._buildDOM(); this._rendered = true; }
        this._syncAll();
    }

    refresh() { if (this._rendered) this._syncAll(); }

    // ── Layout store ──────────────────────────────────────────────────────────

    _layout() {
        if (!window.gameConfig.ui._fsmLayout) window.gameConfig.ui._fsmLayout = {};
        return window.gameConfig.ui._fsmLayout;
    }

    _posOf(name) {
        const l = this._layout();
        if (!l[name]) {
            // Auto-place in a grid
            const idx   = Object.keys(window.gameConfig.getGameStates()).indexOf(name);
            l[name] = { x: 40 + (idx % 4) * 200, y: 40 + Math.floor(idx / 4) * 140 };
        }
        return l[name];
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    _buildDOM() {
        const pane = document.getElementById('pane-gamestate');
        pane.innerHTML = '';

        // Load the HTML template inline (no fetch needed — we write it directly)
        pane.innerHTML = `
        <div class="gamestate-editor">
            <div class="gs-sidebar">
                <div class="panel-header">Actions
                    <button class="btn btn-sm" id="gs-btn-add-action">+</button>
                </div>
                <div class="gs-sidebar-inner" id="gs-action-list"></div>
            </div>

            <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                <div style="display:flex;gap:var(--spacing-sm);padding:var(--spacing-sm);
                            background:var(--color-bg-tertiary);border-bottom:var(--border-width-thin) solid var(--color-border);flex-shrink:0;align-items:center;">
                    <button class="btn btn-sm" id="gs-btn-add-state">+ State</button>
                    <span style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin-left:auto;">
                        Drag port → state to connect. Click arrow to edit transition. Click state to inspect.
                    </span>
                </div>
                <div class="gs-canvas-wrap" id="gs-canvas-wrap">
                    <svg class="gs-svg" id="gs-svg" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <marker id="gs-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                                <polygon points="0 0,8 3,0 6" fill="var(--color-border)"/>
                            </marker>
                            <marker id="gs-arrow-sel" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                                <polygon points="0 0,8 3,0 6" fill="var(--color-text-accent)"/>
                            </marker>
                        </defs>
                    </svg>
                    <div class="gs-canvas" id="gs-canvas"></div>
                </div>
            </div>

            <div class="panel" style="width:240px;flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;border-left:var(--border-width) solid var(--color-border);">
                <div class="panel-header" id="gs-inspector-title">Inspector</div>
                <div style="flex:1;overflow-y:auto;padding:var(--spacing-sm);" id="gs-inspector-body">
                    <p style="color:var(--color-text-secondary);font-size:var(--font-size-small);">Select a state or transition</p>
                </div>
            </div>
        </div>`;

        document.getElementById('gs-btn-add-state').addEventListener('click', () => this._addState());
        document.getElementById('gs-btn-add-action').addEventListener('click', () => this._addAction());

        // Click on canvas background clears selection
        document.getElementById('gs-canvas').addEventListener('click', e => {
            if (e.target === document.getElementById('gs-canvas')) {
                this._wireFrom = null;
                this._deselect();
            }
        });
    }

    // ── Full sync ─────────────────────────────────────────────────────────────

    _syncAll() {
        this._renderActionList();
        this._renderStateBlocks();
        this._renderArrows();
    }

    // ── Action list ───────────────────────────────────────────────────────────

    _renderActionList() {
        const list = document.getElementById('gs-action-list');
        if (!list) return;
        list.innerHTML = '';
        const actions = window.gameConfig.getActions();

        if (Object.keys(actions).length === 0) {
            list.innerHTML = `<p style="font-size:var(--font-size-small);color:var(--color-text-secondary);padding:var(--spacing-sm);">No actions yet</p>`;
        }

        for (const [name, cfg] of Object.entries(actions)) {
            const item = document.createElement('div');
            item.className = 'gs-action-item';
            item.innerHTML = `
                <span>${name}</span>
                <span class="gs-action-del" title="Delete action">×</span>`;
            item.querySelector('span:first-child').addEventListener('click', () => {
                this._deselect();
                this._selState = null;
                this._selTrans = null;
                this._renderActionInspector(name, cfg);
            });
            item.querySelector('.gs-action-del').addEventListener('click', e => {
                e.stopPropagation();
                if (confirm(`Delete action "${name}"?`)) {
                    window.gameConfig.deleteAction(name);
                    window.editor.saveToStorage();
                    this._renderActionList();
                    this._renderInspectorPlaceholder();
                }
            });
            list.appendChild(item);
        }
    }

    _addAction() {
        const name = prompt('Action name:');
        if (!name) return;
        if (window.gameConfig.getActions()[name]) { alert('Already exists.'); return; }
        window.gameConfig.setAction(name, { condition: [], targets: [], execution: [] });
        window.editor.saveToStorage();
        this._renderActionList();
    }

    // ── State blocks on canvas ────────────────────────────────────────────────

    _renderStateBlocks() {
        const canvas = document.getElementById('gs-canvas');
        if (!canvas) return;
        canvas.querySelectorAll('.gs-state-block').forEach(el => el.remove());

        const states = window.gameConfig.getGameStates();

        // Ensure canvas is big enough
        canvas.style.width  = '3000px';
        canvas.style.height = '2000px';

        for (const [name, cfg] of Object.entries(states)) {
            this._createStateBlock(name, cfg, canvas);
        }
    }

    _createStateBlock(name, cfg, canvas) {
        const pos = this._posOf(name);
        const isInitial  = !!cfg.initial;
        const isSelected = this._selState === name;

        const el = document.createElement('div');
        el.className = 'gs-state-block' +
                       (isInitial  ? ' initial'  : '') +
                       (isSelected ? ' selected' : '');
        el.dataset.state = name;
        el.style.left = pos.x + 'px';
        el.style.top  = pos.y + 'px';

        const onEnterLines = cfg.on_enter || [];
        const transCount   = (cfg.transitions || []).length;

        el.innerHTML = `
            <div class="gs-state-header">
                <input class="gs-state-name-input" value="${this._esc(name)}" title="Rename state">
                ${isInitial ? '<span class="initial-badge">init</span>' : ''}
                <div class="gs-state-controls">
                    <button class="gs-state-btn" data-action="toggle-initial" title="${isInitial ? 'Unset initial' : 'Set as initial'}">★</button>
                    <button class="gs-state-btn" data-action="delete" title="Delete state">×</button>
                </div>
            </div>
            <div class="gs-state-body">
                <div class="gs-state-on-enter" data-state="${this._esc(name)}" title="Click to edit on_enter in Scripting tab">
                    on_enter: ${onEnterLines.length} line${onEnterLines.length !== 1 ? 's' : ''}
                </div>
                <div style="font-size:0.6rem;color:var(--color-text-secondary);">${transCount} transition${transCount !== 1 ? 's' : ''}</div>
            </div>
            <div class="gs-port-out" title="Drag to create transition"></div>`;

        // Rename on blur
        const nameInput = el.querySelector('.gs-state-name-input');
        nameInput.addEventListener('blur', () => this._renameState(name, nameInput.value.trim()));
        nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });

        // Ctrl buttons
        el.querySelector('[data-action="toggle-initial"]').addEventListener('click', e => {
            e.stopPropagation();
            cfg.initial = !cfg.initial;
            window.editor.saveToStorage();
            this._syncAll();
        });

        el.querySelector('[data-action="delete"]').addEventListener('click', e => {
            e.stopPropagation();
            this._deleteState(name);
        });

        // Click on_enter → navigate to scripting tab focused on that script
        el.querySelector('.gs-state-on-enter').addEventListener('click', e => {
            e.stopPropagation();
            this._openOnEnterScript(name, cfg);
        });

        // Click block = select
        el.addEventListener('click', e => {
            e.stopPropagation();
            if (this._wireFrom && this._wireFrom !== name) {
                this._createTransition(this._wireFrom, name);
                this._wireFrom = null;
                document.querySelectorAll('.gs-port-out').forEach(p => p.classList.remove('active'));
                return;
            }
            this._selState = name;
            this._selTrans = null;
            this._renderStateBlocks();
            this._renderArrows();
            this._renderStateInspector(name, cfg);
        });

        // Drag to move
        this._makeDraggable(el, name);

        // Port: start wire
        el.querySelector('.gs-port-out').addEventListener('click', e => {
            e.stopPropagation();
            if (this._wireFrom === name) {
                this._wireFrom = null;
                e.target.classList.remove('active');
            } else {
                this._wireFrom = name;
                document.querySelectorAll('.gs-port-out').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
            }
        });

        canvas.appendChild(el);
    }

    _makeDraggable(el, name) {
        el.addEventListener('mousedown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
                e.target.classList.contains('gs-port-out') ||
                e.target.classList.contains('gs-state-btn') ||
                e.target.classList.contains('gs-state-on-enter')) return;
            if (e.button !== 0) return;
            e.preventDefault();
            const pos    = this._posOf(name);
            const startX = e.clientX - pos.x;
            const startY = e.clientY - pos.y;

            const onMove = me => {
                pos.x = Math.max(0, me.clientX - startX);
                pos.y = Math.max(0, me.clientY - startY);
                el.style.left = pos.x + 'px';
                el.style.top  = pos.y + 'px';
                this._renderArrows();
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                window.editor.saveToStorage();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    // ── State CRUD ────────────────────────────────────────────────────────────

    _addState() {
        const name = prompt('State name:');
        if (!name) return;
        if (window.gameConfig.getGameStates()[name]) { alert('Already exists.'); return; }
        const isEmpty = Object.keys(window.gameConfig.getGameStates()).length === 0;
        window.gameConfig.setGameState(name, { on_enter: [], transitions: [], initial: isEmpty });
        window.editor.saveToStorage();
        this._syncAll();
    }

    _deleteState(name) {
        if (!confirm(`Delete state "${name}"?`)) return;
        window.gameConfig.deleteGameState(name);
        delete this._layout()[name];
        // Remove transitions pointing to this state
        for (const [sName, sCfg] of Object.entries(window.gameConfig.getGameStates())) {
            if (sCfg.transitions) {
                sCfg.transitions = sCfg.transitions.filter(t => {
                    const next = Array.isArray(t.next_state) ? t.next_state : [t.next_state];
                    return !next.includes(name);
                });
            }
        }
        if (this._selState === name) this._deselect();
        window.editor.saveToStorage();
        this._syncAll();
    }

    _renameState(oldName, newName) {
        if (!newName || newName === oldName) return;
        if (window.gameConfig.getGameStates()[newName]) { alert('Name already exists.'); return; }
        const cfg = window.gameConfig.getGameStates()[oldName];
        window.gameConfig.setGameState(newName, cfg);
        window.gameConfig.deleteGameState(oldName);
        // Update layout
        if (this._layout()[oldName]) {
            this._layout()[newName] = this._layout()[oldName];
            delete this._layout()[oldName];
        }
        // Update any transitions referencing old name
        for (const sCfg of Object.values(window.gameConfig.getGameStates())) {
            (sCfg.transitions || []).forEach(t => {
                if (Array.isArray(t.next_state)) {
                    t.next_state = t.next_state.map(s => s === oldName ? newName : s);
                } else if (t.next_state === oldName) {
                    t.next_state = newName;
                }
            });
        }
        if (this._selState === oldName) this._selState = newName;
        window.editor.saveToStorage();
        this._syncAll();
    }

    // ── Transitions ───────────────────────────────────────────────────────────

    _createTransition(fromName, toName) {
        const cfg = window.gameConfig.getGameStates()[fromName];
        if (!cfg) return;
        if (!cfg.transitions) cfg.transitions = [];
        cfg.transitions.push({ conditions: ['true'], next_state: toName });
        window.editor.saveToStorage();
        this._renderArrows();
        this._renderStateInspector(fromName, cfg);
    }

    // ── SVG arrows ────────────────────────────────────────────────────────────

    _renderArrows() {
        const svg = document.getElementById('gs-svg');
        if (!svg) return;
        // Keep defs, remove old paths/labels
        svg.querySelectorAll('.gs-arrow-group').forEach(el => el.remove());

        const states = window.gameConfig.getGameStates();

        for (const [fromName, cfg] of Object.entries(states)) {
            const fromPos = this._posOf(fromName);

            (cfg.transitions || []).forEach((trans, transIdx) => {
                const targets = Array.isArray(trans.next_state) ? trans.next_state : [trans.next_state];
                targets.forEach((toName, targetIdx) => {
                    const toPos = this._posOf(toName);
                    if (!toPos) return;

                    const isSelected = this._selTrans &&
                                       this._selTrans.fromState === fromName &&
                                       this._selTrans.idx === transIdx;

                    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    group.className = 'gs-arrow-group';

                    // Compute endpoints: from right-center of fromBlock to left-center of toBlock
                    const BLOCK_W = 165;
                    const BLOCK_H = 80;

                    const x1 = fromPos.x + BLOCK_W;
                    const y1 = fromPos.y + BLOCK_H / 2;
                    const x2 = toPos.x;
                    const y2 = toPos.y + BLOCK_H / 2 + targetIdx * 12;

                    // Self-loop: arc above
                    let d;
                    if (fromName === toName) {
                        const cx = fromPos.x + BLOCK_W / 2;
                        const cy = fromPos.y - 40;
                        d = `M${fromPos.x + BLOCK_W * 0.3},${fromPos.y} Q${cx},${cy} ${fromPos.x + BLOCK_W * 0.7},${fromPos.y}`;
                    } else {
                        const mx = (x1 + x2) / 2;
                        d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
                    }

                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('class', 'gs-transition-arrow');
                    path.setAttribute('d', d);
                    path.setAttribute('marker-end', isSelected ? 'url(#gs-arrow-sel)' : 'url(#gs-arrow)');
                    if (isSelected) path.style.stroke = 'var(--color-text-accent)';

                    path.addEventListener('click', e => {
                        e.stopPropagation();
                        this._selTrans  = { fromState: fromName, idx: transIdx };
                        this._selState  = null;
                        this._renderArrows();
                        this._renderStateBlocks();
                        this._renderTransitionInspector(fromName, cfg, transIdx);
                    });

                    group.appendChild(path);

                    // Label: first condition, truncated
                    const cond  = (trans.conditions && trans.conditions[0]) || '';
                    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    const mx2   = (x1 + x2) / 2;
                    const my2   = (y1 + y2) / 2 - 6;
                    label.setAttribute('x', mx2);
                    label.setAttribute('y', my2);
                    label.setAttribute('class', 'gs-transition-label');
                    label.setAttribute('text-anchor', 'middle');
                    label.textContent = cond.length > 20 ? cond.slice(0, 18) + '…' : cond;
                    group.appendChild(label);

                    svg.appendChild(group);
                });
            });
        }
    }

    // ── Inspectors ────────────────────────────────────────────────────────────

    _deselect() {
        this._selState = null;
        this._selTrans = null;
        this._renderStateBlocks();
        this._renderArrows();
        this._renderInspectorPlaceholder();
    }

    _renderInspectorPlaceholder() {
        const title = document.getElementById('gs-inspector-title');
        const body  = document.getElementById('gs-inspector-body');
        if (title) title.textContent = 'Inspector';
        if (body)  body.innerHTML = `<p style="color:var(--color-text-secondary);font-size:var(--font-size-small);">Select a state or transition</p>`;
    }

    _renderStateInspector(name, cfg) {
        const title = document.getElementById('gs-inspector-title');
        const body  = document.getElementById('gs-inspector-body');
        if (!title || !body) return;
        title.textContent = `State: ${name}`;

        body.innerHTML = `
            <div class="form-row">
                <label>Initial</label>
                <input type="checkbox" id="ins-initial" ${cfg.initial ? 'checked' : ''}>
            </div>
            <div style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin:var(--spacing-sm) 0 var(--spacing-xs);">
                on_enter (${(cfg.on_enter || []).length} lines)
            </div>
            <button class="btn btn-sm" id="ins-open-script" style="width:100%;margin-bottom:var(--spacing-sm);">
                Edit in Scripting Tab ↗
            </button>
            <div style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin-bottom:var(--spacing-xs);">
                Transitions (${(cfg.transitions || []).length})
            </div>
            <div id="ins-transitions"></div>
            <button class="btn btn-sm" id="ins-add-trans" style="width:100%;margin-top:var(--spacing-xs);">+ Transition</button>
        `;

        document.getElementById('ins-initial').addEventListener('change', e => {
            cfg.initial = e.target.checked;
            window.editor.saveToStorage();
            this._renderStateBlocks();
        });

        document.getElementById('ins-open-script').addEventListener('click', () => {
            this._openOnEnterScript(name, cfg);
        });

        document.getElementById('ins-add-trans').addEventListener('click', () => {
            if (!cfg.transitions) cfg.transitions = [];
            const stateName = prompt('Transition to state:');
            if (!stateName) return;
            cfg.transitions.push({ conditions: ['true'], next_state: stateName });
            window.editor.saveToStorage();
            this._renderArrows();
            this._renderStateInspector(name, cfg);
        });

        this._renderTransitionList(name, cfg);
    }

    _renderTransitionList(name, cfg) {
        const wrap = document.getElementById('ins-transitions');
        if (!wrap) return;
        wrap.innerHTML = '';
        (cfg.transitions || []).forEach((trans, idx) => {
            const targets = Array.isArray(trans.next_state) ? trans.next_state.join(', ') : (trans.next_state || '?');
            const div = document.createElement('div');
            div.style.cssText = 'font-size:var(--font-size-small);padding:var(--spacing-xs);border:var(--border-width-thin) solid var(--color-border);margin-bottom:2px;cursor:pointer;';
            div.textContent = `→ ${targets}`;
            div.addEventListener('click', () => {
                this._selTrans = { fromState: name, idx };
                this._renderArrows();
                this._renderTransitionInspector(name, cfg, idx);
            });
            const delBtn = document.createElement('span');
            delBtn.textContent = ' ×';
            delBtn.style.cssText = 'color:var(--color-text-error);cursor:pointer;float:right;';
            delBtn.addEventListener('click', e => {
                e.stopPropagation();
                cfg.transitions.splice(idx, 1);
                window.editor.saveToStorage();
                this._renderArrows();
                this._renderStateInspector(name, cfg);
            });
            div.appendChild(delBtn);
            wrap.appendChild(div);
        });
    }

    _renderTransitionInspector(fromName, cfg, transIdx) {
        const title = document.getElementById('gs-inspector-title');
        const body  = document.getElementById('gs-inspector-body');
        if (!title || !body) return;
        const trans = cfg.transitions[transIdx];
        if (!trans) return;

        const conditions  = Array.isArray(trans.conditions)  ? trans.conditions  : [trans.conditions  || 'true'];
        const nextStates  = Array.isArray(trans.next_state)  ? trans.next_state  : [trans.next_state  || ''];

        title.textContent = `Transition from ${fromName}`;

        body.innerHTML = `
            <div style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin-bottom:var(--spacing-xs);">Conditions (all must hold)</div>
            <div id="ins-cond-list"></div>
            <button class="btn btn-sm" id="ins-add-cond" style="width:100%;margin-bottom:var(--spacing-sm);">+ Condition</button>

            <div style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin-bottom:var(--spacing-xs);">Next state(s) — multiple = nondeterministic</div>
            <div id="ins-next-list"></div>
            <button class="btn btn-sm" id="ins-add-next" style="width:100%;margin-bottom:var(--spacing-sm);">+ Next state</button>

            <button class="btn btn-sm btn-danger" id="ins-del-trans" style="width:100%;">Delete Transition</button>
        `;

        const renderConds = () => {
            const list = document.getElementById('ins-cond-list');
            list.innerHTML = '';
            conditions.forEach((cond, ci) => {
                const row = document.createElement('div');
                row.className = 'gs-condition-row';
                const inp = document.createElement('input');
                inp.className = 'gs-condition-input';
                inp.type  = 'text';
                inp.value = cond;
                inp.addEventListener('blur', () => {
                    conditions[ci] = inp.value.trim() || 'true';
                    trans.conditions = conditions;
                    window.editor.saveToStorage();
                    this._renderArrows();
                });
                const del = document.createElement('span');
                del.className = 'gs-condition-del';
                del.textContent = '×';
                del.addEventListener('click', () => {
                    conditions.splice(ci, 1);
                    trans.conditions = conditions;
                    window.editor.saveToStorage();
                    this._renderArrows();
                    renderConds();
                });
                row.appendChild(inp); row.appendChild(del);
                list.appendChild(row);
            });
        };
        renderConds();

        const renderNexts = () => {
            const list = document.getElementById('ins-next-list');
            list.innerHTML = '';
            nextStates.forEach((ns, ni) => {
                const row = document.createElement('div');
                row.className = 'gs-condition-row';
                const inp = document.createElement('input');
                inp.className = 'gs-condition-input';
                inp.type  = 'text';
                inp.value = ns;
                inp.addEventListener('blur', () => {
                    nextStates[ni] = inp.value.trim();
                    trans.next_state = nextStates.length === 1 ? nextStates[0] : nextStates;
                    window.editor.saveToStorage();
                    this._renderArrows();
                });
                const del = document.createElement('span');
                del.className = 'gs-condition-del';
                del.textContent = '×';
                del.addEventListener('click', () => {
                    nextStates.splice(ni, 1);
                    trans.next_state = nextStates.length === 1 ? nextStates[0] : nextStates;
                    window.editor.saveToStorage();
                    this._renderArrows();
                    renderNexts();
                });
                row.appendChild(inp); row.appendChild(del);
                list.appendChild(row);
            });
        };
        renderNexts();

        document.getElementById('ins-add-cond').addEventListener('click', () => {
            conditions.push('true');
            trans.conditions = conditions;
            window.editor.saveToStorage();
            renderConds();
        });

        document.getElementById('ins-add-next').addEventListener('click', () => {
            const ns = prompt('Next state name:');
            if (!ns) return;
            nextStates.push(ns);
            trans.next_state = nextStates.length === 1 ? nextStates[0] : nextStates;
            window.editor.saveToStorage();
            this._renderArrows();
            renderNexts();
        });

        document.getElementById('ins-del-trans').addEventListener('click', () => {
            cfg.transitions.splice(transIdx, 1);
            this._selTrans = null;
            window.editor.saveToStorage();
            this._renderArrows();
            this._renderStateInspector(fromName, cfg);
        });
    }

    _renderActionInspector(name, cfg) {
        const title = document.getElementById('gs-inspector-title');
        const body  = document.getElementById('gs-inspector-body');
        if (!title || !body) return;
        title.textContent = `Action: ${name}`;

        const conditions = (cfg.condition || []).join('\n');

        body.innerHTML = `
            <div style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin-bottom:var(--spacing-xs);">Conditions</div>
            <textarea id="ins-action-cond" rows="4" style="width:100%;font-family:var(--font-family);font-size:var(--font-size-small);
                background:var(--color-text-light);color:var(--color-text-primary);border:var(--border-width-thin) solid var(--color-border);
                padding:var(--spacing-xs);resize:vertical;">${this._esc(conditions)}</textarea>

            <div style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin:var(--spacing-sm) 0 var(--spacing-xs);">
                Targets (${(cfg.targets || []).length})
            </div>
            <button class="btn btn-sm" id="ins-add-target" style="width:100%;margin-bottom:var(--spacing-sm);">+ Target</button>
            <div id="ins-targets-list"></div>

            <div style="font-size:var(--font-size-small);color:var(--color-text-secondary);margin-bottom:var(--spacing-xs);">Execution</div>
            <button class="btn btn-sm" id="ins-open-exec" style="width:100%;">Edit in Scripting Tab ↗</button>
        `;

        document.getElementById('ins-action-cond').addEventListener('blur', e => {
            cfg.condition = e.target.value.split('\n').map(l => l.trim()).filter(Boolean);
            window.editor.saveToStorage();
        });

        document.getElementById('ins-add-target').addEventListener('click', () => {
            if (!cfg.targets) cfg.targets = [];
            cfg.targets.push({ name: 't', candidates: '', conditions: '', min_targets: 1, max_targets: 1 });
            window.editor.saveToStorage();
            this._renderActionInspector(name, cfg);
        });

        document.getElementById('ins-open-exec').addEventListener('click', () => {
            window.editor.switchTab('scripting');
            // Focus the corresponding action script if it exists
            if (window.ScriptingEditor) {
                const scripts = window.gameConfig._scripts || [];
                const match = scripts.find(s => {
                    const root = s.blocks.find(b => b.id === s.rootBlockId);
                    return root && root.defId === 'root_action' && root.args[0] === name;
                });
                if (match) window.ScriptingEditor._openScript(match);
            }
        });

        // Render targets
        const tList = document.getElementById('ins-targets-list');
        (cfg.targets || []).forEach((t, ti) => {
            const div = document.createElement('div');
            div.style.cssText = 'border:var(--border-width-thin) solid var(--color-border);padding:var(--spacing-xs);margin-bottom:4px;font-size:var(--font-size-small);';
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <strong style="color:var(--color-text-accent);">${t.name}</strong>
                    <span style="color:var(--color-text-error);cursor:pointer;" class="t-del">×</span>
                </div>
                <div class="form-row"><label>name</label><input type="text" value="${this._esc(t.name)}" data-f="name"></div>
                <div class="form-row"><label>candidates</label><input type="text" value="${this._esc(t.candidates||'')}" data-f="candidates"></div>
                <div class="form-row"><label>conditions</label><input type="text" value="${this._esc(t.conditions||'')}" data-f="conditions"></div>
                <div class="form-row"><label>min</label><input type="number" value="${t.min_targets||1}" data-f="min_targets" style="max-width:60px;"></div>
                <div class="form-row"><label>max</label><input type="number" value="${t.max_targets||1}" data-f="max_targets" style="max-width:60px;"></div>
            `;
            div.querySelectorAll('input').forEach(inp => {
                inp.addEventListener('blur', () => {
                    const f = inp.dataset.f;
                    t[f] = inp.type === 'number' ? parseInt(inp.value) : inp.value;
                    window.editor.saveToStorage();
                });
            });
            div.querySelector('.t-del').addEventListener('click', () => {
                cfg.targets.splice(ti, 1);
                window.editor.saveToStorage();
                this._renderActionInspector(name, cfg);
            });
            tList.appendChild(div);
        });
    }

    // ── Scripting tab bridge ───────────────────────────────────────────────────

    _openOnEnterScript(stateName, cfg) {
        // Switch to scripting tab and focus or create the on_enter script for this state
        window.editor.switchTab('scripting');
        if (!window.ScriptingEditor) return;

        const scripts = window.gameConfig._scripts || [];
        let match = scripts.find(s => {
            const root = s.blocks.find(b => b.id === s.rootBlockId);
            return root && root.defId === 'root_on_enter' && root.args[0] === stateName;
        });

        if (!match) {
            // Create one
            match = window.ScriptingEditor._addScript('root_on_enter', stateName);
            window.ScriptingEditor._syncTree();
        }
        window.ScriptingEditor._openScript(match);
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    _esc(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
}

window.GameStateEditor = new GameStateEditorModule();
