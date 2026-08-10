import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { abs, mix, mx_noise_float, normalLocal, positionLocal, smoothstep, vec3 } from 'three/tsl';
import { WoodNodeMaterial, GetWoodPreset } from 'three/examples/jsm/materials/WoodNodeMaterial.js';
import { BOARD } from './board.js';

/**
 * The material samples its wood field from `positionLocal` in 3D, so the only
 * thing standing between the built-in presets and this board is where the board
 * sits inside the virtual log. `transformationMatrix` maps board-local metres
 * into wood space, where the log axis is +Z and the growth rings are circles of
 * radius |p.xy|.
 *
 * Pushing the board far out along +X makes those rings read as evenly spaced
 * straight lines across the width, running the length of the board — i.e. a
 * quartersawn cut, which is exactly the figure in the reference: parallel grain
 * on the top face and short radial ticks on the end grain.
 *
 * `scale` matters more than it looks. The warp strengths in every preset are
 * absolute distances in wood space (0.01 - 0.034), so they only read as gentle
 * grain wander while the ring period is the same order of magnitude. Chasing a
 * fine ring spacing by shrinking `ringThickness` instead pushes the period below
 * the warp amplitude, and the warps shred the rings into sub-pixel noise that
 * averages out to a flat wash.
 *
 * So: keep the preset's ring period and enlarge the board in wood space instead.
 * `offset` then has to grow with it — the rings are circles of radius |p.xy|, and
 * they only read as straight parallel lines while the board's own extent is small
 * against that radius.
 */
export const GRAIN = {
	scale: 6.5, // ~31 growth lines across 200 mm at ringThickness 1/24
	offset: 8, // distance from the log centre; large -> straight, small -> cathedral
	rotate: false, // run the grain across the board instead of down it
	axis: 'z', // which local axis the fibres run along
	phase: 0, // slide along the log, to give two objects different grain
};

/**
 * Board-local metres -> wood space.
 *
 * The board is a plank with its fibres along local +Z, which is what wood space
 * already expects. A turned piece is not: it comes off the lathe with its fibres
 * running up its own axis, so for `axis: 'y'` the mapping rotates first, putting
 * local +Y on the log axis. That is what makes the top of a pawn's head and the
 * underside of a base read as end grain, and what lays the rings down the piece as
 * near-vertical stripes rather than concentric bullseyes — the blank is cut well
 * off the log centre, which `offset` is doing.
 */
export function grainMatrix( grain = GRAIN ) {

	const s = grain.scale;
	const m = new THREE.Matrix4()
		.makeTranslation( grain.offset, 0, grain.phase ?? 0 )
		.multiply( new THREE.Matrix4().makeScale( s, s, s ) );

	if ( grain.axis === 'y' ) {

		m.multiply( new THREE.Matrix4().makeRotationX( Math.PI / 2 ) );

	}

	if ( grain.rotate ) {

		m.multiply( new THREE.Matrix4().makeRotationY( Math.PI / 2 ) );

	}

	return m;

}

/**
 * The albedo is a lot more saturated than the reference's top face looks. That
 * face reads 224,194,161 only because it is brightly lit and the tone mapper
 * pulls highlights toward white; the shaded front face, at 141,98,51, shows what
 * the wood actually is. Matching the top face directly gives a washed-out board
 * that collapses to grey the moment anything falls into shadow.
 *
 * Note also that `woodRings` never resolves outside ~0.58-0.92 of the dark-to-
 * light mix at close range (see the blurAmount clamp in the material), so the two
 * colours need to sit further apart than the final contrast suggests.
 */
