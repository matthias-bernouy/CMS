import { Component } from "../../../../base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class NavigationListItem extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    static get observedAttributes(): string[] {
        return ["href", "disabled"];
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.setAttribute("role", "listitem");
        this.syncAction();
        for (const slot of this.shadowRoot!.querySelectorAll("slot")) {
            slot.addEventListener("slotchange", this.syncSlots);
        }
        this.shadowRoot!.querySelector("a")!.addEventListener("keydown", this.onKeydown);
        this.shadowRoot!.querySelector("a")!.addEventListener("click", this.onClick);
        this.syncSlots();
    }

    disconnectedCallback(): void {
        for (const slot of this.shadowRoot!.querySelectorAll("slot")) {
            slot.removeEventListener("slotchange", this.syncSlots);
        }
        this.shadowRoot!.querySelector("a")!.removeEventListener("keydown", this.onKeydown);
        this.shadowRoot!.querySelector("a")!.removeEventListener("click", this.onClick);
    }

    attributeChangedCallback(): void {
        this.syncAction();
    }

    private syncAction(): void {
        const anchor = this.shadowRoot?.querySelector("a");
        if (!anchor) {
            return;
        }
        const href = this.getAttribute("href");
        if (href && !this.hasAttribute("disabled")) {
            anchor.href = href;
            anchor.removeAttribute("role");
            anchor.removeAttribute("tabindex");
        } else {
            anchor.removeAttribute("href");
            anchor.setAttribute("role", "button");
            anchor.tabIndex = this.hasAttribute("disabled") ? -1 : 0;
        }
        anchor.setAttribute("aria-disabled", String(this.hasAttribute("disabled")));
    }

    private readonly syncSlots = (): void => {
        for (const name of ["icon", "badge", "description", "caption"]) {
            const slot = this.shadowRoot!.querySelector<HTMLSlotElement>(`slot[name="${name}"]`)!;
            this.toggleAttribute(
                `has-${name}`,
                slot
                    .assignedNodes({ flatten: true })
                    .some((node) => node.nodeType === Node.ELEMENT_NODE || Boolean(node.textContent?.trim())),
            );
        }
    };

    private readonly onKeydown = (event: Event): void => {
        const key = (event as KeyboardEvent).key;
        if (!this.hasAttribute("href") && !this.hasAttribute("disabled") && (key === "Enter" || key === " ")) {
            event.preventDefault();
            this.shadowRoot!.querySelector("a")!.click();
        }
    };

    private readonly onClick = (event: Event): void => {
        if (this.hasAttribute("disabled")) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
}
