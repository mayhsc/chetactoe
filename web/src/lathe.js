import * as THREE from 'three';

/**
 * Profile builder and surface-of-revolution generator for turned parts.
 *
 * `THREE.LatheGeometry` is not usable here: it averages the normals of adjacent
 * profile segments for every point, so a deliberately crisp transition — the step
 * under a pawn's collar, the shoulder of a base — comes out rounded, and there is
 * no way to ask for anything else. Feeding it a duplicated point to force a crease
 * gives a zero-length segment and a NaN normal.
 *
 * So the profile carries a `sharp` flag per point and normals are derived
 * analytically from the profile tangent. A surface of revolution has its normal in
 * the meridian plane, so for a profile direction (dr, dy) the outward normal is
 * (dy, -dr) — which comes out correct everywhere as long as the profile runs from
 * the bottom of the axis, outward, up the side, and back in to the top of the axis.
 */

const EPS = 1e-9;

class Profile {

	constructor() {

		this.cmds = [];

	}

	moveTo( r, y ) {

		this.cmds.push( { type: 'move', r, y } );
		return this;

	}

	/**
	 * @param {number} r
	 * @param {number} y
	 * @param {number} [fillet] Round the corner at the *previous* node by this
	 * radius. Only meaningful between two straight segments.
	 */
	lineTo( r, y, fillet = 0 ) {

		this.cmds.push( { type: 'line', r, y, fillet } );
		return this;

	}

	/**
	 * Circular arc from the current point to (r, y).
	 *
	 * @param {number} r
	 * @param {number} y
	 * @param {number} radius Arc radius; must be at least half the chord length.
	 * @param {boolean} [bulge] true bulges away from the axis (a convex bead),
	 * false bulges toward it (a concave cove).
	 */
	arcTo( r, y, radius, bulge = true ) {

		this.cmds.push( { type: 'arc', r, y, radius, bulge } );
		return this;

	}

	/** Straight taper marked smooth, so it blends with its neighbours. */
	smoothTo( r, y ) {

		this.cmds.push( { type: 'line', r, y, fillet: 0, smooth: true } );
		return this;

	}

	/**
	 * Appends an arbitrary parametric curve, sampled and marked smooth. Needed for
	 * anything that is not a circular arc — the pawn's head, for instance, measures
	 * as a prolate ellipsoid (7.12 mm wide against 7.97 mm tall), and forcing a
	 * circle through it misses the profile by most of a millimetre.
	 *
	 * @param {function(number): number[]} fn t in (0, 1] -> [ r, y ]
	 * @param {number} [steps]
	 */
	curve( fn, steps = 24 ) {

		this.cmds.push( { type: 'curve', fn, steps } );
		return this;

	}

	/**
	 * Resolves the commands into points. `density` is how many segments per unit of
	 * profile arc length curves are tessellated at.
	 *
	 * @return {Array<{r:number,y:number,sharp:boolean}>}
	 */
	build( density = 900 ) {

		// 1. node polyline, remembering which nodes want a fillet
		const nodes = [];
		for ( const c of this.cmds ) {

			if ( c.type === 'move' ) nodes.push( { r: c.r, y: c.y, kind: 'node' } );
			else if ( c.type === 'line' ) nodes.push( { r: c.r, y: c.y, kind: 'node', fillet: c.fillet, smooth: c.smooth } );
			else if ( c.type === 'curve' ) nodes.push( { kind: 'curve', fn: c.fn, steps: c.steps } );
			else nodes.push( { r: c.r, y: c.y, kind: 'arc', radius: c.radius, bulge: c.bulge } );

		}

		// 2. emit points, inserting fillet arcs at cornered nodes
		const pts = [];
		const push = ( r, y, sharp ) => {

			const last = pts[ pts.length - 1 ];
			if ( last && Math.hypot( last.r - r, last.y - y ) < EPS ) {

				if ( ! sharp ) last.sharp = false;
				return;

			}

			pts.push( { r, y, sharp } );

		};

		push( nodes[ 0 ].r, nodes[ 0 ].y, true );

		for ( let i = 1; i < nodes.length; i ++ ) {

			const prev = nodes[ i - 1 ];
			const node = nodes[ i ];
			const next = nodes[ i + 1 ];

			if ( node.kind === 'curve' ) {

				for ( let s = 1; s <= node.steps; s ++ ) {

					const [ r, y ] = node.fn( s / node.steps );
					push( r, y, false );
					// so a following arc or fillet can use this as its previous node
					node.r = r; node.y = y;

				}

				continue;

			}

			if ( node.kind === 'arc' ) {

				// A turned transition into an arc is meant to be tangent — a cove
				// rolling off a cylinder, a bead leaving a stem. Left sharp, every one
				// of them shows as a hard ring around the piece.
				if ( pts.length ) pts[ pts.length - 1 ].sharp = false;
				emitArc( pts, push, prev, node, density );
				continue;

			}

			// a fillet needs a straight segment on both sides
			const canFillet = node.fillet > 0 && next && next.kind === 'node' &&
				prev.kind === 'node';

			if ( ! canFillet ) {

				push( node.r, node.y, ! node.smooth );
				continue;

			}

			emitFillet( pts, push, prev, node, next, density );

		}

		return pts;

	}

}

