import { Component } from "@bernouy/components/base";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { callCapability, CapabilityError, waitForOperation } from "./runtime/client";
import type {
    Catalogue,
    CollectionDetail,
    CatalogueRelease,
    MigrationPlan,
    OperationalStatus,
    Operations,
} from "./runtime/model";
import { renderActivity, renderInstalled, renderReleases, renderSummary, setBusy } from "./runtime/render";
import { initializeWorkspace } from "./runtime/workspace";

export class Bloc extends Component {
    private lifecycle = new AbortController();
    private catalogue: Catalogue = { revision: 0, repositories: [], releases: [], installed: [] };
    private status: OperationalStatus = { core: "ready", maintenance: false };
    private operations: Operations = { items: [] };
    private configuration: CollectionDetail | null = null;
    private migration: { plan: MigrationPlan; release: CatalogueRelease } | null = null;

    constructor() {
        super({ css, template });
        initializeWorkspace(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.lifecycle = new AbortController();
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.shadowRoot?.addEventListener("input", this.handleInput);
        void this.load();
    }

    disconnectedCallback(): void {
        this.lifecycle.abort();
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("input", this.handleInput);
    }

    private load = async (): Promise<void> => {
        await this.run(async () => {
            [this.catalogue, this.status, this.operations] = await Promise.all([
                callCapability<Catalogue>("ulvia.cms.collections", "catalogue", {}),
                callCapability<OperationalStatus>("ulvia.cms.operations", "status", { limit: 20 }),
                callCapability<Operations>("ulvia.cms.operations", "list", { limit: 50 }),
            ]);
            this.render();
        }, "Collection workspace refreshed.");
    };

    private handleClick = (event: Event): void => {
        const control = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!control) {
            return;
        }
        if (control.dataset.tab) {
            this.selectTab(control.dataset.tab);
            return;
        }
        const action = control.dataset.action;
        if (!action) {
            return;
        }
        if (["save-configuration", "apply-migration"].includes(action)) {
            event.preventDefault();
        }
        const release = this.catalogue.releases.find(({ digest }) => digest === control.dataset.key);
        if (action === "refresh") {
            void this.load();
        } else if (action === "configure" && control.dataset.key) {
            void this.openConfiguration(control.dataset.key);
        } else if (action === "save-configuration") {
            void this.saveConfiguration();
        } else if (release && action === "install") {
            void this.install(release);
        } else if (release && action === "upgrade") {
            void this.upgrade(release);
        } else if (release && action === "plan") {
            void this.planMigration(release);
        } else if (action === "apply-migration") {
            void this.applyMigration();
        }
    };

    private handleInput = (event: Event): void => {
        const input = event.target as HTMLInputElement;
        if (input.dataset.search === "installed") {
            renderInstalled(this.required("[data-installed]"), this.catalogue.installed, input.value.toLowerCase());
        } else if (input.dataset.search === "repository") {
            renderReleases(this.required("[data-releases]"), this.catalogue, input.value.toLowerCase());
        }
    };

    private install(release: CatalogueRelease): Promise<void> {
        return this.mutate(
            "install",
            { expectedRevision: this.catalogue.revision, targets: [reference(release)] },
            "Collection installed.",
        );
    }

    private upgrade(release: CatalogueRelease): Promise<void> {
        return this.mutate(
            "upgrade",
            { expectedRevision: this.catalogue.revision, target: reference(release) },
            "Collection upgraded.",
        );
    }

    private async openConfiguration(collectionId: string): Promise<void> {
        await this.run(async () => {
            this.configuration = await callCapability<CollectionDetail>("ulvia.cms.collections", "get", {
                collectionId,
            });
            this.required("[data-configuration-title]").textContent = this.configuration.collectionId;
            this.required<HTMLTextAreaElement>("[data-configuration-json]").value =
                this.configuration.configurationJson;
            this.required<HTMLDialogElement>("[data-configuration]").showModal();
        });
    }

    private async saveConfiguration(): Promise<void> {
        if (!this.configuration) {
            return;
        }
        const value = this.required<HTMLTextAreaElement>("[data-configuration-json]").value;
        try {
            JSON.parse(value);
        } catch {
            this.required("[data-dialog-error]").textContent = "Configuration must be valid JSON.";
            return;
        }
        await this.mutate(
            "update-configuration",
            {
                collectionId: this.configuration.collectionId,
                expectedRevision: this.configuration.revision,
                configurationJson: value,
            },
            "Configuration saved.",
        );
        this.required<HTMLDialogElement>("[data-configuration]").close();
    }

