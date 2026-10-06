import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CmsCoreGateway, CmsCoreProviderManagement } from "./dependencies";

export function registerProviderCapabilities(
    dispatcher: CoreCapabilityRegistry,
    gateway: CmsCoreGateway | undefined,
    management?: CmsCoreProviderManagement,
): void {
    dispatcher.register("ulvia.cms.providers", "list", async () => {
        const active = requiredGateway(gateway);
        const [installed, selected] = await Promise.all([
            active.installations.list(active.siteId),
            active.selections.get(active.siteId),
        ]);
        return {
            selectionRevision: selected?.revision ?? 0,
            installations: installed.map(projectInstallation),
            selections: selected?.plan.selections.map(projectSelection) ?? [],
        };
    });
    dispatcher.register("ulvia.cms.providers", "get", async (input) => {
        const active = requiredGateway(gateway);
        const [installed, selected] = await Promise.all([
            active.installations.get({ siteId: active.siteId, installationId: requiredText(input.installationId) }),
            active.selections.get(active.siteId),
        ]);
        if (!installed) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
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

function projectInstallation(stored: Awaited<ReturnType<CmsCoreGateway["installations"]["get"]>> & object) {
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

async function providerCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CoreCapabilityDispatchError) {
            throw error;
        }
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 404 || code === "installation_not_found") {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (status === 409 || code === "revision_conflict") {
            throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (code === "installation_revoked") {
            throw new CoreCapabilityDispatchError("INVALID_STATE", 409);
        }
        if (code) {
            throw new CoreCapabilityDispatchError("INVALID_SELECTION", 422);
        }
        throw error;
    }
}

function selections(value: unknown) {
    if (!Array.isArray(value) || value.length > 256) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
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
    throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
}

function revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}

function positiveRevision(value: unknown): number {
    const result = revision(value);
    if (result < 1) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return result;
}

function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value.length) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function requiredGateway(gateway: CmsCoreGateway | undefined): CmsCoreGateway {
    if (!gateway) {
        throw new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    return gateway;
}

function requiredManagement(management: CmsCoreProviderManagement | undefined): CmsCoreProviderManagement {
    if (!management) {
        throw new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
    return management;
}
