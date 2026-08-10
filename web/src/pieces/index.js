import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { revolve } from '../lathe.js';
import { PROFILES, HEIGHTS, BASE_R, BASE_DIAMETER } from './profiles.js';
import { headGeometry, eyeGeometry, jawGeometry } from './knight.js';

export { HEIGHTS, BASE_R, BASE_DIAMETER };
export const PIECE_TYPES = [ 'pawn', 'knight', 'bishop', 'rook' ];

const RADIAL_SEGMENTS = 128;

/** Rook crown: eight notches and a central recess, measured off the reference. */
export const ROOK_CROWN = {
	merlons: 8, // merlon centres measured at -44, 0 and +43 degrees across a 40 px crown
	notchWidth: 0.44, // fraction of the angular pitch taken by each notch
	notchDepth: 0.105, // fraction of piece height, cut down from the rim
	recessRadius: 0.42, // fraction of the crown radius
	recessDepth: 0.075,
};

/**
 * Bishop mitre slit: the diagonal saw cut across the head.
 *
 * It has to stop inside the piece. A slab passing right through would sever the
 * finial from the body — on a real bishop the kerf enters the front and dies out
 * before the back, leaving a crescent of material carrying the top.
 */
export const BISHOP_SLIT = {
	angle: 34, // degrees from vertical, matching the lean in the reference
	width: 0.0016, // kerf
	at: 0.74, // fraction of piece height the cut passes through
	overrun: 0.20, // how far past the axis it reaches, in base radii
};

function evaluator() {

	const e = new Evaluator();
	e.attributes = [ 'position', 'normal' ];
	e.useGroups = false;
	return e;

}

function cut( evalr, target, geometry, op = SUBTRACTION ) {

	const brush = new Brush( geometry );
	brush.updateMatrixWorld();
	const out = evalr.evaluate( target, brush, op );
	out.updateMatrixWorld();
	return out;

}

function rookFeatures( evalr, body, H ) {

	const R = BASE_R;
	const crownR = R * 0.832;
	const { merlons, notchWidth, notchDepth, recessRadius, recessDepth } = ROOK_CROWN;

	// central recess, drilled down from the rim
	const recess = new THREE.CylinderGeometry(
		crownR * recessRadius, crownR * recessRadius, recessDepth * H * 2, 64 );
	recess.translate( 0, H, 0 );
	body = cut( evalr, body, recess );

	// Notches: one radial slot per gap, swung around the axis. Each runs from
	// outside the crown inward to just short of the centre — a slot spanning the
	// full diameter would cut the opposite gap at the same time and dig the middle
	// deeper than the recess.
	const pitch = ( Math.PI * 2 ) / merlons;
	const arc = pitch * notchWidth;
	const w = 2 * crownR * Math.sin( arc / 2 );
	const depth = notchDepth * H;
	const reach = crownR * 1.4;

	for ( let i = 0; i < merlons; i ++ ) {

		const notch = new THREE.BoxGeometry( w, depth * 2, reach );
		notch.translate( 0, H, reach / 2 + crownR * 0.15 ); // outward, clear of the axis
		notch.rotateY( i * pitch );
		body = cut( evalr, body, notch );

	}

	return body;

}

function bishopFeatures( evalr, body, H ) {

	const { angle, width, at, overrun } = BISHOP_SLIT;
	const length = BASE_R * 2.2;

	const slit = new THREE.BoxGeometry( length, width, BASE_R * 4 );
	// shift along its own axis so the far end stops `overrun` past the centre
	slit.translate( - length / 2 + BASE_R * overrun, 0, 0 );
	slit.rotateZ( THREE.MathUtils.degToRad( 90 - angle ) );
	slit.translate( 0, at * H, 0 );

	return cut( evalr, body, slit );

}

function knightFeatures( evalr, body, H ) {

	body = cut( evalr, body, headGeometry( H ), ADDITION );

	// Both cheeks get the same carving, mirrored through the piece's plane.
	for ( const feature of [ eyeGeometry( H ), jawGeometry( H ) ] ) {

		for ( const side of [ 1, - 1 ] ) {

			const g = feature.geometry.clone();
			g.translate( 0, 0, side * feature.offset );
			body = cut( evalr, body, g );

		}

	}

	return body;

}

/**
 * Geometry for one piece, in a local frame whose origin is the centre of the
 * base's underside and whose +Y is up — so placing one is just `position.set(x, 0, z)`.
 */
export function createPieceGeometry( type, { height = HEIGHTS[ type ], segments = RADIAL_SEGMENTS } = {} ) {

	if ( ! PROFILES[ type ] ) throw new Error( `unknown piece "${type}"` );

	const turned = revolve( PROFILES[ type ]( height, BASE_R ), segments );

	let geometry = turned;
	if ( type === 'rook' || type === 'bishop' || type === 'knight' ) {

		const evalr = evaluator();
		let body = new Brush( turned );
		body.updateMatrixWorld();

		if ( type === 'rook' ) body = rookFeatures( evalr, body, height );
		if ( type === 'bishop' ) body = bishopFeatures( evalr, body, height );
		if ( type === 'knight' ) body = knightFeatures( evalr, body, height );

		// 32 degrees keeps the milled edges, notch walls and slit crisp while letting
		// the turned surfaces and the head's bevel stay smooth
		geometry = toCreasedNormals( body.geometry, THREE.MathUtils.degToRad( 32 ) );

	}

	geometry.computeBoundingSphere();
	geometry.computeBoundingBox();
	return geometry;

}

const cache = new Map();

/** Cached geometry — the CSG work is worth doing once per piece type. */
export function pieceGeometry( type, opts ) {

	const key = type + JSON.stringify( opts ?? {} );
	if ( ! cache.has( key ) ) cache.set( key, createPieceGeometry( type, opts ) );
	return cache.get( key );

}

/**
 * A placeable piece.
 *
 * @param {string} type one of PIECE_TYPES
 * @param {THREE.Material} material
 * @param {object} [opts] `{ height, segments, rotation }`
 */
export function createPiece( type, material, opts = {} ) {

	const mesh = new THREE.Mesh( pieceGeometry( type, {
		height: opts.height ?? HEIGHTS[ type ],
		segments: opts.segments ?? RADIAL_SEGMENTS,
	} ), material );

	mesh.name = type;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	if ( opts.rotation !== undefined ) mesh.rotation.y = opts.rotation;

	return mesh;

}
