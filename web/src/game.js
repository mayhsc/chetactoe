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

/** How many of your own pieces in a line wins. Four on a 4x4 board means all of them. */
export const WIN_LENGTH = 4;

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
export function createGame() {

	const state = {
		board: Array.from( { length: CELLS }, () => Array( CELLS ).fill( null ) ),
		hands: { light: Array( HAND_SIZE ).fill( null ), dark: Array( HAND_SIZE ).fill( null ) },
		turn: FIRST,
		moveNo: 0,
		over: false,
		winner: null, // a tone, or null; null with over === true is a draw
		history: [],
	};

	for ( const tone of TONES ) {

		TYPES.forEach( ( type, slot ) => {

			state.hands[ tone ][ slot ] = { id: `${tone}-${type}`, tone, type };

		} );

	}

	return state;

}

/** Puts an existing game back to the opening position, in place. */
export function reset( state ) {

	Object.assign( state, createGame() );
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

	// A piece in hand has no moves of its own: it may be placed on any free
	// square, and which piece it is makes no difference.
	if ( isHandRef( ref ) ) return emptySquares( state );

	const { col, row } = parseSquare( ref );

	switch ( piece.type ) {

		case 'pawn': return steps( state, piece, col, row, ORTHOGONAL );
		case 'knight': return steps( state, piece, col, row, KNIGHT_STEPS );
		case 'bishop': return slides( state, piece, col, row, DIAGONAL );
		case 'rook': return slides( state, piece, col, row, ORTHOGONAL );
		default: return [];

	}

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

		state.over = true;
		state.winner = piece.tone;

	} else if ( allMoves( state, other( piece.tone ) ).length === 0 ) {

		// Every piece of theirs is in play and boxed in. The only draw there is.
		state.over = true;
		state.winner = null;

	} else {

		state.turn = other( piece.tone );

	}

	return { ok: true, piece, from, to, captured: captured ?? null };

}

/** A captured piece goes back to its own slot, which is always the free one. */
function toHand( state, piece ) {

	state.hands[ piece.tone ][ TYPES.indexOf( piece.type ) ] = piece;

}

/**
 * WIN_LENGTH of one tone's pieces consecutively in a row, a column, or either
 * diagonal direction. Four directions rather than eight: the opposite of each
 * would only find the same run from its other end.
 */
export const hasLine = ( state, tone ) => winningLine( state, tone ) !== null;

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
					if ( line.length === WIN_LENGTH ) return line;
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
