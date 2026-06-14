import type { DataField } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../runtime";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type DataSourcePickerSourceParamValue =
    | { from: "queryParam"; name: string }
    | { from: "raw"; value: string };

export type DataSourcePickerSourceBinding = {
    url: string;
    alias?: string;
    params?: Record<string, DataSourcePickerSourceParamValue>;
};

export type DataSourcePickerSelectDetail = {
    source: EditorDataSource;
    binding: DataSourcePickerSourceBinding;
};

export const DATA_SOURCE_PICKER_SELECT_EVENT = "editor-v2:data-source-select";
export const DATA_SOURCE_PICKER_REMOVE_EVENT = "editor-v2:data-source-remove";

export class DataSourcePicker extends HTMLElement {
    private _sources: EditorDataSource[] = [];
    private _activeProvider = "";
    private _activeSource: EditorDataSource | null = null;
    private _canRemove = false;

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

    open(sources: EditorDataSource[], contextLabel?: string, options: { canRemove?: boolean } = {}): void {
        this._sources = sources.map(source => ({
            ...source,
            fields: [...source.fields],
        }));
        this._activeProvider = this._providerGroups()[0]?.key ?? "";
        this._activeSource = null;
        this._canRemove = options.canRemove === true;
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
        this._renderBinding();
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
                this._renderBinding();
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

        const heading = document.createElement("div");
        heading.className = "details-eyebrow";
        heading.textContent = "Response fields";

        this.details.append(heading, this._renderFields(this._activeSource.fields));
    }

    private _renderBinding(): void {
        this.binding.replaceChildren();

        if (!this._activeSource) {
            const empty = document.createElement("div");
            empty.className = "details-empty";
            empty.textContent = "Select a source to configure its binding.";
            this.binding.append(empty);
            return;
        }

        const title = document.createElement("div");
        title.className = "config-heading";
        title.textContent = "Binding";

        const config = this._renderBindingConfig(this._activeSource);
        const scroll = document.createElement("div");
        scroll.className = "binding-scroll";
        scroll.append(title, config);

        const insert = document.createElement("button");
        insert.className = "insert";
        insert.type = "button";
        insert.textContent = "Use source";
        insert.addEventListener("click", () => this._select(this._activeSource!));
        const footer = document.createElement("footer");
        footer.className = "binding-footer";

        if (this._canRemove) {
            const remove = document.createElement("button");
            remove.className = "remove-source";
            remove.type = "button";
            remove.textContent = "Remove source";
            remove.addEventListener("click", this._remove);
            footer.append(remove);
        }
        footer.append(insert);

        this.binding.append(scroll, footer);
    }

    private _renderBindingConfig(source: EditorDataSource): HTMLElement {
        const section = document.createElement("section");
        section.className = "binding-config";

        const aliasLabel = document.createElement("label");
        aliasLabel.textContent = "Alias";
        const alias = document.createElement("input");
        alias.className = "source-alias";
        alias.value = "data";
        alias.placeholder = "data";
        aliasLabel.append(alias);
        section.append(aliasLabel);

        const params = source.params ?? [];
        if (params.length === 0) return section;

        const heading = document.createElement("div");
        heading.className = "config-heading";
        heading.textContent = "Request params";
        section.append(heading);

        for (const param of params) {
            const row = document.createElement("div");
            row.className = "param-row";
            row.dataset.paramName = param.name;

            const header = document.createElement("div");
            header.className = "param-header";
            const name = document.createElement("span");
            name.className = "param-name";
            name.textContent = param.required ? `${param.name} *` : param.name;
            const meta = document.createElement("span");
            meta.className = "param-meta";
            const location = document.createElement("span");
            location.textContent = param.in;
            const type = document.createElement("span");
            type.textContent = param.type ?? "unknown";
            meta.append(location, type);
            header.append(name, meta);

            const description = document.createElement("p");
            description.textContent = param.description ?? "";
            description.hidden = !param.description;

            const controls = document.createElement("div");
            controls.className = "param-controls";

            const mode = document.createElement("select");
            mode.className = "param-mode";
            const queryParamOption = document.createElement("option");
            queryParamOption.value = "queryParam";
            queryParamOption.textContent = "Query param";
            const rawOption = document.createElement("option");
            rawOption.value = "raw";
            rawOption.textContent = "Raw value";
            mode.append(queryParamOption, rawOption);

            const value = document.createElement("input");
            value.className = "param-value";
            value.placeholder = param.name;

            controls.append(mode, value);
            row.append(header, description, controls);
            section.append(row);
        }

        return section;
    }

    private _renderFields(fields: DataField[]): HTMLElement {
        const list = document.createElement("ul");
        list.className = "fields";

        for (const field of fields) list.append(this._renderField(field, 0));

        if (list.children.length === 0) {
            const empty = document.createElement("p");
            empty.className = "details-empty";
            empty.textContent = "No schema fields declared.";
            return empty;
        }

        return list;
    }

    private _renderField(field: DataField, depth: number): HTMLElement {
        const item = document.createElement("li");
        item.className = "field";
        item.style.setProperty("--field-depth", String(depth));

        const path = document.createElement("span");
        path.className = "field-path";
        path.textContent = field.path;
        const type = document.createElement("span");
        type.className = "field-type";
        type.textContent = field.type ?? "unknown";
        item.append(path, type);

        if (field.children?.length) {
            const children = document.createElement("ul");
            children.className = "field-children";
            for (const child of field.children) children.append(this._renderField(child, depth + 1));
            item.append(children);
        }

        return item;
    }

    private _select(source: EditorDataSource): void {
        this.dispatchEvent(new CustomEvent<DataSourcePickerSelectDetail>(DATA_SOURCE_PICKER_SELECT_EVENT, {
            bubbles: true,
            composed: true,
            detail: {
                source,
                binding: this._sourceBinding(source),
            },
        }));
        this.close();
    }

    private readonly _remove = (): void => {
        this.dispatchEvent(new CustomEvent(DATA_SOURCE_PICKER_REMOVE_EVENT, {
            bubbles: true,
            composed: true,
        }));
        this.close();
    };

    private _sourceBinding(source: EditorDataSource): DataSourcePickerSourceBinding {
        const alias = this.shadowRoot!.querySelector<HTMLInputElement>(".source-alias")?.value.trim();
        const params: Record<string, DataSourcePickerSourceParamValue> = {};

        for (const row of Array.from(this.shadowRoot!.querySelectorAll(".param-row")) as HTMLElement[]) {
            const name = row.dataset.paramName;
            const modeElement = row.querySelector(".param-mode") as HTMLSelectElement | null;
            const mode = modeElement?.getAttribute("value") ?? modeElement?.value;
            const rawValue = (row.querySelector(".param-value") as HTMLInputElement | null)?.value.trim();
            if (!name || !rawValue) continue;

            params[name] = mode === "raw"
                ? { from: "raw", value: rawValue }
                : { from: "queryParam", name: rawValue };
        }

        return {
            url: source.url,
            ...(alias ? { alias } : {}),
            ...(Object.keys(params).length ? { params } : {}),
        };
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

    private get binding(): HTMLElement {
        return this.shadowRoot!.querySelector(".binding")!;
    }
}

if (!customElements.get("cms-editor-v2-data-source-picker")) {
    customElements.define("cms-editor-v2-data-source-picker", DataSourcePicker);
}
