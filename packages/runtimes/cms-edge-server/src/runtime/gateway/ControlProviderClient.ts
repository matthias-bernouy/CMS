import { TrackedDelegationRoots } from "./dispatch/TrackedDelegationRoots";
import type { ProviderMachinePreparation, PreparedProviderMachine } from "@bernouy/cms-gateway/protocol";
import type { ProviderDispatchPreparation, PreparedProviderDispatch } from "@bernouy/cms-gateway/protocol";
import { validDelegationTicket } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import { ControlDelegationAuthority } from "./ControlDelegationAuthority";
import type { GatewayCommandAuditEvent } from "@bernouy/cms-gateway/audit";
import type { InstallationsProviderTransport } from "./InstallationsProviderTransport";
import type { Logger } from "@bernouy/logging";
import { measureCurrentRequestTiming } from "@bernouy/http-runner/observability";

import { INSTALLATIONS_CONTRACT, type InstallationsControlContract } from "./fetchProviderReport";
const MAX_CONTROL_RESPONSE_BYTES = 2 * 1024 * 1024;

export type IssuedProviderInvocation = Readonly<{
    token: string;
    instanceId: string;
}>;

export class ControlProviderClient {
    readonly delegations: ControlDelegationAuthority;
    private readonly roots?: TrackedDelegationRoots;
    constructor(
        private readonly transport: InstallationsProviderTransport,
        private readonly logger?: Logger,
        private readonly contract: InstallationsControlContract = INSTALLATIONS_CONTRACT,
    ) {
        this.roots = this.contract.version === "1.2.0" ? new TrackedDelegationRoots() : undefined;
        this.delegations = new ControlDelegationAuthority((...args) => this.invoke(...args), this.roots);
    }

    get supportsPreparation(): boolean {
        return this.contract.version === "1.1.0" || this.contract.version === "1.2.0";
    }

    get supportsMachinePreparation(): boolean {
        return this.contract.version === "1.2.0";
    }
    async prepareProviderDispatch(input: ProviderMachinePreparation): Promise<PreparedProviderMachine> {
        return this.withClosures(input, async (value) => {
            const response = requiredResponse(
                await this.invoke("gateway.provider.prepare", "POST", "/gateway/providers/prepare", value),
            );
            if (response.delegation !== null) {
                throw new TypeError("Machine preparation cannot issue a user delegation");
            }
            return {
                token: requiredText(response, "token"),
                instanceId: requiredText(response, "instanceId"),
                sourceInstallationId: requiredText(response, "sourceInstallationId"),
                delegation: null,
            };
        });
    }

    async prepareGatewayDispatch(
        input: ProviderDispatchPreparation,
        reserveRoot = true,
    ): Promise<PreparedProviderDispatch> {
        return this.withClosures(
            input,
            async (value) => {
                const response = requiredResponse(
                    await this.invoke("gateway.dispatch.prepare", "POST", "/gateway/dispatch/prepare", value),
                );
                const delegation = response.delegation as PreparedProviderDispatch["delegation"];
                if (
                    delegation !== null &&
                    (!delegation ||
                        !validDelegationTicket(delegation.ticket) ||
                        !Number.isSafeInteger(delegation.expiresAt) ||
                        delegation.expiresAt <= Date.now())
                ) {
                    throw new TypeError("Invalid prepared delegation");
                }
                return {
                    token: requiredText(response, "token"),
                    instanceId: requiredText(response, "instanceId"),
                    delegation,
                };
            },
            async (prepared, reservation) => {
                if (prepared.delegation) {
                    await this.delegations.trackIssued(
                        prepared.delegation,
                        input.invocation.requestId,
                        "default",
                        reservation,
                    );
                }
            },
            reserveRoot,
        );
    }

    private async withClosures<T extends object, Result>(
        input: T,
        load: (value: T) => Promise<Result>,
        accepted?: (value: Result, reservation: symbol | undefined) => Promise<void>,
        reserveRoot = false,
    ): Promise<Result> {
        const batch = this.roots?.batch() ?? [];
        let reservation: symbol | undefined;
        try {
            reservation = reserveRoot ? this.roots?.reserve(batch) : undefined;
            const result = await load({ ...input, ...(batch.length ? { closedDelegations: batch } : {}) });
            this.roots?.acknowledge(batch);
            await accepted?.(result, reservation);
            return result;
        } catch (error) {
            this.roots?.release(batch);
            throw error;
        } finally {
            this.roots?.releaseReservation(reservation);
        }
    }

    async getGatewayRoute(contractId: string): Promise<string | null> {
        const response = await this.invoke("gateway.route.get", "QUERY", "/gateway/route", { contractId }, true);
        if (response === null) {
            return null;
        }
        return requiredText(response, "route");
    }

