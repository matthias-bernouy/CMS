import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { NOOP_LOGGER, type Logger } from "@bernouy/logging";
import {
    admitContractReleaseJson,
    type AdmittedContractRelease,
    type ResolvedContract,
} from "@bernouy/cms-repository/contracts";
import type { ProviderManifestDigest } from "@bernouy/cms-repository/providers";
import type {
    DefaultProviderCapabilityDispatcher,
    UlviaProviderInstanceRuntime,
    UlviaProviderOptions,
} from "@bernouy/ulvia-provider";

export const PROVIDER_TOKEN = "ulvia-provider-token-that-is-long-enough";
export const PROVIDER_INSTANCE_ID = "instance:fixture-a";

export function reportAuthorization(): Record<string, string> {
    return { Authorization: `Bearer ${PROVIDER_TOKEN}` };
}

export function providerOptions(
    contracts: readonly Awaited<ReturnType<typeof contractRelease>>[],
    dispatcher: DefaultProviderCapabilityDispatcher,
    instanceId = PROVIDER_INSTANCE_ID,
    logger: Logger = NOOP_LOGGER,
    authorizeInvocation?: UlviaProviderInstanceRuntime["authorizeInvocation"],
): UlviaProviderOptions {
    const runtime: UlviaProviderInstanceRuntime = {
        siteId: "default",
        report: { ...providerReport(...contracts), instanceId },
        dispatcher,
        ...(authorizeInvocation ? { authorizeInvocation } : {}),
    };
    return {
        contracts: contracts.map(resolveFixtureContract),
        logger,
        authenticateControlToken: async (token) =>
            token === PROVIDER_TOKEN ? { resource: runtime, release: () => undefined } : null,
        authenticateInvocationToken: async (token) => {
            try {
                const claims = verifyProviderInvocationToken(token, PROVIDER_TOKEN);
                return claims.instanceId === instanceId
                    ? { lease: { resource: runtime, release: () => undefined }, claims }
                    : null;
            } catch {
                return null;
            }
        },
    };
}

export function invocationHeaders(
    requestId: string,
    subjectId?: string,
    capabilityId = "echo",
    instanceId = PROVIDER_INSTANCE_ID,
    contractVersion = "1.0.0",
): Record<string, string> {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const requestUuid = requestUuidFor(requestId);
    const invocation = signProviderInvocationToken(PROVIDER_TOKEN, {
        version: 1,
        requestId: requestUuid,
        instanceId,
        contractId: "ulvia.cms.fixture",
        contractVersion,
        capabilityId,
        ...(subjectId ? { subjectId } : {}),
        issuedAt,
        expiresAt: issuedAt + 30,
    });
    return { Authorization: `Bearer ${invocation}`, "x-ulvia-request-id": requestUuid };
}

export function forgedAuthorityHeaders(requestId: string): Record<string, string> {
    return {
        "x-ulvia-request-id": requestUuidFor(requestId),
        "x-ulvia-site-id": "default",
        "x-ulvia-installation-id": "local-ulvia-provider",
        "x-ulvia-origin": "page",
        "x-ulvia-actor-kind": "administrator",
    };
}

export function requestUuidFor(value: string): string {
    const suffix = Buffer.from(value).toString("hex").slice(0, 12).padEnd(12, "0");
    return `00000000-0000-4000-8000-${suffix}`;
}

export function providerReport(...contracts: Awaited<ReturnType<typeof contractRelease>>[]) {
    return {
        protocol: "ulvia-provider/v1" as const,
        providerId: "ulvia.official",
        instanceId: PROVIDER_INSTANCE_ID,
        account: { id: "local", label: "Local Ulvia Provider" },
        buildVersion: "0.1.0",
        manifest: { version: "0.1.0", digest: digest("a") },
        implementations: contracts.map((contract) => ({
            contractId: contract.release.contractId,
            version: contract.release.version,
            digest: contract.digest,
            status: "ready" as const,
        })),
    };
}

export async function contractRelease(version = "1.0.0") {
    return admitContractReleaseJson(
        JSON.stringify({
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId: "ulvia.cms.fixture",
            name: "Fixture",
            description: "Ulvia Provider surface fixture.",
            version,
            publisherId: "ulvia.official",
            capabilities: [
                {
                    id: "echo",
                    access: "admin",
                    behavior: { effect: "command", idempotency: "none", execution: "sync" },
                    input: {
                        type: "object",
                        properties: {
                            id: { type: "string", maxLength: 32 },
                            value: { type: "string", maxLength: 32 },
                        },
                        required: ["id", "value"],
                    },
                    output: {
                        type: "object",
                        properties: {
                            id: { type: "string", maxLength: 32 },
                            value: { type: "string", maxLength: 32 },
                        },
                        required: ["id", "value"],
                    },
                    errors: [],
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "POST",
                            path: "/v1/provider/echo/{id}",
                            input: { path: { id: "id" }, body: { properties: ["value"] } },
                            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                        },
                    ],
                },
            ],
        }),
    );
}

function digest(character: string): ProviderManifestDigest {
    return `sha256:${character.repeat(64)}` as ProviderManifestDigest;
}

export function resolveFixtureContract(admission: AdmittedContractRelease): ResolvedContract {
    const { release, digest } = admission;
    return {
        release,
        digest,
        lineage: [{ release, digest }],
        capabilities: release.capabilities.map((definition) => ({
            owner: { contractId: release.contractId, version: release.version, digest },
            definition,
        })),
    };
}
