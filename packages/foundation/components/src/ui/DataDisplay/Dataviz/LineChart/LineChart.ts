import { Component } from "@bernouy/components/base";
import { fetchJson } from "../dataviz";
import { lineSvg, fmtDate, emptyHtml, type Point } from "../charts";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

/**
 * <p9r-line-chart url value(field) x(field) empty-title empty-hint> — fetches a JSON array
 * and renders an area+line+dots SVG of `value` over `x` (x labels formatted as dates).
 */
export class LineChart extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        void this._load();
    }

    private async _load(): Promise<void> {
        const box = this.shadowRoot!.querySelector(".chart") as HTMLElement;
        const url = this.getAttribute("url");
        const data = url ? await fetchJson(url) : null;
        const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        if (rows.length === 0) {
            box.innerHTML = emptyHtml(
                this.getAttribute("empty-title") ?? "Aucune donnée à afficher",
                this.getAttribute("empty-hint") ?? undefined,
            );
            return;
        }
        const yf = this.getAttribute("value") ?? "value";
        const xf = this.getAttribute("x") ?? "";
        const points: Point[] = rows.map((r) => ({
            label: xf ? fmtDate(String(r[xf] ?? "")) : "",
            value: Number(r[yf] ?? 0),
        }));
        box.innerHTML = lineSvg(points);
    }
}
