import { Component } from "@bernouy/components/base";
import { fetchJson } from "../dataviz";
import { barsHtml, emptyHtml, type Point } from "../charts";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

/**
 * <p9r-bar-list url label-field value-field show-count empty> — fetches a JSON array and
 * renders horizontal bars sized by share of total. `show-count` also prints the raw count.
 */
export class BarList extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        void this._load();
    }

    private async _load(): Promise<void> {
        const box = this.shadowRoot!.querySelector(".list") as HTMLElement;
        const url = this.getAttribute("url");
        const data = url ? await fetchJson(url) : null;
        const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        if (rows.length === 0) {
            box.innerHTML = emptyHtml(this.getAttribute("empty") ?? "Aucune donnée");
            return;
        }
        const lf = this.getAttribute("label-field") ?? "key";
        const vf = this.getAttribute("value-field") ?? "value";
        const points: Point[] = rows.map((r) => ({ label: String(r[lf] ?? ""), value: Number(r[vf] ?? 0) }));
        box.innerHTML = barsHtml(points, this.hasAttribute("show-count"));
    }
}
