import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type TopBarViewport = "desktop" | "tablet" | "mobile";
export type TopBarEditorMode = "edit" | "view";

export type TopBarViewportChangeDetail = {
    viewport: TopBarViewport;
};

export type TopBarEditorModeChangeDetail = {
    mode: TopBarEditorMode;
};

export const TOPBAR_VIEWPORT_CHANGE_EVENT = "editor-v2:viewport-change";
export const TOPBAR_EDITOR_MODE_CHANGE_EVENT = "editor-v2:editor-mode-change";
export const TOPBAR_SAVE_EVENT = "editor-v2:save";
export const TOPBAR_PAGE_SETTINGS_EVENT = "editor-v2:page-settings";

export class TopBar extends HTMLElement {
    private _viewport: TopBarViewport = "desktop";
    private _mode: TopBarEditorMode = "edit";

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.addEventListener("click", this._onClick);
        this._syncButtons();
    }

    disconnectedCallback(): void {
        this.shadowRoot!.removeEventListener("click", this._onClick);
    }

    get viewport(): TopBarViewport {
        return this._viewport;
    }

    set viewport(viewport: TopBarViewport) {
        this._setViewport(viewport, false);
    }

    get mode(): TopBarEditorMode {
        return this._mode;
    }

    set mode(mode: TopBarEditorMode) {
        this._setMode(mode, false);
    }

    set saveStatus(label: string) {
        this.shadowRoot!.querySelector(".save-label")!.textContent = label;
    }

    private readonly _onClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button) return;

        const viewport = button.dataset.viewport as TopBarViewport | undefined;
        if (viewport) {
            this._setViewport(viewport, true);
            return;
        }

        const mode = button.dataset.editorMode as TopBarEditorMode | undefined;
        if (mode) {
            this._setMode(mode, true);
            return;
        }

        if (button.dataset.action === "save") {
            this.dispatchEvent(new CustomEvent(TOPBAR_SAVE_EVENT, {
                bubbles:  true,
                composed: true,
            }));
        } else if (button.dataset.action === "page-settings") {
            this.dispatchEvent(new CustomEvent(TOPBAR_PAGE_SETTINGS_EVENT, {
                bubbles:  true,
                composed: true,
            }));
        }
    };

    private _setViewport(viewport: TopBarViewport, emit: boolean): void {
        if (this._viewport === viewport) return;

        this._viewport = viewport;
        this._syncButtons();
        if (!emit) return;

        this.dispatchEvent(new CustomEvent<TopBarViewportChangeDetail>(TOPBAR_VIEWPORT_CHANGE_EVENT, {
            bubbles:  true,
            composed: true,
            detail:   { viewport },
        }));
    }

    private _setMode(mode: TopBarEditorMode, emit: boolean): void {
        if (this._mode === mode) return;

        this._mode = mode;
        this._syncButtons();
        if (!emit) return;

        this.dispatchEvent(new CustomEvent<TopBarEditorModeChangeDetail>(TOPBAR_EDITOR_MODE_CHANGE_EVENT, {
            bubbles:  true,
            composed: true,
            detail:   { mode },
        }));
    }

    private _syncButtons(): void {
        this._syncButtonGroup("[data-viewport]", "viewport", this._viewport);
        this._syncButtonGroup("[data-editor-mode]", "editorMode", this._mode);
    }

    private _syncButtonGroup(selector: string, dataKey: "viewport" | "editorMode", value: string): void {
        for (const button of Array.from(this.shadowRoot!.querySelectorAll<HTMLButtonElement>(selector))) {
            const isActive = button.dataset[dataKey] === value;
            button.classList.toggle("active", isActive);
            button.ariaPressed = String(isActive);
        }
    }
}

if (!customElements.get("cms-editor-v2-topbar")) {
    customElements.define("cms-editor-v2-topbar", TopBar);
}
