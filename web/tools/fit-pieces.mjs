// Fits the pieces-page camera and the row spacing to reference/pieces.png.
//
//   node tools/fit-pieces.mjs
//
// Constraints per piece: the turning axis in x, the apex in y, and the bottom of
// the silhouette — which for a near-level camera is the front edge of the base at
// (0, 0, R), not the axis point.
import * as THREE from 'three';
import { extract, PIECES } from './profile.mjs';
import { HEIGHTS, BASE_R } from '../src/pieces/profiles.js';

const W = 750, H = 230;
const REF = 'reference/pieces.png';
const ORDER = [ 'pawn', 'knight', 'rook', 'bishop' ];

// Elevation and target height trade off against each other: the measurements are
// nearly as happy with a camera on the floor looking up as with one slightly above
// looking down. Pass a fixed elevation to break that tie.
const FIXED_ELEV = process.argv[ 2 ] !== undefined ? Number( process.argv[ 2 ] ) : null;

// measured off the reference
const M = {};
for ( const name of ORDER ) {
  const e = extract( REF, PIECES[ name ].span );
  M[ name ] = { axis: e.axis, top: e.top, bottom: e.bottom, height: e.height };
}

function makeCam( [ fov, elevDeg, dist, ty, panX ] ) {
  if ( FIXED_ELEV !== null ) elevDeg = FIXED_ELEV;
  const cam = new THREE.PerspectiveCamera( fov, W / H, 0.02, 20 );
  const a = THREE.MathUtils.degToRad( elevDeg );
  cam.position.set( 0, Math.sin( a ) * dist, Math.cos( a ) * dist );
  cam.lookAt( panX, ty, 0 );
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}
const project = ( cam, x, y, z ) => {
  const v = new THREE.Vector3( x, y, z ).project( cam );
  return [ ( v.x * 0.5 + 0.5 ) * W, ( 1 - ( v.y * 0.5 + 0.5 ) ) * H ];
};

function residuals( p ) {
  const cam = makeCam( p );
  const spacing = p[ 5 ];
  const out = [];

  ORDER.forEach( ( name, i ) => {
    const x = ( i - ( ORDER.length - 1 ) / 2 ) * spacing;
    const m = M[ name ];

    // turning axis, taken at mid-height so perspective is handled honestly
    const axis = project( cam, x, HEIGHTS[ name ] / 2, 0 );
    out.push( [ axis[ 0 ] - m.axis, 1 ] );

    // apex
    const apex = project( cam, x, HEIGHTS[ name ], 0 );
    out.push( [ apex[ 1 ] - m.top, 1 ] );

    // lowest visible point: front edge of the base
    const foot = project( cam, x, 0, BASE_R );
    out.push( [ foot[ 1 ] - m.bottom, 1 ] );
  } );

  return out;
}

const cost = ( p ) => {
  if ( p[ 0 ] < 4 || p[ 0 ] > 70 || p[ 1 ] < 0 || p[ 1 ] > 60 || p[ 2 ] < 0.1 || p[ 2 ] > 5 ) return 1e9;
  if ( p[ 5 ] < 0.02 || p[ 5 ] > 0.15 ) return 1e9;
  return residuals( p ).reduce( ( s, [ e, w ] ) => s + w * e * e, 0 );
};

function nelderMead( f, x0, step = 0.08, iters = 6000 ) {
  const n = x0.length;
  let simplex = [ x0.slice() ];
  for ( let i = 0; i < n; i ++ ) {
    const q = x0.slice(); q[ i ] += ( Math.abs( q[ i ] ) || 0.01 ) * step; simplex.push( q );
  }
  let vals = simplex.map( f );
  for ( let it = 0; it < iters; it ++ ) {
    const order = vals.map( ( v, i ) => i ).sort( ( a, b ) => vals[ a ] - vals[ b ] );
    simplex = order.map( ( i ) => simplex[ i ] ); vals = order.map( ( i ) => vals[ i ] );
    const cen = new Array( n ).fill( 0 );
    for ( let i = 0; i < n; i ++ ) for ( let j = 0; j < n; j ++ ) cen[ j ] += simplex[ i ][ j ] / n;
    const worst = simplex[ n ];
    const refl = cen.map( ( c, j ) => c + ( c - worst[ j ] ) );
    const fr = f( refl );
    if ( fr < vals[ 0 ] ) {
      const exp = cen.map( ( c, j ) => c + 2 * ( c - worst[ j ] ) );
      const fe = f( exp );
      if ( fe < fr ) { simplex[ n ] = exp; vals[ n ] = fe; } else { simplex[ n ] = refl; vals[ n ] = fr; }
    } else if ( fr < vals[ n - 1 ] ) { simplex[ n ] = refl; vals[ n ] = fr; }
    else {
      const con = cen.map( ( c, j ) => c + 0.5 * ( worst[ j ] - c ) );
      const fc = f( con );
      if ( fc < vals[ n ] ) { simplex[ n ] = con; vals[ n ] = fc; }
      else for ( let i = 1; i <= n; i ++ ) {
        simplex[ i ] = simplex[ i ].map( ( v, j ) => simplex[ 0 ][ j ] + 0.5 * ( v - simplex[ 0 ][ j ] ) );
        vals[ i ] = f( simplex[ i ] );
      }
    }
  }
  const best = vals.map( ( v, i ) => i ).sort( ( a, b ) => vals[ a ] - vals[ b ] )[ 0 ];
  return { x: simplex[ best ], f: vals[ best ] };
}

let best = null;
for ( const fov of [ 8, 14, 22, 34 ] )
  for ( const elev of [ 2, 6, 12, 20 ] )
    for ( const d of [ 0.35, 0.6, 1.0 ] ) {
      const r = nelderMead( cost, [ fov, elev, d, 0.02, 0, 0.056 ] );
      if ( ! best || r.f < best.f ) best = r;
    }

const [ fov, , dist, ty, panX, spacing ] = best.x;
 const elev = FIXED_ELEV !== null ? FIXED_ELEV : best.x[ 1 ];
const res = residuals( best.x );
console.log( `residual rms ${Math.sqrt( best.f / res.length ).toFixed( 2 )} px over ${res.length} constraints\n` );
console.log( `fov            ${fov.toFixed( 3 )}` );
console.log( `elevation      ${elev.toFixed( 3 )} deg` );
console.log( `distance       ${dist.toFixed( 5 )} m` );
console.log( `target height  ${ty.toFixed( 5 )} m` );
console.log( `pan            ${panX.toFixed( 5 )} m` );
console.log( `spacing        ${( spacing * 1000 ).toFixed( 2 )} mm  (${( spacing / ( BASE_R * 2 ) ).toFixed( 3 )} base diameters)\n` );

const cam = makeCam( best.x );
ORDER.forEach( ( name, i ) => {
  const x = ( i - ( ORDER.length - 1 ) / 2 ) * spacing;
  const m = M[ name ];
  const axis = project( cam, x, HEIGHTS[ name ] / 2, 0 );
  const apex = project( cam, x, HEIGHTS[ name ], 0 );
  const foot = project( cam, x, 0, BASE_R );
  console.log( `  ${name.padEnd( 7 )} axis ${axis[ 0 ].toFixed( 1 ).padStart( 6 )} (${m.axis})   ` +
    `apex y ${apex[ 1 ].toFixed( 1 ).padStart( 5 )} (${m.top})   foot y ${foot[ 1 ].toFixed( 1 ).padStart( 6 )} (${m.bottom})` );
} );
