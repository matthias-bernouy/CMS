import { validatePageDocument } from "@bernouy/cms-content/page-document";
import { parseHTML } from "linkedom";
import { collectionFixture } from "./admission/examples/buildFixture";
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
    return collectionFixture({
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
        blocs: [
            { ...component(), catalogue: "listed" },
            { ...composition(), catalogue: "listed" },
        ],
    });
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
        description: "bloc.panel.label",
        categories: ["bloc.panel.label"],
        catalogue: "hidden",
        kind: "component",
        id: "atlas-panel",
        label: "bloc.panel.label",
        markup: '<section><slot name="body"></slot></section>',
        style: ":scope { display: block; }",
        root: { accepts: ["div"] },
        slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
        uses: [],
        requires: [],
    };
}

export function composition(): Record<string, unknown> {
    return {
        description: "bloc.page.label",
        categories: ["bloc.page.label"],
        catalogue: "hidden",
        kind: "composition",
        id: "atlas-page",
        label: "bloc.page.label",
        markup: '<div cms-bloc=\"atlas-panel\"><slot name="main" slot="body"><p>{{ copy }}</p></slot></div>',
        root: { accepts: ["div"] },
        slots: { main: { accepts: [{ kind: "native-content", profile: "prose" }] } },
        uses: ["atlas-panel"],
        requires: [],
    };
}

export function demoComponent(extra: Record<string, unknown> = {}) {
    return {
        description: "Card",
        categories: ["Card"],
        catalogue: "hidden",
        kind: "component",
        id: "demo-card",
        label: "Card",
        markup: '<slot name="body"></slot>',
        root: { accepts: ["div"] },
        slots: { body: {} },
        ...extra,
    };
}

export function demoComposition(extra: Record<string, unknown> = {}) {
    return {
        description: "Page",
        categories: ["Page"],
        catalogue: "hidden",
        kind: "composition",
        id: "demo-page",
        label: "Page",
        markup: '<slot name="body"></slot>',
        root: { accepts: ["div"] },
        slots: { body: {} },
        ...extra,
    };
}

export function checkDemoBlocs(values: unknown[], assets: ReadonlySet<string> = new Set()) {
    const definitions = values.map((value: any) => {
        const { exampleContent: _, ...definition } = value;
        return definition;
    });
    const blocs = parseBlocs(definitions, "demo", DEFAULT_COLLECTION_LIMITS);
    validateBlocs(blocs, assets, DEFAULT_COLLECTION_LIMITS);
    for (const value of values as any[]) {
        if (value.exampleContent !== undefined) {
            const { document } = parseHTML("<html><body></body></html>");
            const root = document.createElement(value.root.accepts[0]);
            root.setAttribute("cms-bloc", value.id);
            for (const [key, item] of Object.entries(value.root.defaults ?? {})) {
                root.setAttribute(key, String(item));
            }
            root.innerHTML = value.exampleContent;
            validatePageDocument(root.outerHTML, blocs);
        }
    }
    return blocs;
}
