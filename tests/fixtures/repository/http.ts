import {
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    createProviderOperationAdapter,
    createRepositoryOperationQueries,
} from "@bernouy/ulvia-provider";
import { randomUUID } from "node:crypto";
import { compileProviderRoutes, createProviderContractRelay } from "@bernouy/cms-gateway/provider/server";
import { DefaultProviderCapabilityDispatcher, ProviderCapabilityDispatchError } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { RepositoryCapabilityService } from "@bernouy/repository/repository/capabilities";
import { NOOP_LOGGER } from "@bernouy/logging";

const PREFIX = "/.cms/call/ulvia/repository";
/** Real SDK implementation and admitted HTTP codecs; this host verifies PATs into account subjects. */
export async function repositoryFixtureHttp(
    service: RepositoryCapabilityService,
    authenticate: (token: string) => Promise<string | null>,
    operations = new ProviderOperationExecutor(new MemoryProviderOperationStore()),
) {
    const build = await loadOfficialFeatures();
    const contracts = build.implementedContracts.filter(({ release }) => release.contractId === "ulvia/repository");
    const contract = contracts[0]!;
    const routes = compileProviderRoutes(contracts);
    const providerId = "ulvia/fixture.repository";
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(
        dispatcher,
        {
            repository: service,
            repositoryOperations: createRepositoryOperationQueries(operations),
            resolveRepositoryAccount: async (context) => {
                if (!context.subjectId) {
                    throw new ProviderCapabilityDispatchError("ACTOR_UNAVAILABLE", 403);
                }
                return context.subjectId;
            },
        },
        build.implementations.filter(({ contractId }) => contractId === "ulvia/repository"),
        {
            providerId,
            scope: { siteId: "fixture", instanceId: "fixture-instance" },
            operations: createProviderOperationAdapter(operations),
        },
    );
    dispatcher.seal(contracts);
    const relay = createProviderContractRelay(routes, dispatcher, { siteId: "fixture", providerId }, NOOP_LOGGER);
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        if (!url.pathname.startsWith(`${PREFIX}/`)) {
            return new Response(null, { status: 404 });
        }
        url.pathname = url.pathname.slice(PREFIX.length);
        const route = routes.find((candidate) => candidate.match(request.method, url.pathname));
        if (!route) {
            return new Response(null, { status: 404 });
        }
        const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/u)?.[1];
        const accountId = bearer ? await authenticate(bearer) : null;
        if (route.capability.access !== "public" && !accountId) {
            return new Response(null, { status: 401 });
        }
        const requestId = randomUUID();
        const headers = new Headers(request.headers);
        headers.set("x-ulvia-request-id", requestId);
        const forwarded = new Request(url, {
            method: request.method,
            headers,
            body: request.body,
            signal: request.signal,
        });
        const response = await relay(forwarded, {
            version: 1,
            requestId,
            instanceId: "fixture-instance",
            contractId: contract.release.contractId,
            contractVersion: contract.release.version,
            capabilityId: route.capability.id,
            issuedAt: 0,
            expiresAt: 9999999999,
            ...(accountId ? { subjectId: accountId, actorKind: "user" as const } : { actorKind: "anonymous" as const }),
        });
        const result = response ?? new Response(null, { status: 404 });
        result.headers.set("x-request-id", requestId);
        return result;
    };
}
