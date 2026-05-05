import type { StateSync } from '../../../components/editor/componentSync/sync/StateSync';
import getClosestEditorSystem from '../../dom/editor/getClosestEditorSystem';
import { PinMode } from './PinMode';
import { PanelConfig } from './panel';
import { HoverBinding } from './hoverBinding';
import { ModeBinding } from './modeBinding';
import { acquireBodyStyle, releaseBodyStyle } from './bodyStyle';
import {
    defaultActionBarFeatures,
    syncActionBarFeaturesFromAttrs,
    type ActionBarFeatures,
} from './actionBarFeatures';
import type { CustomAction } from './types';

export type { CustomAction } from './types';

export abstract class Editor {

    public target: HTMLElement;
    public variant: string = 'default';
    public customActions: CustomAction[] = [];
    public stateSyncs: StateSync[] = [];

    private _identifier: string;
    private _styleElement: HTMLStyleElement;
    private _holdsBodyStyle: boolean = false;

    private _panel: PanelConfig;
    private _hover: HoverBinding;
    private _mode: ModeBinding;
    private _pinMode: PinMode;

    protected _actionBarFeatures: ActionBarFeatures = defaultActionBarFeatures();

    constructor(target: HTMLElement, styles: string, editor?: string) {
        this.target = target;

        this._styleElement = document.createElement('style');
        this._styleElement.innerHTML = styles;

        this._identifier = crypto.randomUUID();
        this.target.setAttribute(p9r.attr.EDITOR.IDENTIFIER, this._identifier);

        if (!document.compIdentifierToEditor) document.compIdentifierToEditor = new Map();
        document.compIdentifierToEditor.set(this._identifier, this);

        this._panel = new PanelConfig(this, editor);
        this._hover = new HoverBinding(this);
        this._pinMode = new PinMode(this.target, this.stateSyncs, () => {
            this.stateSyncs.forEach(s => s.unpin());
            this.notifyPinStateChanged();
        });

        this._mode = new ModeBinding(this.target, {
            onEditorMode: () => this.viewEditor(),
            onViewMode: () => this.viewClient(),
            afterSwitch: (mode) => this.onSwitchMode(mode),
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.target.removeAttribute(p9r.attr.EDITOR.IS_CREATING);
            });
        });

        getClosestEditorSystem(this.target).blocActions.close();
    }

    // ── Mode lifecycle ──────────────────────────────────────────────

    public viewEditor() {
        this._panel.propagateIdentifier(this._identifier);
        this._panel.notifySyncs();
        this.init();

        if (!this.target.shadowRoot) {
            this._acquireBodyStyle();
        } else {
            this.target.shadowRoot.append(this._styleElement);
        }

        this.target.setAttribute(p9r.attr.ACTION.DISABLE_SAVE_AS_TEMPLATE, 'true');
        this.target.setAttribute(p9r.attr.EDITOR.IDENTIFIER, this._identifier);
        this.target.classList.add('editor-block');
        this.target.setAttribute(p9r.attr.EDITOR.IS_EDITOR, 'true');

        if (this.target.hasAttribute(p9r.attr.ACTION.DISABLE_DRAGGING)) {
            this.target.setAttribute('draggable', 'false');
        } else {
            this.target.draggable = true;
        }

        this.target.style.setProperty('pointer-events', 'auto', 'important');

        this.refreshActionBarFeatures();

        this._hover.unbind();
        if (this._hasInteractiveFeatures()) this._hover.bind();
    }

    public viewClient() {
        this.stateSyncs.forEach(s => s.unpin());
        this._pinMode.exit();
        this.restore();

        this._hover.unbind();

        this.target.style.removeProperty('pointer-events');
        if (this.target.getAttribute('style') === '') {
            this.target.removeAttribute('style');
        }

        this._releaseBodyStyle();
        if (this.target.shadowRoot) this._styleElement.remove();

        this.target.removeAttribute(p9r.attr.EDITOR.IS_EDITOR);
        this.target.classList.remove('editor-block');
        this.target.removeAttribute('draggable');
        if (this.target.getAttribute('class') === '') {
            this.target.removeAttribute('class');
        }

        this.target.removeAttribute(p9r.attr.ACTION.DISABLE_DELETE);
        this.target.removeAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE);
        this.target.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE);
        this.target.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER);
        this.target.removeAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT);
        this.target.removeAttribute(p9r.attr.ACTION.DISABLE_SAVE_AS_TEMPLATE);
        this.target.removeAttribute(p9r.attr.ACTION.INLINE_ADDING);
        this.target.removeAttribute(p9r.attr.ACTION.ALLOW_RESIZE_IMAGE);
        this.target.removeAttribute(p9r.attr.ACTION.DISABLE_DRAGGING);
        this.target.removeAttribute(p9r.attr.TEXT.BLOC_MANAGEMENT);
        this.target.removeAttribute(p9r.attr.EDITOR.IDENTIFIER);
        this.target.removeAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    }

    /**
     * Subclass hook fired after every mode swap (viewEditor/viewClient has
     * already run). Override to add mode-dependent side effects, e.g.
     * (de)activating a MutationObserver.
     */
    public onSwitchMode(_mode: string): void {
        // hook
    }

    public dispose() {
        document.compIdentifierToEditor?.delete(this._identifier);
        this._hover.unbind();
        this._mode.dispose();
        this._pinMode.exit();
        this._panel.dispose();
        this._releaseBodyStyle();
        this._styleElement.remove();
    }

    // ── Pin / hover / state sync ────────────────────────────────────

    public registerStateSync(sync: StateSync) {
        if (!this.stateSyncs.includes(sync)) this.stateSyncs.push(sync);
    }

    public unregisterStateSync(sync: StateSync) {
        const i = this.stateSyncs.indexOf(sync);
        if (i >= 0) this.stateSyncs.splice(i, 1);
    }

    public onEditorPinState?(pinned: boolean, stateSync?: StateSync): void;

    public getActionBarAnchor(): HTMLElement | null {
        return null;
    }

    public notifyPinStateChanged(stateSync?: StateSync) {
        const anyPinned = this.stateSyncs.some(s => s.isPinned);
        if (anyPinned) {
            this._hover.unbind();
            getClosestEditorSystem(this.target).blocActions.close();
            this._pinMode.enter();
        } else {
            this._pinMode.exit();
            if (this._hasInteractiveFeatures()) this._hover.bind();
        }
        this.onEditorPinState?.(anyPinned, stateSync);
    }

    // ── Action-bar features ─────────────────────────────────────────

    public refreshActionBarFeatures() {
        syncActionBarFeaturesFromAttrs(this.target, this._actionBarFeatures);
    }

    get actionBarConfiguration(): ActionBarFeatures {
        return this._actionBarFeatures;
    }

    protected addCustomAction(action: CustomAction) {
        this.customActions.push(action);
    }

    private _hasInteractiveFeatures(): boolean {
        return this._actionBarFeatures.values().some(v => v === true)
            || this.stateSyncs.length > 0
            || this.customActions.length > 0;
    }

    // ── Configuration panel ─────────────────────────────────────────

    public get hasConfigPanel(): boolean {
        return this._panel.hasPanel;
    }

    public queryPanelChildren<T extends Element = Element>(selector: string): T[] {
        return this._panel.queryChildren<T>(selector);
    }

    public showConfigPanel() {
        this._panel.show();
    }

    /** Internal: kept for subclasses that needed direct access historically. */
    public get _panelConfig() {
        return this._panel.configPanel;
    }

    onChildrenRemoved(removedNode?: HTMLElement) {
        this._panel.notifySyncs({ removed: removedNode });
    }

    onChildrenAdded(addedNode?: HTMLElement) {
        this._panel.notifySyncs({ added: addedNode });
    }

    // ── Identifiers ─────────────────────────────────────────────────

    /** Stable per-instance UUID assigned at construction. */
    get identifier(): string {
        return this._identifier;
    }

    get ensurePersistentIdentifier(): string {
        if (!this.target.hasAttribute(p9r.attr.EDITOR.PERSISTENT_IDENTIFIER)) {
            const generatedId = 'ID-' + crypto.randomUUID();
            this.target.setAttribute(p9r.attr.EDITOR.PERSISTENT_IDENTIFIER, generatedId);
        }
        return this.target.getAttribute(p9r.attr.EDITOR.PERSISTENT_IDENTIFIER)!;
    }

    get persistentIdentifierAttrName(): string {
        return p9r.attr.EDITOR.PERSISTENT_IDENTIFIER;
    }

    // ── Body-style ref counting (for shadowless editors) ────────────

    private _acquireBodyStyle() {
        if (this._holdsBodyStyle) return;
        acquireBodyStyle(this.target.tagName, this._styleElement);
        this._holdsBodyStyle = true;
    }

    private _releaseBodyStyle() {
        if (!this._holdsBodyStyle) return;
        this._holdsBodyStyle = false;
        releaseBodyStyle(this.target.tagName);
    }

    // ── Subclass contract ───────────────────────────────────────────

    abstract init(): void;
    abstract restore(): void;
}
