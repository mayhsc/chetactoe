/**
 * The rules, in one file with no dependencies — not on three.js, not on the DOM.
 * `tools/check-rules.mjs` runs it in plain node, and the shell in `app.js` is the
 * only thing that knows it is being drawn.
 *
 * This mirrors `internal/engine` in the Go module, deliberately and line for line
 * where it can: the same four piece types, the same hand of four, the same
 * "captured pieces go back to their owner's hand", the same win length, and the
 * same select / execute / cancel protocol. Wiring the client to the Go engine
 * over a socket then means replacing `apply()` with a send and `state` with the
 * snapshot that comes back, not rewriting the shell. `toAction()` at the bottom
 * spells that mapping out.
 *
 * Two names, one thing: the engine says white / black, the board's timbers are
 * light / dark. `toneOf()` and `playerOf()` are the only places the two meet.
 */

export const TYPES = [ 'pawn', 'knight', 'bishop', 'rook' ];
export const TONES = [ 'light', 'dark' ];

export const CELLS = 4;
export const HAND_SIZE = 4;

/**
 * The ruleset, mirroring `RuleSet` in internal/engine — data rather than
 * constants, because these had to be measured before they could be chosen.
 *
 * Self-play said the original design could not finish a game: four in a line
 * takes four turns to build and one capture to undo, so 58% of games between
 * competent players were still going after 150 moves each. It also said the
 * obvious fix on its own — three in a line — is a race the first player wins
 * 92% of the time. What fixed it was restricting where a piece may be dropped.
 */
export const DEFAULT_RULES = {
	winLength: 3,

	// A placement may not be the move that completes a line: it has to be
	// finished by moving a piece already in play, so it is visible a turn ahead.
	noWinByDrop: true,

	// A placement must touch a piece you already have in play, so the reserve
	// builds a position instead of parachuting into one.
	dropMustTouchOwn: true,

	// Turns a captured piece must sit out before it can be placed again.
	captureCooldown: 1,

	// The pie rule: the second player, on their first turn, may take the first
	// player's position instead of replying to it. Nothing else fixed the first
	// move being worth around 65% of decisive games, and this needs no guess at
	// the right compensation — an opening strong enough to be worth taking is one
	// the opener stops making.
	swapRule: true,

	// Endings for a game nobody is winning. Without these the game has no draw
	// it can reach at all.
	maxPlies: 200,
	repetitionLimit: 3,
};

/** The original design, kept because it is what every variant has to beat. */
export const CLASSIC_RULES = {
	winLength: 4,
	noWinByDrop: false,
	dropMustTouchOwn: false,
	captureCooldown: 0,
	swapRule: false,
	maxPlies: 200,
	repetitionLimit: 3,
};

/** Why a finished game finished. */
export const ENDINGS = {
	won: 'won',
	repetition: 'repetition',
	length: 'length',
	noMove: 'no-move',
};

/**
 * Who opens. The engine's White moves first and White is the light timber, but
 * the shell hands the dark set to the local player, so the local game opens with
 * dark. Nothing else depends on it: over a socket the client draws whichever
 * player the snapshot names.
 */
export const FIRST = 'dark';

const FILES = [ 'A', 'B', 'C', 'D' ];
const RANKS = [ '1', '2', '3', '4' ];

const KNIGHT_STEPS = [ [ 1, 2 ], [ 2, 1 ], [ - 1, 2 ], [ - 2, 1 ], [ 1, - 2 ], [ 2, - 1 ], [ - 1, - 2 ], [ - 2, - 1 ] ];
const ORTHOGONAL = [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ];
const DIAGONAL = [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ];

// ------------------------------------------------------------------ references
//
// One string addresses both places a piece can be: "B3" is a square, "dark:knight"
// is a hand slot. It is the client-side spelling of the engine's Position, where a
// negative column means "in hand" — same idea, one type for both, so a selection
// does not need to say which kind of thing it selected.

/** The hand slot a piece of this type lives in — `dark:knight`. */
export const handRef = ( tone, type ) => `${tone}:${type}`;

export const isHandRef = ( ref ) => typeof ref === 'string' && ref.includes( ':' );

