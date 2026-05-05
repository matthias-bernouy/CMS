import type { SyncPanel } from '../../../components/editor/componentSync/SyncPanel';
import getClosestEditorSystem from '../../dom/editor/getClosestEditorSystem';
import type { Editor } from './Editor';

const SYNC_SELECTORS = 'p9r-comp-sync, p9r-image-sync, p9r-attr-sync, p9r-state-sync';

export class PanelConfig {

    private _config: SyncPanel | null = null;
    private _fragment: DocumentFragment | null = null;
    private _syncs: HTMLElement[] = [];

    constructor(private editor: Editor, html?: string) {
        if (html) this._initFromHTML(html);
    }

    get hasPanel(): boolean {
        return this._config != null || this._fragment != null;
    }

    /** Internal accessor for the live <p9r-config-panel> element (null until built). */
    get configPanel(): SyncPanel | null {
        return this._config;
    }

    queryChildren<T extends Element = Element>(selector: string): T[] {
        if (this._config) return Array.from(this._config.querySelectorAll(selector)) as T[];
        if (this._fragment) return Array.from(this._fragment.querySelectorAll(selector)) as T[];
        return [];
    }

    propagateIdentifier(identifier: string): void {
        if (!this._config) return;
        this._config.querySelectorAll('*').forEach(el =>
            el.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, identifier),
        );
    }

    notifySyncs(opts?: { added?: HTMLElement; removed?: HTMLElement }): void {
        if (this._config) {
            this._config.init(opts);
            return;
        }
        for (const sync of this._syncs) (sync as any).init?.(opts);
    }

    show(): void {
        this._ensureBuilt();
        this._config?.show();
    }

    dispose(): void {
        this._config?.remove();
        this._config = null;
        this._fragment = null;
        this._syncs = [];
    }

    private _ensureBuilt(): void {
        if (this._config || !this._fragment) return;
        this._config = document.createElement('p9r-config-panel') as SyncPanel;
        this._config.appendChild(this._fragment);
        this._fragment = null;
        getClosestEditorSystem(this.editor.target).editorDOM.append(this._config);
    }

    private _initFromHTML(html: string): void {
        this._fragment = document.createRange().createContextualFragment(html);
        try { customElements.upgrade(this._fragment); } catch { /* unsupported */ }
        const id = this.editor.identifier;
        this._fragment.querySelectorAll('*').forEach(el =>
            el.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, id),
        );
        this._syncs = Array.from(this._fragment.querySelectorAll(SYNC_SELECTORS)) as HTMLElement[];
        for (const sync of this._syncs) {
            (sync as any).prepare?.(this.editor.target, this.editor);
        }
    }
}
