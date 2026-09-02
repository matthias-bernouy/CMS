import { renderIcon } from "../../Resources/Dashboards/navigation/icons";
import css from "./admin.css" with { type: "text" };

const STYLE_ID = "cms-dashboard-admin-styles";

export class CmsDashboardAdminStyles extends HTMLElement {
    connectedCallback(): void {
        this.ownerDocument.addEventListener("click", this.onClick);
        this.ownerDocument.addEventListener("cms-source:success", this.onSourceSuccess as EventListener);
        if (this.ownerDocument.getElementById(STYLE_ID)) {
            return;
        }
        const style = this.ownerDocument.createElement("style");
        style.id = STYLE_ID;
        style.textContent = css as unknown as string;
        this.ownerDocument.head.append(style);
    }

    disconnectedCallback(): void {
        this.ownerDocument.removeEventListener("click", this.onClick);
        this.ownerDocument.removeEventListener("cms-source:success", this.onSourceSuccess as EventListener);
    }

    private readonly onClick = (event: Event): void => {
        const action = (event.target as Element | null)?.closest("[data-dashboard-close-modal]");
        const modal = action?.closest<HTMLElement & { hide?: () => void }>("p9r-modal");
        modal?.hide?.();
    };

    private readonly onSourceSuccess = (event: CustomEvent<{ body?: unknown }>): void => {
        const Form = this.ownerDocument.defaultView?.HTMLFormElement;
        const form = event
            .composedPath()
            .find((entry): entry is HTMLFormElement => Boolean(Form && entry instanceof Form));
        if (!form || form.getAttribute("id") !== "dashboard-settings-form") {
            return;
        }
        const dashboard = event.detail.body as { meta?: { name?: unknown; icon?: unknown; svg?: unknown } } | undefined;
        const name = dashboard?.meta?.name ?? (form.elements.namedItem("name") as { value?: unknown } | null)?.value;
        if (typeof name === "string") {
            const title = this.ownerDocument.querySelector<HTMLElement>("[data-dashboard-detail-name]");
            if (title) {
                title.textContent = name;
            }
        }
        const icon = this.ownerDocument.querySelector<HTMLElement>("[data-dashboard-detail-icon]");
        const iconName =
            dashboard?.meta?.icon ?? (form.elements.namedItem("icon") as { value?: unknown } | null)?.value;
        if (icon && typeof iconName === "string") {
            icon.setAttribute("icon", iconName);
            const svg = dashboard?.meta?.svg;
            icon.setAttribute("svg", typeof svg === "string" ? svg : "");
        }
    };
}

export class CmsDashboardIcon extends HTMLElement {
    static observedAttributes = ["icon", "svg"];

    connectedCallback(): void {
        this.render();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.render();
        }
    }

    private render(): void {
        renderIcon(this, this.getAttribute("svg") ?? undefined, this.getAttribute("icon") ?? undefined, "layout");
    }
}

export class CmsDashboardAdminNav extends HTMLElement {
    private observer: MutationObserver | null = null;

    connectedCallback(): void {
        this.observer = new MutationObserver(() => this.sync());
        this.observe();
        window.addEventListener("popstate", this.sync);
        this.addEventListener("click", this.onClick);
        this.addEventListener("keydown", this.onKeydown);
        queueMicrotask(this.sync);
    }

    disconnectedCallback(): void {
        this.observer?.disconnect();
        this.observer = null;
        window.removeEventListener("popstate", this.sync);
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("keydown", this.onKeydown);
    }

    private readonly sync = (): void => {
        this.observer?.disconnect();
        const items = Array.from(this.querySelectorAll<HTMLElement>("[data-dashboard-id]"));
        const selectedId = new URL(window.location.href).searchParams.get("id") || items[0]?.dataset.dashboardId || "";
        for (const item of items) {
            item.toggleAttribute("active", item.dataset.dashboardId === selectedId);
        }
        this.observe();
    };

    private observe(): void {
        this.observer?.observe(this, { childList: true, subtree: true });
    }

    private readonly onClick = (event: Event): void => {
        const item = (event.target as Element | null)?.closest<HTMLElement>("[data-dashboard-href]");
        if (item?.dataset.dashboardHref) {
            window.location.assign(item.dataset.dashboardHref);
        }
    };

    private readonly onKeydown = (event: KeyboardEvent): void => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        const item = (event.target as Element | null)?.closest<HTMLElement>("[data-dashboard-href]");
        if (!item?.dataset.dashboardHref) {
            return;
        }
        event.preventDefault();
        window.location.assign(item.dataset.dashboardHref);
    };
}
