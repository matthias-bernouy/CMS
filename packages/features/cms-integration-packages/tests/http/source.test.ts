import { describe, expect, test } from "bun:test";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { httpPackageFixture, packageGet, packageHead } from "./fixtures";

describe("HTTP integration package source", () => {
    test("constructs without I/O and anonymously resolves the exact HEAD/GET resource", async () => {
        const fixture = await httpPackageFixture();
        const calls: Array<{ method: string; url: string; credentials: RequestCredentials | undefined }> = [];
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository",
            fetch: (async (input, init) => {
                const method = init?.method ?? "GET";
                calls.push({ method, url: String(input), credentials: init?.credentials });
                expect(new Headers(init?.headers).get("authorization")).toBeNull();
                expect(new Headers(init?.headers).get("accept")).toBe("application/json");
                return method === "HEAD" ? packageHead(fixture) : packageGet(fixture);
            }) as typeof fetch,
        });

        expect(calls).toEqual([]);
        const resolved = await source.getPackage("commerce", "1.2.3");

        expect(resolved).toEqual({ envelope: fixture.envelope, canonicalBytes: fixture.bytes, digest: fixture.digest });
        expect(calls).toEqual([
            {
                method: "HEAD",
                url: "https://integrations.example.test/.cms/repository/api/integrations/package?kind=commerce&version=1.2.3",
                credentials: "omit",
            },
            {
                method: "GET",
                url: "https://integrations.example.test/.cms/repository/api/integrations/package?kind=commerce&version=1.2.3",
                credentials: "omit",
            },
        ]);
    });

    test("returns null after an exact HEAD 404 without downloading a body", async () => {
        const methods: string[] = [];
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository/",
            fetch: (async (_input, init) => {
                methods.push(init?.method ?? "GET");
                return new Response(null, { status: 404 });
            }) as typeof fetch,
        });

        expect(await source.getPackage("missing", "1.0.0")).toBeNull();
        expect(methods).toEqual(["HEAD"]);
    });

    test("does not retain an in-memory response cache", async () => {
        const fixture = await httpPackageFixture();
        let calls = 0;
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository/",
            fetch: (async (_input, init) => {
                calls += 1;
                return init?.method === "HEAD" ? packageHead(fixture) : packageGet(fixture);
            }) as typeof fetch,
        });

        await source.getPackage("commerce", "1.2.3");
        await source.getPackage("commerce", "1.2.3");

        expect(calls).toBe(4);
    });
});
