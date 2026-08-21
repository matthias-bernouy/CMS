import type { ThemeToken, ThemeTokenType } from "@bernouy/cms-content";

import type { NewThemeToken } from "../model";

export type ContextDialogAction = "create-theme" | "rename-theme" | "create-group" | "edit-group";

export type ContextDialogValues = {
    themeName?: string;
    categoryLabel?: string;
    categoryDescription?: string;
};

export type ContextDialogSubmission = {
    action: ContextDialogAction;
    name: string;
    description: string;
};

export type VariableEditSubmission = {
    tokenId: string;
    label: string;
    description: string;
};

type TextControl = HTMLElement & { value: string };

export class ThemeEditorDialogs {
    private contextAction: ContextDialogAction | undefined;
    private editedTokenId: string | undefined;

    constructor(private readonly root: ShadowRoot) {}

    openContext(action: ContextDialogAction, values: ContextDialogValues): void {
        const creatingTheme = action === "create-theme";
        const editingTheme = action === "rename-theme";
        const title = creatingTheme
            ? "New theme"
            : editingTheme
              ? "Rename theme"
              : action === "create-group"
                ? "New group"
                : "Edit group";
        this.contextAction = action;
        this.query<HTMLElement>("[data-context-modal-title]").textContent = title;
        this.query<HTMLElement>("[data-context-modal]").setAttribute("aria-label", title);
        const name = this.query<TextControl>("[data-context-name]");
        this.clearInvalid(name);
        name.value = editingTheme ? (values.themeName ?? "") : "";
        this.query<TextControl>("[data-context-description]").value =
            action === "edit-group" ? (values.categoryDescription ?? "") : "";
        if (action === "edit-group") {
            name.value = values.categoryLabel ?? "";
        }
        this.query<HTMLElement>("[data-context-description-field]").hidden = creatingTheme || editingTheme;
        this.query<HTMLElement>("[data-context-submit]").textContent =
            creatingTheme || action === "create-group" ? "Create" : "Save";
        this.open("[data-context-modal]", name);
    }

    readContext(form: HTMLFormElement): ContextDialogSubmission | undefined {
        if (!form.reportValidity() || !this.contextAction) {
            return undefined;
        }
        const name = this.requiredValue(this.query<TextControl>("[data-context-name]"));
        if (!name) {
            return undefined;
        }
        return {
            action: this.contextAction,
            name,
            description: this.query<TextControl>("[data-context-description]").value.trim(),
        };
    }

    closeContext(): void {
        this.query<HTMLElement>("[data-context-modal]").removeAttribute("open");
        this.resetContext();
    }

    openVariable(): void {
        const name = this.query<TextControl>("[data-variable-name]");
        this.clearInvalid(name);
        this.resetVariable();
        this.query<TextControl>("[data-variable-type]").value = "color";
        this.open("[data-variable-modal]", name);
    }

    readVariable(form: HTMLFormElement): NewThemeToken | undefined {
        if (!form.reportValidity()) {
            return undefined;
        }
        const label = this.requiredValue(this.query<TextControl>("[data-variable-name]"));
        const type = this.query<TextControl>("[data-variable-type]").value;
        if (!label || !isThemeTokenType(type)) {
            return undefined;
        }
        return {
            label,
            description: this.query<TextControl>("[data-variable-description]").value.trim(),
            type,
        };
    }

    closeVariable(): void {
        this.query<HTMLElement>("[data-variable-modal]").removeAttribute("open");
        this.resetVariable();
    }

    openVariableEdit(token: ThemeToken): void {
        this.editedTokenId = token.id;
        const name = this.query<TextControl>("[data-variable-edit-name]");
        this.clearInvalid(name);
        name.value = token.label;
        this.query<TextControl>("[data-variable-edit-description]").value = token.description;
        this.query<HTMLElement>("[data-variable-edit-type]").textContent = tokenTypeLabel(token.type);
        this.open("[data-variable-edit-modal]", name);
    }

    readVariableEdit(form: HTMLFormElement): VariableEditSubmission | undefined {
        if (!form.reportValidity() || !this.editedTokenId) {
            return undefined;
        }
        const label = this.requiredValue(this.query<TextControl>("[data-variable-edit-name]"));
        if (!label) {
            return undefined;
        }
        return {
            tokenId: this.editedTokenId,
            label,
            description: this.query<TextControl>("[data-variable-edit-description]").value.trim(),
        };
    }

    editedVariableId(): string | undefined {
        return this.editedTokenId;
    }

    closeVariableEdit(): void {
        this.query<HTMLElement>("[data-variable-edit-modal]").removeAttribute("open");
        this.resetVariableEdit();
    }

    handleClose(event: Event): void {
        const modal = event.target as HTMLElement | null;
        if (modal?.matches("[data-context-modal]")) {
            this.resetContext();
        } else if (modal?.matches("[data-variable-modal]")) {
            this.resetVariable();
        } else if (modal?.matches("[data-variable-edit-modal]")) {
            this.resetVariableEdit();
        }
    }

    private open(selector: string, focusTarget: HTMLElement): void {
        this.query<HTMLElement>(selector).setAttribute("open", "");
        queueMicrotask(() => {
            focusTarget.focus();
        });
    }

    private resetContext(): void {
        this.contextAction = undefined;
        this.query<HTMLFormElement>("[data-context-form]").reset();
    }

    private resetVariable(): void {
        this.query<HTMLFormElement>("[data-variable-form]").reset();
    }

    private resetVariableEdit(): void {
        this.editedTokenId = undefined;
        this.query<HTMLFormElement>("[data-variable-edit-form]").reset();
    }

    private requiredValue(control: TextControl): string | undefined {
        const value = control.value.trim();
        if (value) {
            return value;
        }
        control.setAttribute("invalid", "");
        control.setAttribute("hint", "Name is required.");
        control.setAttribute("hint-level", "error");
        control.focus();
        return undefined;
    }

    private clearInvalid(control: HTMLElement): void {
        control.removeAttribute("invalid");
        control.removeAttribute("hint");
        control.removeAttribute("hint-level");
    }

    private query<T extends Element>(selector: string): T {
        return this.root.querySelector(selector) as T;
    }
}

function isThemeTokenType(value: string): value is ThemeTokenType {
    return ["color", "font-family", "length", "number", "shadow", "value"].includes(value);
}

function tokenTypeLabel(type: ThemeTokenType): string {
    return {
        color: "Color",
        "font-family": "Font family",
        length: "Length",
        number: "Number",
        shadow: "Shadow",
        value: "CSS value",
    }[type];
}
