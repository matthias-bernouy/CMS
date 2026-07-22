import type { EditorDataSource } from "../../../../../runtime";
import { filteredSources, providerGroups, type DataSourceProviderGroup } from "./dataSourceGroups";
import { visibleSources } from "./dataSourcePickerState";

export function dataSourceMethod(source: EditorDataSource): string {
    return source.method ?? "GET";
}

export function methodSources(sources: EditorDataSource[], activeMethod: string): EditorDataSource[] {
    return sources.filter((source) => activeMethod === "all" || dataSourceMethod(source) === activeMethod);
}

export function pickerProviderGroups(
    sources: EditorDataSource[],
    activeMethod: string,
    query: string,
): DataSourceProviderGroup[] {
    return providerGroups(filteredSources(methodSources(sources, activeMethod), query));
}

export function pickerVisibleSources(
    sources: EditorDataSource[],
    activeMethod: string,
    query: string,
    activeProvider: string,
): EditorDataSource[] {
    return visibleSources(methodSources(sources, activeMethod), query, activeProvider);
}

export function selectMethodFilter(filter: HTMLSelectElement, value: string): void {
    const options = Array.from(filter.options);
    const index = options.findIndex((option) => option.value === value);
    filter.selectedIndex = index >= 0 ? index : 0;
    options.forEach((option, optionIndex) => {
        option.selected = optionIndex === filter.selectedIndex;
        option.toggleAttribute("selected", option.selected);
    });
    filter.setAttribute("value", options[filter.selectedIndex]?.value ?? "GET");
}

export function selectedMethodFilter(filter: HTMLSelectElement): string {
    const options = Array.from(filter.options);
    const selected = options.find((option) => option.selected);
    if (selected?.value) {
        return selected.value;
    }
    const selectedIndexValue = filter.options[filter.selectedIndex]?.value;
    if (selectedIndexValue) {
        return selectedIndexValue;
    }
    const selectedAttribute = options.find((option) => option.hasAttribute("selected"));
    return selectedAttribute?.value ?? filter.getAttribute("value") ?? "GET";
}
