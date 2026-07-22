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

import { BindingRuntime, revealSources } from "../runtime/BindingRuntime";
import { type FilterMap } from "./interpolate";
import { injectCloak } from "./cloak";
import {
    BINDING_CORE_TAG,
    BINDING_DISABLED_ATTR,
    BIND_STOP_ATTR,
    isSourceState,
    PAGE_STATE_ATTR,
    READY_ATTR,
    SOURCE_BODY_ATTR,
    SOURCE_ID_ATTR,
    SOURCE_STATE_FORCE_ATTR,
    SOURCE_TRIGGER_ATTR,
    type SourceState,
} from "./attrs";

/** Re-exported through `@bernouy/components/binding` so the editor's save can
 *  strip the runtime's own stamps from serialized canvas content. */
export { clearRuntimeStamps } from "../source/Source";
export {
    BINDING_CORE_TAG,
    BINDING_DISABLED_ATTR,
    BIND_STOP_ATTR,
    PAGE_STATE_ATTR,
    READY_ATTR,
    SOURCE_BODY_ATTR,
    SOURCE_ID_ATTR,
    SOURCE_STATE_FORCE_ATTR,
    SOURCE_TRIGGER_ATTR,
} from "./attrs";
export { currentState, setState, STATE_CHANGE_EVENT } from "../params";

/** Filter set passed to every source's interpolation. Empty until a host wires
 *  one in via `setBindingFilters` (the concrete filters are a later step). */
let FILTERS: FilterMap = {};

/** Set the filter set used by all binding cores (call before they connect). */
export function setBindingFilters(filters: FilterMap): void {
    FILTERS = filters;
}

export class BindingCore extends HTMLElement {
    private _runtime: BindingRuntime | null = null;

    static get observedAttributes(): string[] {
        return [BINDING_DISABLED_ATTR, SOURCE_STATE_FORCE_ATTR];
    }

    connectedCallback(): void {
        injectCloak(this.ownerDocument ?? document);
        this._syncRuntime();
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
        if (this._isRuntimeDisabled()) {
            this._revealInertSources();
            return;
        }
        if (this._runtime && !this._runtime.isStopped) {
            return;
        }
        this._runtime = new BindingRuntime(this, FILTERS, {
            sourceStateForce: this._sourceStateForce(),
        });
        this._runtime.start();
    }

    attributeChangedCallback(): void {
        if (!this.isConnected) {
            return;
        }
        this._syncRuntime({ restart: true });
    }

    private _syncRuntime(options: { restart?: boolean } = {}): void {
        if (this._isRuntimeDisabled()) {
            this._runtime?.deactivate();
            this._runtime = null;
            this._revealInertSources();
            return;
        }

        if (options.restart) {
            this._runtime?.deactivate();
            this._runtime = null;
        }
        this.startRuntime();
    }

    private _isRuntimeDisabled(): boolean {
        if (this.hasAttribute(BINDING_DISABLED_ATTR) || this.closest(`[${BIND_STOP_ATTR}]`) !== null) {
            return true;
        }

        for (let parent = this.parentElement; parent; parent = parent.parentElement) {
            if (parent.localName === BINDING_CORE_TAG && parent.hasAttribute(BINDING_DISABLED_ATTR)) {
                return true;
            }
        }

        return false;
    }

    private _sourceStateForce(): SourceState | undefined {
        const value = this.getAttribute(SOURCE_STATE_FORCE_ATTR);
        return isSourceState(value) ? value : undefined;
    }

    private _revealInertSources(): void {
        revealSources(this);
        queueMicrotask(() => {
            if (this.isConnected && this._isRuntimeDisabled()) {
                revealSources(this);
            }
        });
    }
}
