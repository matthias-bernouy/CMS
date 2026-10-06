import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument } from "../fixtures";

const page = {
    id: "overview",
    surface: "control",
    defaultPath: "/admin",
    name: "page.overview.name",
    icon: "star",
    document: { html: "<section><h2>Overview</h2><atlas-panel></atlas-panel></section>" },
} as const;

test("collection Pages keep one bounded document on exactly one surface", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const release = parseCollectionRelease({ ...source, pages: [page] });
    expect(release.pages?.[0]?.document.html).toBe(page.document.html);
    expect(release.pages?.[0]?.uses).toEqual(["atlas-panel"]);
    expect(release.pages?.[0]?.surface).toBe("control");

    for (const invalid of [
        { ...page, surface: "control", defaultPath: "/catalog" },
        { ...page, surface: "delivery", defaultPath: "/admin/catalog" },
        { ...page, surface: "delivery", defaultPath: "/.cms/catalog" },
    ]) {
        expect(() => parseCollectionRelease({ ...source, pages: [invalid] })).toThrow();
    }
});

test("collection Pages derive capability and resource references from their document", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const bound = {
        ...page,
        requires: [{ contractId: "catalog.items", capabilityId: "item.list", versionRange: "^1.0.0" }],
        document: {
            html: '<section cms-source="/.cms/call/catalog.items/item.list as catalog" cms-source-method="POST" cms-source-body="{}"><p cms-condition="$source.loaded">{{ catalog.items.length }}</p></section>',
        },
    };
    expect(parseCollectionRelease({ ...source, pages: [bound] }).pages?.[0]?.requires).toEqual(bound.requires);
    expect(() => parseCollectionRelease({ ...source, pages: [{ ...bound, requires: [] }] })).toThrow(/exactly match/);

    const localized = {
        ...source,
        texts: [{ id: "heading", values: { "en-US": "Overview" } }],
        assets: [
            {
                id: "logo",
                mediaType: "image/svg+xml",
                byteLength: 0,
                digest: `sha256:${"0".repeat(64)}`,
            },
        ],
        pages: [
            {
                ...page,
                document: {
                    html: '<section><h2>{{ cms.i18n.atlas.heading }}</h2><atlas-panel artwork="{{ cms.asset.atlas.logo }}"></atlas-panel></section>',
                },
            },
        ],
    };
    expect(() => parseCollectionRelease(localized)).not.toThrow();
    expect(() =>
        parseCollectionRelease({
            ...localized,
            pages: [{ ...page, document: { html: "<section>{{ cms.i18n.atlas.unknown }}</section>" } }],
        }),
    ).toThrow(/unknown collection text/);
});

test("collection Pages admit typed capability forms without browser-owned actions", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const mutation = {
        ...page,
        requires: [{ contractId: "catalog.items", capabilityId: "item.rename", versionRange: "^1.0.0" }],
        document: {
            html: '<form cms-source="/.cms/call/catalog.items/item.rename" cms-source-method="POST" cms-source-trigger="submit" cms-source-serialization="typed-json" cms-source-success-reload="#catalog"><label for="title">Title</label><input id="title" type="text" name="title" required><input type="hidden" name="expectedRevision" value="1" cms-form-value-type="number"><button type="submit">Save</button></form>',
        },
    };
    expect(() => parseCollectionRelease({ ...source, pages: [mutation] })).not.toThrow();
    for (const html of [
        mutation.document.html.replace('cms-source-trigger="submit"', 'action="https://example.com"'),
        mutation.document.html.replace('cms-source-trigger="submit"', 'cms-source-trigger="auto"'),
        mutation.document.html.replace('cms-form-value-type="number"', 'cms-form-value-type="object"'),
    ]) {
        expect(() => parseCollectionRelease({ ...source, pages: [{ ...mutation, document: { html } }] })).toThrow();
    }
});

test("collection Pages admit stable Page links without authored routes", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
        "page.private.name": "Private",
    });
    const reference = '{"kind":"collection","publisherId":"atlas.official","collectionId":"atlas","pageId":"details"}';
    const html = `<section><a data-cms-page-ref='${reference}' data-cms-page-suffix="?id={{ page.id }}">Details</a></section>`;
    const details = { ...page, id: "details", defaultPath: "/admin/details", name: "page.details.name" };
    expect(() =>
        parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }, details] }),
    ).not.toThrow();
    expect(() => parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }] })).toThrow(
        /unknown Page details/,
    );
    const delivery = {
        ...page,
        id: "public",
        surface: "delivery",
        defaultPath: "/public",
        document: { html },
    };
    expect(() => parseCollectionRelease({ ...source, pages: [delivery, details] })).toThrow(/cannot link to Control/);
    for (const invalidHtml of [
        `<div data-cms-page-ref='${reference}'></div>`,
        `<a data-cms-page-ref='${reference}' data-cms-page-suffix="/admin/pages"></a>`,
        `<a data-cms-page-ref='{"kind":"collection","publisherId":"ulvia.official","collectionId":"ulvia-official"}'></a>`,
    ]) {
        expect(() =>
            parseCollectionRelease({ ...source, pages: [{ ...page, document: { html: invalidHtml } }] }),
        ).toThrow();
    }
});

test("collection Pages reject executable or unbounded markup", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    for (const html of [
        "<script>alert(1)</script>",
        '<a href="https://example.com">Leave</a>',
        '<div style="color:red">Inline style</div>',
        '<div onclick="run()">Handler</div>',
        "<atlas-unknown></atlas-unknown>",
        '<section cms-source="/api/users" cms-source-method="POST"></section>',
        '<section cms-source="/.cms/call/catalog.items/item.list" cms-source-method="GET"></section>',
    ]) {
        expect(() => parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }] })).toThrow();
    }
});

test("Pages cannot use local Blocs outside their surface", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const blocs = source.blocs as Record<string, unknown>[];
    blocs.find(({ id }) => id === "atlas-panel")!.surfaces = ["delivery"];
    expect(() => parseCollectionRelease({ ...source, pages: [page] })).toThrow(/outside the control surface/);
});
