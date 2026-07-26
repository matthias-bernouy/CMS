import { describe, expect, it } from "bun:test";
import { createRepositoryMaintenanceGuard, createRepositoryManagementGuard } from "@bernouy/cms-repository-management";
import { json, managementRequest, RecordingRateLimiter } from "./support";

describe("repository management authentication", () => {
    it.each([undefined, "Basic c2VjcmV0", "Bearer", "Bearer  secret", "Bearer secret extra"])(
        "rejects a missing or malformed authorization value without rate-limit accounting",
        async (authorization) => {
            const limiter = new RecordingRateLimiter();
            const guard = createGuard(limiter);
            let downstreamCalls = 0;

            const response = await guard(managementRequest(authorization), async () => {
                downstreamCalls += 1;
                return new Response(null, { status: 204 });
            });

            expect(response.status).toBe(401);
            expect(response.headers.get("www-authenticate")).toBe('Bearer realm="cms-repository-management"');
            expect(response.headers.get("cache-control")).toBe("no-store");
            expect(await json(response)).toEqual({
                error: "Repository management authentication is required",
                code: "management_unauthorized",
            });
            expect(limiter.keys).toEqual([]);
            expect(downstreamCalls).toBe(0);
        },
    );

    it.each(["x", "management-secret-x", "a-much-longer-invalid-management-secret"])(
        "uses one sanitized response for invalid tokens of different lengths",
        async (token) => {
            const limiter = new RecordingRateLimiter();
            const response = await createGuard(limiter)(managementRequest(`Bearer ${token}`), async () => {
                throw new Error("downstream must not run");
            });
            const serialized = await response.text();

            expect(response.status).toBe(401);
            expect(serialized).toBe(
                '{"error":"Repository management authentication is required","code":"management_unauthorized"}',
            );
            expect(serialized).not.toContain(token);
            expect(serialized).not.toContain("management-secret");
            expect(limiter.keys).toEqual([]);
        },
    );

    it("accepts an exact token before accounting for the authenticated principal", async () => {
        const limiter = new RecordingRateLimiter();
        const guard = createGuard(limiter);

        const response = await guard(managementRequest("bearer management-secret"), async () => {
            expect(limiter.keys).toEqual(["repository-management:management-cms"]);
            return Response.json({ accepted: true });
        });

        expect(response.status).toBe(200);
        expect(await json(response)).toEqual({ accepted: true });
    });
});

describe("repository management guard configuration", () => {
    it.each([
        { serviceToken: "", servicePrincipal: "management-cms" },
        { serviceToken: "   ", servicePrincipal: "management-cms" },
        { serviceToken: "secret", servicePrincipal: "" },
        { serviceToken: "secret", servicePrincipal: "   " },
    ])("rejects empty credentials at composition", (credentials) => {
        expect(() =>
            createRepositoryManagementGuard({
                ...credentials,
                rateLimiter: new RecordingRateLimiter(),
            }),
        ).toThrow(TypeError);
    });
});

describe("repository capability separation", () => {
    it("uses independent credentials and accounting identities", async () => {
        const managementLimiter = new RecordingRateLimiter();
        const maintenanceLimiter = new RecordingRateLimiter();
        const management = createGuard(managementLimiter);
        const maintenance = createRepositoryMaintenanceGuard({
            serviceToken: "maintenance-secret",
            servicePrincipal: "official-maintenance",
            rateLimiter: maintenanceLimiter,
        });
        const downstream = async () => new Response(null, { status: 204 });

        expect(await management(managementRequest("Bearer maintenance-secret"), downstream)).toMatchObject({
            status: 401,
        });
        expect(await maintenance(managementRequest("Bearer management-secret"), downstream)).toMatchObject({
            status: 401,
        });
        expect(await maintenance(managementRequest("Bearer maintenance-secret"), downstream)).toMatchObject({
            status: 204,
        });
        expect(managementLimiter.keys).toEqual([]);
        expect(maintenanceLimiter.keys).toEqual(["repository-maintenance:official-maintenance"]);
    });
});

function createGuard(limiter: RecordingRateLimiter) {
    return createRepositoryManagementGuard({
        serviceToken: "management-secret",
        servicePrincipal: "management-cms",
        rateLimiter: limiter,
    });
}
