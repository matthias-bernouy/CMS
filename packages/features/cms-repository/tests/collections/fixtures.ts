import { DEFAULT_COLLECTION_LIMITS } from "../../src/collections/core/limits";
import { parseBlocs } from "../../src/collections/core/parsing/blocs/parseBlocs";
import { validateBlocs } from "../../src/collections/core/parsing/blocs/validateBlocs";

export function collectionDocument(): Record<string, unknown> {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "atlas",
        publisherId: "atlas.official",
        version: "1.0.0",
        name: "Atlas UI",
        locale: "en-US",
        assets: [],
        blocs: [component(), composition()],
    };
}

export function component(): Record<string, unknown> {
    return {
        kind: "component",
        id: "atlas-panel",
        label: "Panel",
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
        label: "Page",
        lightdom: '<atlas-panel><slot name="main" slot="body"><p>Welcome</p></slot></atlas-panel>',
        defaultContent: '<p slot="main">Start here.</p>',
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
