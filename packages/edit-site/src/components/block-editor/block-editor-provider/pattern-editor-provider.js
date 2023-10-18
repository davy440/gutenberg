/**
 * WordPress dependencies
 */
import { useSelect } from '@wordpress/data';
import { useRef, useCallback } from '@wordpress/element';
import { useEntityBlockEditor, useEntityProp } from '@wordpress/core-data';
import {
	store as blockEditorStore,
	privateApis as blockEditorPrivateApis,
} from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import { store as editSiteStore } from '../../../store';
import { unlock } from '../../../lock-unlock';
import useSiteEditorSettings from '../use-site-editor-settings';

const { ExperimentalBlockEditorProvider } = unlock( blockEditorPrivateApis );

function flattenBlockClientIds( blocks ) {
	return blocks.flatMap( ( block ) => [
		block.clientId,
		...flattenBlockClientIds( block.innerBlocks ),
	] );
}

export default function PatternEditorProvider( { children } ) {
	const settings = useSiteEditorSettings();

	const { templateType } = useSelect( ( select ) => {
		const { getEditedPostType } = unlock( select( editSiteStore ) );

		return {
			templateType: getEditedPostType(),
		};
	}, [] );
	const { getClientIdsWithDescendants } = useSelect( blockEditorStore );

	const [ blocks, onInput, onChange ] = useEntityBlockEditor(
		'postType',
		templateType
	);
	const [ , setMeta, meta ] = useEntityProp(
		'postType',
		templateType,
		'meta'
	);

	const blockIdsMapRef = useRef( null );
	if ( blocks.length > 0 && blockIdsMapRef.current === null ) {
		blockIdsMapRef.current = {};
		let blockIds = meta?.block_ids ?? [];
		const blockClientIds = flattenBlockClientIds( blocks );
		// Fallback to preorder-based ids.
		if ( blockIds.length !== blockClientIds.length ) {
			blockIds = blockClientIds.map( ( _, index ) => index + 1 );
		}
		blockClientIds.forEach( ( clientId, index ) => {
			blockIdsMapRef.current[ clientId ] = blockIds[ index ];
		} );
	}

	const updateBlockIds = useCallback(
		( callback ) =>
			( newBlocks, ...args ) => {
				if ( ! blockIdsMapRef.current ) {
					return callback( newBlocks, ...args );
				}

				let id = Math.max(
					0,
					...Object.values( blockIdsMapRef.current )
				);
				const blockClientIds = getClientIdsWithDescendants(
					newBlocks.map( ( block ) => block.clientId )
				);
				const blockIds = blockClientIds.map( ( clientId ) => {
					if ( Object.hasOwn( blockIdsMapRef.current, clientId ) ) {
						return blockIdsMapRef.current[ clientId ];
					}
					id++;
					blockIdsMapRef.current[ clientId ] = id;
					return id;
				} );
				setMeta( { ...meta, block_ids: blockIds } );
				return callback( newBlocks, ...args );
			},
		[ getClientIdsWithDescendants, meta, setMeta ]
	);

	return (
		<ExperimentalBlockEditorProvider
			settings={ settings }
			value={ blocks }
			onInput={ useCallback(
				( ...args ) => updateBlockIds( onInput )( ...args ),
				[ updateBlockIds, onInput ]
			) }
			onChange={ useCallback(
				( ...args ) => updateBlockIds( onChange )( ...args ),
				[ updateBlockIds, onChange ]
			) }
			useSubRegistry={ false }
		>
			{ children }
		</ExperimentalBlockEditorProvider>
	);
}