function emitArc( pts, push, prev, node, density ) {

	const [ x0, y0 ] = [ prev.r, prev.y ];
	const [ x1, y1 ] = [ node.r, node.y ];
	const chord = Math.hypot( x1 - x0, y1 - y0 );
	const radius = Math.max( node.radius, chord / 2 + EPS );

	// centre lies on the chord's perpendicular bisector
	const mx = ( x0 + x1 ) / 2, my = ( y0 + y1 ) / 2;
	const h = Math.sqrt( Math.max( 0, radius * radius - ( chord / 2 ) ** 2 ) );
	// The arc curves *away* from its centre, so bulging away from the axis means
	// putting the centre on the axis side of the chord.
	let nx = - ( y1 - y0 ) / chord, ny = ( x1 - x0 ) / chord;
	if ( node.bulge ) { nx = - nx; ny = - ny; }
	const cx = mx - nx * h, cy = my - ny * h;

	let a0 = Math.atan2( y0 - cy, x0 - cx );
	let a1 = Math.atan2( y1 - cy, x1 - cx );
	// take the short way round, in the direction the bulge implies
	let sweep = a1 - a0;
	while ( sweep > Math.PI ) sweep -= Math.PI * 2;
	while ( sweep < - Math.PI ) sweep += Math.PI * 2;

	const steps = Math.max( 3, Math.ceil( Math.abs( sweep ) * radius * density ) );
	for ( let s = 1; s <= steps; s ++ ) {

		const a = a0 + sweep * ( s / steps );
		push( cx + Math.cos( a ) * radius, cy + Math.sin( a ) * radius, false );

	}

}

function emitFillet( pts, push, prev, node, next, density ) {

	const ux = prev.r - node.r, uy = prev.y - node.y;
	const vx = next.r - node.r, vy = next.y - node.y;
	const ul = Math.hypot( ux, uy ), vl = Math.hypot( vx, vy );
	if ( ul < EPS || vl < EPS ) { push( node.r, node.y, true ); return; }

	const un = [ ux / ul, uy / ul ], vn = [ vx / vl, vy / vl ];
	const cosA = Math.max( - 1, Math.min( 1, un[ 0 ] * vn[ 0 ] + un[ 1 ] * vn[ 1 ] ) );
	const half = Math.acos( cosA ) / 2;

	// straight-through or doubled-back corner: nothing to round
	if ( half < 1e-4 || Math.abs( half - Math.PI / 2 ) < 1e-6 ) { push( node.r, node.y, true ); return; }

	// clamp so the fillet fits both segments
	const tanHalf = Math.tan( half );
	let f = node.fillet;
	f = Math.min( f, ul * tanHalf * 0.999, vl * tanHalf * 0.999 );
	const d = f / tanHalf;

	const a = [ node.r + un[ 0 ] * d, node.y + un[ 1 ] * d ];
	const b = [ node.r + vn[ 0 ] * d, node.y + vn[ 1 ] * d ];

	// centre along the angle bisector
	let bx = un[ 0 ] + vn[ 0 ], by = un[ 1 ] + vn[ 1 ];
	const bl = Math.hypot( bx, by );
	bx /= bl; by /= bl;
	const dist = f / Math.sin( half );
	const cx = node.r + bx * dist, cy = node.y + by * dist;

	let a0 = Math.atan2( a[ 1 ] - cy, a[ 0 ] - cx );
	let a1 = Math.atan2( b[ 1 ] - cy, b[ 0 ] - cx );
	let sweep = a1 - a0;
	while ( sweep > Math.PI ) sweep -= Math.PI * 2;
	while ( sweep < - Math.PI ) sweep += Math.PI * 2;

	push( a[ 0 ], a[ 1 ], false );
	const steps = Math.max( 2, Math.ceil( Math.abs( sweep ) * f * density ) );
	for ( let s = 1; s <= steps; s ++ ) {

		const ang = a0 + sweep * ( s / steps );
		push( cx + Math.cos( ang ) * f, cy + Math.sin( ang ) * f, false );

	}

}

