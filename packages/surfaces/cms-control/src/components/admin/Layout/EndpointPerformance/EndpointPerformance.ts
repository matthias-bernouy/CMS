import type { EndpointPerformanceQuery, EndpointPerformanceSort } from "@bernouy/cms-analytics";
import dashboardCss from "../Analytics/styles/dashboard.css" with { type: "text" };
import dataCss from "../Analytics/styles/data.css" with { type: "text" };
import statesCss from "../Analytics/styles/states.css" with { type: "text" };
import { fetchEndpointPerformance, readEndpointPerformanceQuery, replaceEndpointPerformanceQuery } from "./api";
import { readEndpointPerformanceFilters, syncEndpointPerformanceFilters } from "./filters";
import { renderEndpointPerformanceDashboard } from "./rendering/dashboard";
import chartCss from "./styles/chart.css" with { type: "text" };
import layoutCss from "./styles/layout.css" with { type: "text" };
import tableCss from "./styles/table.css" with { type: "text" };
import templateHtml from "./template.html" with { type: "text" };

export class CmsEndpointPerformance extends HTMLElement {
    private initialized = false;
    private request: AbortController | null = null;
    private queryState = readEndpointPerformanceQuery();

    connectedCallback(): void {
        if (!this.initialized) {
            this.mount();
            this.initialized = true;
        }
        this.queryState = readEndpointPerformanceQuery();
        this.syncFilters();
        window.addEventListener("popstate", this.handlePopState);
        void this.load();
    }

    disconnectedCallback(): void {
        this.request?.abort();
        this.request = null;
        window.removeEventListener("popstate", this.handlePopState);
    }

    private mount(): void {
        const style = document.createElement("style");
        const template = document.createElement("template");
        style.textContent = [dashboardCss, dataCss, statesCss, layoutCss, tableCss, chartCss].join("\n");
        template.innerHTML = templateHtml as unknown as string;
        this.replaceChildren(style, template.content.cloneNode(true));
        this.query<HTMLFormElement>("[data-filters]").addEventListener("submit", this.applyFilters);
        this.query<HTMLButtonElement>("[data-reset]").addEventListener("click", this.resetFilters);
        this.query<HTMLButtonElement>("[data-retry]").addEventListener("click", () => void this.load());
        this.query<HTMLButtonElement>("[data-clear-endpoint]").addEventListener("click", () => {
            const queryState = { ...this.queryState };
            delete queryState.endpointUrn;
            void this.updateQuery(queryState);
        });
    }

    private async load(): Promise<void> {
        this.request?.abort();
        const request = new AbortController();
        const queryState = this.queryState;
        this.request = request;
        this.show("loading");
        try {
            const data = await fetchEndpointPerformance(queryState, request.signal);
            if (this.request !== request) {
                return;
            }
            renderEndpointPerformanceDashboard(this, data, queryState, {
                select: (endpointUrn) => {
                    void this.updateQuery({ ...this.queryState, endpointUrn });
                },
                sort: (sort) => {
                    void this.sortBy(sort);
                },
            });
            this.show("ready");
        } catch (error) {
            if (this.request === request && !isAbortError(error)) {
                this.show("unavailable");
            }
        } finally {
            if (this.request === request) {
                this.request = null;
            }
        }
    }

    private applyFilters = (event: SubmitEvent): void => {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const queryState = readEndpointPerformanceFilters(form, this.queryState);
        if (queryState) {
            void this.updateQuery(queryState);
        }
    };

    private resetFilters = (): void => {
        void this.updateQuery({
            range: this.queryState.range,
            sort: this.queryState.sort,
            order: this.queryState.order,
            limit: this.queryState.limit,
        });
    };

    private sortBy(sort: EndpointPerformanceSort): Promise<void> {
        const order = this.queryState.sort === sort && this.queryState.order === "desc" ? "asc" : "desc";
        return this.updateQuery({ ...this.queryState, sort, order });
    }

    private async updateQuery(queryState: EndpointPerformanceQuery): Promise<void> {
        this.queryState = queryState;
        replaceEndpointPerformanceQuery(queryState);
        this.syncFilters();
        await this.load();
    }

    private syncFilters(): void {
        syncEndpointPerformanceFilters(this.query<HTMLFormElement>("[data-filters]"), this.queryState);
    }

    private show(state: "loading" | "ready" | "unavailable"): void {
        for (const element of Array.from(this.querySelectorAll<HTMLElement>("[data-view-state]"))) {
            element.hidden = element.dataset.viewState !== state;
        }
        this.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    }

    private handlePopState = (): void => {
        this.queryState = readEndpointPerformanceQuery();
        this.syncFilters();
        void this.load();
    };

    private query<T extends Element>(selector: string): T {
        const element = this.querySelector(selector);
        if (!element) {
            throw new Error(`Missing endpoint performance element: ${selector}`);
        }
        return element as T;
    }
}

if (!customElements.get("cms-endpoint-performance")) {
    customElements.define("cms-endpoint-performance", CmsEndpointPerformance);
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
