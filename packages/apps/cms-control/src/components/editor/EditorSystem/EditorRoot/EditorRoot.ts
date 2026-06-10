import html from "./template.html" with { type: "text" }
import css from "./EditorRoot.style.css" with { type: "text" }
import { isToggable } from "cms-control/core/isToggable";
import { setEditorContext, clearEditorContext } from "cms-control/core/editorSystem/editorContext";
import { installNavigationGuard, rawReplaceState } from "cms-control/core/editorSystem/navigationGuard";
import { installLinkInterceptor } from "cms-control/core/editorSystem/installLinkInterceptor";
import { watchForDirty, isDirty } from "cms-control/core/editorSystem/dirtyState";
import { resolveTargetForLink } from "./linkNavigation";
import { stripResidualChrome } from "./stripResidualChrome";
import { BINDING_CORE_TAG, BIND_STOP_ATTR, clearRuntimeStamps } from "@bernouy/cms-blocs/binding";
import { findContentRegion, isRegionEmpty, applyPickedTemplate } from "./contentRegion";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { EDITOR_SYSTEM_MODE } from "types/w13c/EditorSystem";
import { ObserverManager } from "cms-control/components/editor/EditorSystem/ObserverManager";
import { DragManager } from "cms-control/components/editor/EditorSystem/DragManager";
import { BlocActions } from "../BlocActions/BlocActions";
import type { BlocLibrary } from "../BlocLibrary/BlocLibrary";
import { waitForScripts } from "./waitForScripts";
import type { TemplatePicker } from "./TemplatePicker/TemplatePicker";

type BindingCoreElement = HTMLElement & {
    runtime: { deactivate(): void } | null;
    startRuntime(): void;
};

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

    /** The canvas's content region — the [data-cms-content] marker for a page, or
     *  the [cms-bind-stop] wrapper for a template/snippet. Shared by the empty
     *  check and the save harvest so both agree on what "the content" is. */
    private _contentRegion(): Element | null {
        const slot = this.shadowRoot!.querySelector("#workingElement slot") as HTMLSlotElement;
        return findContentRegion(slot.assignedElements({ flatten: true }));
    }

    private _contentWrapper(): Element | null {
        const slot = this.shadowRoot!.querySelector("#workingElement slot") as HTMLSlotElement;
        return slot.assignedElements({ flatten: true }).find(el => el.hasAttribute(BIND_STOP_ATTR)) ?? null;
    }

    private _bindingCoresInContent(): BindingCoreElement[] {
        const wrapper = this._contentWrapper();
        if (!wrapper) return [];
        const cores: BindingCoreElement[] = [];
        if (wrapper.localName === BINDING_CORE_TAG) cores.push(wrapper as BindingCoreElement);
        wrapper.querySelectorAll(BINDING_CORE_TAG).forEach((el) => cores.push(el as BindingCoreElement));
        return cores;
    }

    private _isWorkingEmpty(): boolean {
        // Look INSIDE the canvas wrapper: the slotted cms-bind-stop/Shell wrapper
        // is a <div>, never the bare empty <p>, so checking the slot directly
        // would hide a fresh page's emptiness and skip the template picker.
        return isRegionEmpty(this._contentRegion());
    }

    private async _maybePickTemplate(): Promise<void> {
        const picker = document.createElement("cms-template-picker") as TemplatePicker;
        this.shadowRoot!.appendChild(picker);
        const html = await picker.open();
        picker.remove();
        if (!html) return;
        // Inject INTO the content region (inside the cms-bind-stop / Shell
        // wrapper), never in place of it: pageContent + the empty check locate
        // content via that wrapper, so destroying it would orphan the save.
        applyPickedTemplate(this, this._contentRegion(), html);
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
        // The canvas renders the page inside its Shell (the cms-bind-stop wrapper +
        // header/footer + the <cms-binding-core>). Save must persist only the page's
        // OWN content: for a page that's the [data-cms-content] region (the Shell's
        // {{CONTENT}} slot); for templates/snippets (no Shell) it's everything under
        // cms-bind-stop. It MUST be read in EDITOR mode — there the binding core is
        // paused, so the canvas holds the authored TEMPLATE, not the live render.
        // If we're in view mode, pause ONLY the Shell binding cores while cloning:
        // this avoids a global editor->view mode cascade and URL churn during save.
        // The live editor is briefly restored afterwards.
        const wasView = this._mode === "view";
        const cores = wasView ? this._bindingCoresInContent() : [];
        if (wasView) cores.forEach((core) => core.runtime?.deactivate());
        try {
            const region = this._contentRegion();
            if (!region) return "";
            const clone = region.cloneNode(true) as Element;
            stripResidualChrome(clone);   // editor chrome (p9r-*, editor-block, contenteditable, …)
            clearRuntimeStamps(clone);    // binding runtime stamps (cms-ready) — owned by cms-blocs
            return clone.innerHTML;
        } finally {
            if (wasView) cores.forEach((core) => core.startRuntime());
        }
    }

}

if ( !customElements.get("cms-editor-system") ){
    customElements.define("cms-editor-system", EditorRoot)
}
