type ExplicitDefault = { name: string; value: string; hasValue: boolean };
type DefaultRow = { attribute: string; label: string; value: string };
type DefaultGroup = { label: string; rows: DefaultRow[] };

/** Displays explicit attribute defaults from the insertion markup. */
export class BlocDefaults extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["values"];
    }

    connectedCallback(): void {
        this.sync();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.sync();
        }
    }

    private sync(): void {
        const explicit = parseExplicitDefaults(this.getAttribute("values"));
        this.render(explicitDefaults(explicit));
    }

    private render(groups: DefaultGroup[]): void {
        this.replaceChildren();
        this.hidden = groups.length === 0;
        this.closest<HTMLElement>("[data-bloc-defaults-section]")?.toggleAttribute("hidden", groups.length === 0);
        this.dispatchEvent(new CustomEvent("cms-shell-detail-region-change", { bubbles: true, composed: true }));
        if (groups.length === 0) {
            return;
        }
        for (const [index, group] of groups.entries()) {
            const details = document.createElement("details");
            details.className = "bloc-defaults-group";
            details.open = index === 0;
            const summary = document.createElement("summary");
            const label = document.createElement("span");
            const count = document.createElement("span");
            label.textContent = group.label;
            count.className = "bloc-defaults-group-count";
            count.textContent = String(group.rows.length);
            summary.append(label, count);
            details.append(summary, renderRows(group.rows));
            this.append(details);
        }
    }
}

function renderRows(rows: DefaultRow[]): HTMLElement {
    const list = document.createElement("dl");
    list.className = "bloc-defaults";
    for (const row of rows) {
        const item = document.createElement("div");
        const term = document.createElement("dt");
        const value = document.createElement("dd");
        const display = document.createElement("span");
        term.textContent = row.label;
        display.className = "bloc-default-value";
        display.textContent = row.value;
        value.append(display);
        item.append(term, value);
        list.append(item);
    }
    return list;
}

function explicitDefaults(explicit: ExplicitDefault[]): DefaultGroup[] {
    if (explicit.length === 0) {
        return [];
    }
    return [
        {
            label: "Attributes",
            rows: explicit.map((attribute) => ({
                attribute: attribute.name,
                label: humanize(attribute.name),
                value: displayExplicitValue(attribute),
            })),
        },
    ];
}

function parseExplicitDefaults(value: string | null): ExplicitDefault[] {
    if (!value || value.includes("{{")) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter(
                  (item): item is ExplicitDefault =>
                      typeof item?.name === "string" &&
                      typeof item.value === "string" &&
                      typeof item.hasValue === "boolean",
              )
            : [];
    } catch {
        return [];
    }
}

function displayExplicitValue(attribute: ExplicitDefault): string {
    if (!attribute.hasValue || attribute.value === "true") {
        return "On";
    }
    if (attribute.value === "false") {
        return "Off";
    }
    return attribute.value || "Empty";
}

function humanize(value: string): string {
    const label = value.replaceAll("-", " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
}

if (!customElements.get("cms-bloc-defaults")) {
    customElements.define("cms-bloc-defaults", BlocDefaults);
}
