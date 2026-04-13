/**
 * scripting/scripting.js
 * Visual block-based scripting editor.
 *
 * Data model (stored in session via editor.saveToStorage):
 *   window.gameConfig._scripts = [
 *     { id, rootBlockId, blocks: [ BlockInstance, ... ] }
 *   ]
 *   BlockInstance = { id, defId, args:[], wires:{paramIdx: srcBlockId}, x, y }
 *
 * Wires connect an output plug of one block to a param slot of another.
 * Only blocks with returns=true have output plugs.
 */

class ScriptingEditorModule {
    constructor() {
        this._rendered   = false;
        this._activeScript = null;   // script object currently shown
        this._pendingWire  = null;   // { fromBlockId } during wire drag
        this._selectedBlock = null;  // block instance id
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
        if (!this._rendered) { this._buildDOM(); this._rendered = true; }
        this._syncTree();
        if (this._activeScript) this._renderCanvas();
    }

    refresh() { if (this._rendered) { this._syncTree(); if (this._activeScript) this._renderCanvas(); } }

    // ── Script store helpers ───────────────────────────────────────────────────

    _scripts() {
        if (!window.gameConfig._scripts) window.gameConfig._scripts = [];
        return window.gameConfig._scripts;
    }

    _addScript(rootDefId, name, extra) {
        const rootInst = this._mkBlock(rootDefId, extra || [name]);
        const script   = { id: this._uid(), rootBlockId: rootInst.id, blocks: [rootInst] };
        this._scripts().push(script);
        window.editor.saveToStorage();
        return script;
    }

    _deleteScript(scriptId) {
        const idx = this._scripts().findIndex(s => s.id === scriptId);
        if (idx !== -1) this._scripts().splice(idx, 1);
        if (this._activeScript && this._activeScript.id === scriptId) {
            this._activeScript = null;
            this._clearCanvas();
        }
        window.editor.saveToStorage();
    }

    // ── Block helpers ──────────────────────────────────────────────────────────

    _mkBlock(defId, args) {
        return { id: this._uid(), defId, args: args || [], wires: {}, x: 0, y: 0 };
    }

    _uid() { return Math.random().toString(36).slice(2, 9); }

    _blockDef(inst) { return window.Blocks.get(inst.defId); }

    _getBlock(id) {
        return this._activeScript && this._activeScript.blocks.find(b => b.id === id);
    }

    // ── DOM construction ──────────────────────────────────────────────────────

    _buildDOM() {
        const pane = document.getElementById('pane-scripting');
        pane.innerHTML = `
        <div class="scripting-editor">
            <div class="script-tree">
                <div class="panel-header">Scripts</div>
                <div class="script-tree-inner" id="script-tree-inner"></div>
            </div>
            <div class="block-palette">
                <div class="panel-header">Blocks</div>
                <div class="palette-inner" id="palette-inner"></div>
            </div>
            <div class="script-canvas-wrap" id="script-canvas-wrap">
                <svg class="wire-svg" id="wire-svg"></svg>
                <div class="script-canvas" id="script-canvas">
                    <p style="color:var(--color-text-secondary);font-size:var(--font-size-small)">
                        Select or create a script in the tree →
                    </p>
                </div>
            </div>
            <div class="lua-panel" id="lua-panel">
                <div class="lua-panel-header">
                    <span>Lua</span>
                    <button class="btn btn-sm" id="lua-close-btn">×</button>
                </div>
                <pre class="lua-output" id="lua-output"></pre>
            </div>
        </div>
        <button class="btn btn-sm lua-toggle-btn" id="lua-toggle-btn" style="position:absolute;right:0;top:50%;transform:translateY(-50%)">Lua ▶</button>`;

        document.getElementById('lua-toggle-btn').addEventListener('click', () => this._toggleLua());
        document.getElementById('lua-close-btn').addEventListener('click', () => this._toggleLua(false));

        // Canvas click: deselect
        document.getElementById('script-canvas').addEventListener('click', e => {
            if (e.target === document.getElementById('script-canvas')) this._deselect();
        });

        this._buildPalette();
    }

