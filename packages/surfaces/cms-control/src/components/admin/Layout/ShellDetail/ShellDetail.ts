import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import "./DetailSection";

export class CmsShellDetail extends Component {
    private header: HTMLElement | null = null;
    private identity: HTMLElement | null = null;
    private titleContainer: HTMLElement | null = null;
    private actions: HTMLElement | null = null;
    private chromeSlots: HTMLSlotElement[] = [];

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        const root = this.shadowRoot;
        if (!root) {
            return;
        }
        this.header = root.querySelector(".shell-detail-header");
        this.identity = root.querySelector(".shell-detail-identity");
        this.titleContainer = root.querySelector(".shell-detail-title");
        this.actions = root.querySelector(".shell-detail-actions");
        this.chromeSlots = Array.from(
            root.querySelectorAll<HTMLSlotElement>('slot[name="back"], slot[name="title"], slot[name="actions"]'),
        );
        for (const slot of this.chromeSlots) {
            slot.addEventListener("slotchange", this.syncHeader);
        }
        this.syncHeader();
    }

    disconnectedCallback(): void {
        for (const slot of this.chromeSlots) {
            slot.removeEventListener("slotchange", this.syncHeader);
        }
        this.chromeSlots = [];
    }

    private syncHeader = (): void => {
        const root = this.shadowRoot;
        if (!root) {
            return;
        }
        const hasBack = this.hasAssignedContent(root.querySelector('slot[name="back"]'));
        const hasTitle = this.hasAssignedContent(root.querySelector('slot[name="title"]'));
        const hasActions = this.hasAssignedContent(root.querySelector('slot[name="actions"]'));
        const hasIdentity = hasBack || hasTitle;
        if (this.header) {
            this.header.hidden = !hasIdentity && !hasActions;
        }
        if (this.identity) {
            this.identity.hidden = !hasIdentity;
        }
        if (this.titleContainer) {
            this.titleContainer.hidden = !hasTitle;
        }
        if (this.actions) {
            this.actions.hidden = !hasActions;
        }
    };

    private hasAssignedContent(slot: HTMLSlotElement | null): boolean {
        return Boolean(
            slot?.assignedNodes({ flatten: true }).some((node) => {
                if (node instanceof Element) {
                    return !node.hasAttribute("hidden");
                }
                return node.textContent?.trim() !== "";
            }),
        );
    }
}

if (!customElements.get("cms-shell-detail")) {
    customElements.define("cms-shell-detail", CmsShellDetail);
}
