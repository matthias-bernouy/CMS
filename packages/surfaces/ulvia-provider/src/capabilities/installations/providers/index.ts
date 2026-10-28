import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import { registerDelegationCapabilities } from "./delegation";
import { registerProviderAdministration } from "./administration";
import { registerProviderAuthorityCapabilities } from "./authority";
import {
    ProviderCapabilityDispatchError,
    type ProviderCapabilityRegistry,
    type ProviderCapabilityHandler,
} from "../../../dispatch/registry";
import type { UlviaProviderGateway, UlviaProviderManagement } from "../../../ports";
import type { GatewayCommandAuditEvent } from "@bernouy/cms-gateway/audit";

export function registerProviderInstallationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    gateway: UlviaProviderGateway | undefined,
    management?: UlviaProviderManagement,
): void {
    const registerControl = (id: string, handler: ProviderCapabilityHandler) =>
        dispatcher.register("ulvia.cms.installations", id, async (input, context) => {
            if (!context.controlAuthority) {
                throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
            }
            return handler(input, context);
        });
    registerProviderAuthorityCapabilities(dispatcher, gateway);
    registerDelegationCapabilities(dispatcher, gateway);
    registerProviderAdministration(dispatcher, management);
    dispatcher.register("ulvia.cms.installations", "list-provider-installations", async () => {
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
    dispatcher.register("ulvia.cms.installations", "get-provider-installation", async (input) => {
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
    dispatcher.register("ulvia.cms.installations", "set-provider-status", async (input) =>
        providerCommand(() =>
            requiredManagement(management).setStatus({
                installationId: requiredText(input.installationId),
                revision: positiveRevision(input.expectedRevision),
                action: action(input.action),
            }),
        ),
    );
    registerControl("gateway.route.get", async (input) => {
        const active = requiredGateway(gateway);
        const route = await active.routes.resolve(active.siteId, requiredText(input.contractId));
        if (!route) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return { route: JSON.stringify(route) };
    });
    registerControl("gateway.identity.resolve", async (input) => ({
        providerSubjectId: await requiredGateway(gateway).identities.getOrCreate(
            { providerId: requiredText(input.providerId) },
            requiredText(input.subjectId),
        ),
    }));
    registerControl("gateway.audit.append", async (input) => {
        const event = auditEvent(input.event);
        try {
            await requiredGateway(gateway).commandAudit.append(event);
        } catch (error) {
            if (!isDuplicateKey(error)) {
                throw error;
            }
        }
        return { accepted: true };
    });
    registerControl("gateway.invocation.issue", async (input) => {
        return providerCommand(() =>
            requiredGateway(gateway).invocations.issue(input as unknown as ProviderInvocationIssue),
        );
    });
}

function auditEvent(value: unknown): GatewayCommandAuditEvent {
    if (typeof value !== "string") {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    const event = parsed as Record<string, unknown>;
    const required = [
        "id",
        "requestId",
        "occurredAt",
        "siteId",
        "installationId",
        "contractId",
        "capabilityId",
        "actorKind",
        "stage",
    ];
    if (required.some((key) => typeof event[key] !== "string")) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return structuredClone(event) as unknown as GatewayCommandAuditEvent;
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && Number(error.code) === 11000;
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
        if (status === 403 || code === "not_authorized") {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        if (status === 429) {
            throw new ProviderCapabilityDispatchError("RATE_LIMITED", 429);
        }
        if (status === 404 || code === "installation_not_found" || code === "route_not_found") {
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
