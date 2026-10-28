import { describe, expect, test } from "bun:test";
import { renderRef } from "cms-content/pages/delivery/http/pages/renderRef";

function edgeWithDraftFallback(field: "notFound" | "forbidden" | "serverError") {
    const calls: string[] = [];
    return {
        calls,
        content: {
            getRenderingSettings: async () => ({
                site: {
                    name: "Site",
                    favicon: "",
                    visible: true,
                    host: "",
                    language: "",
                    theme: "",
                    notFound: field === "notFound" ? { kind: "site", pageId: "404" } : null,
                    forbidden: field === "forbidden" ? { kind: "site", pageId: "forbidden" } : null,
                    serverError: field === "serverError" ? { kind: "site", pageId: "500" } : null,
                    login: null,
                },
            }),
            resolvePageReference: async (reference: { pageId: string }) => {
                calls.push(`resolve:${reference.pageId}`);
                return `/${reference.pageId}`;
            },
            getRenderablePage: async (path: string) => {
                calls.push(`render:${path}`);
                return null;
            },
            getPage: async () => {
                throw new Error("draft fallback pages must not be fetched");
            },
        },
    } as any;
}

describe("renderRef", () => {
    test("does not render a draft 404 fallback page publicly", async () => {
        const edge = edgeWithDraftFallback("notFound");
        const res = await renderRef(new Request("http://site/missing"), edge, "notFound", 404, "Page not found");

        expect(res.status).toBe(404);
        expect(await res.text()).toBe("Page not found");
        expect(edge.calls).toEqual(["resolve:404", "render:/404"]);
    });

    test("does not render a draft 500 fallback page publicly", async () => {
        const edge = edgeWithDraftFallback("serverError");
        const res = await renderRef(
            new Request("http://site/error"),
            edge,
            "serverError",
            500,
            "Internal server error",
        );

        expect(res.status).toBe(500);
        expect(await res.text()).toBe("Internal server error");
        expect(edge.calls).toEqual(["resolve:500", "render:/500"]);
    });

    test("does not render a draft forbidden fallback page publicly", async () => {
        const edge = edgeWithDraftFallback("forbidden");
        const res = await renderRef(new Request("http://site/private"), edge, "forbidden", 403, "Forbidden");

        expect(res.status).toBe(403);
        expect(await res.text()).toBe("Forbidden");
        expect(edge.calls).toEqual(["resolve:forbidden", "render:/forbidden"]);
    });
});
