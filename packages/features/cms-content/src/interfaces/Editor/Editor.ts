import type { ContentSlot } from "./ContentSlots";
import type { DataScope } from "./DataScopes";
import type { EditableState } from "./EditableState";
import type { Setting } from "./SettingInputs";
import type { TextCapability } from "./TextCapability";

export type SettingSection = {
    kind: "self" | "surcharge";
    label: string;
    settings: Setting[];
};

export class Editor {

    constructor(public readonly target: HTMLElement) { }

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

    mountEditor(): void {
        // Editor may override.
    }

    unmountEditor(): void {
        // Editor may override.
    }

}
