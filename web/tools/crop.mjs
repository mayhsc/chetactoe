// Crops the same region from two images and stacks them, magnified, into one PNG
// so grain texture can be compared by eye. Summary statistics agree long before
// the texture looks alike, so this is the check that actually matters.
//
//   node tools/crop.mjs out.png x y w h zoom a.png b.png
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { makeImage } from './png.mjs';

const crcTable = ( () => {
  const t = new Int32Array( 256 );
  for ( let n = 0; n < 256; n ++ ) {
    let c = n;
    for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
    t[ n ] = c;
  }
  return t;
} )();

function crc32( buf ) {
  let c = -1;
  for ( let i = 0; i < buf.length; i ++ ) c = crcTable[ ( c ^ buf[ i ] ) & 0xff ] ^ ( c >>> 8 );
  return ( c ^ -1 ) >>> 0;
}

function chunk( type, data ) {
  const len = Buffer.alloc( 4 );
  len.writeUInt32BE( data.length );
  const body = Buffer.concat( [ Buffer.from( type, 'ascii' ), data ] );
  const crc = Buffer.alloc( 4 );
  crc.writeUInt32BE( crc32( body ) );
  return Buffer.concat( [ len, body, crc ] );
}

export function writePNG( path, width, height, rgb ) {
  const ihdr = Buffer.alloc( 13 );
  ihdr.writeUInt32BE( width, 0 );
  ihdr.writeUInt32BE( height, 4 );
  ihdr[ 8 ] = 8; ihdr[ 9 ] = 2; // 8-bit truecolour
  const raw = Buffer.alloc( height * ( width * 3 + 1 ) );
  for ( let y = 0; y < height; y ++ ) {
    raw[ y * ( width * 3 + 1 ) ] = 0; // filter: none
    rgb.copy( raw, y * ( width * 3 + 1 ) + 1, y * width * 3, ( y + 1 ) * width * 3 );
  }
  writeFileSync( path, Buffer.concat( [
    Buffer.from( [ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ] ),
    chunk( 'IHDR', ihdr ),
    chunk( 'IDAT', deflateSync( raw, { level: 6 } ) ),
    chunk( 'IEND', Buffer.alloc( 0 ) ),
  ] ) );
}

const [ out, xs, ys, ws, hs, zs, ...sources ] = process.argv.slice( 2 );
const [ x0, y0, cw, ch, zoom ] = [ xs, ys, ws, hs, zs ].map( Number );
const gap = 6;
const W = cw * zoom;
const H = sources.length * ch * zoom + ( sources.length - 1 ) * gap;
const buf = Buffer.alloc( W * H * 3, 40 );

sources.forEach( ( src, idx ) => {
  const img = makeImage( src );
  const yBase = idx * ( ch * zoom + gap );
  for ( let y = 0; y < ch * zoom; y ++ ) {
    for ( let x = 0; x < cw * zoom; x ++ ) {
      const [ r, g, b ] = img.rgb( x0 + Math.floor( x / zoom ), y0 + Math.floor( y / zoom ) );
      const o = ( ( yBase + y ) * W + x ) * 3;
      buf[ o ] = r; buf[ o + 1 ] = g; buf[ o + 2 ] = b;
    }
  }
} );

writePNG( out, W, H, buf );
console.log( `${out}  ${W}x${H}  (${sources.join( ' over ' )})` );
