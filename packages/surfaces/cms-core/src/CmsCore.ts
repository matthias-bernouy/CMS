import type { CoreCapabilityDispatcher } from "@bernouy/cms-content";
import type { Runner } from "@bernouy/http-runner";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import { assertProviderToken, providerAuthorized } from "./transport/authentication";
import { createCoreContractRelay } from "./transport/relay";
import { compileCoreRoutes } from "./transport/routes";

export type CmsCoreOptions = Readonly<{
    token: string;
    report: ProviderRuntimeReport;
    contracts: readonly ContractRelease[];
    dispatcher: CoreCapabilityDispatcher;
}>;

/** Mounts the provider-facing official CMS contract surface on a dedicated runner. */
export class CmsCore {
    constructor(runner: Runner, options: CmsCoreOptions) {
        assertProviderToken(options.token);
        const routes = compileCoreRoutes(options.contracts);
        const relay = createCoreContractRelay(routes, options.dispatcher);
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
        for (const method of methods) {
            runner.setDefaultEndpoint(
                method,
                authorized(async (request) => (await relay(request)) ?? new Response(null, { status: 404 })),
            );
        }
    }
}