    _buildPalette() {
        const inner = document.getElementById('palette-inner');
        if (!inner) return;
        inner.innerHTML = '';

        const catOrder = ['root', 'expression', 'statement', 'framework'];
        catOrder.forEach(cat => {
            const blocks = window.Blocks.byCategory(cat);
            if (!blocks.length) return;
            const sec = document.createElement('div');
            sec.className = 'palette-category';
            sec.innerHTML = `<div class="palette-cat-label">${cat}</div>`;
            blocks.forEach(def => {
                const el = document.createElement('div');
                el.className = 'palette-block';
                el.textContent = def.label;
                el.style.background = def.color;
                el.title = def.id;
                el.draggable = true;
                el.addEventListener('dragstart', ev => {
                    ev.dataTransfer.setData('blockDefId', def.id);
                });
                sec.appendChild(el);
            });
            inner.appendChild(sec);
        });
    }

    // ── Tree ──────────────────────────────────────────────────────────────────

    _syncTree() {
        const inner = document.getElementById('script-tree-inner');
        if (!inner) return;
        inner.innerHTML = '';

        const sections = [
            { key: 'root_on_enter',    label: 'on_enter'    },
            { key: 'root_action',      label: 'actions'     },
            { key: 'root_function',    label: 'functions'   },
            { key: 'root_per_object',  label: 'per-object'  }
        ];

        sections.forEach(sec => {
            const scripts = this._scripts().filter(s => {
                const root = s.blocks.find(b => b.id === s.rootBlockId);
                return root && root.defId === sec.key;
            });

            const wrap = document.createElement('div');
            wrap.className = 'tree-section';

            const hdr = document.createElement('div');
            hdr.className = 'tree-section-header';
            hdr.textContent = sec.label.toUpperCase();
            wrap.appendChild(hdr);

            const body = document.createElement('div');
            body.className = 'tree-section-body';

            scripts.forEach(script => {
                const root = script.blocks.find(b => b.id === script.rootBlockId);
                const name = root ? (root.args[0] || '(unnamed)') : script.id;
                const item = document.createElement('div');
                item.className = 'tree-item' + (this._activeScript && this._activeScript.id === script.id ? ' active' : '');
                item.innerHTML = `<span>${name}</span><span class="tree-item-del" title="Delete">×</span>`;
                item.querySelector('span:first-child').addEventListener('click', () => this._openScript(script));
                item.querySelector('.tree-item-del').addEventListener('click', e => {
                    e.stopPropagation();
                    if (confirm(`Delete script "${name}"?`)) this._deleteScript(script.id);
                    this._syncTree();
                });
                body.appendChild(item);
            });

            // Add button
            const addBtn = document.createElement('button');
            addBtn.className = 'btn btn-sm tree-add-btn';
            addBtn.textContent = '+ add';
            addBtn.addEventListener('click', () => {
                const name = prompt(`New ${sec.label} name:`);
                if (!name) return;
                const s = this._addScript(sec.key, name);
                this._openScript(s);
                this._syncTree();
            });
            body.appendChild(addBtn);
            wrap.appendChild(body);
            inner.appendChild(wrap);
        });
    }

    _openScript(script) {
        this._activeScript = script;
        this._syncTree();
        this._renderCanvas();
    }

    // ── Canvas rendering ──────────────────────────────────────────────────────

    _clearCanvas() {
        const canvas = document.getElementById('script-canvas');
        if (canvas) canvas.innerHTML = '<p style="color:var(--color-text-secondary);font-size:var(--font-size-small)">Select a script from the tree</p>';
        const svg = document.getElementById('wire-svg');
        if (svg) svg.innerHTML = '';
    }

