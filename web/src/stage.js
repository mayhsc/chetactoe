import * as THREE from 'three/webgpu';
import { pass, mrt, output, transformedNormalView, vec3, vec4 } from 'three/tsl';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createStudioEnvironment, createLights } from './studio.js';

export const BACKDROP = 0xf2eee7;

/**
 * The table.
 *
 * A flat plane is fine when the camera looks down at a board, but the pieces are
 * shot almost level and a plane then puts a hard horizon straight across the
 * frame. The reference has none — it is a cyclorama, a sweep curving up out of the
 * table into a seamless back wall. `sweep` builds that: a floor running toward the
 * camera, a fillet, and a wall going up out of frame.
 */
function groundMode( opts ) {

	if ( ! opts.cyclorama ) return new THREE.PlaneGeometry( 3, 3 ).rotateX( - Math.PI / 2 );

	const { back = 0.16, radius = 0.10, wall = 0.6, front = 1.2, width = 2.0 } = opts.cyclorama;

	// profile in the ZY plane: floor -> fillet -> wall
	const shape = new THREE.Shape();
	shape.moveTo( front, 0 );
	shape.lineTo( - back + radius, 0 );
	shape.absarc( - back + radius, radius, radius, - Math.PI / 2, - Math.PI, true );
	shape.lineTo( - back, wall );
	// close it into a thin solid so ExtrudeGeometry has something to fill
	shape.lineTo( - back - 0.02, wall );
	shape.lineTo( - back - 0.02, - 0.02 );
	shape.lineTo( front, - 0.02 );

	const geometry = new THREE.ExtrudeGeometry( shape, {
		depth: width, curveSegments: 24, bevelEnabled: false,
	} );
	geometry.translate( 0, 0, - width / 2 );
	// shape X -> world +Z (toward the camera), shape Y -> world Y, extrusion -> X
	geometry.rotateY( - Math.PI / 2 );

	return geometry;

}

/**
 * The renderer, studio rig, ground and ambient-occlusion pass — everything the
 * board page and the pieces page share. Both are the same photograph setup, so
 * they should be lit by the same code rather than two copies that drift.
 *
 * @param {object} opts
 * @param {number} opts.groundY where the table sits
 * @param {object} opts.view `{ fov, elevation, distance, height, pan }`
 * @param {object} [opts.ao] overrides for the occlusion pass
 */
