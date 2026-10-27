import type { GatewayRoute } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { LogDetail, LogQuery, LogSummary } from "@bernouy/cms-observability";

type ReadCapability = "logs.query" | "logs.get";

/** The private local control connection is operator authority; its Bearer is never sent to a selected Provider. */
export class OperatorObservabilityClient {
    constructor(
        private readonly endpoint: string,
        private readonly token: string,
        private readonly instanceId: string,
    ) {
        const url = new URL(endpoint);
        if (url.hostname !== "127.0.0.1" || url.protocol !== "http:" || url.username || url.password) {
            throw new TypeError("Local operator connection must use the configured loopback Provider");
        }
    }

    query(input: LogQuery): Promise<{ items: LogSummary[]; nextCursor: string | null; from: string; to: string }> {
        return this.read("logs.query", input) as Promise<{
            items: LogSummary[];
            nextCursor: string | null;
            from: string;
            to: string;
        }>;
    }

    get(id: string): Promise<LogDetail> {
        return this.read("logs.get", { id }) as Promise<LogDetail>;
    }

    private async read(capabilityId: ReadCapability, input: unknown): Promise<unknown> {
        const snapshot = await this.control("gateway.route.get", "QUERY", "/gateway/route", {
            contractId: "ulvia.cms.observability",
        });
        if (typeof snapshot.route !== "string" || snapshot.route.length > 1024 * 1024) {
            throw new Error("Invalid observability route");
        }
        const route = JSON.parse(snapshot.route) as GatewayRoute;
        if (
            route.selection?.siteId !== "default" ||
            route.selection.contractId !== "ulvia.cms.observability" ||
            route.release?.admission.digest !== route.selection.digest ||
            !route.installation.observation
        ) {
            throw new Error("Observability route does not match the instance selection");
        }
        const release = route.release.admission.release;
        const capability = release.capabilities.find(({ id }) => id === capabilityId);
        if (!capability || capability.behavior.effect !== "query") {
            throw new Error("Selected observability read capability is unavailable");
        }
        validateSchemaValue(capability.input, input);
        const transport = new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({
                allowPrivateAddresses: true,
                authorize: async (request) => {
                    const issued = await this.control("gateway.invocation.issue", "POST", "/gateway/invocations", {
                        requestId: request.requestId,
                        installationId: route.selection.installationId,
                        contractId: release.contractId,
                        contractVersion: release.version,
                        capabilityId,
                    });
                    if (
                        request.authentication.kind !== "capability" ||
                        typeof issued.token !== "string" ||
                        issued.instanceId !== request.authentication.instanceId
                    ) {
                        throw new Error("Invalid operator invocation authorization");
                    }
                    return issued.token;
                },
            }),
        });
        const result = await transport.send({
            requestId: crypto.randomUUID(),
            instanceId: route.installation.observation.report.instanceId,
            installationId: route.selection.installationId,
            endpoint:
                route.installation.observation.report.instanceId === this.instanceId
                    ? this.endpoint
                    : route.installation.installation.endpoint,
            providerTokenRef: route.installation.installation.providerTokenRef,
            release,
            capability,
            input: input as Record<string, unknown>,
        });
        if (result.errorCode) {
            throw new Error(`Observability query failed: ${result.errorCode}`);
        }
        validateSchemaValue(capability.output, result.output);
        return result.output;
    }

    private async control(
        capabilityId: string,
        method: string,
        path: string,
        input: unknown,
    ): Promise<Record<string, unknown>> {
        const response = await fetch(new URL(path, this.endpoint), {
            method,
            headers: {
                authorization: `Bearer ${this.token}`,
                "content-type": "application/json",
                "x-ulvia-request-id": crypto.randomUUID(),
                "x-ulvia-contract-id": "ulvia.cms.installations",
                "x-ulvia-contract-version": "1.0.0",
                "x-ulvia-capability-id": capabilityId,
            },
            body: JSON.stringify(input),
            redirect: "manual",
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Local Provider rejected the operator request (${response.status})`);
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("Local Provider returned an empty response");
        }
        let source = "";
        const decoder = new TextDecoder();
        try {
            let bytes = 0;
            for (;;) {
                const part = await reader.read();
                if (part.done) {
                    break;
                }
                bytes += part.value.byteLength;
                if (bytes > 2 * 1024 * 1024) {
                    await reader.cancel();
                    throw new Error("Local Provider response exceeds its limit");
                }
                source += decoder.decode(part.value, { stream: true });
            }
            const value: unknown = JSON.parse(source + decoder.decode());
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("Invalid local Provider response");
            }
            return value as Record<string, unknown>;
        } finally {
            reader.releaseLock();
        }
    }
}
