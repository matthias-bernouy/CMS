import type { SettingSection } from "@bernouy/cms-content/editor";
import { loadEditorCatalog } from "cms-control/components/editorSystemV2/catalog";

type ExplicitDefault = { name: string; value: string; hasValue: boolean };
type DefaultRow = { attribute: string; label: string; value: string };
type DefaultGroup = { label: string; rows: DefaultRow[] };

/** Displays effective attribute defaults from the insertion markup and editor contract. */
export class BlocDefaults extends HTMLElement {
    private revision = 0;

    static get observedAttributes(): string[] {
        return ["tag", "values"];
    }

    connectedCallback(): void {
        void this.sync();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            void this.sync();
        }
    }

    private async sync(): Promise<void> {
        const revision = ++this.revision;
        const explicit = parseExplicitDefaults(this.getAttribute("values"));
        this.render(mergeDefaults([], explicit));
        const tag = this.getAttribute("tag")?.trim();
        if (!tag || tag.includes("{{")) {
            return;
        }
        try {
            const entry = (await loadEditorCatalog()).find((candidate) => candidate.tag === tag);
            if (revision !== this.revision || !entry) {
                return;
            }
            const sections = new entry.editor(document.createElement(tag)).getSettings();
            this.render(mergeDefaults(sections, explicit));
        } catch (error) {
            console.error(`[collections] Unable to read defaults for ${tag}`, error);
        }
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

function mergeDefaults(sections: SettingSection[], explicit: ExplicitDefault[]): DefaultGroup[] {
    const groups: DefaultGroup[] = [];
    const rows = new Map<string, DefaultRow>();
    for (const section of sections) {
        const group: DefaultGroup = { label: section.label || "Defaults", rows: [] };
        const settings = section.settings.flatMap((setting) => (setting.type === "row" ? setting.settings : [setting]));
        for (const setting of settings) {
            if (setting.defaultValue === undefined) {
                continue;
            }
            const row = {
                attribute: setting.attribute,
                label: setting.label,
                value: displayValue(setting.defaultValue),
            };
            rows.set(setting.attribute, row);
            group.rows.push(row);
        }
        if (group.rows.length > 0) {
            groups.push(group);
        }
    }
    let attributes: DefaultGroup | undefined;
    for (const attribute of explicit) {
        const existing = rows.get(attribute.name);
        if (existing) {
            existing.value = displayExplicitValue(attribute);
            continue;
        }
        attributes ??= { label: "Attributes", rows: [] };
        const row = {
            attribute: attribute.name,
            label: humanize(attribute.name),
            value: displayExplicitValue(attribute),
        };
        rows.set(attribute.name, row);
        attributes.rows.push(row);
    }
    if (attributes) {
        groups.push(attributes);
    }
    return groups;
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

function displayValue(value: string | boolean): string {
    if (value === true || value === "true") {
        return "On";
    }
    if (value === false || value === "false") {
        return "Off";
    }
    return value || "Empty";
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
