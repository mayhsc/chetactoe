import { profile } from '../lathe.js';

/**
 * Turned profiles for the four pieces, authored against radius-vs-height measured
 * off reference/pieces.png with tools/profile.mjs. Run that tool to see the tables
 * these numbers come from; every `t` and `R` below appears in its output.
 *
 * The reference set is a chunky café pattern: all four share one base diameter and
 * differ in height by only a few percent, so the family is a single base radius
 * plus a per-piece height.
 *
 *   piece    measured height   h / base Ø
 *   pawn         154 px          1.656
 *   rook         158 px          1.663
 *   knight       159 px          1.767
 *   bishop       162 px          1.723
 *
 * At a 26 mm base — 58% of the board's 44.69 mm cell — that gives the heights
 * below. Profiles are in metres. `t` is a fraction of piece height and radii are
 * multiples of the base radius, matching how the tool reports them.
 *
 * One caveat carried over from the measurement: rows below the base's widest point
 * trace the bottom ellipse rather than the profile, because the camera looks
 * slightly down onto the base. The underside is therefore modelled as a flat face
 * with a small chamfer rather than sampled.
 */

// 26.5 mm rather than a round 26. Two measurements disagree slightly and this
// splits them: comparing rendered silhouettes says 26 comes out ~3.5% narrow,
// while comparing the authored profile straight against the reference's r/h ratios
// (tools/check-profiles.mjs) says 26 is nearly right and widening drags the whole
// mid-body out with the base. The difference is edge bias in the two masks — the
// reference photograph is slightly soft-focused and this render is not.
export const BASE_DIAMETER = 0.0265;
export const BASE_R = BASE_DIAMETER / 2;

export const HEIGHTS = {
	pawn: 0.0431,
	rook: 0.0442,
	knight: 0.0445,
	bishop: 0.0453,
};

/**
 * Base and the shoulder rolling off it, shared by all four — same stock, same
 * tooling. `bandTop` is where the full-radius band ends and `shoulderTo`/`at`
 * where the stem takes over.
 */
function base( H, R, { bandTop, shoulderTo, shoulderAt, shoulderR } ) {

	return profile()
		.moveTo( 0, 0 ) // bottom centre
		.lineTo( R * 0.93, 0 ) // flat underside
		.lineTo( R, 0.028 * H, R * 0.05 ) // bottom chamfer
		.lineTo( R, bandTop * H ) // full-radius band
		.arcTo( R * shoulderTo, shoulderAt * H, R * shoulderR, true ); // convex shoulder

}

/**
 * Pawn. Ball head over a flared collar on a coved stem.
 *
 * Measured: base band to t 0.216, shoulder through 0.763 R at t 0.294 into the
 * stem; stem 0.613 R at t 0.333 coving in to 0.398 R at t 0.560; collar peaking
 * 0.634 R at t 0.615; neck 0.376 R at t 0.686; head equator 0.548 R at t 0.814.
 *
 * The head is not a sphere — no circle through the equator also reaches the apex.
 * Semi-axes work out to 0.548 R wide by 0.186 H tall, prolate by about 12%, so it
 * is sampled as an ellipse.
 */
export function pawnProfile( H = HEIGHTS.pawn, R = BASE_R ) {

	const p = base( H, R, { bandTop: 0.240, shoulderTo: 0.613, shoulderAt: 0.333, shoulderR: 1.20 } );

	// stem: measured fall-off is slower than linear, so it bows toward the axis
	p.arcTo( R * 0.398, 0.560 * H, R * 1.83, false );
	p.lineTo( R * 0.398, 0.569 * H ); // short neck under the collar

	// collar. Both faces measure convex, not conical: the underside runs 0.570 R at
	// t 0.588 against 0.516 for a straight line, and the top 0.548 R at t 0.667
	// against 0.457.
	p.arcTo( R * 0.634, 0.608 * H, R * 0.345, true );
	p.lineTo( R * 0.634, 0.627 * H );
	p.arcTo( R * 0.376, 0.686 * H, R * 0.27, true );

	// head: prolate ellipsoid, swept from the neck to the apex
	const rx = R * 0.548;
	const cy = 0.814 * H;
	const ry = H - cy;
	const a0 = Math.asin( Math.max( - 1, Math.min( 1, ( 0.686 * H - cy ) / ry ) ) );
	p.curve( ( t ) => {

		const a = a0 + ( Math.PI / 2 - a0 ) * t;
		return [ rx * Math.cos( a ), cy + ry * Math.sin( a ) ];

	}, 32 );

	return p.build();

}

