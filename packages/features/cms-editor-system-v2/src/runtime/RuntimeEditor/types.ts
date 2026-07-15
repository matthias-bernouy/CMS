import type {
    ContentSlot,
    DataScope,
    EditableState,
    SettingSection,
    TextCapability,
} from "@bernouy/cms-content/editor";
import type { RuntimeEditor } from "./RuntimeEditor";

export type RuntimeEditorSettingsChangeDetail = {
    editor: RuntimeEditor;
    settings: SettingSection[];
};

export type RuntimeEditorDataScopesChangeDetail = {
    editor: RuntimeEditor;
    dataScopes: DataScope[];
};

export type RuntimeEditorContentSlotsChangeDetail = {
    editor: RuntimeEditor;
    contentSlots: ContentSlot[];
};

export type RuntimeEditorTextCapabilityChangeDetail = {
    editor: RuntimeEditor;
    textCapability: TextCapability | null;
};

export type RuntimeEditorStatesChangeDetail = {
    editor: RuntimeEditor;
    states: EditableState[];
};
