import { repositoryFeature } from "@bernouy/repository/features/repository";
import { encodeHttpParameter } from "@bernouy/ulvia-contracts/bindings";
import { createProviderHandler, compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { RepositoryService } from "@bernouy/repository/features/repository";
import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    createProviderOperationAdapter,
} from "@bernouy/ulvia-provider";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures, loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { repositoryAccountResolver } from "../../../../src/capabilities/features/services/repository";

const providerId = "ulvia/primary-provider";
const token = "repository-http-test-" + "x".repeat(64);
export async function repositoryTransport(
    repository: RepositoryService,
    resolve: (alias: string) => Promise<string | null> = async (alias) =>
        alias === "provider-user" ? "owner-account" : null,
) {
    const build = await loadOfficialFeatures();
    const contracts = build.implementedContracts.filter(({ release }) => release.contractId === "ulvia/repository");
    const routes = compileProviderRoutes(contracts);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const resolveRepositoryAccount = repositoryAccountResolver({
        identities: {
            resolve: async (_scope, alias) => resolve(alias),
            getOrCreate: async () => {
                throw new Error("Invocations must never create identity aliases");
            },
        },
    });
    await registerOfficialFeatures(
        dispatcher,
        { repository, resolveRepositoryAccount },
        build.implementations.filter(({ contractId }) => contractId === "ulvia/repository"),
        {
            operations: createProviderOperationAdapter(
                new ProviderOperationExecutor(new MemoryProviderOperationStore()),
            ),
            providerId,
            scope: { siteId: "default", instanceId: "instance-a" },
            executeKeyed: async () => {
                throw new Error("Repository natural commands must not access keyed receipts");
            },
        },
    );
    const handle = createProviderHandler({
        contracts,
        dispatcher,
        authenticate: async (request) => {
            try {
                const claims = verifyProviderInvocationToken(
                    (request.headers.get("authorization") ?? "").slice(7),
                    token,
                );
                return claims.instanceId === "instance-a" ? { claims, providerId, siteId: "default" } : null;
            } catch {
                return null;
            }
        },
        authorize: async (claims) => {
            const capability = contracts[0]!.capabilities.find(
                ({ definition }) => definition.id === claims.capabilityId,
            )?.definition;
            return capability?.access === "public" || Boolean(claims.subjectId);
        },
    });
    return async (
        id: string,
        input: Record<string, unknown>,
        options: {
            claims?: Partial<ProviderInvocationClaims>;
            authenticated?: boolean;
            headers?: HeadersInit;
            signal?: AbortSignal;
            method?: string;
            binary?: Blob;
        } = {},
    ) => {
        const route = routes.find(({ capability }) => capability.id === id)!;
        const binding = route.capability.binding;
        const parameter = (key: string) => {
            const schema = route.capability.input.properties[key]!;
            if (
                schema.type === "object" ||
                schema.type === "array" ||
                schema.type === "map" ||
                schema.type === "binary"
            ) {
                throw new Error("Admitted HTTP parameters must be scalar");
            }
            return encodeHttpParameter(schema, input[key])!;
        };
        const url = new URL(
            binding.path.replace(/\{([^}]+)\}/gu, (_match, key: string) => parameter(key)),
            "https://provider.test",
        );
        const body = { ...input };
        for (const key of Object.values(binding.input?.path ?? {})) {
            delete body[key];
        }
        for (const [name, key] of Object.entries(binding.input?.query ?? {})) {
            if (input[key] !== undefined) {
                url.searchParams.set(name, decodeURIComponent(parameter(key)));
            }
            delete body[key];
        }
        const invocation: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: "instance-a",
            contractId: "ulvia/repository",
            contractVersion: repositoryFeature.version,
            capabilityId: id,
            actorKind: "user",
            subjectId: "provider-user",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...options.claims,
        };
        const { actorKind, subjectId, ...rest } = invocation;
        const claims = {
            ...rest,
            ...(actorKind ? { actorKind } : {}),
            ...(actorKind !== "anonymous" && subjectId ? { subjectId } : {}),
        };
        const headers = new Headers(options.headers);
        headers.set("x-ulvia-request-id", claims.requestId);
        if (options.authenticated !== false) {
            headers.set("authorization", `Bearer ${signProviderInvocationToken(token, claims)}`);
        }
        for (const [name, mapping] of Object.entries(binding.input?.headers ?? {})) {
            headers.set(
                name,
                mapping.encoding === "http-field" ? String(input[mapping.property]) : parameter(mapping.property),
            );
            delete body[mapping.property];
        }
        const binary = typeof binding.input?.body === "object";
        headers.set("content-type", binary ? "application/octet-stream" : "application/json");
        return handle(
            new Request(url, {
                method: options.method ?? binding.method,
                headers,
                signal: options.signal,
                ...(binding.input?.body ? { body: binary ? options.binary : JSON.stringify(body) } : {}),
            }),
        );
    };
}
