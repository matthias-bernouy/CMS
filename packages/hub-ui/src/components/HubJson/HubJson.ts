import { Component } from "../_base/Component";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { apiGet } from "../_base/api";

/**
 * `<hub-json>` — pretty-prints a JSON value as a readable code block.
 * Source, in priority order:
 *   1. `src` attribute → fetches the URL (page query params forwarded),
 *      unwraps the `{ ok, data }` envelope, then resolves the optional
 *      dot-`path` (e.g. `schemas.tenantConfig`); or
 *   2. the `.value` DOM property (object/array/primitive); or
 *   3. the `value` attribute (a JSON string); or
 *   4. the element's text content (a JSON string).
 *
 * Fixes the `[object Object]` bug: page templates that interpolated an
 * object with `{{ }}` got `String(obj)`. Pointing `<hub-json src path>` at
 * the endpoint renders the real structure instead.
 */
export class HubJson extends Component {
    private _value: unknown = undefined;

    static get observedAttributes() { return ["value", "src", "path"]; }

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback() { void this._init(); }
    attributeChangedCallback() { if (this.isConnected) void this._init(); }

    get value(): unknown { return this._value; }
    set value(v: unknown) { this._value = v; this._render(); }

    private async _init() {
        const src = this.getAttribute("src");
        if (src) {
            const pre = this.shadowRoot?.querySelector("pre");
            if (pre) pre.textContent = "Loading…";
            const url = this._withPageQuery(src);
            const data = await apiGet<any>(url);
            this._value = this._resolvePath(data, this.getAttribute("path"));
        }
        this._render();
    }

    private _withPageQuery(src: string): string {
        const pageParams = new URLSearchParams(window.location.search);
        if ([...pageParams].length === 0) return src;
        const [base, own = ""] = src.split("?");
        const merged = new URLSearchParams(own);
        for (const [k, v] of pageParams) if (!merged.has(k)) merged.set(k, v);
        return `${base}?${merged.toString()}`;
    }

    private _resolvePath(data: any, path: string | null): unknown {
        if (!path) return data;
        return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), data);
    }

    private _resolve(): unknown {
        if (this._value !== undefined) return this._value;
        const attr = this.getAttribute("value");
        const raw  = attr ?? this.textContent ?? "";
        const trimmed = raw.trim();
        if (!trimmed) return null;
        try { return JSON.parse(trimmed); }
        catch { return trimmed; }
    }

    private _render() {
        const pre = this.shadowRoot?.querySelector("pre");
        if (!pre) return;
        const v = this._resolve();
        pre.textContent = typeof v === "string"
            ? v
            : JSON.stringify(v, null, 2);
    }
}

if (!customElements.get("hub-json")) customElements.define("hub-json", HubJson);
