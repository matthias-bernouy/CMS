import { Component } from "@bernouy/components/base";
import { emitWidgetEvent, setP9rButtonLabel, setP9rButtonTone, setText, WIDGET_ACTION_EVENT } from "../shared";
import "./WNavigationItem";
import type { DashboardWNavigationItem } from "./WNavigationItem";
import { navigationDragItem } from "./drag";
import { parseNavigationListWidget, type NavigationListWidget } from "./config";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardWNavigationList extends Component {
    private value: NavigationListWidget | null = null;
    private dragging: DashboardWNavigationItem | null = null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    static get observedAttributes(): string[] {
        return ["data-config-json"];
    }
    attributeChangedCallback(): void {
        this.syncConfig();
        if (this.isConnected) {
            this.render();
        }
    }

    override connectedCallback(): void {
        this.shadowRoot!.querySelector<HTMLSlotElement>("slot")?.addEventListener("slotchange", this.onSlotChange);
        this.shadowRoot!.addEventListener("click", this.onActionClick);
        this.addEventListener("dragstart", this.onDragStart);
        this.addEventListener("dragover", this.onDragOver);
        this.addEventListener("drop", this.onDrop);
        this.addEventListener("dragend", this.onDragEnd);
        this.syncConfig();
        this.render();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.querySelector<HTMLSlotElement>("slot")?.removeEventListener("slotchange", this.onSlotChange);
        this.shadowRoot?.removeEventListener("click", this.onActionClick);
        this.removeEventListener("dragstart", this.onDragStart);
        this.removeEventListener("dragover", this.onDragOver);
        this.removeEventListener("drop", this.onDrop);
        this.removeEventListener("dragend", this.onDragEnd);
    }

    private syncConfig(): void {
        const widget = parseNavigationListWidget(this.dataset.configJson ?? "");
        if (widget) {
            this.value = widget;
        }
    }

    private render(): void {
        const widget = this.value;
        if (!widget) {
            return;
        }
        setText(this.shadowRoot!, "[data-title]", widget.title ?? "");
        this.query<HTMLElement>("[data-header]").hidden = !widget.title && !this.visibleActions().length;
        this.query<HTMLElement>("[data-actions]").replaceChildren(
            ...this.visibleActions().map((action) => {
                const button = document.createElement("p9r-button");
                button.dataset.action = action.id;
                button.dataset.widget = widget.id;
                if (action.selection?.opens) {
                    button.dataset.target = action.selection.opens;
                }
                if (action.confirm) {
                    button.dataset.confirm = action.confirm;
                }
                setP9rButtonTone(button, action.tone ?? "primary");
                setP9rButtonLabel(button, action.label);
                return button;
            }),
        );
        this.syncItems();
    }

    private visibleActions() {
        return (this.value?.actions ?? []).filter((action) => action.id !== this.value?.reorderable?.action);
    }

    private syncItems(): void {
        this.query<HTMLElement>("[data-empty]").hidden = this.items().length > 0;
    }

    private onSlotChange = (): void => this.syncItems();

    private onActionClick = (event: Event): void => {
        const target = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
        if (!target?.dataset.action) {
            return;
        }
        if (target.dataset.confirm && !window.confirm(target.dataset.confirm)) {
            return;
        }
        emitWidgetEvent(this, WIDGET_ACTION_EVENT, {
            action: target.dataset.action,
            widget: target.dataset.widget,
            target: target.dataset.target,
        });
    };

    private onDragStart = (event: DragEvent): void => {
        const item = navigationDragItem(event);
        if (!item || !this.value?.reorderable) {
            return;
        }
        this.dragging = item;
        item.toggleAttribute("data-dragging", true);
        event.dataTransfer?.setData("text/plain", item.rowKey);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
    };

    private onDragOver = (event: DragEvent): void => {
        const item = navigationDragItem(event);
        if (!item || !this.dragging || item === this.dragging) {
            return;
        }
        event.preventDefault();
        this.items().forEach((candidate) => candidate.toggleAttribute("data-drop-target", candidate === item));
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
    };

    private onDrop = (event: DragEvent): void => {
        const target = navigationDragItem(event);
        const dragging = this.dragging;
        if (!target || !dragging || target === dragging || !this.value?.reorderable) {
            return;
        }
        event.preventDefault();
        const movesDown = Boolean(dragging.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (movesDown) {
            this.insertBefore(dragging, target.nextSibling);
        } else {
            this.insertBefore(dragging, target);
        }
        const value = this.items()
            .map((item) => item.rowKey)
            .filter(Boolean);
        emitWidgetEvent(this, WIDGET_ACTION_EVENT, {
            action: this.value.reorderable.action,
            widget: this.value.id,
            value,
        });
        this.clearDragState();
    };

    private onDragEnd = (): void => this.clearDragState();
    private clearDragState(): void {
        this.dragging = null;
        this.items().forEach((item) => {
            item.removeAttribute("data-dragging");
            item.removeAttribute("data-drop-target");
        });
    }
    private items(): DashboardWNavigationItem[] {
        return Array.from(this.querySelectorAll<DashboardWNavigationItem>("cms-dashboard-w-navigation-item"));
    }
    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboard-w-navigation-list")) {
    customElements.define("cms-dashboard-w-navigation-list", DashboardWNavigationList);
}
