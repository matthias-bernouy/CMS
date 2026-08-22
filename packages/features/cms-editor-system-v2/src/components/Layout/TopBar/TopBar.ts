import type { CmsSourceStateForce } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";
import {
    handleTopBarClick,
    syncTopBarButtonGroup,
    TOPBAR_EDITOR_MODE_CHANGE_EVENT,
    TOPBAR_SOURCE_STATE_CHANGE_EVENT,
    TOPBAR_VIEWPORT_CHANGE_EVENT,
    type TopBarEditorMode,
    type TopBarEditorModeChangeDetail,
    type TopBarSourceStateChangeDetail,
    type TopBarViewport,
    type TopBarViewportChangeDetail,
} from "./topBarEvents";

export * from "./topBarEvents";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

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

    setDeleteVisible(visible: boolean): void {
        this.shadowRoot!.querySelector<HTMLElement>('[data-action="delete"]')!.hidden = !visible;
    }

    private readonly _onClick = (event: Event): void => {
        handleTopBarClick(this, event, {
            setViewport: (viewport) => this._setViewport(viewport, true),
            setMode: (mode) => this._setMode(mode, true),
            setSourceState: (sourceState) => this._setSourceState(sourceState, true),
        });
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
        syncTopBarButtonGroup(this.shadowRoot!, "[data-viewport]", "viewport", this._viewport);
        syncTopBarButtonGroup(this.shadowRoot!, "[data-editor-mode]", "editorMode", this._mode);
        syncTopBarButtonGroup(this.shadowRoot!, "[data-source-state]", "sourceState", this._sourceState);
    }

    private _syncModeAttribute(): void {
        this.setAttribute("mode", this._mode);
        const reload = this.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="view-reload"]');
        if (reload) {
            reload.disabled = this._mode !== "view";
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
