import type { ThemeMode, ThemeSettings } from "@bernouy/cms-content";

import type { ThemeTokenFilter } from "../tokens/explorer";
import { renderTokenReferencePicker } from "../tokens/referencePicker";
import { setThemeTokenReference } from "../tokens/values";

export type ThemeExplorerContext = {
    root: ShadowRoot;
    settings: ThemeSettings;
    selectedThemeId: string;
    mode: ThemeMode;
    render: () => void;
    showError: (message: string) => void;
};

export class ThemeExplorerController {
    tokenFilter: ThemeTokenFilter = "all";
    tokenSearch = "";
    private referenceTokenId: string | undefined;
    private referenceSearch = "";

    handleClick(event: Event, context: ThemeExplorerContext): boolean {
        const target = event.target as HTMLElement | null;
        const referenceToken = target?.closest<HTMLElement>("[data-open-token-reference]")?.dataset.openTokenReference;
        if (referenceToken) {
            this.referenceTokenId = referenceToken;
            this.referenceSearch = "";
            this.renderReferencePicker(context);
            context.root.querySelector<HTMLInputElement>("[data-reference-search]")?.focus();
            return true;
        }
        if (target?.closest("[data-close-token-reference]") || target?.matches("[data-reference-picker]")) {
            this.closeReferencePicker(context);
            return true;
        }
        const referenceTarget = target?.closest<HTMLElement>("[data-reference-target]")?.dataset.referenceTarget;
        if (referenceTarget) {
            this.selectReference(referenceTarget, context);
            return true;
        }
        const filter = target?.closest<HTMLButtonElement>("[data-token-filter]")?.dataset.tokenFilter;
        if (isTokenFilter(filter)) {
            this.tokenFilter = filter;
            context.render();
            return true;
        }
        return false;
    }

    handleInput(event: Event, context: ThemeExplorerContext): boolean {
        const input = event.target as HTMLInputElement | null;
        if (input?.matches("[data-token-search]")) {
            this.tokenSearch = input.value;
            context.render();
            restoreSearch(context.root, "[data-token-search]");
            return true;
        }
        if (input?.matches("[data-reference-search]")) {
            this.referenceSearch = input.value;
            this.renderReferencePicker(context);
            return true;
        }
        return false;
    }

    handleKeyDown(event: Event, context: ThemeExplorerContext): boolean {
        if (!(event instanceof KeyboardEvent) || !this.referenceTokenId) {
            return false;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            this.closeReferencePicker(context);
            return true;
        }
        return event.key === "Tab" ? trapReferenceFocus(event, context.root) : false;
    }

    reset(context?: ThemeExplorerContext): void {
        this.tokenFilter = "all";
        this.tokenSearch = "";
        this.referenceTokenId = undefined;
        this.referenceSearch = "";
        if (context) {
            this.renderReferencePicker(context);
        }
    }

    renderReferencePicker(context: ThemeExplorerContext): void {
        const theme = context.settings.themes.find((item) => item.id === context.selectedThemeId);
        if (!theme) {
            return;
        }
        renderTokenReferencePicker(context.root, {
            settings: context.settings,
            theme,
            mode: context.mode,
            tokenId: this.referenceTokenId,
            search: this.referenceSearch,
        });
    }

    private selectReference(targetId: string, context: ThemeExplorerContext): void {
        const theme = context.settings.themes.find((item) => item.id === context.selectedThemeId);
        if (!theme || !this.referenceTokenId) {
            return;
        }
        if (!setThemeTokenReference(context.settings, theme, context.mode, this.referenceTokenId, targetId)) {
            context.showError("This link would create a circular token reference.");
            return;
        }
        const tokenId = this.referenceTokenId;
        this.closeReferencePicker(context, false);
        context.render();
        restoreReferenceFocus(context.root, tokenId);
    }

    private closeReferencePicker(context: ThemeExplorerContext, restoreFocus = true): void {
        const tokenId = this.referenceTokenId;
        this.referenceTokenId = undefined;
        this.referenceSearch = "";
        this.renderReferencePicker(context);
        if (restoreFocus && tokenId) {
            restoreReferenceFocus(context.root, tokenId);
        }
    }
}

function trapReferenceFocus(event: KeyboardEvent, root: ShadowRoot): boolean {
    const panel = root.querySelector<HTMLElement>("[data-reference-picker]");
    const focusable = Array.from(
        panel?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])") ??
            [],
    ).filter((element) => !element.hidden);
    if (focusable.length === 0) {
        event.preventDefault();
        return true;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    const active = root.activeElement;
    if (event.shiftKey && (active === first || !panel?.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
    return true;
}

function restoreReferenceFocus(root: ShadowRoot, tokenId: string): void {
    root.querySelector<HTMLElement>(`[data-open-token-reference="${tokenId}"]`)?.focus();
}

function restoreSearch(root: ShadowRoot, selector: string): void {
    const search = root.querySelector<HTMLInputElement>(selector);
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
}

function isTokenFilter(value: string | undefined): value is ThemeTokenFilter {
    return ["all", "color", "font-family", "length", "number", "shadow", "value"].includes(value ?? "");
}
