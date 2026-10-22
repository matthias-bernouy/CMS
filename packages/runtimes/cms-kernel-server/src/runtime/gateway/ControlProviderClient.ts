import type { GatewayCommandAuditEvent } from "@bernouy/cms-gateway/audit";
import type { ProviderKernelTransport } from "../provider/ProviderKernelTransport";

const CONTROL_CONTRACT_ID = "ulvia.cms.installations";
const CONTROL_CONTRACT_VERSION = "1.0.0";
const MAX_CONTROL_RESPONSE_BYTES = 2 * 1024 * 1024;

export type IssuedProviderInvocation = Readonly<{
    token: string;
    instanceId: string;
}>;

export class ControlProviderClient {
    constructor(private readonly transport: ProviderKernelTransport) {}

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

    async issueGatewayInvocation(input: {
        requestId: string;
        installationId: string;
        contractId: string;
        contractVersion: string;
        capabilityId: string;
        subjectId?: string;
    }): Promise<IssuedProviderInvocation> {
        const response = requiredResponse(
            await this.invoke("gateway.invocation.issue", "POST", "/gateway/invocations", input),
        );
        return {
            token: requiredText(response, "token"),
            instanceId: requiredText(response, "instanceId"),
        };
    }

    private async invoke(
        capabilityId: string,
        method: "POST" | "QUERY",
        path: string,
        input: unknown,
        notFoundAsNull = false,
    ): Promise<Record<string, unknown> | null> {
        const response = await this.transport.request(path, {
            method,
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "x-ulvia-request-id": crypto.randomUUID(),
                "x-ulvia-contract-id": CONTROL_CONTRACT_ID,
                "x-ulvia-contract-version": CONTROL_CONTRACT_VERSION,
                "x-ulvia-capability-id": capabilityId,
            },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(10_000),
        });
        if (notFoundAsNull && response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new ControlProviderError(capabilityId, response.status);
        }
        const value: unknown = JSON.parse(new TextDecoder().decode(await readBounded(response)));
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("Installations Provider returned an invalid capability response");
        }
        return value as Record<string, unknown>;
    }
}

class ControlProviderError extends Error {
    constructor(capabilityId: string, status: number) {
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
