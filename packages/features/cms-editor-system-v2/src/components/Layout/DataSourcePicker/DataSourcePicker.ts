import type { EditorDataSource } from "../../../runtime";
import {
    sourceForBinding,
    type DataSourcePickerSourceBinding,
} from "./Binding/dataSourceBinding";
import { readSourceBinding } from "./Binding/dataSourceFormReader";
import {
    filteredSources,
    providerGroups,
    type DataSourceProviderGroup,
} from "./State/dataSourceGroups";
import { connectDataSourcePickerEvents } from "./State/dataSourcePickerEvents";
import { renderDataSourcePicker } from "./Renderers/dataSourcePickerRenderer";
import { cloneSources, firstProviderKey, visibleSources } from "./State/dataSourcePickerState";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type { DataSourcePickerSourceBinding, DataSourcePickerSourceParamValue } from "./Binding/dataSourceBinding";

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
    private _initialBinding: DataSourcePickerSourceBinding | null = null;
    private _canRemove = false;
    private _disconnectEvents: (() => void) | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }
    connectedCallback(): void {
        this._disconnectEvents = connectDataSourcePickerEvents({
            closeButton:   this.closeButton,
            backdrop:      this.backdrop,
            search:        this.search,
            ownerDocument: this.ownerDocument,
        }, {
            close:         this.close,
            backdropClick: this._onBackdropClick,
            searchInput:   this._onSearchInput,
            keydown:       this._onKeydown,
        });
    }
    disconnectedCallback(): void {
        this._disconnectEvents?.();
        this._disconnectEvents = null;
    }

    open(
        sources: EditorDataSource[],
        contextLabel?: string,
        options: { canRemove?: boolean; initialBinding?: DataSourcePickerSourceBinding | null } = {},
    ): void {
        this._sources = cloneSources(sources);
        this._initialBinding = options.initialBinding ?? null;
        this._activeSource = sourceForBinding(this._sources, this._initialBinding);
        this._activeProvider = this._activeSource?.provider ?? firstProviderKey(this._sources, this.search.value);
        this._canRemove = options.canRemove === true;
        this.subtitle.textContent = contextLabel ? `Choose a data source for ${contextLabel}.` : "Choose a data source.";
        this.search.value = "";
        this.backdrop.hidden = false;
        this._render();
        this.search.focus();
    }
    readonly close = (): void => { this.backdrop.hidden = true; };
    private _render(): void {
        this._activeSource = renderDataSourcePicker({
            providers:      this.providers,
            sourcesList:    this.sourcesList,
            details:        this.details,
            binding:        this.binding,
            groups:         this._providerGroups(),
            activeProvider: this._activeProvider,
            visibleSources: this._visibleSources(),
            activeSource:   this._activeSource,
            canRemove:      this._canRemove,
            initialBinding: this._initialBinding,
        }, {
            providerSelect: (provider) => {
                this._activeProvider = provider;
                this._activeSource = null;
                this._render();
            },
            sourceSelect: (source) => {
                this._activeSource = source;
                this._render();
            },
            sourceConfirm: (source) => this._select(source),
            bindingSelect: () => this._activeSource && this._select(this._activeSource),
            remove:        this._remove,
        });
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
    private _sourceBinding(source: EditorDataSource): DataSourcePickerSourceBinding { return readSourceBinding(this.shadowRoot!, source); }
    private _providerGroups(): DataSourceProviderGroup[] { return providerGroups(this._filteredSources()); }
    private _visibleSources(): EditorDataSource[] { return visibleSources(this._sources, this.search.value, this._activeProvider); }
    private _filteredSources(): EditorDataSource[] { return filteredSources(this._sources, this.search.value); }
    private readonly _onBackdropClick = (event: Event): void => {
        if (event.target === this.backdrop) this.close();
    };
    private readonly _onSearchInput = (): void => {
        this._activeProvider = firstProviderKey(this._sources, this.search.value);
        this._activeSource = null;
        this._render();
    };
    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (!this.backdrop.hidden && event.key === "Escape") this.close();
    };
    private get backdrop(): HTMLElement { return this.query(".backdrop"); }
    private get closeButton(): HTMLButtonElement { return this.query(".close"); }
    private get subtitle(): HTMLElement { return this.query(".subtitle"); }
    private get search(): HTMLInputElement { return this.query(".search"); }
    private get providers(): HTMLElement { return this.query(".providers"); }
    private get sourcesList(): HTMLElement { return this.query(".sources"); }
    private get details(): HTMLElement { return this.query(".details"); }
    private get binding(): HTMLElement { return this.query(".binding"); }
    private query<T extends Element>(selector: string): T { return this.shadowRoot!.querySelector<T>(selector)!; }
}

if (!customElements.get("cms-editor-v2-data-source-picker")) {
    customElements.define("cms-editor-v2-data-source-picker", DataSourcePicker);
}
