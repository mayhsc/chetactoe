import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';

import { createStage } from './stage.js';
import { buildBoard, cellCentre, parseSquare, BOARD, FILES, RANKS } from './scene.js';
import { createDragController } from './interaction.js';
import { createViewControls } from './viewcontrols.js';
import { whyNoWebGPU } from './webgpu-why.js';
import {
	ENDINGS, TYPES, apply, canSwap, createGame, destinations, handCount, handRef,
	isHandRef, other, parseHandRef, pieceAt, reset, swap, winningLine,
} from './game.js';

const THEME_KEY = 'chetactoe-theme';

const BACKDROP = { light: 0xf2ede5, dark: 0x1c1a16 };
const GROUND = { light: 0xf2ede5, dark: 0x23201b };

const SELECT_LIFT = 0.0035; // a selected piece stands off the board this far

/**
 * Which set the local player has. The shell is one board two people sit at, so
 * both sides are playable here; this only decides which reserve is labelled
 * "YOUR PIECES" and which way the turn line reads.
 */
const YOU = 'dark';
const THEM = other( YOU );

/** The rules and the whole position live here. `sync()` draws whatever it says. */
const game = createGame();

/**
 * What is selected: a square like `B3`, a reserve slot like `dark:knight`, or
 * null. It is the client's half of the engine's select / execute / cancel — a
 * selection asks "where may this go", and the answer is what gets drawn on the
 * board.
 */
let selection = null;

// already resolved and applied by the blocking script in index.html
let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

if ( WebGPU.isAvailable() === false ) {

	document.getElementById( 'unsupported' ).classList.add( 'show' );
	document.getElementById( 'unsupported-why' ).textContent = whyNoWebGPU();

} else {

	document.querySelector( '.app' ).hidden = false;
	main();

}

const iconSrc = ( tone, type ) => `/icons/${tone}-${type}.png`;

function img( tone, type, alt ) {

	const el = document.createElement( 'img' );
	el.src = iconSrc( tone, type );
	el.alt = alt ?? `${tone} ${type}`;
	el.loading = 'lazy';
	return el;

}

// ---------------------------------------------------------------------- panel

/**
 * The two reserves, as four fixed slots each — pawn, knight, bishop, rook, the
 * same order the engine's hand array uses. A slot keeps its place when its piece
 * is in play and shows as an empty socket, so the panel reads as "these four,
 * two of them out on the board" rather than as a list that shuffles.
 *
 * This is also where a captured piece reappears: nothing is taken out of the
 * game, so a piece that leaves the board comes back to its own socket here and
 * can be placed again.
 */
function paintReserve( id, tone ) {

	const host = document.getElementById( id );

	host.replaceChildren( ...TYPES.map( ( type ) => {

		const ref = handRef( tone, type );
		const piece = pieceAt( game, ref );
		const cooling = piece !== null && piece.cooldown > 0;
		const yours = tone === game.turn && ! game.over;

		const slot = document.createElement( 'button' );
		slot.type = 'button';
		slot.className = 'slot';
		slot.dataset.ref = ref;
		slot.dataset.state = piece === null ? 'board' : cooling ? 'cooling' : 'hand';
		slot.disabled = piece === null || cooling || ! yours;
		slot.setAttribute( 'aria-pressed', String( selection === ref ) );

		slot.title = piece === null
			? `${type} is in play`
			: cooling
				? `${type} was just taken — back in ${piece.cooldown} turn${piece.cooldown === 1 ? '' : 's'}`
				: yours ? `Place the ${type}` : `${type} in reserve`;

		if ( selection === ref ) slot.classList.add( 'selected' );

		slot.append( img( tone, type, `${tone} ${type}` ) );

		// A captured piece is not gone and not ready — the number says when.
		if ( cooling ) {

			const badge = document.createElement( 'span' );
			badge.className = 'cooldown';
			badge.textContent = String( piece.cooldown );
			slot.append( badge );

		}

		return slot;

	} ) );

	const ready = game.hands[ tone ].filter( ( p ) => p && p.cooldown === 0 ).length;
	const held = handCount( game, tone );

	document.getElementById( `${id}-count` ).textContent =
		held === ready ? `${held} IN HAND` : `${held} IN HAND, ${ready} READY`;

}

