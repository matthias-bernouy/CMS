import { Component } from "@bernouy/components/base";
import { ANALYTICS_VIEWS, analyticsViewFromPath, analyticsViewPath, type AnalyticsView } from "./api";
import css from "./styles/nav.css" with { type: "text" };
import template from "./nav.html" with { type: "text" };

export class CmsAnalyticsNav extends Component {
    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.configureLinks();
        this.syncActive();
        window.addEventListener("popstate", this.syncActive);
    }

    disconnectedCallback(): void {
        window.removeEventListener("popstate", this.syncActive);
    }

    private configureLinks(): void {
        for (const item of this.items()) {
            const view = item.dataset.analyticsView ?? "";
            if (isAnalyticsView(view)) {
                item.setAttribute("href", analyticsViewPath(view));
            }
        }
    }

    private syncActive = (): void => {
        const active = analyticsViewFromPath(window.location.pathname);
        for (const item of this.items()) {
            item.toggleAttribute("active", item.dataset.analyticsView === active);
        }
    };

    private items(): HTMLElement[] {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-analytics-view]"));
    }
}

if (!customElements.get("cms-analytics-nav")) {
    customElements.define("cms-analytics-nav", CmsAnalyticsNav);
}

function isAnalyticsView(value: string): value is AnalyticsView {
    return ANALYTICS_VIEWS.includes(value as AnalyticsView);
}
