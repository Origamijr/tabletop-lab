/**
 * editor.js — Main editor controller.
 * Manages tab switching, import/export, dirty-state tracking.
 */

class Editor {
    constructor() {
        this.currentTab = 'board';
        this.isDirty = false;
        this._tabsInitialised = {};

        this._initEventListeners();
        this._loadFromStorage();         // populate gameConfig from last session
        this._initUnsavedWarning();
    }

    // ── Boot ──────────────────────────────────────────────────────────────────

    _initEventListeners() {
        document.querySelectorAll('.tab-btn').forEach(btn =>
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab))
        );
        document.getElementById('btn-import').addEventListener('click', () => this.importGame());
        document.getElementById('btn-export').addEventListener('click', () => this.exportGame());
    }

    _initUnsavedWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    // ── Dirty state ───────────────────────────────────────────────────────────

    markDirty() {
        this.isDirty = true;
        const ind = document.getElementById('dirty-indicator');
        if (ind) ind.textContent = '● unsaved';
    }

    markClean() {
        this.isDirty = false;
        const ind = document.getElementById('dirty-indicator');
        if (ind) ind.textContent = '';
    }

    // ── Tab switching ─────────────────────────────────────────────────────────

    switchTab(tabName) {
        this.currentTab = tabName;

        document.querySelectorAll('.tab-btn').forEach(btn =>
            btn.classList.toggle('active', btn.dataset.tab === tabName)
        );
        document.querySelectorAll('.tab-pane').forEach(pane =>
            pane.classList.toggle('active', pane.dataset.tab === tabName)
        );

        this._initTab(tabName);
    }

    _initTab(tabName) {
        switch (tabName) {
            case 'board':
                if (window.BoardEditor) window.BoardEditor.init();
                break;
            case 'scripting':
                if (window.ScriptingEditor) window.ScriptingEditor.init();
                break;
            case 'gamestate':
                if (window.GameStateEditor) window.GameStateEditor.init();
                break;
            case 'collections':
                if (window.CollectionsEditor) window.CollectionsEditor.init();
                break;
        }
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    saveToStorage() {
        try {
            sessionStorage.setItem('tl_game',    JSON.stringify(window.gameConfig.exportGame()));
            sessionStorage.setItem('tl_ui',      JSON.stringify(window.gameConfig.exportUI()));
            sessionStorage.setItem('tl_scripts', JSON.stringify(window.gameConfig._scripts || []));
            sessionStorage.setItem('tl_fsmlayout', JSON.stringify(window.gameConfig.ui._fsmLayout || {}));
        } catch(e) {
            console.warn('Session storage write failed:', e);
        }
        this.markDirty();
    }

    _loadFromStorage() {
        try {
            const game      = sessionStorage.getItem('tl_game');
            const ui        = sessionStorage.getItem('tl_ui');
            const scripts   = sessionStorage.getItem('tl_scripts');
            const fsmLayout = sessionStorage.getItem('tl_fsmlayout');
            if (game)      window.gameConfig.importGame(JSON.parse(game));
            if (ui)        window.gameConfig.importUI(JSON.parse(ui));
            if (scripts)   window.gameConfig._scripts = JSON.parse(scripts);
            if (fsmLayout) window.gameConfig.ui._fsmLayout = JSON.parse(fsmLayout);
        } catch(e) {
            console.warn('Session storage read failed:', e);
        }
        // Init the default tab
        setTimeout(() => this._initTab(this.currentTab), 0);
    }

    // ── Import ────────────────────────────────────────────────────────────────

    importGame() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,.json';
        input.multiple = true;
        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            const zip = files.find(f => f.name.endsWith('.zip'));
            zip ? this._importZip(zip) : this._importFiles(files);
        });
        input.click();
    }

    async _importZip(zipFile) {
        if (typeof JSZip === 'undefined') { alert('JSZip not loaded'); return; }
        try {
            const zip = await new JSZip().loadAsync(zipFile);

            // game.json
            if (zip.file('game.json')) {
                const txt = await zip.file('game.json').async('text');
                window.gameConfig.importGame(JSON.parse(txt));
            }
            // ui.json
            if (zip.file('ui.json')) {
                const txt = await zip.file('ui.json').async('text');
                window.gameConfig.importUI(JSON.parse(txt));
            }
            // scripts.json
            if (zip.file('scripts.json')) {
                const txt = await zip.file('scripts.json').async('text');
                window.gameConfig._scripts = JSON.parse(txt);
            }
            // CSVs
            for (const [path, file] of Object.entries(zip.files)) {
                if (!file.dir && path.endsWith('.csv')) {
                    const txt = await file.async('text');
                    const name = path.replace(/\.csv$/, '');
                    this._parseCSVIntoCollection(name, txt);
                }
            }

            this.saveToStorage();
            this._refreshAllTabs();
            this.markClean();
            alert('Imported successfully.');
        } catch(e) { alert('Import error: ' + e.message); }
    }

    _importFiles(files) {
        const gameFile = files.find(f => f.name === 'game.json');
        const uiFile   = files.find(f => f.name === 'ui.json');
        const csvFiles = files.filter(f => f.name.endsWith('.csv'));

        const readText = (file) => new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = e => res(e.target.result);
            r.onerror = rej;
            r.readAsText(file);
        });

        Promise.all([
            gameFile ? readText(gameFile) : Promise.resolve(null),
            uiFile   ? readText(uiFile)   : Promise.resolve(null),
            ...csvFiles.map(f => readText(f).then(t => ({ name: f.name.replace(/\.csv$/, ''), text: t })))
        ]).then(([gameText, uiText, ...csvResults]) => {
            if (gameText) window.gameConfig.importGame(JSON.parse(gameText));
            if (uiText)   window.gameConfig.importUI(JSON.parse(uiText));
            csvResults.forEach(c => { if (c) this._parseCSVIntoCollection(c.name, c.text); });
            this.saveToStorage();
            this._refreshAllTabs();
            this.markClean();
            alert('Imported successfully.');
        }).catch(e => alert('Import error: ' + e.message));
    }

    _parseCSVIntoCollection(name, text) {
        const lines = text.trim().split('\n').filter(l => l.trim());
        if (!lines.length) return;
        const headers = lines[0].split(',').map(h => h.trim());
        const rows    = lines.slice(1).map(l => l.split(',').map(c => c.trim()));
        const existing = window.gameConfig.getCollection(name) || {};
        window.gameConfig.setCollection(name, { ...existing, csv: { headers, rows } });
    }

    // ── Export ────────────────────────────────────────────────────────────────

    async exportGame() {
        if (typeof JSZip === 'undefined') { alert('JSZip not loaded'); return; }

        // Let board editor generate ui.html before export
        let uiHTML = '';
        if (window.BoardEditor && window.BoardEditor.generateHTML) {
            uiHTML = window.BoardEditor.generateHTML();
        }

        const zip = new JSZip();
        const gameName = (window.gameConfig.ui.gamename || 'game').replace(/\s+/g, '_');

        zip.file('game.json', JSON.stringify(window.gameConfig.exportGame(), null, 2));
        zip.file('ui.json',   JSON.stringify(window.gameConfig.exportUI(),   null, 2));
        if (window.gameConfig._scripts && window.gameConfig._scripts.length) {
            zip.file('scripts.json', JSON.stringify(window.gameConfig._scripts, null, 2));
        }
        if (uiHTML) zip.file('ui.html', uiHTML);

        // CSVs
        for (const [name, coll] of Object.entries(window.gameConfig.getCollections())) {
            if (coll.csv) zip.file(`${name}.csv`, this._csvText(coll.csv));
        }

        try {
            const blob = await zip.generateAsync({ type: 'blob' });
            const url  = URL.createObjectURL(blob);
            const a    = Object.assign(document.createElement('a'), { href: url, download: `${gameName}.zip` });
            a.click();
            URL.revokeObjectURL(url);
            this.markClean();
        } catch(e) { alert('Export error: ' + e.message); }
    }

    _csvText(csv) {
        if (!csv || !csv.headers) return '';
        return csv.headers.join(',') + '\n' +
               (csv.rows || []).map(r => r.join(',')).join('\n');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _refreshAllTabs() {
        if (window.BoardEditor)       window.BoardEditor.refresh();
        if (window.ScriptingEditor)   window.ScriptingEditor.refresh();
        if (window.GameStateEditor)   window.GameStateEditor.refresh();
        if (window.CollectionsEditor) window.CollectionsEditor.refresh();
    }
}

window.editor = new Editor();
