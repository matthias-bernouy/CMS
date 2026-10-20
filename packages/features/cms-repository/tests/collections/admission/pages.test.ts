import { expect, test } from "bun:test";
import { parseCollectionRelease } from "../../../src/exports/collections";
import { collectionDocument, textDefinition } from "../fixtures";

const page = {
    id: "overview",
    defaultPath: "/admin",
    name: "page.overview.name",
    document: {
        html: '<div cms-bloc="atlas-panel"></div>',
    },
} as const;

test("collection Pages keep one bounded document in the global route namespace", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const release = parseCollectionRelease({ ...source, pages: [page] });
    expect(release.pages?.[0]?.document.html).toBe(page.document.html);
    expect(release.pages?.[0]?.uses).toEqual(["atlas-panel"]);

    for (const invalid of [
        { ...page, defaultPath: "/.cms/catalog" },
        { ...page, defaultPath: "/catalog?preview=true" },
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
            html: '<div cms-bloc=\"atlas-panel\" cms-mutation="catalog.items:item.list as catalog"></div>',
        },
    };
    expect(() => parseCollectionRelease({ ...source, pages: [bound] })).toThrow(/mutations are reserved for form/u);

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
                    html: '<div cms-bloc=\"atlas-panel\" title="{{ cms.i18n.atlas.heading }}" artwork="{{ cms.asset.atlas.logo }}"></div>',
                },
            },
        ],
    };
    expect(() => parseCollectionRelease(localized)).toThrow(/neither a declared setting/);
    expect(() =>
        parseCollectionRelease({
            ...localized,
            pages: [
                {
                    ...page,
                    document: { html: '<div cms-bloc=\"atlas-panel\" title="{{ cms.i18n.atlas.unknown }}"></div>' },
                },
            ],
        }),
    ).toThrow(/neither a declared setting/);
});

test("collection Pages admit typed capability forms owned by a composition", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const form =
        '<form cms-mutation="catalog.items:item.rename as renamed"><label for="title">{{ copy }}</label><input id="title" type="text" name="title" required><input type="hidden" name="expectedRevision" value="1" cms-form-value-type="number"><button type="submit">{{ copy }}</button></form>';
    (source.blocs as Record<string, unknown>[]).push({
        kind: "composition",
        root: { accepts: ["div"] },
        id: "atlas-form-page",
        label: "bloc.page.label",
        markup: form,
        slots: {},
        uses: [],
        requires: [{ contractId: "catalog.items", capabilityId: "item.rename", versionRange: "^1.0.0" }],
    });
    const mutation = {
        ...page,
        document: { html: '<div cms-bloc="atlas-form-page"></div>' },
    };
    expect(() => parseCollectionRelease({ ...source, pages: [mutation] })).not.toThrow();
    for (const html of [
        form.replace('cms-mutation="catalog.items:item.rename as renamed"', 'action="https://example.com"'),
        form.replace("catalog.items:item.rename as renamed", "catalog.items:item.rename"),
        form.replace('cms-form-value-type="number"', 'cms-form-value-type="object"'),
    ]) {
        const invalid = structuredClone(source);
        (invalid.blocs as Record<string, unknown>[]).find(({ id }) => id === "atlas-form-page")!.markup = html;
        expect(() => parseCollectionRelease({ ...invalid, pages: [mutation] })).toThrow();
    }
});

test("collection Pages use declared Access capabilities instead of Kernel-owned authentication", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const authentication = {
        kind: "composition",
        root: { accepts: ["div"] },
        id: "atlas-authentication",
        label: "bloc.page.label",
        markup: `<section>
            <form cms-mutation="ulvia.cms.access:login-password as session">
                <input type="email" name="email" required>
                <input type="password" name="password" required>
                <button type="submit">{{ copy }}</button>
            </form>
        </section>`,
        slots: {},
        uses: [],
        requires: [
            {
                contractId: "ulvia.cms.access",
                capabilityId: "login-password",
                versionRange: "^1.0.0",
            },
        ],
    };
    const login = { ...page, document: { html: '<div cms-bloc="atlas-authentication"></div>' } };
    expect(() =>
        parseCollectionRelease({ ...source, blocs: [...source.blocs, authentication], pages: [login] }),
    ).not.toThrow();

    for (const markup of [
        authentication.markup.replace("ulvia.cms.access:login-password", "kernel.auth:login"),
        authentication.markup.replace("ulvia.cms.access:login-password", "kernel.auth:secrets"),
    ]) {
        expect(() =>
            parseCollectionRelease({
                ...source,
                blocs: [...source.blocs, { ...authentication, markup }],
                pages: [login],
            }),
        ).toThrow();
    }
});

