import { Component } from "@bernouy/components/base";

import { applyPreviewBindings } from "./bindings";
import { applyPreviewMode, initialPreviewMode, isPreviewMode, type PreviewMode } from "./mode";
import { type PreviewToken, readPreviewBindings, readPreviewTokens, readPreviewVariables } from "./model";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

type PreviewView = "overview" | "focus";

export class CmsThemeSpecimen extends Component {
    private readonly panels: HTMLElement[];
    private appliedVariables = new Set<string>();

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        this.panels = this.createPanels();
    }

    static get observedAttributes(): string[] {
        return ["active", "bindings", "focus", "token-type", "tokens", "view"];
    }

    override connectedCallback(): void {
        this.shadowRoot!.addEventListener("click", this.selectMode);
        this.applyTokens();
        this.setMode(initialPreviewMode(), false);
    }

    disconnectedCallback(): void {
        this.shadowRoot!.removeEventListener("click", this.selectMode);
    }

    attributeChangedCallback(): void {
        this.applyTokens();
    }

    private createPanels(): HTMLElement[] {
        const canvas = this.shadowRoot!.querySelector<HTMLElement>(".canvas");
        const sample = this.shadowRoot!.querySelector<HTMLTemplateElement>("template[data-sample]");
        if (!canvas || !sample) {
            return [];
        }
        for (const mode of ["light", "dark"] as const) {
            const fragment = sample.content.cloneNode(true) as DocumentFragment;
            const panel = fragment.querySelector<HTMLElement>(".sample");
            if (!panel) {
                continue;
            }
            panel.dataset.themePanel = mode;
            panel.querySelector<HTMLElement>(".mode-label")!.textContent = mode === "light" ? "Light" : "Dark";
            canvas.append(fragment);
        }
        sample.remove();
        return Array.from(canvas.querySelectorAll<HTMLElement>("[data-theme-panel]"));
    }

    private readonly selectMode = (event: Event): void => {
        const target =
            event.target instanceof Element ? event.target.closest<HTMLElement>("[data-preview-mode]") : null;
        const mode = target?.dataset.previewMode;
        if (isPreviewMode(mode)) {
            this.setMode(mode, true);
        }
    };

    private setMode(mode: PreviewMode, persist: boolean): void {
        applyPreviewMode(this, this.panels, mode, persist);
    }

    private applyTokens(): void {
        const tokens = readPreviewTokens(this.getAttribute("tokens"));
        const bindings = readPreviewBindings(this.getAttribute("bindings"));
        const byVariable = new Map(tokens.map((token) => [token.variable, token]));
        const active = byVariable.get(this.getAttribute("active") ?? "");
        const view: PreviewView = this.getAttribute("view") === "focus" && active ? "focus" : "overview";
        this.dataset.previewView = view;
        this.toggleAttribute("data-shared-value", Boolean(active && active.light === active.dark));
        const heading = this.shadowRoot!.querySelector<HTMLElement>("[data-preview-heading]");
        if (heading) {
            heading.textContent = view === "focus" ? "Preview" : "Light and dark";
        }
        for (const panel of this.panels) {
            this.applyPanelTokens(panel, tokens, bindings, byVariable, active);
        }
        this.appliedVariables = new Set(tokens.map(({ variable }) => variable));
        this.applySelection(bindings, view, active?.variable ?? "");
        const currentMode = this.dataset.mode as PreviewMode | undefined;
        if (isPreviewMode(currentMode)) {
            this.setMode(currentMode, false);
        }
    }

    private applyPanelTokens(
        panel: HTMLElement,
        tokens: PreviewToken[],
        bindings: Record<string, string>,
        byVariable: Map<string, PreviewToken>,
        active: PreviewToken | undefined,
    ): void {
        for (const variable of this.appliedVariables) {
            panel.style.removeProperty(`--${variable}`);
        }
        const mode = panel.dataset.themePanel === "dark" ? "dark" : "light";
        for (const token of tokens) {
            panel.style.setProperty(`--${token.variable}`, token[mode]);
        }
        applyPreviewBindings(panel, bindings, byVariable);
        panel.style.setProperty("--spec-active", active ? `var(--${active.variable})` : "transparent");
        const visual = panel.querySelector<HTMLElement>("[data-active-visual]");
        const value = panel.querySelector<HTMLElement>("[data-active-value]");
        if (visual) {
            visual.dataset.activeType = this.getAttribute("token-type") ?? "value";
            visual.querySelector("span")!.textContent = activeGlyph(visual.dataset.activeType);
        }
        if (value) {
            value.textContent = active?.[mode] ?? "";
        }
    }

    private applySelection(bindings: Record<string, string>, view: PreviewView, active: string): void {
        const focus = readPreviewVariables(this.getAttribute("focus"));
        if (active) {
            focus.add(active);
        }
        const activeSlots = new Set(
            Object.entries(bindings)
                .filter(([, variable]) => focus.has(variable))
                .map(([slot]) => slot),
        );
        const represented = Object.values(bindings).includes(active);
        this.toggleAttribute("data-unrepresented", view === "focus" && Boolean(active) && !represented);
        for (const example of Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-focus-uses]"))) {
            const slots = example.dataset.focusUses?.split(" ").filter(Boolean) ?? [];
            const affected = slots.some((slot) => activeSlots.has(slot));
            example.hidden = view !== "focus" || !affected;
            example.toggleAttribute("data-selected-token", affected);
        }
    }
}

function activeGlyph(type: string): string {
    if (type === "length") {
        return "↔";
    }
    if (type === "number") {
        return "#";
    }
    if (type === "value") {
        return "•••";
    }
    return type === "font-family" ? "Aa" : "";
}

if (!customElements.get("cms-theme-specimen")) {
    customElements.define("cms-theme-specimen", CmsThemeSpecimen);
}
