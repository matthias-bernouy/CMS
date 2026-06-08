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

import { BindingRuntime } from "./runtime";
import { type FilterMap } from "./interpolate";
import { SOURCE_ATTR } from "./bindSubtree";
import { READY_ATTR } from "./source";

export const BINDING_CORE_TAG = "cms-binding-core";

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
    private runtime: BindingRuntime | null = null;

    connectedCallback(): void {
        injectCloak(this.ownerDocument ?? document);
        this.runtime = new BindingRuntime(this, FILTERS);
        this.runtime.start();
    }

    disconnectedCallback(): void {
        this.runtime?.stop();
        this.runtime = null;
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
