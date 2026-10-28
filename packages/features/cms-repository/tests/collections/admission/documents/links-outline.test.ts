import { expect, test } from "bun:test";
import { collectionFixture, collectionDocument, parseCollectionRelease, textDefinition, example } from "./fixture";

test("example documents use native links with statically identifiable paths", () => {
    const source = collectionDocument({
        "page.overview.name": "Overview",
        "page.details.name": "Details",
        "page.private.name": "Private",
    });
    const html =
        '<div cms-bloc=\"atlas-panel\"><a slot="body" href="/admin/details?id={{ page.id | urlencode }}">{{ copy }}</a></div>';
    const details = { ...example, id: "details", label: "page.details.name" };
    expect(() =>
        parseCollectionRelease(
            collectionFixture({ ...source, examples: [{ ...example, document: { html } }, details] }),
        ),
    ).not.toThrow();
    for (const invalidHtml of [
        '<div cms-bloc=\"atlas-panel\"><a slot="body" href="/{{ page.path }}">{{ copy }}</a></div>',
        '<div cms-bloc=\"atlas-panel\"><a slot="body" data-cms-page-ref="details">{{ copy }}</a></div>',
        '<div cms-bloc=\"atlas-panel\"><div slot="body" href="/admin/details">{{ copy }}</div></div>',
    ]) {
        expect(() =>
            parseCollectionRelease(
                collectionFixture({ ...source, examples: [{ ...example, document: { html: invalidHtml } }] }),
            ),
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
    const details = { ...example, id: "details", label: "page.details.name" };
    const blocs = structuredClone(source.blocs) as Record<string, unknown>[];
    const composition = blocs.find(({ id }) => id === "atlas-page")!;
    composition.slots = {};
    composition.uses = [];
    composition.markup = '<a href="/admin/details">{{ cms.i18n.atlas.details }}</a>';
    expect(() =>
        parseCollectionRelease(collectionFixture({ ...source, blocs, examples: [example, details] })),
    ).not.toThrow();

    composition.markup = '<a href="/admin/pagez">{{ cms.i18n.atlas.details }}</a>';
    expect(() =>
        parseCollectionRelease(collectionFixture({ ...source, blocs, examples: [example, details] })),
    ).not.toThrow();
});

test("collection admission validates the outline after expanding local compositions", () => {
    const source = collectionDocument({
        "bloc.heading.label": "Heading",
        "bloc.outline.label": "Outline",
        "page.overview.name": "Overview",
    });
    const heading = {
        description: "bloc.heading.label",
        categories: ["bloc.heading.label"],

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
        description: "bloc.outline.label",
        categories: ["bloc.outline.label"],

        kind: "composition",
        id: "atlas-outline",
        label: "bloc.outline.label",
        markup,
        root: { accepts: ["div"] },
        slots: {},
        uses: ["atlas-heading"],
        requires: [],
    });
    const collectionExample = { ...example, document: { html: '<div cms-bloc="atlas-outline"></div>' } };

    expect(() =>
        parseCollectionRelease(
            collectionFixture({
                ...source,
                blocs: [
                    ...(source.blocs as unknown[]),
                    heading,
                    outline('<h2 cms-bloc="atlas-heading">{{ copy }}</h2><h4 cms-bloc="atlas-heading">{{ copy }}</h4>'),
                ],
                examples: [collectionExample],
            }),
        ),
    ).toThrow("skips from h2 to h4");
    expect(() =>
        parseCollectionRelease(
            collectionFixture({
                ...source,
                blocs: [
                    ...(source.blocs as unknown[]),
                    heading,
                    outline('<h1 cms-bloc="atlas-heading">{{ copy }}</h1><h1 cms-bloc="atlas-heading">{{ copy }}</h1>'),
                ],
                examples: [collectionExample],
            }),
        ),
    ).toThrow("at most one h1");
});
