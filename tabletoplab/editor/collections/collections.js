/**
 * collections.js — Collections editor
 *
 * Three panels:
 *   1. CSV editor      — edit collection rows/columns
 *   2. Template editor — extended HTML render descriptor
 *   3. Card layout     — visual drag-and-drop card layout editor
 *
 * Template syntax (no external libraries):
 *   data-col="colName"        — replace element innerHTML with column value
 *   data-if="col=value"       — show/hide element based on condition
 *   data-icon="{{col}}"       — substitute icons inline at text height
 *   data-img="{{col}}"        — fill element background/src with url from col
 *   data-const="some text"    — constant text content
 *
 * Card layout elements (stored in ui.json collectionLayouts[name].elements):
 *   { uid, x, y, w, h, type: 'col'|'const'|'image', source, label }
 */

class CollectionsEditorModule {
    constructor() {
        this.current   = null;  // current collection name
        this._selEl    = null;  // selected card layout element uid
        this._drag     = null;
        this._resize   = null;
        this._gw       = 70;    // grid unit from board editor
        this._gh       = 100;
        this._previewRowIndex = 0;  // current preview row
    }

    // ── Entry ──────────────────────────────────────────────────
    init() {
        this._gw = window.gameConfig.ui.gridSize.w;
        this._gh = window.gameConfig.ui.gridSize.h;

        if (!this._rendered) {
            this._buildDOM();
            this._rendered = false; // will be set true after binds
            this._bindTopBar();
            this._bindCSVButtons();
            this._bindTemplateButtons();
            this._bindCardCanvas();
            this._bindTemplateCollapse();
            this._bindPreviewNavigation();
            this._rendered = true;
        }

        this._renderCollectionTabs();
        const first = Object.keys(window.gameConfig.getCollections())[0];
        if (first) this._switchCollection(first);
    }

    refresh() {
        if (this._rendered) {
            this._gw = window.gameConfig.ui.gridSize.w;
            this._gh = window.gameConfig.ui.gridSize.h;
            this._renderCollectionTabs();
            if (this.current) this._switchCollection(this.current);
        }
    }

