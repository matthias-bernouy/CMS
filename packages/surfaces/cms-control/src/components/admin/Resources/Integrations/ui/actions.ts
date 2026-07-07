import { importIntegration, pushIntegrationRoute, rerunIntegrationInstallation } from "../api";
import { collectAnswers } from "../fields";
import type { BrowserTab, IntegrationBrowserHost, IntegrationDefinition } from "../model";
import { renderImporting, renderSetup } from "./setup";

export async function handleClick(host: IntegrationBrowserHost, event: Event): Promise<void> {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const tab = target.closest("[data-tab]") as HTMLElement | null;
    if (tab) return closeAndSetTab(host, (tab.dataset.tab as BrowserTab) ?? "installed");
    if (target.closest("[data-detail-back]")) return closeAndSetTab(host, "installed");
    if (target.closest("[data-setup-cancel]")) return closeAndSetTab(host, "catalogue");
    if (target.closest("[data-import-setup]")) return importActive(host);

    const runSync = target.closest("[data-run-sync]") as HTMLElement | null;
    if (runSync) return runIntegrationSync(host, runSync);
    const installation = target.closest("[data-installation-id]") as HTMLElement | null;
    if (installation?.dataset.integrationId) {
        if (!shouldInterceptNavigation(event)) return;
        event.preventDefault();
        return host.openDetail(installation.dataset.integrationId);
    }
    const definition = target.closest("[data-definition-kind]") as HTMLElement | null;
    if (definition?.dataset.definitionKind) {
        if (!shouldInterceptNavigation(event)) return;
        event.preventDefault();
        openDefinition(host, definition.dataset.definitionKind);
    }
}

export function openSetup(
    host: IntegrationBrowserHost,
    definition: IntegrationDefinition,
    options: { answers?: Record<string, unknown>; error?: string } = {},
): void {
    host.activeDefinition = definition;
    host.selectedIntegrationId = "";
    host.query<HTMLElement>("[data-browser]").hidden = true;
    host.query<HTMLElement>("[data-detail-view]").hidden = false;
    renderSetup(host, definition, options);
}

async function importActive(host: IntegrationBrowserHost): Promise<void> {
    if (!host.activeDefinition) return;
    const definition = host.activeDefinition;
    const answers = collectAnswers(host.query("[data-fields]"), definition);
    renderImporting(host, definition, answers);
    try {
        const result = await importIntegration({ kind: definition.kind, answers });
        host.tab = "installed";
        const id = result.installation?.id ?? "";
        await host.waitForBoundData(() => id
            ? host.installations.some(installation => installation.id === id)
            : host.installations.some(installation => installation.id === definition.kind));
        host.openDetail(id || host.installations.find(installation => installation.id === definition.kind)?.id || "");
    } catch (error) {
        openSetup(host, definition, { answers, error: error instanceof Error ? error.message : "Import failed" });
    }
}

async function runIntegrationSync(host: IntegrationBrowserHost, button: HTMLElement): Promise<void> {
    const id = button.dataset.integrationId;
    if (!id) return;
    const status = host.querySelector<HTMLElement>("[data-action-status]");
    button.setAttribute("aria-busy", "true");
    button.textContent = "Syncing";
    if (status) status.textContent = "";
    try {
        await rerunIntegrationInstallation(id);
        await host.waitForBoundData(() => true);
        button.removeAttribute("aria-busy");
        button.textContent = "Run sync";
        if (status) status.textContent = "Synced";
    } catch (error) {
        button.removeAttribute("aria-busy");
        button.textContent = "Run sync";
        if (status) status.textContent = error instanceof Error ? error.message : "Sync failed";
    }
}

function openDefinition(host: IntegrationBrowserHost, kind: string): void {
    const definition = host.definitions.find(item => item.kind === kind);
    if (definition) host.openSetup(definition);
}

function closeAndSetTab(host: IntegrationBrowserHost, tab: BrowserTab): void {
    pushIntegrationRoute({ view: "list", tab });
    host.renderAll();
}

function shouldInterceptNavigation(event: Event): boolean {
    if (!(event instanceof MouseEvent)) return true;
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
