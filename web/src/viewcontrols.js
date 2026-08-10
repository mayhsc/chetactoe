import * as THREE from 'three/webgpu';

const STORE_KEY = 'chetactoe-view';

/** How far the camera target may wander from the board's centre, in metres. */
const TARGET_LIMIT = 0.09;

export const AXES = [
	{ id: 'rotate', label: 'Rotate', prop: 'enableRotate' },
	{ id: 'zoom', label: 'Zoom', prop: 'enableZoom' },
	{ id: 'pan', label: 'Pan', prop: 'enablePan' },
];

const DEFAULTS = { rotate: true, zoom: true, pan: false, locked: false };

function load() {

	try {

		return { ...DEFAULTS, ...JSON.parse( localStorage.getItem( STORE_KEY ) ?? '{}' ) };

	} catch { return { ...DEFAULTS }; }

}

function save( state ) {

	try { localStorage.setItem( STORE_KEY, JSON.stringify( state ) ); } catch { /* private mode */ }

}

/**
 * Rotate / zoom / pan toggles plus a master lock, wired to OrbitControls.
 *
 * The lock is not "turn all three off" — it remembers the combination it was locked
 * over and restores exactly that, so unlocking does not silently switch pan on for
 * someone who never wanted it.
 *
 * @param {object} opts
 * @param {object} opts.stage from createStage()
 * @param {HTMLElement} opts.container element to build the buttons into
 */
export function createViewControls( { stage, container } ) {

	const { controls } = stage;
	const state = load();

	// Pan along the ground rather than the screen: this is a board on a table, and
	// screen-space panning slides it out of its own plane, which reads as a glitch.
	controls.screenSpacePanning = false;

	// OrbitControls has distance limits but no target limits, so panning walks the
	// board out of frame with no way back except Restart. Clamp on every change.
	const limit = () => {

		const t = controls.target;
		t.x = THREE.MathUtils.clamp( t.x, - TARGET_LIMIT, TARGET_LIMIT );
		t.z = THREE.MathUtils.clamp( t.z, - TARGET_LIMIT, TARGET_LIMIT );

	};

	controls.addEventListener( 'change', limit );

	const buttons = new Map();

	function apply() {

		for ( const axis of AXES ) {

			const on = state[ axis.id ] && ! state.locked;
			controls[ axis.prop ] = on;

			const btn = buttons.get( axis.id );
			if ( ! btn ) continue;
			btn.classList.toggle( 'on', state[ axis.id ] );
			btn.disabled = state.locked;
			btn.setAttribute( 'aria-pressed', String( state[ axis.id ] ) );

		}

		const lock = buttons.get( 'lock' );
		if ( lock ) {

			lock.classList.toggle( 'on', state.locked );
			lock.setAttribute( 'aria-pressed', String( state.locked ) );
			lock.title = state.locked ? 'Unlock view' : 'Lock view';

		}

		container.classList.toggle( 'locked', state.locked );
		save( state );

	}

	function button( id, label, svg ) {

		const b = document.createElement( 'button' );
		b.type = 'button';
		b.className = 'view-btn';
		b.dataset.axis = id;
		b.title = label;
		b.setAttribute( 'aria-label', label );
		b.innerHTML = svg;
		container.append( b );
		buttons.set( id, b );
		return b;

	}

	const ICONS = {
		rotate: '<path d="M12 4.5a7.5 7.5 0 1 1-6.3 3.4"/><path d="M4.4 3.6v4.6h4.6"/>',
		zoom: '<circle cx="10.6" cy="10.6" r="6.1"/><path d="M15 15l4.6 4.6M8.2 10.6h4.8M10.6 8.2v4.8"/>',
		pan: '<path d="M12 3.4v17.2M3.4 12h17.2"/><path d="M12 3.4 9.6 6M12 3.4 14.4 6M12 20.6 9.6 18M12 20.6 14.4 18M3.4 12 6 9.6M3.4 12 6 14.4M20.6 12 18 9.6M20.6 12 18 14.4"/>',
		lock: '<rect x="4.8" y="10.4" width="14.4" height="9.4" rx="2"/><path class="shackle" d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>',
		unlock: '',
	};

	for ( const axis of AXES ) {

		button( axis.id, axis.label, `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[ axis.id ]}</svg>` )
			.addEventListener( 'click', () => {

				if ( state.locked ) return;
				state[ axis.id ] = ! state[ axis.id ];
				apply();

			} );

	}

	const sep = document.createElement( 'span' );
	sep.className = 'view-sep';
	container.append( sep );

	button( 'lock', 'Lock view', `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.lock}</svg>` )
		.addEventListener( 'click', () => {

			state.locked = ! state.locked;
			apply();

		} );

	apply();

	return {

		state,

		set( id, value ) {

			if ( id in state ) { state[ id ] = value; apply(); }

		},

		snapshot: () => ( {
			...state,
			enableRotate: controls.enableRotate,
			enableZoom: controls.enableZoom,
			enablePan: controls.enablePan,
		} ),

	};

}
