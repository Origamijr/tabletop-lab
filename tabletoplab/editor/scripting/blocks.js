/**
 * scripting/blocks.js
 * Block class hierarchy for the visual scripting editor.
 *
 * Each block definition object has:
 *   id       : unique string
 *   category : 'root' | 'expression' | 'statement' | 'framework'
 *   label    : display name
 *   color    : background color string
 *   params   : array of { name, type, placeholder?, choices?, optional? }
 *              type: 'expr' (wire slot) | 'text' (free input) | 'choice' (dropdown)
 *   returns  : boolean — does this block produce a wirable value?
 *   hasBody  : boolean — does this block contain child statements (if/for)?
 *   toLua(args[]) : function returning the Lua line(s) for this block
 *
 * To add a new block: call Blocks.register({ ...def })
 * No switch/if-else needed — the registry handles dispatch.
 */

class BlockRegistry {
    constructor() { this._map = {}; }
    register(def)   { this._map[def.id] = Object.freeze(def); return this; }
    get(id)         { return this._map[id]; }
    all()           { return Object.values(this._map); }
    byCategory(cat) { return this.all().filter(b => b.category === cat); }
    categories()    { return [...new Set(this.all().map(b => b.category))]; }
}

window.Blocks = new BlockRegistry();
const R = window.Blocks;

// ═══ ROOT — script entry points ═══════════════════════════════════════════

R.register({
    id: 'root_on_enter', category: 'root', label: 'on_enter', color: '#047e7e',
    params: [{ name: 'state', type: 'text', placeholder: 'state name' }],
    returns: false,
    toLua: (a) => `-- on_enter: ${a[0] || '?'}`
});

R.register({
    id: 'root_action', category: 'root', label: 'action', color: '#047e7e',
    params: [{ name: 'name', type: 'text', placeholder: 'action name' }],
    returns: false,
    toLua: (a) => `-- action: ${a[0] || '?'}`
});

R.register({
    id: 'root_function', category: 'root', label: 'function', color: '#047e7e',
    params: [
        { name: 'name',   type: 'text', placeholder: 'function name' },
        { name: 'params', type: 'text', placeholder: 'param1, param2 ...', optional: true }
    ],
    returns: false,
    toLua: (a) => `function ${a[0] || 'unnamed'}(${a[1] || ''})`
});

R.register({
    id: 'root_per_object', category: 'root', label: 'per-object script', color: '#047e7e',
    params: [{ name: 'name', type: 'text', placeholder: 'script name' }],
    returns: false,
    toLua: (a) => `-- per-object: ${a[0] || '?'}`
});

// ═══ EXPRESSIONS — produce values (returns=true) ═══════════════════════════

R.register({
    id: 'expr_literal', category: 'expression', label: 'value', color: '#1a4a1a',
    params: [{ name: 'val', type: 'text', placeholder: '42 / "text" / true' }],
    returns: true,
    toLua: (a) => a[0] || 'nil'
});

R.register({
    id: 'expr_var', category: 'expression', label: 'variable', color: '#1a4a1a',
    params: [{ name: 'name', type: 'text', placeholder: 'var name' }],
    returns: true,
    toLua: (a) => a[0] || 'nil'
});

R.register({
    id: 'expr_math', category: 'expression', label: 'math', color: '#1a4a1a',
    params: [
        { name: 'a',  type: 'expr' },
        { name: 'op', type: 'choice', choices: ['+', '-', '*', '/', '%', '^'] },
        { name: 'b',  type: 'expr' }
    ],
    returns: true,
    toLua: (a) => `(${a[0]||'0'} ${a[1]||'+'} ${a[2]||'0'})`
});

R.register({
    id: 'expr_compare', category: 'expression', label: 'compare', color: '#1a4a1a',
    params: [
        { name: 'a',  type: 'expr' },
        { name: 'op', type: 'choice', choices: ['==', '~=', '<', '>', '<=', '>='] },
        { name: 'b',  type: 'expr' }
    ],
    returns: true,
    toLua: (a) => `(${a[0]||'nil'} ${a[1]||'=='} ${a[2]||'nil'})`
});

R.register({
    id: 'expr_bool_op', category: 'expression', label: 'bool op', color: '#1a4a1a',
    params: [
        { name: 'a',  type: 'expr' },
        { name: 'op', type: 'choice', choices: ['and', 'or'] },
        { name: 'b',  type: 'expr' }
    ],
    returns: true,
    toLua: (a) => `(${a[0]||'false'} ${a[1]||'and'} ${a[2]||'false'})`
});

R.register({
    id: 'expr_not', category: 'expression', label: 'not', color: '#1a4a1a',
    params: [{ name: 'val', type: 'expr' }],
    returns: true,
    toLua: (a) => `(not ${a[0]||'false'})`
});

R.register({
    id: 'expr_table_get', category: 'expression', label: 'table[key]', color: '#1a4a1a',
    params: [
        { name: 'table', type: 'expr' },
        { name: 'key',   type: 'expr' }
    ],
    returns: true,
    toLua: (a) => `${a[0]||'t'}[${a[1]||'k'}]`
});

R.register({
    id: 'expr_table_len', category: 'expression', label: '#table', color: '#1a4a1a',
    params: [{ name: 'table', type: 'expr' }],
    returns: true,
    toLua: (a) => `#${a[0]||'t'}`
});

R.register({
    id: 'expr_zone_ref', category: 'expression', label: 'zone ref', color: '#1a4a1a',
    params: [
        { name: 'zone',  type: 'text', placeholder: 'deck' },
        { name: 'index', type: 'expr', optional: true }
    ],
    returns: true,
    toLua: (a) => `zones.${a[0]||'zone'}${a[1] ? `[${a[1]}]` : ''}`
});

