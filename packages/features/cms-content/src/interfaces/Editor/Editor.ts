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

    getSettings(): SettingSection[] {
        return this.settings();
    }

    addSettings(_settings: SettingSection | SettingSection[]): void {
        // Runtime may override.
    }

    getChildren(): Editor[] {
        // Runtime may override.
        return [];
    }

}
