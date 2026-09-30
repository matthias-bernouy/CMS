/** Browser-safe text contracts, validation and formatting; no catalogue, HTML parser or adapter imports. */
export type {
    CollectionText,
    CollectionTextValue,
    CollectionTextOverrides,
    ResolvedCollectionText,
} from "cms-repository/collections/interfaces/CollectionText";
export {
    parseCollectionTexts,
    parseCollectionTextOverrides,
} from "cms-repository/collections/core/texts/parseCollectionTexts";
export {
    resolveCollectionTexts,
    formatCollectionText,
} from "cms-repository/collections/core/texts/resolveCollectionTexts";
