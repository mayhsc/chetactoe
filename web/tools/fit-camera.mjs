// Fits the app's camera parameterisation, plus the board's border margin, to
// features measured off reference/target.png.
//
//   node tools/fit-camera.mjs
//
// Two families of constraint are used. The silhouette anchors pin the framing;
// the ten grid grooves pin the perspective distribution across the face, which
// the silhouette alone leaves slack — a slightly wrong fov/distance pair can put
// the far and near edges in the right place and still misplace everything
// between them.
import * as THREE from 'three';

const W = 1353, H = 1162;
// Thickness is set from the reference's front-face height (~60 px between the
// top-face near edge and the lowest board pixel) rather than fitted: it trades
// off against the bottom silhouette, which sits in shadow and is the least
// reliable measurement in the image.
const SIZE = 0.2, THICK = 0.0265, FILLET = 0.0024, CORNER = 0.009;
const half = SIZE / 2, flat = half - FILLET;

// --- measured (px) ----------------------------------------------------------
// silhouette, by hand off luminance profiles
const ANCHORS = {
  farCentreY: 62, // topmost board pixel, centre column
  nearCentreY: 1050, // top face -> front rim, where the luminance starts to fall
  bottomCentreY: 1110, // lowest board pixel, centre column
  leftmostX: 59, // extreme left of the silhouette
  leftmostY: 1008,
  leftEdgeXat600: 93,
};
// grid grooves, from tools/grid.mjs (band centres 560 and 770)
const V_ROW = 560, H_COL = 770;
const V_GROOVES = [ 155.9, 406.4, 660.3, 915.8, 1171.1 ]; // board x = -A .. +A
const H_GROOVES = [ 95.2, 299.2, 521.0, 746.3, 998.1 ]; // board z = -A .. +A

