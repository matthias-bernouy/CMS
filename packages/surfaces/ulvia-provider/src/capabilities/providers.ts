import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../dispatch/registry";
import type { UlviaProviderGateway, UlviaProviderManagement } from "../ports";

export function registerProviderCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    gateway: UlviaProviderGateway | undefined,
    management?: UlviaProviderManagement,
): void {
    dispatcher.register("ulvia.cms.providers", "list", async () => {
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
                selectionCount: selections.filter(({ installationId }) => installationId === entry.installation.id)
                    .length,
            })),
            selections: selections.map(projectSelection),
            routes: projectRoutes(installed, selections),
        };
    });
    dispatcher.register("ulvia.cms.providers", "get", async (input) => {
        const active = requiredGateway(gateway);
        const [installed, selected] = await Promise.all([
            active.installations.get({ siteId: active.siteId, installationId: requiredText(input.installationId) }),
            active.selections.get(active.siteId),
        ]);
        if (!installed) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
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
    });
    dispatcher.register("ulvia.cms.providers", "replace-selections", async (input) =>
        providerCommand(async () => {
            const selected = await requiredManagement(management).replaceSelections({
                expectedRevision: revision(input.expectedRevision),
                selections: selections(input.selections),
            });
            return { revision: selected.revision, selections: selected.selected.map(projectSelection) };
        }),
    );
    dispatcher.register("ulvia.cms.providers", "set-status", async (input) =>
        providerCommand(() =>
            requiredManagement(management).setStatus({
                installationId: requiredText(input.installationId),
                revision: positiveRevision(input.expectedRevision),
                action: action(input.action),
            }),
        ),
    );
}

function projectInstallation(stored: Awaited<ReturnType<UlviaProviderGateway["installations"]["get"]>> & object) {
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

function projectSelection(selection: { contractId: string; version: string; digest: string; installationId: string }) {
    return {
        contractId: selection.contractId,
        version: selection.version,
        digest: selection.digest,
        installationId: selection.installationId,
    };
}

type StoredInstallation = Awaited<ReturnType<UlviaProviderGateway["installations"]["list"]>>[number];
type StoredSelection = Parameters<typeof projectSelection>[0];

function projectRoutes(installed: readonly StoredInstallation[], selections: readonly StoredSelection[]) {
    const routes = new Map<
        string,
        {
            contractId: string;
            selectedInstallationId?: string;
            selectedDigest?: string;
            options: Array<{
                providerId: string;
                accountId: string;
                status: string;
                selection: ReturnType<typeof projectSelection>;
            }>;
        }
    >();
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

async function providerCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 404 || code === "installation_not_found") {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (status === 409 || code === "revision_conflict") {
            throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (code === "installation_revoked" || code === "installation_selected" || code.endsWith("_protected")) {
            throw new ProviderCapabilityDispatchError("INVALID_STATE", 409);
        }
        if (code) {
            throw new ProviderCapabilityDispatchError("INVALID_SELECTION", 422);
        }
        throw error;
    }
}

function selections(value: unknown) {
    if (!Array.isArray(value) || value.length > 256) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const item = entry as Record<string, unknown>;
        return {
            installationId: requiredText(item.installationId),
            contractId: requiredText(item.contractId),
            version: requiredText(item.version),
            digest: requiredText(item.digest),
        };
    });
}

function action(value: unknown): "enable" | "disable" | "revoke" {
    if (value === "enable" || value === "disable" || value === "revoke") {
        return value;
    }
    throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
}

function revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}

function positiveRevision(value: unknown): number {
    const result = revision(value);
    if (result < 1) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return result;
}

function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value.length) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function requiredGateway(gateway: UlviaProviderGateway | undefined): UlviaProviderGateway {
    if (!gateway) {
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    return gateway;
}

function requiredManagement(management: UlviaProviderManagement | undefined): UlviaProviderManagement {
    if (!management) {
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    return management;
}
