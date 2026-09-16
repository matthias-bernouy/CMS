import type { ThemeSettings } from "@bernouy/cms-content";
import { loadThemeEditingDraft } from "../draft";
import { SiteVariableEditor } from "./SiteVariableEditor";
import { SiteVariableRemoval } from "./SiteVariableRemoval";
import { closeModal, openModal, setStatus } from "./modal";
import { renderSiteVariableCatalog } from "./siteVariableView";

export class SiteVariablesController {
    private settings: ThemeSettings | undefined;
    private readonly editor: SiteVariableEditor;
    private readonly removal: SiteVariableRemoval;

    constructor(private readonly host: HTMLElement) {
        this.editor = new SiteVariableEditor(host, () => this.openCatalog());
        this.removal = new SiteVariableRemoval(host, () => this.openCatalog());
    }

    connect(): void {
        this.host.addEventListener("click", this.onClick);
        this.editor.connect();
        this.removal.connect();
    }

    disconnect(): void {
        this.host.removeEventListener("click", this.onClick);
        this.editor.disconnect();
        this.removal.disconnect();
    }

    private readonly onClick = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        const action = target?.closest<HTMLElement>("[data-site-variable-action]");
        if (action) {
            void this.handleAction(action);
        } else if (target?.closest("[data-site-variable-catalog-close]")) {
            closeModal(this.host, "[data-site-variable-catalog-modal]");
        }
    };

    private async handleAction(control: HTMLElement): Promise<void> {
        const action = control.dataset.siteVariableAction;
        if (action === "open") {
            await this.openCatalog();
        } else if (this.settings && (action === "remove-group" || action === "remove-token")) {
            this.removal.open(action, control, this.settings);
        } else if (
            this.settings &&
            (action === "create-group" ||
                action === "edit-group" ||
                action === "create-token" ||
                action === "edit-token")
        ) {
            this.editor.open(action, control, this.settings);
        }
    }

    private async openCatalog(): Promise<void> {
        setStatus(this.host, "[data-site-variable-status]", "Loading site variables…");
        openModal(this.host, "[data-site-variable-catalog-modal]");
        try {
            this.settings = await loadThemeEditingDraft();
            const catalog = this.host.querySelector<HTMLElement>("[data-site-variable-catalog]");
            if (catalog) {
                renderSiteVariableCatalog(catalog, this.settings);
            }
            setStatus(this.host, "[data-site-variable-status]", "");
        } catch (error) {
            setStatus(
                this.host,
                "[data-site-variable-status]",
                error instanceof Error ? error.message : "Unable to load site variables.",
                true,
            );
        }
    }
}
