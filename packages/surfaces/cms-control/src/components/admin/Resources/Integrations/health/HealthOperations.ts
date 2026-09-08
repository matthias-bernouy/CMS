import { observeSource, readSourceData, setSourceContext } from "@bernouy/components";
import { CMS_SOURCE_SUCCESS_EVENT } from "@bernouy/components/binding";
import type { IntegrationInstallationDetail } from "../model";
import { route } from "../api";
import { mountHealth } from "./presentation/health";
import {
    cancelIntegrationUpgrade,
    confirmIntegrationUpgrade,
    openIntegrationUpgrade,
} from "../ui/actions/installation";
import { healthActions } from "./actions";
import markup from "cms-control/static/admin/_operations/health/operations.html" with { type: "text" };

class HealthOperations extends HTMLElement {
    private stop?: () => void;
    private managementSignature = "";
    private health?: ReturnType<typeof mountHealth>;
    connectedCallback(): void {
        const id = this.getAttribute("installation-id");
        if (!id) {
            return;
        }
        const template = document.createElement("template");
        template.innerHTML = markup as unknown as string;
        this.replaceChildren(template.content.cloneNode(true));
        this.id = `health-installation-${encodeURIComponent(id)}`;
        this.setAttribute(
            "cms-source",
            `${route("/api/integrations/installations")}?id=${encodeURIComponent(id)} as integration`,
        );
        this.setAttribute(
            "cms-reload-on",
            `health:detail:${encodeURIComponent(this.getAttribute("installation-id")!)}`,
        );
        const sync = this.querySelector("[data-sync-form]")!;
        sync.setAttribute(
            "cms-source",
            `${route("/api/integrations/installations/rerun")}?id=${encodeURIComponent(id)} as result`,
        );
        sync.setAttribute("cms-source-success-reload", `#${this.id}`);
        this.querySelector<HTMLElement>("[data-upgrade-panel]")!.dataset.integrationId = id;
        setSourceContext(this, () => {
            const installation = readSourceData(this) as IntegrationInstallationDetail | undefined;
            return { healthHasActions: Boolean(installation?.definition?.management?.actions?.length) };
        });
        this.stop = observeSource(this, (state) => {
            const installation = state.data as IntegrationInstallationDetail | undefined;
            if (installation?.id === id && !state.loading && !state.error) {
                const management = installation.definition?.management ?? { schemaVersion: 1 };
                const signature = JSON.stringify(management);
                if (this.health && signature === this.managementSignature) {
                    return;
                }
                this.managementSignature = signature;
                const actions = this.querySelector<HTMLElement>("[data-health-actions]");
                actions?.replaceChildren();
                const run = actions ? healthActions(actions, id, management) : () => {};
                this.health = mountHealth(this.querySelector("[data-health-content]")!, id, management, run);
            }
        });
        this.addEventListener("click", this.onClick);
        this.addEventListener(CMS_SOURCE_SUCCESS_EVENT, this.success);
        document.addEventListener("integration:updated", this.reload);
    }
    refresh(): void {
        this.health?.refresh();
    }
    disconnectedCallback(): void {
        this.stop?.();
        this.health = undefined;
        this.removeEventListener("click", this.onClick);
        this.removeEventListener(CMS_SOURCE_SUCCESS_EVENT, this.success);
        document.removeEventListener("integration:updated", this.reload);
    }
    private reload = (): void => {
        this.ownerDocument.dispatchEvent(
            new Event(`health:detail:${encodeURIComponent(this.getAttribute("installation-id")!)}`),
        );
        this.health?.refresh();
        this.closest("cms-health-row")
            ?.querySelector<HTMLElement & { refresh(): void }>("cms-health-summary")
            ?.refresh();
    };
    private success = (event: Event): void => {
        if ((event.target as Element).matches("[data-sync-form]")) {
            this.health?.refresh();
            this.closest("cms-health-row")
                ?.querySelector<HTMLElement & { refresh(): void }>("cms-health-summary")
                ?.refresh();
        } else if ((event.target as Element).closest("[data-health-actions]")) {
            this.reload();
        }
    };
    private onClick = (event: Event): void => {
        if ((event.target as Element).closest("[data-health-retry-installation]")) {
            this.reload();
            return;
        }
        const target = (event.target as Element).closest<HTMLElement>(
            "[data-upgrade-open], [data-upgrade-cancel], [data-upgrade-confirm]",
        );
        if (target?.hasAttribute("data-upgrade-open")) {
            void openIntegrationUpgrade(target);
        } else if (target?.hasAttribute("data-upgrade-cancel")) {
            cancelIntegrationUpgrade(target);
        } else if (target?.hasAttribute("data-upgrade-confirm")) {
            void confirmIntegrationUpgrade(target);
        }
    };
}
customElements.define("cms-health-operations", HealthOperations);
