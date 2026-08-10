import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';

import { createStage } from './stage.js';
import { buildBoard, BOARD, HEIGHTS } from './scene.js';

const THEME_KEY = 'chetactoe-theme';

const BACKDROP = { light: 0xf2ede5, dark: 0x1c1a16 };
const GROUND = { light: 0xf2ede5, dark: 0x23201b };

/**
 * The opening tableau. Not a position from a game — a still life, spread across the
 * board so the two tones read against each other and no piece hides another at the
 * page's camera angle.
 */
const LAYOUT = [
	{ type: 'pawn', tone: 'dark', square: 'B4' },
	{ type: 'rook', tone: 'light', square: 'D4' },
	{ type: 'knight', tone: 'dark', square: 'A3', turn: 0.5 },
	{ type: 'pawn', tone: 'light', square: 'C2' },
	{ type: 'bishop', tone: 'light', square: 'D1' },
	{ type: 'pawn', tone: 'dark', square: 'B1' },
];

/** Resting camera. The mouse moves it a few degrees either side of this. */
const VIEW = { fov: 20, elevation: 47, azimuth: 3, height: - 0.004, pan: 0 };

const SWING = { azimuth: 5, elevation: 3.5 }; // degrees of parallax, each way
const LIFT = 0.0035; // how far a hovered piece rises off the board

// an unrecognised query would just report false forever, so this string matches the
// one in home.css exactly rather than being spaced to the surrounding style
const still = matchMedia( '(prefers-reduced-motion: reduce)' ).matches;

let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/* ------------------------------------------------------------------ the sheet */

/**
 * The four numbered sections and the menu, as content for the one dialog. Written
 * here rather than in the markup so the page ships one panel instead of five.
 */
const SHEETS = {
	board: {
		index: '01',
		title: 'THE BOARD',
		body: `
			<p>Sixteen squares. A solid slab with the grid cut into it — a
			<strong>90&deg; V-groove</strong>, 1.2 mm deep, sanded at the lips so the light
			catches them the way it catches a real cut.</p>
			<p>Four by four is small enough to hold in your head and large enough that
			every square matters. There is no back rank to hide behind and no wing to
			develop into. The whole game is in front of you from the first move.</p>
			<ul>
				<li><span>16</span> squares, 44.7 mm each</li>
				<li><span>200</span> mm across the board</li>
				<li><span>26.5</span> mm of solid stock</li>
			</ul>` ,
	},
	pieces: {
		index: '02',
		title: 'THE PIECES',
		body: `
			<p>Four to a side — <strong>pawn, knight, bishop, rook</strong> — turned from one
			blank and finished in two tones. Each is real geometry, lathed from an authored
			profile, and every piece carries its own grain phase so a set never reads as
			stamped copies.</p>
			<p>Four pieces means four jobs, and on sixteen squares no piece is spare. The
			knight is the only one that leaves the ground; the rook is the only one that can
			cross the board in a move. Losing either changes what you can plan.</p>` ,
	},
	rules: {
		index: '03',
		title: 'THE RULES',
		body: `
			<p>Each turn, do one of two things: <strong>place</strong> a piece from your hand
			onto any empty square, or <strong>move</strong> a piece already on the board the
			way that piece moves in chess.</p>
			<ul>
				<li><span>01</span> Capture and the piece goes back to its owner&rsquo;s hand,
				not off the table.</li>
				<li><span>02</span> Get all four of your pieces in a line — across, down or
				diagonally — and the game is yours.</li>
				<li><span>03</span> Nothing else. No castling, no promotion, no clock.</li>
			</ul>
			<p>The board in the playground moves freely: pick up any piece, drop it on any
			empty square. The rules above are the game&rsquo;s, not yet the
			playground&rsquo;s.</p>` ,
	},
	game: {
		index: '04',
		title: 'THE GAME',
		body: `
			<p>A line of four is four squares away at all times, for both of you. That makes
			every placement a threat and every threat answerable, so the game turns on
			<strong>order</strong> — which piece you commit, and when.</p>
			<p>Play it slowly. The board rewards reading the position over reacting to it,
			and a piece held back is a piece the other player has to keep accounting for.</p>` ,
	},
	menu: {
		index: '',
		title: 'CHETACTOE',
		body: `
			<nav class="sheet-menu">
				<a href="#board" data-sheet="board">BOARD<em>01</em></a>
				<a href="#pieces" data-sheet="pieces">PIECES<em>02</em></a>
				<a href="#rules" data-sheet="rules">RULES<em>03</em></a>
				<a href="#game" data-sheet="game">GAME<em>04</em></a>
				<a href="/play.html">PLAY<em>&rarr;</em></a>
			</nav>` ,
		hidePlay: true,
	},
};

