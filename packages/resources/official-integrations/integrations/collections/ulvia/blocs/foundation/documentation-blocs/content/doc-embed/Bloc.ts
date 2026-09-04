import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _iframe = null;
    _srcSlot = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._iframe = this.shadowRoot?.querySelector(".embed") ?? null;
        this._srcSlot = this.shadowRoot?.querySelector('slot[name="src"]') ?? null;
        this._srcSlot?.addEventListener("slotchange", this._sync);
        this._sync();
    }
    disconnectedCallback() {
        this._srcSlot?.removeEventListener("slotchange", this._sync);
    }
    _sync = () => {
        if (!this._iframe) {
            return;
        }
        const raw =
            this._srcSlot
                ?.assignedNodes({ flatten: true })
                .map((n) => n.textContent ?? "")
                .join("")
                .trim() ?? "";
        if (!raw) {
            this._iframe.src = "";
            return;
        }
        this._iframe.src = this._resolve(raw);
    };
    _resolve(raw) {
        let url;
        try {
            url = new URL(raw, document.baseURI);
        } catch {
            return "";
        }
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            return "";
        }
        const provider = this.getAttribute("provider") ?? "auto";
        const hostname = url.hostname.toLowerCase();
        if (provider === "youtube" || hostname === "youtu.be" || hostname.endsWith(".youtube.com")) {
            const id =
                hostname === "youtu.be"
                    ? url.pathname.split("/").filter(Boolean)[0]
                    : (url.searchParams.get("v") ?? url.pathname.match(/\/embed\/([^/]+)/)?.[1]);
            return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : "";
        }
        if (provider === "vimeo" || hostname === "vimeo.com" || hostname.endsWith(".vimeo.com")) {
            const id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1];
            return id ? `https://player.vimeo.com/video/${id}` : "";
        }
        return url.href;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
