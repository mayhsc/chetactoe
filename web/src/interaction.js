import * as THREE from 'three/webgpu';

import { cellCentre, squareAt, squareName, BOARD } from './scene.js';

const LIFT = 0.006; // how far a piece rises off the board while carried
const SNAP_MS = 130; // settle animation on drop or rejection

/**
 * Colour of the cell marker. Green while the target is free, muted red when it is
 * taken — dropping onto an occupied square is refused, so it needs to look refused
 * before the user lets go rather than after.
 */
const MARK_FREE = 0x5f7040;
const MARK_BLOCKED = 0xa8574a;

/**
 * A flat marker sitting just above the board face. The board is one mesh, so a cell
 * cannot be tinted in place — an overlay quad is the only way to mark one.
 */
function createMarker() {

	const half = BOARD.size / 2 - BOARD.margin;
	const pitch = ( half * 2 ) / BOARD.cells;
	const size = pitch * 0.86;

	const geometry = new THREE.PlaneGeometry( size, size );
	geometry.rotateX( - Math.PI / 2 );

	const material = new THREE.MeshBasicMaterial( {
		color: MARK_FREE,
		transparent: true,
		opacity: 0.3,
		depthWrite: false,
	} );

	const mesh = new THREE.Mesh( geometry, material );
	mesh.position.y = 0.0002; // clear of the board face, under any piece
	mesh.renderOrder = 2;
	mesh.visible = false;
	mesh.raycast = () => {}; // never pick the marker itself

	return mesh;

}

/**
 * Free-movement drag: pick any piece up, drop it on any empty square.
 *
 * @param {object} opts
 * @param {object} opts.stage from createStage()
 * @param {THREE.Group} opts.pieces
 * @param {function} opts.onMove called with { mesh, from, to } after a completed move
 * @param {function} [opts.onPickup]
 */
