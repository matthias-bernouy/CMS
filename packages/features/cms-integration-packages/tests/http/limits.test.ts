import { describe, expect, test } from "bun:test";
import {
    HttpIntegrationPackageSource,
    IntegrationPackageRepositoryContractError,
} from "@bernouy/cms-integration-packages/http";
import { httpPackageFixture, packageGet, packageHead } from "./fixtures";

describe("HTTP integration package response limits", () => {
    test("rejects an oversized declared HEAD before GET", async () => {
        const fixture = await httpPackageFixture();
        const methods: string[] = [];
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository/",
            limits: { maxDocumentBytes: fixture.bytes.byteLength },
            fetch: (async (_input, init) => {
                methods.push(init?.method ?? "GET");
                return packageHead(fixture, { "content-length": String(fixture.bytes.byteLength + 1) });
            }) as typeof fetch,
        });

        await expectContract(source.getPackage("commerce", "1.2.3"));
        expect(methods).toEqual(["HEAD"]);
    });

    test("caps bytes actually consumed when GET understates its body", async () => {
        const fixture = await httpPackageFixture();
        const declaredLength = fixture.bytes.byteLength;
        let cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(fixture.bytes);
                controller.enqueue(Uint8Array.of(0));
            },
            cancel() {
                cancelled = true;
            },
        });
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository/",
            limits: { maxDocumentBytes: declaredLength },
            fetch: (async (_input, init) =>
                init?.method === "HEAD"
                    ? packageHead(fixture)
                    : packageGet(fixture, {
                          body,
                          headers: { "content-length": String(declaredLength) },
                      })) as typeof fetch,
        });

        await expectContract(source.getPackage("commerce", "1.2.3"));
        expect(cancelled).toBe(true);
    });

    test("bounds decoded bytes independently of an optional transport content length", async () => {
        const fixture = await httpPackageFixture();
        const headHeaders = packageHead(fixture).headers;
        const getHeaders = packageGet(fixture).headers;
        headHeaders.delete("content-length");
        getHeaders.set("content-length", String(fixture.bytes.byteLength - 1));
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository/",
            limits: { maxDocumentBytes: fixture.bytes.byteLength },
            fetch: (async (_input, init) =>
                init?.method === "HEAD"
                    ? new Response(null, { headers: headHeaders })
                    : new Response(fixture.bytes, { headers: getHeaders })) as typeof fetch,
        });

        expect((await source.getPackage("commerce", "1.2.3"))?.digest).toBe(fixture.digest);
    });

    test("rejects invalid timeout and document-limit configuration without fetching", () => {
        let calls = 0;
        const config = {
            baseUrl: "https://integrations.example.test/.cms/repository/",
            fetch: (async () => {
                calls += 1;
                return new Response();
            }) as typeof fetch,
        };

        expect(() => new HttpIntegrationPackageSource({ ...config, timeoutMs: 0 })).toThrow(RangeError);
        expect(() => new HttpIntegrationPackageSource({ ...config, limits: { maxDocumentBytes: 0 } })).toThrow(
            TypeError,
        );
        expect(
            () =>
                new HttpIntegrationPackageSource({
                    ...config,
                    baseUrl: "https://token@integrations.example.test/.cms/repository/",
                }),
        ).toThrow(/must not contain credentials/);
        expect(calls).toBe(0);
    });
});

async function expectContract(operation: Promise<unknown>): Promise<void> {
    expect(await operation.catch((error) => error)).toBeInstanceOf(IntegrationPackageRepositoryContractError);
}
