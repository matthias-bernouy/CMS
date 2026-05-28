import html from "./template.html" with { type: "text" }
import css from "./EditorRoot.style.css" with { type: "text" }
import { isToggable } from "src/control/core/isToggable";
import { setEditorContext, clearEditorContext } from "src/control/core/editorSystem/editorContext";
import { installNavigationGuard, rawReplaceState } from "src/control/core/editorSystem/navigationGuard";
import { installLinkInterceptor } from "src/control/core/editorSystem/installLinkInterceptor";
import { watchForDirty, isDirty } from "src/control/core/editorSystem/dirtyState";
import { resolveTargetForLink } from "./linkNavigation";
import { stripResidualChrome } from "./stripResidualChrome";
import { getMetaBasePath } from "src/control/core/dom/meta/getMetaBasePath";
import type { EDITOR_SYSTEM_MODE } from "types/w13c/EditorSystem";
import { ObserverManager } from "src/control/components/editor/EditorSystem/ObserverManager";
import { DragManager } from "src/control/components/editor/EditorSystem/DragManager";
import { BlocActions } from "../BlocActions/BlocActions";
import type { BlocLibrary } from "../BlocLibrary/BlocLibrary";
import { waitForScripts } from "./waitForScripts";
import type { TemplatePicker } from "./TemplatePicker/TemplatePicker";


export default class EditorRoot extends HTMLElement {

    private _mode: EDITOR_SYSTEM_MODE = "editor";

    private _observer: ObserverManager | null = null;
    private _dragmanager: DragManager | null = null;
    private _blocActions: BlocActions | null = null;
    private _blocLibrary: BlocLibrary | null = null;
    private _navGuardOff:    (() => void) | null = null;
    private _dirtyWatchOff:  (() => void) | null = null;
    private _linkIntercptOff: (() => void) | null = null;

    constructor(){
        super();
        this.attachShadow({ mode: "open"} );
        const style = document.createElement("style");
        style.textContent = css as unknown as string;
        this.shadowRoot?.append(style);
        const template = document.createElement("template");
        template.innerHTML = html as unknown as string;
        this.shadowRoot?.append(template.content.cloneNode(true));
    }

    connectedCallback(){

        requestAnimationFrame(() => {
            const workingElement = this.shadowRoot?.querySelector("#workingElement") as HTMLElement;
            workingElement.style.visibility = "hidden";
            this._blocActions = this.shadowRoot?.querySelector("cms-bloc-actions") as BlocActions;
            const slot = this.shadowRoot!.querySelector("#workingElement slot") as HTMLSlotElement;
            if (!slot) throw new Error("Working slot not found in shadow DOM");

            this._installEditorContext(workingElement);

            waitForScripts(this).then(async () => {
                this._observer = new ObserverManager(slot);
                this._dragmanager = new DragManager(workingElement);

                this._blocLibrary = this.shadowRoot?.querySelector("cms-bloc-library") as BlocLibrary;

                if (this._isWorkingEmpty()) await this._maybePickTemplate();

                // Honor `?mode=view` from the URL — keeps the user in view
                // mode across navigations (see `linkNavigation.ts`) and
                // makes hand-edited URLs predictable. Editors are now wired
                // (ObserverManager + waitForScripts done) so the cascade
                // dispatched by switchMode reaches them.
                if (new URLSearchParams(location.search).get("mode") === "view") {
                    this.switchMode("view");
                }

                workingElement.style.visibility = "visible";
            })
        })

    }

    disconnectedCallback() {
        this._navGuardOff?.();
        this._dirtyWatchOff?.();
        this._linkIntercptOff?.();
        clearEditorContext();
    }

    /**
     * Boot the cross-cutting editor services: navigation guard, dirty
     * observer, and the shared `editorContext` that link clicks consult
     * to classify hrefs and route navigation requests. Pages list is
     * fetched async — link classification falls back to "page" until it
     * resolves, which is harmless (worst case the editor 404s).
     */
    private _installEditorContext(workingElement: HTMLElement) {
        setEditorContext({
            isDirty,
            requestNavigation: resolveTargetForLink,
        });
        this._navGuardOff     = installNavigationGuard();
        this._dirtyWatchOff   = watchForDirty(workingElement);
        this._linkIntercptOff = installLinkInterceptor();

        // Fire-and-forget: pages list is read-only and small. We tolerate
        // failure (offline, auth) — link classification still works for
        // anchors/external/mailto and falls back to "page" for same-origin
        // paths, which is the right default.
        fetch(`${getMetaBasePath()}/api/page/list`).then(r => r.ok ? r.json() : []).then((list: unknown) => {
            if (!Array.isArray(list)) return;
            const paths = new Set<string>();
            const ids   = new Map<string, string>();
            for (const item of list) {
                const p  = (item as { path?: unknown }).path;
                const id = (item as { id?:   unknown }).id;
                if (typeof p === "string") paths.add(p);
                if (typeof p === "string" && typeof id === "string") ids.set(p, id);
            }
            setEditorContext({ knownPagePaths: paths, pageIdByPath: ids });
        }).catch(() => { /* offline / auth — keep empty set */ });
    }

