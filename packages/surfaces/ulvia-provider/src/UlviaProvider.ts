import type { Runner } from "@bernouy/http-runner";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderCapabilityRegistry } from "./dispatch/registry";
import { createProviderContractRelay } from "./transport/relay";
import { compileProviderRoutes } from "./transport/routes";

export type UlviaProviderInstanceRuntime = Readonly<{
    siteId: string;
    report: ProviderRuntimeReport;
    dispatcher: ProviderCapabilityRegistry;
}>;

export type UlviaProviderOptions = Readonly<{
    contracts: readonly ContractRelease[];
    authenticateControlToken(token: string): Promise<UlviaProviderInstanceRuntime | null>;
    authenticateInvocationToken(
        token: string,
    ): Promise<Readonly<{ runtime: UlviaProviderInstanceRuntime; claims: ProviderInvocationClaims }> | null>;
}>;

/** Mounts the provider-facing official CMS contract surface on a dedicated runner. */
export class UlviaProvider {
    constructor(runner: Runner, options: UlviaProviderOptions) {
        const routes = compileProviderRoutes(options.contracts);
        const relays = new WeakMap<ProviderCapabilityRegistry, ReturnType<typeof createProviderContractRelay>>();
        runner.get("/ulvia/report", async (request) => {
            const token = bearerToken(request);
            const runtime = token ? await options.authenticateControlToken(token) : null;
            return runtime
                ? Response.json(runtime.report, { headers: { "Cache-Control": "no-store" } })
                : unauthorized();
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
                const { runtime, claims } = authentication;
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
