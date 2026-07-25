import { describe, expect, test } from "bun:test";
import { CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { CMS_SIGNUP_LEGAL_CONSENT_TAG } from "@bernouy/cms-auth/components";
import { BindingCoreEditor, SignupLegalConsentEditor } from "cms-control/core/editorSystemV2/builtInEditors";
import { createControlEditorCatalog } from "cms-control/core/editorSystemV2/editorCatalog";

describe("editor built-in editors", () => {
    test("control catalog only exposes runtime-owned editor entries", () => {
        const catalog = createControlEditorCatalog();

        expect(catalog.map((entry) => entry.tag)).toEqual([CMS_BINDING_CORE_TAG, CMS_SIGNUP_LEGAL_CONSENT_TAG]);
        expect(catalog[0]?.editor).toBe(BindingCoreEditor);
        expect(catalog[0]?.category).toBe("Runtime");
        expect(catalog[1]?.editor).toBe(SignupLegalConsentEditor);
        expect(catalog[1]?.category).toBe("Authentication");
        expect(
            new SignupLegalConsentEditor(document.createElement(CMS_SIGNUP_LEGAL_CONSENT_TAG)).getStructureMode(),
        ).toBe("opaque");
    });
});
