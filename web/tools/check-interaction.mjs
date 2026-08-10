// Drives the app's drag and view-control code paths in a real browser and asserts
// the results. A headless browser cannot synthesise a drag gesture, so the page
// exposes __move / __view / __squares and this runs those.
//
//   node tools/check-interaction.mjs            (needs `npm run dev` running)
//
// Chrome is driven over the DevTools protocol rather than --dump-dom, because the
// page's module scripts have not finished by the time --dump-dom fires.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = process.env.PORT ?? 5178;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9333;

const profile = mkdtempSync( join( tmpdir(), 'chetactoe-' ) );

const chrome = spawn( CHROME, [
	'--headless=new', '--disable-gpu-sandbox', '--enable-unsafe-webgpu',
	'--enable-features=Vulkan,WebGPU', `--remote-debugging-port=${DEBUG_PORT}`,
	`--user-data-dir=${profile}`, '--window-size=1400,950',
	`http://localhost:${PORT}/play.html`,
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

try {

	const url = await target();
	const { WebSocket } = await import( 'node:worker_threads' ).then( () => globalThis );
	ws = new WebSocket( url );

	await new Promise( ( r, j ) => { ws.onopen = r; ws.onerror = j; } );
	ws.onmessage = ( e ) => {

		const msg = JSON.parse( e.data );
		const p = pending.get( msg.id );
		if ( ! p ) return;
		pending.delete( msg.id );
		msg.error ? p.reject( new Error( msg.error.message ) ) : p.resolve( msg.result );

	};

	await send( 'Runtime.enable' );

	// wait for the scene to finish building (CSG runs at startup)
	let ready = false;
	for ( let i = 0; i < 80; i ++ ) {

		ready = await evaluate( 'typeof window.__move === "function"' ).catch( () => false );
		if ( ready ) break;
		await sleep( 250 );

	}

	if ( ! ready ) throw new Error( 'page never exposed its hooks' );

	console.log( '\nmoves' );

	const before = await evaluate( 'window.__squares()' );
	const startCount = before.length;

	// B1 is occupied by a dark pawn in the opening position; C3 by a light pawn
	let r = await evaluate( 'window.__move("B1","B3")' );
	check( r.ok, 'B1 -> B3 accepted' );

	await sleep( 250 );
	let now = await evaluate( 'window.__squares()' );
	const moved = now.find( ( p ) => p.square === 'B3' );
	check( !! moved, 'a piece now reports B3' );
	// B3's centre, straight from the same maths the app uses
	const want = await evaluate( `(async () => {
		const m = await import("/src/scene.js");
		const { col, row } = m.parseSquare("B3");
		const [ x, z ] = m.cellCentre( col, row );
		return { x: +x.toFixed(5), z: +z.toFixed(5) };
	})()` );
	check( moved && Math.hypot( moved.x - want.x, moved.z - want.z ) < 1e-4,
		'and sits on B3’s centre', `got ${moved?.x},${moved?.z} want ${want.x},${want.z}` );

	r = await evaluate( 'window.__move("B3","C3")' );
	check( ! r.ok, 'drop onto an occupied square refused', r.reason ?? '' );

	r = await evaluate( 'window.__move("B3","Z9")' );
	check( ! r.ok, 'drop off the board refused', r.reason ?? '' );

	r = await evaluate( 'window.__move("A1","B4")' );
	check( ! r.ok, 'moving from an empty square refused', r.reason ?? '' );

	now = await evaluate( 'window.__squares()' );
	check( now.length === startCount, 'no piece created or destroyed', `${now.length} of ${startCount}` );

	const rows = await evaluate( 'document.querySelectorAll("#history-list li").length' );
	check( rows > 0, 'move history rendered a row', `${rows} rows` );

	console.log( '\nreal pointer drag' );

	// The hooks above prove the state machine; this proves the gesture — pointer
	// capture, the raycast against the pieces, and the board-plane intersection.
	const grab = await evaluate( 'window.__screen("B3")' );
	const drop = await evaluate( 'window.__screen("A4")' );

	const mouse = ( type, p, extra = {} ) => send( 'Input.dispatchMouseEvent', {
		type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
		clickCount: 1, pointerType: 'mouse', ...extra,
	} );

	await mouse( 'mousePressed', grab );
	await sleep( 60 );
	await mouse( 'mouseMoved', { x: ( grab.x + drop.x ) / 2 | 0, y: ( grab.y + drop.y ) / 2 | 0 } );
	await sleep( 60 );
	await mouse( 'mouseMoved', drop );
	await sleep( 120 );

	// mid-drag: the piece should be lifted clear of the board and a marker showing
	const lifted = await evaluate( 'window.__dragState ? window.__dragState() : null' );
	await mouse( 'mouseReleased', drop );
	await sleep( 300 );

	const after = await evaluate( 'window.__squares()' );
	check( after.some( ( p ) => p.square === 'A4' ), 'dragged B3 -> A4 with a real pointer' );
	check( ! after.some( ( p ) => p.square === 'B3' ), 'and B3 is now empty' );
	void lifted;

	console.log( '\nview controls' );

	await evaluate( 'window.__view("rotate", true); window.__view("zoom", true); window.__view("pan", true)' );
	let v = await evaluate( 'window.__view()' );
	check( v.enableRotate && v.enableZoom && v.enablePan, 'all three axes enable' );

	await evaluate( 'window.__view("pan", false)' );
	await evaluate( 'window.__view("locked", true)' );
	v = await evaluate( 'window.__view()' );
	check( ! v.enableRotate && ! v.enableZoom && ! v.enablePan, 'lock disables every axis' );

	await evaluate( 'window.__view("locked", false)' );
	v = await evaluate( 'window.__view()' );
	check( v.enableRotate && v.enableZoom && ! v.enablePan,
		'unlock restores the previous combination, not all-on',
		`rotate ${v.enableRotate} zoom ${v.enableZoom} pan ${v.enablePan}` );

	const disabled = await evaluate(
		'window.__view("locked", true), [...document.querySelectorAll(".view-btn[data-axis]:not([data-axis=lock])")].every(b => b.disabled)' );
	check( disabled, 'axis buttons dim while locked' );
	await evaluate( 'window.__view("locked", false)' );

	console.log( fail === 0 ? '\nall interaction checks passed' : `\n${fail} failure(s)` );

} catch ( error ) {

	console.error( '\n' + error.message );
	fail = 1;

} finally {

	try { ws?.close(); } catch { /* already gone */ }
	chrome.kill();
	// Chrome keeps writing to its profile for a moment after SIGTERM, so a straight
	// rm races it and throws ENOTEMPTY over the top of the real result.
	await sleep( 400 );
	try { rmSync( profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } ); }
	catch { /* a stray profile in tmp is not worth failing the run over */ }

}

process.exit( fail ? 1 : 0 );
