import type { Runner } from "@bernouy/http-runner";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderCapabilityRegistry } from "./dispatch/registry";
import { createProviderContractRelay } from "./transport/relay";
import { compileProviderRoutes } from "./transport/routes";
import { KERNEL_PROVIDER_PROTOCOL, type KernelProviderHandshake } from "./kernel/protocol";
import type { ProviderInstanceProfile, ProviderInstanceStatus } from "./instances/types";

export type UlviaProviderInstanceRuntime = Readonly<{
    siteId: string;
    report: ProviderRuntimeReport;
    dispatcher: ProviderCapabilityRegistry;
    instance: {
        id: string;
        status: ProviderInstanceStatus;
        revision: number;
        profile: ProviderInstanceProfile;
    };
    contentRevision(): Promise<number | string>;
}>;

export type UlviaProviderInstanceLease = Readonly<{
    resource: UlviaProviderInstanceRuntime;
    release(): void;
}>;

export type UlviaProviderOptions = Readonly<{
    contracts: readonly ContractRelease[];
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
        runner.get("/ulvia/kernel/v1/handshake", async (request) => {
            const token = bearerToken(request);
            const lease = token ? await options.authenticateControlToken(token) : null;
            if (!lease) {
                return unauthorized();
            }
            try {
                const runtime = lease.resource;
                const handshake: KernelProviderHandshake = {
                    protocol: KERNEL_PROVIDER_PROTOCOL,
                    instance: {
                        id: runtime.instance.id,
                        status: runtime.instance.status,
                        revision: runtime.instance.revision,
                    },
                    activeProfile: runtime.instance.profile,
                    contentRevision: await runtime.contentRevision(),
                    runtime: runtime.report,
                };
                return Response.json(handshake, { headers: { "Cache-Control": "no-store" } });
            } finally {
                lease.release();
            }
        });
        const methods = new Set(routes.map(({ capability }) => capability.binding.method));
        if (
            routes.some(({ capability }) => capability.binding.method === "GET" && capability.output.type === "binary")
        ) {
            methods.add("HEAD");
        }
        for (const method of methods) {
            runner.setDefaultEndpoint(method, async (request) => {
                const token = bearerToken(request);
                const authentication = token ? await options.authenticateInvocationToken(token) : null;
                if (!authentication) {
                    return unauthorized();
                }
                const { lease, claims } = authentication;
                try {
                    const runtime = lease.resource;
                    let relay = relays.get(runtime.dispatcher);
                    if (!relay) {
                        runtime.dispatcher.seal(options.contracts);
                        relay = createProviderContractRelay(routes, runtime.dispatcher, {
                            siteId: runtime.siteId,
                            providerId: runtime.report.providerId,
                        });
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
