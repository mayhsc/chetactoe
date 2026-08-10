// Round-trips the board's square <-> position mapping. Pure geometry, so it runs in
// Node without a browser — and it is the maths the drag snapping depends on.
import { cellCentre, squareAt, squareName, parseSquare, BOARD } from '../src/scene.js';

let fail = 0;
const bad = ( msg ) => { console.log( '  FAIL ' + msg ); fail ++; };

// every cell centre must map back to its own square
for ( let row = 0; row < BOARD.cells; row ++ ) {
  for ( let col = 0; col < BOARD.cells; col ++ ) {
    const [ x, z ] = cellCentre( col, row );
    const back = squareAt( x, z );
    if ( ! back || back.col !== col || back.row !== row )
      bad( `centre ${squareName( col, row )} -> ${JSON.stringify( back )}` );

    const name = squareName( col, row );
    const p = parseSquare( name );
    if ( p.col !== col || p.row !== row ) bad( `name round-trip ${name}` );
  }
}

// just inside each corner of the playing field still resolves
const half = BOARD.size / 2 - BOARD.margin;
const eps = 0.0005;
for ( const [ x, z, want ] of [
  [ - half + eps, - half + eps, 'A1' ],
  [ half - eps, - half + eps, 'D1' ],
  [ - half + eps, half - eps, 'A4' ],
  [ half - eps, half - eps, 'D4' ],
] ) {
  const s = squareAt( x, z );
  const got = s ? squareName( s.col, s.row ) : null;
  if ( got !== want ) bad( `inside corner (${x.toFixed( 4 )}, ${z.toFixed( 4 )}) -> ${got}, want ${want}` );
}

// anything past the playing field is off-board: border strip, rim, open table
for ( const [ x, z, label ] of [
  [ half + 0.002, 0, 'border strip, right' ],
  [ 0, half + 0.002, 'border strip, near' ],
  [ - half - 0.002, 0, 'border strip, left' ],
  [ BOARD.size, 0, 'off the table' ],
  [ 0, - BOARD.size, 'behind the board' ],
] ) {
  if ( squareAt( x, z ) !== null ) bad( `${label} should be off-board` );
}

// cells must not overlap or leave gaps: walk a fine grid and count hits per square
const counts = new Map();
const step = ( half * 2 ) / 400;
for ( let x = - half + step / 2; x < half; x += step ) {
  for ( let z = - half + step / 2; z < half; z += step ) {
    const s = squareAt( x, z );
    if ( ! s ) { bad( `gap inside the field at (${x.toFixed( 4 )}, ${z.toFixed( 4 )})` ); continue; }
    const k = squareName( s.col, s.row );
    counts.set( k, ( counts.get( k ) ?? 0 ) + 1 );
  }
}
const tallies = [ ...counts.values() ];
const spread = Math.max( ...tallies ) - Math.min( ...tallies );
if ( counts.size !== 16 ) bad( `covered ${counts.size} squares, want 16` );
if ( spread > 1 ) bad( `uneven cell areas, spread ${spread} samples` );

console.log( fail === 0
  ? `squares OK — 16 centres round-trip, corners resolve, off-board rejected, cells even (${tallies[ 0 ]} samples each)`
  : `${fail} failure(s)` );
process.exit( fail ? 1 : 0 );
