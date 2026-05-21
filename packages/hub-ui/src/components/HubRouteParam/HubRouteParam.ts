/**
 * `<hub-route-param param="tenantId" target="#sel">` — reads the named
 * query-string param, writes it as the textContent of `target` (CSS
 * selector), and rewrites every descendant so the placeholder
 * `__<PARAM>__` (uppercase) becomes the URL-encoded value in `href`,
 * `target`, and `url` attributes. Lets detail pages stay JS-free.
 *
 * Plain element (no shadow): it mutates the surrounding document.
 */
export class HubRouteParam extends HTMLElement {
    connectedCallback() {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this._apply(), { once: true });
        } else {
            this._apply();
        }
    }

    private _apply() {
        const paramName = this.getAttribute("param");
        if (!paramName) return;
        const value   = new URLSearchParams(window.location.search).get(paramName) ?? "";
        const encoded = encodeURIComponent(value);
        const needle  = `__${paramName.toUpperCase()}__`;

        const labelTarget = this.getAttribute("target");
        if (labelTarget) {
            document.querySelectorAll(labelTarget).forEach((el) => { el.textContent = value; });
        }
        for (const el of Array.from(document.body.querySelectorAll("*"))) {
            for (const attr of ["href", "target", "url"]) {
                const v = el.getAttribute(attr);
                if (v && v.includes(needle)) el.setAttribute(attr, v.replaceAll(needle, encoded));
            }
        }
    }
}

if (!customElements.get("hub-route-param")) customElements.define("hub-route-param", HubRouteParam);
