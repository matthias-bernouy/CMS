import { effectiveTokenValue, resolveThemeTokenValue, type ThemeSettings } from "@bernouy/cms-content/theme";
import { Component } from "@bernouy/components/base";
import {
    handleLengthControlMode,
    handleThemeInput,
    handleTokenControlMode,
} from "cms-control/components/admin/Theme/editor/controller/inputEvents";
import { resetTokenValue } from "cms-control/components/admin/Theme/editor/model";
import tokenControlsCss from "cms-control/components/admin/Theme/editor/styles/tokens.css" with { type: "text" };
import { loadThemeEditingDraft, persistThemeEditingDraft } from "./draft";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { renderTokenEditor, setEditorStatus, type TokenEditorContext } from "./view";
import {
    emitThemeEditingEvent,
    THEME_TOKEN_DRAFT_EVENT,
    THEME_TOKEN_EDITOR_STATE_EVENT,
    themeModeFromEvent,
    type ThemeTokenDraft,
} from "./events";

export class CmsThemeTokenEditor extends Component {
    private context: TokenEditorContext | undefined;
    private settings: ThemeSettings | undefined;
    private dirty = false;
    private saving = false;
    private loadRevision = 0;
    private selectedMode: "light" | "dark" = "light";

    constructor() {
        super({
            css: `${tokenControlsCss as unknown as string}\n${css as unknown as string}`,
            template: template as unknown as string,
        });
    }

    static get observedAttributes(): string[] {
        return ["default-source", "token-variable", "theme-id"];
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot?.addEventListener("click", this.onClick);
        this.shadowRoot?.addEventListener("change", this.onChange);
        this.shadowRoot?.addEventListener("input", this.onInput);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("change", this.onChange);
        this.shadowRoot?.removeEventListener("input", this.onInput);
    }

    attributeChangedCallback(_name: string, previous: string | null, next: string | null): void {
        if (this.isConnected && previous !== next) {
            void this.load();
        }
    }

    async save(): Promise<void> {
        if (!this.settings || !this.dirty || this.saving) {
            return;
        }
        this.saving = true;
        this.toggleAttribute("aria-busy", true);
        this.emitState();
        setEditorStatus(this.shadowRoot!, "Saving…");
        try {
            this.settings = await persistThemeEditingDraft(this.settings, this.ownerDocument);
            this.dirty = false;
            this.render();
            setEditorStatus(this.shadowRoot!, "Saved.");
        } catch (error) {
            setEditorStatus(this.shadowRoot!, error instanceof Error ? error.message : "Unable to save theme.", true);
        } finally {
            this.saving = false;
            this.removeAttribute("aria-busy");
            this.emitState();
        }
    }

    private async load(): Promise<void> {
        const revision = ++this.loadRevision;
        setEditorStatus(this.shadowRoot!, "Loading values…");
        try {
            const loaded = await loadThemeEditingDraft();
            if (revision !== this.loadRevision) {
                return;
            }
            this.settings = loaded;
            this.dirty = false;
            this.render();
            if (this.context) {
                setEditorStatus(this.shadowRoot!, "");
            }
        } catch (error) {
            setEditorStatus(this.shadowRoot!, error instanceof Error ? error.message : "Unable to load theme.", true);
        }
        this.emitState();
    }

    private render(): void {
        this.context = this.settings
            ? renderTokenEditor(
                  this.shadowRoot!,
                  this.settings,
                  this.getAttribute("token-variable") ?? "",
                  this.getAttribute("theme-id") ?? this.settings.activeThemeId,
              )
            : undefined;
        this.applyResetLabels();
        this.syncSelectedMode();
    }

    private applyResetLabels(): void {
        const source = this.getAttribute("default-source")?.trim();
        if (!source) {
            return;
        }
        for (const reset of Array.from(this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-reset-token]"))) {
            reset.textContent = `Reset to ${source} default`;
            reset.title = `Restore the default value from ${source}`;
        }
    }

    private readonly onClick = (event: Event): void => {
        const defineDarkValue =
            event.target instanceof Element ? event.target.closest<HTMLElement>("[data-define-dark-value]") : null;
        if (defineDarkValue && this.context) {
            const { entry, theme } = this.context;
            theme.values.dark ??= {};
            theme.values.dark[entry.token.id] = effectiveTokenValue(entry.token, theme, "light");
            this.selectedMode = "dark";
            this.changed(true);
            return;
        }
        const reset = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-reset-token]") : null;
        const mode = reset?.closest<HTMLElement>("[data-theme-mode]")?.dataset.themeMode;
        const context = this.context;
        if (!reset || !context || (mode !== "light" && mode !== "dark")) {
            return;
        }
        const selection = { sourceId: context.entry.source.id, categoryId: context.entry.category.id };
        if (resetTokenValue(context.settings, selection, context.theme.id, mode, context.entry.token.id)) {
            this.changed(true);
        }
    };

    private readonly onInput = (event: Event): void => this.updateValue(event, false);

    private readonly onChange = (event: Event): void => {
        if (this.selectMode(event)) {
            return;
        }
        if (handleTokenControlMode(event) || handleLengthControlMode(event)) {
            return;
        }
        this.updateValue(event, true);
    };

    private selectMode(event: Event): boolean {
        const target = event.target as HTMLElement & { value?: string };
        if (!target.matches?.("[data-value-mode]") || (target.value !== "light" && target.value !== "dark")) {
            return false;
        }
        this.selectedMode = target.value;
        this.syncSelectedMode();
        return true;
    }

    private syncSelectedMode(): void {
        for (const section of Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-theme-mode]"))) {
            section.hidden = section.dataset.themeMode !== this.selectedMode;
        }
    }

    private updateValue(event: Event, rerender: boolean): void {
        const context = this.context;
        if (!context) {
            return;
        }
        const before = JSON.stringify(context.theme.values);
        handleThemeInput(event, {
            root: this.shadowRoot!,
            settings: context.settings,
            selection: { sourceId: context.entry.source.id, categoryId: context.entry.category.id },
            selectedThemeId: context.theme.id,
            mode: themeModeFromEvent(event),
        });
        if (before !== JSON.stringify(context.theme.values)) {
            this.changed(rerender);
        }
    }

    private changed(rerender: boolean): void {
        this.dirty = true;
        setEditorStatus(this.shadowRoot!, "");
        if (rerender) {
            this.render();
        }
        this.emitDraft();
        this.emitState();
    }

    private emitDraft(): void {
        const context = this.context;
        if (!context) {
            return;
        }
        const detail: ThemeTokenDraft = {
            variable: context.entry.token.variable,
            light: resolveThemeTokenValue(context.settings, context.theme, "light", context.entry.token.id).value,
            dark: resolveThemeTokenValue(context.settings, context.theme, "dark", context.entry.token.id).value,
        };
        emitThemeEditingEvent(this, THEME_TOKEN_DRAFT_EVENT, detail);
    }

    private emitState(): void {
        emitThemeEditingEvent(this, THEME_TOKEN_EDITOR_STATE_EVENT, { dirty: this.dirty, saving: this.saving });
    }
}

if (!customElements.get("cms-theme-token-editor")) {
    customElements.define("cms-theme-token-editor", CmsThemeTokenEditor);
}
