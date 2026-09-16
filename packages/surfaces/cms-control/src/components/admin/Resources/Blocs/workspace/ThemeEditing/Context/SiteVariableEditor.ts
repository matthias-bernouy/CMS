import type { ThemeSettings, ThemeTokenType } from "@bernouy/cms-content";
import { addCategory, addToken, updateCategory, updateToken } from "cms-control/components/admin/Theme/editor/model";
import type { ThemeSelection } from "cms-control/components/admin/Theme/events";
import { persistThemeEditingDraft } from "../draft";
import { closeModal, control, openModal, setBusy, setStatus, setText } from "./modal";

export type SiteVariableEditorAction = "create-group" | "edit-group" | "create-token" | "edit-token";

export class SiteVariableEditor {
    private settings: ThemeSettings | undefined;
    private action: SiteVariableEditorAction | undefined;
    private selection: ThemeSelection = { sourceId: "", categoryId: "" };
    private tokenId = "";

    constructor(
        private readonly host: HTMLElement,
        private readonly returnToCatalog: () => Promise<void>,
    ) {}

    connect(): void {
        this.host.addEventListener("click", this.onClick);
        this.host.addEventListener("submit", this.onSubmit);
    }

    disconnect(): void {
        this.host.removeEventListener("click", this.onClick);
        this.host.removeEventListener("submit", this.onSubmit);
    }

    open(action: SiteVariableEditorAction, trigger: HTMLElement, settings: ThemeSettings): void {
        this.settings = settings;
        this.action = action;
        setStatus(this.host, "[data-site-variable-editor-status]", "");
        this.selection = {
            sourceId: trigger.dataset.sourceId ?? "",
            categoryId: trigger.dataset.categoryId ?? "",
        };
        this.tokenId = trigger.dataset.tokenId ?? "";
        const source = settings.sources.find(({ id }) => id === this.selection.sourceId);
        const category = source?.categories.find(({ id }) => id === this.selection.categoryId);
        const token = category?.tokens.find(({ id }) => id === this.tokenId);
        const groupAction = action === "create-group" || action === "edit-group";
        const creating = action === "create-group" || action === "create-token";
        control(this.host, "[data-site-variable-name]").value =
            action === "edit-group" ? (category?.label ?? "") : action === "edit-token" ? (token?.label ?? "") : "";
        control(this.host, "[data-site-variable-description]").value =
            action === "edit-group"
                ? (category?.description ?? "")
                : action === "edit-token"
                  ? (token?.description ?? "")
                  : "";
        const type = control(this.host, "[data-site-variable-type]");
        type.value = token?.type ?? "color";
        type.hidden = groupAction;
        type.toggleAttribute("disabled", action === "edit-token");
        setText(
            this.host,
            "[data-site-variable-editor-title]",
            `${creating ? "New" : "Edit"} ${groupAction ? "group" : "variable"}`,
        );
        setText(this.host, "[data-site-variable-editor-submit]", creating ? "Create" : "Save");
        closeModal(this.host, "[data-site-variable-catalog-modal]");
        openModal(this.host, "[data-site-variable-editor-modal]");
        queueMicrotask(() => control(this.host, "[data-site-variable-name]").focus());
    }

    private readonly onClick = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-site-variable-editor-cancel]")) {
            closeModal(this.host, "[data-site-variable-editor-modal]");
            void this.returnToCatalog();
        }
    };

    private readonly onSubmit = (event: Event): void => {
        const form = event.target;
        if (form instanceof HTMLFormElement && form.matches("[data-site-variable-editor-form]")) {
            event.preventDefault();
            void this.save(form);
        }
    };

    private async save(form: HTMLFormElement): Promise<void> {
        if (!this.settings || !this.action || !form.reportValidity()) {
            return;
        }
        const name = control(this.host, "[data-site-variable-name]").value.trim();
        const description = control(this.host, "[data-site-variable-description]").value.trim();
        const type = control(this.host, "[data-site-variable-type]").value;
        if (!name || (!this.action.endsWith("group") && !isThemeTokenType(type))) {
            return;
        }
        const tokenType = isThemeTokenType(type) ? type : "value";
        if (!this.apply(name, description, tokenType)) {
            setStatus(
                this.host,
                "[data-site-variable-editor-status]",
                "This site variable could not be changed.",
                true,
            );
            return;
        }
        setBusy(this.host, true);
        try {
            await persistThemeEditingDraft(this.settings, this.host.ownerDocument);
            closeModal(this.host, "[data-site-variable-editor-modal]");
            this.action = undefined;
            await this.returnToCatalog();
        } catch (error) {
            setStatus(
                this.host,
                "[data-site-variable-editor-status]",
                error instanceof Error ? error.message : "Unable to save site variables.",
                true,
            );
        } finally {
            setBusy(this.host, false);
        }
    }

    private apply(name: string, description: string, type: ThemeTokenType): unknown {
        return this.action === "create-group"
            ? addCategory(this.settings!, this.selection, name, description)
            : this.action === "edit-group"
              ? updateCategory(this.settings!, this.selection, name, description)
              : this.action === "create-token"
                ? addToken(this.settings!, this.selection, { label: name, description, type })
                : updateToken(this.settings!, this.selection, this.tokenId, name, description);
    }
}

function isThemeTokenType(value: string): value is ThemeTokenType {
    return ["color", "font-family", "length", "number", "shadow", "value"].includes(value);
}
