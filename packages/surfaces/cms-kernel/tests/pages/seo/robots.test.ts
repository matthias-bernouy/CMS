import { describe, expect, test } from "bun:test";
import { createContentReader, InMemoryContentRepository } from "@bernouy/cms-content";
import { InMemoryCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "../../gateway/support/CaptureRunner";
import { deliveryHandlers } from "../../gateway/support/deliveryHandlers";
import { NOOP_LOGGER } from "@bernouy/logging";

describe("Kernel robots", () => {
    test("allows rendering assets and generic gateway calls", async () => {
        const runner = new CaptureRunner("/site");
        const repository = new InMemoryContentRepository();
        const settings = await repository.getSystem();
        await repository.updateSystem({
            site: { ...settings.site, host: "https://canonical.test/store" },
        });
        const content = createContentReader(repository);
        new KernelCms({
            runner,
            cache: new InMemoryCache(),
            content,
            ...deliveryHandlers(content, { basePath: "/site", capabilityCallsEnabled: true }),
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
            "/site/.cms/style",
            "/site/.cms/blocset",
            "/site/.cms/assets/bloc-runtime.js",
            "/site/.cms/assets/cms-binding-core.js",
        ]) {
            expect(body).toContain(`Allow: ${path}$\n`);
            expect(body).toContain(`Allow: ${path}?\n`);
        }
        expect(body).toContain("Allow: /site/.cms/collections/\n");
        expect(body).toContain("Allow: /site/.cms/call/\n");
        expect(body).not.toContain("/.cms/sources/");
        expect(body).toContain("Disallow: /site/.cms/\n");
        expect(body).toContain("Sitemap: https://canonical.test/store/sitemap.xml\n");
        expect(body).not.toContain("unexpected.test");
    });

    test("omits the sitemap declaration when the canonical host is not configured", async () => {
        const runner = new CaptureRunner();
        const repository = new InMemoryContentRepository();
        const content = createContentReader(repository);
        new KernelCms({
            runner,
            cache: new InMemoryCache(),
            content,
            ...deliveryHandlers(content),
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
        new KernelCms({
            runner,
            cache: new InMemoryCache(),
            content,
            ...deliveryHandlers(content, { basePath: "/private" }),
            resolveActor: async () => ({ kind: "anonymous" }),
            logger: NOOP_LOGGER,
        });

        const response = await runner.endpointHandler(
            "GET",
            "/private/robots.txt",
        )(new Request("https://canonical.test/private/robots.txt"));

        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).toBe("User-agent: *\nDisallow: /private/\n");
    });
});
