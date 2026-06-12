import {
    Editor,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import { CMS_EDITOR_SETTINGS_CHANGE_EVENT } from "../events";

export type RuntimeEditorSettingsChangeDetail = {
    editor: RuntimeEditor;
    settings: SettingSection[];
};

export class RuntimeEditor extends Editor {

    private readonly _addedSettings: SettingSection[] = [];
    private _isMounted = false;

    constructor(
        target: HTMLElement,
        private readonly _registry: EditorRegistry,
    ) {
        super(target);
        this._registry.register(this);
    }

    mount(): void {
        if (this._isMounted) return;
        this._isMounted = true;
        this.mountEditor();
    }

    unmount(): void {
        if (!this._isMounted) return;
        this._isMounted = false;
        this.unmountEditor();
    }

    override getSettings(): SettingSection[] {
        return [
            ...super.getSettings(),
            ...this._addedSettings,
        ];
    }

    override addSettings(settings: SettingSection | SettingSection[]): void {
        const list = Array.isArray(settings) ? settings : [settings];
        this._addedSettings.push(...list);
        this._emitSettingsChange();
    }

    override getChildren(): Editor[] {
        return this._registry.getDirectChildren(this.target);
    }

    dispose(): void {
        this.unmount();
        this._registry.unregister(this);
    }

    private _emitSettingsChange(): void {
        const CustomEventConstructor = this.target.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;

        this.target.dispatchEvent(new CustomEventConstructor(
            CMS_EDITOR_SETTINGS_CHANGE_EVENT,
            {
                bubbles: true,
                composed: true,
                detail: {
                    editor: this,
                    settings: this.getSettings(),
                },
            },
        ));
    }

}
