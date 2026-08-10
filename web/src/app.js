import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';

import { createStage } from './stage.js';
import { buildBoard, cellCentre, parseSquare, BOARD, FILES, RANKS } from './scene.js';
import { createDragController } from './interaction.js';
import { createViewControls } from './viewcontrols.js';

const THEME_KEY = 'chetactoe-theme';

const BACKDROP = { light: 0xf2ede5, dark: 0x1c1a16 };
const GROUND = { light: 0xf2ede5, dark: 0x23201b };

/**
 * Sample position and history. This is a design shell, not a rules engine — the
 * moves below are the ones in the reference layout, and nothing validates them.
 */
const STATE = {
	you: 'dark',
	them: 'light',
	turn: 'you',
	pieces: [
		{ type: 'pawn', tone: 'dark', square: 'B1' },
		{ type: 'knight', tone: 'dark', square: 'A2', turn: 0.5 },
		{ type: 'rook', tone: 'light', square: 'D2' },
		{ type: 'pawn', tone: 'light', square: 'C3' },
		{ type: 'bishop', tone: 'dark', square: 'B4' },
	],
	history: [
		{ no: 7, type: 'knight', tone: 'dark', from: 'B1', to: 'C3' },
		{ no: 6, type: 'pawn', tone: 'dark', from: 'C3', to: 'C4' },
		{ no: 5, type: 'rook', tone: 'dark', from: 'A2', to: 'D2' },
		{ no: 4, type: 'pawn', tone: 'dark', from: 'D4', to: 'D3' },
	],
	roster: [ 'pawn', 'knight', 'rook', 'bishop' ],
};

/** Opening squares, snapshotted before anything can move them. */
const START = STATE.pieces.map( ( p ) => ( { square: p.square } ) );

// already resolved and applied by the blocking script in index.html
let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

if ( WebGPU.isAvailable() === false ) {

	document.getElementById( 'unsupported' ).classList.add( 'show' );

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

function paintUI() {

	const you = STATE.you, them = STATE.them;

	const fill = ( id, tone ) => {

		const host = document.getElementById( id );
		host.replaceChildren( ...STATE.roster.map( ( t ) => img( tone, t ) ) );

	};

	fill( 'roster-you', you );
	fill( 'roster-them', them );

	document.getElementById( 'history-list' ).replaceChildren( ...STATE.history.map( ( m ) => {

		const li = document.createElement( 'li' );

		const no = document.createElement( 'span' );
		no.className = 'no';
		no.textContent = String( m.no ).padStart( 2, '0' );

		const move = document.createElement( 'span' );
		move.className = 'move';
		move.innerHTML = `${m.from}<span class="arrow">→</span>${m.to}`;

		li.append( no, img( m.tone, m.type, `${m.type}` ), move );
		return li;

	} ) );

	const yourTurn = STATE.turn === 'you';
	const tone = yourTurn ? you : them;
	document.getElementById( 'turn-label' ).textContent = yourTurn ? 'YOUR TURN' : 'OPPONENT’S TURN';
	document.getElementById( 'turn-dot' ).classList.toggle( 'them', ! yourTurn );
	document.getElementById( 'turn-side' ).textContent =
		tone === 'dark' ? 'Brown pieces' : 'Natural pieces';

}

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

	const { pieces } = buildBoard( stage.scene, STATE.pieces );
	window.__stage = stage;

	// pan is owned by the view controls now, not hard-coded here
	stage.controls.minPolarAngle = THREE.MathUtils.degToRad( 12 );
	stage.controls.maxPolarAngle = THREE.MathUtils.degToRad( 78 );

	const view = createViewControls( { stage, container: document.getElementById( 'view-controls' ) } );

	// ------------------------------------------------------------------ dragging

	let moveNo = STATE.history.length ? STATE.history[ 0 ].no : 0;

	const drag = createDragController( {
		stage,
		pieces,
		onMove( { mesh, from, to } ) {

			const piece = STATE.pieces.find( ( p ) => p.square === from );
			if ( piece ) piece.square = to;

			STATE.history.unshift( {
				no: ++ moveNo,
				type: mesh.name,
				tone: piece?.tone ?? STATE.you,
				from,
				to,
			} );
			STATE.history = STATE.history.slice( 0, 12 );

			// free movement, so there is no turn to enforce — but the status line
			// should still say something true, and "whoever did not just move" is it
			STATE.turn = ( piece?.tone ?? STATE.you ) === STATE.you ? 'them' : 'you';
			paintUI();

		},
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

		STATE.history = [];
		moveNo = 0;
		STATE.turn = 'you';

		// put every piece back where it started
		STATE.pieces.forEach( ( spec, i ) => {

			spec.square = START[ i ].square;
			const mesh = pieces.children[ i ];
			const { col, row } = parseSquare( spec.square );
			const [ x, z ] = cellCentre( col, row );
			mesh.position.set( x, 0, z );
			mesh.userData.square = spec.square;

		} );

		paintUI();
		stage.view.azimuth = 2;
		stage.view.elevation = 67;
		stage.view.distance = 0.757;
		stage.applyView();

	} );

	paintUI();

	// Hooks for tools/check-interaction.mjs. A headless browser cannot produce a
	// drag gesture, so the same code path is exposed directly.
	window.__move = ( from, to ) => drag.moveTo( from, to );
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
	window.__squares = () => pieces.children.map( ( m ) => ( {
		type: m.name,
		square: m.userData.square,
		x: + m.position.x.toFixed( 5 ),
		z: + m.position.z.toFixed( 5 ),
	} ) );

}
