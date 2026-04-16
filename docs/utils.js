/**
 * Parse frontmatter from markdown.
 * Frontmatter is YAML between --- delimiters at the start of the file.
 * Returns { frontmatter: object, content: string }
 */
function parseFrontmatter(src) {
    // Normalize line endings
    src = src.replace(/\r\n/g, '\n');

    if (!src.startsWith('---\n')) {
        return { frontmatter: {}, content: src };
    }

    // Match closing --- on its own line (with or without trailing newline)
    const rest = src.slice(4); // skip opening '---\n'
    const closeMatch = rest.match(/^---\s*$/m);
    if (!closeMatch) {
        return { frontmatter: {}, content: src };
    }

    const frontmatterStr = rest.slice(0, closeMatch.index);
    // Content starts after the closing --- line
    const afterClose = rest.slice(closeMatch.index + closeMatch[0].length);
    // Strip exactly one leading newline so the content doesn't start with a blank line
    const content = afterClose.replace(/^\n/, '');

    const frontmatter = {};
    frontmatterStr.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            // Handle quoted strings
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                frontmatter[key] = value.slice(1, -1);
            // Handle arrays (comma-separated values)
            } else if (value.includes(',')) {
                frontmatter[key] = value.split(',').map(v => v.trim());
            } else {
                frontmatter[key] = value;
            }
        }
    });

    return { frontmatter, content };
}

/**
 * Convert markdown to HTML.
 * Supports: headings, bold, italic, links, images, inline code,
 *           fenced code blocks, indented code blocks, blockquotes,
 *           ordered/unordered lists, paragraphs, raw HTML.
 * Also parses and returns frontmatter metadata.
 * Returns { html: string, frontmatter: object }
 */
function markdownToHtml(src) {
    const { frontmatter, content } = parseFrontmatter(src);

    // Escape HTML special characters to prevent injection / mis-parsing
    function escape(t) {
        return t
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Apply inline markdown (links, images, code, bold, italic) after escaping
    function inlineEscape(s) {
        return escape(s)
            .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
            .replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/_([^_]+)_/g, '<em>$1</em>');
    }

    let h = '';

    // Pre-process: extract fenced code blocks and raw HTML tags
    // Replace them with placeholders to protect their contents
    const fencedBlocks = [];
    const htmlBlocks = [];
    
    let withPlaceholders = content
        .replace(/\r\n/g, '\n')
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            const i = fencedBlocks.length;
            const cls = lang ? ` class="language-${escape(lang)}"` : '';
            fencedBlocks.push(`<pre><code${cls}>${escape(code.replace(/\n$/, ''))}</code></pre>`);
            return `\x00FENCED${i}\x00`;
        });
    
    // Extract raw HTML tags (self-closing or with content)
    withPlaceholders = withPlaceholders.replace(/<[^>]+(?:\/?>|>[\s\S]*?<\/[^>]+>)/g, (html) => {
        const i = htmlBlocks.length;
        htmlBlocks.push(html);
        return `\x00HTML${i}\x00`;
    });

    withPlaceholders
        .replace(/^\s+|\r|\s+$/g, '')
        .replace(/\t/g, '    ')
        .split(/\n\n+/)
        .forEach(function(b) {
            // Restore fenced code block placeholders
            if (/^\x00FENCED\d+\x00$/.test(b.trim())) {
                const i = parseInt(b.trim().match(/\x00FENCED(\d+)\x00/)[1], 10);
                h += fencedBlocks[i];
                return;
            }

            const f = b[0];

            // Indented code block (4 spaces)
            if (/^    /m.test(b) && b.split('\n').every(l => l === '' || l.startsWith('    '))) {
                h += '<pre><code>' + escape(b.replace(/^    /gm, '')) + '</code></pre>';
                return;
            }

            // Blockquote
            if (f === '>' && b.split('\n').every(l => l.startsWith('> ') || l === '>')) {
                const inner = b.replace(/^> ?/gm, '');
                h += '<blockquote>' + inlineEscape(inner) + '</blockquote>';
                return;
            }

            // Unordered list (* or -)
            if ((f === '*' || f === '-') && new RegExp('^\\' + f + ' ', 'm').test(b)) {
                const items = b.split(new RegExp('^\\' + f + ' ', 'm')).filter(Boolean);
                h += '<ul><li>' + items.map(i => inlineEscape(i.trim())).join('</li><li>') + '</li></ul>';
                return;
            }

            // Ordered list
            if (/^\d+\.? /.test(b)) {
                const items = b.split(/^\d+\.? /m).filter(Boolean);
                h += '<ol><li>' + items.map(i => inlineEscape(i.trim())).join('</li><li>') + '</li></ol>';
                return;
            }

            // Headings
            if (f === '#') {
                const level = b.match(/^#+/)[0].length;
                const text = b.slice(level).trim();
                h += `<h${level}>${inlineEscape(text)}</h${level}>`;
                return;
            }

            // Raw HTML passthrough (block-level)
            if (f === '\x00' && /^\x00HTML\d+\x00$/.test(b.trim())) {
                const i = parseInt(b.trim().match(/\x00HTML(\d+)\x00/)[1], 10);
                h += htmlBlocks[i];
                return;
            }

            // Paragraph - restore HTML placeholders without escaping them
            let para = inlineEscape(b.replace(/\n/g, ' '));
            // Restore HTML placeholders in paragraph
            para = para.replace(/\x00HTML(\d+)\x00/g, (_, i) => htmlBlocks[parseInt(i, 10)]);
            h += '<p>' + para + '</p>';
        });
    
    // Final restoration of any remaining HTML placeholders
    h = h.replace(/\x00HTML(\d+)\x00/g, (_, i) => htmlBlocks[parseInt(i, 10)]);

    return { html: h, frontmatter };
}

/**
 * Load markdown from a file, convert to HTML, and inject into a DOM element.
 * The parsed frontmatter is returned so callers can use it as metadata.
 * Returns { frontmatter } after updating the DOM.
 */
async function loadMarkdown(mdPath, elementId) {
    try {
        const response = await fetch(mdPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const markdown = await response.text();
        const { html, frontmatter } = markdownToHtml(markdown);
        document.getElementById(elementId).innerHTML = html;
        return { frontmatter };
    } catch (error) {
        document.getElementById(elementId).innerHTML = '<p class="error">Error loading content.</p>';
        return { frontmatter: {} };
    }
}

/**
 * Fuzzy match search.
 * Returns true if all characters of searchTerm appear in text in order.
 */
function fuzzyMatch(searchTerm, text) {
    const term = searchTerm.toLowerCase();
    const lower = text.toLowerCase();
    let searchPos = 0;

    for (let i = 0; i < lower.length; i++) {
        if (lower[i] === term[searchPos]) searchPos++;
        if (searchPos === term.length) return true;
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

