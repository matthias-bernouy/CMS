import { array, fields, nullable, record, revision, text, type Check } from "./validation/values";
import { page, pageReference, publishedRoute, renderablePage, renderableRoute } from "./validation/pages";
import { assetReference, collectionAsset, renderableBloc, renderInputs, texts } from "./validation/resources";
import { settings } from "./validation/settings";
import type { DeliveryOperation } from "./interfaces";

const empty = fields({});
const path = fields({ path: text });
export const deliveryOperations: Readonly<Record<DeliveryOperation, { input: Check; output: Check }>> = Object.freeze({
    "content.texts": { input: empty, output: texts },
    "content.revision": { input: empty, output: revision },
    "content.rendering-revision": { input: empty, output: revision },
    "content.editorial-route": { input: path, output: nullable(fields({ page: renderablePage, language: text })) },
    "content.renderable-page": { input: path, output: nullable(renderablePage) },
    "content.renderable-pages": { input: empty, output: array(renderablePage) },
    "content.resolve-page-reference": { input: fields({ reference: pageReference }), output: nullable(text) },
    "content.resolve-page-paths": { input: fields({ paths: array(text, 256) }), output: record(text) },
    "content.resolve-renderable-route": { input: path, output: renderableRoute },
    "content.published-page": { input: path, output: nullable(page) },
    "content.published-page-by-id": { input: fields({ id: text }), output: nullable(page) },
    "content.published-pages": { input: empty, output: array(page) },
    "content.resolve-published-route": { input: path, output: publishedRoute },
    "content.renderable-blocs": { input: empty, output: array(renderableBloc) },
    "content.bloc-view-js": { input: fields({ tag: text }), output: nullable(text) },
    "content.bloc-views": { input: fields({ tags: array(text, 256) }), output: record(nullable(text)) },
    "content.page-render-inputs": { input: path, output: renderInputs },
    "content.page-render-revision": { input: path, output: revision },
    "content.rendering-settings": { input: empty, output: settings },
    "assets.metadata": { input: assetReference, output: nullable(collectionAsset) },
    "assets.metadata-batch": {
        input: fields({ references: array(assetReference, 256) }),
        output: array(collectionAsset),
    },
});
