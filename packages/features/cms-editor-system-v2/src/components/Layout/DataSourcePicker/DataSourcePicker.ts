import type { DataField } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../runtime";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type DataSourcePickerSelectDetail = {
    source: EditorDataSource;
};

export const DATA_SOURCE_PICKER_SELECT_EVENT = "editor-v2:data-source-select";

export class DataSourcePicker extends HTMLElement {
    private _sources: EditorDataSource[] = [];
    private _activeProvider = "";
    private _activeSource: EditorDataSource | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.closeButton.addEventListener("click", this.close);
        this.backdrop.addEventListener("click", this._onBackdropClick);
        this.search.addEventListener("input", this._onSearchInput);
        this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }

    disconnectedCallback(): void {
        this.closeButton.removeEventListener("click", this.close);
        this.backdrop.removeEventListener("click", this._onBackdropClick);
        this.search.removeEventListener("input", this._onSearchInput);
        this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }

    open(sources: EditorDataSource[], contextLabel?: string): void {
        this._sources = sources.map(source => ({
            ...source,
            fields: [...source.fields],
        }));
        this._activeProvider = this._providerGroups()[0]?.key ?? "";
        this._activeSource = null;
        this.subtitle.textContent = contextLabel ? `Choose a data source for ${contextLabel}.` : "Choose a data source.";
        this.search.value = "";
        this.backdrop.hidden = false;
        this._render();
        this.search.focus();
    }

    readonly close = (): void => {
        this.backdrop.hidden = true;
    };

    private _render(): void {
        this._renderProviders();
        this._renderSources();
        this._renderDetails();
    }

    private _renderProviders(): void {
        this.providers.replaceChildren();
        const groups = this._providerGroups();

        if (groups.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No sources available.";
            this.providers.append(empty);
            return;
        }

        for (const group of groups) {
            const button = document.createElement("button");
            button.className = "provider";
            button.type = "button";
            button.ariaPressed = String(group.key === this._activeProvider);
            button.innerHTML = `<span>${this._escape(group.label)}</span><span class="count">${group.count}</span>`;
            button.addEventListener("click", () => {
                this._activeProvider = group.key;
                this._activeSource = null;
                this._render();
            });
            this.providers.append(button);
        }
    }

    private _renderSources(): void {
        this.sourcesList.replaceChildren();
        const sources = this._visibleSources();

        if (sources.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No matching sources.";
            this.sourcesList.append(empty);
            return;
        }

        if (!this._activeSource || !sources.includes(this._activeSource)) {
            this._activeSource = sources[0] ?? null;
        }

        for (const source of sources) {
            const button = document.createElement("button");
            button.className = "source";
            button.type = "button";
            button.ariaSelected = String(source === this._activeSource);

            const name = document.createElement("span");
            name.className = "name";
            name.textContent = source.label;

            const description = document.createElement("span");
            description.className = "description";
            description.textContent = source.description ?? "No description.";

            const url = document.createElement("span");
            url.className = "url";
            url.textContent = source.url;

            button.append(name, description, url);
            button.addEventListener("click", () => {
                this._activeSource = source;
                this._renderSources();
                this._renderDetails();
            });
            button.addEventListener("dblclick", () => this._select(source));
            this.sourcesList.append(button);
        }
    }

    private _renderDetails(): void {
        this.details.replaceChildren();

        if (!this._activeSource) {
            const empty = document.createElement("div");
            empty.className = "details-empty";
            empty.textContent = "Select a source to inspect its schema.";
            this.details.append(empty);
            return;
        }

        const source = this._activeSource;
        const eyebrow = document.createElement("div");
        eyebrow.className = "details-eyebrow";
        eyebrow.textContent = source.providerLabel ?? source.provider ?? "Source";

        const title = document.createElement("h3");
        title.textContent = source.label;

        const description = document.createElement("p");
        description.textContent = source.description ?? "No description.";

        const meta = document.createElement("dl");
        meta.append(
            this._definition("URL", source.url),
            this._definition("Fields", String(this._flattenFields(source.fields).length)),
        );

        const fields = this._renderFields(source.fields);

        const insert = document.createElement("button");
        insert.className = "insert";
        insert.type = "button";
        insert.textContent = "Use source";
        insert.addEventListener("click", () => this._select(source));

        this.details.append(eyebrow, title, description, meta, fields, insert);
    }

    private _renderFields(fields: DataField[]): HTMLElement {
        const list = document.createElement("ul");
        list.className = "fields";

        for (const field of this._flattenFields(fields).slice(0, 8)) {
            const item = document.createElement("li");
            const path = document.createElement("span");
            path.textContent = field.path;
            const type = document.createElement("span");
            type.className = "field-type";
            type.textContent = field.type ?? "unknown";
            item.append(path, type);
            list.append(item);
        }

        if (list.children.length === 0) {
            const empty = document.createElement("p");
            empty.className = "details-empty";
            empty.textContent = "No schema fields declared.";
            return empty;
        }

        return list;
    }

    private _definition(label: string, value: string): HTMLElement {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        row.append(dt, dd);
        return row;
    }

    private _select(source: EditorDataSource): void {
        this.dispatchEvent(new CustomEvent<DataSourcePickerSelectDetail>(DATA_SOURCE_PICKER_SELECT_EVENT, {
            bubbles: true,
            composed: true,
            detail: { source },
        }));
        this.close();
    }

    private _providerGroups(): { key: string; label: string; count: number }[] {
        const groups = new Map<string, { key: string; label: string; count: number }>();

        for (const source of this._filteredSources()) {
            const key = source.provider ?? "default";
            const current = groups.get(key) ?? {
                key,
                label: source.providerLabel ?? source.provider ?? "Sources",
                count: 0,
            };
            current.count += 1;
            groups.set(key, current);
        }

        return [...groups.values()];
    }

    private _visibleSources(): EditorDataSource[] {
        return this._filteredSources().filter(source => (source.provider ?? "default") === this._activeProvider);
    }

    private _filteredSources(): EditorDataSource[] {
        const query = this.search.value.trim().toLowerCase();
        if (!query) return this._sources;

        return this._sources.filter(source => [
            source.label,
            source.description,
            source.provider,
            source.providerLabel,
            source.url,
        ].some(value => value?.toLowerCase().includes(query)));
    }

    private _flattenFields(fields: DataField[], prefix = ""): DataField[] {
        return fields.flatMap(field => {
            const path = prefix && field.path !== "." ? `${prefix}.${field.path}` : field.path === "." ? prefix || "." : field.path;
            const current = { ...field, path };
            return [
                current,
                ...this._flattenFields(field.children ?? [], path),
            ];
        });
    }

    private _escape(value: string): string {
        return value
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;");
    }

    private readonly _onBackdropClick = (event: Event): void => {
        if (event.target === this.backdrop) this.close();
    };

    private readonly _onSearchInput = (): void => {
        this._activeProvider = this._providerGroups()[0]?.key ?? "";
        this._activeSource = null;
        this._render();
    };

    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (!this.backdrop.hidden && event.key === "Escape") this.close();
    };

    private get backdrop(): HTMLElement {
        return this.shadowRoot!.querySelector(".backdrop")!;
    }

    private get closeButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".close")!;
    }

    private get subtitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".subtitle")!;
    }

    private get search(): HTMLInputElement {
        return this.shadowRoot!.querySelector(".search")!;
    }

    private get providers(): HTMLElement {
        return this.shadowRoot!.querySelector(".providers")!;
    }

    private get sourcesList(): HTMLElement {
        return this.shadowRoot!.querySelector(".sources")!;
    }

    private get details(): HTMLElement {
        return this.shadowRoot!.querySelector(".details")!;
    }
}

if (!customElements.get("cms-editor-v2-data-source-picker")) {
    customElements.define("cms-editor-v2-data-source-picker", DataSourcePicker);
}
