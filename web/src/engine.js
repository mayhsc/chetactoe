/**
 * The game engine, running in the browser.
 *
 * This is the Go engine in `internal/engine`, compiled to WebAssembly — not a
 * copy of it. That is the whole point: the rules used to live twice, once in Go
 * and once in a JavaScript mirror kept in step by hand, and a rule fixed in one
 * was a rule still wrong in the other. Now there is one implementation, and the
 * browser talks to it the same way the terminal client does: actions in,
 * snapshots out.
 *
 * `cmd/wasm` exposes a single global, `StartGame( mode, onSnapshot )`, which
 * returns an object with `sendAction`. Everything below is a thin, typed skin
 * over that — plus the mapping between the engine's integers and the names the
 * rest of the client uses, which is the one place the two vocabularies meet.
 */

const WASM_URL = '/chetactoe.wasm';
const RUNTIME_URL = '/wasm_exec.js';

/** The engine's piece types and players, in their numeric order. */
export const TYPES = [ 'pawn', 'knight', 'bishop', 'rook' ];
export const TONES = [ 'light', 'dark' ]; // white, black

/** Action types, matching the iota order in internal/engine/types.go. */
const EXECUTE = 0;
const SELECT = 1;
const CANCEL = 2;
const SWAP = 3;

export const toneOf = ( player ) => TONES[ player ] ?? 'light';
export const playerOf = ( tone ) => ( tone === 'dark' ? 1 : 0 );
export const typeOf = ( pieceType ) => TYPES[ pieceType ] ?? 'pawn';

const FILES = [ 'A', 'B', 'C', 'D' ];
const RANKS = [ '1', '2', '3', '4' ];

export const squareName = ( col, row ) => `${FILES[ col ]}${RANKS[ row ]}`;

export function parseSquare( square ) {

	return { col: FILES.indexOf( square[ 0 ]?.toUpperCase() ), row: RANKS.indexOf( square[ 1 ] ) };

}

/** The hand slot a piece of this type lives in — `dark:knight`. */
export const handRef = ( tone, type ) => `${tone}:${type}`;
export const isHandRef = ( ref ) => typeof ref === 'string' && ref.includes( ':' );

export function parseHandRef( ref ) {

	const [ tone, type ] = ref.split( ':' );
	return { tone, type, slot: TYPES.indexOf( type ) };

}

/**
 * A reference — `B3` or `dark:knight` — as the engine's Position. A hand is a
 * negative column: -1 for white, -2 for black, with the row as the slot.
 */
export function toPosition( ref ) {

	if ( isHandRef( ref ) ) {

		const { tone, slot } = parseHandRef( ref );
		return { row: slot, col: tone === 'dark' ? - 2 : - 1 };

	}

	const { col, row } = parseSquare( ref );
	return { row, col };

}

/** And back again. */
export function fromPosition( position ) {

	if ( position.col < 0 ) return handRef( position.col === - 2 ? 'dark' : 'light', TYPES[ position.row ] );

	return squareName( position.col, position.row );

}

// ------------------------------------------------------------------- the runtime

/*
 * Kept on globalThis rather than in module scope, because module scope is not as
 * global as it looks: a hot reload re-imports this file, which would start a
 * second Go instance over the top of the first. The symptom is baffling —
 * "Go program has already exited" thrown by a handle that was working a moment
 * ago — so the runtime is pinned somewhere a reload cannot reset.
 */
const RUNTIME_KEY = '__chetactoeRuntime';

/**
 * Loads Go's WebAssembly runtime and starts the engine binary.
 *
 * `wasm_exec.js` is Go's own glue and it is a classic script that assigns a
 * global, so it is loaded with a tag rather than imported — bundling it would
 * mean patching it, and it ships with the toolchain for a reason.
 */
