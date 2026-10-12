import type { Runner } from "@bernouy/http-runner";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { assertProviderInvocationSecret, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderCapabilityRegistry } from "./dispatch/registry";
import { providerAuthorized } from "./transport/authentication";
import { createProviderContractRelay } from "./transport/relay";
import { compileProviderRoutes } from "./transport/routes";

export type UlviaProviderOptions = Readonly<{
    token: string;
    siteId: string;
    report: ProviderRuntimeReport;
    contracts: readonly ContractRelease[];
    dispatcher: ProviderCapabilityRegistry;
}>;

/** Mounts the provider-facing official CMS contract surface on a dedicated runner. */
export class UlviaProvider {
    constructor(runner: Runner, options: UlviaProviderOptions) {
        assertProviderInvocationSecret(options.token);
        options.dispatcher.seal(options.contracts);
        const routes = compileProviderRoutes(options.contracts);
        const relay = createProviderContractRelay(routes, options.dispatcher, {
            siteId: options.siteId,
            providerId: options.report.providerId,
        });
        const controlAuthorized =
            (handler: (request: Request) => Promise<Response> | Response) => async (request: Request) => {
                if (!providerAuthorized(request.headers.get("authorization"), options.token)) {
                    return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
                }
                return handler(request);
            };
        runner.get(
            "/ulvia/report",
            controlAuthorized(() => Response.json(options.report, { headers: { "Cache-Control": "no-store" } })),
        );
        const methods = new Set(routes.map(({ capability }) => capability.binding.method));
        if (
            routes.some(({ capability }) => capability.binding.method === "GET" && capability.output.type === "binary")
        ) {
            methods.add("HEAD");
        }
        for (const method of methods) {
            runner.setDefaultEndpoint(method, async (request) => {
                const claims = invocationClaims(request, options.token, options.report.instanceId);
                if (!claims) {
                    return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
                }
                return (await relay(request, claims)) ?? new Response(null, { status: 404 });
            });
        }
    }
}

function invocationClaims(request: Request, secret: string, instanceId: string) {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }
    try {
        const claims = verifyProviderInvocationToken(authorization.slice(7), secret);
        return claims.instanceId === instanceId ? claims : null;
    } catch {
        return null;
    }
}
