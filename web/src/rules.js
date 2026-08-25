/**
 * The rules page has no 3D and no game state, so all it needs is the theme
 * toggle — the same one the other two pages carry, minus the part that pushes
 * the palette into a scene.
 */

const THEME_KEY = 'chetactoe-theme';

document.getElementById( 'theme' ).addEventListener( 'click', () => {

	const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';

	document.documentElement.dataset.theme = next;
	try { localStorage.setItem( THEME_KEY, next ); } catch { /* private mode */ }

} );
