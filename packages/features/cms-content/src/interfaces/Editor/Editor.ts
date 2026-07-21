import type { ContentSlot } from "./document/ContentSlots";
import type { DataScope } from "./document/DataScopes";
import type { EditableState } from "./document/EditableState";
import type { Setting } from "./SettingInputs";
import type { EditorStructureMode } from "./document/StructureMode";
import type { TextCapability } from "./document/TextCapability";

export type SettingSection = {
    kind: "self" | "surcharge";
    label: string;
    settings: Setting[];
};

export class Editor {
    constructor(public readonly target: HTMLElement) {}

    protected settings(): SettingSection[] {
        return [];
    }

    protected dataScopes(): DataScope[] {
        return [];
    }

    protected contentSlots(): ContentSlot[] {
        return [];
    }

    protected textCapability(): TextCapability | null {
        return null;
    }

    protected states(): EditableState[] {
        return [];
    }

    protected structureMode(): EditorStructureMode {
        return "editable";
    }

    getSettings(): SettingSection[] {
        return this.settings();
    }

    addSettings(_settings: SettingSection | SettingSection[]): void {
        // Runtime may override.
    }

    getDataScopes(): DataScope[] {
        return this.dataScopes();
    }

    declareDataScope(_scope: DataScope | DataScope[]): void {
        // Runtime may override.
    }

    getContentSlots(): ContentSlot[] {
        return this.contentSlots();
    }

    addContentSlots(_slots: ContentSlot | ContentSlot[]): void {
        // Runtime may override.
    }

    getTextCapability(): TextCapability | null {
        return this.textCapability();
    }

    setTextCapability(_capability: TextCapability | null): void {
        // Runtime may override.
    }

    getStates(): EditableState[] {
        return this.states();
    }

    addStates(_states: EditableState | EditableState[]): void {
        // Runtime may override.
    }

    getChildren(): Editor[] {
        // Runtime may override.
        return [];
    }

    getStructureMode(): EditorStructureMode {
        return this.structureMode();
    }

    mountEditor(): void {
        // Editor may override.
    }

    unmountEditor(): void {
        // Editor may override.
    }
}
