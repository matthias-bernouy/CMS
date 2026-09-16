import { readPreviewTokens } from "../ThemeSpecimen/model";
import {
    THEME_TOKEN_DRAFT_EVENT,
    THEME_TOKEN_EDITOR_STATE_EVENT,
    type ThemeTokenDraft,
    type ThemeTokenEditorState,
} from "./events";
import type { CmsThemeTokenEditor } from "./ThemeTokenEditor";
import type { ThemeProfileController } from "./Context/ProfileController";

export class ThemeEditingController {
    constructor(
        private readonly host: HTMLElement,
        private readonly profiles?: ThemeProfileController,
    ) {}

    connect(): void {
        this.host.addEventListener("click", this.onClick);
        this.host.addEventListener(THEME_TOKEN_DRAFT_EVENT, this.onDraft as EventListener);
        this.host.addEventListener(THEME_TOKEN_EDITOR_STATE_EVENT, this.onState as EventListener);
    }

    disconnect(): void {
        this.host.removeEventListener("click", this.onClick);
        this.host.removeEventListener(THEME_TOKEN_DRAFT_EVENT, this.onDraft as EventListener);
        this.host.removeEventListener(THEME_TOKEN_EDITOR_STATE_EVENT, this.onState as EventListener);
    }

    private readonly onClick = (event: Event): void => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-theme-save]") : null;
        if (!button || button.hasAttribute("disabled")) {
            return;
        }
        void this.host.querySelector<CmsThemeTokenEditor>("cms-theme-token-editor")?.save();
    };

    private readonly onState = (event: CustomEvent<ThemeTokenEditorState>): void => {
        const button = this.host.querySelector<HTMLElement>("[data-theme-save]");
        if (!button) {
            return;
        }
        button.toggleAttribute("disabled", !event.detail.dirty || event.detail.saving);
        button.toggleAttribute("aria-busy", event.detail.saving);
        this.profiles?.setLocked(event.detail.dirty || event.detail.saving);
    };

    private readonly onDraft = (event: CustomEvent<ThemeTokenDraft>): void => {
        const specimen = this.host.querySelector<HTMLElement>("cms-theme-specimen");
        if (specimen) {
            const tokens = readPreviewTokens(specimen.getAttribute("tokens"));
            const token = tokens.find(({ variable }) => variable === event.detail.variable);
            if (token) {
                token.light = event.detail.light;
                token.dark = event.detail.dark;
                specimen.setAttribute("tokens", JSON.stringify(tokens));
            }
        }
        const preview = this.host.querySelector<HTMLElement>("cms-theme-token-preview");
        preview?.setAttribute("light", event.detail.light);
        preview?.setAttribute("dark", event.detail.dark);
    };
}
