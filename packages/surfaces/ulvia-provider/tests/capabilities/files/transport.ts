import { createProviderHandler, compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { FilesService, CmsFileWorkspace } from "@bernouy/cms-files";

export const scope = { siteId: "site-a", instanceId: "instance-a" };
const providerId = "ulvia/primary-provider";
const token = "test-only-files-provider-token-" + "x".repeat(40);
export interface RequestOptions {
    readonly authenticated?: boolean;
    readonly bytes?: BodyInit;
    readonly headers?: HeadersInit;
    readonly signal?: AbortSignal;
    readonly claims?: Partial<ProviderInvocationClaims>;
    readonly language?: string;
}

export async function filesTransport(files: FilesService, workspace: CmsFileWorkspace) {
    const build = await loadOfficialFeatures();
    const contracts = build.implementedContracts.filter(({ release }) => release.contractId === "ulvia/cms.files");
    const releases = build.implementations.filter(({ contractId }) => contractId === "ulvia/cms.files");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(dispatcher, { files, workspace }, releases, {
        providerId,
        scope,
    });
    const routes = compileProviderRoutes(contracts);
    const fetchHandler = createProviderHandler({
        contracts,
        dispatcher,
        authenticate: async (request) => {
            const authorization = request.headers.get("authorization");
            if (!authorization?.startsWith("Bearer ")) {
                return null;
            }
            try {
                const claims = verifyProviderInvocationToken(authorization.slice(7), token);
                return claims.instanceId === scope.instanceId ? { claims, providerId, siteId: scope.siteId } : null;
            } catch {
                return null;
            }
        },
        authorize: async (claims) => claims.actorKind === "administrator",
    });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: fetchHandler });
    const request = (capabilityId: string, input: Record<string, unknown>, options: RequestOptions = {}) => {
        const route = routes.find(({ capability }) => capability.id === capabilityId)!;
        const binding = route.capability.binding;
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: scope.instanceId,
            contractId: route.contractId,
            contractVersion: route.contractVersion,
            capabilityId,
            actorKind: "administrator",
            subjectId: "admin-a",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...options.claims,
        };
        const url = new URL(
            binding.path.replace(/\{([^}]+)\}/gu, (_match, key: string) => encodeURIComponent(String(input[key]))),
            server.url,
        );
        for (const [name, key] of Object.entries(binding.input?.query ?? {})) {
            if (input[key] !== undefined) {
                url.searchParams.set(name, String(input[key]));
            }
        }
        const headers = new Headers(options.headers);
        headers.set("x-ulvia-request-id", claims.requestId);
        headers.set("accept-language", options.language ?? "en");
        if (options.authenticated !== false) {
            headers.set("authorization", `Bearer ${signProviderInvocationToken(token, claims)}`);
        }
        for (const [name, mapping] of Object.entries(binding.input?.headers ?? {})) {
            if (input[mapping.property] !== undefined) {
                headers.set(
                    name,
                    mapping.encoding === "uri-component"
                        ? encodeURIComponent(String(input[mapping.property]))
                        : String(input[mapping.property]),
                );
            }
        }
        const mapping = binding.input?.body;
        let body: BodyInit | undefined;
        if (mapping && mapping !== true && "binaryProperty" in mapping) {
            body = options.bytes;
            if (!headers.has("content-type")) {
                headers.set("content-type", "application/octet-stream");
            }
        } else if (mapping) {
            headers.set("content-type", "application/json");
            body = JSON.stringify(
                mapping === true
                    ? input
                    : Object.fromEntries(
                          mapping.properties.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]),
                      ),
            );
        }
        return new Request(url, {
            method: binding.method,
            headers,
            signal: options.signal,
            ...(body === undefined ? {} : { body }),
        });
    };
    return {
        dispatcher,
        request,
        handle: fetchHandler,
        call: (id: string, input: Record<string, unknown>, options?: RequestOptions) =>
            fetch(request(id, input, options)),
        close: () => server.stop(true),
    };
}
