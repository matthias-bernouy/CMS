import type { Runner } from "@bernouy/http-runner";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderCapabilityRegistry } from "./dispatch/registry";
import { assertProviderToken, providerAuthorized } from "./transport/authentication";
import { createProviderContractRelay } from "./transport/relay";
import { compileProviderRoutes } from "./transport/routes";

export type UlviaProviderOptions = Readonly<{
    token: string;
    report: ProviderRuntimeReport;
    contracts: readonly ContractRelease[];
    dispatcher: ProviderCapabilityRegistry;
}>;

/** Mounts the provider-facing official CMS contract surface on a dedicated runner. */
export class UlviaProvider {
    constructor(runner: Runner, options: UlviaProviderOptions) {
        assertProviderToken(options.token);
        options.dispatcher.seal(options.contracts);
        const routes = compileProviderRoutes(options.contracts);
        const relay = createProviderContractRelay(routes, options.dispatcher);
        const authorized =
            (handler: (request: Request) => Promise<Response> | Response) => async (request: Request) => {
                if (!providerAuthorized(request.headers.get("authorization"), options.token)) {
                    return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
                }
                return handler(request);
            };
        runner.get(
            "/ulvia/report",
            authorized(() => Response.json(options.report, { headers: { "Cache-Control": "no-store" } })),
        );
        const methods = new Set(routes.map(({ capability }) => capability.binding.method));
        if (
            routes.some(({ capability }) => capability.binding.method === "GET" && capability.output.type === "binary")
        ) {
            methods.add("HEAD");
        }
        for (const method of methods) {
            runner.setDefaultEndpoint(
                method,
                authorized(async (request) => (await relay(request)) ?? new Response(null, { status: 404 })),
            );
        }
    }
}
