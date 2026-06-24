/**
 * Editor authoring entry.
 *
 * Bloc bundles are normally rewritten by `p9rExternalsPlugin` to read this API
 * from `window.p9rEditor`.
 */
import { Editor, type EditorCatalogRegistration } from "@bernouy/cms-content/editor";

export { Editor };
export type {
    ContentSlot,
    ContentSlotAccept,
    DataExpression,
    DataField,
    DataFieldType,
    DataScope,
    EditableState,
    EditableStateSession,
    EndpointPickerMethod,
    EndpointPickerSetting,
    EditorCatalog,
    EditorCatalogEntry,
    EditorCatalogRegistration,
    EditorCatalogRegistrationDefaults,
    EditorCatalogRuntime,
    EditorConstructor,
    EditorDocument,
    EditorStructureMode,
    MediaAccept,
    PageLinkSetting,
    SegmentedSetting,
    SelectSetting,
    Setting,
    SettingMetadata,
    SettingOption,
    SettingSection,
    SettingType,
    TextareaSetting,
    TextCapability,
    TextSetting,
    ToggleSetting,
} from "@bernouy/cms-content/editor";

export function registerEditor(entry: EditorCatalogRegistration): void {
    (globalThis as { window?: Window & { p9rEditor?: { registerEditor(entry: EditorCatalogRegistration): void } } })
        .window
        ?.p9rEditor
        ?.registerEditor(entry);
}

export function registerEditor_opaque(entry: EditorCatalogRegistration = {}): void {
    class OpaqueEditor extends Editor {
        override getStructureMode(): "opaque" {
            return "opaque";
        }
    }

    registerEditor({
        ...entry,
        editor: entry.editor ?? OpaqueEditor,
    });
}
