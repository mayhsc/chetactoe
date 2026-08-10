// Locates the five grid grooves in each direction. Individual scanlines are too
// noisy — grain lines register as dips just as strongly — so each groove is found
// by averaging a band of parallel lines, which reinforces the groove and averages
// the grain away. Bands are kept inside a single cell so a perpendicular groove
// never contaminates the average.
import { makeImage } from './png.mjs';

function dips( profile, offset, minDrop = 12, minGap = 40 ) {
  const hits = [];
  for ( let i = 12; i < profile.length - 12; i ++ ) {
    const window = profile.slice( i - 12, i + 13 );
    if ( profile[ i ] !== Math.min( ...window ) ) continue;
    const shoulder = ( profile[ i - 12 ] + profile[ i + 12 ] ) / 2;
    if ( shoulder - profile[ i ] < minDrop ) continue;
    if ( hits.length && i - hits.at( -1 ) < minGap ) {
      if ( profile[ i ] < profile[ hits.at( -1 ) ] ) hits[ hits.length - 1 ] = i;
      continue;
    }
    hits.push( i );
  }
  // sub-pixel centre from a parabola through the minimum and its neighbours
  return hits.map( ( i ) => {
    const [ a, b, c ] = [ profile[ i - 1 ], profile[ i ], profile[ i + 1 ] ];
    const denom = a - 2 * b + c;
    const shift = denom !== 0 ? ( 0.5 * ( a - c ) ) / denom : 0;
    return i + offset + Math.max( -1, Math.min( 1, shift ) );
  } );
}

export function findGrid( path, opts = {} ) {
  const img = makeImage( path );
  const { vBand = [ 500, 620 ], hBand = [ 700, 840 ], xRange = [ 120, 1260 ], yRange = [ 70, 1040 ] } = opts;

  // vertical grooves: average rows in vBand, scan across x
  const vProfile = [];
  for ( let x = xRange[ 0 ]; x <= xRange[ 1 ]; x ++ ) {
    let s = 0;
    for ( let y = vBand[ 0 ]; y <= vBand[ 1 ]; y ++ ) s += img.lum( x, y );
    vProfile.push( s / ( vBand[ 1 ] - vBand[ 0 ] + 1 ) );
  }

  // horizontal grooves: average columns in hBand, scan down y
  const hProfile = [];
  for ( let y = yRange[ 0 ]; y <= yRange[ 1 ]; y ++ ) {
    let s = 0;
    for ( let x = hBand[ 0 ]; x <= hBand[ 1 ]; x ++ ) s += img.lum( x, y );
    hProfile.push( s / ( hBand[ 1 ] - hBand[ 0 ] + 1 ) );
  }

  return {
    vertical: dips( vProfile, xRange[ 0 ] ),
    horizontal: dips( hProfile, yRange[ 0 ] ),
    vBandCentre: ( vBand[ 0 ] + vBand[ 1 ] ) / 2,
    hBandCentre: ( hBand[ 0 ] + hBand[ 1 ] ) / 2,
  };
}

if ( process.argv[ 2 ] ) {
  for ( const p of process.argv.slice( 2 ) ) {
    const g = findGrid( p );
    const fmt = ( a ) => a.map( ( v ) => v.toFixed( 1 ) ).join ( ', ' );
    const gaps = ( a ) => a.slice( 1 ).map( ( v, i ) => ( v - a[ i ] ).toFixed( 1 ) ).join( ', ' );
    console.log( p );
    console.log( `  vertical   x = ${fmt( g.vertical )}` );
    console.log( `  gaps           ${gaps( g.vertical )}` );
    console.log( `  horizontal y = ${fmt( g.horizontal )}` );
    console.log( `  gaps           ${gaps( g.horizontal )}` );
    if ( g.vertical.length ) {
      const c = ( g.vertical[ 0 ] + g.vertical.at( -1 ) ) / 2;
      console.log( `  field width    ${( g.vertical.at( -1 ) - g.vertical[ 0 ] ).toFixed( 1 )} px, centred at x ${c.toFixed( 1 )}` );
    }
  }
}
