// Checks the landing page in a real browser: that the 4x4 grid divides the viewport
// the way the design does, that the central 2x2 really is the board, that no cell
// clips its own copy at any of the shapes a desktop can be, and that the sheet, the
// theme toggle and the signup form work.
//
//   node tools/check-home.mjs            (needs `npm run dev` running)
//
// Cell clipping is the interesting one. The poster layout locks the page to the
// viewport, so a row that cannot hold its text does not scroll — it cuts it off, and
// nothing about the page looks broken until you read it.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.PORT ?? 5178;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9334;

/** Desktop shapes the poster layout has to hold: the design's own, 16:9, and a laptop. */
const SHAPES = [ [ 1536, 1024 ], [ 1920, 1080 ], [ 1440, 820 ], [ 1280, 800 ] ];

const profile = mkdtempSync( join( tmpdir(), 'chetactoe-home-' ) );

const chrome = spawn( CHROME, [
	'--headless=new', '--disable-gpu-sandbox', '--enable-unsafe-webgpu',
	'--enable-features=Vulkan,WebGPU', `--remote-debugging-port=${DEBUG_PORT}`,
	`--user-data-dir=${profile}`, '--window-size=1536,1024', '--hide-scrollbars',
	`http://localhost:${PORT}/`,
], { stdio: 'ignore' } );

const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

async function target() {

	for ( let i = 0; i < 60; i ++ ) {

		try {

			const list = await ( await fetch( `http://127.0.0.1:${DEBUG_PORT}/json/list` ) ).json();
			const page = list.find( ( t ) => t.type === 'page' && t.webSocketDebuggerUrl );
			if ( page ) return page.webSocketDebuggerUrl;

		} catch { /* not up yet */ }

		await sleep( 250 );

	}

	throw new Error( 'Chrome did not expose a debug target' );

}

let ws, id = 0;
const pending = new Map();
const problems = [];

function send( method, params ) {

	return new Promise( ( resolve, reject ) => {

		const n = ++ id;
		pending.set( n, { resolve, reject } );
		ws.send( JSON.stringify( { id: n, method, params } ) );

	} );

}

async function evaluate( expression ) {

	const res = await send( 'Runtime.evaluate', {
		expression, returnByValue: true, awaitPromise: true,
	} );

	if ( res.exceptionDetails ) throw new Error( res.exceptionDetails.exception?.description ?? 'eval failed' );
	return res.result.value;

}

let fail = 0;
const check = ( ok, label, detail = '' ) => {

	console.log( `  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}` );
	if ( ! ok ) fail ++;

};

/**
 * Every run of text in a cell, tested against the cell it lives in. The piece
 * photograph and the ink wash are left out on purpose — both are meant to bleed past
 * their cell and be cropped by it.
 */
const OVERFLOW_PROBE = `( () => {
	const bad = [];
	for ( const cell of document.querySelectorAll( '.cell' ) ) {
		const box = cell.getBoundingClientRect();
		const runs = cell.querySelectorAll(
			'.index, .note-title, .copy, .statement, .arrow, .disc, .wordmark, .wordmark-jp,' +
			'.dots, .early-title, .signup, .social, .vertical, .play-title' );
		for ( const run of runs ) {
			const r = run.getBoundingClientRect();
			if ( r.height === 0 ) continue;
			const over = Math.max( box.top - r.top, r.bottom - box.bottom, box.left - r.left, r.right - box.right );
			if ( over > 1 ) bad.push( \`\${cell.className.replace( 'cell ', '' )} / \${run.className.split( ' ' )[ 0 ]} by \${over.toFixed( 1 )}px\` );
		}
	}
	return bad;
} )()`;

