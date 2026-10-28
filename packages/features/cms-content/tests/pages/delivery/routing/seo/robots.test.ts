import { describe, expect, test } from "bun:test";
import { createContentReader, InMemoryContentRepository } from "@bernouy/cms-content";
import { InMemoryCache } from "@bernouy/http-runner";
import EdgeCms from "../../support/ContentHarness";
import { CaptureRunner } from "../../support/CaptureRunner";
import { NOOP_LOGGER } from "@bernouy/logging";

describe("Content robots", () => {
    test("allows rendering assets and generic gateway calls", async () => {
        const runner = new CaptureRunner("/site");
        const repository = new InMemoryContentRepository();
        const settings = await repository.getSystem();
        await repository.updateSystem({
            site: { ...settings.site, host: "https://canonical.test/store" },
        });
        const content = createContentReader(repository);
        new EdgeCms({
            runner,
            cache: new InMemoryCache(),
            content,
            resolveActor: async () => ({ kind: "anonymous" }),
            logger: NOOP_LOGGER,
            capabilityGateway: {
                siteId: "site-a",
                invoker: { invoke: async () => ({ kind: "success", status: 200, requestId: "test" }) } as never,
            },
        });

        const response = await runner.endpointHandler(
            "GET",
            "/site/robots.txt",
        )(new Request("https://unexpected.test/site/robots.txt"));
        const body = await response.text();

        for (const path of [
            "/_content/style",
            "/_content/blocset",
            "/_content/assets/bloc-runtime.js",
            "/_content/assets/cms-binding-core.js",
        ]) {
            expect(body).toContain(`Allow: ${path}$\n`);
            expect(body).toContain(`Allow: ${path}?\n`);
        }
        expect(body).toContain("Allow: /_content/collections/\n");
        expect(body).toContain("Allow: /.cms/call/\n");
        expect(body).not.toContain("/.cms/sources/");
        expect(body).toContain("Disallow: /.cms/\n");
        expect(body).toContain("Sitemap: https://canonical.test/store/sitemap.xml\n");
        expect(body).not.toContain("unexpected.test");
    });

    test("omits the sitemap declaration when the canonical host is not configured", async () => {
        const runner = new CaptureRunner();
        const repository = new InMemoryContentRepository();
        const content = createContentReader(repository);
        new EdgeCms({
            runner,
            cache: new InMemoryCache(),
            content,
            resolveActor: async () => ({ kind: "anonymous" }),
            logger: NOOP_LOGGER,
        });

        const response = await runner.endpointHandler(
            "GET",
            "/robots.txt",
        )(new Request("https://unexpected.test/robots.txt"));

        expect(await response.text()).not.toContain("Sitemap:");
    });

    test("blocks crawling and omits the sitemap for a private site", async () => {
        const runner = new CaptureRunner("/private");
        const repository = new InMemoryContentRepository();
        const settings = await repository.getSystem();
        await repository.updateSystem({
            site: { ...settings.site, visible: false, host: "https://canonical.test/private" },
        });
        const content = createContentReader(repository);
        new EdgeCms({
            runner,
            cache: new InMemoryCache(),
            content,
            resolveActor: async () => ({ kind: "anonymous" }),
            logger: NOOP_LOGGER,
        });

        const response = await runner.endpointHandler(
            "GET",
            "/private/robots.txt",
        )(new Request("https://canonical.test/private/robots.txt"));

        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
    });
});