    async resolveGatewayIdentity(providerId: string, subjectId: string): Promise<string> {
        const response = requiredResponse(
            await this.invoke("gateway.identity.resolve", "POST", "/gateway/identity", {
                providerId,
                subjectId,
            }),
        );
        return requiredText(response, "providerSubjectId");
    }

    async appendGatewayAudit(event: GatewayCommandAuditEvent): Promise<void> {
        const response = requiredResponse(
            await this.invoke("gateway.audit.append", "POST", "/gateway/audit", {
                event: JSON.stringify(event),
            }),
        );
        if (response.accepted !== true) {
            throw new TypeError("Installations Provider returned an invalid Gateway audit acknowledgement");
        }
    }

    async issueGatewayInvocation(input: ProviderInvocationIssue): Promise<IssuedProviderInvocation> {
        const response = requiredResponse(
            await this.invoke("gateway.invocation.issue", "POST", "/gateway/invocations", input),
        );
        return {
            token: requiredText(response, "token"),
            instanceId: requiredText(response, "instanceId"),
        };
    }

    async authenticateProvider(token: string): Promise<string | null> {
        const response = requiredResponse(
            await this.invoke("gateway.provider.resolve", "POST", "/gateway/providers/resolve", { token }),
        );
        return response.installationId === null ? null : requiredText(response, "installationId");
    }

    async authorizeProvider(input: {
        sourceInstallationId: string;
        sourceCredentialFingerprint: string;
        targetInstallationId: string;
        contractId: string;
        capabilityId: string;
        version: string;
    }): Promise<boolean> {
        const response = requiredResponse(
            await this.invoke("gateway.provider.authorize", "QUERY", "/gateway/providers/authorize", input),
        );
        return response.allowed === true;
    }

    private async invoke(
        capabilityId: string,
        method: "POST" | "QUERY",
        path: string,
        input: unknown,
        notFoundAsNull = false,
    ): Promise<Record<string, unknown> | null> {
        const startedAt = performance.now();
        const response = await measureCurrentRequestTiming(controlTimingName(capabilityId), () =>
            this.transport.request(path, {
                method,
                headers: {
                    accept: "application/json",
                    ...(capabilityId === "gateway.route.get" ? { "accept-encoding": "gzip" } : {}),
                    "content-type": "application/json",
                    "x-ulvia-request-id": crypto.randomUUID(),
                    "x-ulvia-contract-id": this.contract.contractId,
                    "x-ulvia-contract-version": this.contract.version,
                    "x-ulvia-capability-id": capabilityId,
                },
                body: JSON.stringify(input),
                signal: AbortSignal.timeout(10_000),
            }),
        );
        if (notFoundAsNull && response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new ControlProviderError(capabilityId, response.status);
        }
        const bytes = await readBounded(response);
        this.reportInvocation(capabilityId, performance.now() - startedAt, bytes.byteLength);
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("Installations Provider returned an invalid capability response");
        }
        return value as Record<string, unknown>;
    }

    private reportInvocation(capabilityId: string, durationMs: number, responseBytes: number): void {
        if (!this.logger) {
            return;
        }
        const attributes = {
            capabilityId,
            durationMs: Math.round(durationMs * 100) / 100,
            responseBytes,
        };
        if (durationMs >= 50) {
            this.logger.info("gateway.control.completed", attributes);
            return;
        }
        this.logger.debug("gateway.control.completed", attributes);
    }
}

function controlTimingName(capabilityId: string): string {
    if (capabilityId === "gateway.route.get") {
        return "gateway_route";
    }
    if (capabilityId === "gateway.identity.resolve") {
        return "gateway_identity";
    }
    if (capabilityId.startsWith("gateway.delegation.")) {
        return "gateway_delegation";
    }
    return "gateway_authorize";
}

class ControlProviderError extends Error {
    constructor(
        capabilityId: string,
        readonly status: number,
    ) {
        super(`Installations Provider rejected ${capabilityId} (${status})`);
        this.name = "ControlProviderError";
    }
}

function requiredText(value: Record<string, unknown>, field: string): string {
    const text = value[field];
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_CONTROL_RESPONSE_BYTES) {
        throw new TypeError(`Installations Provider returned an invalid ${field}`);
    }
    return text;
}

function requiredResponse(value: Record<string, unknown> | null): Record<string, unknown> {
    if (value === null) {
        throw new TypeError("Installations Provider returned an empty capability response");
    }
    return value;
}

async function readBounded(response: Response): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new TypeError("Installations Provider returned an empty capability response");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > MAX_CONTROL_RESPONSE_BYTES) {
                await reader.cancel();
                throw new TypeError("Installations Provider capability response is too large");
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