    private _isWorkingEmpty(): boolean {
        const slot = this.shadowRoot!.querySelector("#workingElement slot") as HTMLSlotElement;
        const nodes = slot.assignedNodes({ flatten: true }).filter(n =>
            n.nodeType === Node.ELEMENT_NODE ||
            (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "")
        );
        if (nodes.length === 0) return true;
        if (nodes.length !== 1 || nodes[0]!.nodeType !== Node.ELEMENT_NODE) return false;
        const el = nodes[0] as Element;
        if (el.tagName !== "P") return false;
        const text = (el.textContent ?? "").trim();
        if (text !== "") return false;
        const onlyBr = el.children.length === 1 && el.children[0]!.tagName === "BR";
        return el.children.length === 0 || onlyBr;
    }

    private async _maybePickTemplate(): Promise<void> {
        const picker = document.createElement("cms-template-picker") as TemplatePicker;
        this.shadowRoot!.appendChild(picker);
        const html = await picker.open();
        picker.remove();
        if (!html) return;
        // Surgical: only replace the default-slotted children (the page
        // content). Named slots — `style` / `script` / `configuration` —
        // must survive, otherwise the editor loses its config panel.
        Array.from(this.children).forEach(c => { if (!c.hasAttribute("slot")) c.remove(); });
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        while (wrapper.firstChild) this.appendChild(wrapper.firstChild);
    }

    save(){
        const ele = this.shadowRoot?.querySelector("#workingElement") as HTMLElement;
        const content = ele.innerHTML;
        this.dispatchEvent(new CustomEvent("editor-system-save", {
            bubbles: true,
            detail: content
        }))
    }

    openConfig() {
        const slot = this.shadowRoot?.querySelector<HTMLSlotElement>('slot[name="configuration"]');
        const ele = slot?.assignedElements()[0] as HTMLElement | undefined;
        
        if (!ele || !isToggable(ele)) {
            throw new Error("Configuration element must implement open()");
        }
        ele.open();
    }

    switchMode(mode?: EDITOR_SYSTEM_MODE){
        const newMode = ( this._mode === "editor" ) ? "view" : "editor";
        this.dispatchEvent(new CustomEvent("editor-system-switch-mode", {
            bubbles: true,
            detail: mode ?? newMode
        }))
        this._mode = mode ?? newMode;
        setEditorContext({ mode: this._mode });
        this._syncModeQueryParam();
    }

    /**
     * User-facing mode toggle. Unlike `switchMode()` — which does an
     * in-place flip used for the boot URL sync and for `pageContent`'s
     * save-time harvest — this one writes the new mode into the URL and
     * triggers a full `location.replace()`. The page reboots from scratch
     * in the target mode, so data-fetching blocs naturally run their
     * real-runtime mount path (no special bloc-side handling needed) and
     * editor-mode blocs come back to a clean editor scope on the way
     * back. `replace()` (not assignment) keeps history clean — the back
     * button doesn't bounce between the same URL with stale mode state.
     */
    toggleMode() {
        const next = this._mode === "editor" ? "view" : "editor";
        const url = new URL(location.href);
        if (next === "view") url.searchParams.set("mode", "view");
        else                 url.searchParams.delete("mode");
        location.replace(url.toString());
    }

    /**
     * Mirror the current mode into the URL as `?mode=view` (or strip the
     * param when back to editor — editor is the default). Uses
     * `rawReplaceState` to bypass the navigation guard: a same-page state
     * update is not a navigation, and routing it through `requestNavigation`
     * would either no-op or trigger a redirect loop.
     */
    private _syncModeQueryParam(): void {
        const url = new URL(location.href);
        if (this._mode === "view") url.searchParams.set("mode", "view");
        else                       url.searchParams.delete("mode");
        if (url.href !== location.href) rawReplaceState(history.state, "", url.toString());
    }

    get observer(){
        if ( !this._observer ) throw new Error("You try to get observer before his initialization")
        return this._observer;
    }

    get dragManager(){
        if ( !this._dragmanager ) throw new Error("You try to get dragManager before his initialization");
        return this._dragmanager;
    }

    get blocActions(){
        if ( !this._blocActions ) throw new Error("You try to get blocActions before his initialization");
        return this._blocActions;
    }

    get editorDOM(){
        const ele = this.shadowRoot?.querySelector("#editorSystem");
        if (!ele ) throw new Error("You try to get editorSystem before his initialization");
        return ele
    }

    get blocLibrary(){
        if ( !this._blocLibrary ) throw new Error("You try to get _blocLibrary before his initialization");
        return this._blocLibrary;
    }

    get mode(){
        return this._mode;
    }

    get pageContent(){
        this.switchMode("view");
        const slot = this.shadowRoot!.querySelector('#workingElement slot') as HTMLSlotElement;
        const nodes = slot.assignedNodes({ flatten: true });
        // Belt-and-braces strip of editor-only artifacts. The per-Editor
        // viewClient() pass triggered by switchMode("view") above already
        // cleans every editorized target, but elements outside the Editor
        // system (e.g. <template> light children of a bloc — inert content
        // the observer brushed with action-disable + parent-identifier
        // attrs) escape that pass. Walking the captured subtree once
        // catches those gaps and makes "no p9r-* in saved HTML" an
        // invariant we don't have to re-prove for every new bloc pattern.
        for (const n of nodes) if (n instanceof Element) stripResidualChrome(n);
        const html = nodes
            .filter(n => n.nodeName !== "#text")
            .map(n => n instanceof Element ? n.outerHTML : n.textContent ?? '')
            .join('');
        this.switchMode("editor");
        return html;
    }

}

if ( !customElements.get("cms-editor-system") ){
    customElements.define("cms-editor-system", EditorRoot)
}