export function profile() {

	return new Profile();

}

/**
 * Revolves a profile around +Y.
 *
 * Points flagged `sharp` are emitted twice with the normals of the segment on
 * either side, which is what keeps a crisp shoulder crisp; smooth points get the
 * average of their two neighbouring segment normals. Points on the axis are given
 * an explicit pole normal, since the tangent there is degenerate.
 */
export function revolve( points, segments = 96 ) {

	if ( points.length < 2 ) throw new Error( 'profile needs at least two points' );

	// per-segment outward normal in the meridian plane
	const segN = [];
	for ( let i = 0; i < points.length - 1; i ++ ) {

		const dr = points[ i + 1 ].r - points[ i ].r;
		const dy = points[ i + 1 ].y - points[ i ].y;
		const l = Math.hypot( dr, dy ) || 1;
		segN.push( [ dy / l, - dr / l ] );

	}

	// rows: { r, y, n } — a sharp interior point contributes two rows
	const rows = [];
	for ( let i = 0; i < points.length; i ++ ) {

		const p = points[ i ];
		const before = segN[ i - 1 ];
		const after = segN[ i ];

		if ( ! before ) { rows.push( { r: p.r, y: p.y, n: after } ); continue; }
		if ( ! after ) { rows.push( { r: p.r, y: p.y, n: before } ); continue; }

		if ( p.sharp ) {

			rows.push( { r: p.r, y: p.y, n: before } );
			rows.push( { r: p.r, y: p.y, n: after } );

		} else {

			const nx = before[ 0 ] + after[ 0 ], ny = before[ 1 ] + after[ 1 ];
			const l = Math.hypot( nx, ny ) || 1;
			rows.push( { r: p.r, y: p.y, n: [ nx / l, ny / l ] } );

		}

	}

	const position = [], normal = [], index = [];
	const ringStride = segments + 1;

	for ( const row of rows ) {

		const onAxis = Math.abs( row.r ) < 1e-7;

		for ( let s = 0; s <= segments; s ++ ) {

			const a = ( s / segments ) * Math.PI * 2;
			const cos = Math.cos( a ), sin = Math.sin( a );
			position.push( row.r * cos, row.y, row.r * sin );

			if ( onAxis ) {

				// the meridian tangent vanishes on the axis; use the pole normal
				normal.push( 0, Math.sign( row.n[ 1 ] ) || 1, 0 );

			} else {

				normal.push( row.n[ 0 ] * cos, row.n[ 1 ], row.n[ 0 ] * sin );

			}

		}

	}

	for ( let i = 0; i < rows.length - 1; i ++ ) {

		// skip the degenerate band between two coincident rows (a sharp crease)
		if ( Math.abs( rows[ i ].r - rows[ i + 1 ].r ) < 1e-9 &&
			Math.abs( rows[ i ].y - rows[ i + 1 ].y ) < 1e-9 ) continue;

		for ( let s = 0; s < segments; s ++ ) {

			const a = i * ringStride + s;
			const b = a + ringStride;
			index.push( a, b, a + 1, b, b + 1, a + 1 );

		}

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
	geometry.setAttribute( 'normal', new THREE.Float32BufferAttribute( normal, 3 ) );
	geometry.setIndex( index );
	geometry.computeBoundingSphere();

	return geometry;

}
