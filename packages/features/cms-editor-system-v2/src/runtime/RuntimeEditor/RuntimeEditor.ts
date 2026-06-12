import {
    Editor,
    type ContentSlot,
    type DataScope,
    type SettingSection,
    type TextCapability,
} from "@bernouy/cms-content/editor";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import {
    CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT,
    CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT,
    CMS_EDITOR_SETTINGS_CHANGE_EVENT,
    CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT,
} from "../events";

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

export class RuntimeEditor extends Editor {

    private readonly _addedSettings: SettingSection[] = [];
    private readonly _declaredDataScopes: DataScope[] = [];
    private readonly _addedContentSlots: ContentSlot[] = [];
    private _textCapabilityOverride: TextCapability | null | undefined;
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

    override getDataScopes(): DataScope[] {
        return [
            ...super.getDataScopes(),
            ...this._declaredDataScopes,
        ];
    }

    override declareDataScope(scope: DataScope | DataScope[]): void {
        const list = Array.isArray(scope) ? scope : [scope];
        this._declaredDataScopes.push(...list);
        this._emitDataScopesChange();
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
        this._emitContentSlotsChange();
    }

    override getTextCapability(): TextCapability | null {
        return this._textCapabilityOverride !== undefined
            ? this._textCapabilityOverride
            : super.getTextCapability();
    }

    override setTextCapability(capability: TextCapability | null): void {
        this._textCapabilityOverride = capability;
        this._emitTextCapabilityChange();
    }

    override getChildren(): Editor[] {
        return this._registry.getDirectChildren(this.target);
    }

    dispose(): void {
        this.unmount();
        this._registry.unregister(this);
    }

    private _emitSettingsChange(): void {
        this._emit(CMS_EDITOR_SETTINGS_CHANGE_EVENT, {
            editor: this,
            settings: this.getSettings(),
        });
    }

    private _emitDataScopesChange(): void {
        this._emit(CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT, {
            editor: this,
            dataScopes: this.getDataScopes(),
        });
    }

    private _emitContentSlotsChange(): void {
        this._emit(CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT, {
            editor: this,
            contentSlots: this.getContentSlots(),
        });
    }

    private _emitTextCapabilityChange(): void {
        this._emit(CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT, {
            editor: this,
            textCapability: this.getTextCapability(),
        });
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