// --- projection -------------------------------------------------------------
function makeCam( [ fov, elevDeg, dist, ty, panX ] ) {
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

// bisect a monotonic screen coordinate along a board axis
function solve( f, lo, hi, target ) {
  const rising = f( hi ) > f( lo );
  for ( let i = 0; i < 50; i ++ ) {
    const m = ( lo + hi ) / 2;
    ( ( f( m ) < target ) === rising ) ? lo = m : hi = m;
  }
  return ( lo + hi ) / 2;
}

function metrics( p ) {
  const cam = makeCam( p );
  const A = half - p[ 5 ];

  const m = { nearCentreY: project( cam, 0, 0, flat )[ 1 ] };

  // The topmost and lowest pixels of the silhouette both lie somewhere on a rim
  // round-over, not on the top face, so sweep the arc rather than assuming an
  // endpoint: the far arc runs from the top face edge out to the widest section.
  let top = Infinity, bottom = - Infinity;
  for ( let i = 0; i <= 32; i ++ ) {
    const phi = ( i / 32 ) * Math.PI / 2;
    const drop = FILLET * ( 1 - Math.cos( phi ) );
    const out = FILLET * Math.sin( phi );
    top = Math.min( top, project( cam, 0, - drop, - ( flat + out ) )[ 1 ] );
    bottom = Math.max( bottom, project( cam, 0, - THICK + drop, flat + out )[ 1 ] );
  }
  m.farCentreY = top;
  m.bottomCentreY = bottom;

  // Extreme left of the silhouette: sweep the whole plan outline at both ends of
  // the straight side band. The tangent point generally is not the corner arc's
  // start, so picking that endpoint biases the answer.
  let bestX = Infinity, bestY = 0;
  const s = half - CORNER;
  const leftOutline = [];
  for ( let i = 0; i <= 80; i ++ ) leftOutline.push( [ - half, - s + ( i / 80 ) * 2 * s ] ); // straight side
  for ( let i = 0; i <= 40; i ++ ) { // the two left corner arcs
    const th = Math.PI / 2 + ( i / 40 ) * Math.PI / 2;
    leftOutline.push( [ - s + CORNER * Math.cos( th ), s + CORNER * Math.sin( th ) ] );
    leftOutline.push( [ - s + CORNER * Math.cos( th + Math.PI / 2 ), - s + CORNER * Math.sin( th + Math.PI / 2 ) ] );
  }
  for ( const y of [ - FILLET, - ( THICK - FILLET ) ] ) {
    for ( const [ qx, qz ] of leftOutline ) {
      const q = project( cam, qx, y, qz );
      if ( q[ 0 ] < bestX ) { bestX = q[ 0 ]; bestY = q[ 1 ]; }
    }
  }
  m.leftmostX = bestX;
  m.leftmostY = bestY;

  // left silhouette at image row 600, from the straight part of the near-top band
  const a = project( cam, - half, - FILLET, - ( half - CORNER ) );
  const b = project( cam, - half, - FILLET, half - CORNER );
  m.leftEdgeXat600 = a[ 0 ] + ( ( 600 - a[ 1 ] ) / ( b[ 1 ] - a[ 1 ] ) ) * ( b[ 0 ] - a[ 0 ] );

  // vertical grooves: where each line x = g crosses image row V_ROW
  m.vertical = [ -1, -0.5, 0, 0.5, 1 ].map( ( k ) => {
    const g = k * A;
    const z = solve( ( t ) => project( cam, g, 0, t )[ 1 ], - A - 0.02, A + 0.02, V_ROW );
    return project( cam, g, 0, z )[ 0 ];
  } );

  // horizontal grooves: where each line z = g crosses image column H_COL
  m.horizontal = [ -1, -0.5, 0, 0.5, 1 ].map( ( k ) => {
    const g = k * A;
    const x = solve( ( t ) => project( cam, t, 0, g )[ 0 ], - A - 0.02, A + 0.02, H_COL );
    return project( cam, x, 0, g )[ 1 ];
  } );

  return m;
}

const W_ANCHOR = { farCentreY: 1, nearCentreY: 1, bottomCentreY: 1, leftmostX: 1, leftmostY: 0.4, leftEdgeXat600: 1 };
const W_GRID = 2.5; // the grooves are the sharpest features in the image

function cost( p ) {
  const [ fov, elev, dist, , , margin ] = p;
  if ( fov < 5 || fov > 80 || elev < 5 || elev > 88 || dist < 0.15 || dist > 5 ) return 1e9;
  if ( margin < 0.002 || margin > 0.03 ) return 1e9;
  const m = metrics( p );
  let c = 0;
  for ( const k in W_ANCHOR ) c += W_ANCHOR[ k ] * ( m[ k ] - ANCHORS[ k ] ) ** 2;
  for ( let i = 0; i < 5; i ++ ) {
    c += W_GRID * ( m.vertical[ i ] - V_GROOVES[ i ] ) ** 2;
    c += W_GRID * ( m.horizontal[ i ] - H_GROOVES[ i ] ) ** 2;
  }
  return c;
}

function nelderMead( f, x0, step = 0.08, iters = 4000 ) {
  const n = x0.length;
  let simplex = [ x0.slice() ];
  for ( let i = 0; i < n; i ++ ) {
    const q = x0.slice();
    q[ i ] += ( Math.abs( q[ i ] ) || 0.01 ) * step;
    simplex.push( q );
  }
  let vals = simplex.map( f );
  for ( let it = 0; it < iters; it ++ ) {
    const order = vals.map( ( v, i ) => i ).sort( ( a, b ) => vals[ a ] - vals[ b ] );
    simplex = order.map( ( i ) => simplex[ i ] );
    vals = order.map( ( i ) => vals[ i ] );
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
for ( const fov of [ 12, 16, 22, 30 ] )
  for ( const elev of [ 45, 55, 62, 70 ] )
    for ( const d of [ 0.5, 0.7, 1.0 ] )
      for ( const margin of [ 0.010, 0.014 ] ) {
        const r = nelderMead( cost, [ fov, elev, d, - 0.02, 0, margin ] );
        if ( ! best || r.f < best.f ) best = r;
      }

const [ fov, elev, dist, ty, panX, margin ] = best.x;
const n = 16;
console.log( `residual  rms ${Math.sqrt( best.f / n ).toFixed( 2 )} px over ${n} constraints\n` );
console.log( `fov            ${fov.toFixed( 3 )}` );
console.log( `elevation      ${elev.toFixed( 3 )} deg` );
console.log( `distance       ${dist.toFixed( 5 )} m` );
console.log( `target height  ${ty.toFixed( 5 )} m` );
console.log( `pan (target x) ${panX.toFixed( 5 )} m` );
console.log( `board margin   ${( margin * 1000 ).toFixed( 2 )} mm   (field ${( ( half - margin ) * 2000 ).toFixed( 1 )} mm, cell pitch ${( ( half - margin ) * 500 ).toFixed( 2 )} mm)` );
console.log( `thickness      ${( THICK * 1000 ).toFixed( 2 )} mm (fixed)\n` );

const m = metrics( best.x );
for ( const k in W_ANCHOR ) console.log( `  ${k.padEnd( 16 )} ${m[ k ].toFixed( 1 ).padStart( 8 )}  target ${String( ANCHORS[ k ] ).padStart( 6 )}  d ${( m[ k ] - ANCHORS[ k ] ).toFixed( 1 )}` );
console.log( `  vertical   fit ${m.vertical.map( ( v ) => v.toFixed( 1 ) ).join( ', ' )}` );
console.log( `             ref ${V_GROOVES.join( ', ' )}` );
console.log( `  horizontal fit ${m.horizontal.map( ( v ) => v.toFixed( 1 ) ).join( ', ' )}` );
console.log( `             ref ${H_GROOVES.join( ', ' )}` );