const sheet = document.getElementById( 'sheet' );
let lastFocus = null;

function openSheet( name ) {

	const data = SHEETS[ name ];
	if ( ! data ) return;

	document.getElementById( 'sheet-index' ).textContent = data.index;
	document.getElementById( 'sheet-title' ).textContent = data.title;
	document.getElementById( 'sheet-body' ).innerHTML = data.body;
	document.querySelector( '.sheet-play' ).hidden = data.hidePlay === true;

	lastFocus = document.activeElement;
	sheet.hidden = false;
	document.body.style.overflow = 'hidden';
	document.getElementById( 'sheet-close' ).focus();

}

function closeSheet() {

	if ( sheet.hidden ) return;
	sheet.hidden = true;
	document.body.style.overflow = '';
	lastFocus?.focus?.();

}

// Every trigger is a link with data-sheet, including the ones inside the sheet
// itself, so one listener on the document covers the grid and the menu both.
document.addEventListener( 'click', ( event ) => {

	const trigger = event.target.closest?.( '[data-sheet]' );
	if ( ! trigger ) return;

	event.preventDefault();
	openSheet( trigger.dataset.sheet );

} );

document.getElementById( 'menu' ).addEventListener( 'click', () => openSheet( 'menu' ) );
document.getElementById( 'sheet-close' ).addEventListener( 'click', closeSheet );
sheet.addEventListener( 'click', ( event ) => {

	if ( event.target === sheet ) closeSheet();

} );

document.addEventListener( 'keydown', ( event ) => {

	if ( event.key === 'Escape' ) closeSheet();

} );

/* ---------------------------------------------------------------- the signup */

// No back end to post to, so the form validates and acknowledges and stops there.
const signup = document.getElementById( 'signup' );
const note = document.getElementById( 'signup-note' );

signup.addEventListener( 'submit', ( event ) => {

	event.preventDefault();
	const email = document.getElementById( 'email' );
	const ok = email.checkValidity() && email.value.trim() !== '';

	note.classList.toggle( 'bad', ! ok );
	note.textContent = ok ? 'THANK YOU — WE WILL BE IN TOUCH.' : 'A VALID EMAIL, PLEASE.';
	if ( ok ) email.value = '';

} );

/* ------------------------------------------------------------------ the board */

const host = document.getElementById( 'canvas-host' );

if ( WebGPU.isAvailable() === false ) {

	document.getElementById( 'board-fallback' ).hidden = false;
	// the toggle still has to work, it just has no scene to push the theme into
	document.getElementById( 'theme' ).addEventListener( 'click', () => toggleTheme( null ) );

} else {

	main();

}

/**
 * Pushes the current theme into the 3D scene. Both halves matter: the backdrop is
 * what shows above the table and the ground is what shows below it, and leaving
 * either behind puts a cream rectangle in the middle of a dark page.
 */
function applyTheme( stage ) {

	stage.scene.background = new THREE.Color( BACKDROP[ theme ] );
	stage.ground.material.color.setHex( GROUND[ theme ] );

}

function toggleTheme( stage ) {

	theme = theme === 'light' ? 'dark' : 'light';
	document.documentElement.dataset.theme = theme;
	try { localStorage.setItem( THEME_KEY, theme ); } catch { /* private mode */ }

	if ( stage ) applyTheme( stage );

}