try {

	const url = await target();
	ws = new ( await import( 'node:worker_threads' ).then( () => globalThis ) ).WebSocket( url );

	await new Promise( ( r, j ) => { ws.onopen = r; ws.onerror = j; } );
	ws.onmessage = ( e ) => {

		const msg = JSON.parse( e.data );

		if ( msg.method === 'Runtime.exceptionThrown' ) {

			problems.push( msg.params.exceptionDetails.exception?.description ?? 'exception' );
			return;

		}

		if ( msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error' ) {

			problems.push( msg.params.args.map( ( a ) => a.value ?? a.description ).join( ' ' ) );
			return;

		}

		const p = pending.get( msg.id );
		if ( ! p ) return;
		pending.delete( msg.id );
		msg.error ? p.reject( new Error( msg.error.message ) ) : p.resolve( msg.result );

	};

	await send( 'Runtime.enable' );

	let ready = false;
	for ( let i = 0; i < 80; i ++ ) {

		ready = await evaluate( 'document.querySelector( ".canvas-host" )?.classList.contains( "ready" ) === true' )
			.catch( () => false );
		if ( ready ) break;
		await sleep( 250 );

	}

	check( ready, 'the board mounted into its cell' );

	console.log( '\ngrid geometry' );

	// The overlay lines are separate elements from the cells, so if the two ever
	// disagree the design's structure is a lie. Compare them directly.
	const geometry = await evaluate( `( () => {
		const r = ( s ) => { const b = document.querySelector( s ).getBoundingClientRect();
			return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
		return {
			grid: r( '.grid' ), board: r( '.cell-board' ), canvas: r( '.canvas-host canvas' ),
			v2: r( '.l-v2' ), v4: r( '.l-v4' ), h2: r( '.l-h2' ), h4: r( '.l-h4' ),
			cross: { v: r( '.l-v3-board' ), h: r( '.l-h3-board' ) },
			lines: getComputedStyle( document.querySelector( '.lines' ) ).display,
		};
	} )()` );

	check( geometry.lines === 'grid', 'the poster layout is the one under test', geometry.lines );
	check( Math.abs( geometry.board.l - geometry.v2.l ) < 1.5 && Math.abs( geometry.board.r - geometry.v4.l ) < 1.5,
		'the board spans columns 2 and 3 exactly' );
	check( Math.abs( geometry.board.t - geometry.h2.t ) < 1.5 && Math.abs( geometry.board.b - geometry.h4.t ) < 1.5,
		'and rows 2 and 3 exactly' );
	check( Math.abs( geometry.board.w - geometry.grid.w / 2 ) < 1.5,
		'which is half the page across', `${geometry.board.w.toFixed( 1 )} of ${geometry.grid.w}` );
	check( Math.abs( geometry.canvas.w - geometry.board.w ) < 1.5 && Math.abs( geometry.canvas.h - geometry.board.h ) < 1.5,
		'the canvas fills that cell', `${geometry.canvas.w.toFixed( 1 )}x${geometry.canvas.h.toFixed( 1 )}` );
	check( Math.abs( geometry.cross.v.l - ( geometry.board.l + geometry.board.w / 2 ) ) < 1.5,
		'the light cross falls on the board’s middle' );

	console.log( '\nclipping' );

	for ( const [ w, h ] of SHAPES ) {

		await send( 'Emulation.setDeviceMetricsOverride', {
			width: w, height: h, deviceScaleFactor: 1, mobile: false,
		} );
		await sleep( 400 );

		const bad = await evaluate( OVERFLOW_PROBE );
		const scrolls = await evaluate( 'document.documentElement.scrollHeight > innerHeight + 1' );
		const poster = await evaluate( 'getComputedStyle( document.querySelector( ".lines" ) ).display === "grid"' );

		check( bad.length === 0, `${w}x${h}: every cell holds its copy`, bad.join( '; ' ) );
		// in the poster layout nothing scrolls; outside it, scrolling is the point
		if ( poster ) check( ! scrolls, `${w}x${h}: one screen, no scroll` );

	}

	console.log( '\nnarrow layouts' );

	// Outside the poster mode the page scrolls down, and only down: a cell that pokes
	// past the right edge takes the whole document with it.
	for (const [ w, h ] of [ [ 900, 1200 ], [ 680, 1000 ], [ 430, 900 ] ] ) {

		await send( 'Emulation.setDeviceMetricsOverride', {
			width: w, height: h, deviceScaleFactor: 1, mobile: w < 700,
		} );
		await sleep( 400 );

		const side = await evaluate( `( () => {
			const W = document.documentElement.clientWidth;
			const bad = [];
			// the piece photograph and the ink wash are meant to run off their cell
			for ( const el of document.querySelectorAll( '.page *:not(.craft-piece):not(.ink)' ) ) {
				const r = el.getBoundingClientRect();
				if ( r.width === 0 && r.height === 0 ) continue;
				if ( r.right > W + 1 ) bad.push( ( el.className.split( ' ' ).pop() || el.tagName ) + ' to ' + Math.round( r.right ) );
			}
			return { W, scrollW: document.documentElement.scrollWidth, bad: [ ...new Set( bad ) ].slice( 0, 6 ) };
		} )()` );

		check( side.bad.length === 0, `${w}x${h}: nothing reaches past the right edge`, side.bad.join( '; ' ) );
		check( side.scrollW <= side.W + 1, `${w}x${h}: no sideways scroll`, `${side.scrollW} in ${side.W}` );

		const bad = await evaluate( OVERFLOW_PROBE );
		check( bad.length === 0, `${w}x${h}: every cell holds its copy`, bad.join( '; ' ) );

	}

	await send( 'Emulation.clearDeviceMetricsOverride' );
	await sleep( 300 );

	console.log( '\nboard' );

	const mouse = ( x, y ) => send( 'Input.dispatchMouseEvent', {
		type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse',
	} );

	// the camera leans a few degrees toward the pointer and eases back
	await mouse( 60, 500 );
	await sleep( 600 );
	const left = await evaluate( 'window.__scene()' );
	await mouse( 1480, 500 );
	await sleep( 600 );
	const right = await evaluate( 'window.__scene()' );

	check( right.azimuth > left.azimuth + 3, 'the camera follows the pointer across the page',
		`${left.azimuth}deg -> ${right.azimuth}deg` );
	check( Math.abs( right.azimuth - 3 ) < 6 && Math.abs( left.azimuth - 3 ) < 6,
		'and stays inside its swing' );

	// and a piece rises when the pointer is over it
	const [ piece ] = await evaluate( 'window.__pieces()' );
	await mouse( piece.x, piece.y );
	await sleep( 500 );
	const hovered = ( await evaluate( 'window.__pieces()' ) ).find( ( p ) => p.type === piece.type );

	check( hovered.lift > 0.002, `hovering the ${piece.type} lifts it off the board`,
		`${( hovered.lift * 1000 ).toFixed( 2 )} mm` );

	await mouse( 20, 20 );
	await sleep( 500 );
	const settled = ( await evaluate( 'window.__pieces()' ) ).every( ( p ) => p.lift < 0.0005 );
	check( settled, 'and it settles back when the pointer leaves' );

	console.log( '\nsheet' );

	await evaluate( 'document.querySelector( ".cell-note" ).click()' );
	await sleep( 120 );
	let open = await evaluate( `( () => {
		const s = document.getElementById( 'sheet' );
		return { hidden: s.hidden, title: document.getElementById( 'sheet-title' ).textContent,
			index: document.getElementById( 'sheet-index' ).textContent,
			body: document.getElementById( 'sheet-body' ).textContent.trim().length,
			focus: document.activeElement.id };
	} )()` );

	check( open.hidden === false, 'clicking 01 opens the sheet' );
	check( open.title === 'THE BOARD' && open.index === '01', 'with that section’s heading', `${open.index} ${open.title}` );
	check( open.body > 200, 'and its copy', `${open.body} chars` );
	check( open.focus === 'sheet-close', 'focus moves into the dialog', open.focus );

	await send( 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } );
	await sleep( 120 );
	check( await evaluate( 'document.getElementById( "sheet" ).hidden' ), 'Escape closes it' );

	await evaluate( 'document.getElementById( "menu" ).click()' );
	await sleep( 120 );
	const menu = await evaluate( 'document.querySelectorAll( ".sheet-menu a" ).length' );
	check( menu === 5, 'the menu lists five destinations', `${menu}` );
	await evaluate( 'document.getElementById( "sheet-close" ).click()' );

	console.log( '\ntheme' );

	const before = await evaluate( 'document.documentElement.dataset.theme' );
	const sceneBefore = await evaluate( 'window.__scene()' );
	await evaluate( 'document.getElementById( "theme" ).click()' );
	await sleep( 200 );
	const after = await evaluate( 'document.documentElement.dataset.theme' );
	const sceneAfter = await evaluate( 'window.__scene()' );

	check( before !== after, 'the toggle flips the palette', `${before} -> ${after}` );

	// The 3D table and backdrop have to follow the page, or the dark theme leaves a lit
	// cream rectangle in the middle of a charcoal grid.
	check( sceneBefore.ground !== sceneAfter.ground && sceneBefore.backdrop !== sceneAfter.backdrop,
		'and the 3D table and backdrop with it',
		`${sceneBefore.ground}/${sceneBefore.backdrop} -> ${sceneAfter.ground}/${sceneAfter.backdrop}` );

	check( sceneBefore.page !== sceneAfter.page, 'and the page under it',
		`${sceneBefore.page} -> ${sceneAfter.page}` );

	await evaluate( 'document.getElementById( "theme" ).click()' );

	console.log( '\nsignup' );

	await evaluate( 'document.getElementById( "email" ).value = "not-an-email"' );
	await evaluate( 'document.getElementById( "signup" ).requestSubmit()' );
	await sleep( 100 );
	check( ( await evaluate( 'document.getElementById( "signup-note" ).classList.contains( "bad" )' ) ) === true,
		'a bad address is refused' );

	await evaluate( 'document.getElementById( "email" ).value = "player@example.com"' );
	await evaluate( 'document.getElementById( "signup" ).requestSubmit()' );
	await sleep( 100 );
	check( ( await evaluate( 'document.getElementById( "email" ).value' ) ) === ''
		&& ( await evaluate( 'document.getElementById( "signup-note" ).classList.contains( "bad" )' ) ) === false,
		'a good one is acknowledged and cleared' );

	console.log( '\nconsole' );
	check( problems.length === 0, 'no page errors', problems.join( ' | ' ) );

	console.log( fail === 0 ? '\nall landing-page checks passed' : `\n${fail} failure(s)` );

} catch ( error ) {

	console.error( '\n' + error.message );
	fail = 1;

} finally {

	try { ws?.close(); } catch { /* already gone */ }
	chrome.kill();
	await sleep( 400 );
	try { rmSync( profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } ); }
	catch { /* a stray profile in tmp is not worth failing the run over */ }

}

process.exit( fail ? 1 : 0 );
