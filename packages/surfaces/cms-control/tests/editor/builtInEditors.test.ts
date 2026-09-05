import { describe, expect, test } from "bun:test";
import { CMS_BINDING_CORE_TAG, Editor } from "@bernouy/cms-content/editor";
import { PLATFORM_NATIVE_CATALOG_TAGS } from "@bernouy/cms-editor-system-v2";
import { installEditorCatalogRuntime } from "cms-control/components/editorSystemV2/catalog";
import { BindingCoreEditor } from "cms-control/core/editorSystemV2/builtInEditors";
import { createControlEditorCatalog } from "cms-control/core/editorSystemV2/editorCatalog";

describe("editor built-in editors", () => {
    test("combines the binding runtime with the platform-owned native editors", () => {
        const catalog = createControlEditorCatalog();
        const nativeTags = catalog.filter((entry) => entry.tag !== CMS_BINDING_CORE_TAG).map((entry) => entry.tag);

        expect([...nativeTags].sort()).toEqual([...PLATFORM_NATIVE_CATALOG_TAGS].sort());
        expect(new Set(nativeTags).size).toBe(nativeTags.length);
        expect(catalog[0]?.editor).toBe(BindingCoreEditor);
        expect(catalog.find((entry) => entry.tag === "header")?.category).toBe("Runtime");
        expect(catalog.find((entry) => entry.tag === "h1")?.category).toBe("Content");
    });

    test("does not let downloaded integration editors register native HTML tags", () => {
        class IntegrationEditor extends Editor {}
        const runtime = installEditorCatalogRuntime();
        const previousError = console.error;
        console.error = () => undefined;
        try {
            runtime.registerEditor({ tag: "p", label: "Forged paragraph", editor: IntegrationEditor });
            runtime.registerEditor({ tag: "mossa-card", label: "Card", editor: IntegrationEditor });
        } finally {
            console.error = previousError;
        }

        expect(runtime.getCatalog().map((entry) => entry.tag)).toEqual(["mossa-card"]);
    });
});