test("Pages reject removed kernel file transports", () => {
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

test("collection Pages use native links with statically identifiable paths", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
        "page.private.name": "Private",
    });
    const html =
        '<div cms-bloc=\"atlas-panel\"><a slot="body" href="/admin/details?id={{ page.id | urlencode }}">{{ copy }}</a></div>';
    const details = { ...page, id: "details", defaultPath: "/admin/details", name: "page.details.name" };
    expect(() =>
        parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }, details] }),
    ).not.toThrow();
    for (const invalidHtml of [
        '<div cms-bloc=\"atlas-panel\"><a slot="body" href="/{{ page.path }}">{{ copy }}</a></div>',
        '<div cms-bloc=\"atlas-panel\"><a slot="body" href="/admin/pagez">{{ copy }}</a></div>',
        '<div cms-bloc=\"atlas-panel\"><a slot="body" data-cms-page-ref="details">{{ copy }}</a></div>',
        '<div cms-bloc=\"atlas-panel\"><div slot="body" href="/admin/details">{{ copy }}</div></div>',
    ]) {
        expect(() =>
            parseCollectionRelease({ ...source, pages: [{ ...page, document: { html: invalidHtml } }] }),
        ).toThrow();
    }
});

test("collection admission validates links from every Bloc template", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
        "text.label.details": "Details",
    });
    source.texts = [textDefinition("details", { en: "Details", "en-US": "Details" })];
    const details = { ...page, id: "details", defaultPath: "/admin/details", name: "page.details.name" };
    const blocs = structuredClone(source.blocs) as Record<string, unknown>[];
    const composition = blocs.find(({ id }) => id === "atlas-page")!;
    composition.defaultContent = '<a slot="main" href="/admin/details">{{ cms.i18n.atlas.details }}</a>';
    expect(() => parseCollectionRelease({ ...source, blocs, pages: [page, details] })).not.toThrow();

    composition.defaultContent = '<a slot="main" href="/admin/pagez">{{ cms.i18n.atlas.details }}</a>';
    expect(() => parseCollectionRelease({ ...source, blocs, pages: [page, details] })).toThrow(
        "Collection Bloc atlas-page references an undeclared Page route",
    );
});

test("collection Pages use the closed content grammar", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
    });
    const details = { ...page, id: "details", defaultPath: "/admin/details", name: "page.details.name" };
    const invalidDocuments = [
        '<div cms-bloc=\"atlas-panel\"><p slot="body"><span slot="ghost">{{ copy }}</span></p></div>',
        '<div cms-bloc=\"atlas-panel\"><a slot="body" data-cms-page-ref="details"></a></div>',
    ];
    for (const html of invalidDocuments) {
        expect(() =>
            parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }, details] }),
        ).toThrow();
    }
});

test("collection admission validates the outline after expanding local compositions", () => {
    const source = collectionDocument({
        "bloc.heading.label": "Heading",
        "bloc.outline.label": "Outline",
        "page.overview.name": "Overview",
    });
    const heading = {
        kind: "component",
        id: "atlas-heading",
        label: "bloc.heading.label",
        markup: "<slot></slot>",
        root: { accepts: ["h1", "h2", "h3", "h4", "h5", "h6"] },
        slots: { default: { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 1 } },
        uses: [],
        requires: [],
    };
    const outline = (markup: string) => ({
        kind: "composition",
        id: "atlas-outline",
        label: "bloc.outline.label",
        markup,
        root: { accepts: ["div"] },
        slots: {},
        uses: ["atlas-heading"],
        requires: [],
    });
    const collectionPage = { ...page, document: { html: '<div cms-bloc="atlas-outline"></div>' } };

    expect(() =>
        parseCollectionRelease({
            ...source,
            blocs: [
                ...(source.blocs as unknown[]),
                heading,
                outline('<h2 cms-bloc="atlas-heading">{{ copy }}</h2><h4 cms-bloc="atlas-heading">{{ copy }}</h4>'),
            ],
            pages: [collectionPage],
        }),
    ).toThrow("skips from h2 to h4");
    expect(() =>
        parseCollectionRelease({
            ...source,
            blocs: [
                ...(source.blocs as unknown[]),
                heading,
                outline('<h1 cms-bloc="atlas-heading">{{ copy }}</h1><h1 cms-bloc="atlas-heading">{{ copy }}</h1>'),
            ],
            pages: [collectionPage],
        }),
    ).toThrow("at most one h1");
});

test("collection Pages reject executable or unbounded markup", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    for (const html of [
        "<script>alert(1)</script>",
        '<a href="https://example.com">Leave</a>',
        '<div style="color:red">Inline style</div>',
        '<div onclick="run()">Handler</div>',
        '<div cms-bloc="atlas-unknown"></div>',
        '<section cms-mutation="catalog.items:item.list as items"></section>',
        '<section cms-query="catalog.items:item.list"></section>',
    ]) {
        expect(() => parseCollectionRelease({ ...source, pages: [{ ...page, document: { html } }] })).toThrow();
    }
});
