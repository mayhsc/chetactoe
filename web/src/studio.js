import * as THREE from 'three/webgpu';

function panel( color, intensity, width, height ) {

	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry( width, height ),
		new THREE.MeshBasicMaterial( { color: new THREE.Color( color ).multiplyScalar( intensity ), side: THREE.DoubleSide } )
	);
	return mesh;

}

/**
 * A tabletop product shot: one big overhead softbox slightly to the front-left,
 * a weak fill on the right to keep the shadow side from going flat, and a bright
 * white table below supplying the bounce that lifts the board's front rim.
 */
function studioScene() {

	const scene = new THREE.Scene();

	const shell = new THREE.Mesh(
		new THREE.BoxGeometry( 12, 12, 12 ),
		new THREE.MeshBasicMaterial( { color: 0x0e0d0c, side: THREE.BackSide } )
	);
	scene.add( shell );

	// Read off the reference: the backdrop is near-neutral white (so the rig is
	// neutral and all the warmth lives in the wood), the front face sits ~100 lum
	// below the top face (so the rig is strongly overhead with very little bounce
	// coming back at the camera), and the cast shadow runs forward-right (so the
	// key is above and behind-left).
	const key = panel( 0xfffdfa, 4.7, 7, 7 );
	key.position.set( - 1.15, 4.2, - 1.3 );
	key.lookAt( 0, 0, 0 );
	scene.add( key );

	// weak fill from the right-rear, dimmer than the key so the board falls off
	// to the right the way the reference does
	const fill = panel( 0xf6f8fb, 0.5, 6, 4 );
	fill.position.set( 4.2, 1.6, - 1.2 );
	fill.lookAt( 0, 0, 0 );
	scene.add( fill );

	// Low frontal fill. The reference puts the front face at 105 lum and the left
	// rim at 201 — both vertical, so nothing symmetric explains the gap. It takes a
	// weak source on the camera side, grazing low enough to lift the front face
	// without reaching the top face or the left rim.
	const front = panel( 0xfffaf4, 1.45, 8, 2.4 );
	front.position.set( 0.4, 0.45, 4.6 );
	front.lookAt( 0, 0, 0 );
	scene.add( front );

	// Bounce off the white table, arriving from below.
	const table = panel( 0xf7f5f2, 1.3, 14, 14 );
	table.rotation.x = - Math.PI / 2;
	table.position.y = - 0.6;
	scene.add( table );

	return scene;

}

export function createStudioEnvironment( renderer ) {

	const scene = studioScene();
	const pmrem = new THREE.PMREMGenerator( renderer );

	try {

		const target = pmrem.fromScene( scene, 0.03, 0.1, 40 );
		return target.texture;

	} finally {

		pmrem.dispose();
		scene.traverse( ( o ) => {

			if ( o.isMesh ) {

				o.geometry.dispose();
				o.material.dispose();

			}

		} );

	}

}

/**
 * Fallback for when PMREM cannot run: analytic lights shaped like the rig above.
 * Also carries the shadow caster in both paths, since IBL alone casts nothing.
 */
export function createLights() {

	const group = new THREE.Group();

	const key = new THREE.DirectionalLight( 0xfffefc, 1.9 );
	key.position.set( - 0.24, 0.42, - 0.19 );
	key.castShadow = true;
	key.shadow.mapSize.set( 2048, 2048 );
	key.shadow.radius = 6;
	key.shadow.bias = - 0.00015;
	key.shadow.normalBias = 0.0015;

	const c = key.shadow.camera;
	c.left = - 0.26; c.right = 0.26; c.top = 0.26; c.bottom = - 0.26;
	c.near = 0.05; c.far = 1.6;
	c.updateProjectionMatrix();

	group.add( key );

	const fill = new THREE.DirectionalLight( 0xeaf0f7, 0.35 );
	fill.position.set( 0.6, 0.3, - 0.2 );
	group.add( fill );

	const bounce = new THREE.HemisphereLight( 0xffffff, 0xf3efe8, 0.55 );
	group.add( bounce );

	group.userData.key = key;

	return group;

}
