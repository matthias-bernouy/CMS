import {
    IntegrationApiError,
    integrationUpgradeVersions,
    rerunIntegrationInstallation,
    upgradeIntegrationInstallation,
} from "../../api";
import type { IntegrationBrowserHost, IntegrationUpgradeVersions } from "../../model";

export async function runIntegrationSync(host: IntegrationBrowserHost, button: HTMLElement): Promise<void> {
    const id = button.dataset.integrationId;
    if (!id) {
        return;
    }
    const status = host.querySelector<HTMLElement>("[data-action-status]");
    setBusy(button, true, "Syncing");
    setStatus(status, "");
    try {
        await rerunIntegrationInstallation(id);
        setBusy(button, false, "Run sync");
        setStatus(status, "Synced");
    } catch (error) {
        setBusy(button, false, "Run sync");
        setStatus(status, error instanceof Error ? error.message : "Sync failed", true);
    }
}

export async function openIntegrationUpgrade(button: HTMLElement): Promise<void> {
    const panel = upgradePanel(button);
    const id = panel?.dataset.integrationId;
    if (!panel || !id) {
        return;
    }
    setBusy(button, true, "Checking");
    setStatus(statusElement(panel), "Checking available versions...");
    try {
        const choices = await integrationUpgradeVersions(id);
        renderUpgradeChoices(panel, choices);
        button.hidden = choices.versions.length > 0;
        setBusy(button, false, choices.versions.length ? "Check again" : "Up to date");
    } catch (error) {
        setBusy(button, false, "Try again");
        setStatus(statusElement(panel), integrationUpgradeErrorMessage(error), true);
    }
}

export function cancelIntegrationUpgrade(button: HTMLElement): void {
    const panel = upgradePanel(button);
    if (!panel) {
        return;
    }
    panel.querySelector<HTMLElement>("[data-upgrade-form]")!.hidden = true;
    panel.querySelector<HTMLElement>("[data-upgrade-open]")!.hidden = false;
    setStatus(statusElement(panel), "Upgrade cancelled.");
}

export async function confirmIntegrationUpgrade(button: HTMLElement): Promise<void> {
    const panel = upgradePanel(button);
    const id = panel?.dataset.integrationId;
    const select = panel?.querySelector<HTMLSelectElement>("[data-upgrade-target]");
    const confirmation = panel?.querySelector<HTMLInputElement>("[data-upgrade-confirmation]");
    if (!panel || !id || !select || !confirmation) {
        return;
    }
    const target = select.value;
    if (!target || confirmation.value.trim() !== target) {
        setStatus(statusElement(panel), `Type ${target || "the target version"} exactly to confirm.`, true);
        return;
    }
    setBusy(button, true, "Upgrading");
    setStatus(statusElement(panel), `Upgrading to ${target}...`);
    try {
        await upgradeIntegrationInstallation(id, target);
        setBusy(button, false, "Upgrade complete");
        setStatus(statusElement(panel), `Upgraded to ${target}. Installation data is refreshing.`);
    } catch (error) {
        setBusy(button, false, "Upgrade");
        setStatus(statusElement(panel), integrationUpgradeErrorMessage(error), true);
    }
}

export function renderUpgradeChoices(panel: HTMLElement, choices: IntegrationUpgradeVersions): void {
    const form = panel.querySelector<HTMLElement>("[data-upgrade-form]")!;
    const select = panel.querySelector<HTMLSelectElement>("[data-upgrade-target]")!;
    const confirmation = panel.querySelector<HTMLInputElement>("[data-upgrade-confirmation]")!;
    select.replaceChildren(...choices.versions.map((version) => versionOption(version, choices)));
    const preferred = choices.stable ?? choices.latest ?? choices.versions[0] ?? "";
    select.value = preferred;
    confirmation.value = "";
    confirmation.placeholder = preferred;
    form.hidden = choices.versions.length === 0;
    setStatus(
        statusElement(panel),
        choices.versions.length ? upgradeSummary(choices) : unavailableUpgradeSummary(choices),
    );
}

export function integrationUpgradeErrorMessage(error: unknown): string {
    if (!(error instanceof IntegrationApiError)) {
        return error instanceof Error ? error.message : "Upgrade failed.";
    }
    if (error.status === 409) {
        return "The repository state changed. Reload the available versions before trying again.";
    }
    if (error.status === 422) {
        return `The upgrade was rejected: ${error.message}`;
    }
    if (error.status === 503) {
        return "The integration repository is unavailable. The installed version remains unchanged.";
    }
    return error.message;
}

function versionOption(version: string, choices: IntegrationUpgradeVersions): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = version;
    const channels = [choices.stable === version ? "stable" : "", choices.latest === version ? "latest" : ""].filter(
        Boolean,
    );
    const target = choices.targets?.find((candidate) => candidate.version === version);
    const migration = target?.migrations[0];
    const labels = [
        ...channels,
        ...(migration ? [`migration from ${migration.supportedSourceRange}`, `rollback ${migration.rollback}`] : []),
    ];
    option.textContent = labels.length ? `${version} (${labels.join(", ")})` : version;
    return option;
}

function upgradeSummary(choices: IntegrationUpgradeVersions): string {
    const unavailable = choices.targets?.filter((target) => !target.eligible) ?? [];
    const eligible = choices.versions
        .map((version) => choices.targets?.find((target) => target.version === version))
        .filter((target) => target?.migrations.length)
        .map((target) => {
            const migration = target!.migrations[0]!;
            const drains = [migration.cmsDrainSeconds, migration.providerDrainSeconds].filter(
                (value): value is number => value !== undefined,
            );
            const drain = drains.length > 0 ? `; drain ${Math.max(...drains)}s` : "; drain not declared";
            const downtime =
                migration.downtimeStatus === undefined
                    ? "; downtime evidence not recorded"
                    : migration.downtimeStatus === "not-measured"
                      ? "; downtime not measured"
                      : migration.observedDowntimeSeconds === undefined
                        ? `; downtime ${migration.downtimeStatus}`
                        : `; downtime ${migration.downtimeStatus} ${migration.observedDowntimeSeconds}s`;
            const pointObservation = migration.pointOfNoReturnObservation ?? "not recorded";
            return `${target!.version}: tested migration ${migration.supportedSourceRange}; ${migration.rollback} rollback (${migration.rollbackVerified ? "verified" : "not verified"}); PONR ${migration.pointOfNoReturn} (${pointObservation})${drain}${downtime}`;
        });
    return [
        `Installed: ${choices.current}. Select and confirm an exact target version.`,
        ...eligible,
        ...unavailable.map((target) => `${target.version}: ${target.reasons.join(" ")}`),
    ].join(" ");
}

function unavailableUpgradeSummary(choices: IntegrationUpgradeVersions): string {
    const reasons = choices.targets?.flatMap((target) =>
        target.reasons.map((reason) => `${target.version}: ${reason}`),
    );
    return reasons?.length ? `No eligible upgrade. ${reasons.join(" ")}` : `Version ${choices.current} is up to date.`;
}

function upgradePanel(element: HTMLElement): HTMLElement | null {
    return element.closest<HTMLElement>("[data-upgrade-panel]");
}

function statusElement(panel: HTMLElement): HTMLElement {
    return panel.querySelector<HTMLElement>("[data-upgrade-status]")!;
}

function setBusy(element: HTMLElement, busy: boolean, label: string): void {
    element.toggleAttribute("aria-busy", busy);
    element.textContent = label;
}

function setStatus(element: HTMLElement | null, message: string, error = false): void {
    if (!element) {
        return;
    }
    element.textContent = message;
    element.classList.toggle("is-error", error);
}
