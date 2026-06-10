import { Component } from "@bernouy/components/base";
import { fetchJson } from "../dataviz";
import { formatValue } from "../charts";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

/**
 * <p9r-stat url field label format(int|ms|pct) empty> — fetches one JSON object and shows
 * its `field` as a big formatted number. Empty/failed fetch → "—" + a muted note.
 */
export class Stat extends Component {
    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const root = this.shadowRoot!;
        (root.querySelector(".label") as HTMLElement).textContent = this.getAttribute("label") ?? "";
        void this._load(root);
    }

    private async _load(root: ShadowRoot): Promise<void> {
        const value = root.querySelector(".value") as HTMLElement;
        const note = root.querySelector(".note") as HTMLElement;
        const url = this.getAttribute("url");
        const data = url ? await fetchJson(url) : null;
        const raw = data && typeof data === "object"
            ? (data as Record<string, unknown>)[this.getAttribute("field") ?? "value"]
            : undefined;
        if (raw === undefined || raw === null) {
            value.textContent = "—";
            value.classList.add("is-empty");
            note.textContent = this.getAttribute("empty") ?? "Aucune donnée";
            return;
        }
        value.classList.remove("is-empty");
        value.textContent = formatValue(Number(raw), this.getAttribute("format") ?? "int");
        note.textContent = "";
    }
}
