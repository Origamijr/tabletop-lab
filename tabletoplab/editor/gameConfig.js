/**
 * gameConfig.js
 * Central data store. All tabs read/write through this.
 * game.json  — gameplay logic (zones, states, actions, variables, init, collections csv)
 * ui.json    — layout/meta (gridSize, zone placements, collection layouts, gamename, rules)
 */

class GameConfig {
    constructor() {
        // ── game.json fields ──
        this.game = {
            players: 2,
            zones: {},       // { name: { quantity, visibility, display_mode } }
            variables: {},   // { name: value }
            init: [],        // lua lines
            gamestates: {},  // { name: { initial?, on_enter[], transitions[] } }
            actions: {},     // { name: { condition[], targets[], execution[] } }
            collections: {}  // { name: { csv: { headers[], rows[][] } } }
        };

        // ── ui.json fields ──
        this.ui = {
            gamename: '',
            description: '',
            rules: '',
            gridSize: { w: 63, h: 88 }, // default: poker card size in px at 96dpi
            layout: {},          // { zoneName: { x,y,w,h, indexing:'absolute'|'relative', instances:[{x,y}] } }
            collectionLayouts: {} // { collName: { gridW, gridH, elements:[{x,y,w,h,source,type}] } }
        };
    }

    // ── Serialisation ──

    exportGame() {
        return JSON.parse(JSON.stringify(this.game));
    }

    exportUI() {
        return JSON.parse(JSON.stringify(this.ui));
    }

    importGame(data) {
        this.game = Object.assign({
            players: 2, zones: {}, variables: {}, init: [],
            gamestates: {}, actions: {}, collections: {}
        }, data);
    }

    importUI(data) {
        this.ui = Object.assign({
            gamename: '', description: '', rules: '',
            gridSize: { w: 63, h: 88 },
            layout: {}, collectionLayouts: {}
        }, data);
    }

    // ── game.json helpers ──

    getZones()      { return this.game.zones; }
    getZone(n)      { return this.game.zones[n]; }
    setZone(n, cfg) { this.game.zones[n] = cfg; }
    deleteZone(n)   { delete this.game.zones[n]; }

    getGameStates()       { return this.game.gamestates; }
    setGameState(n, cfg)  { this.game.gamestates[n] = cfg; }
    deleteGameState(n)    { delete this.game.gamestates[n]; }

    getActions()       { return this.game.actions; }
    setAction(n, cfg)  { this.game.actions[n] = cfg; }
    deleteAction(n)    { delete this.game.actions[n]; }

    getVariables()      { return this.game.variables; }
    setVariable(n, v)   { this.game.variables[n] = v; }
    deleteVariable(n)   { delete this.game.variables[n]; }

    getCollections()         { return this.game.collections; }
    getCollection(n)         { return this.game.collections[n]; }
    setCollection(n, data)   { this.game.collections[n] = data; }
    deleteCollection(n)      { delete this.game.collections[n]; }

    // ── ui.json helpers ──

    getGridSize()      { return this.ui.gridSize; }
    setGridSize(w, h)  { this.ui.gridSize = { w, h }; }

    getLayout()           { return this.ui.layout; }
    getZoneLayout(n)      { return this.ui.layout[n]; }
    setZoneLayout(n, cfg) { this.ui.layout[n] = cfg; }
    deleteZoneLayout(n)   { delete this.ui.layout[n]; }

    getCollectionLayout(n)      { return this.ui.collectionLayouts[n]; }
    setCollectionLayout(n, cfg) { this.ui.collectionLayouts[n] = cfg; }
    deleteCollectionLayout(n)   { delete this.ui.collectionLayouts[n]; }

    getMeta()              { return { gamename: this.ui.gamename, description: this.ui.description, rules: this.ui.rules }; }
    setMeta(name, desc, rules) {
        this.ui.gamename = name;
        this.ui.description = desc;
        this.ui.rules = rules;
    }

    getMetadata() {
        return {
            name: this.ui.gamename,
            description: this.ui.description,
            rules: this.ui.rules,
            players: this.game.players
        };
    }

    setMetadata(data) {
        if (data.name !== undefined) this.ui.gamename = data.name;
        if (data.description !== undefined) this.ui.description = data.description;
        if (data.rules !== undefined) this.ui.rules = data.rules;
        if (data.players !== undefined) this.game.players = data.players;
    }
}

window.gameConfig = new GameConfig();
