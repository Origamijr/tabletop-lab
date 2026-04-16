/**
 * Generate navigation bar HTML with absolute paths from root
 * @param {string} activePage - The text content of the active nav link (e.g., 'Play', 'About', 'Create', 'Docs')
 * @returns {string} HTML for the navbar
 */
function createNavbar(activePage) {
    const navItems = [
        { text: 'Play', href: '/index.html' },
        { text: 'About', href: '/docs/about.html' },
        { text: 'Create', href: '/tabletoplab/editor/editor.html' },
        { text: 'Docs', href: '/docs/docs.html' }
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
                <a href="/index.html" class="nav-brand"><h1>Tabletop Lab</h1></a>
                <ul class="nav-menu">
                    ${navLinks}
                </ul>
            </div>
        </nav>`;
}
