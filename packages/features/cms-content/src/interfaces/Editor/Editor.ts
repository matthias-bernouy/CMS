import type { ContentSlot } from "./ContentSlots";
import type { DataScope } from "./DataScopes";
import type { Setting } from "./SettingInputs";

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