export function createDragController( { stage, pieces, onMove, onPickup } ) {

	const { renderer, camera, controls, scene } = stage;
	const canvas = renderer.domElement;

	const marker = createMarker();
	scene.add( marker );

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	// the board's top face; where a dragged piece tracks the pointer
	const plane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0 );
	const hit = new THREE.Vector3();

	let enabled = true;
	let drag = null; // { mesh, from, offsetX, offsetZ, pointerId, saved }
	let settle = null; // { mesh, from, to, t0 }

	function setPointer( event ) {

		const r = canvas.getBoundingClientRect();
		pointer.x = ( ( event.clientX - r.left ) / r.width ) * 2 - 1;
		pointer.y = - ( ( event.clientY - r.top ) / r.height ) * 2 + 1;
		raycaster.setFromCamera( pointer, camera );

	}

	const pieceUnderPointer = () => raycaster.intersectObjects( pieces.children, false )[ 0 ]?.object ?? null;

	const occupant = ( square, ignore ) =>
		pieces.children.find( ( m ) => m !== ignore && m.userData.square === square ) ?? null;

	function boardPoint() {

		return raycaster.ray.intersectPlane( plane, hit ) ? hit : null;

	}

	// ------------------------------------------------------------------ gestures

	function onPointerDown( event ) {

		if ( ! enabled || drag || event.button !== 0 ) return;

		setPointer( event );
		const mesh = pieceUnderPointer();
		if ( ! mesh ) return; // let OrbitControls have the gesture

		const point = boardPoint();
		if ( ! point ) return;

		// Freeze the camera for the duration, or the board spins under the piece.
		// The saved values are restored on release rather than assumed to be true —
		// the view-control toggles may have turned some of them off.
		const saved = {
			rotate: controls.enableRotate,
			zoom: controls.enableZoom,
			pan: controls.enablePan,
		};
		controls.enableRotate = controls.enableZoom = controls.enablePan = false;

		drag = {
			mesh,
			from: mesh.userData.square,
			offsetX: mesh.position.x - point.x,
			offsetZ: mesh.position.z - point.z,
			pointerId: event.pointerId,
			saved,
		};

		mesh.position.y = LIFT;
		mesh.renderOrder = 1;
		canvas.setPointerCapture( event.pointerId );
		canvas.style.cursor = 'grabbing';
		onPickup?.( mesh );
		event.preventDefault();

	}

	function onPointerMove( event ) {

		if ( ! enabled ) return;

		setPointer( event );

		if ( ! drag ) {

			canvas.style.cursor = pieceUnderPointer() ? 'grab' : '';
			return;

		}

		const point = boardPoint();
		if ( ! point ) return;

		drag.mesh.position.x = point.x + drag.offsetX;
		drag.mesh.position.z = point.z + drag.offsetZ;

		const square = squareAt( drag.mesh.position.x, drag.mesh.position.z );

		if ( square ) {

			const name = squareName( square.col, square.row );
			const blocked = occupant( name, drag.mesh ) !== null;
			const [ cx, cz ] = cellCentre( square.col, square.row );
			marker.position.x = cx;
			marker.position.z = cz;
			marker.material.color.setHex( blocked ? MARK_BLOCKED : MARK_FREE );
			marker.material.opacity = blocked ? 0.38 : 0.3;
			marker.visible = true;

		} else {

			marker.visible = false;

		}

	}

	function onPointerUp( event ) {

		if ( ! drag || event.pointerId !== drag.pointerId ) return;

		const { mesh, from, saved } = drag;
		marker.visible = false;
		canvas.style.cursor = '';
		if ( canvas.hasPointerCapture( event.pointerId ) ) canvas.releasePointerCapture( event.pointerId );

		const square = squareAt( mesh.position.x, mesh.position.z );
		const name = square ? squareName( square.col, square.row ) : null;
		// off the field, back where it started, or already taken -> refuse
		const ok = name !== null && name !== from && occupant( name, mesh ) === null;
		const to = ok ? name : from;

		const { col, row } = square && ok ? square : parse( from );
		const [ cx, cz ] = cellCentre( col, row );
		settle = { mesh, t0: performance.now(), fromPos: mesh.position.clone(), to: new THREE.Vector3( cx, 0, cz ) };

		mesh.userData.square = to;

		controls.enableRotate = saved.rotate;
		controls.enableZoom = saved.zoom;
		controls.enablePan = saved.pan;
		drag = null;

		if ( ok ) onMove?.( { mesh, from, to } );

	}

	function parse( square ) {

		return { col: 'ABCD'.indexOf( square[ 0 ] ), row: '1234'.indexOf( square[ 1 ] ) };

	}

	// settle animation, driven off the render loop the stage already runs
	stage.onFrame.push( () => {

		if ( ! settle ) return;

		const t = Math.min( 1, ( performance.now() - settle.t0 ) / SNAP_MS );
		const e = 1 - Math.pow( 1 - t, 3 );
		settle.mesh.position.lerpVectors( settle.fromPos, settle.to, e );

		if ( t >= 1 ) { settle.mesh.renderOrder = 0; settle = null; }

	} );

	canvas.addEventListener( 'pointerdown', onPointerDown );
	canvas.addEventListener( 'pointermove', onPointerMove );
	canvas.addEventListener( 'pointerup', onPointerUp );
	canvas.addEventListener( 'pointercancel', onPointerUp );

	/**
	 * Moves a piece without a pointer. Used by the test hook, because a headless
	 * browser cannot drag — it runs the same validation and the same settle.
	 */
	function moveTo( from, to ) {

		const mesh = pieces.children.find( ( m ) => m.userData.square === from );
		if ( ! mesh ) return { ok: false, reason: `nothing on ${from}` };

		const target = parse( to );
		if ( target.col < 0 || target.row < 0 ) return { ok: false, reason: `no such square ${to}` };
		if ( occupant( to, mesh ) ) return { ok: false, reason: `${to} is occupied` };

		const [ cx, cz ] = cellCentre( target.col, target.row );
		settle = { mesh, t0: performance.now(), fromPos: mesh.position.clone(), to: new THREE.Vector3( cx, 0, cz ) };
		mesh.userData.square = to;
		onMove?.( { mesh, from, to } );
		return { ok: true };

	}

	return {

		moveTo,

		setEnabled( value ) {

			enabled = value;
			if ( ! value ) { marker.visible = false; canvas.style.cursor = ''; }

		},

		dispose() {

			canvas.removeEventListener( 'pointerdown', onPointerDown );
			canvas.removeEventListener( 'pointermove', onPointerMove );
			canvas.removeEventListener( 'pointerup', onPointerUp );
			canvas.removeEventListener( 'pointercancel', onPointerUp );
			scene.remove( marker );
			marker.geometry.dispose();
			marker.material.dispose();

		},

	};

}
