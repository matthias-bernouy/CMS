import { randomUUID } from "node:crypto";
import type { Runner } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { assertProviderConnectionToken } from "@bernouy/ulvia-providers/installations";
import {
    CLUSTER_LOGS_CONTRACT_ID,
    CLUSTER_LOGS_SITE_ID,
    CLUSTER_LOGS_INSTANCE_ID,
    CLUSTER_OPERATOR_SERVICE,
} from "@bernouy/observability/cluster/feature";
import type { UlviaProviderInstanceRuntime, UlviaProviderInstanceLease } from "../UlviaProvider";
import { compileProviderRoutes } from "../routes";
import { createProviderContractRelay } from "../relay";
import { operatorAuthorized, operatorTokenMatches } from "./authentication";

/** Operator authentication constructs the complete scope; tenant credentials and headers grant nothing. */
export function mountOperatorCapabilities(
    runner: Runner,
    runtime: UlviaProviderInstanceRuntime,
    token: string,
): (credential: string) => UlviaProviderInstanceLease | null {
    assertProviderConnectionToken(token);
    if (
        runtime.siteId !== CLUSTER_LOGS_SITE_ID ||
        runtime.report.instanceId !== CLUSTER_LOGS_INSTANCE_ID ||
        runtime.contracts.length !== 1 ||
        runtime.contracts[0]!.release.contractId !== CLUSTER_LOGS_CONTRACT_ID ||
        runtime.report.implementations.length !== 1 ||
        runtime.report.implementations[0]!.digest !== runtime.contracts[0]!.digest
    ) {
        throw new TypeError("Operator runtime requires the exact isolated cluster logs contract");
    }
    const routes = compileProviderRoutes(runtime.contracts);
    if (
        routes.some(
            (route) =>
                route.capability.binding.method !== "QUERY" ||
                route.capability.behavior.effect !== "query" ||
                /[{}:]/u.test(route.capability.binding.path),
        )
    ) {
        throw new TypeError("Operator journal bindings must be static read-only queries");
    }
    runtime.dispatcher.seal(runtime.contracts);
    const relay = createProviderContractRelay(
        routes,
        runtime.dispatcher,
        { siteId: runtime.siteId, providerId: runtime.report.providerId },
        NOOP_LOGGER,
        runtime.authorizeInvocation,
    );
    let active = 0;
    for (const route of routes) {
        runner.addEndpoint("QUERY", route.capability.binding.path, async (request) => {
            if (!operatorAuthorized(request, token)) {
                return new Response(null, {
                    status: 401,
                    headers: { "www-authenticate": "Bearer", "cache-control": "no-store" },
                });
            }
            if (active >= 4) {
                return new Response(null, {
                    status: 503,
                    headers: { "retry-after": "1", "cache-control": "no-store" },
                });
            }
            active++;
            try {
                const requestId = randomUUID();
                const headers = new Headers({ "x-ulvia-request-id": requestId });
                for (const name of ["content-type", "accept-language"]) {
                    const value = request.headers.get(name);
                    if (value) {
                        headers.set(name, value);
                    }
                }
                const scoped = new Request(request.url, {
                    method: request.method,
                    headers,
                    body: request.body,
                    signal: request.signal,
                });
                const issuedAt = Math.floor(Date.now() / 1000);
                const response =
                    (await relay(scoped, {
                        version: 1,
                        requestId,
                        instanceId: CLUSTER_LOGS_INSTANCE_ID,
                        contractId: CLUSTER_LOGS_CONTRACT_ID,
                        contractVersion: route.contractVersion,
                        capabilityId: route.capability.id,
                        systemServiceId: CLUSTER_OPERATOR_SERVICE,
                        issuedAt,
                        expiresAt: issuedAt + 30,
                    })) ?? new Response(null, { status: 404 });
                response.headers.set("cache-control", "no-store");
                return response;
            } finally {
                active--;
            }
        });
    }
    return (credential) => (operatorTokenMatches(credential, token) ? { resource: runtime, release() {} } : null);
}
