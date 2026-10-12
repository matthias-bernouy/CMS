import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import KernelCms from "cms-kernel/KernelCms";
import { CaptureRunner } from "../../gateway/support/CaptureRunner";

describe("Kernel robots", () => {
    test("allows rendering assets and generic gateway calls", async () => {
        const runner = new CaptureRunner("/site");
        const repository = new InMemoryCmsRepository();
        const settings = await repository.getSystem();
        await repository.updateSystem({
            site: { ...settings.site, host: "https://canonical.test/store" },
        });
        new KernelCms({
            runner,
            repository,
            authentication: new InMemoryAuthentication(),
            capabilityGateway: {
                siteId: "site-a",
                invoker: { invoke: async () => ({ kind: "success", status: 200, requestId: "test" }) } as never,
                isAdministrator: async () => false,
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
            "/site/.cms/assets/component.js",
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
        const repository = new InMemoryCmsRepository();
        new KernelCms({
            runner,
            repository,
            authentication: new InMemoryAuthentication(),
        });

        const response = await runner.endpointHandler(
            "GET",
            "/robots.txt",
        )(new Request("https://unexpected.test/robots.txt"));

        expect(await response.text()).not.toContain("Sitemap:");
    });
});
