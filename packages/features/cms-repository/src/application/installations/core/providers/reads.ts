import type { InstallationGateway } from "cms-repository/application/installations/interfaces/gateway";
import { requiredGateway } from "cms-repository/application/installations/core/requirements";
import { InstallationError } from "cms-repository/application/installations/core/errors";
import {
    projectInstallation,
    projectSelection,
    projectRoutes,
} from "cms-repository/application/installations/core/providers/projection";
export async function providerInstallations(gateway: InstallationGateway | undefined) {
    const active = requiredGateway(gateway);
    const [installed, selected] = await Promise.all([
        active.installations.list(active.siteId),
        active.selections.get(active.siteId),
    ]);
    const selections = selected?.plan.selections ?? [];
    return {
        selectionRevision: selected?.revision ?? 0,
        installations: installed.map((entry) => ({
            ...projectInstallation(entry),
            selectionCount: selections.filter(({ installationId }) => installationId === entry.installation.id).length,
        })),
        selections: selections.map(projectSelection),
        routes: projectRoutes(installed, selections),
    };
}
export async function providerInstallation(gateway: InstallationGateway | undefined, installationId: string) {
    const active = requiredGateway(gateway);
    const [installed, selected] = await Promise.all([
        active.installations.get({ siteId: active.siteId, installationId: installationId }),
        active.selections.get(active.siteId),
    ]);
    if (!installed) {
        throw new InstallationError("NOT_FOUND");
    }
    return {
        ...projectInstallation(installed),
        contracts:
            installed.observation?.report.implementations.map(({ contractId, version, digest, status }) => ({
                contractId,
                version,
                digest,
                status,
            })) ?? [],
        selections:
            selected?.plan.selections
                .filter(({ installationId }) => installationId === installed.installation.id)
                .map(projectSelection) ?? [],
    };
}
