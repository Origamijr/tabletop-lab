// Main editor controller

class Editor {
    constructor() {
        this.gameData = {
            gamename: '',
            players: 2,
            zones: {},
            variables: {},
            init: [],
            gamestates: {},
            actions: {},
            collections: {}
        };

        this.currentTab = 'board';
        this.initEventListeners();
        this.loadFromLocalStorage();
        this.initBoard();
    }

    initEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Import/Export
        document.getElementById('btn-import').addEventListener('click', () => this.importGame());
        document.getElementById('btn-export').addEventListener('click', () => this.exportGameZip());
    }

    switchTab(tabName) {
        this.currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.dataset.tab === tabName);
        });

        // Initialize tab-specific content if needed
        if (tabName === 'board' && window.UIEditor) {
            window.UIEditor.init(this.gameData);
        }

        if (tabName === 'gamestate') {
            // Game State tab - placeholder for now
            const pane = document.getElementById('pane-gamestate');
            if (pane) {
                pane.innerHTML = `
                    <div class="editor-placeholder">
                        <h2>Game State Editor</h2>
                        <p>Configure states, transitions, and actions</p>
                    </div>
                `;
            }
        }

        if (tabName === 'collections' && window.CollectionsEditor) {
            const collectionsPane = document.getElementById('pane-collections');
            if (collectionsPane && collectionsPane.innerHTML === '') {
                fetch('collections/collections.html')
                    .then(response => response.text())
                    .then(html => {
                        collectionsPane.innerHTML = html;
                        window.CollectionsEditor.init(this.gameData);
                    })
                    .catch(err => console.error('Error loading collections editor:', err));
            } else {
                window.CollectionsEditor.init(this.gameData);
            }
        }
    }

    initBoard() {
        // Load Board editor module
        const boardPane = document.getElementById('pane-board');
        if (boardPane) {
            fetch('ui/ui.html')
                .then(response => response.text())
                .then(html => {
                    boardPane.innerHTML = html;
                    // Initialize Board editor when HTML is loaded
                    if (window.UIEditor) {
                        window.UIEditor.init(this.gameData);
                    }
                })
                .catch(err => console.error('Error loading Board editor:', err));
        }
    }

    async exportGameZip() {
        if (!JSZip) {
            alert('Zip library not loaded. Please refresh the page.');
            return;
        }

        const zip = new JSZip();
        const gameName = this.gameData.gamename.replace(/\s+/g, '_') || 'game';
        
        // Add game.json to root
        const gameJSON = JSON.stringify(this.gameData, null, 2);
        zip.file('game.json', gameJSON);
        
        // Add each collection's CSV file
        for (const [collName, collData] of Object.entries(this.gameData.collections || {})) {
            const csv = this.generateCSV(collData.csv);
            zip.file(`${collName}.csv`, csv);
        }
        
        // Generate zip and download
        try {
            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${gameName}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            alert('Game exported as ZIP');
        } catch (err) {
            alert('Error creating ZIP: ' + err.message);
        }
    }

    generateCSV(csvData) {
        if (!csvData || !csvData.headers) return '';
        let csv = csvData.headers.join(',') + '\n';
        if (csvData.rows) {
            csv += csvData.rows.map(row => row.join(',')).join('\n');
        }
        return csv;
    }

    exportGame() {
        if (window.UIEditor && window.UIEditor.generateUIHTML) {
            const uiHTML = window.UIEditor.generateUIHTML(this.gameData);
            const gameJSON = JSON.stringify(this.gameData, null, 2);

            const uiBlob = new Blob([uiHTML], { type: 'text/html' });
            const jsonBlob = new Blob([gameJSON], { type: 'application/json' });

            const downloadFile = (blob, filename) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            };

            downloadFile(uiBlob, `${this.gameData.gamename.replace(/\s+/g, '_')}_ui.html`);
            downloadFile(jsonBlob, `${this.gameData.gamename.replace(/\s+/g, '_')}_game.json`);

            alert('Exported UI HTML and game.json');
        }
    }

    importGame() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.csv,.zip';
        input.multiple = true;
        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;

            // Check if it's a zip file
            const zipFile = files.find(f => f.name.endsWith('.zip'));
            if (zipFile) {
                this.importZip(zipFile);
            } else {
                this.importMultipleFiles(files);
            }
        });
        input.click();
    }

    async importZip(zipFile) {
        try {
            if (!JSZip) {
                alert('Zip library not loaded. Please refresh the page.');
                return;
            }
            
            const zip = new JSZip();
            const zipContents = await zip.loadAsync(zipFile);
            
            // Load game.json
            if (zipContents.file('game.json')) {
                const gameJsonText = await zipContents.file('game.json').async('text');
                const gameData = JSON.parse(gameJsonText);
                
                // Load CSV files into collections
                for (const [path, file] of Object.entries(zipContents.files)) {
                    if (!file.dir && path.endsWith('.csv') && path !== 'game.json') {
                        const csvText = await file.async('text');
                        const collName = path.replace('.csv', '');
                        CollectionsEditorModule.importCSVData(gameData, collName, csvText);
                    }
                }
                
                this.gameData = gameData;
                this.saveToLocalStorage();
                this.initUI();
                if (window.UIEditor) {
                    window.UIEditor.init(this.gameData);
                }
                if (window.CollectionsEditor) {
                    window.CollectionsEditor.init(this.gameData);
                }
                alert('Game imported from ZIP successfully');
            }
        } catch (err) {
            alert('Error importing ZIP: ' + err.message);
        }
    }

    importMultipleFiles(files) {
        const gameJsonFile = files.find(f => f.name === 'game.json');
        if (!gameJsonFile) {
            alert('Please include game.json in your import');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                this.gameData = JSON.parse(event.target.result);
                
                // Process CSV files
                files.forEach(file => {
                    if (file.name.endsWith('.csv') && file.name !== 'game.json') {
                        const csvReader = new FileReader();
                        csvReader.onload = (e) => {
                            const collName = file.name.replace('.csv', '');
                            CollectionsEditorModule.importCSVData(this.gameData, collName, e.target.result);
                        };
                        csvReader.readAsText(file);
                    }
                });

                this.saveToLocalStorage();
                this.initUI();
                if (window.UIEditor) {
                    window.UIEditor.init(this.gameData);
                }
                alert('Game imported successfully');
            } catch (err) {
                alert('Error parsing game.json: ' + err.message);
            }
        };
        reader.readAsText(gameJsonFile);
    }

    saveToLocalStorage() {
        localStorage.setItem('gameEditorData', JSON.stringify(this.gameData));
    }

    loadFromLocalStorage() {
        const saved = localStorage.getItem('gameEditorData');
        if (saved) {
            try {
                this.gameData = JSON.parse(saved);
            } catch (err) {
                console.error('Error loading saved game data:', err);
            }
        }
    }

    updateGameData(updates) {
        this.gameData = { ...this.gameData, ...updates };
        this.saveToLocalStorage();
    }
}

// Initialize editor
window.editor = new Editor();
