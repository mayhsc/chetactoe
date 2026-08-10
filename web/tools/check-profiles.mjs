// Compares the authored lathe profiles in src/pieces/profiles.js against the
// radius-vs-height measured off reference/pieces.png.
//
//   node tools/check-profiles.mjs
//
// Reference rows at or below the base's widest point are skipped: the camera looks
// slightly down onto the base, so those rows trace the bottom ellipse rather than
// the profile and there is nothing meaningful to compare them against.
import { extract, PIECES } from './profile.mjs';
import { PROFILES, HEIGHTS, BASE_R } from '../src/pieces/profiles.js';

const REF = 'reference/pieces.png';

// widest authored radius at height y, since a flat face puts several radii on one y
function radiusAt( pts, y ) {
  let best = null;
  for ( let i = 0; i < pts.length - 1; i ++ ) {
    const a = pts[ i ], b = pts[ i + 1 ];
    const lo = Math.min( a.y, b.y ), hi = Math.max( a.y, b.y );
    if ( y < lo - 1e-9 || y > hi + 1e-9 ) continue;
    const f = Math.abs( b.y - a.y ) < 1e-12 ? 0 : ( y - a.y ) / ( b.y - a.y );
    const r = a.r + ( b.r - a.r ) * f;
    if ( best === null || r > best ) best = r;
  }
  return best;
}

let worst = { err: 0 };

for ( const name of Object.keys( PIECES ) ) {

  const ref = extract( REF, PIECES[ name ].span );
  const pts = PROFILES[ name ]();
  const H = HEIGHTS[ name ];
  const mmPerPx = ( H * 1000 ) / ref.height;

  // The knight's muzzle overhangs further than its base, so the overall widest row
  // is up in the head; take the base's widest from the lower third instead.
  const lower = ref.profile.filter( ( p ) => p.t < 0.33 );
  const baseWidest = lower.reduce( ( a, b ) => ( b.r > a.r ? b : a ) );

  const samples = ref.profile.filter( ( p ) => p.t > baseWidest.t + 0.02 && p.t < 0.995 );

  let sum = 0, n = 0, max = 0, maxAt = 0;
  const knightHeadStart = 0.55;

  for ( const s of samples ) {
    // the knight's turned profile stops where the sculpted head takes over
    if ( name === 'knight' && s.t > knightHeadStart ) continue;
    const authored = radiusAt( pts, s.t * H );
    if ( authored === null ) continue;
    const refR = s.r * H; // metres
    const err = ( authored - refR ) * 1000; // mm
    sum += err * err; n ++;
    if ( Math.abs( err ) > Math.abs( max ) ) { max = err; maxAt = s.t; }
  }

  const rms = Math.sqrt( sum / Math.max( 1, n ) );
  void ref.widest;
  const flag = rms > 0.35 ? '  <-- check' : '';
  console.log( `${name.padEnd( 7 )} ${String( n ).padStart( 3 )} samples   ` +
    `rms ${rms.toFixed( 3 )} mm (${( rms / mmPerPx ).toFixed( 2 )} px)   ` +
    `max ${max >= 0 ? '+' : ''}${max.toFixed( 3 )} mm at t=${maxAt.toFixed( 3 )}${flag}` );

  if ( rms > worst.err ) worst = { err: rms, name };

  // per-sample detail for whichever piece is passed on the command line
  if ( process.argv[ 2 ] === name ) {
    for ( const s of samples ) {
      if ( name === 'knight' && s.t > knightHeadStart ) continue;
      const authored = radiusAt( pts, s.t * H );
      if ( authored === null ) continue;
      const err = ( authored - s.r * H ) * 1000;
      console.log( `    t ${s.t.toFixed( 3 )}  ref ${( s.r / ref.widest.r ).toFixed( 3 )} R   ` +
        `authored ${( authored / BASE_R ).toFixed( 3 )} R   err ${err >= 0 ? '+' : ''}${err.toFixed( 3 )} mm` );
    }
  }

}

console.log( `\nprofile points: ` + Object.keys( PIECES )
  .map( ( n ) => `${n} ${PROFILES[ n ]().length}` ).join( ', ' ) );
