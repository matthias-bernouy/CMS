import {
    type ContentSlot,
    type DataScope,
    type EditorCatalogEntry,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import {
    CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT,
    CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT,
    CMS_EDITOR_SETTINGS_CHANGE_EVENT,
} from "../events";
import type { RuntimeManagedEditor } from "./types";

export function createRuntimeEditor(
    entry: EditorCatalogEntry,
    target: HTMLElement,
    registry: EditorRegistry,
): RuntimeManagedEditor {
    const EditorClass = entry.editor;

    class CatalogRuntimeEditor extends EditorClass {

        readonly catalogEntry = entry;

        private readonly _addedSettings: SettingSection[] = [];
        private readonly _declaredDataScopes: DataScope[] = [];
        private readonly _addedContentSlots: ContentSlot[] = [];
        private _isMounted = false;

        constructor() {
            super(target);
            registry.register(this);
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
            this._emit(CMS_EDITOR_SETTINGS_CHANGE_EVENT, {
                editor: this,
                settings: this.getSettings(),
            });
        }

        override getDataScopes(): DataScope[] {
            return [
                ...super.getDataScopes(),
                ...this._declaredDataScopes,
            ];
        }

        override declareDataScope(scope: DataScope | DataScope[]): void {
            const list = Array.isArray(scope) ? scope : [scope];
            this._declaredDataScopes.push(...list);
            this._emit(CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT, {
                editor: this,
                dataScopes: this.getDataScopes(),
            });
        }

        override getContentSlots(): ContentSlot[] {
            return [
                ...super.getContentSlots(),
                ...this._addedContentSlots,
            ];
        }

        override addContentSlots(slots: ContentSlot | ContentSlot[]): void {
            const list = Array.isArray(slots) ? slots : [slots];
            this._addedContentSlots.push(...list);
            this._emit(CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT, {
                editor: this,
                contentSlots: this.getContentSlots(),
            });
        }

        override getChildren() {
            return registry.getDirectChildren(this.target);
        }

        dispose(): void {
            this.unmount();
            registry.unregister(this);
        }

        private _emit<T>(eventName: string, detail: T): void {
            const CustomEventConstructor = this.target.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;

            this.target.dispatchEvent(new CustomEventConstructor(
                eventName,
                {
                    bubbles: true,
                    composed: true,
                    detail,
                },
            ));
        }

    }

    return new CatalogRuntimeEditor();
}
