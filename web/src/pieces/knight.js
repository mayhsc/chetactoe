import * as THREE from 'three';
import { HEIGHTS } from './profiles.js';

/**
 * The knight's head.
 *
 * This is the one piece in the set that is not turned, and it is made the way a
 * real one is: the side profile is milled out of a flat blank and the edges are
 * then rounded over. So the model is an extruded outline with a generous bevel,
 * which is both authentic and lets the narrow ear resolve into a rounded ridge
 * rather than a fin — at 2 mm across, the ear is barely wider than the bevel.
 *
 * The outline is traced from reference/pieces.png (see `tools/profile.mjs
 * reference/pieces.png knight outline`), then hand-smoothed onto the control
 * points below: the raw trace is quantised to one pixel over a 159 px piece and
 * its staircase would show up directly in the bevel.
 *
 * Coordinates are (x, t) as fractions of the piece height, x measured from the
 * turning axis. The muzzle points toward -X, matching the reference.
 */
export const HEAD_OUTLINE = [
	// ear, then down the crest and mane at the back of the head
	[ - 0.045, 1.000 ],
	[ - 0.008, 0.950 ],
	[ 0.060, 0.928 ],
	[ 0.120, 0.893 ],
	[ 0.170, 0.848 ],
	[ 0.205, 0.800 ],
	[ 0.232, 0.750 ],
	[ 0.252, 0.700 ],
	[ 0.258, 0.640 ],
	[ 0.258, 0.578 ],
	// Underside. This has to hug the jaw line the trace found — the silhouette
	// jumps from x -0.082 at t 0.551 to x -0.258 at t 0.563, which is the jaw
	// overhanging the neck — and then duck *well* inside the turned stem so the
	// union buries it. An earlier version dipped to the stem's own surface, which
	// both filled in the space under the jaw and left the head reading as a dome.
	[ 0.150, 0.545 ],
	[ 0.060, 0.515 ],
	[ - 0.040, 0.505 ],
	[ - 0.120, 0.520 ],
	// jaw and muzzle
	[ - 0.190, 0.545 ],
	[ - 0.246, 0.566 ],
	[ - 0.292, 0.588 ],
	[ - 0.312, 0.618 ],
	[ - 0.314, 0.648 ],
	[ - 0.299, 0.674 ],
	[ - 0.272, 0.700 ],
	[ - 0.245, 0.729 ],
	[ - 0.218, 0.762 ],
	[ - 0.196, 0.800 ],
	[ - 0.174, 0.834 ],
	[ - 0.150, 0.856 ],
	// brow and forehead, near-vertical in the reference
	[ - 0.129, 0.884 ],
	[ - 0.126, 0.940 ],
	[ - 0.093, 0.978 ],
];

/** Eye: a shallow drilled dimple, clearly visible in the reference. */
export const EYE = { x: - 0.140, t: 0.822, radius: 0.030, depth: 0.016 };

export const HEAD = {
	width: 0.0130, // across the cheeks, ~48% of the base diameter
	bevel: 0.0016, // round-over on the milled edges; larger erodes the muzzle away
};

/**
 * Shrinks a closed polygon inward by `d`.
 *
 * Needed because ExtrudeGeometry's bevel expands the outline outward by
 * `bevelSize` rather than insetting the caps, so extruding the traced silhouette
 * directly returns a head a full bevel too big in every direction — 6% too tall.
 * What the bevel actually wants as input is the eroded core; rounding it back over
 * then reproduces the traced silhouette.
 *
 * Offsetting every edge and intersecting neighbours is the easy part. The ear is
 * only about 2 mm across, less than the bevel, so it collapses and turns itself
 * inside out; the reversal pass drops those points, which leaves a rounded nub —
 * which is what a rounded-over ear should look like anyway.
 */
export function insetPolygon( points, d ) {

	const n = points.length;
	if ( n < 4 ) return points;

	let area = 0;
	for ( let i = 0; i < n; i ++ ) {

		const a = points[ i ], b = points[ ( i + 1 ) % n ];
		area += a.x * b.y - b.x * a.y;

	}

	const sign = area >= 0 ? 1 : - 1; // +1 when counter-clockwise

	// inward-offset line for each edge, as point + normal
	const edges = [];
	for ( let i = 0; i < n; i ++ ) {

		const a = points[ i ], b = points[ ( i + 1 ) % n ];
		const dx = b.x - a.x, dy = b.y - a.y;
		const len = Math.hypot( dx, dy ) || 1;
		const nx = ( - dy / len ) * sign, ny = ( dx / len ) * sign;
		edges.push( { ax: a.x + nx * d, ay: a.y + ny * d, dx: dx / len, dy: dy / len } );

	}

	const out = [];
	for ( let i = 0; i < n; i ++ ) {

		const e0 = edges[ ( i - 1 + n ) % n ];
		const e1 = edges[ i ];
		const cross = e0.dx * e1.dy - e0.dy * e1.dx;

		if ( Math.abs( cross ) < 1e-9 ) {

			out.push( { x: e1.ax, y: e1.ay } ); // parallel: the offset lines coincide
			continue;

		}

		const t = ( ( e1.ax - e0.ax ) * e1.dy - ( e1.ay - e0.ay ) * e1.dx ) / cross;
		out.push( { x: e0.ax + e0.dx * t, y: e0.ay + e0.dy * t } );

	}

	// drop points where the outline folded back on itself
	const keep = out.filter( ( p, i ) => {

		const q = out[ ( i + 1 ) % out.length ];
		const a = points[ i ], b = points[ ( i + 1 ) % n ];
		const nd = Math.hypot( q.x - p.x, q.y - p.y );
		if ( nd < 1e-12 ) return false;
		const od = Math.hypot( b.x - a.x, b.y - a.y ) || 1;
		return ( ( q.x - p.x ) * ( b.x - a.x ) + ( q.y - p.y ) * ( b.y - a.y ) ) / ( nd * od ) > 0;

	} );

	return keep.length > 8 ? keep : out;

}