/**
 * Rook. Crenellated crown on a straight tapered stem.
 *
 * Measured: base band to t 0.248, shoulder to 0.705 R at t 0.335; a straight taper
 * to 0.558 R at t 0.669; a true cylinder at 0.558 R through t 0.745; a fast cove
 * out to the crown, which is a true cylinder at 0.832 R from t 0.783 to 0.975 with
 * a small chamfer to 0.747 R at the rim.
 *
 * The eight notches and the central recess are cut afterwards — see index.js.
 */
export function rookProfile( H = HEIGHTS.rook, R = BASE_R ) {

	const p = base( H, R, { bandTop: 0.248, shoulderTo: 0.705, shoulderAt: 0.335, shoulderR: 1.00 } );

	p.smoothTo( R * 0.558, 0.669 * H ); // straight tapered stem
	p.lineTo( R * 0.558, 0.745 * H ); // cylindrical neck
	p.arcTo( R * 0.832, 0.786 * H, R * 0.333, true ); // rounded flare out under the crown
	p.lineTo( R * 0.832, 0.975 * H ); // crown wall
	p.lineTo( R * 0.747, 1.0 * H ); // rim chamfer
	p.lineTo( 0, 1.0 * H ); // flat top, cut into later

	return p.build();

}

/**
 * Bishop. Mitre with a ball finial; the diagonal slit is cut afterwards.
 *
 * Measured: shoulder to 0.574 R at t 0.317; a near-straight run to the waist at
 * 0.489 R, t 0.429; the mitre swelling convexly to 0.681 R at t 0.587 then tapering
 * — also convex — to a neck of 0.170 R at t 0.857; a ball finial of 0.277 R centred
 * at t 0.913, whose apex lands on t 0.99.
 */
export function bishopProfile( H = HEIGHTS.bishop, R = BASE_R ) {

	const p = base( H, R, { bandTop: 0.224, shoulderTo: 0.574, shoulderAt: 0.317, shoulderR: 0.81 } );

	p.smoothTo( R * 0.489, 0.429 * H ); // waist; measured all but straight
	p.arcTo( R * 0.681, 0.587 * H, R * 1.05, true ); // mitre swell
	p.arcTo( R * 0.170, 0.857 * H, R * 1.55, true ); // mitre taper to the neck

	// Ball finial. Like the pawn's head it is slightly prolate — a circle of the
	// measured 0.277 R centred at t 0.913 tops out at t 0.993, short of the apex —
	// so the vertical semi-axis is taken from the apex instead.
	const rx = R * 0.277;
	const cy = 0.913 * H;
	const ry = H - cy;
	const a0 = Math.asin( Math.max( - 1, Math.min( 1, ( 0.862 * H - cy ) / ry ) ) );
	p.curve( ( t ) => {

		const a = a0 + ( Math.PI / 2 - a0 ) * t;
		return [ rx * Math.cos( a ), cy + ry * Math.sin( a ) ];

	}, 26 );

	return p.build();

}

/**
 * Knight — the turned part only. The sculpted head is unioned on top; see knight.js.
 *
 * Measured: shoulder to 0.710 R at t 0.300, a straight taper to 0.466 R at t 0.500,
 * then a steep step in to the neck at 0.290 R by t 0.550, which is where the jaw
 * begins to overhang. The profile deliberately continues past that to t 0.640,
 * inside the head volume, so the CSG union has material to bite into.
 */
export function knightStemProfile( H = HEIGHTS.knight, R = BASE_R ) {

	const p = base( H, R, { bandTop: 0.235, shoulderTo: 0.711, shoulderAt: 0.304, shoulderR: 0.80 } );

	// long convex taper: measured 0.61 R at the midpoint against 0.50 for a straight
	// line, so the stem bows outward rather than running flat
	p.arcTo( R * 0.289, 0.551 * H, R * 1.15, true );
	p.lineTo( R * 0.310, 0.640 * H ); // buried inside the head
	p.lineTo( 0, 0.640 * H );

	return p.build();

}

export const PROFILES = {
	pawn: pawnProfile,
	rook: rookProfile,
	bishop: bishopProfile,
	knight: knightStemProfile,
};
