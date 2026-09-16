import type { ThemeSettings } from "@bernouy/cms-content";
import type { ThemeSelection } from "cms-control/components/admin/Theme/events";
import { removeCategory, removeToken } from "cms-control/components/admin/Theme/editor/model";
import { persistThemeEditingDraft } from "../draft";
import { closeModal, openModal, setBusy, setStatus, setText } from "./modal";

type Removal = { kind: "group" | "token"; selection: ThemeSelection; tokenId?: string };

export class SiteVariableRemoval {
    private settings: ThemeSettings | undefined;
    private removal: Removal | undefined;

    constructor(
        private readonly host: HTMLElement,
        private readonly returnToCatalog: () => Promise<void>,
    ) {}

    connect(): void {
        this.host.addEventListener("click", this.onClick);
    }

    disconnect(): void {
        this.host.removeEventListener("click", this.onClick);
    }

    open(action: "remove-group" | "remove-token", trigger: HTMLElement, settings: ThemeSettings): void {
        this.settings = settings;
        setStatus(this.host, "[data-site-variable-remove-status]", "");
        const kind = action === "remove-group" ? "group" : "token";
        const selection = {
            sourceId: trigger.dataset.sourceId ?? "",
            categoryId: trigger.dataset.categoryId ?? "",
        };
        const tokenId = trigger.dataset.tokenId ?? "";
        const source = settings.sources.find(({ id }) => id === selection.sourceId);
        const category = source?.categories.find(({ id }) => id === selection.categoryId);
        const token = category?.tokens.find(({ id }) => id === tokenId);
        this.removal = { kind, selection, ...(kind === "token" ? { tokenId } : {}) };
        setText(this.host, "[data-site-variable-remove-title]", `Delete ${kind}`);
        setText(
            this.host,
            "[data-site-variable-remove-copy]",
            kind === "group"
                ? `Delete “${category?.label ?? "this group"}” and all its variables?`
                : `Delete “${token?.label ?? "this variable"}” from every theme?`,
        );
        closeModal(this.host, "[data-site-variable-catalog-modal]");
        openModal(this.host, "[data-site-variable-remove-modal]");
    }

    private readonly onClick = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-site-variable-remove-cancel]")) {
            closeModal(this.host, "[data-site-variable-remove-modal]");
            void this.returnToCatalog();
        } else if (target?.closest("[data-site-variable-remove-confirm]")) {
            void this.confirm();
        }
    };

    private async confirm(): Promise<void> {
        if (!this.settings || !this.removal) {
            return;
        }
        const removed =
            this.removal.kind === "group"
                ? removeCategory(this.settings, this.removal.selection)
                : removeToken(this.settings, this.removal.selection, this.removal.tokenId ?? "");
        if (!removed) {
            setStatus(this.host, "[data-site-variable-remove-status]", "Keep at least one site variable group.", true);
            return;
        }
        setBusy(this.host, true);
        try {
            await persistThemeEditingDraft(this.settings, this.host.ownerDocument);
            closeModal(this.host, "[data-site-variable-remove-modal]");
            this.removal = undefined;
            await this.returnToCatalog();
        } catch (error) {
            setStatus(
                this.host,
                "[data-site-variable-remove-status]",
                error instanceof Error ? error.message : "Unable to save site variables.",
                true,
            );
        } finally {
            setBusy(this.host, false);
        }
    }
}
