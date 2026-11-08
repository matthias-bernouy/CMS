import { defineProvider, implementFeature, z } from "@bernouy/ulvia-sdk";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { resourcesFeature } from "../../src/application/feature";
import type { ResourceServices } from "../../src/application/feature";
import { initializationFixture } from "../initialization/fixtures";
import { TestResourceOperations } from "./operationsFixture";

const secret = "resource-provider-test-only-" + "x".repeat(64);
export async function resourceProviderFixture() {
    const f = await initializationFixture(true);
    const operations = new TestResourceOperations();
    let receive: ((request: Request) => Promise<Response>) | undefined;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: (request) => receive?.(request) ?? new Response(null, { status: 503 }),
    });
    const origin = `http://127.0.0.1:${server.port}`;
    const services: ResourceServices = {
        resources: {
            initialization: f.service,
            administrators: {
                resolve: async (provider, subject) =>
                    provider === "example/resources-provider" && subject === "opaque-admin" ? "admin" : null,
                enabled: async () => f.authority.allowed,
            },
            operation: (siteId) => operations.latest(siteId),
        },
    };
    try {
        const build = await compileProvider(
            defineProvider({
                providerId: "example/resources-provider",
                name: "Resource test Provider",
                version: "1.0.0",
                provenance: { publisherId: "example", publishedAt: "2026-11-08T00:00:00Z" },
                buildVersionRange: ">=1.0.0 <2.0.0",
                endpoint: { allowedOrigins: [origin], defaultOrigin: origin },
                configuration: z.strictObject({}),
                credentialSlots: [],
                requires: [],
                implementations: [
                    implementFeature(resourcesFeature, { services: (dependencies: ResourceServices) => dependencies }),
                ],
            }),
        );
        const runtime = createProvider(build, services, {
            scope: { siteId: "site-a", instanceId: "instance-a" },
            operations,
            authenticate: async (request) => {
                const token = request.headers.get("authorization");
                return token?.startsWith("Bearer ")
                    ? {
                          claims: verifyProviderInvocationToken(token.slice(7), secret),
                          siteId: "site-a",
                          providerId: build.manifest.manifest.providerId,
                      }
                    : null;
            },
            authorize: async () => true,
        });
        receive = runtime.fetch;
        return {
            ...f,
            operations,
            build,
            services,
            async call(
                name: "entry" | "status" | "plan" | "apply",
                input?: unknown,
                patch: Partial<ProviderInvocationClaims> = {},
                key = "resource-apply",
            ) {
                const now = Math.floor(Date.now() / 1000);
                const claims: ProviderInvocationClaims = {
                    version: 1,
                    requestId: crypto.randomUUID(),
                    instanceId: "instance-a",
                    contractId: resourcesFeature.contractId,
                    contractVersion: "1.0.0",
                    capabilityId: `initialization.${name}`,
                    actorKind: "administrator",
                    subjectId: "opaque-admin",
                    issuedAt: now,
                    expiresAt: now + 20,
                    ...patch,
                };
                for (const [name, value] of Object.entries(claims)) {
                    if (value === undefined) {
                        Reflect.deleteProperty(claims, name);
                    }
                }
                return fetch(`${origin}/initialization/${name}`, {
                    method: name === "apply" ? "POST" : name === "plan" ? "QUERY" : "GET",
                    headers: {
                        authorization: `Bearer ${signProviderInvocationToken(secret, claims)}`,
                        "x-ulvia-request-id": claims.requestId,
                        ...(input === undefined ? {} : { "content-type": "application/json" }),
                        ...(name === "apply" ? { "idempotency-key": key } : {}),
                    },
                    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
                });
            },
            close: () => server.stop(true),
        };
    } catch (error) {
        await server.stop(true);
        throw error;
    }
}
