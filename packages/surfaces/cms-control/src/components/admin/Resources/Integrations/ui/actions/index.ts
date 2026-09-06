import { importIntegration, pushIntegrationRoute } from "../../api";
import type { BrowserTab, IntegrationBrowserHost, IntegrationDefinition } from "../../model";
import { retryBoundSources } from "../data";
import { renderImporting, renderSetup } from "../setup";
import { handleCollectionSelection, selectedCollectionResources } from "../resources";
import {
    cancelIntegrationUpgrade,
    confirmIntegrationUpgrade,
    openIntegrationUpgrade,
    runIntegrationSync,
} from "./installation";

export async function handleClick(host: IntegrationBrowserHost, event: Event): Promise<void> {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
        return;
    }
    if (
        host.activeDefinition?.schema === "cms.integration.definition.v2" &&
        host.activeDefinition.type === "collection" &&
        handleCollectionSelection(target, host.activeDefinition)
    ) {
        return;
    }
    if (target.closest("[data-repository-retry]")) {
        retryBoundSources(host);
        return;
    }
    const tab = target.closest("[data-tab]") as HTMLElement | null;
    if (tab) {
        return closeAndSetTab(host, (tab.dataset.tab as BrowserTab) ?? "installed");
    }
    if (target.closest("[data-detail-back]")) {
        return closeAndSetTab(host, "installed");
    }
    if (target.closest("[data-setup-cancel]")) {
        return closeAndSetTab(host, "catalogue");
    }
    if (target.closest("[data-import-setup]")) {
        return importActive(host);
    }
    const upgradeOpen = target.closest("[data-upgrade-open]") as HTMLElement | null;
    if (upgradeOpen) {
        return openIntegrationUpgrade(upgradeOpen);
    }
    const upgradeCancel = target.closest("[data-upgrade-cancel]") as HTMLElement | null;
    if (upgradeCancel) {
        cancelIntegrationUpgrade(upgradeCancel);
        return;
    }
    const upgradeConfirm = target.closest("[data-upgrade-confirm]") as HTMLElement | null;
    if (upgradeConfirm) {
        return confirmIntegrationUpgrade(upgradeConfirm);
    }
    const runSync = target.closest("[data-run-sync]") as HTMLElement | null;
    if (runSync) {
        return runIntegrationSync(host, runSync);
    }
    const installation = target.closest("[data-integration-id]") as HTMLElement | null;
    if (installation?.dataset.integrationId) {
        if (!shouldInterceptNavigation(event)) {
            return;
        }
        event.preventDefault();
        return host.openDetail(installation.dataset.integrationId);
    }
    const definition = target.closest("[data-definition-kind]") as HTMLElement | null;
    if (definition?.dataset.definitionKind) {
        if (!shouldInterceptNavigation(event)) {
            return;
        }
        const known = host.definitions.find((item) => item.kind === definition.dataset.definitionKind);
        if (!known) {
            return;
        }
        event.preventDefault();
        host.openSetup(known);
    }
}

export function openSetup(
    host: IntegrationBrowserHost,
    definition: IntegrationDefinition,
    options: { answers?: Record<string, unknown>; error?: string; resources?: readonly string[] } = {},
): void {
    host.activeDefinition = definition;
    host.selectedIntegrationId = "";
    host.query<HTMLElement>("[data-browser]").hidden = true;
    host.query<HTMLElement>("[data-detail-view]").hidden = false;
    renderSetup(host, definition, options);
}

async function importActive(host: IntegrationBrowserHost): Promise<void> {
    if (!host.activeDefinition) {
        return;
    }
    const definition = host.activeDefinition;
    const answers = {};
    const resources =
        definition.schema === "cms.integration.definition.v2" && definition.type === "collection"
            ? selectedCollectionResources(host)
            : undefined;
    renderImporting(host, definition, answers);
    try {
        const result = await importIntegration({ kind: definition.kind, answers, ...(resources ? { resources } : {}) });
        host.tab = "installed";
        const id = result.installation?.id ?? "";
        await host.waitForBoundData(() =>
            id
                ? host.installations.some((installation) => installation.id === id)
                : host.installations.some((installation) => installation.id === definition.kind),
        );
        host.openDetail(id || host.installations.find((installation) => installation.id === definition.kind)?.id || "");
    } catch (error) {
        openSetup(host, definition, {
            answers,
            ...(resources ? { resources } : {}),
            error: error instanceof Error ? error.message : "Import failed",
        });
    }
}

function closeAndSetTab(host: IntegrationBrowserHost, tab: BrowserTab): void {
    pushIntegrationRoute({ view: "list", tab });
    host.renderAll();
}

function shouldInterceptNavigation(event: Event): boolean {
    if (!(event instanceof MouseEvent)) {
        return true;
    }
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