/** `dark:knight` -> { tone: 'dark', type: 'knight', slot: 1 } */
export function parseHandRef( ref ) {

	const [ tone, type ] = ref.split( ':' );
	return { tone, type, slot: TYPES.indexOf( type ) };

}

/** `B3` -> { col: 1, row: 2 } */
export function parseSquare( square ) {

	return { col: FILES.indexOf( square[ 0 ]?.toUpperCase() ), row: RANKS.indexOf( square[ 1 ] ) };

}

/** { col: 1, row: 2 } -> `B3` */
export const squareName = ( col, row ) => `${FILES[ col ]}${RANKS[ row ]}`;

const onBoard = ( col, row ) => col >= 0 && col < CELLS && row >= 0 && row < CELLS;

const isSquare = ( ref ) => {

	if ( typeof ref !== 'string' || isHandRef( ref ) ) return false;
	const { col, row } = parseSquare( ref );
	return onBoard( col, row );

};

export const other = ( tone ) => ( tone === 'dark' ? 'light' : 'dark' );

// ------------------------------------------------------------------ the state

/**
 * The opening position: an empty board, and every piece — four each — in its
 * owner's hand. A piece's id is its tone and type, which is unique because each
 * player owns exactly one of each; that is also what makes a hand slot a fixed
 * place rather than a list that shuffles up when a piece leaves it.
 */
export function createGame( rules = DEFAULT_RULES ) {

	const state = {
		rules,
		board: Array.from( { length: CELLS }, () => Array( CELLS ).fill( null ) ),
		hands: { light: Array( HAND_SIZE ).fill( null ), dark: Array( HAND_SIZE ).fill( null ) },
		turn: FIRST,
		moveNo: 0,
		over: false,
		winner: null, // a tone, or null; null with over === true is a draw
		ending: null,
		history: [],
		// how often each position has come up, so a game nobody is winning ends
		seen: {},
	};

	for ( const tone of TONES ) {

		TYPES.forEach( ( type, slot ) => {

			// cooldown: turns this piece must still wait before it can be placed.
			state.hands[ tone ][ slot ] = { id: `${tone}-${type}`, tone, type, cooldown: 0 };

		} );

	}

	state.seen[ positionKey( state ) ] = 1;

	return state;

}

/**
 * What stands where, what is waiting in each hand, and whose turn it is. Two
 * positions with the same key offer the same game, so seeing one three times
 * means neither side is making progress.
 */
export function positionKey( state ) {

	const board = state.board
		.map( ( row ) => row.map( ( p ) => ( p ? `${p.tone[ 0 ]}${p.type[ 0 ]}` : '..' ) ).join( '' ) )
		.join( '' );

	const hands = TONES
		.map( ( tone ) => state.hands[ tone ].map( ( p ) => ( p ? p.cooldown : '.' ) ).join( '' ) )
		.join( '|' );

	return `${board}|${hands}|${state.turn}`;

}

/** Puts an existing game back to the opening position, in place. */
export function reset( state, rules = state.rules ?? DEFAULT_RULES ) {

	for ( const key of Object.keys( state ) ) delete state[ key ];

	Object.assign( state, createGame( rules ) );

	return state;

}

export function pieceAt( state, ref ) {

	if ( isHandRef( ref ) ) {

		const { tone, slot } = parseHandRef( ref );
		return state.hands[ tone ]?.[ slot ] ?? null;

	}

	if ( ! isSquare( ref ) ) return null;

	const { col, row } = parseSquare( ref );
	return state.board[ row ][ col ];

}

/** Every square with nothing on it — and so every square a piece may be placed on. */
export function emptySquares( state ) {

	const squares = [];

	for ( let row = 0; row < CELLS; row ++ ) {

		for ( let col = 0; col < CELLS; col ++ ) {

			if ( state.board[ row ][ col ] === null ) squares.push( squareName( col, row ) );

		}

	}

	return squares;

}

export const handCount = ( state, tone ) => state.hands[ tone ].filter( Boolean ).length;

// ------------------------------------------------------------------ the moves

/**
 * Where the piece named by `ref` may go, as square names.
 *
 * Empty for anything the player to move may not touch — an empty square, the
 * other side's piece, the other side's hand, an empty hand slot, or any of them
 * once the game is over. So "may I pick this up" is `destinations().length > 0`
 * and there is only one rule to keep in step.
 *
 * `tone` defaults to the player to move; the draw check passes the other one to
 * ask whether they would have anything to do.
 */