    _renderCanvas() {
        if (!this._activeScript) return;
        const canvas = document.getElementById('script-canvas');
        if (!canvas) return;
        canvas.innerHTML = '';

        // Drag-over for dropping new blocks
        canvas.addEventListener('dragover', e => e.preventDefault());
        canvas.addEventListener('drop', e => {
            e.preventDefault();
            const defId = e.dataTransfer.getData('blockDefId');
            if (!defId) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left + canvas.scrollLeft;
            const y = e.clientY - rect.top  + canvas.scrollTop;
            this._addBlockToScript(defId, x, y);
        });

        // Render blocks in order (root first, then by y position)
        const blocks = [...this._activeScript.blocks].sort((a, b) => {
            if (a.id === this._activeScript.rootBlockId) return -1;
            if (b.id === this._activeScript.rootBlockId) return 1;
            return a.y - b.y;
        });

        blocks.forEach(inst => this._renderBlock(inst, canvas));
        this._renderWires();
        this._updateLua();
    }

    _addBlockToScript(defId, x, y) {
        const def = window.Blocks.get(defId);
        if (!def) return;
        // Prevent adding a root block to a non-empty script
        if (def.category === 'root') {
            alert('Root blocks are created via the tree, not by dropping.');
            return;
        }
        const inst = this._mkBlock(defId, []);
        inst.x = x; inst.y = y;
        this._activeScript.blocks.push(inst);
        window.editor.saveToStorage();
        this._renderCanvas();
    }

    _renderBlock(inst, canvas) {
        const def = this._blockDef(inst);
        if (!def) return;

        const isRoot = inst.id === this._activeScript.rootBlockId;
        const el = document.createElement('div');
        el.className = 'script-block' + (isRoot ? ' block-root' : '') +
                       (this._selectedBlock === inst.id ? ' selected' : '');
        el.dataset.blockId = inst.id;
        el.style.borderColor = def.color;
        el.style.position = 'absolute';
        el.style.left = (inst.x || 20) + 'px';
        el.style.top  = (inst.y || 20) + 'px';

        // Header
        const hdr = document.createElement('div');
        hdr.className = 'script-block-header';
        hdr.style.borderBottom = `2px solid ${def.color}`;
        hdr.style.marginBottom = '4px';
        hdr.innerHTML = `<span class="block-label" style="color:${def.color}">${def.label}</span>`;

        if (!isRoot) {
            const delBtn = document.createElement('button');
            delBtn.className = 'block-delete-btn';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', e => { e.stopPropagation(); this._deleteBlock(inst.id); });
            hdr.appendChild(delBtn);
        }
        el.appendChild(hdr);

        // Params
        if (def.params && def.params.length) {
            const pRow = document.createElement('div');
            pRow.className = 'block-params';
            def.params.forEach((param, pIdx) => {
                const lbl = document.createElement('span');
                lbl.className = 'param-label';
                lbl.textContent = param.name + ':';
                pRow.appendChild(lbl);

                if (param.type === 'expr') {
                    // Wire slot
                    const slot = document.createElement('div');
                    slot.className = 'param-slot' + (inst.wires[pIdx] !== undefined ? ' wired' : '');
                    slot.dataset.paramIdx = pIdx;
                    slot.dataset.blockId  = inst.id;

                    if (inst.wires[pIdx] !== undefined) {
                        const srcBlock = this._getBlock(inst.wires[pIdx]);
                        const srcDef   = srcBlock ? this._blockDef(srcBlock) : null;
                        slot.textContent = srcDef ? srcDef.label : '?';
                        slot.title = 'Click to remove wire';
                        slot.addEventListener('click', e => {
                            e.stopPropagation();
                            delete inst.wires[pIdx];
                            window.editor.saveToStorage();
                            this._renderCanvas();
                        });
                    } else {
                        slot.textContent = param.optional ? `(${param.name})` : param.name;
                        slot.addEventListener('click', e => {
                            e.stopPropagation();
                            if (this._pendingWire) {
                                this._connectWire(this._pendingWire.fromBlockId, inst.id, pIdx);
                                this._pendingWire = null;
                                document.querySelectorAll('.param-slot').forEach(s => s.classList.remove('drop-target'));
                            }
                        });
                        slot.addEventListener('mouseenter', () => {
                            if (this._pendingWire) slot.classList.add('drop-target');
                        });
                        slot.addEventListener('mouseleave', () => slot.classList.remove('drop-target'));
                    }

                    pRow.appendChild(slot);

                } else if (param.type === 'choice') {
                    const sel = document.createElement('select');
                    sel.className = 'param-choice';
                    param.choices.forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c; opt.textContent = c;
                        if (inst.args[pIdx] === c) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    if (!inst.args[pIdx]) inst.args[pIdx] = param.choices[0];
                    sel.addEventListener('change', () => {
                        inst.args[pIdx] = sel.value;
                        window.editor.saveToStorage();
                        this._updateLua();
                    });
                    pRow.appendChild(sel);

                } else {
                    // text input
                    const inp = document.createElement('input');
                    inp.className = 'param-text-input';
                    inp.type = 'text';
                    inp.value = inst.args[pIdx] || '';
                    inp.placeholder = param.placeholder || param.name;
                    inp.addEventListener('input', () => {
                        inst.args[pIdx] = inp.value;
                        window.editor.saveToStorage();
                        this._updateLua();
                    });
                    pRow.appendChild(inp);
                }
            });
            el.appendChild(pRow);
        }

        // Output plug (for blocks that return a value)
        if (def.returns) {
            const plug = document.createElement('div');
            plug.className = 'output-plug' + (this._hasWireFrom(inst.id) ? ' wired' : '');
            plug.title = 'Drag to connect output';
            plug.addEventListener('click', e => {
                e.stopPropagation();
                if (this._pendingWire && this._pendingWire.fromBlockId === inst.id) {
                    // Cancel
                    this._pendingWire = null;
                    plug.style.boxShadow = '';
                } else {
                    this._pendingWire = { fromBlockId: inst.id };
                    plug.style.boxShadow = '0 0 6px 2px #ffff00';
                }
            });
            el.appendChild(plug);
        }

        // Drag to move
        this._makeDraggable(el, inst);

        el.addEventListener('click', e => {
            e.stopPropagation();
            this._selectedBlock = inst.id;
            document.querySelectorAll('.script-block').forEach(b => b.classList.remove('selected'));
            el.classList.add('selected');
        });

        canvas.appendChild(el);
    }

