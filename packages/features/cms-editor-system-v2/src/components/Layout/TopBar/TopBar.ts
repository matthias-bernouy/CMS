import type { CmsSourceStateForce } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

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

export class TopBar extends HTMLElement {
    private _viewport: TopBarViewport = "bleed";
    private _mode: TopBarEditorMode = "edit";
    private _sourceState: CmsSourceStateForce = "loading";

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot!.addEventListener("click", this._onClick);
        this._syncButtons();
        this._syncModeAttribute();
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

    get sourceState(): CmsSourceStateForce {
        return this._sourceState;
    }

    set sourceState(sourceState: CmsSourceStateForce) {
        this._setSourceState(sourceState, false);
    }

    set saveStatus(label: string) {
        const target =
            this.shadowRoot!.querySelector(".save-label") ?? this.shadowRoot!.querySelector('[data-action="save"]');
        if (target) {
            target.textContent = label;
        }
    }

    setPageTitle(title: string, path: string): void {
        this.shadowRoot!.querySelector(".name")!.textContent = title;
        this.shadowRoot!.querySelector(".path")!.textContent = path;
    }

    setNavigation(input: { backHref: string; backLabel: string; settingsLabel: string }): void {
        const back = this.shadowRoot!.querySelector<HTMLAnchorElement>(".back")!;
        back.setAttribute("href", input.backHref);
        this.shadowRoot!.querySelector(".back-label")!.textContent = input.backLabel;
        this.shadowRoot!.querySelector(".settings-label")!.textContent = input.settingsLabel;
    }

    private readonly _onClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button) {
            return;
        }

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

        const sourceState = button.dataset.sourceState as CmsSourceStateForce | undefined;
        if (sourceState) {
            this._setSourceState(sourceState, true);
            return;
        }

        if (button.dataset.action === "save") {
            this.dispatchEvent(
                new CustomEvent(TOPBAR_SAVE_EVENT, {
                    bubbles: true,
                    composed: true,
                }),
            );
        } else if (button.dataset.action === "delete") {
            this.dispatchEvent(
                new CustomEvent(TOPBAR_DELETE_EVENT, {
                    bubbles: true,
                    composed: true,
                }),
            );
        } else if (button.dataset.action === "page-settings") {
            this.dispatchEvent(
                new CustomEvent(TOPBAR_PAGE_SETTINGS_EVENT, {
                    bubbles: true,
                    composed: true,
                }),
            );
        } else if (button.dataset.action === "view-reload") {
            this.dispatchEvent(
                new CustomEvent(TOPBAR_VIEW_RELOAD_EVENT, {
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    };

    private _setViewport(viewport: TopBarViewport, emit: boolean): void {
        if (this._viewport === viewport) {
            return;
        }

        this._viewport = viewport;
        this._syncButtons();
        if (!emit) {
            return;
        }

        this._emitViewportChange();
    }

    private _setMode(mode: TopBarEditorMode, emit: boolean): void {
        if (this._mode === mode) {
            return;
        }

        this._mode = mode;
        this._syncButtons();
        this._syncModeAttribute();
        if (!emit) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent<TopBarEditorModeChangeDetail>(TOPBAR_EDITOR_MODE_CHANGE_EVENT, {
                bubbles: true,
                composed: true,
                detail: { mode },
            }),
        );
    }

    private _setSourceState(sourceState: CmsSourceStateForce, emit: boolean): void {
        if (this._sourceState === sourceState) {
            return;
        }

        this._sourceState = sourceState;
        this._syncButtons();
        if (!emit) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent<TopBarSourceStateChangeDetail>(TOPBAR_SOURCE_STATE_CHANGE_EVENT, {
                bubbles: true,
                composed: true,
                detail: { sourceState },
            }),
        );
    }

    private _syncButtons(): void {
        this._syncButtonGroup("[data-viewport]", "viewport", this._viewport);
        this._syncButtonGroup("[data-editor-mode]", "editorMode", this._mode);
        this._syncButtonGroup("[data-source-state]", "sourceState", this._sourceState);
    }

    private _syncModeAttribute(): void {
        this.setAttribute("mode", this._mode);
        const reload = this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="view-reload"]');
        if (reload) {
            reload.disabled = this._mode !== "view";
        }
    }

    private _syncButtonGroup(
        selector: string,
        dataKey: "viewport" | "editorMode" | "sourceState",
        value: string,
    ): void {
        for (const button of Array.from(this.shadowRoot!.querySelectorAll<HTMLButtonElement>(selector))) {
            const isActive = button.dataset[dataKey] === value;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        }
    }

    private _emitViewportChange(): void {
        this.dispatchEvent(
            new CustomEvent<TopBarViewportChangeDetail>(TOPBAR_VIEWPORT_CHANGE_EVENT, {
                bubbles: true,
                composed: true,
                detail: { viewport: this._viewport },
            }),
        );
    }
}

if (!customElements.get("cms-editor-v2-topbar")) {
    customElements.define("cms-editor-v2-topbar", TopBar);
}
