/** Browser-safe text contracts, validation and locale resolution; no catalogue, HTML parser or adapter imports. */
export type {
    CollectionText,
    CollectionTextOverrides,
    ResolvedCollectionText,
} from "repository/collections/interfaces/CollectionText";
export {
    parseCollectionTexts,
    parseCollectionTextOverrides,
} from "repository/collections/core/texts/parseCollectionTexts";
export { resolveCollectionTexts } from "repository/collections/core/texts/resolveCollectionTexts";
export { replaceCollectionTextExpressions } from "repository/collections/core/texts/expressions";
export { isUserFacingTextAttribute } from "repository/collections/core/texts/userFacingAttributes";
