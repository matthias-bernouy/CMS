import type { CollectionRelease } from "@bernouy/cms-repository/collections";
import { parseCollectionTexts } from "@bernouy/cms-repository/collections/texts";
import checkoutMarkup from "./checkout.html" with { type: "text" };
import checkoutTexts from "./texts.json";

/** Authored, trusted workspace example; it has no runtime adapter or provider dependency. */
export const checkoutExample: CollectionRelease = {
    kind: "collection",
    protocol: "ulvia-collection/v1",
    schemaDialect: "ulvia-schema/v1",
    collectionId: "checkout",
    publisherId: "ulvia.examples",
    version: "1.0.0",
    name: "Checkout text example",
    locale: "en",
    texts: parseCollectionTexts(checkoutTexts, "en"),
    assets: [],
    blocs: [
        {
            kind: "composition",
            id: "checkout-summary",
            lightdom: String(checkoutMarkup),
            uses: [],
            requires: [],
            slots: {},
        },
    ],
};

export { checkoutMarkup };