export const WOOD = {
	...GetWoodPreset( 'white_oak', 'semigloss' ),
	// These sit far closer together than wood colours normally would, and that is
	// deliberate. Measured inside a single cell the reference spans just 9 luminance
	// levels (sd 1.8) — the grain there is a smooth undulation, not a set of lines.
	// What reads as "grain" at full size is mostly the cell-to-cell tonal falloff
	// and the grooves. Any normal-looking dark/light pair renders as corduroy.
	darkGrainColor: '#b08c6a',
	lightGrainColor: '#ba966e',
	ringThickness: 1 / 24, // ~31 lines across the width, matching the reference's count
	ringBias: 0.88,
	// Ring spacing variance. `ringVarianceScale` is the frequency of that variance,
	// and the preset's 1.4 works out to a ~110 mm wavelength here — slow enough
	// that it just shifts every ring together and the grain comes out as evenly
	// spaced corduroy. Raising it groups the rings into tight and open bands.
	ringSizeVariance: 0.03,
	ringVarianceScale: 12,

	// Every warp strength below is an absolute displacement in wood space, and has
	// to stay small against the ring period (1/24 = 0.042) or the rings sweep into
	// cathedral swirls. The preset values assume the object sits about one unit
	// from the log centre; `woodCenter` clamps to `centerSize`, so at offset 8 the
	// large warp saturates and displaces the rings by ~49 whole periods.
	centerSize: 0.014, // ~half a ring period of low-frequency wander
	smallWarpStrength: 0.007,
	fineWarpStrength: 0.0015,
	// The splotch term supplies the broad light/dark zones a few centimetres wide
	// that stop the grain reading as corduroy. It keys off the radial angle, which
	// barely moves across a board this far off the log centre, so it varies almost
	// entirely across the width — useful here, but push it much harder and it
	// becomes the broad diagonal banding the reference has none of.
	splotchScale: 1.2,
	splotchIntensity: 0.5,
	// Pore structure. Its frequency scales with GRAIN.scale, so this is the preset
	// value divided by roughly that factor to keep the pores around half a
	// millimetre rather than aliasing into noise.
	cellScale: 240,
	// `wood()` blends the pores in at a hard-coded weight of 0.407, which is far
	// too strong here: it was the source of the isolated dark streaks that took the
	// within-cell range to 30 levels against the reference's 9. Held just under the
	// threshold, the term clamps to a uniform lift and the speckle goes away.
	//
	// (Note that `wood()` divides cellSize by max(|positionView| * 10, 1) as a
	// distance fade, assuming a scene a few units across, so at 0.59 m the divisor
	// is ~6 and the nominal value has to be pre-multiplied to mean anything.)
	cellSize: 0.3,
};

/**
 * How strongly end-grain faces are tinted, as a multiplier on albedo. Cut across
 * the fibres, wood exposes open vessels that soak up finish and scatter less
 * light back, so end grain goes darker and noticeably warmer than the face grain
 * beside it — in the reference the front face is 86 lum below the top face yet
 * carries *more* chroma (89 against 63). No single albedo does that, and
 * WoodNodeMaterial has no notion of fibre direction, so it has to be added.
 */
export const END_GRAIN_TINT = new THREE.Vector3( 1.5, 0.98, 0.48 );

/**
 * Medullary ray fleck — the short dashes lying across the grain that are the
 * signature of quartersawn oak, and the dominant fine texture on the reference's
 * face. Magnified, the reference is covered in them; without them the board reads
 * as smooth vertical streaking no matter how the ring parameters are set.
 *
 * WoodNodeMaterial models growth rings and pores but has no concept of rays, so
 * this is a separate layer: one noise field stretched hard along the radial axis
 * (+X) and squeezed along the fibre axis (+Z), which turns isotropic noise into
 * flecks running across the grain. Sized against the reference at 3x
 * magnification, which puts them around 3.5 mm long by half a millimetre thick.
 */
export const FLECK = {
	lengthwise: 260, // 1/frequency along +X -> ~3.5 mm flecks
	crosswise: 2200, // along +Z -> ~0.5 mm thick, so they pack densely
	depth: 700, // through thickness, so the pattern changes as material is cut away
	contrast: 0.30, // width of the noise band mapped to the full swing
	strength: 0.10, // +/- fraction applied to albedo
};

/**
 * @param {object} f
 * @param {string} axis which local axis the fibres run along; the fleck field is
 * stretched along the radial direction and squeezed along the fibre direction, so
 * it has to be reoriented with the grain.
 */
function fleckTint( f = FLECK, axis = 'z' ) {

	const p = positionLocal;
	const [ radial, through, fibre ] = axis === 'y'
		? [ p.x, p.z, p.y ]
		: [ p.x, p.y, p.z ];

	const n = mx_noise_float( vec3(
		radial.mul( f.lengthwise ),
		through.mul( f.depth ),
		fibre.mul( f.crosswise )
	) );

	// Two-sided: real fleck reads as a mottle of both lighter and darker dashes, so
	// the signed noise is used directly rather than thresholded into light blobs.
	const shaped = smoothstep( - f.contrast, f.contrast, n ).sub( 0.5 ).mul( 2 );
	const s = shaped.mul( f.strength );

	// Rays scatter slightly more light and slightly less colour than the fibre
	// around them, so blue swings a touch further than red.
	return vec3( 1 ).add( vec3( s.mul( 0.9 ), s, s.mul( 1.25 ) ) );

}

/**
 * Colourways. The light one is matched to the reference; the dark is a stain over
 * the same timber rather than a different species, so the grain structure and
 * fleck are untouched and only the colours move. Stain sits deeper in end grain,
 * so that tint stays strong.
 */
