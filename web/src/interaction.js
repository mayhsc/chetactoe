import * as THREE from 'three/webgpu';

import { cellCentre, squareAt, squareName, BOARD } from './scene.js';

const LIFT = 0.006; // how far a piece rises off the board while carried
const SNAP_MS = 130; // settle animation on drop or rejection
const TAP_SLOP = 6; // px of pointer travel still counted as a tap rather than a drag

/**
 * Marker colours. Hints are the squares the selected piece may go to, drawn as
 * soon as something is selected; the hover marker is the one under the pointer
 * during a drag, and it has to look refused *before* the user lets go rather
 * than after. A capture is called out separately, because "you may move here"
 * and "you may take that" are different decisions.
 */
const MARK_HINT = 0x5f7040;
const MARK_CAPTURE = 0xa8784a;
const MARK_BLOCKED = 0xa8574a;

const cellSize = () => ( ( BOARD.size / 2 - BOARD.margin ) * 2 / BOARD.cells );

/**
 * A flat marker sitting just above the board face. The board is one mesh, so a cell
 * cannot be tinted in place — an overlay quad is the only way to mark one.
 */
function createMarker( { size = cellSize() * 0.86, opacity = 0.3 } = {} ) {

	const geometry = new THREE.PlaneGeometry( size, size );
	geometry.rotateX( - Math.PI / 2 );

	const material = new THREE.MeshBasicMaterial( {
		color: MARK_HINT,
		transparent: true,
		opacity,
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
 * Pointer handling for a game with rules: what may be picked up and where it may
 * go both come from the caller, so this file has no opinion about either.
 *
 * Three ways to move, and they are one gesture with three endings: press a piece,
 * and if you move you are dragging it, while if you let go you have selected it.
 * That holds for a piece in play and for one in the reserve, which is dragged
 * straight out of the panel and onto the board — the mesh leaves the reserve and
 * follows the pointer even though it is not in play until it lands.
 *
 * Whenever something is selected the square under the pointer is marked as you
 * move, before any click: it is the same marker the drag uses, and it is what makes
 * clicking a square on a board drawn in perspective something other than a guess.
 *
 * @param {object} opts
 * @param {object} opts.stage from createStage()
 * @param {THREE.Group} opts.pieces
 * @param {object} opts.rules
 * @param {function} opts.rules.destinations `( mesh ) => string[]`, empty if it cannot move now
 * @param {function} [opts.rules.liftFor] `( mesh ) => number` — height a piece rests at
 * @param {function} opts.onAct `( { mesh, from, to } ) => boolean` — apply the move; false refuses it
 * @param {function} [opts.onTap] `( { mesh, square } )` — a click that was not a drag
 * @param {function} [opts.onAbort] — a carry from the reserve that landed nowhere
 */
export function createDragController( { stage, pieces, rules, onAct, onTap, onAbort } ) {

	const { renderer, camera, controls, scene } = stage;
	const canvas = renderer.domElement;

	const marker = createMarker();
	scene.add( marker );

	// One marker per square, since every square can be a destination at once — a
	// piece placed from the reserve on an empty board has sixteen.
	//
	// Built at the small size and scaled up when the square is occupied, because a
	// centre dot disappears under a piece's base — and a capture is the one hint you
	// most want to see. Scaled wider than the base it reads as a ring around the
	// piece instead.
	const HINT_SIZE = cellSize() * 0.30;
	const WIDE_SCALE = ( cellSize() * 0.86 ) / HINT_SIZE;

	const hintPool = Array.from( { length: BOARD.cells * BOARD.cells }, () => {

		const hint = createMarker( { size: HINT_SIZE, opacity: 0.5 } );
		scene.add( hint );
		return hint;

	} );

	let hints = []; // [ { square, capture, wide } ]

	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	// the board's top face; where a dragged piece tracks the pointer
	const plane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0 );
	const hit = new THREE.Vector3();

	let enabled = true;
	let drag = null; // { mesh, from, offsetX, offsetZ, pointerId, saved }
	let tap = null; // { x, y, mesh, pointerId }
	let hintsLive = true; // do the hints stand for something the pointer can do?
	let marked = null; // { square, state } — what the hover marker is currently on
	const settles = []; // { mesh, fromPos, to, t0 }

	// A piece being dragged out of the reserve. It starts pending — the press might
	// still turn out to be a click — and only becomes a carry once the pointer has
	// travelled far enough to mean it.
	let carry = null; // { mesh, ref, x, y, pointerId, active, saved, onClick }

	function setPointer( event ) {

		const r = canvas.getBoundingClientRect();
		pointer.x = ( ( event.clientX - r.left ) / r.width ) * 2 - 1;
		pointer.y = - ( ( event.clientY - r.top ) / r.height ) * 2 + 1;
		raycaster.setFromCamera( pointer, camera );

	}

	// Hidden pieces are the reserve, and a piece that is not on the board cannot be
	// picked off it.
	const pieceUnderPointer = () =>
		raycaster.intersectObjects( pieces.children.filter( ( m ) => m.visible ), false )[ 0 ]?.object ?? null;

	const squareUnderPointer = () => {

		if ( ! raycaster.ray.intersectPlane( plane, hit ) ) return null;

		const cell = squareAt( hit.x, hit.z );
		return cell ? squareName( cell.col, cell.row ) : null;

	};

	const boardPoint = () => ( raycaster.ray.intersectPlane( plane, hit ) ? hit : null );

	const hintFor = ( square ) => hints.find( ( h ) => h.square === square ) ?? null;

	/** Marks one square as the pointer's target: reachable, a capture, or refused. */
	function markSquare( square ) {

		if ( ! square ) { marker.visible = false; marked = null; return; }

		const entry = hintFor( square );
		const { col, row } = parse( square );
		const [ cx, cz ] = cellCentre( col, row );

		marker.position.x = cx;
		marker.position.z = cz;
		marker.material.color.setHex( entry ? ( entry.capture ? MARK_CAPTURE : MARK_HINT ) : MARK_BLOCKED );
		marker.material.opacity = entry ? 0.34 : 0.38;
		marker.visible = true;

		marked = { square, state: entry ? ( entry.capture ? 'capture' : 'free' ) : 'blocked' };

	}

	// Where a piece comes to rest. The caller owns it because it depends on the game
	// — a selected piece stands proud of the board — and every path that puts a piece
	// down has to agree, or a refused drop quietly flattens the selection it kept.
	const restY = ( mesh ) => rules.liftFor?.( mesh ) ?? 0;

	// ------------------------------------------------------------------- markers

	function paintHints() {

		hintPool.forEach( ( mesh, i ) => {

			const entry = hints[ i ];
			mesh.visible = entry !== undefined;
			if ( ! entry ) return;

			const { col, row } = parse( entry.square );
			const [ x, z ] = cellCentre( col, row );
			mesh.position.x = x;
			mesh.position.z = z;

			// Wide whenever a piece is standing on the square: a capture, or the run
			// that won the game. A dot under a base is a hint nobody can see.
			const capture = entry.capture === true;
			const wide = capture || entry.wide === true;

			mesh.scale.set( wide ? WIDE_SCALE : 1, 1, wide ? WIDE_SCALE : 1 );
			mesh.material.color.setHex( capture ? MARK_CAPTURE : MARK_HINT );
			mesh.material.opacity = wide ? 0.42 : 0.5;

		} );

	}

	/**
	 * The squares the current selection may go to. Called with `[]` to clear.
	 *
	 * Entries are `{ square, capture, wide }`, or a bare square name. `capture`
	 * colours the marker; `wide` draws it around a piece rather than under one, and
	 * a capture is always wide.
	 *
	 * `interactive: false` marks squares that are only being shown — the line that
	 * won the game — so hovering the board does not offer to do anything with them.
	 */
	function setHints( entries = [], { interactive = true } = {} ) {

		hintsLive = interactive;

		hints = entries
			.map( ( e ) => ( typeof e === 'string' ? { square: e, capture: false } : e ) )
			.slice( 0, hintPool.length );

		paintHints();

	}

	// ------------------------------------------------------------------ gestures

	function onPointerDown( event ) {

		if ( ! enabled || drag || carry || event.button !== 0 ) return;

		setPointer( event );
		const mesh = pieceUnderPointer();

		tap = { x: event.clientX, y: event.clientY, mesh, pointerId: event.pointerId };

		// Nothing to drag: either empty board, or a piece that may not move now —
		// the other player's, or anything at all once the game is over. Let
		// OrbitControls have the gesture; if it turns out to be a tap rather than an
		// orbit, onPointerUp reports it.
		if ( ! mesh || rules.destinations( mesh ).length === 0 ) return;

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

		cancelSettle( mesh );
		mesh.position.y = LIFT;
		mesh.renderOrder = 1;
		canvas.setPointerCapture( event.pointerId );
		canvas.style.cursor = 'grabbing';

		// Picking a piece up is a selection too, so the hints appear during the drag.
		onTap?.( { mesh, square: mesh.userData.square, picking: true } );
		event.preventDefault();

	}

	function onPointerMove( event ) {

		// A piece out of the reserve is carried on window listeners, because the press
		// started on a panel button rather than on the canvas; letting this run too
		// would fight it over the cursor and the marker.
		if ( ! enabled || carry ) return;

		setPointer( event );

		if ( ! drag ) {

			const mesh = pieceUnderPointer();
			const grabbable = mesh !== null && rules.destinations( mesh ).length > 0;

			// With something selected, the square under the pointer is marked before
			// any click — so a click on a board seen in perspective is aimed rather
			// than guessed, and a square that would refuse the move says so first.
			const square = hints.length > 0 && hintsLive ? squareUnderPointer() : null;
			markSquare( square );

			canvas.style.cursor = grabbable ? 'grab' : ( square && hintFor( square ) ? 'pointer' : '' );
			return;

		}

		const point = boardPoint();
		if ( ! point ) return;

		drag.mesh.position.x = point.x + drag.offsetX;
		drag.mesh.position.z = point.z + drag.offsetZ;

		markSquare( squareUnderPointer() );

	}

	function onPointerUp( event ) {

		if ( ! enabled || carry ) { tap = null; return; }

		if ( ! drag ) {

			// No drag was started, so this may still be a tap: on a piece that could
			// not be picked up, or on a square, which is how a piece from the reserve
			// gets placed.
			if ( tap && tap.pointerId === event.pointerId ) {

				const moved = Math.hypot( event.clientX - tap.x, event.clientY - tap.y );
				if ( moved <= TAP_SLOP ) {

					setPointer( event );
					onTap?.( { mesh: tap.mesh, square: squareUnderPointer() } );

				}

			}

			tap = null;
			return;

		}

		if ( event.pointerId !== drag.pointerId ) return;

		const { mesh, from, saved } = drag;
		const moved = tap ? Math.hypot( event.clientX - tap.x, event.clientY - tap.y ) : Infinity;

		marker.visible = false;
		canvas.style.cursor = '';
		if ( canvas.hasPointerCapture( event.pointerId ) ) canvas.releasePointerCapture( event.pointerId );

		controls.enableRotate = saved.rotate;
		controls.enableZoom = saved.zoom;
		controls.enablePan = saved.pan;
		drag = null;
		tap = null;

		const to = squareUnderPointer();

		// Picked up and put straight back down: that is a tap, and the piece stays
		// selected rather than making a move nobody asked for.
		if ( moved <= TAP_SLOP || to === null || to === from || hintFor( to ) === null ) {

			settleTo( mesh, from );
			return;

		}

		if ( ! onAct?.( { mesh, from, to } ) ) settleTo( mesh, from );

	}

	function parse( square ) {

		return { col: 'ABCD'.indexOf( square[ 0 ] ), row: '1234'.indexOf( square[ 1 ] ) };

	}


	// ------------------------------------------------------- carrying out of a hand

	/**
	 * Starts a press on a piece that is not in play — a reserve slot in the panel.
	 *
	 * The gesture is left ambiguous on purpose. Nothing happens until the pointer
	 * moves `TAP_SLOP`: travel that far and the piece lifts out of the panel and
	 * follows the pointer onto the board, let go before that and it was a click, and
	 * `onClick` runs instead. One press, both interactions, no modifier and no mode.
	 *
	 * Everything is tracked on `window` rather than on the button: the panel is
	 * redrawn whenever the game state changes, so the element the press landed on is
	 * usually gone by the time the pointer moves.
	 */
	function carryFrom( { mesh, ref, pointerId, clientX, clientY, onClick } ) {

		if ( ! enabled || drag || carry ) return;

		carry = { mesh, ref, pointerId, x: clientX, y: clientY, active: false, saved: null, onClick };

		window.addEventListener( 'pointermove', onCarryMove );
		window.addEventListener( 'pointerup', onCarryEnd );
		window.addEventListener( 'pointercancel', onCarryEnd );

	}

	function onCarryMove( event ) {

		if ( ! carry || event.pointerId !== carry.pointerId ) return;

		if ( ! carry.active ) {

			if ( Math.hypot( event.clientX - carry.x, event.clientY - carry.y ) <= TAP_SLOP ) return;

			// Committed: the piece is on its way to the board even though the rules
			// still have it in the hand, so it is shown without being in play.
			carry.saved = {
				rotate: controls.enableRotate,
				zoom: controls.enableZoom,
				pan: controls.enablePan,
			};
			controls.enableRotate = controls.enableZoom = controls.enablePan = false;

			cancelSettle( carry.mesh );
			carry.mesh.visible = true;
			carry.mesh.renderOrder = 1;
			carry.active = true;
			document.body.style.cursor = 'grabbing';

		}

		setPointer( event );
		const point = boardPoint();
		if ( ! point ) return;

		// Centred under the pointer: there is no grab offset to preserve, because the
		// piece was not on the board to be grabbed.
		carry.mesh.position.set( point.x, LIFT, point.z );

		markSquare( squareUnderPointer() );

	}

	function onCarryEnd( event ) {

		if ( ! carry || event.pointerId !== carry.pointerId ) return;

		const { mesh, ref, active, saved, onClick } = carry;

		window.removeEventListener( 'pointermove', onCarryMove );
		window.removeEventListener( 'pointerup', onCarryEnd );
		window.removeEventListener( 'pointercancel', onCarryEnd );

		carry = null;
		marker.visible = false;
		document.body.style.cursor = '';

		if ( ! active ) { onClick?.(); return; }

		controls.enableRotate = saved.rotate;
		controls.enableZoom = saved.zoom;
		controls.enablePan = saved.pan;

		setPointer( event );
		const to = squareUnderPointer();
		mesh.renderOrder = 0;

		// Dropped on a square it may go to, or dropped anywhere else — off the board,
		// on an occupied square — in which case it goes back to the reserve, which is
		// where the rules still have it.
		if ( to && hintFor( to ) && onAct?.( { mesh, from: ref, to } ) ) return;

		mesh.visible = false;
		onAbort?.();

	}

	// ---------------------------------------------------------------- animation

	function cancelSettle( mesh ) {

		const i = settles.findIndex( ( s ) => s.mesh === mesh );
		if ( i >= 0 ) settles.splice( i, 1 );

	}

	/** Slides a piece to a square from wherever it is now. */
	function settleTo( mesh, square ) {

		cancelSettle( mesh );

		const { col, row } = parse( square );
		const [ x, z ] = cellCentre( col, row );

		settles.push( {
			mesh,
			t0: performance.now(),
			fromPos: mesh.position.clone(),
			to: new THREE.Vector3( x, restY( mesh ), z ),
		} );

	}

	/** Puts a piece on a square with no animation — for everything not just moved. */
	function snapTo( mesh, square ) {

		cancelSettle( mesh );

		const { col, row } = parse( square );
		const [ x, z ] = cellCentre( col, row );
		mesh.position.set( x, restY( mesh ), z );
		mesh.renderOrder = 0;

	}

	// driven off the render loop the stage already runs
	stage.onFrame.push( () => {

		for ( let i = settles.length - 1; i >= 0; i -- ) {

			const settle = settles[ i ];
			const t = Math.min( 1, ( performance.now() - settle.t0 ) / SNAP_MS );
			const e = 1 - Math.pow( 1 - t, 3 );
			settle.mesh.position.lerpVectors( settle.fromPos, settle.to, e );

			if ( t >= 1 ) { settle.mesh.renderOrder = 0; settles.splice( i, 1 ); }

		}

	} );

	function onPointerLeave() {

		if ( ! drag && ! carry ) marker.visible = false;

	}

	canvas.addEventListener( 'pointerdown', onPointerDown );
	canvas.addEventListener( 'pointermove', onPointerMove );
	canvas.addEventListener( 'pointerup', onPointerUp );
	canvas.addEventListener( 'pointercancel', onPointerUp );
	canvas.addEventListener( 'pointerleave', onPointerLeave );

	return {

		setHints,
		settleTo,
		snapTo,
		hints: () => hints.map( ( h ) => h.square ),

		carryFrom,

		/** What the pointer is currently aimed at, for the checks. */
		marker: () => ( marker.visible && marked ? { visible: true, ...marked } : { visible: false } ),

		/** The piece being carried right now, so a redraw can leave it alone. */
		dragging: () => drag?.mesh ?? ( carry?.active ? carry.mesh : null ),

		setEnabled( value ) {

			enabled = value;
			if ( ! value ) { marker.visible = false; canvas.style.cursor = ''; }

		},

		dispose() {

			canvas.removeEventListener( 'pointerdown', onPointerDown );
			canvas.removeEventListener( 'pointermove', onPointerMove );
			canvas.removeEventListener( 'pointerup', onPointerUp );
			canvas.removeEventListener( 'pointercancel', onPointerUp );
			canvas.removeEventListener( 'pointerleave', onPointerLeave );
			window.removeEventListener( 'pointermove', onCarryMove );
			window.removeEventListener( 'pointerup', onCarryEnd );
			window.removeEventListener( 'pointercancel', onCarryEnd );

			for ( const mesh of [ marker, ...hintPool ] ) {

				scene.remove( mesh );
				mesh.geometry.dispose();
				mesh.material.dispose();

			}

		},

	};

}
