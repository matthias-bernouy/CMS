import { expect, test } from "bun:test";
import { collectionFixture, collectionDocument, parseCollectionRelease, textDefinition, example } from "./fixture";

test("rejects removed collection Page resources without a compatibility reader", () => {
    const source = collectionDocument();
    for (const patch of [
        { pages: [] },
        { exports: { blocs: [], themeTokens: [], pages: [] } },
        {
            dependencies: [
                {
                    collectionId: "other",
                    publisherId: "example",
                    versionRange: "^1.0.0",
                    imports: { pages: [{ id: "home", defaultPath: "/" }] },
                },
            ],
        },
    ]) {
        expect(() => parseCollectionRelease(collectionFixture({ ...source, ...patch }))).toThrow(
            'unknown property "pages"',
        );
    }
});

test("example document hosts reject undeclared capability and resource attributes", () => {
    const source = collectionDocument({ "page.overview.name": "Overview" });
    const bound = {
        ...example,
        requires: [{ contractId: "catalog.items", capabilityId: "item.list", versionRange: "^1.0.0" }],
        document: {
            html: '<div cms-bloc=\"atlas-panel\" cms-mutation="catalog.items:item.list as catalog"></div>',
        },
    };
    expect(() => parseCollectionRelease(collectionFixture({ ...source, examples: [bound] }))).toThrow(
        /mutations are reserved for form/u,
    );

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
        examples: [
            {
                ...example,
                document: {
                    html: '<div cms-bloc=\"atlas-panel\" title="{{ cms.i18n.atlas.heading }}" artwork="{{ cms.asset.atlas.logo }}"></div>',
                },
            },
        ],
    };
    expect(() => parseCollectionRelease(collectionFixture(localized))).toThrow(/neither a declared setting/);
    expect(() =>
        parseCollectionRelease(
            collectionFixture({
                ...localized,
                examples: [
                    {
                        ...example,
                        document: { html: '<div cms-bloc=\"atlas-panel\" title="{{ cms.i18n.atlas.unknown }}"></div>' },
                    },
                ],
            }),
        ),
    ).toThrow(/neither a declared setting/);
});

test("example documents use the closed content grammar", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
    });
    const details = { ...example, id: "details", label: "page.details.name" };
    const invalidDocuments = [
        '<div cms-bloc=\"atlas-panel\"><p slot="body"><span slot="ghost">{{ copy }}</span></p></div>',
        '<div cms-bloc=\"atlas-panel\"><a slot="body" data-cms-page-ref="details"></a></div>',
    ];
    for (const html of invalidDocuments) {
        expect(() =>
            parseCollectionRelease(
                collectionFixture({ ...source, examples: [{ ...example, document: { html } }, details] }),
            ),
        ).toThrow();
    }
});

test("example documents reject executable or unbounded markup", () => {
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
        expect(() =>
            parseCollectionRelease(collectionFixture({ ...source, examples: [{ ...example, document: { html } }] })),
        ).toThrow();
    }
});