export function destinations( state, ref, tone = state.turn ) {

	if ( state.over ) return [];

	const piece = pieceAt( state, ref );
	if ( ! piece || piece.tone !== tone ) return [];

	// A piece in hand has no moves of its own: it may be placed, subject to
	// whatever the ruleset takes away.
	if ( isHandRef( ref ) ) {

		if ( piece.cooldown > 0 ) return []; // still sitting out the turn it was taken on
		return placements( state, piece, tone );

	}

	const { col, row } = parseSquare( ref );

	switch ( piece.type ) {

		case 'pawn': return steps( state, piece, col, row, ORTHOGONAL );
		case 'knight': return steps( state, piece, col, row, KNIGHT_STEPS );
		case 'bishop': return slides( state, piece, col, row, DIAGONAL );
		case 'rook': return slides( state, piece, col, row, ORTHOGONAL );
		default: return [];

	}

}

/**
 * Where a piece from the hand may go: any empty square, less what the rules take
 * away — a square that would complete a line, and any square not touching a piece
 * the player already has in play. Those two restrictions are what stop the game
 * being a race to drop pieces in a row, which is what it measured as without them.
 */
export function placements( state, piece, tone ) {

	const { noWinByDrop, dropMustTouchOwn } = state.rules;
	const mustTouch = dropMustTouchOwn && hasPieces( state, tone );

	return emptySquares( state ).filter( ( square ) => {

		if ( mustTouch && ! touches( state, tone, square ) ) return false;
		if ( noWinByDrop && dropWouldWin( state, piece, square, tone ) ) return false;

		return true;

	} );

}

const hasPieces = ( state, tone ) => state.board.flat().some( ( p ) => p?.tone === tone );

/** Whether a square is next to one of the tone's own pieces, diagonals included. */
function touches( state, tone, square ) {

	const { col, row } = parseSquare( square );

	for ( let dr = - 1; dr <= 1; dr ++ ) {

		for ( let dc = - 1; dc <= 1; dc ++ ) {

			if ( dr === 0 && dc === 0 ) continue;
			if ( ! onBoard( col + dc, row + dr ) ) continue;
			if ( state.board[ row + dr ][ col + dc ]?.tone === tone ) return true;

		}

	}

	return false;

}

/**
 * Whether dropping here finishes a line — asked by putting the piece down and
 * taking it straight back off, so it cannot disagree with the real win check.
 */
function dropWouldWin( state, piece, square, tone ) {

	const { col, row } = parseSquare( square );

	state.board[ row ][ col ] = piece;
	const won = lineFrom( state, tone ) !== null;
	state.board[ row ][ col ] = null;

	return won;

}

/** The jumping pieces: each offset is one candidate, and what stands between does not matter. */
function steps( state, piece, col, row, offsets ) {

	const moves = [];

	for ( const [ dr, dc ] of offsets ) {

		const r = row + dr, c = col + dc;
		if ( ! onBoard( c, r ) ) continue;

		// An enemy piece is a capture; one of your own is not a square.
		const occupant = state.board[ r ][ c ];
		if ( occupant === null || occupant.tone !== piece.tone ) moves.push( squareName( c, r ) );

	}

	return moves;

}

/** The sliding pieces: run until the board ends or something is in the way. */
function slides( state, piece, col, row, directions ) {

	const moves = [];

	for ( const [ dr, dc ] of directions ) {

		let r = row, c = col;

		for ( ;; ) {

			r += dr; c += dc;
			if ( ! onBoard( c, r ) ) break;

			const occupant = state.board[ r ][ c ];

			if ( occupant === null ) { moves.push( squareName( c, r ) ); continue; }

			// An enemy in the way can be taken, one of your own cannot, and
			// either of them ends the slide.
			if ( occupant.tone !== piece.tone ) moves.push( squareName( c, r ) );
			break;

		}

	}

	return moves;

}

/** Every action open to a tone right now, as `{ from, to }` pairs. */
export function allMoves( state, tone ) {

	const refs = [ ...TYPES.map( ( type ) => handRef( tone, type ) ), ...occupied( state ) ];

	return refs.flatMap( ( from ) => destinations( state, from, tone ).map( ( to ) => ( { from, to } ) ) );

}

