/**
 * Generic utility functions for Tabletop Lab
 * Includes: markdown conversion, fuzzy matching, UI helpers
 */

/**
 * Convert markdown to HTML
 * Supports: headings, bold, italic, lists, code blocks, blockquotes, paragraphs
 */
function markdownToHtml(src) {
    var h = '';

    function escape(t) {
        return new Option(t).innerHTML;
    }

    function inlineEscape(s) {
        return escape(s)
            .replace(/!\[([^\]]*)]\(([^(]+)\)/g, '<img alt="$1" src="$2">')
            .replace(/\[([^\]]+)]\(([^(]+?)\)/g, '$1'.link('$2'))
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/(\*\*|__)(?=\S)([^\r]*?\S[*_]*)\1/g, '<strong>$2</strong>')
            .replace(/(\*|_)(?=\S)([^\r]*?\S)\1/g, '<em>$2</em>');
    }

    src
        .replace(/^\s+|\r|\s+$/g, '')
        .replace(/\t/g, '    ')
        .split(/\n\n+/)
        .forEach(function(b, f, R) {
            f = b[0];
            R = {
                '*': [/\n\* /, '<ul><li>', '</li></ul>'],
                '-': [/\n- /, '<ul><li>', '</li></ul>'],
                '1': [/\n[1-9]\d*\.? /, '<ol><li>', '</li></ol>'],
                ' ': [/\n    /, '<pre><code>', '</code></pre>', '\n'],
                '>': [/\n> /, '<blockquote>', '</blockquote>', '\n']
            }[f];
            h +=
                R ? R[1] + ('\n' + b)
                    .split(R[0])
                    .slice(1)
                    .map(R[3] ? escape : inlineEscape)
                    .join(R[3] || '</li><li>') + R[2] :
                    f == '#' ? '<h' + (f = b.indexOf(' ')) + '>' + inlineEscape(b.slice(f + 1)) + '</h' + f + '>' :
                        f == '<' ? b :
                            '<p>' + inlineEscape(b) + '</p>';
        });
    return h;
}

/**
 * Fuzzy match search
 * Returns true if all characters of searchTerm appear in text in order
 */
function fuzzyMatch(searchTerm, text) {
    const term = searchTerm.toLowerCase();
    const lower = text.toLowerCase();
    let searchPos = 0;
    let resultPos = 0;

    for (; resultPos < lower.length; resultPos++) {
        if (lower[resultPos] === term[searchPos]) {
            searchPos++;
        }
        if (searchPos === term.length) {
            return true;
        }
    }
    return false;
}

/**
 * Show error message in element with id 'error'
 */
function showError(message) {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }
}

/**
 * Clear error message from element with id 'error'
 */
function clearError() {
    const errorEl = document.getElementById('error');
    if (errorEl) {
        errorEl.classList.remove('show');
    }
}

/**
 * Show loading message in element with id 'gamesList'
 */
function showLoading() {
    const gamesList = document.getElementById('gamesList');
    if (gamesList) {
        gamesList.innerHTML = '<div class="loading">Loading games...</div>';
    }
}

