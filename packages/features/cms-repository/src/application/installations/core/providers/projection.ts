import type { InstallationGateway } from "cms-repository/application/installations/interfaces/gateway";
import type { ListProviderInstallationsOutput } from "cms-repository/application/installations/interfaces/outputs";
export function projectInstallation(stored: Awaited<ReturnType<InstallationGateway["installations"]["get"]>> & object) {
    const { installation, observation, revision } = stored;
    return {
        id: installation.id,
        providerId: installation.providerId,
        accountId: installation.accountId,
        endpoint: installation.endpoint,
        status: installation.status,
        manifestVersion: installation.approval.manifestVersion,
        revision,
        ...(observation ? { observedAt: observation.observedAt } : {}),
    };
}

export function projectSelection(selection: {
    contractId: string;
    version: string;
    digest: string;
    installationId: string;
}) {
    return {
        contractId: selection.contractId,
        version: selection.version,
        digest: selection.digest,
        installationId: selection.installationId,
    };
}

type StoredInstallation = Awaited<ReturnType<InstallationGateway["installations"]["list"]>>[number];
type StoredSelection = Parameters<typeof projectSelection>[0];

export function projectRoutes(installed: readonly StoredInstallation[], selections: readonly StoredSelection[]) {
    type Route = ListProviderInstallationsOutput["routes"][number];
    const routes = new Map<string, Omit<Route, "options"> & { options: Array<Route["options"][number]> }>();
    for (const selection of selections) {
        routes.set(selection.contractId, {
            contractId: selection.contractId,
            selectedInstallationId: selection.installationId,
            selectedDigest: selection.digest,
            options: [],
        });
    }
    for (const stored of installed) {
        for (const implementation of stored.observation?.report.implementations ?? []) {
            const route = routes.get(implementation.contractId) ?? {
                contractId: implementation.contractId,
                options: [],
            };
            route.options.push({
                providerId: stored.installation.providerId,
                accountId: stored.installation.accountId,
                status: implementation.status,
                selection: projectSelection({
                    contractId: implementation.contractId,
                    version: implementation.version,
                    digest: implementation.digest,
                    installationId: stored.installation.id,
                }),
            });
            routes.set(implementation.contractId, route);
        }
    }
    return [...routes.values()]
        .map((route) => ({
            ...route,
            options: route.options.sort((left, right) =>
                `${left.providerId}\0${left.accountId}\0${left.selection.version}`.localeCompare(
                    `${right.providerId}\0${right.accountId}\0${right.selection.version}`,
                ),
            ),
        }))
        .sort((left, right) => left.contractId.localeCompare(right.contractId));
}
