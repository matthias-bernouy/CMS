import { describe, expect, test } from "bun:test";
import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { BindingCoreEditor, SvgEditor } from "cms-control/core/editorSystemV2/builtInEditors";
import { createControlEditorCatalog } from "cms-control/core/editorSystemV2/editorCatalog";

describe("editor built-in editors", () => {
    test("control catalog only exposes runtime-owned editor entries", () => {
        const catalog = createControlEditorCatalog();

        expect(catalog.map((entry) => entry.tag)).toEqual([CMS_BINDING_CORE_TAG, "svg"]);
        expect(catalog[0]?.editor).toBe(BindingCoreEditor);
        expect(catalog[1]?.editor).toBe(SvgEditor);
        expect(catalog.every((entry) => entry.category === "Runtime")).toBeTrue();
    });
});
