import { describe, expect, test } from "bun:test";
import { renderRef } from "cms-kernel/http/pages/renderRef";

function kernelWithDraftFallback(field: "notFound" | "forbidden" | "serverError") {
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
            getPublishedPageById: async (id: string) => {
                calls.push(id);
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
        const kernel = kernelWithDraftFallback("notFound");
        const res = await renderRef(new Request("http://site/missing"), kernel, "notFound", 404, "Page not found");

        expect(res.status).toBe(404);
        expect(await res.text()).toBe("Page not found");
        expect(kernel.calls).toEqual(["404"]);
    });

    test("does not render a draft 500 fallback page publicly", async () => {
        const kernel = kernelWithDraftFallback("serverError");
        const res = await renderRef(
            new Request("http://site/error"),
            kernel,
            "serverError",
            500,
            "Internal server error",
        );

        expect(res.status).toBe(500);
        expect(await res.text()).toBe("Internal server error");
        expect(kernel.calls).toEqual(["500"]);
    });

    test("does not render a draft forbidden fallback page publicly", async () => {
        const kernel = kernelWithDraftFallback("forbidden");
        const res = await renderRef(new Request("http://site/private"), kernel, "forbidden", 403, "Forbidden");

        expect(res.status).toBe(403);
        expect(await res.text()).toBe("Forbidden");
        expect(kernel.calls).toEqual(["forbidden"]);
    });
});
