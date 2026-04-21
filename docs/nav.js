/**
 * Generate navigation bar HTML with relative paths based on current page location
 * @param {string} activePage - The text content of the active nav link (e.g., 'Play', 'About', 'Create', 'Docs')
 * @returns {string} HTML for the navbar
 */
function createNavbar(activePage) {
    // Detect current page location
    const path = window.location.pathname;
    
    // Determine if we're in docs folder or root
    const inDocs = path.includes('/docs/');
    
    // Define nav items with relative paths based on location
    const navItems = [
        { text: 'Play', href: inDocs ? '../index.html' : 'index.html' },
        { text: 'About', href: inDocs ? 'about.html' : 'docs/about.html' },
        { text: 'Create', href: inDocs ? '../tabletoplab/editor/editor.html' : 'tabletoplab/editor/editor.html' },
        { text: 'Docs', href: inDocs ? 'docs.html' : 'docs/docs.html' }
    ];

    const navLinks = navItems
        .map(item => {
            const activeClass = item.text === activePage ? ' active' : '';
            return `<li><a href="${item.href}" class="nav-link${activeClass}">${item.text}</a></li>`;
        })
        .join('');

    return `
        <nav class="navbar">
            <div class="nav-container">
                <a href="${inDocs ? '../index.html' : 'index.html'}" class="nav-brand"><h1>Tabletop Lab</h1></a>
                <ul class="nav-menu">
                    ${navLinks}
                </ul>
            </div>
        </nav>`;
}
