import type { ThemeSettings } from "@bernouy/cms-content";

import type { ThemeSelection } from "../../events";
import type { LoadedThemeSettings } from "../api";
import { addCategory, addTheme, addToken, selectionFromUrl } from "../model";
import type { ThemeEditorViewState } from "../view";
import { ThemeExplorerController } from "./explorerController";

export class ThemeEditorState {
    selection: ThemeSelection = { sourceId: "", categoryId: "" };
    mode: "light" | "dark" = "light";
    settings: ThemeSettings | null = null;
    selectedThemeId = "";
    siteName = "";
    canPersist = true;
    readonly explorer = new ThemeExplorerController();

    applyLoaded(loaded: LoadedThemeSettings): void {
        this.canPersist = loaded.canPersist;
        this.settings = loaded.settings;
        this.siteName = loaded.siteName;
        this.selectedThemeId = this.settings.activeThemeId || this.settings.themes[0]?.id || "";
        this.selection = selectionFromUrl(this.settings);
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
            siteName: this.siteName,
            canPersist: this.canPersist,
            tokenFilter: this.explorer.tokenFilter,
            tokenSearch: this.explorer.tokenSearch,
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
            this.explorer.reset();
        }
        return added;
    }

    createToken(): boolean {
        if (!this.settings) {
            return false;
        }
        if (!addToken(this.settings, this.selection)) {
            return false;
        }
        this.explorer.reset();
        return true;
    }

    selectCategory(selection: ThemeSelection): boolean {
        const source = this.settings?.sources.find((item) => item.id === selection.sourceId);
        if (!source?.categories.some((category) => category.id === selection.categoryId)) {
            return false;
        }
        this.selection = selection;
        this.explorer.reset();
        return true;
    }
}