R.register({
    id: 'expr_signaled', category: 'expression', label: 'signaled', color: '#1a4a1a',
    params: [{ name: 'signal', type: 'text', placeholder: 'signal name' }],
    returns: true,
    toLua: (a) => `signaled('${a[0]||''}')`
});

// ═══ STATEMENTS — imperative (returns=false) ═══════════════════════════════

R.register({
    id: 'stmt_assign', category: 'statement', label: 'set', color: '#2a1a4a',
    params: [
        { name: 'name', type: 'text', placeholder: 'var' },
        { name: 'val',  type: 'expr' }
    ],
    returns: false,
    toLua: (a) => `${a[0]||'var'} = ${a[1]||'nil'}`
});

R.register({
    id: 'stmt_table_set', category: 'statement', label: 'table set', color: '#2a1a4a',
    params: [
        { name: 'table', type: 'expr' },
        { name: 'key',   type: 'expr' },
        { name: 'val',   type: 'expr' }
    ],
    returns: false,
    toLua: (a) => `${a[0]||'t'}[${a[1]||'k'}] = ${a[2]||'nil'}`
});

R.register({
    id: 'stmt_return', category: 'statement', label: 'return', color: '#4a1a1a',
    params: [{ name: 'val', type: 'expr', optional: true }],
    returns: false,
    toLua: (a) => a[0] ? `return ${a[0]}` : 'return'
});

R.register({
    id: 'stmt_if', category: 'statement', label: 'if', color: '#3a3a1a',
    params: [{ name: 'condition', type: 'expr' }],
    returns: false, hasBody: true,
    toLua: (a) => `if ${a[0]||'false'} then`
});

R.register({
    id: 'stmt_else', category: 'statement', label: 'else', color: '#3a3a1a',
    params: [],
    returns: false, hasBody: true,
    toLua: () => 'else'
});

R.register({
    id: 'stmt_for_num', category: 'statement', label: 'for i=start,limit', color: '#3a3a1a',
    params: [
        { name: 'var',   type: 'text', placeholder: 'i' },
        { name: 'start', type: 'expr' },
        { name: 'limit', type: 'expr' },
        { name: 'step',  type: 'expr', optional: true }
    ],
    returns: false, hasBody: true,
    toLua: (a) => `for ${a[0]||'i'} = ${a[1]||'1'}, ${a[2]||'10'}${a[3]?`, ${a[3]}`:''} do`
});

R.register({
    id: 'stmt_for_each', category: 'statement', label: 'for each in', color: '#3a3a1a',
    params: [
        { name: 'var',   type: 'text', placeholder: 'v' },
        { name: 'table', type: 'expr' }
    ],
    returns: false, hasBody: true,
    toLua: (a) => `for _, ${a[0]||'v'} in ipairs(${a[1]||'t'}) do`
});

R.register({
    id: 'stmt_call', category: 'statement', label: 'call', color: '#2a1a4a',
    params: [
        { name: 'fn',   type: 'text', placeholder: 'function name' },
        { name: 'args', type: 'text', placeholder: 'arg1, arg2 ...', optional: true }
    ],
    returns: false,
    toLua: (a) => `${a[0]||'fn'}(${a[1]||''})`
});

// ═══ FRAMEWORK — engine API blocks ════════════════════════════════════════

R.register({
    id: 'fw_deal', category: 'framework', label: 'deal', color: '#004a4a',
    params: [
        { name: 'from', type: 'expr' },
        { name: 'to',   type: 'expr' },
        { name: 'n',    type: 'expr' }
    ],
    returns: false,
    toLua: (a) => `${a[0]||'zones.deck'}:deal(${a[1]||'zones.hand'}, ${a[2]||'1'})`
});

R.register({
    id: 'fw_shuffle', category: 'framework', label: 'shuffle', color: '#004a4a',
    params: [{ name: 'zone', type: 'expr' }],
    returns: false,
    toLua: (a) => `${a[0]||'zones.deck'}:shuffle()`
});

R.register({
    id: 'fw_send_to', category: 'framework', label: 'send to', color: '#004a4a',
    params: [
        { name: 'obj',  type: 'expr' },
        { name: 'dest', type: 'expr' }
    ],
    returns: false,
    toLua: (a) => `${a[0]||'obj'}:send_to(${a[1]||'zones.deck'})`
});

R.register({
    id: 'fw_signal', category: 'framework', label: 'signal (return)', color: '#004a4a',
    params: [{ name: 'name', type: 'text', placeholder: 'signal name' }],
    returns: true,
    toLua: (a) => `return '${a[0]||'sig'}'`
});

R.register({
    id: 'fw_load_collection', category: 'framework', label: 'load collection', color: '#004a4a',
    params: [
        { name: 'zone',       type: 'expr' },
        { name: 'collection', type: 'text', placeholder: 'collection name' },
        { name: 'type',       type: 'text', placeholder: 'Card' },
        { name: 'filter',     type: 'text', placeholder: '{}', optional: true }
    ],
    returns: false,
    toLua: (a) =>
        `load_collection(${a[0]||'zone'}, '${a[1]||'coll'}', ${a[2]||'Card'}, ${a[3]||'{}'})`
});

R.register({
    id: 'fw_end_game', category: 'framework', label: 'end game', color: '#4a0000',
    params: [{ name: 'result', type: 'text', placeholder: "{winner: 1}" }],
    returns: false,
    toLua: (a) => `end_game(${a[0]||'{}'})`
});