function occupied( state ) {

	const refs = [];

	for ( let row = 0; row < CELLS; row ++ ) {

		for ( let col = 0; col < CELLS; col ++ ) {

			if ( state.board[ row ][ col ] ) refs.push( squareName( col, row ) );

		}

	}

	return refs;

}

// ------------------------------------------------------------------ the action

/**
 * Applies one move for the player to move, in place.
 *
 * `from` is a square or a hand slot, `to` is always a square. Anything the rules
 * do not allow changes nothing and comes back `{ ok: false, reason }` — the
 * caller does not have to check first, and a client that asks for the impossible
 * cannot corrupt the game.
 *
 * A capture sends the captured piece back to its owner's hand rather than out of
 * the game, so it is placeable again and the eight pieces are always somewhere.
 */
export function apply( state, from, to ) {

	if ( state.over ) return { ok: false, reason: 'the game is over' };

	if ( ! destinations( state, from ).includes( to ) ) {

		return { ok: false, reason: `${from} -> ${to} is not a legal move` };

	}

	const piece = pieceAt( state, from );
	const target = parseSquare( to );

	if ( isHandRef( from ) ) {

		state.hands[ piece.tone ][ parseHandRef( from ).slot ] = null;

	} else {

		const source = parseSquare( from );
		state.board[ source.row ][ source.col ] = null;

	}

	const captured = state.board[ target.row ][ target.col ];
	if ( captured ) toHand( state, captured );

	piece.cooldown = 0;
	state.board[ target.row ][ target.col ] = piece;

	state.moveNo ++;
	state.history.unshift( {
		no: state.moveNo,
		tone: piece.tone,
		type: piece.type,
		from,
		to,
		placed: isHandRef( from ),
		captured: captured ? { tone: captured.tone, type: captured.type } : null,
	} );

	// Win first, then the turn: the player who just moved is the one who can have
	// won, and a won game does not pass the turn on.
	if ( hasLine( state, piece.tone ) ) {

		finish( state, piece.tone, ENDINGS.won );
		return { ok: true, piece, from, to, captured: captured ?? null };

	}

	endTurn( state, piece.tone );

	return { ok: true, piece, from, to, captured: captured ?? null };

}

/**
 * A captured piece goes back to its own slot, which is always the free one — and
 * has to sit out, so that taking it buys tempo rather than nothing at all.
 */
function toHand( state, piece ) {

	piece.cooldown = state.rules.captureCooldown;
	state.hands[ piece.tone ][ TYPES.indexOf( piece.type ) ] = piece;

}

/**
 * Closes a turn: cool the mover's own pieces, hand over, then look for the
 * endings a game nobody is winning needs — the same order the Go engine uses.
 *
 * The cooldown ticks at the end of the mover's turn rather than the start of the
 * next one. Ticking on entry would decrement a piece captured a moment ago before
 * its owner had a turn to miss, so "sits out one turn" would mean nothing at all.
 */
function endTurn( state, mover ) {

	for ( const piece of state.hands[ mover ] ) {

		if ( piece && piece.cooldown > 0 ) piece.cooldown --;

	}

	state.turn = other( mover );

	if ( allMoves( state, state.turn ).length === 0 ) {

		// Boxed in with nothing to place: the player to move has run out of game.
		finish( state, mover, ENDINGS.noMove );
		return;

	}

	const key = positionKey( state );
	state.seen[ key ] = ( state.seen[ key ] ?? 0 ) + 1;

	const { repetitionLimit, maxPlies } = state.rules;

	if ( repetitionLimit > 0 && state.seen[ key ] >= repetitionLimit ) {

		finish( state, null, ENDINGS.repetition );

	} else if ( maxPlies > 0 && state.moveNo >= maxPlies ) {

		finish( state, null, ENDINGS.length );

	}

}

function finish( state, winner, ending ) {

	state.over = true;
	state.winner = winner;
	state.ending = ending;

}

/**
 * The pie rule: on their first turn the second player may take the position the
 * first player just built instead of answering it. Nothing else fixed the first
 * move being worth around 65% of decisive games, and this needs no guess at how
 * much compensation is right — an opening strong enough to be taken is one the
 * opener stops making.
 */
