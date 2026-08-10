// Extracts the turned profile of a chess piece from a photograph, and traces the
// outline of a non-symmetric part (the knight's head).
//
//   node tools/profile.mjs reference/pieces.png            # all four, radius table
//   node tools/profile.mjs reference/pieces.png pawn json  # machine-readable
//   node tools/profile.mjs reference/pieces.png knight outline
//
// Two things make this less trivial than "find the silhouette":
//
//  - The contact shadow falls to the right of every piece and reads as part of the
//    mask, which both inflates the right edge and drags the apparent axis across.
//    So the axis is taken as the median mid-point over the upper 60% of the body
//    (which the shadow never reaches), and the radius is measured from the LEFT
//    edge only and mirrored.
//  - Below the base's widest row the camera is looking slightly down onto the base,
//    so those rows trace the bottom ellipse rather than the profile. Everything
//    from the widest base row down is reported separately and should be treated as
//    the base's bottom chamfer rather than sampled.
import { pathToFileURL } from 'node:url';
import { makeImage } from './png.mjs';

// x-spans of the four pieces in reference/pieces.png, generous enough to include
// each shadow (the mask logic copes) but never a neighbour
export const PIECES = {
  pawn: { span: [ 10, 140 ] },
  knight: { span: [ 205, 345 ] },
  rook: { span: [ 410, 555 ] },
  bishop: { span: [ 610, 745 ] },
};

export function extract( path, span, { chromaTol = 20 } = {} ) {
  const img = makeImage( path );
  const { h: H, rgb } = img;
  const bgChroma = rgb( 2, 2 )[ 0 ] - rgb( 2, 2 )[ 2 ];
  const isPiece = ( x, y ) => {
    const [ r, , b ] = rgb( x, y );
    return ( r - b ) - bgChroma > chromaTol;
  };

  const [ x0, x1 ] = span;
  const rows = [];
  for ( let y = 0; y < H; y ++ ) {
    let min = - 1, max = - 1;
    for ( let x = x0; x <= x1; x ++ ) if ( isPiece( x, y ) ) { if ( min < 0 ) min = x; max = x; }
    if ( min >= 0 ) rows.push( { y, min, max } );
  }
  if ( ! rows.length ) throw new Error( 'nothing found in span ' + span );

  const top = rows[ 0 ].y;
  const bottom = rows.at( -1 ).y;
  const height = bottom - top + 1;

  const mids = rows.filter( ( r ) => r.y < top + height * 0.6 )
    .map( ( r ) => ( r.min + r.max ) / 2 ).sort( ( a, b ) => a - b );
  const axis = mids[ Math.floor( mids.length / 2 ) ];

  // radius per row, from the left edge; y measured up from the base
  const profile = rows.map( ( r ) => ( {
    t: ( bottom - r.y ) / ( height - 1 ), // 0 at base, 1 at top
    r: ( axis - r.min ) / height, // radius as a fraction of height
  } ) ).reverse();

  const widest = profile.reduce( ( a, b ) => ( b.r > a.r ? b : a ) );

  return { img, isPiece, axis, top, bottom, height, profile, widest, rows };
}

/**
 * Traces the closed boundary of the mask above `tCut`, walking the left edge up
 * and the right edge back down. Good enough for a concave silhouette like the
 * knight's overhanging jaw, which a per-row edge scan cannot represent.
 */
export function outline( path, span, tCut, opts ) {
  const { isPiece, axis, top, bottom, height, rows } = extract( path, span, opts );
  const yCut = bottom - Math.round( tCut * ( height - 1 ) );
  const head = rows.filter( ( r ) => r.y <= yCut );

  const left = [], right = [];
  for ( const r of head ) {
    // re-scan this row so a concave outline picks up the true extremes
    let min = - 1, max = - 1;
    for ( let x = span[ 0 ]; x <= span[ 1 ]; x ++ ) if ( isPiece( x, r.y ) ) { if ( min < 0 ) min = x; max = x; }
    const t = ( bottom - r.y ) / ( height - 1 );
    left.push( { x: ( min - axis ) / height, t } );
    right.push( { x: ( max - axis ) / height, t } );
  }

  // down the right edge, then back up the left: a closed loop in (x, t)
  return { loop: [ ...right, ...left.reverse() ], axis, top, bottom, height, yCut };
}

// ---------------------------------------------------------------------------

// only when run directly — importers have their own argv
const isMain = process.argv[ 1 ] !== undefined &&
	import.meta.url === pathToFileURL( process.argv[ 1 ] ).href;
const [ path, which, mode ] = process.argv.slice( 2 );
if ( isMain && path ) {

  const names = which && PIECES[ which ] ? [ which ] : Object.keys( PIECES );

  if ( mode === 'outline' ) {

    const { loop, height } = outline( path, PIECES[ names[ 0 ] ].span, 0.55 );
    console.log( `# ${names[ 0 ]} head outline, ${loop.length} points, (x, y) as fractions of piece height` );
    console.log( JSON.stringify( loop.map( ( p ) => [ +p.x.toFixed( 4 ), +p.t.toFixed( 4 ) ] ) ) );
    console.log( `# piece height ${height} px` );

  } else {

    for ( const name of names ) {
      const { height, axis, profile, widest } = extract( path, PIECES[ name ].span );
      const baseR = widest.r;

      if ( mode === 'json' ) {
        console.log( JSON.stringify( { name, height, axis, baseR, profile:
          profile.map( ( p ) => [ +p.t.toFixed( 4 ), +p.r.toFixed( 4 ) ] ) } ) );
        continue;
      }

      console.log( `\n=== ${name}   height ${height} px   axis x=${axis.toFixed( 1 )}   ` +
        `base Ø ${( baseR * 2 * height ).toFixed( 1 )} px   h/baseØ ${( 1 / ( baseR * 2 ) ).toFixed( 3 )}` );
      console.log( `    widest row at t=${widest.t.toFixed( 3 )} (rows below this trace the base ellipse, not the profile)` );
      // radius normalised to the base radius, which is what a profile is authored against
      for ( let i = profile.length - 1; i >= 0; i -- ) {
        const p = profile[ i ];
        if ( i % 3 && i !== 0 ) continue;
        const rel = p.r / baseR;
        console.log( `    t ${p.t.toFixed( 3 )}  r/h ${p.r.toFixed( 4 )}  r/baseR ${rel.toFixed( 3 )}  ` +
          '#'.repeat( Math.round( rel * 40 ) ) );
      }
    }

  }

}
