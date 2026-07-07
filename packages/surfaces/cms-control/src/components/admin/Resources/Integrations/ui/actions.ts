import { importIntegration, rerunIntegrationInstance } from "../api";
import { collectAnswers } from "../fields";
import type { BrowserTab, IntegrationBrowserHost, IntegrationDefinition } from "../model";
import { definitionFor } from "./browser";
import { renderDetail } from "./detail";
import { collectImportInstance, renderImporting, renderSetup } from "./setup";

export async function handleClick(host: IntegrationBrowserHost, event: Event): Promise<void> {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const tab = target.closest("[data-tab]") as HTMLElement | null;
    if (tab) return closeAndSetTab(host, (tab.dataset.tab as BrowserTab) ?? "installed");
    if (target.closest("[data-detail-back]")) return host.closeDetail();
    if (target.closest("[data-setup-cancel]")) return closeAndSetTab(host, "catalogue");
    if (target.closest("[data-import-setup]")) return importActive(host);

    const runSync = target.closest("[data-run-sync]") as HTMLElement | null;
    if (runSync) return runIntegrationSync(host, runSync);
    const instance = target.closest("[data-instance-id]") as HTMLElement | null;
    if (instance?.dataset.instanceId) return host.openDetail(instance.dataset.instanceId);
    const definition = target.closest("[data-definition-kind]") as HTMLElement | null;
    if (definition?.dataset.definitionKind) openDefinition(host, definition.dataset.definitionKind);
}

export function openDetail(host: IntegrationBrowserHost, instanceId: string): void {
    host.activeDefinition = null;
    host.selectedInstanceId = instanceId;
    host.query<HTMLElement>("[data-browser]").hidden = true;
    host.query<HTMLElement>("[data-detail-view]").hidden = false;
    renderDetail(host);
}

export function closeDetail(host: IntegrationBrowserHost): void {
    host.selectedInstanceId = "";
    host.activeDefinition = null;
    host.query<HTMLElement>("[data-detail-view]").replaceChildren();
    host.query<HTMLElement>("[data-detail-view]").hidden = true;
    host.query<HTMLElement>("[data-browser]").hidden = false;
    host.setTab(host.tab);
}

export function openSetup(
    host: IntegrationBrowserHost,
    definition: IntegrationDefinition,
    options: { answers?: Record<string, unknown>; error?: string } = {},
): void {
    host.activeDefinition = definition;
    host.selectedInstanceId = "";
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
        const result = await importIntegration({ kind: definition.kind, answers, instance: collectImportInstance(definition, answers) });
        host.tab = "installed";
        const id = result.instance?.id ?? "";
        await host.waitForBoundData(() => id
            ? host.instances.some(instance => instance.id === id)
            : host.instances.some(instance => instance.kind === definition.kind));
        host.openDetail(id || host.instances.find(instance => instance.kind === definition.kind)?.id || "");
    } catch (error) {
        openSetup(host, definition, { answers, error: error instanceof Error ? error.message : "Import failed" });
    }
}

async function runIntegrationSync(host: IntegrationBrowserHost, button: HTMLElement): Promise<void> {
    const id = button.dataset.instanceId;
    if (!id) return;
    const status = host.querySelector<HTMLElement>("[data-action-status]");
    button.setAttribute("aria-busy", "true");
    button.textContent = "Syncing";
    if (status) status.textContent = "";
    try {
        await rerunIntegrationInstance(id);
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
    host.closeDetail();
    host.setTab(tab);
}