export async function createStage( opts ) {

	const query = new URLSearchParams( location.search );
	const forced = query.has( 'w' )
		? { w: Number( query.get( 'w' ) ), h: Number( query.get( 'h' ) ?? query.get( 'w' ) ) }
		: null;

	const transparent = opts.transparent || query.get( 'bg' ) === 'none';
	const host = opts.container ?? document.body;

	const renderer = new THREE.WebGPURenderer( { antialias: true, alpha: transparent } );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.toneMapping = THREE.NeutralToneMapping;
	renderer.toneMappingExposure = opts.exposure ?? 0.8;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	if ( transparent ) {

		// the page itself has to be see-through too, or the capture composites onto it
		renderer.setClearAlpha( 0 );
		document.documentElement.style.background = 'transparent';
		document.body.style.background = 'transparent';

	}
	host.appendChild( renderer.domElement );

	await renderer.init();

	const scene = new THREE.Scene();
	// Left null when transparent, so the page shows through behind the subject —
	// that is how the piece icons get cut out for the UI.
	scene.background = transparent ? null : new THREE.Color( opts.backdrop ?? BACKDROP );

	// Camera overrides, so a view can be inspected or captured headlessly without
	// dragging: ?fov= ?elev= ?dist= ?az= (azimuth in degrees around the subject).
	const view = { azimuth: 0, ...opts.view };
	for ( const [ key, param ] of Object.entries( { fov: 'fov', elevation: 'elev', distance: 'dist', azimuth: 'az', height: 'y' } ) ) {

		if ( query.has( param ) ) view[ key ] = Number( query.get( param ) );

	}

	const camera = new THREE.PerspectiveCamera( view.fov, 1, 0.02, 20 );

	const controls = new OrbitControls( camera, renderer.domElement );
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.minDistance = 0.05;
	controls.maxDistance = 1.5;

	function applyView() {

		const a = THREE.MathUtils.degToRad( view.elevation );
		const b = THREE.MathUtils.degToRad( view.azimuth ?? 0 );
		const r = Math.cos( a ) * view.distance;
		camera.fov = view.fov;
		camera.position.set( Math.sin( b ) * r, Math.sin( a ) * view.distance, Math.cos( b ) * r );
		camera.lookAt( view.pan ?? 0, view.height, 0 );
		camera.updateProjectionMatrix();
		controls.target.set( view.pan ?? 0, view.height, 0 );
		controls.update();

	}

	applyView();

	// ------------------------------------------------------------------ lighting

	const lights = createLights();
	scene.add( lights );

	let envFailure = null;
	try {

		scene.environment = createStudioEnvironment( renderer );
		scene.environmentIntensity = opts.lighting?.env ?? 0.38;

		// With IBL carrying the ambient, the analytic rig supplies the directional
		// falloff across the face plus the cast shadow, which IBL cannot do.
		//
		// The balance is not the same for both subjects. A board is a horizontal
		// slab under an overhead softbox, so most of what the camera sees is facing
		// straight into the key. Pieces are vertical and shot near-level: their lit
		// surfaces are edge-on to that same key, and with the board's settings they
		// come out around 40% too dark. Hence the per-page override.
		lights.userData.key.intensity = opts.lighting?.key ?? 2.9;
		lights.children.forEach( ( l ) => {

			if ( l.isHemisphereLight ) l.intensity = opts.lighting?.hemi ?? 0.06;
			if ( l.isDirectionalLight && l !== lights.userData.key ) l.intensity = opts.lighting?.fill ?? 0.12;

		} );

	} catch ( error ) {

		envFailure = error;
		console.warn( 'PMREM environment unavailable, falling back to analytic lights.', error );

	}

	// A cyclorama's wall is vertical and the key is overhead, so the sweep falls off
	// badly toward the top of frame — 21 lum below the reference — while the floor
	// runs bright. Real product shoots light the backdrop separately; this is that
	// light, aimed along the wall normal so it barely grazes the floor.
	if ( opts.cyclorama && opts.backdropLight !== 0 ) {

		const back = new THREE.DirectionalLight( 0xffffff, opts.backdropLight ?? 0.45 );
		back.position.set( 0.2, 0.16, 1.0 );
		scene.add( back );

	}

	const groundMaterial = new THREE.MeshStandardMaterial( { color: BACKDROP, roughness: 0.92, metalness: 0 } );
	const ground = new THREE.Mesh( groundMode( opts ), groundMaterial );
	ground.position.y = opts.groundY ?? 0;
	ground.receiveShadow = true;
	ground.visible = ! transparent;
	scene.add( ground );

	// -------------------------------------------------------- ambient occlusion

	// Image-based lighting carries no occlusion, so without this anything concave —
	// the board's V-grooves, the rook's notches, a piece meeting the table — stays
	// almost as bright as the surface around it. Radius and thickness are in
	// view-space units and the defaults (0.25 / 1) assume a scene a few units
	// across; this one is a fifth of a metre.
	const scenePass = pass( scene, camera );
	scenePass.setMRT( mrt( { output, normal: transformedNormalView } ) );

	const aoPass = ao( scenePass.getTextureNode( 'depth' ), scenePass.getTextureNode( 'normal' ), camera );
	aoPass.radius.value = opts.ao?.radius ?? 0.0045;
	aoPass.thickness.value = opts.ao?.thickness ?? 0.01;
	aoPass.distanceExponent.value = 1;
	aoPass.distanceFallOff.value = 1;
	aoPass.scale.value = opts.ao?.scale ?? 1.5;
	aoPass.samples.value = 16;

	const postProcessing = new THREE.PostProcessing( renderer );
	// The AO target is RedFormat, so the occlusion has to be broadcast off .r —
	// multiplying the colour by the texture directly zeroes green and blue.
	postProcessing.outputNode = scenePass.getTextureNode( 'output' )
		.mul( vec4( vec3( aoPass.getTextureNode().r ), 1 ) );

	// ------------------------------------------------------------------- resize

	function resize() {

		const box = opts.container && ! forced
			? opts.container.getBoundingClientRect()
			: { width: window.innerWidth, height: window.innerHeight };
		const w = forced ? forced.w : Math.max( 1, Math.round( box.width ) );
		const h = forced ? forced.h : Math.max( 1, Math.round( box.height ) );
		renderer.setSize( w, h, forced === null );
		camera.aspect = w / h;
		camera.updateProjectionMatrix();

	}

	resize();
	window.addEventListener( 'resize', resize );
	if ( opts.container ) new ResizeObserver( resize ).observe( opts.container );

	const onFrame = [];

	renderer.setAnimationLoop( () => {

		controls.update();
		postProcessing.render();
		for ( const fn of onFrame ) fn();

	} );

	// capture hook for tools/shot.sh, and the P key
	window.__snap = async () => {

		await postProcessing.renderAsync();
		return renderer.domElement.toDataURL( 'image/png' );

	};

	window.addEventListener( 'keydown', async ( e ) => {

		if ( e.key !== 'p' ) return;
		const a = document.createElement( 'a' );
		a.href = await window.__snap();
		a.download = 'render.png';
		a.click();

	} );

	window.__ready = true;
	window.__envFailure = envFailure ? String( envFailure ) : null;

	return { renderer, scene, camera, controls, lights, ground, aoPass, postProcessing, view, applyView, query, forced, onFrame, resize };

}
