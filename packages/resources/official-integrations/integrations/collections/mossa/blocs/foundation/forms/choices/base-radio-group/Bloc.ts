import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

/**
 * Each `<base-radio>` owns its own shadow with its own native `<input
 * type="radio">`. Native radio grouping (same `name` → only one checked)
 * does NOT cross shadow boundaries, so we must enforce single-selection
 * ourselves at the group level: listen to bubbling `change` events from
 * children and uncheck every other radio when one becomes checked.
 */
export class Bloc extends Component {
    static observedAttributes = ["name", "required", "disabled"];

    private _observer: MutationObserver | null = null;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._observer = new MutationObserver(this._propagate);
        this._observer.observe(this, { childList: true, subtree: true });
        this.addEventListener("change", this._onChildChange);
        this._propagate();
    }

    disconnectedCallback(): void {
        this._observer?.disconnect();
        this.removeEventListener("change", this._onChildChange);
    }

    attributeChangedCallback() {
        this._propagate();
    }

    get name(): string {
        return this.getAttribute("name") ?? "";
    }

    private _radios(): HTMLElement[] {
        return Array.from(this.querySelectorAll(":scope > base-radio")) as HTMLElement[];
    }

    private _propagate = () => {
        const name = this.getAttribute("name") ?? "";
        const required = this.hasAttribute("required");
        const disabled = this.hasAttribute("disabled");
        const radios = this._radios();
        radios.forEach((r, i) => {
            if (name) {
                r.setAttribute("name", name);
            } else {
                r.removeAttribute("name");
            }
            if (required && i === 0) {
                r.setAttribute("required", "");
            } else {
                r.removeAttribute("required");
            }
            if (disabled) {
                r.setAttribute("disabled", "");
            }
        });
    };

    private _onChildChange = (e: Event) => {
        // The event re-targets at the group boundary; the original
        // `<base-radio>` host is in composedPath. Only handle when one
        // of OUR direct radio children is the source AND it's now checked
        // (changes that just unchecked don't need fan-out).
        const path = e.composedPath();
        const source = path.find(
            (n) => (n as HTMLElement)?.tagName === "BASE-RADIO" && (n as HTMLElement).parentElement === this,
        ) as HTMLElement | undefined;
        if (!source) {
            return;
        }
        if (!source.hasAttribute("checked")) {
            return;
        }
        for (const r of this._radios()) {
            if (r !== source && r.hasAttribute("checked")) {
                r.removeAttribute("checked");
            }
        }
    };
}
