import {
    type ContentSlot,
    type DataScope,
    type EditableState,
    type Editor,
    type EditorConstructor,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";
import { isCompositionRuntimeElement } from "@bernouy/components/base";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import {
    CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT,
    CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT,
    CMS_EDITOR_SETTINGS_CHANGE_EVENT,
    CMS_EDITOR_STATES_CHANGE_EVENT,
    CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT,
} from "../events";

export type RuntimeEditorLifecycle = Editor & {
    mount(): void;
    unmount(): void;
    dispose(): void;
};

type RuntimeEditorConstructor = new (target: HTMLElement, registry: EditorRegistry) => RuntimeEditorLifecycle;

export function createRuntimeEditorClass(EditorClass: EditorConstructor): RuntimeEditorConstructor {
    class RuntimeEditorClass extends EditorClass {
        private readonly _addedSettings: SettingSection[] = [];
        private readonly _declaredDataScopes: DataScope[] = [];
        private readonly _addedContentSlots: ContentSlot[] = [];
        private readonly _addedStates: EditableState[] = [];
        private _textCapabilityOverride: TextCapability | null | undefined;
        private _isMounted = false;

        constructor(
            target: HTMLElement,
            private readonly _registry: EditorRegistry,
        ) {
            super(target);
        }

        mount(): void {
            if (this._isMounted) {
                return;
            }
            this._isMounted = true;
            this.mountEditor();
        }

        unmount(): void {
            if (!this._isMounted) {
                return;
            }
            this._isMounted = false;
            this.unmountEditor();
        }

        override getSettings(): SettingSection[] {
            return [...super.getSettings(), ...this._addedSettings];
        }

        override addSettings(settings: SettingSection | SettingSection[]): void {
            this._addedSettings.push(...toList(settings));
            this._emit(CMS_EDITOR_SETTINGS_CHANGE_EVENT, {
                editor: this,
                settings: this.getSettings(),
            });
        }

        override getDataScopes(): DataScope[] {
            return [...super.getDataScopes(), ...this._declaredDataScopes];
        }

        override declareDataScope(scope: DataScope | DataScope[]): void {
            this._declaredDataScopes.push(...toList(scope));
            this._emit(CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT, {
                editor: this,
                dataScopes: this.getDataScopes(),
            });
        }

        override getContentSlots(): ContentSlot[] {
            return [...super.getContentSlots(), ...this._addedContentSlots];
        }

        override addContentSlots(slots: ContentSlot | ContentSlot[]): void {
            this._addedContentSlots.push(...toList(slots));
            this._emit(CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT, {
                editor: this,
                contentSlots: this.getContentSlots(),
            });
        }

        override getTextCapability(): TextCapability | null {
            if (isCompositionRuntimeElement(this.target)) {
                return null;
            }
            return this._textCapabilityOverride !== undefined
                ? this._textCapabilityOverride
                : super.getTextCapability();
        }

        override setTextCapability(capability: TextCapability | null): void {
            if (isCompositionRuntimeElement(this.target)) {
                return;
            }
            this._textCapabilityOverride = capability;
            this._emit(CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT, {
                editor: this,
                textCapability: this.getTextCapability(),
            });
        }

        override getStates(): EditableState[] {
            return [...super.getStates(), ...this._addedStates];
        }

        override addStates(states: EditableState | EditableState[]): void {
            this._addedStates.push(...toList(states));
            this._emit(CMS_EDITOR_STATES_CHANGE_EVENT, {
                editor: this,
                states: this.getStates(),
            });
        }

        override getChildren(): Editor[] {
            return this._registry.getDirectChildren(this.target);
        }

        dispose(): void {
            this.unmount();
            this._registry.unregister(this);
        }

        private _emit<T>(eventName: string, detail: T): void {
            const CustomEventConstructor = this.target.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
            this.target.dispatchEvent(
                new CustomEventConstructor(eventName, {
                    bubbles: true,
                    composed: true,
                    detail,
                }),
            );
        }
    }

    return RuntimeEditorClass;
}

function toList<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value];
}
