/**
 * `<cms-binding-core>` — the declarative activation root for the data-binding
 * runtime. Wrap any region of HTML in it; on connect it runs a `BindingRuntime`
 * over its own subtree (discovering `cms-source` elements, expanding
 * `cms-repeat`, interpolating `{{ }}`), and on disconnect it tears that runtime
 * down. The custom-element lifecycle replaces the old imperative bootstrap —
 * no head script, no DOMContentLoaded juggling.
 *
 * Being a real element is the point: it is registered like any other component
 * (`define("cms-binding-core", BindingCore)`) and the CMS editor can treat it as
 * a bloc, managing its children normally. The directives inside stay attributes
 * on ordinary nodes — this element is only the boundary, and later the home of
 * the page-global scope (query / route / user) shared by every source within.
 */

import { BindingRuntime, revealSources } from "./runtime";
import { type FilterMap } from "./interpolate";
import { SOURCE_ATTR } from "./bindSubtree";
import { BINDING_CORE_TAG, BIND_STOP_ATTR, READY_ATTR } from "./attrs";

/** Re-exported through `@bernouy/cms-blocs/binding` so the editor's save can
 *  strip the runtime's own stamps from serialized canvas content. */
export { clearRuntimeStamps } from "./source";
export { BINDING_CORE_TAG, BIND_STOP_ATTR, READY_ATTR } from "./attrs";

const CLOAK_ID = "cms-binding-cloak";
// The core wraps arbitrary content (often the whole page shell), so it must be
// layout-transparent. Plus the cloak: hide un-ready sources until rendered.
const CLOAK_CSS =
    `${BINDING_CORE_TAG}{display:contents}` +
    `[${SOURCE_ATTR}]:not([${READY_ATTR}]){visibility:hidden}`;

/** Filter set passed to every source's interpolation. Empty until a host wires
 *  one in via `setBindingFilters` (the concrete filters are a later step). */
let FILTERS: FilterMap = {};

/** Set the filter set used by all binding cores (call before they connect). */
export function setBindingFilters(filters: FilterMap): void {
    FILTERS = filters;
}

export class BindingCore extends HTMLElement {
    private _runtime: BindingRuntime | null = null;

    connectedCallback(): void {
        injectCloak(this.ownerDocument ?? document);
        if (this.closest(`[${BIND_STOP_ATTR}]`)) {
            revealSources(this);
            return;
        }
        this.startRuntime();
    }

    disconnectedCallback(): void {
        this._runtime?.stop();
        this._runtime = null;
    }

    /**
     * The live binding runtime over this subtree, or null while torn down.
     * Exposed so an external controller — the CMS editor — can pause the binding
     * (`core.runtime?.deactivate()`) WITHOUT this element carrying any editor-mode
     * concept: deciding WHEN to pause/resume is the editor's job, not the runtime
     * element's.
     */
    get runtime(): BindingRuntime | null {
        return this._runtime;
    }

    /**
     * (Re)build and start the runtime — on connect, and when the editor resumes
     * binding after a pause. `BindingRuntime` is single-use (stop/deactivate are
     * permanent), so resuming needs a fresh instance. No-op if one is running.
     */
    startRuntime(): void {
        if (this._runtime && !this._runtime.isStopped) return;
        this._runtime = new BindingRuntime(this, FILTERS);
        this._runtime.start();
    }
}

/** Inject the cloak stylesheet once — hides un-ready sources so the raw,
 *  un-interpolated template never paints. */
function injectCloak(doc: Document): void {
    if (doc.getElementById(CLOAK_ID)) return;
    const style = doc.createElement("style");
    style.id = CLOAK_ID;
    style.textContent = CLOAK_CSS;
    (doc.head ?? doc.documentElement).appendChild(style);
}
