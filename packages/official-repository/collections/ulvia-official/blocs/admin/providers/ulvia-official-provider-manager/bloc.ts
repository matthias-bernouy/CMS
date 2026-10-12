import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { callCapability, CapabilityError } from "./runtime/client";
import type { ProviderDetail, ProviderList } from "./runtime/model";
import { ProviderView } from "./runtime/view";
import { initializeWorkspace } from "./runtime/workspace";

export class Bloc extends Component {
    private lifecycle = new AbortController();
    private list: ProviderList = { selectionRevision: 0, installations: [], selections: [] };
    private details: ProviderDetail[] | null = null;
    private busy = false;
    private readonly view: ProviderView;

    constructor() {
        super({ css, template });
        initializeWorkspace(this.shadowRoot!);
        this.view = new ProviderView(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.lifecycle = new AbortController();
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.shadowRoot?.addEventListener("submit", this.handleSubmit);
        void this.load();
    }

    disconnectedCallback(): void {
        this.lifecycle.abort();
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("submit", this.handleSubmit);
    }

    private load = (): Promise<void> =>
        this.run(async () => {
            this.list = await callCapability<ProviderList>("list", {}, this.lifecycle.signal);
            this.details = null;
            this.view.render(this.list);
        }, "Provider graph refreshed.");

    private handleClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button) {
            return;
        }
        if (button.dataset.tab) {
            this.view.selectTab(button.dataset.tab);
            if (button.dataset.tab === "routing" && !this.details) {
                void this.loadRouting();
            }
            return;
        }
        if (button.dataset.action === "refresh") {
            void this.load();
        } else if (["enable", "disable", "revoke"].includes(button.dataset.action ?? "")) {
            void this.changeStatus(button);
        }
    };

    private handleSubmit = (event: Event): void => {
        if (!(event.target instanceof HTMLFormElement) || !event.target.matches("[data-routing-form]")) {
            return;
        }
        event.preventDefault();
        void this.saveRouting();
    };

    private loadRouting(): Promise<void> {
        return this.run(async () => {
            const details: ProviderDetail[] = [];
            for (let offset = 0; offset < this.list.installations.length; offset += 8) {
                const batch = this.list.installations.slice(offset, offset + 8);
                details.push(
                    ...(await Promise.all(
                        batch.map(({ id }) =>
                            callCapability<ProviderDetail>("get", { installationId: id }, this.lifecycle.signal),
                        ),
                    )),
                );
            }
            this.details = details;
            this.view.renderRouting(this.list, this.details);
        }, "Contract implementations loaded.");
    }

    private async changeStatus(button: HTMLButtonElement): Promise<void> {
        const action = button.dataset.action as "enable" | "disable" | "revoke";
        if (action === "revoke" && button.dataset.confirmed !== "true") {
            button.dataset.confirmed = "true";
            button.textContent = "Confirm revoke";
            this.view.notice(
                "Revocation is terminal and deletes stored credentials. Select Confirm revoke to continue.",
            );
            return;
        }
        await this.run(async () => {
            await callCapability(
                "set-status",
                {
                    installationId: button.dataset.key,
                    expectedRevision: Number(button.dataset.revision),
                    action,
                },
                this.lifecycle.signal,
            );
            this.list = await callCapability<ProviderList>("list", {}, this.lifecycle.signal);
            this.details = null;
            this.view.render(this.list);
        }, `Provider ${action}d.`);
    }

    private saveRouting(): Promise<void> {
        return this.run(async () => {
            const result = await callCapability<{ revision: number; selections: ProviderList["selections"] }>(
                "replace-selections",
                { expectedRevision: this.list.selectionRevision, selections: this.view.selections() },
                this.lifecycle.signal,
            );
            this.list = { ...this.list, selectionRevision: result.revision, selections: result.selections };
            if (this.details) {
                this.view.renderRouting(this.list, this.details);
            }
            this.view.render(this.list);
        }, "Contract routing saved.");
    }

    private async run(task: () => Promise<void>, success: string): Promise<void> {
        if (this.busy) {
            return;
        }
        this.busy = true;
        this.view.setBusy(true);
        this.view.notice("Working…");
        try {
            await task();
            this.view.notice(success);
        } catch (error) {
            const suffix = error instanceof CapabilityError ? ` (${error.code})` : "";
            this.view.notice(`${error instanceof Error ? error.message : "Request failed"}${suffix}`, true);
        } finally {
            this.view.setBusy(false);
            this.busy = false;
        }
    }
}
