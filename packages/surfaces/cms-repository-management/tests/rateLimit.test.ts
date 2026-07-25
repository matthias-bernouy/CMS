import { describe, expect, it } from "bun:test";
import { createRepositoryManagementGuard } from "@bernouy/cms-repository-management";
import { json, managementRequest, RecordingRateLimiter } from "./support";

describe("repository management rate limiting", () => {
    it("runs after authentication and before downstream body parsing", async () => {
        const limiter = new RecordingRateLimiter({ allowed: false, retryAfterSeconds: 17 });
        const request = managementRequest("Bearer management-secret");
        let bodyReads = 0;
        request.json = async () => {
            bodyReads += 1;
            return {};
        };
        const guard = createGuard("publisher-a", limiter);

        const response = await guard(request, async () => {
            await request.json();
            return new Response(null, { status: 204 });
        });

        expect(limiter.keys).toEqual(["repository-management:publisher-a"]);
        expect(bodyReads).toBe(0);
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("17");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await json(response)).toEqual({
            error: "Repository management rate limit exceeded",
            code: "management_rate_limited",
            retryAfterSeconds: 17,
        });
    });

    it("uses independent keys for configured authenticated principals", async () => {
        const limiter = new RecordingRateLimiter();
        const publisherA = createGuard("publisher-a", limiter);
        const publisherB = createGuard("publisher-b", limiter);

        await publisherA(managementRequest("Bearer management-secret"), accepted);
        await publisherB(managementRequest("Bearer management-secret"), accepted);

        expect(limiter.keys).toEqual(["repository-management:publisher-a", "repository-management:publisher-b"]);
    });

    it("sanitizes limiter failures and does not invoke downstream", async () => {
        const limiter = new RecordingRateLimiter({ allowed: true }, new Error("mongo failed with management-secret"));
        let downstreamCalls = 0;

        const response = await createGuard("publisher-a", limiter)(
            managementRequest("Bearer management-secret"),
            async () => {
                downstreamCalls += 1;
                return new Response(null, { status: 204 });
            },
        );
        const serialized = await response.text();

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(JSON.parse(serialized)).toEqual({
            error: "Repository management protection is unavailable",
            code: "management_protection_unavailable",
        });
        expect(serialized).not.toContain("mongo failed");
        expect(serialized).not.toContain("management-secret");
        expect(downstreamCalls).toBe(0);
    });

    it("normalizes missing or invalid retry metadata", async () => {
        for (const retryAfterSeconds of [undefined, Number.NaN, -4, 0.2]) {
            const limiter = new RecordingRateLimiter({ allowed: false, retryAfterSeconds });
            const response = await createGuard("publisher-a", limiter)(
                managementRequest("Bearer management-secret"),
                accepted,
            );

            expect(response.headers.get("retry-after")).toBe("1");
            expect(await json(response)).toMatchObject({ retryAfterSeconds: 1 });
        }
    });
});

function createGuard(servicePrincipal: string, limiter: RecordingRateLimiter) {
    return createRepositoryManagementGuard({
        serviceToken: "management-secret",
        servicePrincipal,
        rateLimiter: limiter,
    });
}

async function accepted(): Promise<Response> {
    return new Response(null, { status: 204 });
}
