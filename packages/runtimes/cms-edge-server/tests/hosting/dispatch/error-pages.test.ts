import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import { SharedEdge } from "../../../src/runtime/hosting/SharedEdge";

test("unknown and unavailable hosts serve localized generic Pages without constructing another tenant", async () => {
    let creates = 0;
    const routing = {
        async resolve(host: string) {
            if (host === "broken.localhost") {
                throw new Error("private provider diagnostic");
            }
            return null;
        },
    };
    const edge = new SharedEdge(
        routing,
        async () => {
            creates++;
            throw new Error("must not open a tenant");
        },
        NOOP_LOGGER,
        { maxEntries: 2, maxPending: 2 },
    );
    try {
        for (const [host, status] of [
            ["unknown.localhost", 404],
            ["broken.localhost", 503],
        ] as const) {
            const request = new Request(`http://${host}/private?token=hidden`, {
                headers: { "accept-language": "fr-CA" },
            });
            const response = await edge.handle(request);
            expect(response.status).toBe(status);
            expect(response.headers.get("content-type")).toContain("text/html");
            expect(response.headers.get("content-language")).toBe("fr");
            const body = await response.text();
            expect(body).toContain('<html lang="fr">');
            expect(body).not.toContain("private provider diagnostic");
            expect(body).not.toContain("token=hidden");
            const head = await edge.handle(new Request(request, { method: "HEAD" }));
            expect(head.body).toBeNull();
            const api = await edge.handle(
                new Request(`http://${host}/.cms/call/contract`, { method: "POST", body: "{}" }),
            );
            expect(api.status).toBe(status);
            expect(api.body).toBeNull();
        }
        expect(creates).toBe(0);
        expect(edge.snapshot().entries).toBe(0);
    } finally {
        await edge.close();
    }
});
