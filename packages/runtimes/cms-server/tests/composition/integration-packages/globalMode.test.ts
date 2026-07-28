import { afterEach, describe, expect, test } from "bun:test";
import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";
import { REMOTE_DEFINITION, REMOTE_INTEGRATION_KIND, REMOTE_INTEGRATION_VERSION } from "./fixture/catalogFixture";
import { globalRepositoryProxyFixture } from "./fixture/globalRepositoryProxy";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((stop) => stop()));
});

describe("production global repository read mode", () => {
    test("re-serves remote-only definitions and packages anonymously from Delivery", async () => {
        const fixture = await createFixture();
        const repository = `${fixture.deliveryOrigin}/.cms/repository`;

        expect(fixture.services.repositoryReadMode).toBe("global");
        expect(await fixture.services.integrationRepositoryCatalog.get(REMOTE_INTEGRATION_KIND)).toBeNull();

        const catalog = await fetch(`${repository}/api/integrations`);
        expect(catalog.status).toBe(200);
        expect(await catalog.json()).toEqual([
            expect.objectContaining({ kind: REMOTE_INTEGRATION_KIND, versions: ["9.8.7", "9.9.0"] }),
        ]);
        expect(catalog.headers.get("access-control-allow-origin")).toBe("*");
        expect(catalog.headers.get("cache-control")).toBe("public, max-age=60");

        const definition = await fetch(
            `${repository}/api/integrations/definition?kind=${REMOTE_INTEGRATION_KIND}&version=${REMOTE_INTEGRATION_VERSION}`,
        );
        expect(definition.status).toBe(200);
        expect(await definition.json()).toMatchObject(REMOTE_DEFINITION);
        expect(definition.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

        const packageUrl = `${repository}/api/integrations/package?kind=${REMOTE_INTEGRATION_KIND}&version=${REMOTE_INTEGRATION_VERSION}`;
        const packageResponse = await fetch(packageUrl);
        expect(packageResponse.status).toBe(200);
        const digest = packageResponse.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER);
        expect(digest).toMatch(/^[a-f0-9]{64}$/);
        expect(packageResponse.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(packageResponse.headers.get("access-control-allow-origin")).toBe("*");
        expect(await packageResponse.json()).toMatchObject({
            kind: REMOTE_INTEGRATION_KIND,
            version: REMOTE_INTEGRATION_VERSION,
        });

        const upstreamCallsAfterFirstDownload = fixture.requests.length;
        const limited = await fetch(packageUrl);
        expect(limited.status).toBe(429);
        expect(fixture.requests).toHaveLength(upstreamCallsAfterFirstDownload);

        const head = await fetch(packageUrl, { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(head.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER)).toBe(digest);
        expect(await head.text()).toBe("");
        expect(fixture.requests.every(({ authorization }) => authorization === null)).toBeTrue();
    });

    test("keeps Control isolated and returns structured upstream failures without breaking Delivery", async () => {
        const fixture = await createFixture();
        const repository = `${fixture.deliveryOrigin}/.cms/repository`;

        expect((await fetch(`${fixture.controlOrigin}/.cms/repository/api/integrations`)).status).toBe(404);
        expect((await fetch(`${fixture.controlOrigin}/control-health`)).status).toBe(200);
        fixture.stopUpstream();

        const unavailable = await fetch(`${repository}/api/integrations`);
        expect(unavailable.status).toBe(503);
        expect(await unavailable.json()).toEqual({
            error: "Integration repository is unavailable",
            code: "integration_repository_unavailable",
        });
        expect(unavailable.headers.get("cache-control")).toBe("no-store");
        expect(unavailable.headers.get("access-control-allow-origin")).toBe("*");
        const unavailablePackage = await fetch(
            `${repository}/api/integrations/package?kind=${REMOTE_INTEGRATION_KIND}&version=${REMOTE_INTEGRATION_VERSION}`,
        );
        expect(unavailablePackage.status).toBe(503);
        expect(await unavailablePackage.json()).toEqual({
            error: "Integration repository is unavailable",
            code: "integration_repository_unavailable",
        });
        expect((await fetch(`${fixture.deliveryOrigin}/delivery-health`)).status).toBe(200);
    });

    test("publishes only GET, HEAD, and CORS preflight methods", async () => {
        const fixture = await createFixture();
        const url = `${fixture.deliveryOrigin}/.cms/repository/api/integrations`;

        const head = await fetch(url, { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        const options = await fetch(url, { method: "OPTIONS" });
        expect(options.status).toBe(204);
        expect(options.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
        expect((await fetch(url, { method: "POST" })).status).toBe(404);
    });
});

async function createFixture() {
    const fixture = await globalRepositoryProxyFixture();
    cleanup.push(fixture.stop);
    return fixture;
}