async function main() {

	const stage = await createStage( {
		container: host,
		groundY: - BOARD.thickness,
		backdrop: BACKDROP[ theme ],
		exposure: 0.80,
		view: { ...VIEW, distance: 0.5 },
		lighting: { env: 0.38, key: 2.9, fill: 0.12, hemi: 0.06 },
		ao: { radius: 0.0045, thickness: 0.01, scale: 1.5 },
	} );

	const { pieces } = buildBoard( stage.scene, LAYOUT );

	applyTheme( stage ); // the blocking script already painted the page; this is the scene

	// The board is the page's picture, not its instrument — orbiting it here would
	// fight the parallax below, and the playground is where it is meant to be handled.
	stage.controls.enabled = false;

	/**
	 * Distance that frames the board in whatever shape its cell happens to be.
	 *
	 * The cell is two grid columns by two rows, so its aspect ratio moves with the
	 * viewport and a fixed distance either crops the board on wide screens or leaves
	 * it stranded in the middle on narrow ones. Solving for the fill each resize keeps
	 * the framing constant instead.
	 */
	function fit() {

		const aspect = stage.camera.aspect;
		const tan = Math.tan( THREE.MathUtils.degToRad( VIEW.fov ) / 2 );
		const elevation = THREE.MathUtils.degToRad( VIEW.elevation );

		// diagonal of the board's footprint, because the camera looks at it slightly
		// off-axis and the corners are what run out of frame first
		const width = BOARD.size * 1.06;
		// the plan foreshortens with elevation; the pieces add height back on top
		const depth = BOARD.size * Math.sin( elevation ) + 0.055 * Math.cos( elevation );

		const forWidth = width / ( 0.78 * 2 * tan * aspect );
		const forHeight = depth / ( 0.80 * 2 * tan );

		stage.view.distance = Math.max( forWidth, forHeight );
		stage.applyView();

	}

	fit();
	new ResizeObserver( fit ).observe( host );

	// ---------------------------------------------------------------- parallax

	// Pointer position drives a few degrees of camera swing, eased every frame. It is
	// the only movement on the page, so it has to stay small enough to read as the
	// board sitting still on a table while you lean over it.
	const aim = { azimuth: VIEW.azimuth, elevation: VIEW.elevation };

	if ( still === false ) {

		window.addEventListener( 'pointermove', ( event ) => {

			if ( event.pointerType !== 'mouse' ) return;
			const nx = ( event.clientX / window.innerWidth ) * 2 - 1;
			const ny = ( event.clientY / window.innerHeight ) * 2 - 1;
			aim.azimuth = VIEW.azimuth + nx * SWING.azimuth;
			aim.elevation = VIEW.elevation - ny * SWING.elevation;

		}, { passive: true } );

	}

	// -------------------------------------------------------------- piece hover

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	let hovering = false;
	let hovered = null;

	host.addEventListener( 'pointermove', ( event ) => {

		const box = stage.renderer.domElement.getBoundingClientRect();
		pointer.set(
			( ( event.clientX - box.left ) / box.width ) * 2 - 1,
			- ( ( event.clientY - box.top ) / box.height ) * 2 + 1,
		);
		hovering = true;

	} );

	host.addEventListener( 'pointerleave', () => {

		hovering = false;
		hovered = null;

	} );

	// the board is the largest, most obvious way into the game, so it is a link too
	host.addEventListener( 'click', () => {

		window.location.href = '/play.html';

	} );

	host.classList.add( 'ready' );

	stage.onFrame.push( () => {

		if ( hovering ) {

			raycaster.setFromCamera( pointer, stage.camera );
			hovered = raycaster.intersectObjects( pieces.children, false )[ 0 ]?.object ?? null;

		}

		// one lerp per piece: the hovered one rises, everything else settles back
		for ( const mesh of pieces.children ) {

			const target = mesh === hovered ? LIFT : 0;
			mesh.position.y += ( target - mesh.position.y ) * 0.18;

		}

		if ( still ) return;

		stage.view.azimuth += ( aim.azimuth - stage.view.azimuth ) * 0.055;
		stage.view.elevation += ( aim.elevation - stage.view.elevation ) * 0.055;
		stage.applyView();

	} );

	// ---------------------------------------------------------------------- ui

	document.getElementById( 'theme' ).addEventListener( 'click', () => toggleTheme( stage ) );

	// Hooks for tools/check-home.mjs. None of this is visible to the DOM: the theme has
	// to reach the scene, the camera has to answer the pointer, and a hovered piece has
	// to leave the board.
	window.__scene = () => ( {
		ground: '#' + stage.ground.material.color.getHexString(),
		backdrop: '#' + stage.scene.background.getHexString(),
		page: getComputedStyle( document.body ).backgroundColor,
		distance: + stage.view.distance.toFixed( 4 ),
		azimuth: + stage.view.azimuth.toFixed( 3 ),
		elevation: + stage.view.elevation.toFixed( 3 ),
	} );

	window.__pieces = () => {

		const box = stage.renderer.domElement.getBoundingClientRect();

		return pieces.children.map( ( mesh ) => {

			// half-height, so the point lands on the piece's body rather than the board
			const v = new THREE.Vector3( mesh.position.x, HEIGHTS[ mesh.name ] * 0.5, mesh.position.z )
				.project( stage.camera );

			return {
				type: mesh.name,
				lift: + mesh.position.y.toFixed( 5 ),
				x: Math.round( box.left + ( v.x * 0.5 + 0.5 ) * box.width ),
				y: Math.round( box.top + ( 1 - ( v.y * 0.5 + 0.5 ) ) * box.height ),
			};

		} );

	};

}