    _buildDOM() {
        const pane = document.getElementById('pane-collections');
        if (!pane) return;
        // Inline the collections HTML (avoids fetch dependency)
        pane.innerHTML = `
        <div class="collections-editor">
            <div class="csv-panel panel" style="border-right:var(--border-width-thin) solid var(--color-border);">
                <div class="collection-tabs-bar">
                    <div id="coll-tab-list" style="display:flex;gap:2px;flex:1;overflow-x:auto;"></div>
                    <button class="btn btn-sm" id="coll-btn-add">+</button>
                </div>
                <div class="csv-toolbar" id="csv-toolbar" style="display:none;">
                    <button class="btn btn-sm" id="coll-btn-add-row">+ Row</button>
                    <button class="btn btn-sm" id="coll-btn-add-col">+ Col</button>
                    <button class="btn btn-sm" id="coll-btn-import-csv">Import CSV</button>
                    <button class="btn btn-sm" id="coll-btn-export-csv">Export CSV</button>
                </div>
                <div class="csv-wrap">
                    <table id="coll-csv-table"><thead></thead><tbody></tbody></table>
                </div>
            </div>

            <div class="card-layout-panel">
                <div class="preview-section">
                    <div class="preview-bar">
                        Preview
                        <button class="btn btn-sm" id="preview-prev-btn">◄</button>
                        <span id="preview-row-indicator" style="font-size:0.6rem;color:var(--color-text-secondary);margin:0 0.3rem;">Row 1</span>
                        <button class="btn btn-sm" id="preview-next-btn">▶</button>
                    </div>
                    <div class="preview-scroll" id="coll-preview-scroll"></div>
                </div>
                <div class="layout-divider"></div>
                <div class="panel-header" style="border-bottom:var(--border-width-thin) solid var(--color-border);">
                    Card Layout
                    <button class="btn btn-sm" id="card-btn-add-el">+ Element</button>
                </div>
                <div class="card-layout-wrap">
                    <div class="card-canvas-outer">
                        <div id="card-canvas"></div>
                    </div>
                    <div class="card-inspector panel" style="border-right:none;border-left:var(--border-width-thin) solid var(--color-border);">
                        <div class="panel-header">Element</div>
                        <div style="flex:1;overflow-y:auto;padding:var(--spacing-sm);" id="card-inspector-body">
                            <p style="color:var(--color-text-secondary);font-size:var(--font-size-small);">Select an element</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="template-panel panel" id="template-panel-collapsed" style="display:flex;flex-direction:row;border-right:none;">
                <div class="panel-collapse-toggle" id="template-panel-toggle">
                    <span id="template-panel-toggle-arrow">›</span>
                </div>
                <div style="display:flex;flex-direction:column;flex:1;min-width:0;">
                    <div class="panel-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <span id="template-panel-title">Render Template</span>
                    </div>
                    <div class="template-editor-body" id="template-editor-body">
                    <div class="form-group" style="display:flex;flex-direction:column;gap:0.3rem;">
                        <label style="font-size:var(--font-size-small);color:var(--color-text-secondary);text-transform:uppercase;">Template HTML</label>
                        <textarea id="coll-template"
                            placeholder="&lt;div class='card'&gt;&#10;  &lt;h2 data-col='name'&gt;&lt;/h2&gt;&#10;  &lt;p data-col='effect'&gt;&lt;/p&gt;&#10;&lt;/div&gt;"></textarea>
                    </div>
                    <div class="template-hint">
                        <strong style="color:var(--color-text-accent);">Syntax:</strong><br>
                        <code>data-col="name"</code> — column value<br>
                        <code>data-if="rarity=rare"</code> — conditional<br>
                        <code>data-icon="{{cost}}"</code> — icon at text height<br>
                        <code>data-img="{{img}}"</code> — image fill<br>
                        <code>data-const="text"</code> — constant
                    </div>
                    <div class="form-group" style="display:flex;flex-direction:column;gap:0.3rem;">
                        <label style="font-size:var(--font-size-small);color:var(--color-text-secondary);text-transform:uppercase;">Icon Substitutions</label>
                        <div id="coll-sub-list"></div>
                        <button class="btn btn-sm" id="coll-btn-add-sub" style="width:100%;">+ Substitution</button>
                    </div>
                    <button class="btn btn-sm" id="coll-btn-preview-tmpl" style="width:100%;">Refresh Preview</button>
                    <div style="display:flex;gap:0.3rem;margin-top:0.5rem;">
                        <button class="btn btn-sm" id="coll-btn-import-tmpl" style="flex:1;">Import</button>
                        <button class="btn btn-sm" id="coll-btn-export-tmpl" style="flex:1;">Export</button>
                    </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── Collection tabs ────────────────────────────────────────
    _renderCollectionTabs() {
        const bar = document.getElementById('coll-tab-list');
        if (!bar) return;
        bar.innerHTML = '';
        for (const name of Object.keys(window.gameConfig.getCollections())) {
            const tab = document.createElement('div');
            tab.className = 'collection-tab' + (name === this.current ? ' active' : '');
            tab.dataset.coll = name;
            const span = document.createElement('span');
            span.textContent = name;
            span.style.cursor = 'default';
            span.addEventListener('dblclick', e => {
                e.stopPropagation();
                this._renameCollection(name, tab, span);
            });
            tab.appendChild(span);
            
            const closeBtn = document.createElement('span');
            closeBtn.className = 'collection-tab-close';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', e => {
                e.stopPropagation();
                this._deleteCollection(name);
            });
            tab.appendChild(closeBtn);
            
            tab.addEventListener('click', () => this._switchCollection(name));
            bar.appendChild(tab);
        }
    }

    _renameCollection(oldName, tabEl, spanEl) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.style.width = 'auto';
        input.style.minWidth = '60px';
        input.style.padding = '2px 4px';
        input.style.fontSize = 'inherit';
        
        const save = () => {
            const newName = input.value.trim();
            if (newName && newName !== oldName && !window.gameConfig.getCollections()[newName]) {
                // Rename in gameConfig
                const coll = window.gameConfig.getCollections()[oldName];
                const layout = window.gameConfig.getCollectionLayout(oldName);
                window.gameConfig.deleteCollection(oldName);
                window.gameConfig.setCollection(newName, coll);
                if (layout) window.gameConfig.setCollectionLayout(newName, layout);
                if (this.current === oldName) this.current = newName;
                this._renderCollectionTabs();
                this._switchCollection(newName);
                window.editor?.markDirty();
            } else {
                // Cancelled or invalid, restore
                spanEl.textContent = oldName;
                tabEl.replaceChild(spanEl, input);
            }
        };
        
        tabEl.replaceChild(input, spanEl);
        input.focus();
        input.select();
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') save();
            else if (e.key === 'Escape') {
                spanEl.textContent = oldName;
                tabEl.replaceChild(spanEl, input);
            }
        });
    }

    _switchCollection(name) {
        this.current = name;
        this._selEl = null;
        this._previewRowIndex = 0;  // Reset preview to first row
        // Ensure collection has at least one row
        const coll = window.gameConfig.getCollections()[name];
        if (coll && coll.csv.rows.length === 0) {
            coll.csv.rows.push(coll.csv.headers.map(() => ''));
            window.editor?.markDirty();
        }
        // Show toolbar when a collection is selected
        const toolbar = document.getElementById('csv-toolbar');
        if (toolbar) toolbar.style.display = name ? 'flex' : 'none';
        this._renderCollectionTabs();
        this._renderCSV();
        this._renderTemplate();
        this._renderSubList();
        this._renderCardCanvas();
        this._renderPreview();
    }

    _addCollection() {
        const collections = window.gameConfig.getCollections();
        let num = 1;
        let name = `Collection${num}`;
        while (collections[name]) {
            num++;
            name = `Collection${num}`;
        }
        window.gameConfig.setCollection(name, { csv: { headers: ['col1'], rows: [] }, substitutions: {} });
        window.gameConfig.setCollectionLayout(name, { elements: [], template: '' });
        this._renderCollectionTabs();
        this._switchCollection(name);
        window.editor?.markDirty();
    }

    _deleteCollection(name) {
        window.gameConfig.deleteCollection(name);
        const keys = Object.keys(window.gameConfig.getCollections());
        this.current = keys[0] || null;
        this._renderCollectionTabs();
        if (this.current) this._switchCollection(this.current);
        window.editor?.markDirty();
    }

    _getColl()   { return window.gameConfig.getCollections()[this.current] || null; }
    _getLayout() {
        if (!this.current) return null;
        let layout = window.gameConfig.getCollectionLayout(this.current);
        if (!layout) {
            layout = { elements: [], template: '' };
            window.gameConfig.setCollectionLayout(this.current, layout);
        }
        return layout;
    }
    _save()      { window.editor?.markDirty(); }

    // ── Top bar ────────────────────────────────────────────────
    _bindTopBar() {
        document.getElementById('coll-btn-add')?.addEventListener('click', () => this._addCollection());
    }

    _bindTemplateCollapse() {
        const toggleBtn = document.getElementById('template-panel-toggle');
        const toggleArrow = document.getElementById('template-panel-toggle-arrow');
        const templatePanel = document.getElementById('template-panel-collapsed');
        if (!toggleBtn || !templatePanel) return;
        
        this._templatePanelCollapsed = false;
        toggleBtn.addEventListener('click', () => {
            this._templatePanelCollapsed = !this._templatePanelCollapsed;
            templatePanel.classList.toggle('collapsed', this._templatePanelCollapsed);
            if (toggleArrow) toggleArrow.textContent = this._templatePanelCollapsed ? '‹' : '›';
        });
    }

    _bindPreviewNavigation() {
        const prevBtn = document.getElementById('preview-prev-btn');
        const nextBtn = document.getElementById('preview-next-btn');
        if (!prevBtn || !nextBtn) return;
        
        prevBtn.addEventListener('click', () => {
            const coll = this._getColl();
            if (!coll) return;
            if (this._previewRowIndex > 0) {
                this._previewRowIndex--;
                this._renderPreview();
            }
        });
        nextBtn.addEventListener('click', () => {
            const coll = this._getColl();
            if (!coll) return;
            if (this._previewRowIndex < coll.csv.rows.length - 1) {
                this._previewRowIndex++;
                this._renderPreview();
            }
        });
    }

    // ── CSV ────────────────────────────────────────────────────
    _bindCSVButtons() {
        document.getElementById('coll-btn-add-row')?.addEventListener('click', () => this._addRow());
        document.getElementById('coll-btn-add-col')?.addEventListener('click', () => this._addColumn());
        document.getElementById('coll-btn-import-csv')?.addEventListener('click', () => this._importCSV());
        document.getElementById('coll-btn-export-csv')?.addEventListener('click', () => this._exportCSV());
    }

    _renderCSV() {
        const thead = document.querySelector('#coll-csv-table thead');
        const tbody = document.querySelector('#coll-csv-table tbody');
        if (!thead || !tbody) return;
        thead.innerHTML = ''; tbody.innerHTML = '';
        const coll = this._getColl();
        if (!coll) return;
        const { headers, rows } = coll.csv;

        // Header
        const hr = document.createElement('tr');
        hr.innerHTML = '<th></th>';
        headers.forEach((h, ci) => {
            const th = document.createElement('th');
            th.innerHTML = `<div class="csv-col-header">
                <input type="text" value="${this._esc(h)}" data-ci="${ci}">
                <span class="csv-col-del" data-ci="${ci}">✕</span>
            </div>`;
            th.querySelector('input').addEventListener('blur', e => {
                coll.csv.headers[ci] = e.target.value.trim() || h;
                this._save(); this._renderPreview();
            });
            th.querySelector('.csv-col-del').addEventListener('click', () => this._deleteColumn(ci));
            hr.appendChild(th);
        });
        thead.appendChild(hr);

        // Rows
        rows.forEach((row, ri) => {
            const tr = document.createElement('tr');
            const numTd = document.createElement('td');
            numTd.className = 'csv-row-num';
            numTd.textContent = ri + 1;
            tr.appendChild(numTd);

            headers.forEach((_, ci) => {
                const td = document.createElement('td');
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = row[ci] || '';
                inp.addEventListener('input', () => {
                    coll.csv.rows[ri][ci] = inp.value;
                    this._save();
                });
                inp.addEventListener('keydown', e => {
                    if (e.key === 'Enter') {
                        if (ri + 1 < rows.length) this._focusCell(tbody, ri + 1, ci);
                        else this._addRow();
                    } else if (e.key === 'Tab') {
                        e.preventDefault();
                        if (ci + 1 < headers.length) this._focusCell(tbody, ri, ci + 1);
                        else if (ri + 1 < rows.length) this._focusCell(tbody, ri + 1, 0);
                    }
                });
                td.appendChild(inp);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    _focusCell(tbody, ri, ci) {
        const row = tbody.children[ri];
        if (!row) return;
        row.children[ci + 1]?.querySelector('input')?.focus();
    }

    _addRow() {
        const coll = this._getColl();
        if (!coll) return;
        coll.csv.rows.push(coll.csv.headers.map(() => ''));
        this._save(); this._renderCSV(); this._renderPreview();
    }

    _addColumn() {
        const coll = this._getColl();
        if (!coll) return;
        // Generate enumerated column name
        let colNum = 1;
        let colName = `col${colNum}`;
        while (coll.csv.headers.includes(colName)) {
            colNum++;
            colName = `col${colNum}`;
        }
        coll.csv.headers.push(colName);
        coll.csv.rows.forEach(r => r.push(''));
        this._save(); this._renderCSV(); this._renderPreview();
    }

    _deleteColumn(ci) {
        const coll = this._getColl();
        if (!coll) return;
        coll.csv.headers.splice(ci, 1);
        coll.csv.rows.forEach(r => r.splice(ci, 1));
        this._save(); this._renderCSV(); this._renderPreview();
    }

    _importCSV() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv';
        input.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const lines = ev.target.result.trim().split('\n').filter(l => l.trim());
                if (!lines.length || !this.current) return;
                const coll = this._getColl();
                coll.csv.headers = lines[0].split(',').map(h => h.trim());
                coll.csv.rows    = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
                this._save(); this._renderCSV(); this._renderPreview();
            };
            reader.readAsText(file);
        });
        input.click();
    }

    _exportCSV() {
        const coll = this._getColl();
        if (!coll) return;
        const txt = [coll.csv.headers.join(','),
            ...coll.csv.rows.map(r => r.join(','))].join('\n');
        this._downloadText(txt, `${this.current}.csv`, 'text/csv');
    }

    // ── Template editor ────────────────────────────────────────
    _bindTemplateButtons() {
        document.getElementById('coll-btn-import-tmpl')?.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.html,.txt';
            inp.addEventListener('change', e => {
                const f = e.target.files[0]; if (!f) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    const layout = this._getLayout();
                    if (!layout) return;
                    layout.template = ev.target.result;
                    const ta = document.getElementById('coll-template');
                    if (ta) ta.value = ev.target.result;
                    this._save(); this._renderPreview();
                };
                reader.readAsText(f);
            });
            inp.click();
        });

        document.getElementById('coll-btn-export-tmpl')?.addEventListener('click', () => {
            const layout = this._getLayout();
            this._downloadText(layout.template || '', `${this.current}.template.html`, 'text/html');
        });

        document.getElementById('coll-template')?.addEventListener('input', e => {
            const layout = this._getLayout();
            layout.template = e.target.value;
            this._save();
        });

        document.getElementById('coll-btn-add-sub')?.addEventListener('click', () => {
            const coll = this._getColl();
            if (!coll) return;
            if (!coll.substitutions) coll.substitutions = {};
            coll.substitutions['(W)'] = '';
            this._renderSubList();
        });

        document.getElementById('coll-btn-preview-tmpl')?.addEventListener('click', () => {
            this._renderPreview();
        });
    }

    _renderTemplate() {
        const layout = this._getLayout();
        const el = document.getElementById('coll-template');
        if (el) el.value = layout.template || '';
    }

    _renderSubList() {
        const list = document.getElementById('coll-sub-list');
        if (!list) return;
        const coll = this._getColl();
        if (!coll) { list.innerHTML = ''; return; }
        const subs = coll.substitutions || {};
        list.innerHTML = '';

        for (const [pattern, url] of Object.entries(subs)) {
            const row = document.createElement('div');
            row.className = 'sub-row';
            row.innerHTML = `
                <input type="text" value="${this._esc(pattern)}" placeholder="(W)" style="max-width:60px;">
                <span style="color:var(--color-text-secondary);font-size:0.7rem;">→</span>
                <input type="text" value="${this._esc(url)}" placeholder="https://... icon url">
                <span class="sub-del">✕</span>
            `;

            const [patInp, urlInp] = row.querySelectorAll('input');
            const updateSub = () => {
                const oldPat = pattern;
                const newPat = patInp.value.trim();
                const newUrl = urlInp.value.trim();
                delete subs[oldPat];
                if (newPat) subs[newPat] = newUrl;
                this._save();
            };
            patInp.addEventListener('blur', updateSub);
            urlInp.addEventListener('blur', updateSub);
            row.querySelector('.sub-del').addEventListener('click', () => {
                delete subs[pattern];
                this._save(); this._renderSubList();
            });
            list.appendChild(row);
        }
    }

    // ── Card canvas ────────────────────────────────────────────
    _bindCardCanvas() {
        document.getElementById('card-btn-add-el')?.addEventListener('click', () => this._addCardElement());
        document.addEventListener('mousemove', e => this._onCardMouseMove(e));
        document.addEventListener('mouseup',   e => this._onCardMouseUp(e));

        const canvas = document.getElementById('card-canvas');
        if (canvas) {
            canvas.addEventListener('click', e => {
                if (e.target === canvas) { this._selEl = null; this._renderCardCanvas(); this._renderCardInspector(); }
            });
        }
    }

    _renderCardCanvas() {
        const canvas = document.getElementById('card-canvas');
        if (!canvas) return;
        const layout = this._getLayout();

        // Default card size = 2.5×3.5 grid units (standard card ratio)
        const cw = this._gw * 2.5;
        const ch = this._gh * 3.5;
        canvas.style.width      = Math.round(cw) + 'px';
        canvas.style.height     = Math.round(ch) + 'px';
        canvas.style.backgroundSize = `${this._gw}px ${this._gh}px`;
        canvas.style.backgroundImage =
            `linear-gradient(to right,rgba(127,127,127,0.1) 1px,transparent 1px),
             linear-gradient(to bottom,rgba(127,127,127,0.1) 1px,transparent 1px)`;

        canvas.innerHTML = '';

        (layout.elements || []).forEach(el => {
            const div = this._buildCardEl(el, canvas);
            canvas.appendChild(div);
        });
    }

    _buildCardEl(elData, canvas) {
        const div = document.createElement('div');
        div.className = 'card-el' + (this._selEl === elData.uid ? ' selected' : '');
        div.dataset.uid = elData.uid;
        div.style.left   = elData.x + 'px';
        div.style.top    = elData.y + 'px';
        div.style.width  = elData.w + 'px';
        div.style.height = elData.h + 'px';

        const label = document.createElement('span');
        label.className = 'card-el-label';
        label.textContent = elData.label || elData.source || '?';
        div.appendChild(label);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'card-el-resize';
        div.appendChild(resizeHandle);

        div.addEventListener('mousedown', e => {
            if (e.target.classList.contains('card-el-resize')) return;
            e.stopPropagation();
            this._selEl = elData.uid;
            this._drag = {
                uid: elData.uid,
                startX: e.clientX - elData.x,
                startY: e.clientY - elData.y
            };
            this._renderCardCanvas();
            this._renderCardInspector();
        });

        resizeHandle.addEventListener('mousedown', e => {
            e.stopPropagation();
            this._selEl = elData.uid;
            this._resize = {
                uid:   elData.uid,
                startX: e.clientX,
                startY: e.clientY,
                origW: elData.w,
                origH: elData.h
            };
        });

        return div;
    }

    _onCardMouseMove(e) {
        const layout = this._getLayout();
        const find = uid => (layout.elements || []).find(el => el.uid === uid);

        if (this._drag) {
            const el = find(this._drag.uid);
            if (!el) return;
            el.x = Math.max(0, e.clientX - this._drag.startX);
            el.y = Math.max(0, e.clientY - this._drag.startY);
            const domEl = document.querySelector(`#card-canvas [data-uid="${el.uid}"]`);
            if (domEl) { domEl.style.left = el.x + 'px'; domEl.style.top = el.y + 'px'; }
            if (this._selEl === el.uid) this._renderCardInspector();
        }

