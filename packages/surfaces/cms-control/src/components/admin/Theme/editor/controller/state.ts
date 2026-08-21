import type { ThemeSettings } from "@bernouy/cms-content";

import { themeSelectionFromUrl, type ThemeSelection } from "../../events";
import {
    addCategory,
    addTheme,
    addToken,
    currentToken,
    type NewThemeToken,
    removeCategory,
    removeToken,
    renameTheme,
    updateCategory,
    updateToken,
} from "../model";
import type { ThemeEditorViewState } from "../view";

export class ThemeEditorState {
    selection: ThemeSelection = { sourceId: "", categoryId: "" };
    mode: "light" | "dark" = "light";
    settings: ThemeSettings | null = null;
    selectedThemeId = "";

    applyLoaded(settings: ThemeSettings): void {
        this.settings = structuredClone(settings);
        const url = new URL(window.location.href);
        const requestedThemeId = url.searchParams.get("theme");
        this.selectedThemeId =
            this.settings.themes.find((theme) => theme.id === requestedThemeId)?.id ??
            this.settings.themes.find((theme) => theme.id === this.settings?.activeThemeId)?.id ??
            this.settings.themes[0]?.id ??
            "";
        this.mode = url.searchParams.get("mode") === "dark" ? "dark" : "light";
        this.selection = themeSelectionFromUrl(this.settings.sources);
    }

    viewState(): ThemeEditorViewState | undefined {
        if (!this.settings) {
            return undefined;
        }
        return {
            settings: this.settings,
            selection: this.selection,
            selectedThemeId: this.selectedThemeId,
            mode: this.mode,
        };
    }

    createTheme(name?: string): boolean {
        if (!this.settings) {
            return false;
        }
        this.selectedThemeId = addTheme(this.settings, name);
        return true;
    }

    renameTheme(name: string): boolean {
        return Boolean(this.settings && renameTheme(this.settings, this.selectedThemeId, name));
    }

    createCategory(label?: string, description?: string): ReturnType<typeof addCategory> {
        if (!this.settings) {
            return undefined;
        }
        const added = addCategory(this.settings, this.selection, label, description);
        if (added) {
            this.selection = { sourceId: added.sourceId, categoryId: added.category.id };
        }
        return added;
    }

    updateCategory(label: string, description: string): ReturnType<typeof updateCategory> {
        return this.settings ? updateCategory(this.settings, this.selection, label, description) : undefined;
    }

    createToken(draft?: NewThemeToken): boolean {
        if (!this.settings) {
            return false;
        }
        return addToken(this.settings, this.selection, draft);
    }

    token(tokenId: string): ReturnType<typeof currentToken> {
        return currentToken(this.settings, this.selection, tokenId);
    }

    updateToken(tokenId: string, label: string, description: string): boolean {
        return Boolean(this.settings && updateToken(this.settings, this.selection, tokenId, label, description));
    }

    deleteCategory(): ReturnType<typeof removeCategory> {
        if (!this.settings) {
            return undefined;
        }
        const removed = removeCategory(this.settings, this.selection);
        if (removed) {
            this.selection = removed.selection;
        }
        return removed;
    }

    deleteToken(tokenId: string): boolean {
        return Boolean(this.settings && removeToken(this.settings, this.selection, tokenId));
    }

    selectCategory(selection: ThemeSelection): boolean {
        const source = this.settings?.sources.find((item) => item.id === selection.sourceId);
        if (!source?.categories.some((category) => category.id === selection.categoryId)) {
            return false;
        }
        this.selection = selection;
        return true;
    }
}
