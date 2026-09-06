import type { IntegrationManagement, IntegrationSettingsResponse } from "@bernouy/cms-integrations";
import { getIntegrationInstallation } from "../api";
import type { IntegrationInstallationDetail } from "../model";
import { managementRequest, readHealth, readSettings } from "./api";
import { renderCollectionSettings } from "./collections";
import { renderHealth } from "./presentation/health";
import { settingsDashboard } from "./dashboard";
import { renderSettings } from "./settings";
import { renderManagementShell } from "./presentation/shell";

export class IntegrationManagementView extends HTMLElement {
    private installation?: IntegrationInstallationDetail;
    private management?: IntegrationManagement;
    private settings?: IntegrationSettingsResponse;
    private busy = false;
    private revision = 0;
    private panel = new URL(window.location.href).searchParams.get("panel") === "health" ? "health" : "connection";
    connectedCallback(): void {
        void this.load();
    }
    disconnectedCallback(): void {
        this.revision += 1;
    }
    private async load(): Promise<void> {
        const revision = ++this.revision;
        const id = this.getAttribute("installation-id");
        if (!id) {
            return;
        }
        this.textContent = "Loading settings…";
        try {
            const installation = await getIntegrationInstallation(id);
            if (!this.isConnected || revision !== this.revision) {
                return;
            }
            this.installation = installation;
            this.management = installation.definition?.management;
            this.render();
            await this.showPanel();
        } catch (error) {
            if (revision === this.revision) {
                this.textContent = error instanceof Error ? error.message : "Unable to load settings.";
            }
        }
    }
    private render(): void {
        const configurationLabel =
            this.installation?.integrationType === "collection"
                ? "Availability"
                : this.management?.settings?.dashboardId
                  ? "Settings"
                  : "Connection";
        renderManagementShell(this, this.installation?.status ?? "unknown", configurationLabel, this.panel, (panel) => {
            if (!this.busy) {
                this.panel = panel;
                this.render();
                void this.showPanel();
            }
        });
    }
    private async showPanel(refresh = false): Promise<void> {
        const revision = ++this.revision;
        const root = this.querySelector<HTMLElement>("[data-management-content]")!;
        const installation = this.installation!;
        root.textContent = "Loading…";
        try {
            if (this.panel === "health") {
                const health = await readHealth(installation.id, refresh);
                if (revision !== this.revision || !this.isConnected) {
                    return;
                }
                renderHealth(root, health, this.management ?? { schemaVersion: 1 }, (id) => void this.runAction(id));
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = "Refresh health";
                button.addEventListener("click", () => void this.showPanel(true));
                root.prepend(button);
            } else if (installation.integrationType === "collection") {
                renderCollectionSettings(root, installation, (message) => this.status(message));
            } else if (this.management?.settings?.dashboardId) {
                const dashboard = await settingsDashboard(this.management.settings.dashboardId);
                if (revision !== this.revision || !this.isConnected) {
                    return;
                }
                root.replaceChildren(dashboard);
            } else if (this.management?.settings) {
                this.settings = await readSettings(installation.id);
                if (revision !== this.revision || !this.isConnected) {
                    return;
                }
                renderSettings(
                    root,
                    this.management.settings.fields,
                    this.settings,
                    (values) => void this.save(values),
                );
                if (
                    this.management.settings.applyFunctionId &&
                    this.settings.savedRevision !== this.settings.appliedRevision
                ) {
                    const apply = document.createElement("button");
                    apply.type = "button";
                    apply.textContent = "Retry applying configuration";
                    apply.addEventListener("click", () => void this.runAction("apply-settings"));
                    root.append(apply);
                }
            } else {
                root.textContent = "This source has no connection settings.";
            }
        } catch (error) {
            if (revision === this.revision) {
                root.textContent = error instanceof Error ? error.message : "Unable to load this panel.";
            }
        }
    }
    private async save(values: Record<string, unknown>): Promise<void> {
        if (this.busy || !this.settings) {
            return;
        }
        this.setBusy(true);
        this.status("Saving settings…");
        try {
            this.settings = await managementRequest(this.installation!.id, "settings", {
                values,
                expectedRevision: this.settings.savedRevision,
            });
            await this.showPanel();
            this.status("Settings saved.");
        } catch (error) {
            this.status(error instanceof Error ? error.message : "Unable to save settings.");
        } finally {
            this.setBusy(false);
        }
    }
    private async runAction(actionId: string): Promise<void> {
        if (this.busy) {
            return;
        }
        this.setBusy(true);
        this.status("Applying configuration…");
        try {
            await managementRequest(this.installation!.id, "action", { actionId, input: {} });
            this.status("Action completed.");
            await this.showPanel(true);
        } catch (error) {
            this.status(error instanceof Error ? error.message : "Action failed.");
        } finally {
            this.setBusy(false);
        }
    }
    private setBusy(busy: boolean): void {
        this.busy = busy;
        this.querySelector<HTMLElement>("[data-management-content]")?.toggleAttribute("inert", busy);
        this.toggleAttribute("aria-busy", busy);
    }
    private status(message: string): void {
        const status = this.querySelector("[data-management-status]");
        if (status) {
            status.textContent = message;
        }
    }
}
if (!customElements.get("cms-integration-management")) {
    customElements.define("cms-integration-management", IntegrationManagementView);
}
