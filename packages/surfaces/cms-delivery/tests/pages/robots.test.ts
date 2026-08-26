import { describe, expect, test } from "bun:test";
import type { ContentReader } from "@bernouy/cms-content";
import { InMemorySourceRepository, type SourceEndpoint } from "@bernouy/cms-sources";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

describe("Delivery robots", () => {
    test("allows rendering assets, public files, variants, and only declared public Source images", async () => {
        const runner = new CaptureRunner("/site");
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:catalog",
            endpoints: [
                endpoint("publicImage"),
                endpoint("privateImage", { access: { mode: "auth" } }),
                endpoint("publicJson", { responseKind: "json" }),
                endpoint("computedImage", {
                    input: {
                        params: [
                            {
                                name: "userId",
                                in: "query",
                                source: { from: "computed", ref: "userID" },
                                schema: { type: "string" },
                            },
                        ],
                    },
                }),
            ],
        });
        const repository = {
            getSystem: async () => ({ site: { host: "https://canonical.test/store" } }),
        } as ContentReader;
        new DeliveryCms({ runner, repository, sources });

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
        expect(body).toContain("Allow: /site/.cms/sources/catalog/publicImage$\n");
        expect(body).toContain("Allow: /site/.cms/sources/catalog/publicImage?\n");
        expect(body).not.toContain("/privateImage");
        expect(body).not.toContain("/publicJson");
        expect(body).not.toContain("/computedImage");
        expect(body).toContain("Disallow: /site/.cms/\n");
        expect(body).toContain("Sitemap: https://canonical.test/store/sitemap.xml\n");
        expect(body).not.toContain("unexpected.test");
    });

    test("omits the sitemap declaration when the canonical host is not configured", async () => {
        const runner = new CaptureRunner();
        const repository = { getSystem: async () => ({ site: { host: "" } }) } as ContentReader;
        new DeliveryCms({ runner, repository });

        const response = await runner.endpointHandler(
            "GET",
            "/robots.txt",
        )(new Request("https://unexpected.test/robots.txt"));

        expect(await response.text()).not.toContain("Sitemap:");
    });
});

function endpoint(id: string, overrides: Partial<SourceEndpoint> = {}): SourceEndpoint {
    return {
        urn: `urn:catalog:${id}`,
        method: "GET",
        access: { mode: "public" },
        targetUrl: `https://example.test/${id}`,
        responseKind: "file",
        mediaType: "image/*",
        output: [{ status: "200" }],
        ...overrides,
    };
}
