import { expect, test } from "bun:test";
import { officialCapabilityInventory } from "../../capabilities/inventory";
import { observeNative } from "./http";

test("native public permission uses its admitted path/query and full response validation without a control credential", async () => {
    const target = (await officialCapabilityInventory()).targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/provider.tls",
    )!;
    let mode = "allowed";
    let seen = 0;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
            const url = new URL(request.url);
            expect(url.pathname).toBe("/hosting/tls/permission");
            expect(url.searchParams.get("domain")).toBe("sample.performance.test");
            expect(request.method).toBe("GET");
            expect(request.headers.get("authorization")).toBeNull();
            expect(request.headers.get("cookie")).toBeNull();
            expect(request.headers.get("x-ulvia-contract-id")).toBeNull();
            expect(request.headers.get("x-request-id")).not.toBeNull();
            seen++;
            return Response.json({ permission: mode }, { status: mode === "denied" ? 403 : 200 });
        },
    });
    const call = {
        origin: server.url.origin,
        target,
        binding: "http",
        input: { domain: "sample.performance.test" },
        credentials: {},
        assert: () => {},
    };
    try {
        const allowed = await observeNative(call);
        expect(allowed.validated).toBe(true);
        expect(allowed.streamConsumed).toBe(true);
        expect(allowed.completed).toBe(true);
        expect(allowed.responseBytes).toBeGreaterThan(0);
        mode = "denied";
        const refused = await observeNative(call);
        expect(refused.status).toBe(403);
        expect(refused.streamConsumed).toBe(true);
        expect(refused.validated).toBe(false);
        mode = "unexpected";
        expect((await observeNative(call)).failure).toBe("output-schema-invalid");
        expect(seen).toBe(3);
    } finally {
        await server.stop(true);
    }
});
