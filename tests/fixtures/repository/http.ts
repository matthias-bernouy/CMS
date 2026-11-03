import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { admitContractReleaseJson, resolveContract } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import {
    compileProviderRoutes,
    createProviderContractRelay,
    DefaultProviderCapabilityDispatcher,
    ProviderCapabilityDispatchError,
} from "@bernouy/cms-gateway/provider/server";
import { RepositoryCapabilityError } from "@bernouy/cms-repository/repository/capabilities";
import type { RepositoryCapabilityService } from "@bernouy/cms-repository/repository/capabilities";
import { RepositoryDiscoveryError } from "@bernouy/cms-repository/repository/search";
import { NOOP_LOGGER } from "@bernouy/logging";

const path = resolve(
    import.meta.dir,
    "../../../packages/runtimes/ulvia-cli/dist/bootstrap/contracts/ulvia.repository/definition.json",
);
const contract = await resolveContract(
    new InMemoryReleaseCatalogue(),
    await admitContractReleaseJson(await Bun.file(path).text()),
);
const routes = compileProviderRoutes([contract]);
const PREFIX = "/.cms/call/ulvia.repository";

/** Real admitted binding codecs and domain service; the test host supplies verified PAT subjects. */
export function repositoryFixtureHttp(
    service: RepositoryCapabilityService,
    authenticate: (token: string) => Promise<string | null>,
) {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    for (const capability of contract.release.capabilities) {
        dispatcher.register(contract.release.contractId, capability.id, async (input, context) => {
            try {
                const result = await service.invoke(capability.id, input, context.binaryBody, {
                    accountId: context.subjectId,
                });
                if (capability.output.type !== "binary") {
                    return result;
                }
                const bytes = result as {
                    stream: ReadableStream<Uint8Array>;
                    contentLength: number;
                    contentType: string;
                    digest: string;
                };
                return {
                    kind: "binary",
                    ...bytes,
                    contentType: capability.id === "asset-download" ? "application/octet-stream" : bytes.contentType,
                    headers: { etag: `"${bytes.digest}"`, "cache-control": "public, max-age=31536000, immutable" },
                };
            } catch (error) {
                if (error instanceof RepositoryCapabilityError || error instanceof RepositoryDiscoveryError) {
                    const status = capability.bindings.find((binding) => binding.transport === "http")!.response
                        .errorStatuses[error.code];
                    if (status) {
                        throw new ProviderCapabilityDispatchError(
                            error.code,
                            status,
                            error.code,
                            {},
                            { message: error.message.slice(0, 2048) },
                        );
                    }
                }
                throw error;
            }
        });
    }
    dispatcher.seal([contract]);
    const relay = createProviderContractRelay(
        routes,
        dispatcher,
        { siteId: "fixture", providerId: "fixture.repository" },
        NOOP_LOGGER,
    );
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
