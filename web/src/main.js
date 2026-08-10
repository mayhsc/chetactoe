import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import GUI from 'lil-gui';

import { createStage } from './stage.js';
import { BOARD, createBoardGeometry } from './board.js';
import { GRAIN, WOOD, END_GRAIN_TURNED, FLECK_TURNED, grainMatrix, createWoodMaterial } from './wood.js';
import { createPiece, PIECE_TYPES, HEIGHTS } from './pieces/index.js';

if ( WebGPU.isAvailable() === false ) {

	document.getElementById( 'unsupported' ).classList.add( 'show' );

} else {

	main();

}

/** Centre of cell (col, row), indexed from the far-left corner of the playing field. */
export function cellCentre( col, row, board = BOARD ) {

	const half = board.size / 2 - board.margin;
	const pitch = ( half * 2 ) / board.cells;
	return [ - half + pitch * ( col + 0.5 ), - half + pitch * ( row + 0.5 ) ];

}

// A sample arrangement, enough to show the pieces sitting at the right scale.
const LAYOUT = [
	{ type: 'rook', tone: 'light', col: 0, row: 3, turn: 0.10 },
	{ type: 'knight', tone: 'light', col: 1, row: 2, turn: - 0.25 },
	{ type: 'pawn', tone: 'light', col: 3, row: 3, turn: 0 },
	{ type: 'bishop', tone: 'dark', col: 2, row: 0, turn: 0.40 },
	{ type: 'knight', tone: 'dark', col: 0, row: 0, turn: Math.PI + 0.2 },
	{ type: 'pawn', tone: 'dark', col: 2, row: 1, turn: 0 },
];

async function main() {

	const stage = await createStage( {
		groundY: - BOARD.thickness,
		exposure: 0.80,
		// Fitted to reference/target.png by tools/fit-camera.mjs — 3.9 px RMS over
		// sixteen constraints, with the ten grid grooves landing within 3 px. A long
		// lens from well above, not the ~40 degrees the photo suggests by eye, and
		// the board sits slightly left of frame centre, hence the small pan.
		view: { fov: 19.617, elevation: 62.373, distance: 0.59432, height: - 0.02484, pan: 0.00263 },
		lighting: { env: 0.38, key: 2.9, fill: 0.12, hemi: 0.06 },
		ao: { radius: 0.0045, thickness: 0.01, scale: 1.5 },
	} );

	const { scene, view, applyView, query } = stage;

	// ------------------------------------------------------------------- board

	const geometry = createBoardGeometry( BOARD );
	const material = createWoodMaterial();
	const board = new THREE.Mesh( geometry, material );
	board.castShadow = true;
	board.receiveShadow = true;
	scene.add( board );

	// ------------------------------------------------------------------ pieces

	const pieces = new THREE.Group();
	pieces.visible = query.get( 'pieces' ) !== '0';
	scene.add( pieces );

	LAYOUT.forEach( ( spec, i ) => {

		// Each piece gets its own grain phase so a set does not read as stamped
		// copies. Only the transform uniform differs, so they still share a program.
		const pieceMaterial = createWoodMaterial( {
			tone: spec.tone,
			grain: { ...GRAIN, axis: 'y', offset: 8 + i * 0.19, phase: i * 0.53 },
			endGrain: END_GRAIN_TURNED,
			fleck: FLECK_TURNED,
		} );

		const mesh = createPiece( spec.type, pieceMaterial, { rotation: spec.turn } );
		const [ x, z ] = cellCentre( spec.col, spec.row );
		// the piece's origin is the underside of its base, and the board's top face
		// is y = 0, so placing one is just this
		mesh.position.set( x, 0, z );
		pieces.add( mesh );

	} );

	// --------------------------------------------------------------------- gui

	const gui = new GUI( { title: 'board' } );
	gui.close();
	if ( query.get( 'gui' ) === '0' ) gui.hide();

	gui.add( pieces, 'visible' ).name( 'pieces' );

	const grain = gui.addFolder( 'grain' );
	const syncGrain = () => ( material.transformationMatrix = grainMatrix( GRAIN ) );
	grain.add( GRAIN, 'scale', 1, 20, 0.05 ).onChange( syncGrain );
	grain.add( GRAIN, 'offset', 0.5, 30, 0.1 ).onChange( syncGrain );
	grain.add( GRAIN, 'rotate' ).onChange( syncGrain );

	const look = gui.addFolder( 'wood' );
	look.addColor( WOOD, 'lightGrainColor' ).onChange( ( v ) => material.lightGrainColor.set( v ) );
	look.addColor( WOOD, 'darkGrainColor' ).onChange( ( v ) => material.darkGrainColor.set( v ) );
	look.add( material, 'ringBias', 0, 1, 0.01 );
	look.add( { rings: Math.round( 1 / material.ringThickness ) }, 'rings', 8, 90, 1 )
		.onChange( ( v ) => ( material.ringThickness = 1 / v ) );
	look.add( material, 'splotchIntensity', 0, 4, 0.01 );
	look.add( material, 'cellSize', 0, 6, 0.02 );
	look.add( material, 'centerSize', 0, 0.2, 0.001 ).name( 'large warp' );
	look.add( material, 'smallWarpStrength', 0, 0.04, 0.0005 ).name( 'small warp' );
	look.add( material, 'clearcoatNode', 0, 1, 0.01 ).name( 'clearcoat' );
	look.add( material, 'roughness', 0, 1, 0.01 );
	look.add( material, 'clearcoatRoughness', 0, 1, 0.01 );

	const cam = gui.addFolder( 'camera' );
	cam.add( view, 'fov', 12, 60, 0.5 ).onChange( applyView );
	cam.add( view, 'elevation', 5, 85, 0.5 ).onChange( applyView );
	cam.add( view, 'distance', 0.15, 1, 0.005 ).onChange( applyView );
	cam.add( view, 'height', - 0.05, 0.03, 0.001 ).onChange( applyView );
	cam.add( view, 'pan', - 0.02, 0.02, 0.0005 ).onChange( applyView );
	cam.add( { reset: applyView }, 'reset' );

	const render = gui.addFolder( 'render' );
	render.add( stage.renderer, 'toneMappingExposure', 0.2, 2.5, 0.01 );
	render.add( { env: scene.environmentIntensity }, 'env', 0, 3, 0.01 )
		.onChange( ( v ) => ( scene.environmentIntensity = v ) );
	render.add( stage.lights.userData.key, 'intensity', 0, 6, 0.05 ).name( 'key light' );
	render.add( stage.aoPass.radius, 'value', 0.0005, 0.02, 0.0005 ).name( 'ao radius' );
	render.add( stage.aoPass.scale, 'value', 0.2, 4, 0.05 ).name( 'ao strength' );

	const tris = ( g ) => ( g.index ? g.index.count : g.attributes.position.count ) / 3;
	console.log( 'board', Math.round( tris( geometry ) ), 'triangles |',
		PIECE_TYPES.map( ( t ) => `${t} ${( HEIGHTS[ t ] * 1000 ).toFixed( 1 )}mm` ).join( ', ' ) );

}
