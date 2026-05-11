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
 * `<cms-schema-picker name="..." label="..." value="/.cms/data/<id>/...">`
 *
 * Form-associated picker for OpenAPI endpoints registered through the
 * Data tab. Output is the **proxy path** of the selected endpoint —
 * `<DATA_PROXY_PREFIX>/<providerId><operationPath>`. The page that ends
 * up rendering the bloc fetches this same-origin against its own host;
 * the bucket edge proxies the call to the provider's real upstream
 * server (whose URL never appears in the persisted DOM). In the editor
 * preview, `installFetchProxy` recognises the same shape and routes the
 * request to the mock endpoint instead.
 *
 * The HTTP method is intentionally NOT part of the saved URL: most
 * consumer blocs are method-pinned (e.g. `<base-fetch methods="GET">`),
 * and embedding it in the value would force every reader to parse a
 * `METHOD URL` shape. Blocs that DO care about the method (e.g. a form
 * that can POST/PUT/PATCH/DELETE) opt in via `methodAttr="<attr-name>"`:
 * the picker then writes the picked method (lowercased) directly to that
 * attribute on the owning bloc, in addition to writing the URL via the
 * normal `name`/form-value channel. Without `methodAttr=`, the legacy
 * URL-only behavior is preserved for existing consumers.
 *
 * Closing the panel via outside click, ESC, or another popover opening
 * is handled by the browser thanks to `popover="auto"`.
 */
export class SchemaPicker extends HTMLElement {

    static formAssociated = true;

    _refs!:                Refs;
    _internals:            ElementInternals;
    _value                  = "";
    _pickedMethod           = "";
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
        // Seed `_pickedMethod` from the owning bloc — the saved URL alone
        // doesn't carry the method, but if `methodAttr=` is configured we
        // can read it back from the bloc to restore the visual selection.
        this._pickedMethod = readMethodFromTarget(this);
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
            this._pickedMethod = "";
            writeMethodToTarget(this, "");
            this.dispatchEvent(new Event("change", { bubbles: true }));
        });
        r.providerSelect.addEventListener("change", () => {
            void loadEndpointsFor(this, r.providerSelect.value);
        });
        r.search.addEventListener("input", () => renderEndpoints(this));
        r.list.addEventListener("click", (e) => {
            const li = (e.target as HTMLElement).closest(".option") as HTMLElement | null;
            if (!li || !li.dataset.id) return;
            const [method, ...rest] = li.dataset.id.split(" ");
            const path = rest.join(" ");
            if (!path || !method) return;
            const provider = this._providers.find(p => p.id === this._activeProviderId);
            if (!provider) return;
            this._pickedMethod = method.toLowerCase();
            writeMethodToTarget(this, this._pickedMethod);
            setValue(this, buildUrl(provider.id, path));
            this.dispatchEvent(new Event("change", { bubbles: true }));
            closePanel(this);
        });
    }
}

/**
 * Resolve the bloc that owns the panel hosting this picker. Mirrors the
 * lookup `<p9r-attr-sync>` performs: walk up to the nearest element
 * carrying `p9r-parent-identifier`, then look up the bloc by id. Returns
 * null when the picker isn't inside an editor panel (standalone use).
 */
function findOwnerBloc(host: HTMLElement): HTMLElement | null {
    const pidEl = host.closest(`[${p9r.attr.EDITOR.PARENT_IDENTIFIER}]`);
    const pid   = pidEl?.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (!pid) return null;
    return document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${pid}"]`);
}

/** Write the picked method to the owning bloc's attribute named by
 *  `methodAttr`. No-op when `methodAttr` isn't set (most consumers). */
function writeMethodToTarget(host: SchemaPicker, method: string): void {
    const attr = host.getAttribute("methodAttr");
    if (!attr) return;
    const owner = findOwnerBloc(host);
    if (!owner) return;
    if (method) owner.setAttribute(attr, method);
    else        owner.removeAttribute(attr);
}

/** Read the current method from the owning bloc's `methodAttr`. Used to
 *  seed `_pickedMethod` on `connectedCallback` so the dropdown opens with
 *  the right row pre-selected after a reload. */
function readMethodFromTarget(host: SchemaPicker): string {
    const attr = host.getAttribute("methodAttr");
    if (!attr) return "";
    const owner = findOwnerBloc(host);
    return (owner?.getAttribute(attr) ?? "").toLowerCase();
}

if (!customElements.get("cms-schema-picker")) {
    customElements.define("cms-schema-picker", SchemaPicker);
}

// Re-export utilities so consumer blocks can build / inspect URL values
// without importing the whole component class file.
export { buildUrl, findProviderForValue };
