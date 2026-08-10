import * as THREE from 'three/webgpu';
import WebGPU from 'three/examples/jsm/capabilities/WebGPU.js';
import GUI from 'lil-gui';

import { createStage } from './stage.js';
import { createWoodMaterial, GRAIN, END_GRAIN_TURNED, FLECK_TURNED } from './wood.js';
import { createPiece, PIECE_TYPES, HEIGHTS, BASE_DIAMETER } from './pieces/index.js';

if ( WebGPU.isAvailable() === false ) {

	document.getElementById( 'unsupported' ).classList.add( 'show' );

} else {

	main();

}

// Order and spacing follow reference/pieces.png, whose four pieces sit on a common
// baseline about 1.55 base diameters apart.
const ORDER = [ 'pawn', 'knight', 'rook', 'bishop' ];
const SPACING = 0.05796; // 2.229 base diameters, from tools/fit-pieces.mjs

async function main() {

	const stage = await createStage( {
		groundY: 0,
		exposure: 0.71,
		// Fitted to reference/pieces.png by tools/fit-pieces.mjs — 1.2 px RMS over
		// twelve constraints. Elevation is barely constrained by the measurements
		// (0 deg and 9 deg fit within 0.06 px of each other), so 4 deg is chosen as
		// the shallowest angle that still shows some table.
		view: { fov: 9.824, elevation: 4, distance: 0.38567, height: 0.01986, pan: 0.00321 },
		cyclorama: { back: 0.14, radius: 0.09, wall: 0.5, front: 1.0, width: 1.6 },
		lighting: { env: 1.25, key: 1.6, fill: 0.35, hemi: 0.1 },
		backdropLight: 0.85,
		ao: { radius: 0.0035, thickness: 0.008, scale: 1.5 },
	} );

	const { scene, camera, view, applyView, query } = stage;

	const single = query.get( 'piece' );
	const tone = query.get( 'tone' ) === 'dark' ? 'dark' : 'light';

	const group = new THREE.Group();
	scene.add( group );

	const types = single && PIECE_TYPES.includes( single ) ? [ single ] : ORDER;

	types.forEach( ( type, i ) => {

		// Each piece gets its own grain phase, so a row of them does not read as
		// stamped copies. Only the transform uniform differs, so they still share one
		// shader program.
		const material = createWoodMaterial( {
			tone,
			grain: { ...GRAIN, axis: 'y', offset: 8 + i * 0.17, phase: i * 0.41 },
			endGrain: END_GRAIN_TURNED,
			fleck: FLECK_TURNED,
		} );

		const piece = createPiece( type, material );
		piece.position.x = ( i - ( types.length - 1 ) / 2 ) * SPACING;
		group.add( piece );

	} );

	// ---------------------------------------------------------------------- gui

	const gui = new GUI( { title: 'pieces' } );
	gui.close();
	if ( query.get( 'gui' ) === '0' ) gui.hide();

	const cam = gui.addFolder( 'camera' );
	cam.add( view, 'fov', 6, 60, 0.25 ).onChange( applyView );
	cam.add( view, 'elevation', 0, 85, 0.25 ).onChange( applyView );
	cam.add( view, 'distance', 0.1, 1.5, 0.005 ).onChange( applyView );
	cam.add( view, 'height', - 0.02, 0.06, 0.0005 ).onChange( applyView );

	const render = gui.addFolder( 'render' );
	render.add( stage.renderer, 'toneMappingExposure', 0.2, 2, 0.01 );
	render.add( stage.aoPass.radius, 'value', 0.0005, 0.02, 0.0005 ).name( 'ao radius' );
	render.add( stage.aoPass.scale, 'value', 0.2, 4, 0.05 ).name( 'ao strength' );

	const info = Object.fromEntries( ORDER.map( ( t ) => [ t, `${( HEIGHTS[ t ] * 1000 ).toFixed( 1 )} mm` ] ) );
	const dims = gui.addFolder( 'dimensions' );
	for ( const k of Object.keys( info ) ) dims.add( info, k ).disable();
	dims.add( { base: `${( BASE_DIAMETER * 1000 ).toFixed( 1 )} mm` }, 'base' ).disable();

	const tris = group.children.reduce( ( n, m ) => n +
		( m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count ) / 3, 0 );
	console.log( 'pieces', types.join( ', ' ), '|', Math.round( tris ), 'triangles' );

	void camera;

}
