// The rules, checked in plain node — no browser, no WebGPU, no dev server.
//
//   node tools/check-rules.mjs
//
// `src/game.js` imports nothing, which is what makes this possible, and these are
// the same cases `internal/engine/engine_test.go` puts to the Go engine. If the two
// ever disagree, one of them is wrong and this is where it shows.
//
// Two rulesets are checked: the one being shipped, and the classic one it
// replaced, which is kept because it is what every variant has to beat.
import {
	CELLS, CLASSIC_RULES, DEFAULT_RULES, ENDINGS, HAND_SIZE, TYPES,
	allMoves, apply, canSwap, createGame, destinations, handCount, handRef,
	pieceAt, positionKey, swap, toAction, toPosition, winningLine,
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

/** Puts a piece straight onto a square, bypassing the drop rules a test is not about. */
function put( state, tone, type, square ) {

	const col = 'ABCD'.indexOf( square[ 0 ] );
	const row = '1234'.indexOf( square[ 1 ] );
	const slot = TYPES.indexOf( type );

	const piece = state.hands[ tone ][ slot ] ?? { id: `${tone}-${type}`, tone, type, cooldown: 0 };
	state.hands[ tone ][ slot ] = null;
	state.board[ row ][ col ] = piece;

	return piece;

}

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
	check( destinations( state, handRef( 'dark', 'knight' ) ).length === CELLS * CELLS,
		'the first piece may go anywhere' );
}

console.log( '\na drop may not be the move that completes a line' );
{
	const state = createGame();

	put( state, 'dark', 'pawn', 'A2' );
	put( state, 'dark', 'knight', 'B2' );

	const drops = destinations( state, handRef( 'dark', 'bishop' ) );

	check( ! drops.includes( 'C2' ), 'the square that would win is not offered', drops.join( ' ' ) );
	check( drops.length > 0, 'the rest of the board still is', `${drops.length} squares` );
	check( ! apply( state, handRef( 'dark', 'bishop' ), 'C2' ).ok, 'and the drop is refused if asked for' );

	// The same square, walked into by a piece already in play, is the win.
	put( state, 'dark', 'bishop', 'B1' );
	const result = must( state, 'B1', 'C2' );

	check( result.ok && state.over && state.winner === 'dark',
		'walking a piece in wins instead', `over ${state.over}, winner ${state.winner}` );
	check( state.ending === ENDINGS.won, 'and the ending says so', String( state.ending ) );
	check( winningLine( state, 'dark' )?.join( '' ) === 'A2B2C2', 'the line is reported',
		String( winningLine( state, 'dark' ) ) );
}

console.log( '\na drop must touch one of your own pieces' );
{
	const state = createGame();

	must( state, handRef( 'dark', 'rook' ), 'A1' );

	// light is unconstrained — it has nothing in play yet
	check( destinations( state, handRef( 'light', 'pawn' ) ).length === CELLS * CELLS - 1,
		'the other side is not constrained by your pieces' );

	must( state, handRef( 'light', 'pawn' ), 'D4' );

	const drops = destinations( state, handRef( 'dark', 'pawn' ) );

	check( [ 'A2', 'B1', 'B2' ].every( ( s ) => drops.includes( s ) ),
		'the squares around your rook are open', drops.join( ' ' ) );
	check( ! drops.includes( 'C3' ) && ! drops.includes( 'A4' ),
		'squares touching nothing of yours are not' );
}

console.log( '\na captured piece sits out a turn' );
{
	const state = createGame();

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'pawn' ), 'A2' );

	const result = must( state, 'A1', 'A2' ); // dark takes the pawn

	check( result.captured?.type === 'pawn', 'the pawn is captured' );

	const pawn = pieceAt( state, handRef( 'light', 'pawn' ) );
	check( pawn !== null, 'and is back in light’s reserve' );
	check( pawn.cooldown === DEFAULT_RULES.captureCooldown, 'carrying a cooldown',
		`cooldown ${pawn?.cooldown}` );
	check( destinations( state, handRef( 'light', 'pawn' ) ).length === 0,
		'so it cannot be placed on the turn it was taken' );

	must( state, handRef( 'light', 'knight' ), 'D4' ); // light does something else
	must( state, 'A2', 'A1' );                          // dark marks time

	check( pieceAt( state, handRef( 'light', 'pawn' ) ).cooldown === 0,
		'by light’s next turn it has cooled off' );
	check( destinations( state, handRef( 'light', 'pawn' ) ).length > 0,
		'and can be placed again' );
	check( census( state ) === 2 * HAND_SIZE, 'no piece was destroyed', `${census( state )}` );
}

