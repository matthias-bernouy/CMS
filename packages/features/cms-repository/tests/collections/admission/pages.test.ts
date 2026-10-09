import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument, textDefinition } from "../fixtures";

const page = {
    id: "overview",
    surface: "control",
    defaultPath: "/admin",
    name: "page.overview.name",
    icon: "star",
    document: {
        html: "<atlas-panel></atlas-panel>",
    },
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

test("collection Page hosts reject undeclared capability and resource attributes", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const bound = {
        ...page,
        requires: [{ contractId: "catalog.items", capabilityId: "item.list", versionRange: "^1.0.0" }],
        document: {
            html: '<atlas-panel cms-source="/.cms/call/catalog.items/item.list as catalog" cms-source-method="POST" cms-source-body="{}"></atlas-panel>',
        },
    };
    expect(() => parseCollectionRelease({ ...source, pages: [bound] })).toThrow(/not a declared setting/);

    const localized = {
        ...source,
        texts: [textDefinition("heading", { "en-US": "Overview" })],
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
                    html: '<atlas-panel title="{{ cms.i18n.atlas.heading }}" artwork="{{ cms.asset.atlas.logo }}"></atlas-panel>',
                },
            },
        ],
    };
    expect(() => parseCollectionRelease(localized)).toThrow(/not a declared setting/);
    expect(() =>
        parseCollectionRelease({
            ...localized,
            pages: [
                { ...page, document: { html: '<atlas-panel title="{{ cms.i18n.atlas.unknown }}"></atlas-panel>' } },
            ],
        }),
    ).toThrow(/not a declared setting/);
});

test("collection Pages admit typed capability forms owned by a composition", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const form =
        '<form cms-source="/.cms/call/catalog.items/item.rename" cms-source-method="POST" cms-source-trigger="submit" cms-source-serialization="typed-json" cms-source-success-reload="#catalog"><label for="title">{{ copy }}</label><input id="title" type="text" name="title" required><input type="hidden" name="expectedRevision" value="1" cms-form-value-type="number"><button type="submit">{{ copy }}</button></form>';
    (source.blocs as Record<string, unknown>[]).push({
        kind: "composition",
        id: "atlas-form-page",
        label: "bloc.page.label",
        lightdom: form,
        slots: {},
        uses: [],
        requires: [{ contractId: "catalog.items", capabilityId: "item.rename", versionRange: "^1.0.0" }],
    });
    const mutation = {
        ...page,
        document: { html: "<atlas-form-page></atlas-form-page>" },
    };
    expect(() => parseCollectionRelease({ ...source, pages: [mutation] })).not.toThrow();
    for (const html of [
        form.replace('cms-source-trigger="submit"', 'action="https://example.com"'),
        form.replace('cms-source-trigger="submit"', 'cms-source-trigger="auto"'),
        form.replace('cms-form-value-type="number"', 'cms-form-value-type="object"'),
    ]) {
        const invalid = structuredClone(source);
        (invalid.blocs as Record<string, unknown>[]).find(({ id }) => id === "atlas-form-page")!.lightdom = html;
        expect(() => parseCollectionRelease({ ...invalid, pages: [mutation] })).toThrow();
    }
});

test("Control Pages reject removed kernel file transports", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const html = `<section>
        <form cms-source="/.cms/call/ulvia.cms.files/uploads" cms-source-method="POST" cms-source-trigger="submit">
            <input type="file" name="file" required><button type="submit">{{ copy }}</button>
        </form>
        <form cms-source="/.cms/call/ulvia.cms.files/uploads/upload_123" cms-source-method="PUT" cms-source-trigger="submit">
            <input type="hidden" name="id" value="{{ item.id }}">
            <input type="file" name="file" required><button type="submit">{{ copy }}</button>
        </form>
        <a href="/.cms/call/ulvia.cms.files/files/{{ item.id }}/{{ item.generation }}" target="_blank" rel="noopener">{{ copy }}</a>
    </section>`;
    expect(() => parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }] })).toThrow();
});

test("collection Pages admit stable Page links without authored routes", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
        "page.private.name": "Private",
    });
    const reference = '{"kind":"contribution","sourceId":"atlas.official","contributionId":"atlas","pageId":"details"}';
    const html = `<atlas-panel><a slot="body" data-cms-page-ref='${reference}' data-cms-page-suffix="?id={{ page.id }}">{{ copy }}</a></atlas-panel>`;
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
        `<a data-cms-page-ref='{"kind":"contribution","sourceId":"ulvia.official","contributionId":"ulvia-official"}'></a>`,
    ]) {
        expect(() =>
            parseCollectionRelease({ ...source, pages: [{ ...page, document: { html: invalidHtml } }] }),
        ).toThrow();
    }
});

test("collection Pages use the closed content grammar", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
    });
    const reference = '{"kind":"contribution","sourceId":"atlas.official","contributionId":"atlas","pageId":"details"}';
    const details = { ...page, id: "details", defaultPath: "/admin/details", name: "page.details.name" };
    const invalidDocuments = [
        '<atlas-panel><p slot="body"><span slot="ghost">{{ copy }}</span></p></atlas-panel>',
        `<atlas-panel><a slot="body" data-cms-page-ref='${reference}'></a></atlas-panel>`,
    ];
    for (const html of invalidDocuments) {
        expect(() =>
            parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }, details] }),
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
