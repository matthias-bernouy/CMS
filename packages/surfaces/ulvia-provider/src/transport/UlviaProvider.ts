import type { HttpMethod, Runner } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import type { ProviderRuntimeReport } from "@bernouy/ulvia-providers/installations";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import { createProviderContractRelay } from "./relay";
import { compileProviderRoutes } from "./routes";

export type UlviaProviderInstanceRuntime = Readonly<{
    siteId: string;
    contracts: readonly ResolvedContract[];
    report: ProviderRuntimeReport;
    dispatcher: ProviderCapabilityRegistry;
    logger?: Logger;
    authorizeInvocation?: (claims: ProviderInvocationClaims, controlAuthority?: boolean) => Promise<boolean>;
}>;

export type UlviaProviderInstanceLease = Readonly<{
    resource: UlviaProviderInstanceRuntime;
    release(): void;
}>;

export type UlviaProviderOptions = Readonly<{
    logger: Logger;
    authenticateReportToken?(token: string): Promise<UlviaProviderInstanceLease | null>;
    authenticateControlToken(token: string): Promise<UlviaProviderInstanceLease | null>;
    authenticateInvocationToken(
        token: string,
    ): Promise<Readonly<{ lease: UlviaProviderInstanceLease; claims: ProviderInvocationClaims }> | null>;
}>;

/** Mounts the provider-facing official CMS contract surface on a dedicated runner. */
export class UlviaProvider {
    constructor(runner: Runner, options: UlviaProviderOptions) {
        const relays = new WeakMap<ProviderCapabilityRegistry, ReturnType<typeof createProviderContractRelay>>();
        runner.get("/ulvia/report", async (request) => {
            const token = bearerToken(request);
            const lease = token
                ? await (options.authenticateReportToken ?? options.authenticateControlToken)(token)
                : null;
            if (!lease) {
                return unauthorized();
            }
            try {
                return Response.json(lease.resource.report, { headers: { "Cache-Control": "no-store" } });
            } finally {
                lease.release();
            }
        });
        const methods: readonly HttpMethod[] = ["GET", "HEAD", "QUERY", "POST", "PUT", "PATCH", "DELETE"];
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
                        const contracts = runtime.contracts.filter(({ release, digest }) =>
                            runtime.report.implementations.some(
                                (pin) =>
                                    pin.contractId === release.contractId &&
                                    pin.version === release.version &&
                                    pin.digest === digest,
                            ),
                        );
                        if (
                            contracts.length !== runtime.contracts.length ||
                            contracts.length !== runtime.report.implementations.length
                        ) {
                            throw new Error("Instance contracts differ from its implementation report");
                        }
                        const routes = compileProviderRoutes(contracts);
                        runtime.dispatcher.seal(contracts);
                        relay = createProviderContractRelay(
                            routes,
                            runtime.dispatcher,
                            {
                                siteId: runtime.siteId,
                                providerId: runtime.report.providerId,
                            },
                            runtime.logger ?? options.logger,
                            runtime.authorizeInvocation,
                        );
                        relays.set(runtime.dispatcher, relay);
                    }
                    return (await relay(request, claims, Boolean(controlLease))) ?? new Response(null, { status: 404 });
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
        contractId !== "ulvia/cms.installations" ||
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
