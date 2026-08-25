// Full-page capture at a real device viewport. `tools/shot-home.sh` sizes the window
// to the shot, which is fine for the desktop poster but wrong for the narrow layouts:
// the page scales off the viewport, so a 2200 px tall window is not a phone. This sets
// device metrics and captures beyond the viewport instead.
//
//   node tools/shot-page.mjs <out.png> <width>x<height> [path] [setup]
//   node tools/shot-page.mjs renders/home-mobile.png 430x932
//
// `setup` is JS run in the page before the shot, which is how a position gets
// captured: /play.html now starts with an empty board and every piece in the two
// reserves, so a screenshot of a game in progress has to play one first.
//
//   node tools/shot-page.mjs renders/play.png 1400x950 /play.html \
//     '__move("dark:knight","B3"); __move("light:rook","C2"); __select("dark:knight")'
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [ out, size = '430x932', path = '/', setup = null ] = process.argv.slice( 2 );
if ( ! out ) {

	console.error( 'usage: node tools/shot-page.mjs <out.png> <WxH> [path]' );
	process.exit( 1 );

}

const [ width, height ] = size.split( 'x' ).map( Number );
const PORT = process.env.PORT ?? 5178;
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9335;

const profile = mkdtempSync( join( tmpdir(), 'chetactoe-shot-' ) );
const chrome = spawn( CHROME, [
	'--headless=new', '--disable-gpu-sandbox', '--enable-unsafe-webgpu',
	'--enable-features=Vulkan,WebGPU', `--remote-debugging-port=${DEBUG_PORT}`,
	`--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--hide-scrollbars',
	`http://localhost:${PORT}${path}`,
], { stdio: 'ignore' } );

const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

let ws, id = 0;
const pending = new Map();
const send = ( method, params ) => new Promise( ( resolve, reject ) => {

	const n = ++ id;
	pending.set( n, { resolve, reject } );
	ws.send( JSON.stringify( { id: n, method, params } ) );

} );

try {

	let url = null;
	for ( let i = 0; i < 60 && ! url; i ++ ) {

		try {

			const list = await ( await fetch( `http://127.0.0.1:${DEBUG_PORT}/json/list` ) ).json();
			url = list.find( ( t ) => t.type === 'page' && t.webSocketDebuggerUrl )?.webSocketDebuggerUrl ?? null;

		} catch { /* not up yet */ }

		if ( ! url ) await sleep( 250 );

	}

	if ( ! url ) throw new Error( 'Chrome did not expose a debug target' );

	ws = new WebSocket( url );
	await new Promise( ( r, j ) => { ws.onopen = r; ws.onerror = j; } );
	ws.onmessage = ( e ) => {

		const msg = JSON.parse( e.data );
		const p = pending.get( msg.id );
		if ( ! p ) return;
		pending.delete( msg.id );
		msg.error ? p.reject( new Error( msg.error.message ) ) : p.resolve( msg.result );

	};

	await send( 'Emulation.setDeviceMetricsOverride', {
		width, height, deviceScaleFactor: 1, mobile: width < 700,
	} );

	// the board builds its geometry with CSG at startup; give it time to appear
	await send( 'Runtime.enable' );
	await sleep( 9000 );

	if ( setup ) {

		const res = await send( 'Runtime.evaluate', {
			expression: setup, returnByValue: true, awaitPromise: true,
		} );

		if ( res.exceptionDetails ) {

			throw new Error( `setup failed: ${res.exceptionDetails.exception?.description ?? 'unknown'}` );

		}

		await sleep( 700 ); // let the settle animation finish
	}

	const shot = await send( 'Page.captureScreenshot', {
		format: 'png', captureBeyondViewport: true,
	} );

	writeFileSync( out, Buffer.from( shot.data, 'base64' ) );
	console.log( `${out}  ${size}` );

} catch ( error ) {

	console.error( error.message );
	process.exitCode = 1;

} finally {

	try { ws?.close(); } catch { /* already gone */ }
	chrome.kill();
	await sleep( 400 );
	try { rmSync( profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } ); }
	catch { /* a stray profile in tmp is not worth failing over */ }

}
