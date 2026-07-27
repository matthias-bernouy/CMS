import type { ThemeSettings } from "@bernouy/cms-content";

import { themeSelectionFromUrl, type ThemeSelection } from "../../events";
import { addCategory, addTheme, addToken, removeCategory, removeToken } from "../model";
import type { ThemeEditorViewState } from "../view";

export class ThemeEditorState {
    selection: ThemeSelection = { sourceId: "", categoryId: "" };
    mode: "light" | "dark" = "light";
    settings: ThemeSettings | null = null;
    selectedThemeId = "";

    applyLoaded(settings: ThemeSettings): void {
        this.settings = structuredClone(settings);
        this.selectedThemeId = this.settings.activeThemeId || this.settings.themes[0]?.id || "";
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

    createTheme(): boolean {
        if (!this.settings) {
            return false;
        }
        this.selectedThemeId = addTheme(this.settings);
        return true;
    }

    createCategory(): ReturnType<typeof addCategory> {
        if (!this.settings) {
            return undefined;
        }
        const added = addCategory(this.settings, this.selection);
        if (added) {
            this.selection = { sourceId: added.sourceId, categoryId: added.category.id };
        }
        return added;
    }

    createToken(): boolean {
        if (!this.settings) {
            return false;
        }
        return addToken(this.settings, this.selection);
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
