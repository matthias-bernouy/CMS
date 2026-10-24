import { expect, test } from "bun:test";
import { provisionLocalInstance } from "../../src/runtime/instance";

test("local provisioning sends administrator input only to the protected operator endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let captured: Request | undefined;
    globalThis.fetch = (async (input, init) => {
        captured = new Request(input, init);
        return Response.json({
            instance: {
                id: "instance:00000000-0000-4000-8000-000000000001",
                status: "ready",
            },
            credentials: {
                instanceAccessToken: "a".repeat(43),
            },
        });
    }) as typeof fetch;
    try {
        const connection = await provisionLocalInstance(
            "http://127.0.0.1:5103",
            "operator-secret",
            {
                schema: "ulvia.local-instance-runtime.v1",
                name: "preview",
                label: "Preview instance",
                hostname: "preview.localhost",
                adminEmail: "dev@ulvia.local",
                adminPassword: "long-enough-password",
            },
            "http://preview.localhost:5100",
        );
        expect(connection.instanceId).toStartWith("instance:");
        expect(captured?.url).toBe("http://127.0.0.1:5103/ulvia/operator/instances");
        expect(captured?.headers.get("authorization")).toBe("Bearer operator-secret");
        expect(captured?.headers.get("idempotency-key")).toBe("ulvia-cli-preview");
        const body = await captured?.json();
        expect(body.administrator.email).toBe("dev@ulvia.local");
        expect(body.kernelUrl).toBe("http://preview.localhost:5100");
    } finally {
        globalThis.fetch = originalFetch;
    }
});
