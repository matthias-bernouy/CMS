import { describe, expect, test } from "bun:test";
import {
    HttpIntegrationPackageSource,
    IntegrationPackageRepositoryContractError,
    IntegrationPackageRepositoryUnavailableError,
} from "@bernouy/cms-integration-packages/http";
import { assertRepositoryError, httpPackageFixture, packageGet, packageHead } from "./fixtures";

describe("HTTP integration package failures", () => {
    test("maps transport failures, throttling, and upstream server errors to 503", async () => {
        await expectUnavailable(() => Promise.reject(new Error("private transport detail")));
        for (const status of [429, 500, 503]) {
            await expectUnavailable(() => Promise.resolve(new Response(null, { status })));
        }
    });

    test("times out even when fetch ignores abort", async () => {
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository/",
            timeoutMs: 10,
            fetch: (() => new Promise<Response>(() => undefined)) as typeof fetch,
        });

        const error = await source.getPackage("commerce", "1.2.3").catch((caught) => caught);

        expect(error).toBeInstanceOf(IntegrationPackageRepositoryUnavailableError);
        assertRepositoryError(error, 503, "integration_repository_unavailable");
    });

    test("applies the same timeout while streaming the GET body", async () => {
        const fixture = await httpPackageFixture();
        const stalledBody = new ReadableStream<Uint8Array>({
            pull: () => new Promise<void>(() => undefined),
        });
        const source = new HttpIntegrationPackageSource({
            baseUrl: "https://integrations.example.test/.cms/repository/",
            timeoutMs: 10,
            fetch: (async (_input, init) =>
                init?.method === "HEAD"
                    ? packageHead(fixture)
                    : packageGet(fixture, { body: stalledBody })) as typeof fetch,
        });

        const error = await source.getPackage("commerce", "1.2.3").catch((caught) => caught);

        expect(error).toBeInstanceOf(IntegrationPackageRepositoryUnavailableError);
        assertRepositoryError(error, 503, "integration_repository_unavailable");
    });

    test("maps invalid client statuses and a GET disappearing after HEAD to 502", async () => {
        await expectContract(() => Promise.resolve(new Response(null, { status: 400 })));

        const fixture = await httpPackageFixture();
        let call = 0;
        const source = packageSource(async () => {
            call += 1;
            return call === 1 ? packageHead(fixture) : new Response(null, { status: 404 });
        });
        await expectContractError(source.getPackage("commerce", "1.2.3"));
    });

    test("rejects missing, malformed, or inconsistent response metadata", async () => {
        const fixture = await httpPackageFixture();
        await expectContractError(
            packageSource(async () =>
                packageHead(fixture, { "x-cms-integration-package-digest": "missing" }),
            ).getPackage("commerce", "1.2.3"),
        );

        let call = 0;
        const inconsistent = packageSource(async () => {
            call += 1;
            return call === 1
                ? packageHead(fixture)
                : packageGet(fixture, { headers: { "x-cms-integration-package-digest": "0".repeat(64) } });
        });
        await expectContractError(inconsistent.getPackage("commerce", "1.2.3"));
    });

    test("recomputes the canonical digest and verifies requested identity", async () => {
        const fixture = await httpPackageFixture();
        const wrongDigest = "f".repeat(64);
        const digestSource = packageSource(async (_input, init) =>
            init?.method === "HEAD"
                ? packageHead(fixture, { "x-cms-integration-package-digest": wrongDigest })
                : packageGet(fixture, { headers: { "x-cms-integration-package-digest": wrongDigest } }),
        );
        await expectContractError(digestSource.getPackage("commerce", "1.2.3"));

        const wrongIdentity = await httpPackageFixture({ kind: "other" });
        const identitySource = packageSource(async (_input, init) =>
            init?.method === "HEAD" ? packageHead(wrongIdentity) : packageGet(wrongIdentity),
        );
        await expectContractError(identitySource.getPackage("commerce", "1.2.3"));
    });

    test("rejects non-canonical or invalid JSON package representations", async () => {
        const fixture = await httpPackageFixture();
        const nonCanonical = new TextEncoder().encode(`${new TextDecoder().decode(fixture.bytes)}\n`);
        const headers = { "content-length": String(nonCanonical.byteLength) };
        const source = packageSource(async (_input, init) =>
            init?.method === "HEAD"
                ? packageHead(fixture, headers)
                : packageGet(fixture, { body: nonCanonical, headers }),
        );
        await expectContractError(source.getPackage("commerce", "1.2.3"));

        const invalid = new TextEncoder().encode("not-json");
        const invalidHeaders = { "content-length": String(invalid.byteLength) };
        const invalidSource = packageSource(async (_input, init) =>
            init?.method === "HEAD"
                ? packageHead(fixture, invalidHeaders)
                : packageGet(fixture, { body: invalid, headers: invalidHeaders }),
        );
        await expectContractError(invalidSource.getPackage("commerce", "1.2.3"));
    });
});

function packageSource(fetchImpl: typeof fetch): HttpIntegrationPackageSource {
    return new HttpIntegrationPackageSource({
        baseUrl: "https://integrations.example.test/.cms/repository/",
        fetch: fetchImpl,
    });
}

async function expectUnavailable(response: () => Promise<Response>): Promise<void> {
    const error = await packageSource(response as typeof fetch)
        .getPackage("commerce", "1.2.3")
        .catch((caught) => caught);
    expect(error).toBeInstanceOf(IntegrationPackageRepositoryUnavailableError);
    assertRepositoryError(error, 503, "integration_repository_unavailable");
}

async function expectContract(response: () => Promise<Response>): Promise<void> {
    await expectContractError(packageSource(response as typeof fetch).getPackage("commerce", "1.2.3"));
}

async function expectContractError(operation: Promise<unknown>): Promise<void> {
    const error = await operation.catch((caught) => caught);
    expect(error).toBeInstanceOf(IntegrationPackageRepositoryContractError);
    assertRepositoryError(error, 502, "integration_repository_invalid_response");
}