    _makeDraggable(el, inst) {
        el.addEventListener('mousedown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' ||
                e.target.tagName === 'BUTTON' || e.target.classList.contains('output-plug') ||
                e.target.classList.contains('param-slot')) return;
            if (e.button !== 0) return;
            e.preventDefault();
            const startX = e.clientX - inst.x;
            const startY = e.clientY - inst.y;
            const onMove = me => {
                inst.x = Math.max(0, me.clientX - startX);
                inst.y = Math.max(0, me.clientY - startY);
                el.style.left = inst.x + 'px';
                el.style.top  = inst.y + 'px';
                this._renderWires();
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

    _deselect() { this._selectedBlock = null; }

    _deleteBlock(blockId) {
        if (!this._activeScript) return;
        const idx = this._activeScript.blocks.findIndex(b => b.id === blockId);
        if (idx === -1) return;
        // Remove any wires to this block
        this._activeScript.blocks.forEach(b => {
            Object.keys(b.wires).forEach(k => {
                if (b.wires[k] === blockId) delete b.wires[k];
            });
        });
        this._activeScript.blocks.splice(idx, 1);
        window.editor.saveToStorage();
        this._renderCanvas();
    }

    // ── Wires ──────────────────────────────────────────────────────────────────

    _connectWire(fromBlockId, toBlockId, paramIdx) {
        const toBlock = this._getBlock(toBlockId);
        if (!toBlock) return;
        const fromBlock = this._getBlock(fromBlockId);
        const fromDef   = fromBlock ? this._blockDef(fromBlock) : null;
        if (!fromDef || !fromDef.returns) { alert('Source block has no output.'); return; }
        toBlock.wires[paramIdx] = fromBlockId;
        window.editor.saveToStorage();
        this._renderCanvas();
    }

    _hasWireFrom(blockId) {
        return this._activeScript && this._activeScript.blocks.some(b =>
            Object.values(b.wires).includes(blockId)
        );
    }

    _renderWires() {
        const svg = document.getElementById('wire-svg');
        if (!svg || !this._activeScript) return;
        svg.innerHTML = '';

        this._activeScript.blocks.forEach(toBlock => {
            Object.entries(toBlock.wires).forEach(([pIdx, fromBlockId]) => {
                const fromBlock = this._getBlock(fromBlockId);
                if (!fromBlock) return;

                const fromEl = document.querySelector(`[data-block-id="${fromBlockId}"]`);
                const toEl   = document.querySelector(`[data-block-id="${toBlock.id}"]`);
                if (!fromEl || !toEl) return;

                const plug = fromEl.querySelector('.output-plug');
                const slot = toEl.querySelector(`[data-param-idx="${pIdx}"]`);
                if (!plug || !slot) return;

                const canvas = document.getElementById('script-canvas');
                const cr = canvas.getBoundingClientRect();

                const pr = plug.getBoundingClientRect();
                const sr = slot.getBoundingClientRect();

                const x1 = pr.right  - cr.left + canvas.scrollLeft;
                const y1 = pr.top    - cr.top  + (pr.height / 2) + canvas.scrollTop;
                const x2 = sr.left   - cr.left + canvas.scrollLeft;
                const y2 = sr.top    - cr.top  + (sr.height / 2) + canvas.scrollTop;
                const mx = (x1 + x2) / 2;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('class', 'wire-path');
                path.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
                path.addEventListener('click', () => {
                    if (confirm('Remove this wire?')) {
                        delete toBlock.wires[pIdx];
                        window.editor.saveToStorage();
                        this._renderCanvas();
                    }
                });
                svg.appendChild(path);
            });
        });
    }

    // ── Lua generation ────────────────────────────────────────────────────────

    _resolveLuaArg(inst, pIdx) {
        if (inst.wires[pIdx] !== undefined) {
            const srcBlock = this._getBlock(inst.wires[pIdx]);
            if (srcBlock) return this._blockToLua(srcBlock);
        }
        return inst.args[pIdx] || '';
    }

    _blockToLua(inst) {
        const def = this._blockDef(inst);
        if (!def) return '-- unknown block';
        const args = (def.params || []).map((_, i) => this._resolveLuaArg(inst, i));
        return def.toLua(args);
    }

    _scriptToLua(script) {
        const lines = [];
        const root  = script.blocks.find(b => b.id === script.rootBlockId);
        const rest  = script.blocks.filter(b => b.id !== script.rootBlockId)
                        .sort((a, b) => a.y - b.y);

        if (root) lines.push(this._blockToLua(root));
        rest.forEach(inst => lines.push(this._blockToLua(inst)));

        const rootDef = root ? this._blockDef(root) : null;
        if (rootDef && rootDef.id === 'root_function') lines.push('end');
        if (rootDef && (rootDef.id === 'root_on_enter' || rootDef.id === 'root_action')) {
            // These are arrays in game.json — no end needed
        }

        return lines.join('\n');
    }

    _updateLua() {
        const out = document.getElementById('lua-output');
        if (!out || !this._activeScript) return;
        out.textContent = this._scriptToLua(this._activeScript);
    }

    _toggleLua(forceOpen) {
        const panel = document.getElementById('lua-panel');
        const btn   = document.getElementById('lua-toggle-btn');
        if (!panel) return;
        const open = forceOpen !== undefined ? forceOpen : !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        if (btn) btn.textContent = open ? 'Lua ◀' : 'Lua ▶';
        if (open) this._updateLua();
    }
}

window.ScriptingEditor = new ScriptingEditorModule();
