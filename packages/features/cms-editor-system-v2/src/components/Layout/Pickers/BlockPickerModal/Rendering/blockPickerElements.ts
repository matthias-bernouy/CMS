export type BlockPickerElements = {
    backdrop: HTMLElement;
    categories: HTMLElement;
    closeButton: HTMLButtonElement;
    details: HTMLElement;
    results: HTMLElement;
    search: HTMLInputElement;
    sources: HTMLElement;
    subtitle: HTMLElement;
    tabs: HTMLElement;
};

export function queryBlockPickerElements(root: ShadowRoot): BlockPickerElements {
    const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
    return {
        backdrop: query(".backdrop"),
        categories: query(".categories"),
        closeButton: query(".close"),
        details: query(".details"),
        results: query(".results"),
        search: query(".search"),
        sources: query(".sources"),
        subtitle: query(".subtitle"),
        tabs: query(".slot-tabs"),
    };
}
