export type PageLinkElements = {
    empty: HTMLElement;
    externalInput: HTMLInputElement;
    externalPanel: HTMLElement;
    fileAction: HTMLElement;
    fileButton: HTMLButtonElement;
    filePreview: HTMLElement;
    fileTitle: HTMLElement;
    fileValue: HTMLElement;
    hint: HTMLElement;
    label: HTMLElement;
    mediaPanel: HTMLElement;
    pageList: HTMLElement;
    pagePanel: HTMLElement;
    picker: HTMLElement;
    searchInput: HTMLInputElement;
    summaryTitle: HTMLElement;
    summaryValue: HTMLElement;
    tabs: HTMLElement;
    target: HTMLElement;
};

export function queryPageLinkElements(root: ShadowRoot): PageLinkElements {
    const query = <T extends Element>(selector: string): T => root.querySelector<T>(selector)!;
    return {
        empty: query(".empty"),
        externalInput: query(".external-input"),
        externalPanel: query(".external-panel"),
        fileAction: query(".file-action"),
        fileButton: query(".file-button"),
        filePreview: query(".file-preview"),
        fileTitle: query(".file-title"),
        fileValue: query(".file-value"),
        hint: query(".hint"),
        label: query(".label"),
        mediaPanel: query(".media-panel"),
        pageList: query(".page-list"),
        pagePanel: query(".page-panel"),
        picker: query(".picker"),
        searchInput: query(".search"),
        summaryTitle: query(".target strong"),
        summaryValue: query(".target code"),
        tabs: query(".tabs"),
        target: query(".target"),
    };
}
