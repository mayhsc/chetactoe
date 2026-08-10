// Side-by-side tone comparison at fixed image coordinates. Only meaningful once
// the camera matches the reference, which it does — so the same pixel lands on
// the same part of the board in both images.
//   node tools/tones.mjs reference/target.png <render.png>
import { makeImage } from './png.mjs';

const POINTS = [
  [ 'backdrop TL', 40, 40 ],
  [ 'backdrop TR', 1310, 40 ],
  [ 'backdrop BL', 40, 1140 ],
  [ 'backdrop BR', 1320, 1120 ],
  [ 'top far L', 320, 160 ],
  [ 'top far C', 740, 150 ],
  [ 'top far R', 1040, 160 ],
  [ 'top mid L', 260, 560 ],
  [ 'top mid C', 745, 560 ],
  [ 'top mid R', 1090, 560 ],
  [ 'top near L', 300, 900 ],
  [ 'top near C', 752, 900 ],
  [ 'top near R', 1050, 900 ],
  [ 'border strip', 760, 1012 ],
  [ 'front face', 700, 1085 ],
  [ 'left rim', 96, 700 ],
];

const imgs = process.argv.slice( 2 ).map( ( p ) => ( { p, img: makeImage( p ) } ) );
if ( imgs.length < 1 ) { console.log( 'usage: node tools/tones.mjs a.png [b.png]' ); process.exit( 1 ); }

function patch( img, cx, cy, r = 7 ) {
  const s = [ 0, 0, 0 ]; let n = 0;
  for ( let y = cy - r; y <= cy + r; y ++ ) for ( let x = cx - r; x <= cx + r; x ++ ) {
    if ( x < 0 || y < 0 || x >= img.w || y >= img.h ) continue;
    const [ a, b, c ] = img.rgb( x, y ); s[ 0 ] += a; s[ 1 ] += b; s[ 2 ] += c; n ++;
  }
  return s.map( ( v ) => Math.round( v / n ) );
}
const lum = ( [ r, g, b ] ) => Math.round( 0.2126 * r + 0.7152 * g + 0.0722 * b );
const fmt = ( c ) => `${String( c[ 0 ] ).padStart( 3 )},${String( c[ 1 ] ).padStart( 3 )},${String( c[ 2 ] ).padStart( 3 )}`;

console.log( imgs.map( ( i ) => i.p ).join( '   vs   ' ) );
console.log( 'point'.padEnd( 14 ) + imgs.map( () => 'rgb'.padEnd( 15 ) + 'lum  ' ).join( '' ) + ( imgs.length > 1 ? ' dLum  dChroma' : '' ) );
for ( const [ name, x, y ] of POINTS ) {
  const vals = imgs.map( ( i ) => patch( i.img, x, y ) );
  let line = name.padEnd( 14 ) + vals.map( ( v ) => fmt( v ).padEnd( 15 ) + String( lum( v ) ).padStart( 3 ) + '  ' ).join( '' );
  if ( vals.length > 1 ) {
    const dl = lum( vals[ 1 ] ) - lum( vals[ 0 ] );
    const dc = ( vals[ 1 ][ 0 ] - vals[ 1 ][ 2 ] ) - ( vals[ 0 ][ 0 ] - vals[ 0 ][ 2 ] );
    line += String( dl > 0 ? '+' + dl : dl ).padStart( 6 ) + String( dc > 0 ? '+' + dc : dc ).padStart( 8 );
  }
  console.log( line );
}

// grain / groove statistics along a horizontal scanline across the middle
for ( const { p, img } of imgs ) {
  const y = 560, x0 = 200, x1 = 1150;
  const v = [];
  for ( let x = x0; x <= x1; x ++ ) v.push( img.lum( x, y ) );
  const mean = v.reduce( ( a, b ) => a + b ) / v.length;
  const sd = Math.sqrt( v.reduce( ( a, b ) => a + ( b - mean ) ** 2, 0 ) / v.length );
  // count local minima deeper than 3 lum below their neighbourhood: grain + grooves
  let dips = 0;
  for ( let i = 6; i < v.length - 6; i ++ ) {
    if ( v[ i ] < v[ i - 6 ] - 3 && v[ i ] < v[ i + 6 ] - 3 && v[ i ] <= Math.min( v[ i - 1 ], v[ i + 1 ] ) ) dips ++;
  }
  console.log( `\n${p}  scanline y=${y}: mean ${mean.toFixed( 1 )}  sd ${sd.toFixed( 1 )}  min ${Math.min( ...v ).toFixed( 0 )}  max ${Math.max( ...v ).toFixed( 0 )}  dips ${dips}` );
}
