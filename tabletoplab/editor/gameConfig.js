/**
 * gameConfig.js
 * ─────────────────────────────────────────────────────────────
 * Shared data structure for game configuration.
 * Referenced by: Board, Game State, Scripting, Collections tabs
 * 
 * This is the source of truth for all game data that gets
 * imported/exported to game.json. All tabs read/write through
 * this module to ensure consistency.
 * ─────────────────────────────────────────────────────────────
 */

class GameConfig {
    constructor() {
        this.data = {
            gamename: '',
            players: 2,
            zones: {},           // Board tab: { zoneName: { quantity, visibility, display_mode } }
            gamestates: {},      // Game State tab: { stateName: { transitions: [], ... } }
            actions: {},         // Game State tab: { actionName: { triggers: [], effects: [], ... } }
            variables: {},       // Global game variables
            init: [],            // Initialization script
            collections: {},     // Collections tab: { collName: { csv, renderScript } }
            scripting: {}        // Scripting tab: { scriptName: luaCode }
        };
    }

    /**
     * Load game data from gameData object (from editor.js)
     */
    load(gameData) {
        this.data = { ...gameData };
    }

    /**
     * Export game data back to gameData object
     */
    export() {
        return { ...this.data };
    }

    /**
     * Get all zones (Board tab)
     */
    getZones() {
        return this.data.zones;
    }

    /**
     * Get all game states (Game State tab)
     */
    getGameStates() {
        return this.data.gamestates;
    }

    /**
     * Get all actions (Game State tab)
     */
    getActions() {
        return this.data.actions;
    }

    /**
     * Get all variables (referenced by all tabs)
     */
    getVariables() {
        return this.data.variables;
    }

    /**
     * Add/update a zone (Board tab)
     */
    setZone(name, config) {
        this.data.zones[name] = config;
    }

    /**
     * Delete a zone (Board tab)
     */
    deleteZone(name) {
        delete this.data.zones[name];
    }

    /**
     * Add/update a game state (Game State tab)
     */
    setGameState(name, config) {
        this.data.gamestates[name] = config;
    }

    /**
     * Delete a game state (Game State tab)
     */
    deleteGameState(name) {
        delete this.data.gamestates[name];
    }

    /**
     * Add/update an action (Game State tab)
     */
    setAction(name, config) {
        this.data.actions[name] = config;
    }

    /**
     * Delete an action (Game State tab)
     */
    deleteAction(name) {
        delete this.data.actions[name];
    }

    /**
     * Add/update a variable (any tab)
     */
    setVariable(name, value) {
        this.data.variables[name] = value;
    }

    /**
     * Delete a variable (any tab)
     */
    deleteVariable(name) {
        delete this.data.variables[name];
    }

    /**
     * Add/update a script (Scripting tab)
     */
    setScript(name, luaCode) {
        this.data.scripting[name] = luaCode;
    }

    /**
     * Get a script (Scripting tab)
     */
    getScript(name) {
        return this.data.scripting[name] || '';
    }

    /**
     * Get all scripts (Scripting tab)
     */
    getScripts() {
        return this.data.scripting;
    }

    /**
     * Set game metadata (any tab)
     */
    setMetadata(gamename, players) {
        this.data.gamename = gamename;
        this.data.players = players;
    }

    /**
     * Get game metadata
     */
    getMetadata() {
        return {
            gamename: this.data.gamename,
            players: this.data.players
        };
    }
}

// Global instance
window.gameConfig = new GameConfig();
