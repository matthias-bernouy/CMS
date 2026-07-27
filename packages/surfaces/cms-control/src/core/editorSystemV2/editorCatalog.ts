import { CMS_BINDING_CORE_TAG, type EditorCatalog } from "@bernouy/cms-content/editor";
import { BindingCore } from "@bernouy/components";
import { CMS_SIGNUP_LEGAL_CONSENT_TAG, CmsSignupLegalConsent } from "@bernouy/cms-auth/components";
import { BindingCoreEditor, SignupLegalConsentEditor } from "cms-control/core/editorSystemV2/builtInEditors";

export function createControlEditorCatalog(): EditorCatalog {
    return [
        {
            tag: CMS_BINDING_CORE_TAG,
            label: "Binding core",
            description: "Provides global data scopes to editable content.",
            icon: "database",
            category: "Runtime",
            bloc: BindingCore,
            editor: BindingCoreEditor,
        },
        {
            tag: CMS_SIGNUP_LEGAL_CONSENT_TAG,
            label: "Signup legal consent",
            description: "Requires explicit acceptance of the current signup legal documents.",
            icon: "check-square",
            category: "Authentication",
            bloc: CmsSignupLegalConsent,
            editor: SignupLegalConsentEditor,
        },
    ];
}
