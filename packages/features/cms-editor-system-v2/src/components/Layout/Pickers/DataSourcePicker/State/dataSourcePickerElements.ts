export type DataSourcePickerElements = {
    backdrop: HTMLElement;
    binding: HTMLElement;
    closeButton: HTMLButtonElement;
    details: HTMLElement;
    methodFilter: HTMLSelectElement;
    providers: HTMLElement;
    search: HTMLInputElement;
    sourcesList: HTMLElement;
    subtitle: HTMLElement;
};

export function queryDataSourcePickerElements(root: ShadowRoot): DataSourcePickerElements {
    const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
    return {
        backdrop: query(".backdrop"),
        binding: query(".binding"),
        closeButton: query(".close"),
        details: query(".details"),
        methodFilter: query(".method-filter"),
        providers: query(".providers"),
        search: query(".search"),
        sourcesList: query(".sources"),
        subtitle: query(".subtitle"),
    };
}
