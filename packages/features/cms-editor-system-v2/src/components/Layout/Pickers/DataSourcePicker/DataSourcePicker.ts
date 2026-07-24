import type { EditorDataSource } from "../../../../runtime";
import { sourceForBinding, type DataSourcePickerSourceBinding } from "./Binding/dataSourceBinding";
import { readSourceBinding } from "./Binding/dataSourceFormReader";
import {
    connectDataSourcePickerEvents,
    dispatchDataSourceRemoval,
    dispatchDataSourceSelection,
} from "./State/dataSourcePickerEvents";
import { renderDataSourcePicker } from "./Renderers/dataSourcePickerRenderer";
import {
    dataSourceMethod,
    methodSources,
    pickerProviderGroups,
    pickerVisibleSources,
    selectedMethodFilter,
    selectMethodFilter,
} from "./State/dataSourcePickerFilters";
import { cloneSources, firstProviderKey } from "./State/dataSourcePickerState";
import { type DataSourcePickerElements, queryDataSourcePickerElements } from "./State/dataSourcePickerElements";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type { DataSourcePickerSourceBinding, DataSourcePickerSourceParamValue } from "./Binding/dataSourceBinding";
export {
    DATA_SOURCE_PICKER_REMOVE_EVENT,
    DATA_SOURCE_PICKER_SELECT_EVENT,
    type DataSourcePickerSelectDetail,
} from "./State/dataSourcePickerEvents";
export class DataSourcePicker extends HTMLElement {
    private _sources: EditorDataSource[] = [];
    private _activeProvider = "";
    private _activeMethod = "GET";
    private _activeSource: EditorDataSource | null = null;
    private _initialBinding: DataSourcePickerSourceBinding | null = null;
    private _canRemove = false;
    private _disconnectEvents: (() => void) | null = null;
    private readonly elements: DataSourcePickerElements;

    constructor() {
        super();
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.append(template.content.cloneNode(true));
        this.elements = queryDataSourcePickerElements(shadowRoot);
    }
    connectedCallback(): void {
        this._disconnectEvents = connectDataSourcePickerEvents(
            {
                closeButton: this.elements.closeButton,
                backdrop: this.elements.backdrop,
                search: this.elements.search,
                methodFilter: this.elements.methodFilter,
                ownerDocument: this.ownerDocument,
            },
            {
                close: this.close,
                backdropClick: this._onBackdropClick,
                searchInput: this._onSearchInput,
                methodChange: this._onMethodChange,
                keydown: this._onKeydown,
            },
        );
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
        this.elements.search.value = "";
        this.elements.methodFilter.onchange = this._onMethodChange;
        this._activeSource = sourceForBinding(this._sources, this._initialBinding);
        this._activeMethod = this._activeSource ? dataSourceMethod(this._activeSource) : "GET";
        selectMethodFilter(this.elements.methodFilter, this._activeMethod);
        if (methodSources(this._sources, this._activeMethod).length === 0) {
            this._activeMethod = "all";
            selectMethodFilter(this.elements.methodFilter, "all");
        }
        this._activeProvider =
            this._activeSource?.provider ??
            firstProviderKey(methodSources(this._sources, this._activeMethod), this.elements.search.value);
        this._canRemove = options.canRemove === true;
        this.elements.subtitle.textContent = contextLabel
            ? `Choose a data source for ${contextLabel}.`
            : "Choose a data source.";
        this.elements.backdrop.hidden = false;
        this._render();
        this.elements.search.focus();
    }
    readonly close = (): void => {
        this.elements.backdrop.hidden = true;
    };
    private _render(): void {
        this._activeSource = renderDataSourcePicker(
            {
                providers: this.elements.providers,
                sourcesList: this.elements.sourcesList,
                details: this.elements.details,
                binding: this.elements.binding,
                groups: pickerProviderGroups(this._sources, this._activeMethod, this.elements.search.value),
                activeProvider: this._activeProvider,
                visibleSources: pickerVisibleSources(
                    this._sources,
                    this._activeMethod,
                    this.elements.search.value,
                    this._activeProvider,
                ),
                activeSource: this._activeSource,
                canRemove: this._canRemove,
                initialBinding: this._initialBinding,
            },
            {
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
                remove: this._remove,
            },
        );
    }
    private _select(source: EditorDataSource): void {
        const binding = readSourceBinding(this.shadowRoot!, source);
        if (!binding) {
            return;
        }
        dispatchDataSourceSelection(this, source, binding);
        this.close();
    }
    private readonly _remove = (): void => {
        dispatchDataSourceRemoval(this);
        this.close();
    };
    private readonly _onBackdropClick = (event: Event): void => {
        if (event.target === this.elements.backdrop) {
            this.close();
        }
    };
    private readonly _onSearchInput = (): void => {
        this._activeProvider = firstProviderKey(
            methodSources(this._sources, this._activeMethod),
            this.elements.search.value,
        );
        this._activeSource = null;
        this._render();
    };
    private readonly _onMethodChange = (): void => {
        this._activeMethod = selectedMethodFilter(this.elements.methodFilter);
        this._activeProvider = firstProviderKey(
            methodSources(this._sources, this._activeMethod),
            this.elements.search.value,
        );
        this._activeSource = null;
        this._render();
    };
    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (!this.elements.backdrop.hidden && event.key === "Escape") {
            this.close();
        }
    };
}

if (!customElements.get("cms-editor-v2-data-source-picker")) {
    customElements.define("cms-editor-v2-data-source-picker", DataSourcePicker);
}
