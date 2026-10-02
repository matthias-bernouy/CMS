/** Browser-safe text contracts, validation and locale resolution; no catalogue, HTML parser or adapter imports. */
export type {
    CollectionText,
    CollectionTextOverrides,
    ResolvedCollectionText,
} from "cms-repository/collections/interfaces/CollectionText";
export {
    parseCollectionTexts,
    parseCollectionTextOverrides,
} from "cms-repository/collections/core/texts/parseCollectionTexts";
export { resolveCollectionTexts } from "cms-repository/collections/core/texts/resolveCollectionTexts";
export { replaceCollectionTextExpressions } from "cms-repository/collections/core/texts/expressions";
