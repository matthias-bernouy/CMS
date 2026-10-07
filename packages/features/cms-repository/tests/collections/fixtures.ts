import { DEFAULT_COLLECTION_LIMITS } from "../../src/collections/core/limits";
import { parseBlocs } from "../../src/collections/core/parsing/blocs/parseBlocs";
import { validateBlocs } from "../../src/collections/core/parsing/blocs/validateBlocs";

export function collectionDocument(translations: Record<string, string> = {}): Record<string, unknown> {
    const messages = {
        "bloc.page.label": "Page",
        "bloc.panel.label": "Panel",
        "collection.name": "Atlas UI",
        "text.category.content": "Content",
        "text.group.general": "General",
        "text.label.greeting": "Greeting",
        "text.label.heading": "Heading",
        "text.label.hello": "Hello",
        "text.label.legacy-title": "Legacy title",
        "text.label.other": "Other",
        "text.label.submit": "Submit",
        "text.label.title": "Title",
        ...translations,
    };
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "atlas",
        publisherId: "atlas.official",
        version: "1.0.0",
        name: "collection.name",
        locale: "en-US",
        translations: {
            en: { ...messages },
            "en-US": { ...messages },
        },
        assets: [],
        blocs: [component(), composition()],
    };
}

export function textDefinition(id: string, values: Readonly<Record<string, string>>): Record<string, unknown> {
    return {
        id,
        label: `text.label.${id}`,
        category: "text.category.content",
        group: "text.group.general",
        values,
    };
}

export function component(): Record<string, unknown> {
    return {
        kind: "component",
        id: "atlas-panel",
        label: "bloc.panel.label",
        shadowdom: '<section><slot name="body"></slot></section>',
        style: ":host { display: block; }",
        slots: { body: {} },
        uses: [],
        requires: [],
    };
}

export function composition(): Record<string, unknown> {
    return {
        kind: "composition",
        id: "atlas-page",
        label: "bloc.page.label",
        lightdom: '<atlas-panel><slot name="main" slot="body"><p>{{ copy }}</p></slot></atlas-panel>',
        defaultContent: '<p slot="main"></p>',
        slots: { main: {} },
        uses: ["atlas-panel"],
        requires: [],
    };
}

export function demoComponent(extra: Record<string, unknown> = {}) {
    return {
        kind: "component",
        id: "demo-card",
        label: "Card",
        shadowdom: '<slot name="body"></slot>',
        slots: { body: {} },
        ...extra,
    };
}

export function demoComposition(extra: Record<string, unknown> = {}) {
    return {
        kind: "composition",
        id: "demo-page",
        label: "Page",
        lightdom: '<slot name="body"></slot>',
        slots: { body: {} },
        ...extra,
    };
}

export function checkDemoBlocs(values: unknown[], assets: ReadonlySet<string> = new Set()) {
    const blocs = parseBlocs(values, "demo", DEFAULT_COLLECTION_LIMITS);
    validateBlocs(blocs, assets, DEFAULT_COLLECTION_LIMITS);
    return blocs;
}
