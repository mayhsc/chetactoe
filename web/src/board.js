import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// All dimensions in metres. Size is arbitrary — only the ratios matter, since the
// camera distance was solved against it — so 200 mm square is the anchor and
// everything else comes from tools/fit-camera.mjs, which solves the border margin
// and the camera jointly against the ten grid grooves measured off the reference.
// That lands the playing field at 4 x 44.69 mm.
export const BOARD = {
	size: 0.2,
	thickness: 0.0265, // from the reference's ~60 px front face; a chunky board
	cornerRadius: 0.009, // plan-view radius of the four corners
	edgeFillet: 0.0024, // round-over on the top and bottom rims
	margin: 0.01062, // board edge -> centreline of the outer groove
	cells: 4,
	// A 90 degree V-bit cut, so the surface width is twice the depth. Measured off
	// the reference, where the groove reads ~2.4 mm across: one wall drops to 92
	// lum while the opposite lip peaks at 241.
	grooveDepth: 0.0012,
	lipFillet: 0.00035, // sanded round-over where the groove meets the surface
};

/**
 * Rounded square, drawn in XY so ExtrudeGeometry can bevel the rims.
 */
function roundedSquare( size, radius ) {

	const h = size / 2;
	const s = h - radius;
	const shape = new THREE.Shape();

	shape.moveTo( - s, - h );
	shape.lineTo( s, - h );
	shape.absarc( s, - s, radius, - Math.PI / 2, 0, false );
	shape.lineTo( h, s );
	shape.absarc( s, s, radius, 0, Math.PI / 2, false );
	shape.lineTo( - s, h );
	shape.absarc( - s, s, radius, Math.PI / 2, Math.PI, false );
	shape.lineTo( - h, - s );
	shape.absarc( - s, - s, radius, Math.PI, Math.PI * 1.5, false );

	return shape;

}

/**
 * Cross-section of the groove cutter, in XY with the board's top surface at y = 0.
 *
 * A 90 degree V, but with a fillet of radius `f` blended into the top surface on
 * both sides so the lip catches a soft highlight instead of a hard terminator —
 * that thin bright line along every groove is the main thing selling the
 * "sanded solid object" read in the reference.
 */
function grooveProfile( depth, fillet, rise ) {

	const d = depth;
	const f = fillet;
	// Fillet tangent to y = 0 and to the 45 degree wall y = x - d.
	const cx = d + f * ( Math.SQRT2 - 1 ); // circle centre, at (cx, -f)
	const k = f * ( 1 - Math.SQRT1_2 ); // wall tangency point: (d - k, -k)

	const shape = new THREE.Shape();
	shape.moveTo( 0, - d );
	shape.lineTo( d - k, - k );
	shape.absarc( cx, - f, f, Math.PI * 0.75, Math.PI * 0.5, true );
	shape.lineTo( cx, rise );
	shape.lineTo( - cx, rise );
	shape.absarc( - cx, - f, f, Math.PI * 0.5, Math.PI * 0.25, true );
	shape.lineTo( 0, - d );

	return shape;

}

/**
 * Solid slab: rounded-square plan, filleted top and bottom rims, top face at y = 0.
 */
function slabGeometry( { size, thickness, cornerRadius, edgeFillet } ) {

	// ExtrudeGeometry's bevel *expands* the mid-section outline outward by
	// bevelSize and leaves the caps on the outline itself, so the shape has to be
	// shrunk by the fillet for the widest section to land on `size`.
	const shape = roundedSquare( size - edgeFillet * 2, cornerRadius - edgeFillet );

	const geometry = new THREE.ExtrudeGeometry( shape, {
		depth: thickness - edgeFillet * 2,
		curveSegments: 24,
		bevelEnabled: true,
		bevelThickness: edgeFillet,
		bevelSize: edgeFillet,
		bevelSegments: 6,
	} );

	geometry.rotateX( - Math.PI / 2 ); // extrusion axis +Z -> +Y
	geometry.translate( 0, - ( thickness - edgeFillet ), 0 ); // top face to y = 0

	return geometry;

}

/**
 * The 2 x (cells + 1) groove cutters. Every cutter overshoots the playing field
 * by `overshoot`, which keeps the CSG free of coplanar end caps; for the inner
 * lines the overshoot lands inside the border groove, and for the border lines
 * it buries itself in the bottom of the perpendicular groove.
 */
function grooveCutters( { size, margin, cells, grooveDepth, lipFillet } ) {

	const half = size / 2 - margin; // outer groove centreline
	const pitch = ( half * 2 ) / cells;
	const overshoot = 0.0008;
	const length = half * 2 + overshoot * 2;

	const profile = grooveProfile( grooveDepth, lipFillet, 0.003 );
	const base = new THREE.ExtrudeGeometry( profile, {
		depth: length,
		curveSegments: 6,
		bevelEnabled: false,
	} );
	base.translate( 0, 0, - length / 2 ); // extruded along +Z, centred

	const cutters = [];

	for ( let i = 0; i <= cells; i ++ ) {

		const offset = - half + i * pitch;

		// running along Z (appear as vertical lines from the reference camera)
		const alongZ = base.clone();
		alongZ.translate( offset, 0, 0 );
		cutters.push( alongZ );

		// running along X
		const alongX = base.clone();
		alongX.rotateY( Math.PI / 2 );
		alongX.translate( 0, 0, offset );
		cutters.push( alongX );

	}

	return cutters;

}

export function createBoardGeometry( params = BOARD ) {

	const evaluator = new Evaluator();
	evaluator.attributes = [ 'position', 'normal' ];
	evaluator.useGroups = false;

	let result = new Brush( slabGeometry( params ) );
	result.updateMatrixWorld();

	for ( const cutter of grooveCutters( params ) ) {

		const brush = new Brush( cutter );
		brush.updateMatrixWorld();
		result = evaluator.evaluate( result, brush, SUBTRACTION );
		result.updateMatrixWorld();

	}

	// 30 degrees smooths the rim fillets and the groove-lip arcs while keeping the
	// square rims, the groove walls and the V bottoms crisp.
	const geometry = toCreasedNormals( result.geometry, THREE.MathUtils.degToRad( 30 ) );
	geometry.computeBoundingSphere();

	return geometry;

}
