// The rules, checked in plain node — no browser, no WebGPU, no dev server.
//
//   node tools/check-rules.mjs
//
// `src/game.js` imports nothing, which is what makes this possible, and these are
// the same cases `internal/engine/engine_test.go` puts to the Go engine. If the two
// ever disagree, one of them is wrong and this is where it shows.
import {
	CELLS, HAND_SIZE, TYPES, WIN_LENGTH,
	allMoves, apply, createGame, destinations, handCount, handRef,
	pieceAt, toAction, toPosition, winningLine,
} from '../src/game.js';

let fail = 0;

const check = ( ok, label, detail = '' ) => {

	console.log( `  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}` );
	if ( ! ok ) fail ++;

};

/** Applies a move that is supposed to be legal, and complains loudly if it is not. */
function must( state, from, to ) {

	const result = apply( state, from, to );
	if ( ! result.ok ) throw new Error( `${from} -> ${to} was refused: ${result.reason}` );
	return result;

}

/** Counts every piece, wherever it is. Should be 8, always. */
const census = ( state ) =>
	handCount( state, 'light' ) + handCount( state, 'dark' ) +
	state.board.flat().filter( Boolean ).length;

console.log( '\nopening position' );
{
	const state = createGame();

	check( state.board.flat().every( ( cell ) => cell === null ), 'the board starts empty' );
	check( handCount( state, 'dark' ) === HAND_SIZE && handCount( state, 'light' ) === HAND_SIZE,
		`both sides start with ${HAND_SIZE} in hand`,
		`dark ${handCount( state, 'dark' )}, light ${handCount( state, 'light' )}` );
	check( census( state ) === 2 * HAND_SIZE, 'eight pieces exist', `${census( state )}` );
	check( TYPES.every( ( type, slot ) => state.hands.dark[ slot ].type === type ),
		'a hand slot is its own piece type' );
	check( ! state.over && state.winner === null, 'and the game is not over' );
}

console.log( '\nplacing from the hand' );
{
	const state = createGame();
	const knight = handRef( 'dark', 'knight' );

	check( destinations( state, knight ).length === CELLS * CELLS,
		'a piece in hand may go on any empty square',
		`${destinations( state, knight ).length}` );
	check( destinations( state, handRef( 'light', 'knight' ) ).length === 0,
		'but not out of the other side’s hand' );

	must( state, knight, 'B3' );

	check( pieceAt( state, 'B3' )?.type === 'knight', 'the knight is on B3' );
	check( pieceAt( state, knight ) === null, 'and no longer in hand' );
	check( handCount( state, 'dark' ) === HAND_SIZE - 1, 'the reserve is down to three',
		`${handCount( state, 'dark' )}` );
	check( destinations( state, knight ).length === 0, 'an empty hand slot offers nothing' );
	check( state.turn === 'light', 'placing passes the turn', state.turn );
	check( destinations( state, handRef( 'light', 'pawn' ) ).length === CELLS * CELLS - 1,
		'and the other side sees fifteen squares left' );
}

console.log( '\nhow the pieces move' );
{
	const state = createGame();

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'bishop' ), 'A3' );
	must( state, handRef( 'dark', 'pawn' ), 'C1' );
	must( state, handRef( 'light', 'pawn' ), 'D4' );

	// dark's turn: the rook on A1 runs up the A file into the light bishop on A3,
	// and along rank 1 into its own pawn on C1.
	const rook = destinations( state, 'A1' );

	check( rook.includes( 'A2' ) && rook.includes( 'A3' ), 'a rook slides up to an enemy and takes it',
		rook.join( ' ' ) );
	check( ! rook.includes( 'A4' ), 'and stops there' );
	check( rook.includes( 'B1' ), 'it slides along the rank' );
	check( ! rook.includes( 'C1' ) && ! rook.includes( 'D1' ), 'but not onto or past its own pawn' );

	check( destinations( state, 'A3' ).length === 0, 'the other side’s piece cannot be moved' );
	check( destinations( state, 'B2' ).length === 0, 'nor an empty square' );

	// The pawn is directionless, so it steps one square any of the four ways.
	const pawn = destinations( state, 'C1' );
	check( pawn.length === 3 && pawn.every( ( s ) => [ 'B1', 'D1', 'C2' ].includes( s ) ),
		'a pawn steps one square orthogonally', pawn.join( ' ' ) );

	const knight = createGame();
	must( knight, handRef( 'dark', 'knight' ), 'B2' );
	must( knight, handRef( 'light', 'pawn' ), 'A1' ); // out of the way, and hands the turn back
	const jumps = destinations( knight, 'B2' ).sort().join( ' ' );
	check( jumps === 'A4 C4 D1 D3', 'a knight jumps in an L', jumps );
}

