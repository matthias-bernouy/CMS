import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import { CollectionValidationError, invalid } from "../../errors";
import { replaceCollectionTextExpressions } from "../../texts/expressions";
import { isElement, markupTree, nodes } from "./tree";

function validateValue(value: string, collectionId: string, textIds: ReadonlySet<string>, path: string): void {
    try {
        replaceCollectionTextExpressions(value, (referencedCollection, textId) => {
            if (referencedCollection !== collectionId) {
                invalid(`collection text must use namespace ${collectionId}`, path);
            }
            if (!textIds.has(textId)) {
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
): void {
    for (const bloc of blocs) {
        if (bloc.lightdom === undefined) {
            continue;
        }
        const path = `$.blocs[${bloc.id}].lightdom`;
        for (const node of nodes(markupTree(bloc.lightdom))) {
            if (node.type === "text") {
                validateValue(node.data, collectionId, textIds, path);
            } else if (isElement(node)) {
                for (const value of Object.values(node.attribs)) {
                    validateValue(value, collectionId, textIds, path);
                }
            }
        }
    }
}
