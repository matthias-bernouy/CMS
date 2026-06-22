import type { EditorDataSource } from "../../../runtime";
import type { DataSourcePickerSourceBinding } from "../Binding/dataSourceBinding";
import type { DataSourceProviderGroup } from "../State/dataSourceGroups";
import { renderProviderButtons, renderSourceButtons } from "./dataSourceListRenderer";
import { renderBindingPanel, renderDetailsPanel } from "./dataSourcePanelsRenderer";

export type DataSourcePickerRenderState = {
    providers: HTMLElement;
    sourcesList: HTMLElement;
    details: HTMLElement;
    binding: HTMLElement;
    groups: DataSourceProviderGroup[];
    activeProvider: string;
    visibleSources: EditorDataSource[];
    activeSource: EditorDataSource | null;
    canRemove: boolean;
    initialBinding: DataSourcePickerSourceBinding | null;
};

export type DataSourcePickerRenderHandlers = {
    providerSelect: (provider: string) => void;
    sourceSelect: (source: EditorDataSource) => void;
    sourceConfirm: (source: EditorDataSource) => void;
    bindingSelect: () => void;
    remove: () => void;
};

export function renderDataSourcePicker(
    state: DataSourcePickerRenderState,
    handlers: DataSourcePickerRenderHandlers,
): EditorDataSource | null {
    const activeSource = normalizeActiveSource(state.activeSource, state.visibleSources);

    renderProviderButtons(state.providers, state.groups, state.activeProvider, handlers.providerSelect);
    renderSourceButtons(
        state.sourcesList,
        state.visibleSources,
        activeSource,
        handlers.sourceSelect,
        handlers.sourceConfirm,
    );
    renderDetailsPanel(state.details, activeSource);
    renderBindingPanel(state.binding, activeSource, {
        canRemove:      state.canRemove,
        initialBinding: state.initialBinding,
        onSelect:       handlers.bindingSelect,
        onRemove:       handlers.remove,
    });

    return activeSource;
}

function normalizeActiveSource(
    activeSource: EditorDataSource | null,
    visibleSources: EditorDataSource[],
): EditorDataSource | null {
    if (!activeSource || !visibleSources.includes(activeSource)) {
        return visibleSources[0] ?? null;
    }
    return activeSource;
}
