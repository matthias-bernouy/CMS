import { describe, expect, test } from "bun:test";
import type { ContentReader } from "@bernouy/cms-content";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { CaptureRunner } from "../../gateway/support/CaptureRunner";

describe("Delivery robots", () => {
    test("allows rendering assets, public files, variants, and gateway media routes", async () => {
        const runner = new CaptureRunner("/site");
        const repository = {
            getRenderingSettings: async () => ({ site: { host: "https://canonical.test/store" } }),
        } as ContentReader;
        new DeliveryCms({
            runner,
            repository,
            capabilityGateway: {
                siteId: "site-a",
                invoker: { invoke: async () => ({ kind: "success", status: 200, requestId: "test" }) },
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
        expect(body).toContain("Allow: /site/.cms/files/\n");
        expect(body).toContain("Allow: /site/.cms/img/\n");
        expect(body).toContain("Allow: /site/.cms/collections/\n");
        expect(body).toContain("Allow: /site/.cms/media/\n");
        expect(body).toContain("Allow: /site/.cms/image/\n");
        expect(body).not.toContain("/.cms/sources/");
        expect(body).toContain("Disallow: /site/.cms/\n");
        expect(body).toContain("Sitemap: https://canonical.test/store/sitemap.xml\n");
        expect(body).not.toContain("unexpected.test");
    });

    test("omits the sitemap declaration when the canonical host is not configured", async () => {
        const runner = new CaptureRunner();
        const repository = { getRenderingSettings: async () => ({ site: { host: "" } }) } as ContentReader;
        new DeliveryCms({ runner, repository });

        const response = await runner.endpointHandler(
            "GET",
            "/robots.txt",
        )(new Request("https://unexpected.test/robots.txt"));

        expect(await response.text()).not.toContain("Sitemap:");
    });
});
