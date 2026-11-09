import { verifyStoredContractReleaseJson } from "@bernouy/ulvia-contracts";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { signProviderInvocationToken, assertProviderInvocationSecret } from "@bernouy/cms-gateway/protocol";
import type { EdgeRoute } from "@bernouy/hosting/routing";
import { currentRequestHeaders } from "@bernouy/http-runner/observability";
import definition from "./routing-contract.json";

let admitted: ReturnType<typeof verifyStoredContractReleaseJson> | undefined;
const contract = () => (admitted ??= verifyStoredContractReleaseJson(definition.canonicalJson, definition.digest));

/** No catalogue scan or tenant credential is needed to call this exact admitted host contract. */
export class RoutingClient {
    private pending = 0;
    private readonly endpoint: URL;
    constructor(
        endpoint: string,
        private readonly secret: string,
        private readonly fetcher: typeof fetch = fetch,
        private readonly maxPending = 64,
    ) {
        this.endpoint = new URL(endpoint);
        if (
            !["https:", "http:"].includes(this.endpoint.protocol) ||
            this.endpoint.pathname !== "/" ||
            this.endpoint.username ||
            this.endpoint.password ||
            this.endpoint.search ||
            this.endpoint.hash
        ) {
            throw new TypeError("Hosting Provider must be an absolute HTTP origin");
        }
        assertProviderInvocationSecret(secret);
        if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 256) {
            throw new TypeError("Invalid routing concurrency bound");
        }
    }

    async resolve(hostname: string): Promise<EdgeRoute | null> {
        if (this.pending >= this.maxPending) {
            throw new Error("Edge routing capacity is exhausted");
        }
        this.pending++;
        try {
            const { release } = await contract();
            const capability = release.capabilities.find((item) => item.id === "domains.resolve");
            const binding = capability?.bindings.find((item) => item.transport === "http");
            if (
                !capability ||
                binding?.transport !== "http" ||
                release.contractId !== definition.contractId ||
                release.version !== definition.version
            ) {
                throw new Error("The admitted host routing binding is unavailable");
            }
            const input = { hostname };
            validateSchemaValue(capability.input, input);
            const now = Math.floor(Date.now() / 1000);
            const requestId = crypto.randomUUID();
            const token = signProviderInvocationToken(this.secret, {
                version: 1,
                requestId,
                instanceId: "hosting:installation",
                contractId: release.contractId,
                contractVersion: release.version,
                capabilityId: capability.id,
                systemServiceId: "cms-edge",
                issuedAt: now,
                expiresAt: now + 30,
            });
            const response = await this.fetcher(new URL(binding.path, this.endpoint), {
                method: binding.method,
                headers: currentRequestHeaders({
                    authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                    "x-ulvia-request-id": requestId,
                }),
                body: JSON.stringify(input),
                redirect: "manual",
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok || !response.body) {
                await response.body?.cancel();
                throw new Error(`Hosting routing request failed (${response.status})`);
            }
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                for (;;) {
                    const next = await reader.read();
                    if (next.done) {
                        break;
                    }
                    size += next.value.byteLength;
                    if (size > 16_384) {
                        await reader.cancel();
                        throw new Error("Hosting routing response is too large");
                    }
                    chunks.push(next.value);
                }
            } finally {
                reader.releaseLock();
            }
            const value = parseStrictJson(Buffer.concat(chunks), 16_384, 4);
            validateSchemaValue(capability.output, value);
            // The exact admitted output schema above establishes this DTO's complete shape.
            const route = value as EdgeRoute | null;
            if (
                route &&
                (route.hostname !== hostname || route.expiresAt <= Date.now() || route.expiresAt > Date.now() + 65_000)
            ) {
                throw new Error("Hosting route has an invalid audience or expiry");
            }
            return route;
        } finally {
            this.pending--;
        }
    }
}
