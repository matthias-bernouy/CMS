import { describe, expect, test } from "bun:test";
import getConfigDetail from "cms-control/api/_content/page/_editing/configDetail.get";
import type { TPage } from "@bernouy/cms-content";

const page: TPage = {
    id: "page-1",
    path: "/pricing",
    title: "Pricing",
    description: "Pricing page",
    content: "<p>Hello</p>",
    visible: true,
    tags: ["pricing", "landing"],
};

function cmsWithPage(existing: TPage | null, deliveryUrl?: string) {
    const requestedIds: string[] = [];
    const cms = {
        repository: {
            getPageById: async (id: string) => {
                requestedIds.push(id);
                return existing?.id === id ? existing : null;
            },
        },
        config: { deliveryUrl },
    };

    return { cms, requestedIds };
}

describe("GET /api/page/configDetail", () => {
    test("returns page metadata by id", async () => {
        const { cms, requestedIds } = cmsWithPage(page, "https://site.test");

        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=page-1"),
            cms as any,
        );

        expect(response.status).toBe(200);
        expect(requestedIds).toEqual(["page-1"]);
        expect(await response.json()).toEqual({
            id: "page-1",
            title: "Pricing",
            description: "Pricing page",
            path: "/pricing",
            publicUrl: "https://site.test/pricing",
            tags: ["pricing", "landing"],
            published: true,
        });
    });

    test("redirects to pages admin when id is missing", async () => {
        const { cms } = cmsWithPage(page);

        const response = await getConfigDetail(new Request("http://localhost/cms/api/page/configDetail"), cms as any);

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/cms/admin/pages");
    });

    test("redirects to pages admin when page does not exist", async () => {
        const { cms } = cmsWithPage(null);

        const response = await getConfigDetail(
            new Request("http://localhost/cms/api/page/configDetail?id=missing"),
            cms as any,
        );

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/cms/admin/pages");
    });
});
