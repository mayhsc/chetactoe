// Grain character inside a single cell: the reference's within-cell variation is
// tiny, so this is the measurement that keeps the grain from turning to corduroy.
import { makeImage } from './png.mjs';
const [ x0, x1, y0, y1 ] = [ 690, 900, 540, 580 ];
for ( const p of process.argv.slice( 2 ) ) {
  const img = makeImage( p );
  const v = [];
  for ( let x = x0; x <= x1; x ++ ) {
    let s = 0;
    for ( let y = y0; y <= y1; y ++ ) s += img.lum( x, y );
    v.push( s / ( y1 - y0 + 1 ) );
  }
  const mean = v.reduce( ( a, b ) => a + b ) / v.length;
  const sd = Math.sqrt( v.reduce( ( a, b ) => a + ( b - mean ) ** 2, 0 ) / v.length );
  const lo = Math.min( ...v ), hi = Math.max( ...v );
  const ramp = '▁▂▃▄▅▆▇█';
  const spark = v.filter( ( _, i ) => i % 2 === 0 )
    .map( ( q ) => ramp[ Math.min( 7, Math.floor( ( ( q - lo ) / ( hi - lo + 1e-9 ) ) * 8 ) ) ] ).join( '' );
  console.log( `${p}\n  mean ${mean.toFixed( 1 )}  sd ${sd.toFixed( 2 )}  range ${lo.toFixed( 0 )}-${hi.toFixed( 0 )} (${( hi - lo ).toFixed( 0 )} levels)\n  ${spark}` );
}

// Single-row statistics. The block above averages 41 rows, which runs along the
// grain and washes the ray fleck out entirely — useful for isolating the
// underlying grain, useless for judging fleck. This measures one row.
console.log( '\nsingle row y=560, x 720-880 (cell interior; fleck visible):' );
for ( const p of process.argv.slice( 2 ) ) {
  const img = makeImage( p );
  const v = [];
  for ( let x = 720; x <= 880; x ++ ) v.push( img.lum( x, 560 ) );
  const mean = v.reduce( ( a, b ) => a + b ) / v.length;
  const sd = Math.sqrt( v.reduce( ( a, b ) => a + ( b - mean ) ** 2, 0 ) / v.length );
  // high-frequency component only: deviation from a 9-px moving average
  let hf = 0;
  for ( let i = 4; i < v.length - 4; i ++ ) {
    let s = 0;
    for ( let k = - 4; k <= 4; k ++ ) s += v[ i + k ];
    hf += ( v[ i ] - s / 9 ) ** 2;
  }
  hf = Math.sqrt( hf / ( v.length - 8 ) );
  console.log( `  ${p.split( '/' ).pop().padEnd( 14 )} mean ${mean.toFixed( 1 )}  sd ${sd.toFixed( 2 )}  high-freq sd ${hf.toFixed( 2 )}` );
}
