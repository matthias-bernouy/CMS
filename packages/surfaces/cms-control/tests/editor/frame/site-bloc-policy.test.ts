import { describe, expect, test } from "bun:test";
import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { Editor, type EditorCatalogEntry } from "@bernouy/cms-content/editor";
import { applyBlocCatalogueInsertionState } from "cms-control/components/editorSystemV2/catalog";
import {
    createSiteBlocCatalogs,
    isTagInsertable,
} from "cms-control/components/editorSystemV2/siteBloc/siteBlocCatalog";
import type { BlocCatalogueItem } from "cms-control/components/editorSystemV2/siteBloc/siteBlocApi";

class TestEditor extends Editor {}

function entry(tag: string): EditorCatalogEntry {
    return { tag, label: tag, bloc: HTMLElement, editor: TestEditor };
}

function item(tag: string, overrides: Partial<BlocCatalogueItem> = {}): BlocCatalogueItem {
    return {
        tag,
        name: tag,
        group: "Test",
        description: "",
        state: "published",
        origin: { kind: "integration" },
        publishedRevision: null,
        directDependencies: [],
        transitiveDependencies: [],
        publishedTransitiveDependencies: [],
        ...overrides,
    };
}

function definition(): SiteBlocDefinition {
    const now = new Date("2026-07-27T10:00:00.000Z");
    return {
        schema: "cms.site-bloc.v1",
        id: "definition-card",
        tag: "site-card",
        ownership: { kind: "site-builder", definitionId: "definition-card" },
        lifecycle: "active",
        draftRevision: 2,
        publishedRevision: 1,
        draft: {
            name: "Site card",
            group: "Site",
            description: "",
            structure: [],
            slots: [
                {
                    id: "actions-slot",
                    label: "Actions",
                    slot: "actions",
                    max: 1,
                    accepts: [{ kind: "component", tag: "basic-button" }],
                },
            ],
            defaultContent: "",
            dependencies: [],
        },
        published: null,
        createdAt: now,
        updatedAt: now,
    };
}

describe("site bloc editor catalog policy", () => {
    test("keeps archived runtime editors but marks them non-insertable", () => {
        const catalog = applyBlocCatalogueInsertionState(
            [entry("basic-card"), entry("legacy-card")],
            [
                { tag: "basic-card", state: "published" },
                { tag: "legacy-card", state: "archived" },
            ],
        );

        expect(catalog.map((candidate) => candidate.tag)).toEqual(["basic-card", "legacy-card"]);
        expect(catalog.find((candidate) => candidate.tag === "legacy-card")?.insertable).toBe(false);
    });

    test("filters structure cycles and unpublished blocs while exposing the slot placeholder", () => {
        const base: Array<EditorCatalogEntry & { insertable?: boolean }> = [
            "site-card",
            "basic-button",
            "draft-only",
            "archived-card",
            "cycle-card",
            "h1",
            "header",
        ].map(entry);
        base.at(-1)!.insertable = false;
        base[1]!.defaultContent = "<basic-button>Default page content</basic-button>";
        const catalogs = createSiteBlocCatalogs(
            base,
            [
                item("basic-button"),
                item("draft-only", { origin: { kind: "site-builder" }, state: "draft", publishedRevision: null }),
                item("archived-card", { state: "archived" }),
                item("cycle-card", { publishedTransitiveDependencies: ["site-card"] }),
                item("site-card", { origin: { kind: "site-builder" }, publishedRevision: 1 }),
            ],
            definition(),
        );

        expect(catalogs.structure.map((candidate) => candidate.tag)).toEqual([
            "basic-button",
            "h1",
            "header",
            "cms-site-slot-placeholder",
        ]);
        expect(catalogs.structure[0]?.defaultContent).toBeUndefined();
        expect(catalogs.structureTags.has("h1")).toBe(false);
        expect(isTagInsertable(catalogs.structureTags, "h1", base.at(-2)!)).toBe(true);
        expect(isTagInsertable(catalogs.structureTags, "header", base.at(-1)!)).toBe(false);
    });
});
