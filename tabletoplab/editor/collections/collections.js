// Collections Editor Module - Multi-collection support with Nandeck rendering

class CollectionsEditorModule {
    constructor() {
        this.gameData = null;
        this.collections = {};
        this.currentCollection = null;
    }

    init(gameData) {
        this.gameData = gameData;
        this.loadCollections();
        this.setupEventListeners();
        this.renderCollectionTabs();
        if (this.currentCollection) {
            this.switchCollection(this.currentCollection);
        }
    }

    setupEventListeners() {
        const addCollectionBtn = document.getElementById('btn-add-collection');
        const addRowBtn = document.getElementById('btn-csv-add-row');
        const addColBtn = document.getElementById('btn-csv-add-column');
        const importBtn = document.getElementById('btn-csv-import');
        const exportBtn = document.getElementById('btn-csv-export');
        const renderImportBtn = document.getElementById('btn-render-import');
        const renderExportBtn = document.getElementById('btn-render-export');
        const renderScriptArea = document.getElementById('render-script');

        if (addCollectionBtn) addCollectionBtn.addEventListener('click', () => this.addCollection());
        if (addRowBtn) addRowBtn.addEventListener('click', () => this.addCSVRow());
        if (addColBtn) addColBtn.addEventListener('click', () => this.addCSVColumn());
        if (importBtn) importBtn.addEventListener('click', () => this.importCSV());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportCSV());
        if (renderImportBtn) renderImportBtn.addEventListener('click', () => this.importNandeck());
        if (renderExportBtn) renderExportBtn.addEventListener('click', () => this.exportNandeck());
        if (renderScriptArea) {
            renderScriptArea.addEventListener('change', () => {
                if (this.collections[this.currentCollection]) {
                    this.collections[this.currentCollection].renderScript = renderScriptArea.value;
                    this.saveCollections();
                    this.renderPreview();
                }
            });
        }
    }

    loadCollections() {
        const saved = this.gameData.collections || {};
        this.collections = saved;
        this.currentCollection = Object.keys(this.collections)[0] || null;
    }

    saveCollections() {
        this.gameData.collections = this.collections;
        window.editor.saveToLocalStorage();
    }

    addCollection() {
        const name = prompt('Collection name (e.g., "Card", "Hero"):');
        if (!name) return;

        this.collections[name] = {
            csv: { headers: ['name'], rows: [] },
            renderScript: ''
        };

        this.currentCollection = name;
        this.saveCollections();
        this.renderCollectionTabs();
        this.switchCollection(name);
    }

    switchCollection(name) {
        this.currentCollection = name;
        document.querySelectorAll('.collection-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.collection === name);
        });

        const collection = this.collections[name];
        if (collection) {
            this.renderCSV(collection.csv);
            this.renderRenderScript(collection.renderScript);
            this.renderPreview();
        }
    }

    deleteCollection(name) {
        if (confirm(`Delete collection "${name}"?`)) {
            delete this.collections[name];
            this.currentCollection = Object.keys(this.collections)[0] || null;
            this.saveCollections();
            this.renderCollectionTabs();
            if (this.currentCollection) {
                this.switchCollection(this.currentCollection);
            }
        }
    }

    renderCollectionTabs() {
        const list = document.getElementById('collections-list');
        if (!list) return;

        list.innerHTML = '';
        for (const name of Object.keys(this.collections)) {
            const tab = document.createElement('div');
            tab.className = `collection-tab ${name === this.currentCollection ? 'active' : ''}`;
            tab.dataset.collection = name;
            tab.innerHTML = `
                ${name}
                <span class="collection-tab-close">×</span>
            `;

            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('collection-tab-close')) {
                    this.deleteCollection(name);
                } else {
                    this.switchCollection(name);
                }
            });

            list.appendChild(tab);
        }
    }

    renderRenderScript(script) {
        const area = document.getElementById('render-script');
        if (area) area.value = script || '';
    }

    addCSVRow() {
        if (!this.currentCollection || !this.collections[this.currentCollection]) return;
        const csv = this.collections[this.currentCollection].csv;
        const newRow = csv.headers.map(() => '');
        csv.rows.push(newRow);
        this.saveCollections();
        this.renderCSV(csv);
        this.renderPreview();
    }

    addCSVColumn() {
        if (!this.currentCollection || !this.collections[this.currentCollection]) return;
        const colName = prompt('Column name:');
        if (!colName) return;

        const csv = this.collections[this.currentCollection].csv;
        csv.headers.push(colName);
        csv.rows.forEach(row => row.push(''));
        this.saveCollections();
        this.renderCSV(csv);
        this.renderPreview();
    }

    updateCSVCell(csv, rowIdx, colIdx, value) {
        csv.rows[rowIdx][colIdx] = value;
        this.saveCollections();
        this.renderPreview();
    }

    deleteCSVRow(csv, rowIdx) {
        csv.rows.splice(rowIdx, 1);
        this.saveCollections();
        this.renderCSV(csv);
        this.renderPreview();
    }

    renderCSV(csv) {
        const thead = document.querySelector('#csv-table thead');
        const tbody = document.querySelector('#csv-table tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        // Header row
        const hr = document.createElement('tr');
        hr.innerHTML = '<th style="width:40px"><span style="color:#999">#</span></th>';
        
        csv.headers.forEach((header, idx) => {
            const th = document.createElement('th');
            th.innerHTML = `
                <div class="col-header-wrap">
                    <input type="text" value="${this.escapeHtml(header)}" 
                           onchange="window.CollectionsEditor.renameColumn('${this.currentCollection}', ${idx}, this.value)">
                    <span class="col-del" onclick="window.CollectionsEditor.deleteColumn('${this.currentCollection}', ${idx})">✕</span>
                </div>`;
            hr.appendChild(th);
        });
        thead.appendChild(hr);

        // Data rows
        csv.rows.forEach((row, rowIdx) => {
            const tr = document.createElement('tr');

            // Row number
            const numTd = document.createElement('td');
            numTd.className = 'row-num';
            numTd.textContent = rowIdx + 1;
            tr.appendChild(numTd);

            row.forEach((cell, colIdx) => {
                const td = document.createElement('td');
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.value = cell || '';

                inp.addEventListener('input', () => {
                    this.updateCSVCell(csv, rowIdx, colIdx, inp.value);
                });

                // Keyboard navigation
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const nextColIdx = colIdx + 1;
                        if (nextColIdx < csv.headers.length) {
                            this.focusCell(tbody, rowIdx, nextColIdx);
                        } else if (rowIdx + 1 < csv.rows.length) {
                            this.focusCell(tbody, rowIdx + 1, 0);
                        }
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (rowIdx + 1 < csv.rows.length) {
                            this.focusCell(tbody, rowIdx + 1, colIdx);
                        } else {
                            this.addCSVRow();
                        }
                    }
                });

                td.appendChild(inp);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
    }

    focusCell(tbody, rowIdx, colIdx) {
        const row = tbody.children[rowIdx];
        if (!row) return;
        // +1 to skip row number cell
        const cell = row.children[colIdx + 1];
        if (cell) cell.querySelector('input')?.focus();
    }

    renameColumn(collectionName, idx, value) {
        const csv = this.collections[collectionName].csv;
        csv.headers[idx] = value;
        this.saveCollections();
        this.renderPreview();
    }

    deleteColumn(collectionName, idx) {
        if (!confirm(`Delete column "${this.collections[collectionName].csv.headers[idx]}"?`)) return;
        const csv = this.collections[collectionName].csv;
        csv.headers.splice(idx, 1);
        csv.rows.forEach(r => r.splice(idx, 1));
        this.saveCollections();
        this.renderCSV(csv);
        this.renderPreview();
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    renderPreview() {
        const preview = document.getElementById('collections-preview');
        if (!preview) return;

        if (!this.currentCollection || !this.collections[this.currentCollection]) {
            preview.innerHTML = '<p style="color: #999;">No collection selected</p>';
            return;
        }

        const collection = this.collections[this.currentCollection];
        const csv = collection.csv;
        const renderScript = collection.renderScript;

        preview.innerHTML = '';

        if (csv.rows.length === 0) {
            preview.innerHTML = '<p style="color: #999; grid-column: 1/-1;">No cards to preview</p>';
            return;
        }

        if (!renderScript) {
            preview.innerHTML = '<p style="color: #999; grid-column: 1/-1;">Add an HTML template to preview</p>';
            return;
        }

        // Parse substitutions from render script (JSON format)
        let substitutions = {};
        try {
            const subsMatch = renderScript.match(/substitutions:\s*({[\s\S]*?})/);
            if (subsMatch) {
                substitutions = JSON.parse(subsMatch[1]);
            }
        } catch (e) {
            console.error('Error parsing substitutions:', e);
        }

        // Render each row as a card
        csv.rows.forEach((row) => {
            const card = document.createElement('div');
            card.className = 'preview-card';

            // Create data object from headers and row
            const data = {};
            csv.headers.forEach((header, idx) => {
                data[header] = row[idx] || '';
            });

            // Render HTML template with data substitution
            let html = renderScript;

            // Replace {{column}} with values
            for (const [key, value] of Object.entries(data)) {
                html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
            }

            // Replace substitutions (string to image)
            for (const [oldStr, imageUrl] of Object.entries(substitutions)) {
                const imgHtml = `<img src="${imageUrl}" style="max-width:100%; max-height:50px; display:inline-block;" />`;
                html = html.replace(new RegExp(oldStr, 'g'), imgHtml);
            }

            card.innerHTML = html;
            preview.appendChild(card);
        });
    }

    importCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const csv = event.target.result;
                const lines = csv.split('\n').filter(line => line.trim());
                
                if (lines.length > 0 && this.currentCollection) {
                    const collection = this.collections[this.currentCollection];
                    collection.csv.headers = lines[0].split(',').map(h => h.trim());
                    collection.csv.rows = lines.slice(1).map(line => 
                        line.split(',').map(cell => cell.trim())
                    );
                    
                    this.saveCollections();
                    this.renderCSV(collection.csv);
                    this.renderPreview();
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    exportCSV() {
        if (!this.currentCollection || !this.collections[this.currentCollection]) return;

        const csv = this.collections[this.currentCollection].csv;
        let csvText = csv.headers.join(',') + '\n';
        csvText += csv.rows.map(row => row.join(',')).join('\n');

        const blob = new Blob([csvText], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentCollection}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importNandeck() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const txt = event.target.result;
                if (this.currentCollection) {
                    this.collections[this.currentCollection].renderScript = txt;
                    this.saveCollections();
                    this.renderRenderScript(txt);
                    this.renderPreview();
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    exportNandeck() {
        if (!this.currentCollection || !this.collections[this.currentCollection]) return;

        const renderScript = this.collections[this.currentCollection].renderScript;
        const blob = new Blob([renderScript], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentCollection}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Static method to parse CSV text and populate collections
     * Used by editor.js during import operations
     */
    static importCSVData(gameData, collName, csvText) {
        const lines = csvText.trim().split('\n').filter(l => l.trim());
        if (lines.length === 0) return;

        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map(line => 
            line.split(',').map(cell => cell.trim())
        );

        if (!gameData.collections) {
            gameData.collections = {};
        }

        gameData.collections[collName] = {
            csv: { headers, rows },
            renderScript: ''
        };
    }
}

// Initialize the collections editor module
window.CollectionsEditor = new CollectionsEditorModule();