        if (this._resize) {
            const el = find(this._resize.uid);
            if (!el) return;
            el.w = Math.max(20, this._resize.origW + (e.clientX - this._resize.startX));
            el.h = Math.max(16, this._resize.origH + (e.clientY - this._resize.startY));
            const domEl = document.querySelector(`#card-canvas [data-uid="${el.uid}"]`);
            if (domEl) { domEl.style.width = el.w + 'px'; domEl.style.height = el.h + 'px'; }
            if (this._selEl === el.uid) this._renderCardInspector();
        }
    }

    _onCardMouseUp() {
        if (this._drag || this._resize) {
            this._save();
        }
        this._drag = null;
        this._resize = null;
    }

    _addCardElement() {
        if (!this.current) return;
        const layout = this._getLayout();
        if (!layout.elements) layout.elements = [];
        const uid = `cel_${Date.now()}`;
        layout.elements.push({
            uid,
            x: 10, y: 10,
            w: Math.round(this._gw * 2),
            h: Math.round(this._gh * 0.5),
            type: 'col',
            source: '',
            label: 'New Element'
        });
        this._selEl = uid;
        this._save();
        this._renderCardCanvas();
        this._renderCardInspector();
    }

    _renderCardInspector() {
        const body = document.getElementById('card-inspector-body');
        if (!body) return;

        if (!this._selEl) {
            body.innerHTML = '<p style="color:var(--color-text-secondary);font-size:0.72rem;">Select an element</p>';
            return;
        }

        const layout = this._getLayout();
        const el = (layout.elements || []).find(e => e.uid === this._selEl);
        if (!el) { body.innerHTML = ''; return; }

        const coll    = this._getColl();
        const headers = coll?.csv?.headers || [];

        body.innerHTML = `
            <div class="inspector-field">
                <label style="font-size:0.65rem;color:var(--color-text-secondary);text-transform:uppercase;display:block;margin-bottom:0.2rem;">Label</label>
                <input type="text" id="ci-label" value="${this._esc(el.label || '')}"
                    style="width:100%;padding:0.3rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.75rem;">
            </div>
            <div class="inspector-field">
                <label style="font-size:0.65rem;color:var(--color-text-secondary);text-transform:uppercase;display:block;margin-bottom:0.2rem;">Type</label>
                <select id="ci-type" style="width:100%;padding:0.3rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.75rem;">
                    <option value="col"   ${el.type==='col'   ?'selected':''}>Column</option>
                    <option value="const" ${el.type==='const' ?'selected':''}>Constant</option>
                    <option value="image" ${el.type==='image' ?'selected':''}>Image (col/url)</option>
                </select>
            </div>
            <div class="inspector-field" id="ci-source-wrap">
                <label style="font-size:0.65rem;color:var(--color-text-secondary);text-transform:uppercase;display:block;margin-bottom:0.2rem;">
                    ${el.type === 'col' ? 'Column' : el.type === 'image' ? 'Column or URL' : 'Text'}
                </label>
                ${el.type === 'col'
                    ? `<select id="ci-source" style="width:100%;padding:0.3rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.75rem;">
                        ${headers.map(h => `<option ${el.source===h?'selected':''}>${h}</option>`).join('')}
                       </select>`
                    : `<input type="text" id="ci-source" value="${this._esc(el.source||'')}"
                        style="width:100%;padding:0.3rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.75rem;">`
                }
            </div>
            <div class="inspector-field">
                <label style="font-size:0.65rem;color:var(--color-text-secondary);text-transform:uppercase;display:block;margin-bottom:0.2rem;">X/Y/W/H</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;">
                    <input type="number" id="ci-x" value="${el.x}" style="padding:0.25rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.72rem;">
                    <input type="number" id="ci-y" value="${el.y}" style="padding:0.25rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.72rem;">
                    <input type="number" id="ci-w" value="${el.w}" style="padding:0.25rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.72rem;">
                    <input type="number" id="ci-h" value="${el.h}" style="padding:0.25rem;background:var(--color-bg-tertiary);border:1px solid var(--color-border);color:var(--color-text-primary);font-family:var(--font-family);font-size:0.72rem;">
                </div>
            </div>
            <button class="btn btn-danger" id="ci-del" style="width:100%;font-size:0.65rem;margin-top:0.25rem;">Remove</button>
        `;

        // Events
        document.getElementById('ci-label')?.addEventListener('blur', e => { el.label = e.target.value; this._save(); this._renderCardCanvas(); });
        document.getElementById('ci-type')?.addEventListener('change', e => { el.type = e.target.value; this._save(); this._renderCardCanvas(); this._renderCardInspector(); });
        document.getElementById('ci-source')?.addEventListener('blur', e => { el.source = e.target.value; this._save(); this._renderCardCanvas(); });
        document.getElementById('ci-source')?.addEventListener('change', e => { el.source = e.target.value; this._save(); });

        ['ci-x','ci-y','ci-w','ci-h'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => {
                el.x = parseInt(document.getElementById('ci-x').value) || 0;
                el.y = parseInt(document.getElementById('ci-y').value) || 0;
                el.w = parseInt(document.getElementById('ci-w').value) || 40;
                el.h = parseInt(document.getElementById('ci-h').value) || 20;
                this._save(); this._renderCardCanvas();
            });
        });

        document.getElementById('ci-del')?.addEventListener('click', () => {
            const layout = this._getLayout();
            layout.elements = layout.elements.filter(e => e.uid !== this._selEl);
            this._selEl = null;
            this._save(); this._renderCardCanvas(); this._renderCardInspector();
        });
    }

    // ── Preview ────────────────────────────────────────────────
    _renderPreview() {
        const scroll = document.getElementById('coll-preview-scroll');
        const indicator = document.getElementById('preview-row-indicator');
        if (!scroll || !indicator) return;
        scroll.innerHTML = '';
        const coll = this._getColl();
        if (!coll) return;

        const layout   = this._getLayout();
        const template = layout.template || '';
        const subs     = coll.substitutions || {};
        
        // Ensure row index is valid
        if (this._previewRowIndex >= coll.csv.rows.length) {
            this._previewRowIndex = Math.max(0, coll.csv.rows.length - 1);
        }
        
        // Only render the active row
        const row = coll.csv.rows[this._previewRowIndex];
        if (!row) return;
        
        const data = {};
        coll.csv.headers.forEach((h, i) => { data[h] = row[i] || ''; });

        // Card dimensions
        const cw = Math.round(this._gw * 2.5);
        const ch = Math.round(this._gh * 3.5);

        const frame = document.createElement('div');
        frame.className = 'preview-card-frame';
        frame.style.width  = cw + 'px';
        frame.style.height = ch + 'px';

        if (template) {
            // Render template-based preview
            frame.innerHTML = this._renderTemplate_row(template, data, subs);
        } else if (layout.elements?.length) {
            // Render layout-based preview
            frame.style.position = 'relative';
            frame.style.background = 'white';
            layout.elements.forEach(el => {
                const div = document.createElement('div');
                div.style.cssText = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;overflow:hidden;font-size:0.7rem;color:#000;display:flex;align-items:center;padding:0.1rem 0.2rem;`;
                if (el.type === 'col')   div.textContent = data[el.source] || '';
                if (el.type === 'const') div.textContent = el.source || '';
                if (el.type === 'image') {
                    const src = data[el.source] || el.source || '';
                    div.style.backgroundImage = `url(${src})`;
                    div.style.backgroundSize  = 'cover';
                    div.style.backgroundPosition = 'center';
                }
                frame.appendChild(div);
            });
        } else {
            // Fallback: simple text dump
            frame.style.padding = '0.5rem';
            frame.style.fontSize = '0.65rem';
            frame.style.color = '#333';
            frame.style.background = 'white';
            frame.innerHTML = Object.entries(data)
                .map(([k,v]) => `<div><b>${k}:</b> ${v}</div>`).join('');
        }

        scroll.appendChild(frame);
        
        // Update indicator
        indicator.textContent = `Row ${this._previewRowIndex + 1} of ${coll.csv.rows.length}`;
    }

    /**
     * Template renderer — interprets the extended HTML template against a data row.
     * No external libraries. Runs entirely in-browser.
     *
     * Supported attributes:
     *   data-col="colName"        — set innerHTML to column value (with icon subs applied)
     *   data-const="text"         — set innerHTML to constant text
     *   data-if="col=value"       — hide element if condition not met
     *   data-img="{{col}}"        — set img src or background-image
     *   data-icon="{{col}}"       — inline icons at 1em height within text
     */
    _renderTemplate_row(templateStr, data, subs) {
        const parser = new DOMParser();
        const doc    = parser.parseFromString(templateStr, 'text/html');

        const resolveExpr = str => {
            return str.replace(/\{\{(\w+)\}\}/g, (_, col) => data[col] || '');
        };

        const applyIconSubs = (text, subs) => {
            let result = text;
            for (const [pattern, url] of Object.entries(subs)) {
                if (!url) continue;
                const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const imgTag  = `<img src="${url}" style="height:1em;width:auto;vertical-align:middle;display:inline-block;" alt="${pattern}">`;
                result = result.replace(new RegExp(escaped, 'g'), imgTag);
            }
            return result;
        };

        // Process all elements with data attributes
        const process = el => {
            // Conditional
            if (el.hasAttribute('data-if')) {
                const cond = el.getAttribute('data-if'); // "col=value" or "col!=value"
                const matchNeq = cond.match(/^(\w+)!=(.+)$/);
                const matchEq  = cond.match(/^(\w+)=(.+)$/);
                if (matchNeq) {
                    if ((data[matchNeq[1]] || '') === matchNeq[2]) { el.style.display = 'none'; return; }
                } else if (matchEq) {
                    if ((data[matchEq[1]] || '') !== matchEq[2]) { el.style.display = 'none'; return; }
                }
            }

            // Content
            if (el.hasAttribute('data-col')) {
                const col = el.getAttribute('data-col');
                const val = data[col] || '';
                el.innerHTML = applyIconSubs(val, subs);
            }
            if (el.hasAttribute('data-const')) {
                el.innerHTML = applyIconSubs(el.getAttribute('data-const'), subs);
            }
            if (el.hasAttribute('data-img')) {
                const src = resolveExpr(el.getAttribute('data-img'));
                if (el.tagName === 'IMG') el.src = src;
                else el.style.backgroundImage = `url(${src})`;
            }
            if (el.hasAttribute('data-icon')) {
                const val = resolveExpr(el.getAttribute('data-icon'));
                const url = subs[val] || '';
                if (url) el.innerHTML = `<img src="${url}" style="height:1em;width:auto;vertical-align:middle;">`;
                else     el.textContent = val;
            }

            // Recurse
            el.children && Array.from(el.children).forEach(process);
        };

        Array.from(doc.body.children).forEach(process);
        return doc.body.innerHTML;
    }

    // ── Utilities ──────────────────────────────────────────────
    _esc(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    _downloadText(text, filename, mime) {
        const blob = new Blob([text], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    /** Used by editor.js during ZIP import */
    static importCSVData(gameData, collName, csvText) {
        const lines = csvText.trim().split('\n').filter(l => l.trim());
        if (!lines.length) return;
        if (!gameData.collections) gameData.collections = {};
        gameData.collections[collName] = {
            csv: {
                headers: lines[0].split(',').map(h => h.trim()),
                rows: lines.slice(1).map(l => l.split(',').map(c => c.trim()))
            },
            substitutions: {}
        };
    }
}

window.CollectionsEditor = new CollectionsEditorModule();