console.log( '\ncapture puts the piece back in its owner’s hand' );
{
	const state = createGame();

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'bishop' ), 'A3' );

	const result = must( state, 'A1', 'A3' );

	check( result.captured?.type === 'bishop' && result.captured.tone === 'light',
		'the light bishop is captured' );
	check( pieceAt( state, handRef( 'light', 'bishop' ) )?.type === 'bishop',
		'and is back in light’s hand, in its own slot' );
	check( pieceAt( state, 'A3' )?.tone === 'dark', 'the rook holds A3' );
	check( census( state ) === 2 * HAND_SIZE, 'no piece was destroyed', `${census( state )}` );
	check( destinations( state, handRef( 'light', 'bishop' ) ).length > 0,
		'the captured bishop can be placed again' );
	check( state.history[ 0 ].captured?.type === 'bishop', 'the capture is in the history' );
}

console.log( '\nillegal moves change nothing' );
{
	const state = createGame();

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'rook' ), 'D4' );
	must( state, handRef( 'dark', 'pawn' ), 'C1' ); // dark's own piece, in its rook's way
	must( state, handRef( 'light', 'pawn' ), 'A4' ); // out of the way, and hands the turn back

	// dark to move, so every refusal below is the rule it names rather than the turn.
	const cases = [
		[ 'B2', 'B3', 'from an empty square' ],
		[ 'D4', 'D3', 'the other side’s piece' ],
		[ 'A1', 'B2', 'a rook moving diagonally' ],
		[ 'A1', 'C1', 'onto your own piece' ],
		[ 'A1', 'D1', 'past your own piece' ],
		[ 'A1', 'Z9', 'off the board' ],
		[ 'A1', 'A1', 'onto itself' ],
		[ handRef( 'light', 'pawn' ), 'B2', 'out of the other side’s hand' ],
		[ handRef( 'dark', 'rook' ), 'B2', 'out of an empty hand slot' ],
	];

	const before = JSON.stringify( state );

	for ( const [ from, to, what ] of cases ) {

		const result = apply( state, from, to );
		check( ! result.ok, `refused: ${what}`, result.reason ?? 'was allowed' );

	}

	check( JSON.stringify( state ) === before, 'and the game is untouched' );
}

console.log( '\nwinning' );
{
	const state = createGame();

	// dark fills rank 2 while light stays out of the way on rank 4.
	TYPES.forEach( ( type, i ) => {

		if ( state.over ) return;

		must( state, handRef( 'dark', type ), `${'ABCD'[ i ]}2` );
		if ( ! state.over ) must( state, handRef( 'light', type ), `${'ABCD'[ i ]}4` );

	} );

	check( state.over && state.winner === 'dark', `${WIN_LENGTH} in a row wins`,
		`over ${state.over}, winner ${state.winner}` );
	check( winningLine( state, 'dark' )?.join( '' ) === 'A2B2C2D2', 'and the line is reported',
		String( winningLine( state, 'dark' ) ) );
	check( ! apply( state, 'A2', 'A1' ).ok, 'a move after the game ends is refused' );
	check( destinations( state, 'A2' ).length === 0, 'and nothing is selectable' );
}

{
	const state = createGame();

	// A diagonal, and one short of it first.
	must( state, handRef( 'dark', 'pawn' ), 'A1' );
	must( state, handRef( 'light', 'pawn' ), 'D1' );
	must( state, handRef( 'dark', 'knight' ), 'B2' );
	must( state, handRef( 'light', 'knight' ), 'D2' );
	must( state, handRef( 'dark', 'bishop' ), 'C3' );

	check( ! state.over, `${WIN_LENGTH - 1} in a line does not win` );

	must( state, handRef( 'light', 'bishop' ), 'D3' );
	must( state, handRef( 'dark', 'rook' ), 'D4' );

	check( state.over && state.winner === 'dark', 'the diagonal wins' );
}

console.log( '\nthe protocol the Go engine speaks' );
{
	check( JSON.stringify( toPosition( 'B3' ) ) === '{"row":2,"col":1}', 'B3 is row 2, col 1' );
	check( toPosition( handRef( 'dark', 'knight' ) ).col === - 2,
		'a dark hand slot reports column -2' );
	check( toPosition( handRef( 'light', 'knight' ) ).col === - 1,
		'a light hand slot reports column -1' );
	check( toPosition( handRef( 'dark', 'rook' ) ).row === TYPES.indexOf( 'rook' ),
		'and the slot index is the piece type' );

	const action = toAction( 'execute', handRef( 'dark', 'knight' ), 'B3' );
	check( action.actionType === 'execute' && action.move.destination.row === 2,
		'an action encodes as the engine decodes it', JSON.stringify( action ) );
}

console.log( '\nthe draw' );
{
	// Not reachable in a real game as far as anyone has shown, so this only checks
	// that a player with nothing to do is detected rather than left stuck.
	const state = createGame();
	state.hands.light = Array( HAND_SIZE ).fill( null );
	check( allMoves( state, 'light' ).length === 0, 'a side with nothing on the board and nothing in hand has no moves' );
}

console.log( fail === 0 ? '\nall rules checks passed' : `\n${fail} failure(s)` );
process.exit( fail === 0 ? 0 : 1 );
