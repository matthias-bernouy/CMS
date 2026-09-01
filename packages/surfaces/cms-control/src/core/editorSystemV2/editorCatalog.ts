import { CMS_BINDING_CORE_TAG, type EditorCatalog } from "@bernouy/cms-content/editor";
import { BindingCore } from "@bernouy/components";
import { BindingCoreEditor, SvgEditor } from "cms-control/core/editorSystemV2/builtInEditors";

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
            tag: "svg",
            label: "SVG",
            description: "Inline SVG selected from the CMS media library.",
            icon: "image",
            category: "Runtime",
            bloc: HTMLElement,
            editor: SvgEditor,
        },
    ];
}
