import { CMS_BINDING_CORE_TAG, type EditorCatalog } from "@bernouy/cms-content/editor";
import { createNativeEditorCatalog } from "@bernouy/cms-editor-system-v2";
import { BindingCore } from "@bernouy/components";
import { BindingCoreEditor } from "cms-control/core/editorSystemV2/builtInEditors";

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
        ...createNativeEditorCatalog(),
    ];
}