function paintHistory() {

	const label = ( entry ) => ( entry.placed ? 'HAND' : entry.from );

	document.getElementById( 'history-list' ).replaceChildren( ...game.history.slice( 0, 12 ).map( ( m ) => {

		const li = document.createElement( 'li' );

		const no = document.createElement( 'span' );
		no.className = 'no';
		no.textContent = String( m.no ).padStart( 2, '0' );

		const move = document.createElement( 'span' );
		move.className = 'move';

		if ( m.swapped ) {

			move.textContent = 'TOOK THE POSITION';
			li.append( no, document.createElement( 'span' ), move );
			return li;

		}

		move.innerHTML = `${label( m )}<span class="arrow">→</span>${m.to}`;

		if ( m.captured ) {

			const took = document.createElement( 'span' );
			took.className = 'took';
			took.title = `took the ${m.captured.tone} ${m.captured.type}`;
			took.append( '×', img( m.captured.tone, m.captured.type, `took ${m.captured.type}` ) );
			move.append( took );

		}

		li.append( no, img( m.tone, m.type, m.type ), move );
		return li;

	} ) );

}

function paintTurn() {

	const yourTurn = game.turn === YOU;
	const tone = game.turn;

	const label = document.getElementById( 'turn-label' );
	const dot = document.getElementById( 'turn-dot' );
	const side = document.getElementById( 'turn-side' );
	const hint = document.getElementById( 'turn-hint' );

	const setName = ( t ) => ( t === 'dark' ? 'Brown pieces' : 'Natural pieces' );

	if ( game.over ) {

		label.textContent = game.winner === null
			? 'DRAW'
			: game.winner === YOU ? 'YOU WIN' : 'OPPONENT WINS';

		dot.classList.toggle( 'them', game.winner === THEM );

		side.textContent = game.winner === null ? 'Neither side' : setName( game.winner );

		hint.textContent = {
			[ ENDINGS.won ]: `${game.rules.winLength} in a line. Restart to play again.`,
			[ ENDINGS.repetition ]: 'The same position three times — nobody was getting anywhere.',
			[ ENDINGS.length ]: `${game.rules.maxPlies} moves with no result.`,
			[ ENDINGS.noMove ]: 'The other side had no legal move left.',
		}[ game.ending ] ?? 'Restart to play again.';

	} else {

		label.textContent = yourTurn ? 'YOUR TURN' : 'OPPONENT’S TURN';
		dot.classList.toggle( 'them', ! yourTurn );
		side.textContent = setName( tone );

		hint.textContent = canSwap( game )
			? 'Reply, or take their position instead — the first move is worth having.'
			: selection === null
				? handCount( game, tone ) > 0
					? 'Drag a piece out of the reserve, or tap one to see where it can go.'
					: 'Drag a piece, or tap one to see where it can go.'
				: isHandRef( selection )
					? 'Drop it on a marked square, or tap one. Escape cancels.'
					: 'Drag it, or tap a marked square. Escape cancels.';

	}

	// The pie rule is open on exactly one turn, so the button exists only then.
	document.getElementById( 'swap' ).hidden = ! canSwap( game );

	document.querySelector( '.app' ).classList.toggle( 'over', game.over );

}

function paintUI() {

	paintReserve( 'roster-you', YOU );
	paintReserve( 'roster-them', THEM );
	paintHistory();
	paintTurn();

}

// ---------------------------------------------------------------------- board

function setTheme( next, stage ) {

	theme = next;
	document.documentElement.dataset.theme = theme;
	try { localStorage.setItem( THEME_KEY, theme ); } catch { /* private mode */ }

	if ( ! stage ) return;
	stage.scene.background = new THREE.Color( BACKDROP[ theme ] );
	stage.ground.material.color.setHex( GROUND[ theme ] );

}

