import template from "./template.html" with { type: "text" };
import { handleClick, closeDetail, openDetail, openSetup } from "./ui/actions";
import { renderBrowser, renderCatalogue } from "./ui/browser";
import { disconnectBoundSources, startBoundSources, waitForBoundData } from "./ui/data";
import styles from "./ui/styles";
import type {
    BoundDataWaiter,
    BrowserTab,
    IntegrationBrowserHost,
    IntegrationDefinition,
    IntegrationInstanceRow,
} from "./model";

export class IntegrationBrowser extends HTMLElement implements IntegrationBrowserHost {
    definitions: IntegrationDefinition[] = [];
    instances: IntegrationInstanceRow[] = [];
    activeDefinition: IntegrationDefinition | null = null;
    definitionsLoaded = false;
    instancesLoaded = false;
    observer: MutationObserver | null = null;
    waiters: BoundDataWaiter[] = [];
    tab: BrowserTab = "installed";
    selectedInstanceId = "";
    private initialized = false;

    connectedCallback(): void {
        if (!this.initialized) {
            this.mountTemplate();
            this.bind();
            startBoundSources(this);
            this.initialized = true;
        } else if (!this.observer) {
            startBoundSources(this);
        }
    }

    disconnectedCallback(): void {
        disconnectBoundSources(this);
    }

    renderAll(): void {
        renderBrowser(this);
        if (this.selectedInstanceId) openDetail(this, this.selectedInstanceId);
    }

    setTab(tab: BrowserTab): void {
        this.tab = tab;
        this.query<HTMLElement>("[data-installed-view]").hidden = tab !== "installed";
        this.query<HTMLElement>("[data-catalogue-view]").hidden = tab !== "catalogue";
        for (const item of Array.from(this.querySelectorAll<HTMLElement>("[data-tab]"))) {
            item.classList.toggle("is-active", item.dataset.tab === tab);
        }
    }

    openDetail(instanceId: string): void {
        openDetail(this, instanceId);
    }

    openSetup(
        definition: IntegrationDefinition,
        options: { answers?: Record<string, unknown>; error?: string } = {},
    ): void {
        openSetup(this, definition, options);
    }

    closeDetail(): void {
        closeDetail(this);
    }

    waitForBoundData(predicate: () => boolean, timeoutMs?: number): Promise<void> {
        return waitForBoundData(this, predicate, timeoutMs);
    }

    query<T extends Element>(selector: string): T {
        const element = this.querySelector(selector);
        if (!element) throw new Error(`Missing element: ${selector}`);
        return element as T;
    }

    private bind(): void {
        this.query<HTMLInputElement>("[data-search]").addEventListener("input", () => renderCatalogue(this));
        this.query<HTMLSelectElement>("[data-category]").addEventListener("change", () => renderCatalogue(this));
        this.addEventListener("click", (event) => void handleClick(this, event));
    }

    private mountTemplate(): void {
        const style = document.createElement("style");
        style.textContent = styles;
        const body = document.createElement("template");
        body.innerHTML = template as unknown as string;
        this.replaceChildren(style, body.content.cloneNode(true));
    }
}

if (!customElements.get("cms-integrations-admin")) customElements.define("cms-integrations-admin", IntegrationBrowser);
