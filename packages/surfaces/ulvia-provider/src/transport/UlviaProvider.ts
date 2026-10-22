import type { HttpMethod, Runner } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import { createProviderContractRelay } from "./relay";
import { compileProviderRoutes } from "./routes";
import {
    KERNEL_PROVIDER_PROTOCOL,
    KERNEL_PROVIDER_QUERY_OPERATIONS,
    type KernelInstanceApi,
    type KernelProviderHandshake,
    type KernelProviderQuery,
} from "../kernel/protocol";
import { readBoundedRequestBody } from "@bernouy/http-runner";
import type { ProviderInstanceProfile, ProviderInstanceStatus } from "../instances/types";

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
    kernel: KernelInstanceApi;
}>;

export type UlviaProviderInstanceLease = Readonly<{
    resource: UlviaProviderInstanceRuntime;
    release(): void;
}>;

export type UlviaProviderOptions = Readonly<{
    contracts: readonly ContractRelease[];
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
        runner.post("/ulvia/kernel/v1/query", (request) =>
            withKernelRuntime(request, options, async (runtime, forwardedRequest) => {
                const query = await readKernelQuery(forwardedRequest);
                return Response.json({ value: await runtime.kernel.query(query) }, noStore());
            }),
        );
        runner.group("/ulvia/kernel/v1/call", (callRunner) => {
            for (const method of ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"] as const) {
                callRunner.setDefaultEndpoint(method, (request) =>
                    withKernelRuntime(request, options, (runtime, forwardedRequest) =>
                        runtime.kernel.handleCapability(forwardedRequest),
                    ),
                );
            }
        });
        runner.group("/ulvia/kernel/v1/queries", (queryRunner) => {
            for (const method of ["GET", "QUERY"] as const) {
                queryRunner.setDefaultEndpoint(method, (request) =>
                    withKernelRuntime(request, options, (runtime, forwardedRequest) =>
                        runtime.kernel.handleQuery(forwardedRequest),
                    ),
                );
            }
        });
        runner.group("/ulvia/kernel/v1/mutations", (mutationRunner) => {
            mutationRunner.setDefaultEndpoint("POST", (request) =>
                withKernelRuntime(request, options, (runtime, forwardedRequest) =>
                    runtime.kernel.handleMutation(forwardedRequest),
                ),
            );
        });
        runner.group("/ulvia/kernel/v1/collections", (assetRunner) => {
            for (const method of ["GET", "HEAD"] as const) {
                assetRunner.setDefaultEndpoint(method, (request) =>
                    withKernelRuntime(request, options, (runtime, forwardedRequest) =>
                        runtime.kernel.handleCollectionAsset(forwardedRequest),
                    ),
                );
            }
        });
        runner.group("/ulvia/kernel/v1/sitemap", (sitemapRunner) => {
            for (const method of ["GET", "HEAD"] as const) {
                sitemapRunner.setDefaultEndpoint(method, (request) =>
                    withKernelRuntime(request, options, (runtime, forwardedRequest) =>
                        runtime.kernel.handleSitemap(forwardedRequest),
                    ),
                );
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

async function withKernelRuntime(
    request: Request,
    options: UlviaProviderOptions,
    handler: (runtime: UlviaProviderInstanceRuntime, forwardedRequest: Request) => Promise<Response>,
): Promise<Response> {
    const token = bearerToken(request);
    const lease = token ? await options.authenticateControlToken(token) : null;
    if (!lease) {
        return unauthorized();
    }
    try {
        return await handler(lease.resource, kernelForwardedRequest(request));
    } finally {
        lease.release();
    }
}

function kernelForwardedRequest(request: Request): Request {
    const headers = new Headers(request.headers);
    const actorAuthorization = headers.get("x-ulvia-actor-authorization");
    const originalOrigin = parseOriginalOrigin(headers.get("x-ulvia-original-origin"));
    headers.delete("authorization");
    headers.delete("x-ulvia-actor-authorization");
    headers.delete("x-ulvia-original-origin");
    if (actorAuthorization) {
        headers.set("authorization", actorAuthorization);
    }
    const forwarded = new Request(request, { headers });
    if (!originalOrigin) {
        return forwarded;
    }
    const url = new URL(forwarded.url);
    url.protocol = originalOrigin.protocol;
    url.hostname = originalOrigin.hostname;
    url.port = originalOrigin.port;
    return new Request(url, forwarded);
}

function parseOriginalOrigin(value: string | null): URL | null {
    if (!value) {
        return null;
    }
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value ? url : null;
    } catch {
        return null;
    }
}

async function readKernelQuery(request: Request): Promise<KernelProviderQuery> {
    const bytes = await readBoundedRequestBody(request, 64 * 1024);
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Kernel query is invalid");
    }
    const record = value as Record<string, unknown>;
    if (
        !KERNEL_PROVIDER_QUERY_OPERATIONS.includes(record.operation as never) ||
        Object.keys(record).some((key) => key !== "operation" && key !== "input")
    ) {
        throw new TypeError("Kernel query is invalid");
    }
    return {
        operation: record.operation as KernelProviderQuery["operation"],
        ...(Object.hasOwn(record, "input") ? { input: record.input } : {}),
    };
}

function noStore(): ResponseInit {
    return { headers: { "Cache-Control": "private, no-store" } };
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
