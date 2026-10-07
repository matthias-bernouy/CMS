import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionPage } from "../../../interfaces/CollectionPage";
import { CollectionValidationError, invalid } from "../../errors";
import { replaceCollectionTextExpressions } from "../../texts/expressions";
import { isUserFacingTextAttribute } from "../../texts/userFacingAttributes";
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

function validateNoHardcodedCopy(markup: string, path: string): void {
    for (const node of nodes(markupTree(markup))) {
        if (node.type === "text") {
            validateCopyValue(node.data, path);
            continue;
        }
        if (!isElement(node)) {
            continue;
        }
        for (const [name, value] of Object.entries(node.attribs)) {
            if (isUserFacingTextAttribute(node.name, name, node.attribs.type)) {
                validateCopyValue(value, path);
            }
        }
    }
}

function validateCopyValue(value: string, path: string): void {
    let cursor = 0;
    for (;;) {
        const start = value.indexOf("{{", cursor);
        if (start === -1) {
            if (value.slice(cursor).trim()) {
                invalid("user-facing copy must use a dynamic binding or cms.i18n text", path);
            }
            return;
        }
        if (value.slice(cursor, start).trim()) {
            invalid("user-facing copy must use a dynamic binding or cms.i18n text", path);
        }
        const end = value.indexOf("}}", start + 2);
        if (end === -1) {
            invalid("user-facing copy contains an unterminated binding", path);
        }
        const expression = value.slice(start + 2, end).trim();
        if (!expression || (/^cms(?:$|[^\w$-])/u.test(expression) && !/^cms\.i18n\./u.test(expression))) {
            invalid("user-facing copy may only use business data or cms.i18n bindings", path);
        }
        cursor = end + 2;
    }
}

export function validateCollectionTextReferences(
    blocs: readonly CollectionBloc[],
    collectionId: string,
    textIds: ReadonlySet<string>,
    importedTexts: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
    pages: readonly CollectionPage[] = [],
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
            validateNoHardcodedCopy(markup, path);
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
    for (const page of pages) {
        const path = `$.pages[${page.id}].document.html`;
        validateNoHardcodedCopy(page.document.html, path);
        for (const node of nodes(markupTree(page.document.html))) {
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
