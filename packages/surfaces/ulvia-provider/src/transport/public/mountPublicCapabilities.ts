import { randomUUID } from "node:crypto";
import type { Runner } from "@bernouy/http-runner";
import type { Logger } from "@bernouy/logging";
import type { UlviaProviderInstanceRuntime } from "../UlviaProvider";
import { compileProviderRoutes } from "../routes";
import { createProviderContractRelay } from "../relay";

/** Public infrastructure reads use the admitted binding with server-owned anonymous scope. */
export function mountPublicCapabilities(runner: Runner, runtime: UlviaProviderInstanceRuntime, logger: Logger): void {
    const routes = compileProviderRoutes(runtime.contracts);
    if (
        !routes.length ||
        routes.some(
            ({ capability }) =>
                capability.access !== "public" ||
                capability.behavior.effect !== "query" ||
                capability.behavior.execution !== "sync" ||
                capability.binding.method !== "GET" ||
                /[{}:]/u.test(capability.binding.path),
        ) ||
        runtime.report.implementations.length !== runtime.contracts.length ||
        runtime.contracts.some(
            ({ release, digest }) =>
                !runtime.report.implementations.some(
                    (pin) =>
                        pin.contractId === release.contractId &&
                        pin.version === release.version &&
                        pin.digest === digest,
                ),
        )
    ) {
        throw new TypeError("Public infrastructure runtime must contain only exact admitted static GET queries");
    }
    runtime.dispatcher.seal(runtime.contracts);
    const relay = createProviderContractRelay(
        routes,
        runtime.dispatcher,
        { siteId: runtime.siteId, providerId: runtime.report.providerId },
        logger,
        runtime.authorizeInvocation,
    );
    for (const route of routes) {
        runner.get(route.capability.binding.path, async (request) => {
            if (request.url.length > 2048) {
                return new Response(null, { status: 414, headers: { "cache-control": "no-store" } });
            }
            const requestId = randomUUID();
            // Drop all untrusted transport metadata, credentials and scope headers.
            const scoped = new Request(request.url, {
                signal: request.signal,
                headers: { "x-ulvia-request-id": requestId },
            });
            const issuedAt = Math.floor(Date.now() / 1000);
            const response = await relay(scoped, {
                version: 1,
                requestId,
                instanceId: runtime.report.instanceId,
                contractId: route.contractId,
                contractVersion: route.contractVersion,
                capabilityId: route.capability.id,
                issuedAt,
                expiresAt: issuedAt + 30,
            });
            const output = response ?? new Response(null, { status: 404 });
            output.headers.set("cache-control", "no-store");
            return output;
        });
    }
}