console.log( '\nthe second player may take the first player’s position' );
{
	const state = createGame();

	check( ! canSwap( state ), 'the pie rule is not open before anyone has moved' );

	must( state, handRef( 'dark', 'rook' ), 'B2' );

	check( canSwap( state ), 'it is open on the second player’s first turn' );
	check( state.turn === 'light', 'and it is theirs to take', state.turn );

	const result = swap( state );

	check( result.ok, 'the swap goes through', result.reason ?? '' );
	check( pieceAt( state, 'B2' )?.tone === 'light', 'the rook on B2 changed hands',
		String( pieceAt( state, 'B2' )?.tone ) );
	check( handCount( state, 'dark' ) === HAND_SIZE, 'dark has its whole reserve back',
		`${handCount( state, 'dark' )}` );
	check( handCount( state, 'light' ) === HAND_SIZE - 1, 'and light is a piece down',
		`${handCount( state, 'light' )}` );
	check( state.turn === 'dark', 'dark is to move, now as the second player', state.turn );
	check( ! canSwap( state ), 'and the rule has closed' );
	check( ! swap( state ).ok, 'a second swap is refused' );
	check( census( state ) === 2 * HAND_SIZE, 'still eight pieces', `${census( state )}` );

	// The swapped reserve is still usable — ids and tones have to line up or the
	// board and the panel drift apart.
	check( state.hands.dark.every( ( p ) => p === null || ( p.tone === 'dark' && p.id === `dark-${p.type}` ) ),
		'the reserves are internally consistent after the swap' );
	check( destinations( state, handRef( 'dark', 'pawn' ) ).length > 0,
		'and dark can still place a piece' );
}

console.log( '\na game nobody is winning ends' );
{
	const state = createGame( { ...DEFAULT_RULES, swapRule: false, repetitionLimit: 3 } );

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'rook' ), 'D4' );

	// both shuffle back and forth
	for ( let i = 0; i < 12 && ! state.over; i ++ ) {

		if ( ! apply( state, 'A1', 'A2' ).ok ) break;
		if ( state.over ) break;
		if ( ! apply( state, 'D4', 'D3' ).ok ) break;
		if ( state.over ) break;
		if ( ! apply( state, 'A2', 'A1' ).ok ) break;
		if ( state.over ) break;
		if ( ! apply( state, 'D3', 'D4' ).ok ) break;

	}

	check( state.over, 'shuffling forever is declared a draw' );
	check( state.winner === null, 'with no winner', String( state.winner ) );
	check( state.ending === ENDINGS.repetition, 'by repetition', String( state.ending ) );
}

{
	const state = createGame( { ...DEFAULT_RULES, swapRule: false, repetitionLimit: 0, maxPlies: 6 } );

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'rook' ), 'D4' );
	must( state, 'A1', 'A2' );
	must( state, 'D4', 'D3' );
	must( state, 'A2', 'A1' );
	must( state, 'D3', 'D4' );

	check( state.over && state.ending === ENDINGS.length, 'the ply cap ends it too',
		`over ${state.over}, ending ${state.ending}` );
	check( state.moveNo === 6, 'after exactly the cap', `${state.moveNo}` );
}

