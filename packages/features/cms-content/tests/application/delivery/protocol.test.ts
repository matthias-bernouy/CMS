import { expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/cms-content";
import { projectRenderingSettings } from "@bernouy/cms-content/rendering";
import {
    deliveryOperation,
    parseDeliveryInput,
    parseDeliveryValue,
    encodeDeliveryOutput,
    decodeDeliveryOutput,
    type DeliveryOperation,
} from "@bernouy/cms-content/delivery";

const page = {
    id: "home",
    revision: 1,
    path: "/",
    content: "<main></main>",
    title: "Home",
    description: "",
    visible: true,
    tags: [],
};
const renderable = {
    reference: { kind: "site", pageId: page.id },
    page,
    source: { kind: "site", pageId: page.id, revision: 1 },
    requirements: [],
};
const asset = {
    collectionId: "example",
    digest: `sha256:${"a".repeat(64)}`,
    asset: { id: "image.webp", byteLength: 10, mediaType: "image/webp", digest: `sha256:${"b".repeat(64)}` },
};
const bloc = {
    id: "example-card",
    kind: "component",
    markupHTML: "<slot></slot>",
    root: { accepts: ["div"] },
    hasBehavior: false,
};
const texts = { defaultLocale: "en", sources: [{ namespace: "example", catalogues: { en: { title: "Example" } } }] };
const settings = projectRenderingSettings(defaultSystem());
const inputs = {
    route: { kind: "current", page: renderable, language: "en" },
    artifactRevision: "1",
    renderingRevision: 1,
    settings,
    texts,
    renderableBlocs: [bloc],
    blocViews: { "example-card": null },
    collectionAssets: [asset],
};
const cases: Record<DeliveryOperation, [unknown, unknown]> = {
    "content.texts": [{}, texts],
    "content.revision": [{}, 1],
    "content.rendering-revision": [{}, "2"],
    "content.editorial-route": [{ path: "/" }, { page: renderable, language: "en" }],
    "content.renderable-page": [{ path: "/" }, renderable],
    "content.renderable-pages": [{}, [renderable]],
    "content.resolve-page-reference": [{ reference: { kind: "site", pageId: "home" } }, "/"],
    "content.resolve-page-paths": [{ paths: ["/"] }, { "/": "/" }],
    "content.resolve-renderable-route": [{ path: "/" }, inputs.route],
    "content.published-page": [{ path: "/" }, page],
    "content.published-page-by-id": [{ id: "home" }, page],
    "content.published-pages": [{}, [page]],
    "content.resolve-published-route": [{ path: "/" }, { kind: "current", page, language: "en" }],
    "content.renderable-blocs": [{}, [bloc]],
    "content.bloc-view-js": [{ tag: "example-card" }, null],
    "content.bloc-views": [{ tags: ["example-card"] }, inputs.blocViews],
    "content.page-render-inputs": [{ path: "/" }, inputs],
    "content.page-render-revision": [{ path: "/" }, "1"],
    "content.rendering-settings": [{}, settings],
    "assets.metadata": [{ collectionId: "example", assetId: "image.webp" }, asset],
    "assets.metadata-batch": [{ references: [{ collectionId: "example", assetId: "image.webp" }] }, [asset]],
};

test("every delivery operation validates its input and round-trips a typed projection", () => {
    for (const [name, [input, output]] of Object.entries(cases)) {
        const operation = deliveryOperation(name);
        expect(parseDeliveryInput(operation, input)).toEqual(input);
        expect(decodeDeliveryOutput(operation, encodeDeliveryOutput(operation, output))).toEqual(output);
        expect(() => parseDeliveryValue(operation, { unexpected: true })).toThrow();
        expect(() => parseDeliveryInput(operation, { unexpected: true })).toThrow();
    }
    expect(() => deliveryOperation("__proto__")).toThrow();
    expect(() => deliveryOperation("unknown.operation")).toThrow();
});

test("both transport boundaries reject malformed nested projection data", () => {
    const malformed: Array<[DeliveryOperation, unknown]> = [
        ["content.published-page", { ...page, id: 17 }],
        ["content.resolve-renderable-route", { kind: "current", page: null, language: "en" }],
        ["content.page-render-inputs", { ...inputs, renderableBlocs: [42] }],
        ["content.page-render-inputs", { ...inputs, blocViews: { "example-card": 42 } }],
        ["content.texts", { ...texts, sources: [{ namespace: "example", catalogues: { en: { title: 42 } } }] }],
        ["content.rendering-settings", { ...settings, security: { connectExtras: [42], mediaExtras: [] } }],
        ["assets.metadata", { ...asset, asset: { ...asset.asset, digest: "invalid" } }],
        ["content.published-page", { ...page, operatorSecret: "must reject" }],
    ];
    for (const [operation, value] of malformed) {
        expect(() => encodeDeliveryOutput(operation, value)).toThrow();
        expect(() => decodeDeliveryOutput(operation, { chunks: [JSON.stringify(value)] })).toThrow();
    }
});

test("delivery enforces per-input bounds, envelope shape and the encoded byte budget", () => {
    expect(() => parseDeliveryInput("content.resolve-page-paths", { paths: Array(257).fill("/") })).toThrow();
    expect(() => parseDeliveryInput("content.resolve-page-reference", { reference: { path: "/" } })).toThrow();
    expect(() => decodeDeliveryOutput("content.revision", { chunks: ["1"], extra: true })).toThrow();
    expect(() => decodeDeliveryOutput("content.revision", { chunks: Array(7).fill("x".repeat(1024 * 1024)) })).toThrow(
        "byte budget",
    );
    expect(() => encodeDeliveryOutput("content.bloc-views", { oversized: "x".repeat(8 * 1024 * 1024) })).toThrow(
        "byte budget",
    );
});

test("chunking preserves Unicode scalar boundaries and decoders return independent values", () => {
    const value = { a: `${"x".repeat(1024 * 1024 - 7)}🙂` };
    const encoded = encodeDeliveryOutput("content.bloc-views", value);
    expect(encoded.chunks).toHaveLength(2);
    expect(encoded.chunks.every((chunk) => chunk.isWellFormed())).toBe(true);
    expect(decodeDeliveryOutput("content.bloc-views", encoded)).toEqual(value);
    const decoded = parseDeliveryValue("content.published-page", page)!;
    decoded.tags.push("changed");
    expect(page.tags).toEqual([]);
});
