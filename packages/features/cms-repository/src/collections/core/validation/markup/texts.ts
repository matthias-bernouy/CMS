import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionView } from "../../../interfaces/CollectionView";
import { CollectionValidationError, invalid } from "../../errors";
import { replaceCollectionTextExpressions } from "../../texts/expressions";
import { isElement, markupTree, nodes } from "./tree";

function validateValue(
    value: string,
    collectionId: string,
    textIds: ReadonlySet<string>,
    importedTexts: ReadonlyMap<string, ReadonlySet<string>>,
    path: string,
): void {
    try {
        replaceCollectionTextExpressions(value, (referencedCollection, textId) => {
            const available = referencedCollection === collectionId ? textIds : importedTexts.get(referencedCollection);
            if (!available?.has(textId)) {
                invalid(`unknown collection text ${textId}`, path);
            }
            return "";
        });
    } catch (error) {
        if (error instanceof CollectionValidationError) {
            throw error;
        }
        invalid(error instanceof Error ? error.message : "Invalid collection text expression", path);
    }
}

export function validateCollectionTextReferences(
    blocs: readonly CollectionBloc[],
    collectionId: string,
    textIds: ReadonlySet<string>,
    importedTexts: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
    views: readonly CollectionView[] = [],
): void {
    for (const bloc of blocs) {
        for (const [field, markup] of [
            ["lightdom", bloc.lightdom],
            ["defaultContent", bloc.defaultContent],
        ] as const) {
            if (markup === undefined) {
                continue;
            }
            const path = `$.blocs[${bloc.id}].${field}`;
            for (const node of nodes(markupTree(markup))) {
                if (node.type === "text") {
                    validateValue(node.data, collectionId, textIds, importedTexts, path);
                } else if (isElement(node)) {
                    for (const value of Object.values(node.attribs)) {
                        validateValue(value, collectionId, textIds, importedTexts, path);
                    }
                }
            }
        }
    }
    for (const view of views) {
        const path = `$.views[${view.id}].html`;
        for (const node of nodes(markupTree(view.html))) {
            if (node.type === "text") {
                validateValue(node.data, collectionId, textIds, importedTexts, path);
            } else if (isElement(node)) {
                for (const value of Object.values(node.attribs)) {
                    validateValue(value, collectionId, textIds, importedTexts, path);
                }
            }
        }
    }
}
