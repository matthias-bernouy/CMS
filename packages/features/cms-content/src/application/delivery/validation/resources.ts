import { MANAGED_NATIVE_ELEMENT_TAGS } from "cms-content/blocs/core/markup/validation/contracts/managedNativePolicy";
import { array, fields, flag, integer, literal, nullable, optional, record, text } from "./values";
import { renderableRoute } from "./pages";
import { settings } from "./settings";
import { revision } from "./values";

const digest = (value: unknown) => {
    text(value);
    if (!/^sha256:[0-9a-f]{64}$/u.test(value as string)) {
        throw new TypeError("Invalid content asset digest");
    }
};

const deprecation = fields({ reason: text, replacedBy: optional(text), sunsetAt: optional(text) });
export const assetReference = fields({ collectionId: text, assetId: text });
export const collectionAsset = fields({
    collectionId: text,
    digest,
    asset: fields({
        id: text,
        mediaType: text,
        byteLength: integer,
        digest,
        profiles: optional(array(literal("inline-svg"))),
        deprecation: optional(deprecation),
    }),
});
const browser = fields({
    frames: fields({
        origins: array(text),
        sandbox: array(
            literal(
                "allow-downloads",
                "allow-forms",
                "allow-modals",
                "allow-popups",
                "allow-same-origin",
                "allow-scripts",
            ),
        ),
    }),
});
export const renderableBloc = fields({
    id: text,
    kind: literal("component", "composition"),
    markupHTML: text,
    browser: optional(browser),
    uses: optional(array(text)),
    root: fields({
        accepts: array(literal(...MANAGED_NATIVE_ELEMENT_TAGS)),
        attributes: optional(record(fields({ required: optional(flag), values: optional(array(text)) }))),
        defaults: optional(record(text)),
    }),
    styleCSS: optional(text),
    styleCollectionId: optional(text),
    hasBehavior: flag,
});
export const texts = fields({
    defaultLocale: text,
    sources: array(fields({ namespace: text, catalogues: record(record(text)) })),
});
export const renderInputs = fields({
    route: renderableRoute,
    artifactRevision: revision,
    renderingRevision: revision,
    settings,
    renderableBlocs: array(renderableBloc),
    blocViews: record(nullable(text)),
    collectionAssets: array(collectionAsset),
    texts,
});