export const TONES = {
	light: {
		darkGrainColor: WOOD.darkGrainColor,
		lightGrainColor: WOOD.lightGrainColor,
		endGrainTint: END_GRAIN_TINT,
		roughness: 0.42,
		clearcoat: 0.6,
		clearcoatRoughness: 0.45,
	},
	dark: {
		// A stain, not ebony. Taken too dark and too glossy it stops reading as wood
		// at all — the grain disappears into the shadows and the coat turns the piece
		// into polished plastic. These keep the figure visible and the sheen satin.
		darkGrainColor: '#4a3423',
		lightGrainColor: '#63472e',
		endGrainTint: new THREE.Vector3( 1.22, 0.94, 0.68 ),
		roughness: 0.46,
		clearcoat: 0.42,
		clearcoatRoughness: 0.52,
	},
};

/**
 * The wrapped colour node depends only on the grain axis, not on any per-material
 * value, so it is built once per axis and shared. Everything that varies between
 * materials — colours, the grain transform — rides on uniforms that
 * WoodNodeMaterial already refreshes per object, which keeps a whole set of pieces
 * on a single shader program while still letting each have its own grain.
 */
const colorNodes = new Map();

function wrappedColorNode( baseNode, axis, eg, fleck ) {

	// Everything baked into the node belongs in the key — otherwise a second tone or
	// a second end-grain setting silently reuses the first one's.
	const key = `${axis}:${eg.tint.x},${eg.tint.y},${eg.tint.z}:${eg.from},${eg.to}:` +
		`${fleck.strength},${fleck.lengthwise},${fleck.crosswise},${fleck.contrast}`;
	if ( ! colorNodes.has( key ) ) {

		const along = abs( axis === 'y' ? normalLocal.y : normalLocal.z );
		const endGrain = smoothstep( eg.from, eg.to, along );
		const t = eg.tint;

		colorNodes.set( key, baseNode
			.mul( mix( vec3( 1 ), vec3( t.x, t.y, t.z ), endGrain ) )
			// Rays are radial sheets: they show on the face and edges but read as
			// nothing in particular on an end-grain cut, so fade the layer out there.
			.mul( mix( fleckTint( fleck, axis ), vec3( 1 ), endGrain ) ) );

	}

	return colorNodes.get( key );

}

/**
 * Default end-grain response, matched to the board's sawn front face.
 *
 * A turned piece needs something much gentler. The board has one genuinely
 * cross-cut face and the rest is long grain, so a wide threshold and a strong tint
 * are right. On a lathed piece every horizontal surface — the top of a base, the
 * upper side of a collar — points along the fibre axis, and with the board's
 * settings each one flares into a salmon band.
 */
export const END_GRAIN = { tint: END_GRAIN_TINT, from: 0.55, to: 0.92 };
export const END_GRAIN_TURNED = {
	tint: new THREE.Vector3( 1.13, 0.99, 0.85 ),
	from: 0.80,
	to: 0.99,
};

/**
 * Fleck for the pieces. They are a pale, close-grained timber — maple or boxwood
 * rather than oak — and read almost featureless in the reference, so the ray layer
 * that carries the board drops to a whisper. On a turned surface the rays also
 * present differently: they are radial sheets, so instead of dashes lying across
 * the face they wrap the piece as fine horizontal ticks.
 */
export const FLECK_TURNED = { ...FLECK, strength: 0.028, crosswise: 1500, contrast: 0.45 };

/**
 * Alternating-square stain, laid over the continuous grain field rather than
 * swapping wood species per cell — a second `WoodNodeMaterial` per square would
 * mean a second shader program. Multiplying the existing grain colour by a per-
 * square tint gets the same chessboard read (see the reference photo) far
 * cheaper, and still shows real grain inside every square.
 */
export const CHECKER = {
	light: new THREE.Vector3( 1, 1, 1 ), // sapwood squares: the board's natural oak
	dark: new THREE.Vector3( 0.42, 0.25, 0.14 ), // heartwood squares: a walnut-like stain
};

/**
 * 0/1 checker mask in board-local space, aligned to the same cell pitch as the
 * grooves so the colour change lands exactly on the cut lines. Confined to the
 * top face (`normalLocal.y`) and to the playing field (`inField`) so the border
 * frame and the sides/underside of the board stay a single uniform tone.
 *
 * The board is the one object whose colour graph differs from every other wood
 * object in the scene, so it is also the one that exposed the shader-sharing bug
 * `toNodeMaterial` below exists to fix. Anything added here that fails to show up
 * on screen is worth checking against that note before the maths is doubted.
 */
