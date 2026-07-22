import type { CmsSourceStateForce } from "@bernouy/cms-content/editor";

export type TopBarViewport = "desktop" | "tablet" | "mobile" | "full" | "bleed";
export type TopBarEditorMode = "edit" | "view";

export type TopBarViewportChangeDetail = {
    viewport: TopBarViewport;
};

export type TopBarEditorModeChangeDetail = {
    mode: TopBarEditorMode;
};

export type TopBarSourceStateChangeDetail = {
    sourceState: CmsSourceStateForce;
};

export const TOPBAR_VIEWPORT_CHANGE_EVENT = "editor-v2:viewport-change";
export const TOPBAR_EDITOR_MODE_CHANGE_EVENT = "editor-v2:editor-mode-change";
export const TOPBAR_SOURCE_STATE_CHANGE_EVENT = "editor-v2:source-state-change";
export const TOPBAR_VIEW_RELOAD_EVENT = "editor-v2:view-reload";
export const TOPBAR_SAVE_EVENT = "editor-v2:save";
export const TOPBAR_DELETE_EVENT = "editor-v2:topbar-delete-document";
export const TOPBAR_PAGE_SETTINGS_EVENT = "editor-v2:page-settings";

type TopBarInteractionHandlers = {
    setViewport: (viewport: TopBarViewport) => void;
    setMode: (mode: TopBarEditorMode) => void;
    setSourceState: (sourceState: CmsSourceStateForce) => void;
};

export function handleTopBarClick(host: HTMLElement, event: Event, handlers: TopBarInteractionHandlers): void {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
    if (!button) {
        return;
    }

    const viewport = button.dataset.viewport as TopBarViewport | undefined;
    if (viewport) {
        handlers.setViewport(viewport);
        return;
    }
    const mode = button.dataset.editorMode as TopBarEditorMode | undefined;
    if (mode) {
        handlers.setMode(mode);
        return;
    }
    const sourceState = button.dataset.sourceState as CmsSourceStateForce | undefined;
    if (sourceState) {
        handlers.setSourceState(sourceState);
        return;
    }

    const eventName = actionEventName(button.dataset.action);
    if (eventName) {
        host.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true }));
    }
}

export function syncTopBarButtonGroup(
    root: ShadowRoot,
    selector: string,
    dataKey: "viewport" | "editorMode" | "sourceState",
    value: string,
): void {
    for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>(selector))) {
        const isActive = button.dataset[dataKey] === value;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    }
}

function actionEventName(action: string | undefined): string | null {
    if (action === "save") {
        return TOPBAR_SAVE_EVENT;
    }
    if (action === "delete") {
        return TOPBAR_DELETE_EVENT;
    }
    if (action === "page-settings") {
        return TOPBAR_PAGE_SETTINGS_EVENT;
    }
    if (action === "view-reload") {
        return TOPBAR_VIEW_RELOAD_EVENT;
    }
    return null;
}