    private async planMigration(release: CatalogueRelease): Promise<void> {
        await this.run(async () => {
            const plan = await callCapability<MigrationPlan>("ulvia.cms.collections", "plan-migration", {
                expectedRevision: this.catalogue.revision,
                targets: [reference(release)],
            });
            this.migration = { plan, release };
            this.renderMigration(plan);
            this.required<HTMLDialogElement>("[data-migration]").showModal();
        });
    }

    private async applyMigration(): Promise<void> {
        if (!this.migration || this.migration.plan.blockedReasons.length) {
            return;
        }
        await this.run(async () => {
            const queued = await callCapability<{ operationId: string }>(
                "ulvia.cms.collections",
                "apply-migration",
                {
                    expectedRevision: this.migration!.plan.expectedRevision,
                    planDigest: this.migration!.plan.planDigest,
                    targets: [reference(this.migration!.release)],
                },
                crypto.randomUUID(),
            );
            await waitForOperation(queued.operationId, this.lifecycle.signal);
            this.required<HTMLDialogElement>("[data-migration]").close();
            await this.refreshData();
        }, "Migration completed.");
    }

    private mutate(capabilityId: string, input: unknown, success: string): Promise<void> {
        return this.run(async () => {
            await callCapability("ulvia.cms.collections", capabilityId, input);
            await this.refreshData();
        }, success);
    }

    private async refreshData(): Promise<void> {
        [this.catalogue, this.status, this.operations] = await Promise.all([
            callCapability<Catalogue>("ulvia.cms.collections", "catalogue", {}),
            callCapability<OperationalStatus>("ulvia.cms.operations", "status", { limit: 20 }),
            callCapability<Operations>("ulvia.cms.operations", "list", { limit: 50 }),
        ]);
        this.render();
    }

    private async run(task: () => Promise<void>, success = ""): Promise<void> {
        const root = this.shadowRoot!;
        setBusy(root, true);
        this.notice("Working…");
        try {
            await task();
            this.notice(success);
        } catch (error) {
            const suffix = error instanceof CapabilityError && error.code ? ` (${error.code})` : "";
            this.notice(`${error instanceof Error ? error.message : "Request failed"}${suffix}`, true);
        } finally {
            setBusy(root, false);
        }
    }

    private render(): void {
        renderSummary(this.required("[data-summary]"), this.catalogue, this.status);
        renderInstalled(this.required("[data-installed]"), this.catalogue.installed, "");
        renderReleases(this.required("[data-releases]"), this.catalogue, "");
        renderActivity(this.required("[data-activity]"), this.operations);
        this.required("[data-maintenance]").textContent = this.status.maintenance ? "Maintenance active" : "Core ready";
    }

    private renderMigration(plan: MigrationPlan): void {
        const target = this.required("[data-migration-summary]");
        target.replaceChildren();
        const summary = document.createElement("p");
        summary.textContent = `${plan.totalPages} Pages · ${plan.operationCount} transformations`;
        target.append(summary);
        for (const reason of plan.blockedReasons) {
            const item = document.createElement("p");
            item.textContent = reason;
            target.append(item);
        }
        this.required<HTMLButtonElement>('[data-action="apply-migration"]').disabled = plan.blockedReasons.length > 0;
    }

    private selectTab(tab: string): void {
        for (const button of this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
            button.setAttribute("aria-selected", String(button.dataset.tab === tab));
        }
        for (const panel of this.shadowRoot!.querySelectorAll<HTMLElement>("[data-panel]")) {
            panel.hidden = panel.dataset.panel !== tab;
        }
    }

    private notice(message: string, error = false): void {
        const notice = this.required("[data-notice]");
        notice.textContent = message;
        notice.toggleAttribute("data-error", error);
    }

    private required<T extends Element = HTMLElement>(selector: string): T {
        const element = this.shadowRoot?.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Missing collection manager element: ${selector}`);
        }
        return element;
    }
}

function reference(release: CatalogueRelease) {
    const { repositoryId, publisherId, collectionId, version, digest } = release;
    return { repositoryId, publisherId, collectionId, version, digest };
}
