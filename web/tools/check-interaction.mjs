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

	console.log( '\nthe opening position' );

	const opening = await evaluate( 'window.__state()' );

	check( ( await evaluate( 'window.__squares()' ) ).length === 0,
		'no piece starts on the board' );
	check( opening.hands.dark.filter( Boolean ).length === 4 &&
		opening.hands.light.filter( Boolean ).length === 4,
		'both reserves start with four',
		`dark ${opening.hands.dark.filter( Boolean ).length}, light ${opening.hands.light.filter( Boolean ).length}` );
	check( ( await evaluate( 'document.querySelectorAll("#roster-you .slot[data-state=hand]").length' ) ) === 4,
		'and the panel draws four filled sockets' );
	check( opening.turn === 'dark' && ! opening.over, 'dark is to move', opening.turn );

	console.log( '\nplacing from the reserve' );

	// Selecting a piece in hand should light up every empty square, and the move
	// itself goes through the rules — the same call the pointer makes.
	let hints = await evaluate( 'window.__select("dark:knight")' );
	check( hints.length === 16, 'the first piece can go on any of the sixteen squares', `${hints.length}` );

	let r = await evaluate( 'window.__move("dark:knight","B3")' );
	check( r.ok, 'dark:knight -> B3 accepted', r.reason ?? '' );

	await sleep( 250 );
	let now = await evaluate( 'window.__squares()' );
	const placed = now.find( ( p ) => p.square === 'B3' );

	check( now.length === 1, 'one piece is in play', `${now.length}` );
	check( placed?.type === 'knight', 'and it is the knight' );

	// B3's centre, straight from the same maths the app uses
	const want = await evaluate( `(async () => {
		const m = await import("/src/scene.js");
		const { col, row } = m.parseSquare("B3");
		const [ x, z ] = m.cellCentre( col, row );
		return { x: +x.toFixed(5), z: +z.toFixed(5) };
	})()` );
	check( placed && Math.hypot( placed.x - want.x, placed.z - want.z ) < 1e-4,
		'sitting on B3’s centre', `got ${placed?.x},${placed?.z} want ${want.x},${want.z}` );

	let state = await evaluate( 'window.__state()' );
	check( state.hands.dark[ 1 ] === null, 'the knight has left the reserve' );
	check( ( await evaluate( 'document.querySelectorAll("#roster-you .slot[data-state=board]").length' ) ) === 1,
		'and its socket in the panel is empty' );
	check( ( await evaluate( 'document.getElementById("roster-you-count").textContent' ) ).startsWith( '3' ),
		'the count reads three in hand' );
	check( state.turn === 'light', 'the turn passed', state.turn );

	console.log( '\nthe rules' );

	r = await evaluate( 'window.__move("B3","C3")' );
	check( ! r.ok, 'moving out of turn refused', r.reason ?? '' );

	// light answers, out of the knight's way, so it is dark to move again
	r = await evaluate( 'window.__move("light:rook","A1")' );
	check( r.ok, 'light:rook -> A1 accepted', r.reason ?? '' );

	r = await evaluate( 'window.__move("B3","C3")' );
	check( ! r.ok, 'a knight moving one square refused', r.reason ?? '' );

	r = await evaluate( 'window.__move("D4","D3")' );
	check( ! r.ok, 'moving from an empty square refused', r.reason ?? '' );

	r = await evaluate( 'window.__move("B3","Z9")' );
	check( ! r.ok, 'moving off the board refused', r.reason ?? '' );

	hints = await evaluate( 'window.__select("A1")' );
	check( hints.length === 0, 'the other side’s piece cannot be selected' );

	console.log( '\ncapture puts the piece back in the reserve' );

	// dark knight B3 -> A1 is an L, and A1 is the light rook.
	hints = await evaluate( 'window.__select("B3")' );
	check( hints.includes( 'A1' ), 'the capture is offered', hints.join( ' ' ) );

	r = await evaluate( 'window.__move("B3","A1")' );
	check( r.ok, 'the knight takes the rook', r.reason ?? '' );

	await sleep( 250 );
	state = await evaluate( 'window.__state()' );
	now = await evaluate( 'window.__squares()' );

	check( now.length === 1 && now[ 0 ].square === 'A1' && now[ 0 ].tone === 'dark',
		'only the knight is left in play' );
	check( state.hands.light[ 3 ] === 'rook', 'the captured rook is back in light’s reserve',
		String( state.hands.light ) );
	// All four are back in the reserve, but the one just taken is cooling rather
	// than ready — a capture buys a turn, which is the point of it.
	check( ( await evaluate( 'document.querySelectorAll("#roster-them .slot[data-state=hand]").length' ) ) === 3,
		'three of theirs are ready' );
	check( ( await evaluate( 'document.querySelectorAll("#roster-them .slot[data-state=cooling]").length' ) ) === 1,
		'and the one just taken is sitting out' );
	check( ( await evaluate( 'document.getElementById("roster-them-count").textContent' ) ).includes( 'READY' ),
		'the count says how many can actually be played',
		await evaluate( 'document.getElementById("roster-them-count").textContent' ) );
	check( ( await evaluate( 'document.querySelectorAll("#history-list .took").length' ) ) === 1,
		'the history marks the capture' );

	const rows = await evaluate( 'document.querySelectorAll("#history-list li").length' );
	check( rows === 3, 'move history rendered a row per move', `${rows} rows` );

	console.log( '\nwinning, and the rules that made it possible' );

	await evaluate( 'window.__restart()' );
	await sleep( 250 );

	// Two in a row, then the third by dropping — which the rules refuse, because a
	// placement may not be the move that completes a line.
	r = await evaluate( 'window.__move("dark:pawn","A2")' );
	check( r.ok, 'dark places a pawn on A2', r.reason ?? '' );
	r = await evaluate( 'window.__move("light:pawn","D4")' );
	check( r.ok, 'light answers on D4', r.reason ?? '' );
	r = await evaluate( 'window.__move("dark:knight","B2")' );
	check( r.ok, 'dark places a knight on B2 — two in a row', r.reason ?? '' );
	r = await evaluate( 'window.__move("light:knight","D3")' );
	check( r.ok, 'light answers again', r.reason ?? '' );

	let drops = await evaluate( 'window.__moves("dark:bishop")' );
	check( ! drops.includes( 'C2' ), 'the square that would win is not offered', drops.join( ' ' ) );
	check( drops.length > 0, 'but the reserve is still placeable', `${drops.length} squares` );

	r = await evaluate( 'window.__move("dark:bishop","C2")' );
	check( ! r.ok, 'and the winning drop is refused', r.reason ?? '' );

	// Walk a piece in instead. B1 -> C2 is a bishop's diagonal.
	r = await evaluate( 'window.__move("dark:bishop","B1")' );
	check( r.ok, 'the bishop goes to B1 instead', r.reason ?? '' );
	r = await evaluate( 'window.__move("light:bishop","C4")' );
	check( r.ok, 'light answers', r.reason ?? '' );
	r = await evaluate( 'window.__move("B1","C2")' );
	check( r.ok, 'the bishop walks into C2', r.reason ?? '' );

	state = await evaluate( 'window.__state()' );
	check( state.over && state.winner === 'dark', 'three in a line ends the game',
		`over ${state.over}, winner ${state.winner}` );
	check( state.ending === 'won', 'the ending says how', String( state.ending ) );
	check( ( await evaluate( 'document.getElementById("turn-label").textContent' ) ) === 'YOU WIN',
		'the panel says so' );
	check( ( await evaluate( 'window.__hints()' ) ).join( '' ) === 'A2B2C2',
		'and the winning line is marked on the board' );

	r = await evaluate( 'window.__move("A2","A1")' );
	check( ! r.ok, 'a move after the game ends refused', r.reason ?? '' );

	console.log( '\nthe pie rule' );

	await evaluate( 'window.__restart()' );
	await sleep( 250 );

	check( ( await evaluate( 'document.getElementById("swap").hidden' ) ) === true,
		'the swap is not offered before anyone has moved' );

	await evaluate( 'window.__move("dark:rook","B2")' );
	await sleep( 200 );

	state = await evaluate( 'window.__state()' );
	check( state.canSwap, 'it is offered on the second player’s first turn' );
	check( ( await evaluate( 'document.getElementById("swap").hidden' ) ) === false,
		'and the button appears' );

	await evaluate( 'document.getElementById("swap").click()' );
	await sleep( 300 );

	const swapped = await evaluate( 'window.__squares()' );
	state = await evaluate( 'window.__state()' );

	check( swapped.length === 1 && swapped[ 0 ].square === 'B2' && swapped[ 0 ].tone === 'light',
		'the piece on B2 changed hands — and changed timber',
		JSON.stringify( swapped.map( ( p ) => `${p.tone} ${p.type}` ) ) );
	check( state.turn === 'dark', 'dark is to move, now as the second player', state.turn );
	check( ! state.canSwap, 'and the rule has closed' );
	check( ( await evaluate( 'document.getElementById("swap").hidden' ) ) === true,
		'so the button is gone' );
	check( ( await evaluate( 'document.getElementById("roster-you-count").textContent' ) ).startsWith( '4' ),
		'dark has its whole reserve back' );
	check( ( await evaluate( 'document.querySelectorAll("#history-list li").length' ) ) === 2,
		'and the swap is in the history' );

	console.log( '\na captured piece has to sit out' );

	await evaluate( 'window.__restart()' );
	await sleep( 250 );

	await evaluate( 'window.__move("dark:rook","A1")' );
	await evaluate( 'window.__move("light:pawn","A2")' );
	await evaluate( 'window.__move("A1","A2")' ); // dark takes the pawn
	await sleep( 300 );

	state = await evaluate( 'window.__state()' );
	check( state.cooldowns.light[ 0 ] === 1, 'the captured pawn is cooling',
		JSON.stringify( state.cooldowns.light ) );
	check( ( await evaluate( 'window.__moves("light:pawn")' ) ).length === 0,
		'so it cannot be placed this turn' );
	check( ( await evaluate( 'document.querySelectorAll("#roster-them .slot[data-state=cooling]").length' ) ) === 1,
		'the panel shows it cooling' );
	check( ( await evaluate( 'document.querySelector("#roster-them .cooldown")?.textContent' ) ) === '1',
		'with the number of turns left' );

	await evaluate( 'window.__move("light:knight","D4")' );
	await evaluate( 'window.__move("A2","A1")' );
	await sleep( 300 );

	state = await evaluate( 'window.__state()' );
	check( state.cooldowns.light[ 0 ] === 0, 'by their next turn it has cooled off' );
	check( ( await evaluate( 'window.__moves("light:pawn")' ) ).length > 0, 'and can be placed again' );

	await evaluate( 'window.__restart()' );
	await sleep( 200 );

	console.log( '\nreal pointer drag' );

	// The hooks above prove the state machine; this proves the gesture — pointer
	// capture, the raycast against the pieces, and the board-plane intersection.
	// A rook on B2 so the drag has somewhere legal to land.
	await evaluate( 'window.__move("dark:rook","B2")' );
	await evaluate( 'window.__move("light:pawn","D4")' );
	await sleep( 250 );

	const grab = await evaluate( 'window.__screen("B2")' );
	const drop = await evaluate( 'window.__screen("B4")' );

	const mouse = ( type, p, extra = {} ) => send( 'Input.dispatchMouseEvent', {
		type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
		clickCount: 1, pointerType: 'mouse', ...extra,
	} );

	await mouse( 'mousePressed', grab );
	await sleep( 60 );

	// mid-drag: picking a piece up selects it, so its destinations are marked
	const marked = await evaluate( 'window.__hints()' );
	check( marked.includes( 'B4' ), 'picking a piece up marks where it may go', marked.join( ' ' ) );

	await mouse( 'mouseMoved', { x: ( grab.x + drop.x ) / 2 | 0, y: ( grab.y + drop.y ) / 2 | 0 } );
	await sleep( 60 );
	await mouse( 'mouseMoved', drop );
	await sleep( 120 );
	await mouse( 'mouseReleased', drop );
	await sleep( 300 );

	let after = await evaluate( 'window.__squares()' );
	check( after.some( ( p ) => p.square === 'B4' ), 'dragged B2 -> B4 with a real pointer' );
	check( ! after.some( ( p ) => p.square === 'B2' ), 'and B2 is now empty' );

	// An illegal drop is refused by the rules and the piece goes home, rather than
	// being left wherever the pointer let go of it.
	await evaluate( 'window.__move("light:knight","A1")' ); // light's turn, out of the way
	await sleep( 200 );

	const from = await evaluate( 'window.__screen("B4")' );
	const bad = await evaluate( 'window.__screen("C3")' ); // a rook cannot move diagonally

	await mouse( 'mousePressed', from );
	await sleep( 60 );
	await mouse( 'mouseMoved', bad );
	await sleep( 120 );
	await mouse( 'mouseReleased', bad );
	await sleep( 300 );

	after = await evaluate( 'window.__squares()' );
	const home = after.find( ( p ) => p.type === 'rook' && p.tone === 'dark' );
	check( home?.square === 'B4', 'an illegal drop puts the piece back', String( home?.square ) );
	check( ! after.some( ( p ) => p.square === 'C3' ), 'and nothing landed on C3' );

	console.log( '\ndragging a piece out of the reserve' );

	await evaluate( 'window.__restart()' );
	await sleep( 250 );

	// A press on a reserve slot selects the piece; the drag itself is a real pointer
	// gesture from the panel button onto the canvas, which is the whole point of it.
	const slot = await evaluate( `(() => {
		const el = document.querySelector( '#roster-you .slot[data-ref="dark:rook"]' );
		const r = el.getBoundingClientRect();
		return { x: Math.round( r.left + r.width / 2 ), y: Math.round( r.top + r.height / 2 ), cursor: getComputedStyle( el ).cursor };
	})()` );

	check( slot.cursor === 'grab', 'a reserve slot reads as draggable', slot.cursor );

	const dropAt = await evaluate( 'window.__screen("C3")' );

	const drag = ( type, p, extra = {} ) => send( 'Input.dispatchMouseEvent', {
		type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
		clickCount: 1, pointerType: 'mouse', ...extra,
	} );

	await drag( 'mousePressed', slot );
	await sleep( 80 );

	let pressed = await evaluate( 'window.__state()' );
	check( pressed.selection === 'dark:rook', 'pressing it selects the piece', String( pressed.selection ) );
	check( ( await evaluate( 'window.__hints()' ) ).length === 16, 'and every free square is marked' );
	check( ( await evaluate( 'window.__squares()' ) ).length === 0, 'nothing is on the board yet' );

	await drag( 'mouseMoved', { x: ( slot.x + dropAt.x ) / 2 | 0, y: ( slot.y + dropAt.y ) / 2 | 0 } );
	await sleep( 80 );

	// mid-carry the piece is on screen without being in play
	check( ( await evaluate( 'window.__carried()' ) ) === 'dark-rook',
		'the piece lifts out of the panel and follows the pointer' );
	check( ( await evaluate( 'window.__state()' ) ).hands.dark[ 3 ] === 'rook',
		'while the rules still have it in the reserve' );

	await drag( 'mouseMoved', dropAt );
	await sleep( 100 );
	await drag( 'mouseReleased', dropAt );
	await sleep( 300 );

	let dropped = await evaluate( 'window.__squares()' );
	check( dropped.length === 1 && dropped[ 0 ].square === 'C3' && dropped[ 0 ].type === 'rook',
		'dropping it on C3 places it', JSON.stringify( dropped.map( ( p ) => p.square ) ) );
	check( ( await evaluate( 'window.__state()' ) ).hands.dark[ 3 ] === null,
		'and it has left the reserve' );
	check( ( await evaluate( 'window.__carried()' ) ) === null, 'nothing is being carried any more' );

	// Dropped somewhere it may not go — the topbar, off the board entirely — and it
	// goes back to the reserve rather than vanishing or landing anyway.
	const theirSlot = await evaluate( `(() => {
		const el = document.querySelector( '#roster-them .slot[data-ref="light:knight"]' );
		const r = el.getBoundingClientRect();
		return { x: Math.round( r.left + r.width / 2 ), y: Math.round( r.top + r.height / 2 ) };
	})()` );

	await drag( 'mousePressed', theirSlot );
	await sleep( 80 );
	await drag( 'mouseMoved', { x: 40, y: 20 } ); // the topbar
	await sleep( 100 );
	await drag( 'mouseReleased', { x: 40, y: 20 } );
	await sleep( 300 );

	const aborted = await evaluate( 'window.__state()' );
	check( aborted.hands.light[ 1 ] === 'knight', 'a drop off the board returns the piece to the reserve',
		String( aborted.hands.light ) );
	check( ( await evaluate( 'window.__squares()' ) ).length === 1, 'and nothing was placed' );
	check( aborted.selection === null, 'the selection is cleared' );
	check( ( await evaluate( 'window.__visible()' ) ).length === 1,
		'the carried piece is hidden again' );

	console.log( '\naiming a click' );

	// The aborted carry above left light to move, so light answers first and the dark
	// rook on C3 is selectable again.
	await evaluate( 'window.__move("light:pawn","A4")' );
	await sleep( 250 );
	await evaluate( 'window.__select("C3")' );

	// Hovering with a selection marks the square under the pointer before any click,
	// which is what makes clicking a board drawn in perspective aimable.
	const legal = await evaluate( 'window.__screen("C1")' ); // straight up the C file
	const illegal = await evaluate( 'window.__screen("B2")' ); // a rook cannot go there

	await drag( 'mouseMoved', legal, { buttons: 0 } );
	await sleep( 80 );
	let mark = await evaluate( 'window.__marker()' );
	check( mark?.visible && mark.square === 'C1' && mark.state === 'free',
		'hovering a reachable square marks it', JSON.stringify( mark ) );

	await drag( 'mouseMoved', illegal, { buttons: 0 } );
	await sleep( 80 );
	mark = await evaluate( 'window.__marker()' );
	check( mark?.visible && mark.square === 'B2' && mark.state === 'blocked',
		'and a square it cannot reach is marked refused', JSON.stringify( mark ) );

	// Clicking the marked square moves there.
	await drag( 'mouseMoved', legal, { buttons: 0 } );
	await sleep( 60 );
	await drag( 'mousePressed', legal );
	await sleep( 60 );
	await drag( 'mouseReleased', legal );
	await sleep( 300 );

	check( ( await evaluate( 'window.__squares()' ) ).some( ( p ) => p.square === 'C1' ),
		'clicking a marked square moves the piece' );

	// A capture is marked differently from an empty square, because taking a piece and
	// moving to a free square are different decisions.
	await evaluate( 'window.__select("light:bishop")' );
	await sleep( 60 );
	const onto = await evaluate( 'window.__screen("C1")' ); // the dark rook is there
	await drag( 'mouseMoved', onto, { buttons: 0 } );
	await sleep( 80 );
	mark = await evaluate( 'window.__marker()' );
	check( mark?.visible && mark.state === 'blocked',
		'a piece from the reserve cannot be placed onto an occupied square',
		JSON.stringify( mark ) );

	// Escape drops a selection — light is to move, so light's reserve is the live one.
	await evaluate( 'window.__select("light:knight")' );
	check( ( await evaluate( 'window.__hints()' ) ).length > 0, 'a reserve piece is selected' );

	await send( 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } );
	await send( 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } );
	await sleep( 150 );

	check( ( await evaluate( 'window.__state()' ) ).selection === null, 'escape clears the selection' );
	check( ( await evaluate( 'window.__hints()' ) ).length === 0, 'and the markers with it' );

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