function loadRuntime() {

	if ( globalThis[ RUNTIME_KEY ] ) return globalThis[ RUNTIME_KEY ];

	globalThis[ RUNTIME_KEY ] = new Promise( ( resolve, reject ) => {

		const script = document.createElement( 'script' );
		script.src = RUNTIME_URL;
		script.onerror = () => reject( new Error( `could not load ${RUNTIME_URL}` ) );
		script.onload = async () => {

			try {

				const go = new globalThis.Go();
				const { instance } = await WebAssembly.instantiateStreaming( fetch( WASM_URL ), go.importObject );

				// go.run resolves only when main returns, and main blocks on an empty
				// select forever so the exported functions stay callable. So it is
				// deliberately not awaited; what is awaited is the global appearing.
				go.run( instance );

				if ( typeof globalThis.StartGame !== 'function' ) {

					throw new Error( 'the engine did not export StartGame' );

				}

				resolve();

			} catch ( error ) {

				reject( error );

			}

		};

		document.head.append( script );

	} );

	return globalThis[ RUNTIME_KEY ];

}

/**
 * Starts a game and returns a handle.
 *
 * `mode` is `local`, `bot-white` or `bot-black` — the bot lives in the engine
 * too, so the client does not have to know how it thinks.
 *
 * Snapshots arrive through `onSnapshot`, including the opening position, so the
 * client never builds a board of its own: it draws what it is told.
 */
export async function startGame( { mode = 'local', onSnapshot } = {} ) {

	await loadRuntime();

	const handle = globalThis.StartGame( mode, ( json ) => onSnapshot?.( decode( JSON.parse( json ) ) ) );

	if ( handle?.error ) throw new Error( handle.error );

	const send = ( actionType, source, destination ) => handle.sendAction( {
		actionType,
		move: {
			source: source ? toPosition( source ) : { row: 0, col: 0 },
			destination: destination ? toPosition( destination ) : { row: 0, col: 0 },
		},
	} );

	return {
		/** Ask where a piece may go. Changes nothing. */
		select: ( ref ) => send( SELECT, ref ),

		/** Play a move. Refused moves come back as an unchanged snapshot. */
		execute: ( from, to ) => send( EXECUTE, from, to ),

		/** Drop the current selection. */
		cancel: () => send( CANCEL ),

		/** The pie rule, open on exactly one turn. */
		swap: () => send( SWAP ),
	};

}

/**
 * Turns a snapshot into the vocabulary the rest of the client speaks: tones and
 * type names instead of integers, square names instead of row/col pairs.
 *
 * Doing it here, once, is what keeps the integers from leaking into the drawing
 * code — and it is the only place that has to change if the engine renumbers
 * anything.
 */
function decode( snap ) {

	const piece = ( p ) => ( p === null || p === undefined ? null : {
		id: `${toneOf( p.player )}-${typeOf( p.pieceType )}`,
		tone: toneOf( p.player ),
		type: typeOf( p.pieceType ),
		cooldown: p.cooldown ?? 0,
		square: p.position.col < 0 ? null : squareName( p.position.col, p.position.row ),
	} );

	const board = {};

	snap.board.forEach( ( row, r ) => row.forEach( ( p, c ) => {

		if ( p ) board[ squareName( c, r ) ] = piece( p );

	} ) );

	return {
		board, // { B3: piece } — only the squares that hold something
		hands: {
			light: snap.whiteHand.map( piece ),
			dark: snap.blackHand.map( piece ),
		},
		turn: toneOf( snap.currentPlayer ),
		selection: snap.source ? fromPosition( snap.source ) : null,
		validMoves: ( snap.validMoves ?? [] ).map( ( p ) => squareName( p.col, p.row ) ),
		winner: snap.winner === null || snap.winner === undefined ? null : toneOf( snap.winner ),
		winningLine: ( snap.winningLine ?? [] ).map( ( p ) => squareName( p.col, p.row ) ),
		lastMove: snap.lastMove ? {
			from: fromPosition( snap.lastMove.source ),
			to: fromPosition( snap.lastMove.destination ),
			tone: snap.lastMover === null || snap.lastMover === undefined ? null : toneOf( snap.lastMover ),
			captured: piece( snap.captured ),
		} : null,
		over: snap.isOver === true,
		ending: snap.ending ?? null,
		canSwap: snap.canSwap === true,
		swapped: snap.swapped === true,
		moveNo: snap.moveNo ?? 0,
		rules: snap.rules ?? {},
	};

}
