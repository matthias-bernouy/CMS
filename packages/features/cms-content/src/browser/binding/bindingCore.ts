/**
 * `<cms-binding-core>` — the declarative activation root for the data-binding
 * runtime. Wrap any region of HTML in it; on connect it runs a `BindingRuntime`
 * over its own subtree (discovering `cms-query` and `cms-mutation` elements, expanding
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

import { BindingRuntime } from "./runtime/BindingRuntime";
import { createBuiltinFilters, type FilterMap } from "./core/interpolate";
import { injectCloak } from "./core/cloak";

export {
    BINDING_CORE_TAG,
    QUERY_ATTR,
    QUERY_INPUT_ATTR,
    QUERY_LISTEN_ATTR,
    QUERY_REFRESH_ATTR,
    MUTATION_ATTR,
    MUTATION_INPUT_ATTR,
    MUTATION_REDIRECT_ATTR,
    MUTATION_REDIRECT_PARAM_ATTR,
    MUTATION_RESET_ATTR,
    SYNC_ATTR,
} from "./core/attrs";
export {
    CMS_SYNC_CHANGE_EVENT,
    readSyncValue,
    subscribeSyncValue,
    writeSyncValue,
} from "./state/SyncState";
export type { FormSubmitResult } from "./form/formSubmit";
export { mutationFormRequest, MutationFormError } from "./runtime/mutation/programmaticRequest";

const BINDING_FILTERS_KEY = Symbol.for("@bernouy/cms-content.browser.binding.filters");

/** Filter set passed to every source's interpolation. The registry lives on
 *  the browser realm so independently bundled public entrypoints still share
 *  the host configuration. */
function bindingFilters(): FilterMap {
    return ((globalThis as typeof globalThis & Record<PropertyKey, unknown>)[BINDING_FILTERS_KEY] as FilterMap) ?? {};
}

/** Set the filter set used by all binding cores (call before they connect). */
export function setBindingFilters(filters: FilterMap): void {
    (globalThis as typeof globalThis & Record<PropertyKey, unknown>)[BINDING_FILTERS_KEY] = filters;
}

export class BindingCore extends HTMLElement {
    private _runtime: BindingRuntime | null = null;

    connectedCallback(): void {
        injectCloak(this.ownerDocument ?? document);
        if (this._runtime && !this._runtime.isStopped) {
            return;
        }
        const locale = this.ownerDocument?.documentElement.lang;
        const filters = { ...createBuiltinFilters(locale), ...bindingFilters() };
        this._runtime = new BindingRuntime(this, filters);
        this._runtime.start();
    }

    disconnectedCallback(): void {
        this._runtime?.stop();
        this._runtime = null;
    }
}
