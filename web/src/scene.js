import * as THREE from 'three/webgpu';

import { BOARD, createBoardGeometry } from './board.js';
import { GRAIN, END_GRAIN_TURNED, FLECK_TURNED, createWoodMaterial } from './wood.js';
import { createPiece, HEIGHTS } from './pieces/index.js';

export { BOARD, HEIGHTS };

export const FILES = [ 'A', 'B', 'C', 'D' ];
export const RANKS = [ '1', '2', '3', '4' ];

/**
 * Centre of a cell in board-local metres. Columns run +X, rows run +Z, both
 * indexed from the far-left corner — so `A1` is (0, 0) and matches the labels
 * drawn around the board.
 */
export function cellCentre( col, row, board = BOARD ) {

	const half = board.size / 2 - board.margin;
	const pitch = ( half * 2 ) / board.cells;
	return [ - half + pitch * ( col + 0.5 ), - half + pitch * ( row + 0.5 ) ];

}

/** "B3" -> { col: 1, row: 2 } */
export function parseSquare( square ) {

	return { col: FILES.indexOf( square[ 0 ].toUpperCase() ), row: RANKS.indexOf( square[ 1 ] ) };

}

/** { col: 1, row: 2 } -> "B3" */
export function squareName( col, row ) {

	return `${FILES[ col ]}${RANKS[ row ]}`;

}

/**
 * Inverse of `cellCentre`: board-local metres back to a square.
 *
 * Returns null outside the playing field — which is what makes a drop that lands on
 * the border, the table, or off the edge snap the piece back where it came from.
 */
export function squareAt( x, z, board = BOARD ) {

	const half = board.size / 2 - board.margin;
	const pitch = ( half * 2 ) / board.cells;

	const col = Math.floor( ( x + half ) / pitch );
	const row = Math.floor( ( z + half ) / pitch );

	if ( col < 0 || col >= board.cells || row < 0 || row >= board.cells ) return null;
	return { col, row };

}

/**
 * Builds the board and a set of pieces into a scene.
 *
 * Each piece gets its own material so it can have its own grain phase — a set cut
 * from one blank reads as stamped copies otherwise. Only the transform uniform
 * differs between them, so they still share a shader program.
 *
 * A spec with no `square` is a piece that is not in play. Its mesh is still built
 * — every piece is made once, at startup, and the eight of them are the eight for
 * the whole game — but it is hidden until something puts it on a square. The
 * reserve is drawn in the panel, as icons, so a hidden mesh is not a missing
 * piece: `app.js` keeps the two in step.
 */
export function buildBoard( scene, layout = [] ) {

	const geometry = createBoardGeometry( BOARD );
	const board = new THREE.Mesh( geometry, createWoodMaterial( { checker: true } ) );
	board.castShadow = true;
	board.receiveShadow = true;
	scene.add( board );

	const pieces = new THREE.Group();
	scene.add( pieces );

	layout.forEach( ( spec, i ) => {

		const material = createWoodMaterial( {
			tone: spec.tone,
			grain: { ...GRAIN, axis: 'y', offset: 8 + i * 0.19, phase: i * 0.53 },
			endGrain: END_GRAIN_TURNED,
			fleck: FLECK_TURNED,
		} );

		const mesh = createPiece( spec.type, material, { rotation: spec.turn ?? 0 } );

		Object.assign( mesh.userData, {
			id: spec.id ?? `${spec.tone}-${spec.type}`,
			tone: spec.tone,
			type: spec.type,
			// A spec may name its square or give the cell directly; neither means the
			// piece is not in play.
			square: spec.square ?? ( spec.col === undefined ? null : squareName( spec.col, spec.row ) ),
		} );

		if ( mesh.userData.square === null ) {

			// Not in play. Parked on A1 so it has a defined transform, but hidden,
			// and never raycast against while it is.
			mesh.visible = false;

		}

		const { col, row } = mesh.userData.square ? parseSquare( mesh.userData.square ) : { col: 0, row: 0 };
		const [ x, z ] = cellCentre( col, row );
		// the piece's origin is the underside of its base and the board's top face is
		// y = 0, so placing one is just this
		mesh.position.set( x, 0, z );
		pieces.add( mesh );

	} );

	return { board, pieces, geometry };

}
