import type { SlimEndpoint } from "src/control/core/data/types";
import { buildShadow, type Refs } from "./template";
import {
    buildUrl,
    closePanel,
    findProviderForValue,
    loadEndpointsFor,
    openPanel,
    renderEndpoints,
    setValue,
} from "./controller";
import type { ProviderListItem } from "./flows";

/**
 * `<cms-schema-picker name="..." label="..." value="https://api.x/...">`
 *
 * Form-associated picker for OpenAPI endpoints registered through the
 * Data tab. Output is the **fully-qualified URL** of the selected
 * endpoint — the active provider's `server` joined with the endpoint
 * path. The consumer block places it on whatever attribute fits its
 * bloc config (mirrors `<p9r-link>`).
 *
 * The HTTP method is intentionally NOT part of the saved value: most
 * consumer blocs are method-pinned (e.g. `<base-fetch methods="GET">`),
 * and embedding it in the value would force every reader to parse a
 * `METHOD URL` shape. Blocs that need the method declare it via their
 * own attribute or via the `methods=` filter on the picker.
 *
 * Closing the panel via outside click, ESC, or another popover opening
 * is handled by the browser thanks to `popover="auto"`.
 */
export class SchemaPicker extends HTMLElement {

    static formAssociated = true;

    _refs!:                Refs;
    _internals:            ElementInternals;
    _value                  = "";
    _isOpen                 = false;
    _providers:            ProviderListItem[] = [];
    _activeProviderId       = "";
    _endpointsByProvider    = new Map<string, SlimEndpoint[]>();

    private _onWindowClick = (e: MouseEvent) => {
        if (this._isOpen && !this.contains(e.target as Node)) closePanel(this);
    };
    private _onProviderSaved = () => {
        this._providers = [];
        if (this._isOpen) closePanel(this);
    };

    constructor() {
        super();
        this._internals = this.attachInternals();
    }

    connectedCallback() {
        // attachShadow can only be called once on a host — guard against
        // disconnect/reconnect cycles that would otherwise throw.
        if (!this.shadowRoot) {
            this._refs = buildShadow(this, this.getAttribute("label"));
            this._wire();
        }
        // Re-apply any value buffered by setters that fired before this
        // callback ran (e.g. `<p9r-attr-sync>` writes during panel build).
        // Falls back to the `value` attribute on first connection.
        const v = this._value || this.getAttribute("value") || "";
        setValue(this, v);
        window.addEventListener("click", this._onWindowClick);
        document.addEventListener("new:provider",     this._onProviderSaved);
        document.addEventListener("provider:synced",  this._onProviderSaved);
    }

    disconnectedCallback() {
        window.removeEventListener("click", this._onWindowClick);
        document.removeEventListener("new:provider",    this._onProviderSaved);
        document.removeEventListener("provider:synced", this._onProviderSaved);
    }

    get value() { return this._value; }
    set value(v: string) { setValue(this, v); }
    get name()  { return this.getAttribute("name"); }
    get _api()  { return this.getAttribute("api") ?? "/api/data"; }

    private _wire() {
        const r = this._refs;
        r.trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            this._isOpen ? closePanel(this) : openPanel(this);
        });
        r.clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setValue(this, "");
            this.dispatchEvent(new Event("change", { bubbles: true }));
        });
        r.providerSelect.addEventListener("change", () => {
            void loadEndpointsFor(this, r.providerSelect.value);
        });
        r.search.addEventListener("input", () => renderEndpoints(this));
        r.list.addEventListener("click", (e) => {
            const li = (e.target as HTMLElement).closest(".option") as HTMLElement | null;
            if (!li || !li.dataset.id) return;
            const [, ...rest] = li.dataset.id.split(" ");
            const path = rest.join(" ");
            if (!path) return;
            const provider = this._providers.find(p => p.id === this._activeProviderId);
            if (!provider) return;
            setValue(this, buildUrl(provider.server, path));
            this.dispatchEvent(new Event("change", { bubbles: true }));
            closePanel(this);
        });
    }
}

if (!customElements.get("cms-schema-picker")) {
    customElements.define("cms-schema-picker", SchemaPicker);
}

// Re-export utilities so consumer blocks can build / inspect URL values
// without importing the whole component class file.
export { buildUrl, findProviderForValue };
