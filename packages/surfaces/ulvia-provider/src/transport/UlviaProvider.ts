import type { HttpMethod, Runner } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
import type { ResolvedContract } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import { createProviderContractRelay } from "./relay";
import { compileProviderRoutes } from "./routes";

export type UlviaProviderInstanceRuntime = Readonly<{
    siteId: string;
    report: ProviderRuntimeReport;
    dispatcher: ProviderCapabilityRegistry;
    authorizeInvocation?: (claims: ProviderInvocationClaims) => Promise<boolean>;
}>;

export type UlviaProviderInstanceLease = Readonly<{
    resource: UlviaProviderInstanceRuntime;
    release(): void;
}>;

export type UlviaProviderOptions = Readonly<{
    contracts: readonly ResolvedContract[];
    logger: Logger;
    authenticateControlToken(token: string): Promise<UlviaProviderInstanceLease | null>;
    authenticateInvocationToken(
        token: string,
    ): Promise<Readonly<{ lease: UlviaProviderInstanceLease; claims: ProviderInvocationClaims }> | null>;
}>;

/** Mounts the provider-facing official CMS contract surface on a dedicated runner. */
export class UlviaProvider {
    constructor(runner: Runner, options: UlviaProviderOptions) {
        const routes = compileProviderRoutes(options.contracts);
        const relays = new WeakMap<ProviderCapabilityRegistry, ReturnType<typeof createProviderContractRelay>>();
        runner.get("/ulvia/report", async (request) => {
            const token = bearerToken(request);
            const lease = token ? await options.authenticateControlToken(token) : null;
            if (!lease) {
                return unauthorized();
            }
            try {
                return Response.json(lease.resource.report, { headers: { "Cache-Control": "no-store" } });
            } finally {
                lease.release();
            }
        });
        const methods = new Set<HttpMethod>(routes.map(({ capability }) => capability.binding.method));
        if (
            routes.some(({ capability }) => capability.binding.method === "GET" && capability.output.type === "binary")
        ) {
            methods.add("HEAD");
        }
        for (const method of methods) {
            runner.setDefaultEndpoint(method, async (request) => {
                const token = bearerToken(request);
                const invocation = token ? await options.authenticateInvocationToken(token) : null;
                const controlLease = !invocation && token ? await options.authenticateControlToken(token) : null;
                const claims =
                    invocation?.claims ?? (controlLease ? controlInvocationClaims(request, controlLease) : null);
                const lease = invocation?.lease ?? controlLease;
                if (!lease || !claims) {
                    controlLease?.release();
                    return unauthorized();
                }
                try {
                    const runtime = lease.resource;
                    let relay = relays.get(runtime.dispatcher);
                    if (!relay) {
                        runtime.dispatcher.seal(options.contracts);
                        relay = createProviderContractRelay(
                            routes,
                            runtime.dispatcher,
                            {
                                siteId: runtime.siteId,
                                providerId: runtime.report.providerId,
                            },
                            options.logger,
                            runtime.authorizeInvocation,
                        );
                        relays.set(runtime.dispatcher, relay);
                    }
                    return (await relay(request, claims)) ?? new Response(null, { status: 404 });
                } finally {
                    lease.release();
                }
            });
        }
    }
}

function controlInvocationClaims(request: Request, lease: UlviaProviderInstanceLease): ProviderInvocationClaims | null {
    const contractId = request.headers.get("x-ulvia-contract-id");
    const contractVersion = request.headers.get("x-ulvia-contract-version");
    const capabilityId = request.headers.get("x-ulvia-capability-id");
    const requestId = request.headers.get("x-ulvia-request-id");
    if (
        contractId !== "ulvia.cms.installations" ||
        !contractVersion ||
        !capabilityId ||
        !requestId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(requestId)
    ) {
        return null;
    }
    const issuedAt = Math.floor(Date.now() / 1_000);
    return {
        version: 1,
        requestId,
        instanceId: lease.resource.report.instanceId,
        contractId,
        contractVersion,
        capabilityId,
        issuedAt,
        expiresAt: issuedAt + 30,
    };
}

function bearerToken(request: Request): string | null {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }
    return authorization.slice(7);
}

function unauthorized(): Response {
    return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}