/**
 * Closed, smoothed outline as a THREE.Shape in metres.
 *
 * @param {number} [H] piece height
 * @param {number} [inset] shrink the outline by this much; pass the bevel size so
 * the rounded-over result lands back on the traced silhouette
 */
export function headShape( H = HEIGHTS.knight, inset = 0, samples = 220 ) {

	const pts = HEAD_OUTLINE.map( ( [ x, t ] ) => new THREE.Vector3( x * H, t * H, 0 ) );

	// Centripetal Catmull-Rom: uniform parametrisation overshoots badly around the
	// muzzle, where three control points turn through nearly 180 degrees.
	const curve = new THREE.CatmullRomCurve3( pts, true, 'centripetal', 0.5 );
	let sampled = curve.getPoints( samples ).map( ( p ) => ( { x: p.x, y: p.y } ) );

	if ( inset > 0 ) sampled = insetPolygon( sampled, inset );

	const shape = new THREE.Shape();
	shape.moveTo( sampled[ 0 ].x, sampled[ 0 ].y );
	for ( let i = 1; i < sampled.length; i ++ ) shape.lineTo( sampled[ i ].x, sampled[ i ].y );
	shape.closePath();

	return shape;

}

/**
 * The head as a solid, centred on Z and positioned in the piece's local frame
 * (origin at the base centre, +Y up).
 */
export function headGeometry( H = HEIGHTS.knight, head = HEAD ) {

	const depth = Math.max( 0.0005, head.width - head.bevel * 2 );

	const geometry = new THREE.ExtrudeGeometry( headShape( H, head.bevel ), {
		depth,
		curveSegments: 1, // the outline is already sampled
		bevelEnabled: true,
		bevelThickness: head.bevel,
		bevelSize: head.bevel,
		bevelSegments: 5,
	} );

	// ExtrudeGeometry runs along +Z from z=0; centre it on the piece's axis
	geometry.translate( 0, 0, - depth / 2 );

	return geometry;

}

/**
 * The carved jaw line.
 *
 * Without it the head is a bare wedge of wood: the silhouette can be right to the
 * pixel and it still will not read as a horse. In the reference a strong curved
 * groove runs from behind the eye down to the chin, separating cheek from jaw, and
 * that single line is most of what makes the shape legible.
 *
 * Cut with a partial torus, which is a close enough fit to the arc and far simpler
 * than lofting a ribbon along a spline. Positions are in millimetres of the piece,
 * matching how the head outline was measured.
 */
export const JAW = {
	centre: [ 2.0, 31.0 ], // mm, in the head's XY plane
	radius: 9.0,
	tube: 0.9,
	from: 150, // degrees
	sweep: 65,
	depth: 0.7, // how far into the cheek
};

export function jawGeometry( H = HEIGHTS.knight, head = HEAD, jaw = JAW ) {

	const mm = H / 44.5; // the numbers above were read at this piece height
	const geometry = new THREE.TorusGeometry(
		jaw.radius * mm, jaw.tube * mm, 12, 48, THREE.MathUtils.degToRad( jaw.sweep ) );

	geometry.rotateZ( THREE.MathUtils.degToRad( jaw.from ) );
	geometry.translate( jaw.centre[ 0 ] * mm, jaw.centre[ 1 ] * mm, 0 );

	// ring plane offset so the tube bites `depth` into the flat cheek
	return { geometry, offset: head.width / 2 + jaw.tube * mm - jaw.depth * mm };

}

/** Small sphere used to drill the eye, in the same local frame. */
export function eyeGeometry( H = HEIGHTS.knight, head = HEAD, eye = EYE ) {

	const r = eye.radius * H;
	const geometry = new THREE.SphereGeometry( r, 24, 16 );
	// sunk into each cheek by `depth`, so it reads as a drilled dimple
	geometry.translate( eye.x * H, eye.t * H, 0 );
	return { geometry, r, offset: head.width / 2 + r - eye.depth * H };

}
