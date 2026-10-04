import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import { replaceCollectionAssetExpressions } from "../../texts/expressions";
import { CollectionValidationError, invalid } from "../../errors";

export function validateCollectionAssetReferences(
    blocs: readonly CollectionBloc[],
    collectionId: string,
    assetIds: ReadonlySet<string>,
    importedAssets: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): void {
    for (const bloc of blocs) {
        const values = [bloc.lightdom, bloc.defaultContent];
        if (bloc.kind === "component") {
            values.push(bloc.shadowdom, bloc.style);
        }
        for (const value of values) {
            if (value !== undefined) {
                validateValue(value, collectionId, assetIds, importedAssets, `$.blocs[${bloc.id}]`);
            }
        }
    }
}

function validateValue(
    value: string,
    collectionId: string,
    assetIds: ReadonlySet<string>,
    importedAssets: ReadonlyMap<string, ReadonlySet<string>>,
    path: string,
): void {
    try {
        replaceCollectionAssetExpressions(value, (referencedCollection, assetId) => {
            const available =
                referencedCollection === collectionId ? assetIds : importedAssets.get(referencedCollection);
            if (!available?.has(assetId)) {
                invalid(`unknown or unimported collection asset ${referencedCollection}.${assetId}`, path);
            }
            return "";
        });
    } catch (error) {
        if (error instanceof CollectionValidationError) {
            throw error;
        }
        invalid(error instanceof Error ? error.message : "Invalid collection asset expression", path);
    }
}
