import { linkSummaryFallback, type LinkMode, type PageRef } from "../pageLinkDomain";
import type { PageLinkElements } from "./pageLinkElements";

export function renderPageLinkTabs(input: {
    allowedModes: LinkMode[];
    disabled: boolean;
    elements: PageLinkElements;
    mode: LinkMode;
    onMode: (mode: LinkMode) => void;
}): void {
    input.elements.tabs.replaceChildren();
    if (input.allowedModes.length <= 1) {
        input.elements.tabs.hidden = true;
        return;
    }

    input.elements.tabs.hidden = false;
    for (const mode of input.allowedModes) {
        input.elements.tabs.append(modeTab(mode, input.mode, input.disabled, input.onMode));
    }
}

export function renderPageLinkPages(input: {
    disabled: boolean;
    elements: PageLinkElements;
    onSelect: (value: string) => void;
    pages: PageRef[];
    pickerOpen: boolean;
    query: string;
    value: string;
}): void {
    input.elements.pageList.replaceChildren();
    input.elements.picker.hidden = !input.pickerOpen || input.elements.pagePanel.hidden;
    const query = input.query.trim().toLowerCase();
    const pages = input.pages.filter(
        (page) => !query || page.title.toLowerCase().includes(query) || page.path.toLowerCase().includes(query),
    );
    input.elements.empty.hidden = !input.pickerOpen || pages.length > 0;

    for (const page of pages) {
        const button = document.createElement("button");
        button.className = "page-option";
        button.type = "button";
        button.ariaSelected = String(page.path === input.value);
        button.disabled = input.disabled;
        button.addEventListener("click", () => {
            if (!input.disabled) {
                input.onSelect(page.path);
            }
        });
        const title = document.createElement("span");
        title.className = "page-title";
        title.textContent = page.title;
        const path = document.createElement("span");
        path.className = "page-path";
        path.textContent = page.path;
        button.append(title, path);
        input.elements.pageList.append(button);
    }
}

export function renderPageLinkSummary(
    elements: PageLinkElements,
    pages: PageRef[],
    mode: LinkMode,
    value: string,
): void {
    const page = pages.find((candidate) => candidate.path === value);
    elements.summaryTitle.textContent = page?.title ?? (value ? linkSummaryFallback(mode) : "No link selected");
    elements.summaryValue.textContent = value || "Choose a target";
    elements.target.hidden = !value || mode === "media";
}

function modeTab(
    mode: LinkMode,
    activeMode: LinkMode,
    disabled: boolean,
    onMode: (mode: LinkMode) => void,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = mode === "page" ? "Page" : mode === "external" ? "External" : "Media";
    button.ariaSelected = String(activeMode === mode);
    button.disabled = disabled;
    button.addEventListener("click", () => {
        if (!disabled) {
            onMode(mode);
        }
    });
    return button;
}