console.log( '\nthe classic ruleset it replaced' );
{
	const state = createGame( CLASSIC_RULES );

	check( destinations( state, handRef( 'dark', 'knight' ) ).length === 16,
		'a piece in hand may go on any empty square' );

	must( state, handRef( 'dark', 'knight' ), 'B3' );

	check( destinations( state, handRef( 'light', 'pawn' ) ).length === 15,
		'and the other side sees fifteen squares left' );
	check( ! canSwap( state ), 'there is no pie rule' );

	// four in a line, by dropping, which the classic rules allow
	const line = createGame( CLASSIC_RULES );
	TYPES.forEach( ( type, i ) => {

		if ( line.over ) return;
		must( line, handRef( 'dark', type ), `${'ABCD'[ i ]}2` );
		if ( ! line.over ) must( line, handRef( 'light', type ), `${'ABCD'[ i ]}4` );

	} );

	check( line.over && line.winner === 'dark', 'four in a row wins',
		`over ${line.over}, winner ${line.winner}` );
	check( winningLine( line, 'dark' )?.length === 4, 'and the line is four long' );
}

console.log( '\nhow the pieces move' );
{
	const state = createGame( CLASSIC_RULES );

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'bishop' ), 'A3' );
	must( state, handRef( 'dark', 'pawn' ), 'C1' );
	must( state, handRef( 'light', 'pawn' ), 'D4' );

	const rook = destinations( state, 'A1' );

	check( rook.includes( 'A2' ) && rook.includes( 'A3' ), 'a rook slides up to an enemy and takes it',
		rook.join( ' ' ) );
	check( ! rook.includes( 'A4' ), 'and stops there' );
	check( ! rook.includes( 'C1' ) && ! rook.includes( 'D1' ), 'not onto or past its own pawn' );

	const pawn = destinations( state, 'C1' );
	check( pawn.length === 3 && pawn.every( ( s ) => [ 'B1', 'D1', 'C2' ].includes( s ) ),
		'a pawn steps one square orthogonally', pawn.join( ' ' ) );

	const knight = createGame( CLASSIC_RULES );
	must( knight, handRef( 'dark', 'knight' ), 'B2' );
	must( knight, handRef( 'light', 'pawn' ), 'A1' );
	const jumps = destinations( knight, 'B2' ).sort().join( ' ' );
	check( jumps === 'A4 C4 D1 D3', 'a knight jumps in an L', jumps );
}

console.log( '\nillegal moves change nothing' );
{
	const state = createGame( CLASSIC_RULES );

	must( state, handRef( 'dark', 'rook' ), 'A1' );
	must( state, handRef( 'light', 'rook' ), 'D4' );
	must( state, handRef( 'dark', 'pawn' ), 'C1' );
	must( state, handRef( 'light', 'pawn' ), 'A4' );

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

	const before = positionKey( state );

	for ( const [ from, to, what ] of cases ) {

		const result = apply( state, from, to );
		check( ! result.ok, `refused: ${what}`, result.reason ?? 'was allowed' );

	}

	check( positionKey( state ) === before, 'and the game is untouched' );
}

console.log( '\nthe protocol the Go engine speaks' );
{
	check( JSON.stringify( toPosition( 'B3' ) ) === '{"row":2,"col":1}', 'B3 is row 2, col 1' );
	check( toPosition( handRef( 'dark', 'knight' ) ).col === - 2, 'a dark hand slot is column -2' );
	check( toPosition( handRef( 'light', 'knight' ) ).col === - 1, 'a light hand slot is column -1' );

	const action = toAction( 'execute', handRef( 'dark', 'knight' ), 'B3' );
	check( action.actionType === 'execute' && action.move.destination.row === 2,
		'an action encodes as the engine decodes it', JSON.stringify( action ) );
	check( toAction( 'swap' ).actionType === 'swap', 'and so does the swap' );
}

console.log( '\nno legal action loses' );
{
	const state = createGame();
	state.hands.light = Array( HAND_SIZE ).fill( null );

	check( allMoves( state, 'light' ).length === 0,
		'a side with nothing on the board and nothing in hand has no moves' );
}

console.log( fail === 0 ? '\nall rules checks passed' : `\n${fail} failure(s)` );
process.exit( fail === 0 ? 0 : 1 );
