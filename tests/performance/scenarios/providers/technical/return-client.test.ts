import { expect, test } from "bun:test";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { loopbackProviderClient } from "./return-client";

test("Provider return channels pin only the exact synthetic tenant to loopback and preserve real SDK authority", async () => {
    const build = await compileOfficialFeatures();
    const release = build.contracts.find((row) => row.release.contractId === "ulvia/cms.observability")!.release;
    const token = "e".repeat(64);
    let received = 0;
    let tenant = "";
    const entry = {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        level: "info",
        event: "performance.fixture.dns",
        attributes: {},
    };
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            received++;
            expect(request.headers.get("host")).toBe(new URL(tenant).host);
            expect(request.headers.get("authorization")).toBe(`Bearer ${token}`);
            expect(request.headers.get("x-ulvia-provider-authority")).toBe("provider");
            expect(request.method).toBe("POST");
            expect(new URL(request.url).pathname).toStartWith("/.cms/call/ulvia/cms.observability/");
            expect(await request.json()).toEqual({ entries: [entry] });
            return Response.json({ accepted: 1, stored: 1, duplicates: 0 });
        },
    });
    tenant = `http://perf-return.localhost:${server.port}`;
    try {
        const response = await loopbackProviderClient(tenant, token).invoke(
            release,
            "logs.append",
            { entries: [entry] },
            { authority: "provider" },
        );
        expect(response.output).toEqual({ accepted: 1, stored: 1, duplicates: 0 });
        expect(received).toBe(1);
        for (const origin of ["https://ulvia.fr", `http://127.0.0.1:${server.port}`, "https://perf-return.localhost"]) {
            expect(() => loopbackProviderClient(origin, token)).toThrow();
        }
    } finally {
        server.stop(true);
    }
});
