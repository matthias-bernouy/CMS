import template from "./template.html" with { type: "text" };
import { handleClick, openSetup as renderSetupError } from "./ui/actions/index";
import { renderBrowser } from "./ui/browser";
import { disconnectBoundSources, startBoundSources, waitForBoundData } from "./ui/data";
import styles from "./ui/styles";
import { currentIntegrationRoute, pushIntegrationRoute, replaceIntegrationRoute } from "./api";
import type {
    BoundDataWaiter,
    BrowserTab,
    IntegrationBrowserHost,
    IntegrationDefinition,
    IntegrationInstallationRow,
} from "./model";
import { renderDetail } from "./ui/detail";
import { renderSetup } from "./ui/setup";

export class IntegrationBrowser extends HTMLElement implements IntegrationBrowserHost {
    definitions: IntegrationDefinition[] = [];
    installations: IntegrationInstallationRow[] = [];
    activeDefinition: IntegrationDefinition | null = null;
    definitionsLoaded = false;
    installationsLoaded = false;
    observer: MutationObserver | null = null;
    waiters: BoundDataWaiter[] = [];
    tab: BrowserTab = "installed";
    selectedIntegrationId = "";
    private initialized = false;

    connectedCallback(): void {
        if (!this.initialized) {
            this.mountTemplate();
            this.bind();
            startBoundSources(this);
            window.addEventListener("popstate", this.onPopState);
            this.initialized = true;
        } else if (!this.observer) {
            startBoundSources(this);
        }
    }

    disconnectedCallback(): void {
        disconnectBoundSources(this);
        window.removeEventListener("popstate", this.onPopState);
    }

    renderAll(): void {
        renderBrowser(this);
        this.renderRoute();
    }

    setTab(tab: BrowserTab): void {
        this.tab = tab;
        this.query<HTMLElement>("[data-installed-view]").hidden = tab !== "installed";
        this.query<HTMLElement>("[data-catalogue-view]").hidden = tab !== "catalogue";
        for (const item of Array.from(this.querySelectorAll<HTMLElement>("[data-tab]"))) {
            item.classList.toggle("is-active", item.dataset.tab === tab);
        }
    }

    openDetail(integrationId: string): void {
        pushIntegrationRoute({ view: "installation", id: integrationId });
        this.renderRoute();
    }

    openSetup(
        definition: IntegrationDefinition,
        options: { answers?: Record<string, unknown>; error?: string; resources?: readonly string[] } = {},
    ): void {
        if (options.answers || options.error) {
            renderSetupError(this, definition, options);
            return;
        }
        pushIntegrationRoute({ view: "setup", kind: definition.kind });
        this.renderRoute();
    }

    closeDetail(): void {
        pushIntegrationRoute({ view: "list", tab: this.tab });
        this.renderRoute();
    }

    waitForBoundData(predicate: () => boolean, timeoutMs?: number): Promise<void> {
        return waitForBoundData(this, predicate, timeoutMs);
    }

    query<T extends Element>(selector: string): T {
        const element = this.querySelector(selector);
        if (!element) {
            throw new Error(`Missing element: ${selector}`);
        }
        return element as T;
    }

    private bind(): void {
        this.addEventListener("click", (event) => void handleClick(this, event));
    }

    private renderRoute(): void {
        const route = currentIntegrationRoute();
        if (route.view === "installation") {
            return this.showInstallation(route.id);
        }
        if (route.view === "setup") {
            return this.showSetup(route.kind);
        }
        this.showList(route.tab);
    }

    private showList(tab: BrowserTab): void {
        this.selectedIntegrationId = "";
        this.activeDefinition = null;
        this.query<HTMLElement>("[data-detail-view]").replaceChildren();
        this.query<HTMLElement>("[data-detail-view]").hidden = true;
        this.query<HTMLElement>("[data-browser]").hidden = false;
        this.setTab(tab);
    }

    private showInstallation(integrationId: string): void {
        if (!this.installations.some((installation) => installation.id === integrationId)) {
            replaceIntegrationRoute({ view: "list", tab: "installed" });
            this.showList("installed");
            return;
        }
        this.activeDefinition = null;
        this.selectedIntegrationId = integrationId;
        this.query<HTMLElement>("[data-browser]").hidden = true;
        this.query<HTMLElement>("[data-detail-view]").hidden = false;
        this.tab = "installed";
        renderDetail(this);
    }

    private showSetup(kind: string): void {
        const definition = this.definitions.find((item) => item.kind === kind);
        if (!definition) {
            replaceIntegrationRoute({ view: "list", tab: "catalogue" });
            this.showList("catalogue");
            return;
        }
        this.activeDefinition = definition;
        this.selectedIntegrationId = "";
        this.query<HTMLElement>("[data-browser]").hidden = true;
        this.query<HTMLElement>("[data-detail-view]").hidden = false;
        this.tab = "catalogue";
        renderSetup(this, definition);
    }

    private onPopState = (): void => this.renderAll();

    private mountTemplate(): void {
        const style = document.createElement("style");
        style.textContent = styles;
        const body = document.createElement("template");
        body.innerHTML = template as unknown as string;
        this.replaceChildren(style, body.content.cloneNode(true));
    }
}

if (!customElements.get("cms-integrations-admin")) {
    customElements.define("cms-integrations-admin", IntegrationBrowser);
}
