import { Component } from "../../base/Component";

const CSS = `
    :host {
        display: block;
        margin-bottom: 8px;
    }

    .section-container {
        border-radius: 10px;
        background: var(--bg-surface, #fff);
        border: 1px solid var(--border-default, #e5e7eb);
    }

    header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        cursor: pointer;
        user-select: none;
        outline: none;
    }

    header:hover {
        background: var(--bg-base, #f9fafb);
    }

    header:focus-visible {
        box-shadow: inset 0 0 0 2px var(--primary-base, #6366f1);
        border-radius: 10px;
    }

    @media (prefers-reduced-motion: no-preference) {
        header { transition: background 0.15s; }
        .chevron { transition: transform 0.2s ease; }
    }

    .accent-bar {
        width: 3px;
        height: 14px;
        background: var(--primary-base, #6366f1);
        border-radius: 4px;
        flex-shrink: 0;
    }

    .title-wrapper {
        flex: 1;
        color: var(--text-main, #111827);
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }

    .chevron {
        width: 16px;
        height: 16px;
        color: var(--text-muted, #9ca3af);
        flex-shrink: 0;
    }

    :host([collapsed]) .chevron {
        transform: rotate(-90deg);
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        border-top: 1px solid var(--border-default, #e5e7eb);
        padding: 1rem;
    }

    :host([collapsed]) .content {
        display: none;
    }

    .content ::slotted(*) {
        width: 100%;
    }
`;

const TEMPLATE = `
    <section class="section-container" part="container">
        <header id="toggle" part="header" role="button" tabindex="0" aria-expanded="true">
            <div class="accent-bar" part="accent"></div>
            <div class="title-wrapper" part="title"></div>
            <svg class="chevron" part="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </header>
        <main class="content" id="content" part="content">
            <slot></slot>
        </main>
    </section>
`;

export class FormSection extends Component {

    static get observedAttributes() {
        return ["collapsed", "data-title"];
    }

    private _toggle: HTMLElement | null;
    private _title: HTMLElement | null;
    private _content: HTMLElement | null;

    constructor() {
        super({ css: CSS, template: TEMPLATE });
        this._toggle = this.shadowRoot?.getElementById("toggle") ?? null;
        this._title = this.shadowRoot?.querySelector(".title-wrapper") ?? null;
        this._content = this.shadowRoot?.getElementById("content") ?? null;
    }

    override connectedCallback() {
        for (const prop of ["collapsed"]) {
            this._upgradeProperty(prop);
        }

        if (this.hasAttribute("data-collapsed") && !this.hasAttribute("collapsed")) {
            this.setAttribute("collapsed", "");
        }

        this._syncTitle();
        this._syncAria();

        this._toggle?.addEventListener("click", this._onToggleClick);
        this._toggle?.addEventListener("keydown", this._onToggleKey);
    }

    disconnectedCallback() {
        this._toggle?.removeEventListener("click", this._onToggleClick);
        this._toggle?.removeEventListener("keydown", this._onToggleKey);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, _newVal: string | null) {
        if (!this._toggle) return;
        if (name === "collapsed") this._syncAria();
        if (name === "data-title") this._syncTitle();
    }

    get collapsed(): boolean {
        return this.hasAttribute("collapsed");
    }

    set collapsed(v: boolean) {
        if (v) this.setAttribute("collapsed", "");
        else this.removeAttribute("collapsed");
    }

    private _onToggleClick = () => {
        this.collapsed = !this.collapsed;
        this.dispatchEvent(new CustomEvent("toggle", {
            detail: { collapsed: this.collapsed },
            bubbles: true,
            composed: true,
        }));
    };

    private _onToggleKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this._onToggleClick();
        }
    };

    private _syncTitle() {
        if (!this._title) return;
        this._title.textContent = this.getAttribute("data-title") ?? "";
    }

    private _syncAria() {
        if (!this._toggle) return;
        this._toggle.setAttribute("aria-expanded", String(!this.collapsed));
        if (this._content) this._content.hidden = this.collapsed;
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }
}

if (!customElements.get("p9r-section")) {
    customElements.define("p9r-section", FormSection);
}
