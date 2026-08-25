import { emitWidgetEvent, WIDGET_ROW_SELECT_EVENT } from "../shared";
import { renderIcon } from "../../navigation/icons";

const template = document.createElement("template");
template.innerHTML = `
    <style>
        :host { display: block; color: #10231c; }
        .item { display: flex; align-items: center; gap: 10px; min-height: 62px; padding: 0 16px; border-top: 1px solid #e8ecea; }
        :host([collection]) .item { cursor: pointer; }
        :host([collection]) .item:hover, :host([data-drop-target]) .item { background: #f3f7f5; }
        :host([data-dragging]) { opacity: .55; }
        .handle { width: 18px; color: #74817d; cursor: grab; font-size: 17px; line-height: 1; user-select: none; }
        .handle[hidden], .icon[hidden], .badge[hidden], .chevron[hidden] { display: none; }
        .icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; color: #0d6a55; background: #e7f4ee; }
        .icon svg { width: 16px; height: 16px; }
        .content { flex: 1 1 auto; min-width: 0; }
        .title, .subtitle { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .title { font-size: 14px; font-weight: 700; }
        .subtitle { margin-top: 2px; color: #66736f; font-size: 12px; }
        .badge { flex: 0 0 auto; padding: 3px 7px; border-radius: 999px; color: #087048; background: #edf8f1; font-size: 11px; font-weight: 700; }
        .chevron { color: #70807a; font-size: 24px; font-weight: 300; line-height: 1; }
    </style>
    <div class="item">
        <span class="handle" data-handle title="Drag to reorder" aria-label="Drag to reorder" hidden>⠿</span>
        <span class="icon" data-icon hidden></span>
        <span class="content"><span class="title" data-title></span><span class="subtitle" data-subtitle></span></span>
        <span class="badge" data-badge hidden></span>
        <span class="chevron" data-chevron hidden aria-hidden="true">›</span>
    </div>
`;

export class DashboardWNavigationItem extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["title", "subtitle", "icon", "badge", "collection", "reorderable"];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.querySelector(".item")?.addEventListener("click", this.onClick);
        this.shadowRoot!.querySelector(".item")?.addEventListener("keydown", this.onKeydown);
        this.render();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.querySelector(".item")?.removeEventListener("click", this.onClick);
        this.shadowRoot?.querySelector(".item")?.removeEventListener("keydown", this.onKeydown);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.render();
        }
    }

    get rowKey(): string {
        return this.getAttribute("row-key") ?? "";
    }
    get collection(): string {
        return this.getAttribute("collection") ?? "";
    }

    private render(): void {
        const root = this.shadowRoot!;
        const item = root.querySelector<HTMLElement>(".item")!;
        if (this.collection) {
            item.setAttribute("role", "button");
            item.tabIndex = 0;
        } else {
            item.removeAttribute("role");
            item.removeAttribute("tabindex");
        }
        setText(root, "[data-title]", this.getAttribute("title") ?? "");
        const subtitle = this.getAttribute("subtitle") ?? "";
        setText(root, "[data-subtitle]", subtitle);
        root.querySelector<HTMLElement>("[data-subtitle]")!.hidden = !subtitle;
        const badge = this.getAttribute("badge") ?? "";
        setText(root, "[data-badge]", badge);
        root.querySelector<HTMLElement>("[data-badge]")!.hidden = !badge;
        const icon = this.getAttribute("icon");
        const iconRoot = root.querySelector<HTMLElement>("[data-icon]")!;
        iconRoot.hidden = !icon;
        if (icon) {
            renderIcon(iconRoot, undefined, icon, "tag");
        }
        root.querySelector<HTMLElement>("[data-handle]")!.hidden = !this.hasAttribute("reorderable");
        root.querySelector<HTMLElement>("[data-handle]")!.draggable = this.hasAttribute("reorderable");
        root.querySelector<HTMLElement>("[data-chevron]")!.hidden = !this.collection;
    }

    private onClick = (event: Event): void => {
        if ((event.target as Element | null)?.closest("[data-handle]")) {
            return;
        }
        this.select();
    };

    private onKeydown = (event: Event): void => {
        if (!(event instanceof KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) {
            return;
        }
        event.preventDefault();
        this.select();
    };

    private select(): void {
        if (this.collection && this.rowKey) {
            emitWidgetEvent(this, WIDGET_ROW_SELECT_EVENT, { collection: this.collection, rowKey: this.rowKey });
        }
    }
}

if (!customElements.get("cms-dashboard-w-navigation-item")) {
    customElements.define("cms-dashboard-w-navigation-item", DashboardWNavigationItem);
}

function setText(root: ParentNode, selector: string, value: string): void {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) {
        element.textContent = value;
    }
}