async function main() {

	const host = document.getElementById( 'canvas-host' );

	const stage = await createStage( {
		container: host,
		groundY: - BOARD.thickness,
		exposure: 0.80,
		// A relaxed three-quarter view rather than the reference photograph's framing;
		// the board page keeps that one for verification.
		view: { fov: 18, elevation: 67, distance: 0.757, height: - 0.038, azimuth: 2, pan: - 0.0067 },
		lighting: { env: 0.38, key: 2.9, fill: 0.12, hemi: 0.06 },
		ao: { radius: 0.0045, thickness: 0.01, scale: 1.5 },
	} );

	// All eight pieces are built once, here, and none of them starts on the board:
	// every piece begins in its owner's reserve, which is what the panel draws. A
	// mesh with no square is hidden rather than absent, so placing one is a
	// visibility change and nothing is ever created mid-game.
	const layout = [ YOU, THEM ].flatMap( ( tone ) => TYPES.map( ( type, i ) => ( {
		id: `${tone}-${type}`,
		type,
		tone,
		square: null,
		turn: i * 0.5,
	} ) ) );

	const { pieces } = buildBoard( stage.scene, layout );
	window.__stage = stage;

	// pan is owned by the view controls now, not hard-coded here
	stage.controls.minPolarAngle = THREE.MathUtils.degToRad( 12 );
	stage.controls.maxPolarAngle = THREE.MathUtils.degToRad( 78 );

	const view = createViewControls( { stage, container: document.getElementById( 'view-controls' ) } );

	// ------------------------------------------------------------------ the game

	const meshOf = ( id ) => pieces.children.find( ( m ) => m.userData.id === id ) ?? null;

	/** Where the rules currently say this mesh's piece is, or null for the reserve. */
	function squareOf( mesh ) {

		for ( let row = 0; row < BOARD.cells; row ++ ) {

			for ( let col = 0; col < BOARD.cells; col ++ ) {

				if ( game.board[ row ][ col ]?.id === mesh.userData.id ) {

					return `${FILES[ col ]}${RANKS[ row ]}`;

				}

			}

		}

		return null;

	}

	/**
	 * Draws the position. The rules are the truth and this is the only thing that
	 * reads them, so a piece is where the state says, visible only if it is in
	 * play, and the panel and the board can never disagree.
	 *
	 * `animate` is the one piece that just moved, which slides instead of jumping.
	 */
	function sync( { animate = null } = {} ) {

		for ( const mesh of pieces.children ) {

			const square = squareOf( mesh );
			mesh.userData.square = square;

			// The one being carried follows the pointer, not the state — and a piece on
			// its way out of a reserve is on screen while the rules still have it in
			// hand, so its visibility is left alone too.
			if ( mesh === pointer.dragging() ) continue;

			mesh.visible = square !== null;

			if ( square === null ) continue;

			// Both of these rest the piece at the height `liftFor` below asks for, so
			// a selected piece stands proud of the board however it got there.
			if ( mesh === animate ) pointer.settleTo( mesh, square );
			else pointer.snapTo( mesh, square );

		}

		paintHints();
		paintUI();

	}

	/** The selection's destinations, marked up so a capture can be coloured. */
	function paintHints() {

		if ( game.over ) {

			// One last thing worth drawing: the line that won it. Wide markers, since
			// every square in it has a piece standing on it.
			const line = game.winner ? winningLine( game, game.winner ) : null;
			pointer.setHints(
				( line ?? [] ).map( ( square ) => ( { square, wide: true } ) ),
				{ interactive: false },
			);
			return;

		}

		if ( selection === null ) { pointer.setHints( [] ); return; }

		pointer.setHints( destinations( game, selection ).map( ( square ) => ( {
			square,
			capture: pieceAt( game, square ) !== null,
		} ) ) );

	}

	function select( ref ) {

		selection = ref !== null && destinations( game, ref ).length > 0 ? ref : null;
		sync();

	}

	/**
	 * One move, through the rules. Everything that moves a piece comes through
	 * here — drag, tap, or test hook — so an illegal move is refused in exactly one
	 * place and the board cannot end up showing something the rules never allowed.
	 */
	function act( from, to ) {

		const result = apply( game, from, to );

		if ( ! result.ok ) return result;

		selection = null;

		// A piece coming out of the reserve has no board position to slide from, so
		// it appears on its square; a piece already in play slides.
		sync( { animate: isHandRef( from ) ? null : meshOf( result.piece.id ) } );

		return result;

	}

	const pointer = createDragController( {
		stage,
		pieces,
		rules: {
			// What may be picked up, and where it may go: one question, asked of the
			// rules, so the pointer code has no second opinion about whose turn it is.
			destinations: ( mesh ) => ( mesh.userData.square ? destinations( game, mesh.userData.square ) : [] ),

			// Selection is legible on the board as well as in the panel.
			liftFor: ( mesh ) => ( mesh.userData.square === selection ? SELECT_LIFT : 0 ),
		},

		onAct: ( { from, to } ) => act( from, to ).ok,

		// A piece dragged out of a reserve and dropped nowhere legal goes back to it,
		// which is where the rules still have it — so a redraw is the whole undo.
		onAbort: () => select( null ),

		onTap: ( { mesh, square, picking } ) => {

			if ( game.over ) return;

			// Picking a piece up is also selecting it.
			if ( picking ) { select( mesh.userData.square ); return; }

			// A tap on a piece: select it, or clear it if it was already selected.
			if ( mesh ) {

				const ref = mesh.userData.square;
				select( ref === selection ? null : ref );
				return;

			}

			// A tap on a square. If something is selected and this is one of its
			// destinations, that is the move — including placing from the reserve,
			// which is the only way to play a piece that has no mesh on the board yet.
			if ( square && selection !== null && destinations( game, selection ).includes( square ) ) {

				act( selection, square );
				return;

			}

			select( null );

		},
	} );

	/** The mesh for a reserve slot: `dark:knight` names the same piece as `dark-knight`. */
	function meshOfRef( ref ) {

		const { tone, type } = parseHandRef( ref );
		return meshOf( `${tone}-${type}` );

	}

	// Pressing a reserve slot selects that piece and the board lights up with every
	// square it may be placed on. Keep moving and you are dragging the piece itself
	// out of the panel and onto the board; let go without moving and it stays
	// selected, so a square can be clicked instead. One gesture, either way.
	for ( const id of [ 'roster-you', 'roster-them' ] ) {

		document.getElementById( id ).addEventListener( 'pointerdown', ( event ) => {

			if ( event.button !== 0 ) return;

			const slot = event.target.closest( '.slot' );
			if ( ! slot || slot.disabled ) return;

			const ref = slot.dataset.ref;
			const wasSelected = selection === ref;

			select( ref );

			pointer.carryFrom( {
				mesh: meshOfRef( ref ),
				ref,
				pointerId: event.pointerId,
				clientX: event.clientX,
				clientY: event.clientY,
				// Pressing the selected piece again puts it back down.
				onClick: () => { if ( wasSelected ) select( null ); },
			} );

			// No text selection, and no native image drag racing the carry.
			event.preventDefault();

		} );

	}

	document.getElementById( 'swap' ).addEventListener( 'click', () => {

		if ( ! swap( game ).ok ) return;

		selection = null;

		// Every piece changed hands, so the meshes do too: a piece's mesh is chosen
		// by `tone-type`, and sync() moves whichever mesh now owns each square. The
		// timber under the piece changes colour, which is exactly what happened.
		sync();

	} );

	// Escape clears a selection, because clicking somewhere harmless to get rid of one
	// is not obvious and on a board every square looks like it might do something.
	window.addEventListener( 'keydown', ( event ) => {

		if ( event.key === 'Escape' && selection !== null ) select( null );

	} );

	// ------------------------------------------------------------------- labels

	// One label per file and per rank, parked just outside the board's edge in
	// board space and projected every frame. Laying them out in CSS instead would
	// mean re-deriving the perspective by hand and re-doing it on every orbit.
	const labels = document.getElementById( 'labels' );
	const area = document.getElementById( 'board-area' );
	const edge = BOARD.size / 2 + 0.011;

	const marks = [
		...FILES.map( ( t, i ) => ( { text: t, at: [ cellCentre( i, 0 )[ 0 ], 0, - edge ] } ) ),
		...RANKS.map( ( t, i ) => ( { text: t, at: [ - edge, 0, cellCentre( 0, i )[ 1 ] ] } ) ),
	].map( ( m ) => {

		const el = document.createElement( 'span' );
		el.textContent = m.text;
		labels.append( el );
		return { ...m, el, v: new THREE.Vector3() };

	} );

	stage.onFrame.push( () => {

		const canvas = stage.renderer.domElement.getBoundingClientRect();
		const box = area.getBoundingClientRect();
		const dx = canvas.left - box.left;
		const dy = canvas.top - box.top;

		for ( const m of marks ) {

			m.v.set( ...m.at ).project( stage.camera );
			m.el.style.left = `${dx + ( m.v.x * 0.5 + 0.5 ) * canvas.width}px`;
			m.el.style.top = `${dy + ( 1 - ( m.v.y * 0.5 + 0.5 ) ) * canvas.height}px`;
			// hide a label if the orbit swings it behind the camera
			m.el.style.opacity = m.v.z > 1 ? 0 : 1;

		}

	} );

	// ---------------------------------------------------------------------- ui

	setTheme( theme, stage ); // pushes the already-applied theme into the 3D scene

	document.getElementById( 'theme' ).addEventListener( 'click', () =>
		setTheme( theme === 'light' ? 'dark' : 'light', stage ) );

	document.getElementById( 'restart' ).addEventListener( 'click', () => {

		reset( game );
		selection = null;
		sync();

		stage.view.azimuth = 2;
		stage.view.elevation = 67;
		stage.view.distance = 0.757;
		stage.applyView();

	} );

	sync();

	// Hooks for tools/check-interaction.mjs and tools/check-rules.mjs. A headless
	// browser cannot produce a drag gesture, so the same code paths are exposed
	// directly — `__move` is the one the app itself calls.
	window.__move = ( from, to ) => {

		const result = act( from, to );
		return { ok: result.ok, reason: result.reason };

	};

	window.__place = ( tone, type, square ) => window.__move( handRef( tone, type ), square );
	window.__select = ( ref ) => { select( ref ); return pointer.hints(); };
	window.__moves = ( ref ) => destinations( game, ref );
	window.__hints = () => pointer.hints();
	window.__marker = () => pointer.marker();
	window.__carried = () => pointer.dragging()?.userData.id ?? null;
	window.__visible = () => pieces.children.filter( ( m ) => m.visible ).map( ( m ) => m.userData.id );
	window.__restart = () => document.getElementById( 'restart' ).click();

	window.__swap = () => { const r = swap( game ); if ( r.ok ) { selection = null; sync(); } return r; };

	window.__state = () => ( {
		turn: game.turn,
		over: game.over,
		winner: game.winner,
		ending: game.ending,
		canSwap: canSwap( game ),
		moveNo: game.moveNo,
		selection,
		cooldowns: {
			light: game.hands.light.map( ( p ) => ( p ? p.cooldown : null ) ),
			dark: game.hands.dark.map( ( p ) => ( p ? p.cooldown : null ) ),
		},
		hands: {
			light: game.hands.light.map( ( p ) => p?.type ?? null ),
			dark: game.hands.dark.map( ( p ) => p?.type ?? null ),
		},
	} );

	window.__hands = () => window.__state().hands;

	window.__view = ( id, value ) => ( value === undefined ? view.snapshot() : view.set( id, value ) );

	window.__screen = ( square ) => {

		const { col, row } = parseSquare( square );
		const [ x, z ] = cellCentre( col, row );
		const v = new THREE.Vector3( x, 0, z ).project( stage.camera );
		const r = stage.renderer.domElement.getBoundingClientRect();
		return {
			x: Math.round( r.left + ( v.x * 0.5 + 0.5 ) * r.width ),
			y: Math.round( r.top + ( 1 - ( v.y * 0.5 + 0.5 ) ) * r.height ),
		};

	};

	// Only the pieces in play — a hidden mesh is a piece in a reserve, and
	// `__hands()` is where those are.
	window.__squares = () => pieces.children.filter( ( m ) => m.visible ).map( ( m ) => ( {
		id: m.userData.id,
		tone: m.userData.tone,
		type: m.name,
		square: m.userData.square,
		x: + m.position.x.toFixed( 5 ),
		z: + m.position.z.toFixed( 5 ),
	} ) );

}
