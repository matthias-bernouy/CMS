import { currentAnalyticsRange, fetchAnalyticsDashboard, type AnalyticsView, ANALYTICS_VIEWS } from "./api";
import { renderAnalyticsDashboard } from "./rendering/dashboard";
import dashboardCss from "./styles/dashboard.css" with { type: "text" };
import dataCss from "./styles/data.css" with { type: "text" };
import statesCss from "./styles/states.css" with { type: "text" };
import chartCss from "./styles/chart.css" with { type: "text" };
import shellTemplate from "./templates/shell.html" with { type: "text" };
import overviewTemplate from "./templates/overview.html" with { type: "text" };
import contentTemplate from "./templates/content.html" with { type: "text" };
import acquisitionTemplate from "./templates/acquisition.html" with { type: "text" };
import healthTemplate from "./templates/health.html" with { type: "text" };

const VIEW_TEMPLATES: Record<AnalyticsView, string> = {
    overview: overviewTemplate as unknown as string,
    content: contentTemplate as unknown as string,
    acquisition: acquisitionTemplate as unknown as string,
    health: healthTemplate as unknown as string,
};

export class CmsAnalyticsDashboard extends HTMLElement {
    private initialized = false;
    private request: AbortController | null = null;

    connectedCallback(): void {
        if (!this.initialized) {
            this.mount();
            this.initialized = true;
        }
        void this.load();
    }

    disconnectedCallback(): void {
        this.request?.abort();
        this.request = null;
    }

    private mount(): void {
        const style = document.createElement("style");
        style.textContent = [
            dashboardCss as unknown as string,
            dataCss as unknown as string,
            statesCss as unknown as string,
            chartCss as unknown as string,
        ].join("\n");
        const shell = document.createElement("template");
        shell.innerHTML = shellTemplate as unknown as string;
        this.replaceChildren(style, shell.content.cloneNode(true));

        const template = document.createElement("template");
        template.innerHTML = VIEW_TEMPLATES[this.view()];
        this.query<HTMLElement>("[data-view-host]").replaceChildren(template.content.cloneNode(true));
        this.query<HTMLButtonElement>("[data-retry]").addEventListener("click", () => void this.load());
    }

    private async load(): Promise<void> {
        this.request?.abort();
        const request = new AbortController();
        this.request = request;
        this.show("loading");
        try {
            const data = await fetchAnalyticsDashboard(this.view(), currentAnalyticsRange(), request.signal);
            if (this.request !== request) {
                return;
            }
            renderAnalyticsDashboard(this, data, currentAnalyticsRange());
            this.show("ready");
        } catch (error) {
            if (this.request === request && !isAbortError(error)) {
                this.show("error");
            }
        } finally {
            if (this.request === request) {
                this.request = null;
            }
        }
    }

    private view(): AnalyticsView {
        const view = this.getAttribute("view") ?? "";
        return ANALYTICS_VIEWS.includes(view as AnalyticsView) ? (view as AnalyticsView) : "overview";
    }

    private show(state: "loading" | "error" | "ready"): void {
        for (const element of Array.from(this.querySelectorAll<HTMLElement>("[data-state]"))) {
            element.hidden = element.dataset.state !== state;
        }
        this.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    }

    private query<T extends Element>(selector: string): T {
        const element = this.querySelector(selector);
        if (!element) {
            throw new Error(`Missing analytics element: ${selector}`);
        }
        return element as T;
    }
}

if (!customElements.get("cms-analytics-dashboard")) {
    customElements.define("cms-analytics-dashboard", CmsAnalyticsDashboard);
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