function checkerTint( board, colors ) {

	const half = board.size / 2 - board.margin;
	const pitch = ( half * 2 ) / board.cells;

	const gx = positionLocal.x.add( half ).div( pitch ).floor();
	const gz = positionLocal.z.add( half ).div( pitch ).floor();
	const parity = gx.add( gz ).mod( 2 );

	// Near-zero-width smoothstep rather than `step()`, so the boundary picks up a
	// pixel of antialiasing where it runs along the border groove.
	//
	// It has to be written as a rising edge that is then inverted, never as a
	// falling edge with the two edges swapped: WGSL leaves `smoothstep` undefined
	// when `edge0 >= edge1`, so that form is at the compiler's mercy.
	const edge = 0.0005;
	const outside = ( p ) => smoothstep( half - edge, half + edge, abs( p ) );
	const inField = outside( positionLocal.x ).oneMinus()
		.mul( outside( positionLocal.z ).oneMinus() );
	const up = smoothstep( 0.6, 0.9, normalLocal.y );

	const mask = parity.mul( inField ).mul( up );

	return mix( vec3( colors.light.x, colors.light.y, colors.light.z ), vec3( colors.dark.x, colors.dark.y, colors.dark.z ), mask );

}

/**
 * `WoodNodeMaterial` extends `MeshPhysicalMaterial` from the WebGL entry point, so
 * `isNodeMaterial` is false on it and the renderer treats it as a plain material
 * that merely happens to carry node properties. That is not a cosmetic
 * distinction: `RenderObject.getMaterialCacheKey` — which decides when two objects
 * can share a compiled shader — starts from `material.customProgramCacheKey()`,
 * and only `NodeMaterial` overrides that to hash its node graph. A plain material
 * returns '', and every remaining object-valued property (`colorNode` included)
 * collapses to the literal '{}'.
 *
 * So the board and all six pieces hashed to one key and shared a single program,
 * built from whichever material the renderer reached first. Every per-material
 * graph after that one was compiled and then silently discarded — which is why the
 * checker showed up in `renderer.debug.getShaderAsync` (built fresh, on demand)
 * and never on screen.
 *
 * Re-homing the material on `MeshPhysicalNodeMaterial` fixes it at the source: the
 * cache key now hashes the graph, so the board gets its own program and the pieces
 * — which do still share a graph, courtesy of `colorNodes` — still share theirs.
 * The wood uniforms all read their values off the material by name at draw time
 * (`onObjectUpdate`), so copying the properties across is enough to carry the
 * preset over.
 */
function toNodeMaterial( source ) {

	const material = new MeshPhysicalNodeMaterial();

	for ( const key in source ) {

		// A shared uuid would make the two materials indistinguishable to anything
		// keying off it; the source is discarded here anyway.
		if ( key === 'uuid' ) continue;
		material[ key ] = source[ key ];

	}

	return material;

}

/**
 * @param {object} [opts]
 * @param {'light'|'dark'} [opts.tone]
 * @param {object} [opts.grain] overrides for GRAIN; pass a different `phase` or
 * `offset` per object to vary the figure without a second shader program
 * @param {boolean} [opts.checker] lay a chessboard stain pattern over the grain,
 * for the board itself (never the pieces)
 */
export function createWoodMaterial( opts = {} ) {

	const tone = TONES[ opts.tone ?? 'light' ];
	const grain = { ...GRAIN, ...opts.grain };
	const fleck = { ...FLECK, ...opts.fleck };
	const endGrain = { ...( opts.endGrain ?? END_GRAIN ) };
	if ( ! opts.endGrain ) endGrain.tint = tone.endGrainTint;

	const material = toNodeMaterial( new WoodNodeMaterial( {
		...WOOD,
		darkGrainColor: tone.darkGrainColor,
		lightGrainColor: tone.lightGrainColor,
		transformationMatrix: grainMatrix( grain ),
	} ) );

	material.colorNode = wrappedColorNode( material.colorNode, grain.axis, endGrain, fleck );
	if ( opts.checker ) material.colorNode = material.colorNode.mul( checkerTint( opts.checkerBoard ?? BOARD, CHECKER ) );

	// Satin lacquer. This is doing more than adding gloss: in the reference the top
	// face reads *less* saturated than the shaded front face (chroma 63 against
	// 90), which a single albedo cannot do on its own. The broad neutral sheen of
	// the overhead softbox reflecting off the finish is what desaturates the lit
	// face, so the coat has to be strong and wide rather than a tight highlight.
	material.roughness = tone.roughness;
	material.clearcoat = tone.clearcoat;
	material.clearcoatNode = tone.clearcoat;
	material.clearcoatRoughness = tone.clearcoatRoughness;
	material.envMapIntensity = 1;

	return material;

}