export const canSwap = ( state ) =>
	state.rules.swapRule === true && state.moveNo === 1 && ! state.over;

export function swap( state ) {

	if ( ! canSwap( state ) ) return { ok: false, reason: 'the position can only be taken on the second player’s first turn' };

	const taker = state.turn;

	// Every piece changes hands. The seats do not move: whoever was playing the
	// dark set still is, but the position they built is now their opponent's and
	// they are the one to move with nothing on the board.
	for ( const row of state.board ) {

		for ( const piece of row ) {

			if ( piece ) piece.tone = other( piece.tone );

		}

	}

	const light = state.hands.light.map( ( p ) => ( p ? { ...p, tone: 'light' } : null ) );
	const dark = state.hands.dark.map( ( p ) => ( p ? { ...p, tone: 'dark' } : null ) );

	state.hands.light = dark.map( ( p ) => ( p ? { ...p, tone: 'light', id: `light-${p.type}` } : null ) );
	state.hands.dark = light.map( ( p ) => ( p ? { ...p, tone: 'dark', id: `dark-${p.type}` } : null ) );

	for ( const row of state.board ) {

		for ( const piece of row ) {

			if ( piece ) piece.id = `${piece.tone}-${piece.type}`;

		}

	}

	state.moveNo ++;
	state.history.unshift( { no: state.moveNo, tone: taker, swapped: true } );

	endTurn( state, taker );

	return { ok: true, taker };

}

/**
 * WIN_LENGTH of one tone's pieces consecutively in a row, a column, or either
 * diagonal direction. Four directions rather than eight: the opposite of each
 * would only find the same run from its other end.
 */
export const hasLine = ( state, tone ) => winningLine( state, tone ) !== null;

/** Same as winningLine, named for the places that only need a yes or no. */
const lineFrom = ( state, tone ) => winningLine( state, tone );

/** The winning run itself — the squares, in order — or null. */
export function winningLine( state, tone ) {

	const directions = [ [ 0, 1 ], [ 1, 0 ], [ 1, 1 ], [ - 1, 1 ] ];

	for ( let row = 0; row < CELLS; row ++ ) {

		for ( let col = 0; col < CELLS; col ++ ) {

			for ( const [ dr, dc ] of directions ) {

				const line = [];
				let r = row, c = col;

				while ( onBoard( c, r ) && state.board[ r ][ c ]?.tone === tone ) {

					line.push( squareName( c, r ) );
					if ( line.length === state.rules.winLength ) return line;
					r += dr; c += dc;

				}

			}

		}

	}

	return null;

}

// -------------------------------------------------------------- the Go engine

export const playerOf = ( tone ) => ( tone === 'light' ? 'white' : 'black' );
export const toneOf = ( player ) => ( player === 'white' ? 'light' : 'dark' );

/** The column a hand slot reports in the engine: -1 for white, -2 for black. */
export const handCol = ( tone ) => ( tone === 'light' ? - 1 : - 2 );

/**
 * A reference as the engine's Position — `{ row, col }`, with a negative column
 * for a hand slot.
 */
export function toPosition( ref ) {

	if ( isHandRef( ref ) ) {

		const { tone, slot } = parseHandRef( ref );
		return { row: slot, col: handCol( tone ) };

	}

	const { col, row } = parseSquare( ref );
	return { row, col };

}

/** The engine's Position back to a reference. */
export function fromPosition( position ) {

	if ( position.col < 0 ) {

		const tone = position.col === - 1 ? 'light' : 'dark';
		return handRef( tone, TYPES[ position.row ] );

	}

	return squareName( position.col, position.row );

}

/**
 * One action in the shape `internal/engine` decodes — the body to send once the
 * client is talking to the Go engine instead of to `apply()`.
 *
 *   toAction( 'select', 'dark:knight' )
 *   toAction( 'execute', 'dark:knight', 'B3' )
 *   toAction( 'cancel' )
 */
export function toAction( actionType, from = null, to = null ) {

	const zero = { row: 0, col: 0 };

	return {
		actionType,
		move: {
			source: from ? toPosition( from ) : zero,
			destination: to ? toPosition( to ) : zero,
		},
	};

}
