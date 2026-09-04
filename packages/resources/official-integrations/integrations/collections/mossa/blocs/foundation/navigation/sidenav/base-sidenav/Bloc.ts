import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._menuToggle = this.shadowRoot?.querySelector(".menu-toggle") as HTMLButtonElement | null;
        this._desktopToggle = this.shadowRoot?.querySelector(".desktop-toggle") as HTMLButtonElement | null;
        this._backdrop = this.shadowRoot?.querySelector(".backdrop") as HTMLElement | null;
        this._brandSlot = this.shadowRoot?.querySelector('slot[name="brand"]') as HTMLSlotElement | null;
        this._footerSlot = this.shadowRoot?.querySelector('slot[name="footer"]') as HTMLSlotElement | null;

        this._menuToggle?.removeEventListener("click", this._onMenuClick);
        this._desktopToggle?.removeEventListener("click", this._onDesktopClick);
        this._backdrop?.removeEventListener("click", this._onBackdropClick);
        document.removeEventListener("keydown", this._onKeyDown);

        this._menuToggle?.addEventListener("click", this._onMenuClick);
        this._desktopToggle?.addEventListener("click", this._onDesktopClick);
        this._backdrop?.addEventListener("click", this._onBackdropClick);
        document.addEventListener("keydown", this._onKeyDown);

        this._brandSlot?.addEventListener("slotchange", this._onBrandSlotChange);
        this._footerSlot?.addEventListener("slotchange", this._onFooterSlotChange);
        this._onBrandSlotChange();
        this._onFooterSlotChange();

        this._syncAria();
    }

    disconnectedCallback(): void {
        this._menuToggle?.removeEventListener("click", this._onMenuClick);
        this._desktopToggle?.removeEventListener("click", this._onDesktopClick);
        this._backdrop?.removeEventListener("click", this._onBackdropClick);
        this._brandSlot?.removeEventListener("slotchange", this._onBrandSlotChange);
        this._footerSlot?.removeEventListener("slotchange", this._onFooterSlotChange);
        document.removeEventListener("keydown", this._onKeyDown);
        this._menuToggle = null;
        this._desktopToggle = null;
        this._backdrop = null;
        this._brandSlot = null;
        this._footerSlot = null;
    }

    static observedAttributes = ["open", "collapsed"];

    attributeChangedCallback(): void {
        this._syncAria();
    }

    private _menuToggle: HTMLButtonElement | null = null;
    private _desktopToggle: HTMLButtonElement | null = null;
    private _backdrop: HTMLElement | null = null;
    private _brandSlot: HTMLSlotElement | null = null;
    private _footerSlot: HTMLSlotElement | null = null;

    /** Mirror slot-content presence onto host attributes. Rule 12 says
     *  `:host(:has(...))` is silently dropped by the CSS parser, so style
     *  hooks (like the bottom divider on `.foot`) need a JS-set marker
     *  on the host to react to. */
    private _onBrandSlotChange = () => {
        const has = (this._brandSlot?.assignedNodes({ flatten: true }).length ?? 0) > 0;
        this.toggleAttribute("has-brand", has);
    };
    private _onFooterSlotChange = () => {
        const has = (this._footerSlot?.assignedNodes({ flatten: true }).length ?? 0) > 0;
        this.toggleAttribute("has-footer", has);
    };

    private _onMenuClick = () => {
        this.toggleAttribute("open");
    };

    private _onBackdropClick = () => {
        this.removeAttribute("open");
    };

    private _onDesktopClick = () => {
        this.toggleAttribute("collapsed");
    };

    private _onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && this.hasAttribute("open")) {
            this.removeAttribute("open");
        }
    };

    private _syncAria(): void {
        this._menuToggle?.setAttribute("aria-expanded", String(this.hasAttribute("open")));
        this._desktopToggle?.setAttribute("aria-expanded", String(!this.hasAttribute("collapsed")));
    }
}
