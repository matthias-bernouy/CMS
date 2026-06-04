import { Component } from "@bernouy/cms-blocs/base";
import { esc } from "../charts";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

/**
 * <p9r-range-tabs param="range" default="7d" tabs="24h:24 h,7d:7 jours,30d:30 jours"> —
 * a segmented selector; clicking a tab sets ?param=value and reloads (active tab marked).
 */
export class RangeTabs extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const param = this.getAttribute("param") ?? "range";
        const current = new URLSearchParams(window.location.search).get(param) ?? this.getAttribute("default") ?? "";
        const tabs = (this.getAttribute("tabs") ?? "").split(",").map((t) => t.split(":")).filter((p) => p[0]);
        const box = this.shadowRoot!.querySelector(".tabs") as HTMLElement;
        box.innerHTML = tabs
            .map(([v, label]) => `<button type="button" data-v="${esc(v!)}"${v === current ? ' class="active"' : ""}>${esc(label ?? v!)}</button>`)
            .join("");
        box.addEventListener("click", (e) => {
            const v = (e.target as HTMLElement).closest("button")?.dataset.v;
            if (!v) return;
            const url = new URL(window.location.href);
            url.searchParams.set(param, v);
            window.location.assign(url.toString());
        });
    }
}
