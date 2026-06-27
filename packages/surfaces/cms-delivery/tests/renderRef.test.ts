import { describe, expect, test } from "bun:test";
import { renderRef } from "cms-delivery/core/pages/renderRef";

function deliveryWithDraftFallback(field: "notFound" | "serverError") {
    const calls: string[] = [];
    return {
        calls,
        repository: {
            getSystem: async () => ({
                site: {
                    name: "Site",
                    favicon: "",
                    visible: true,
                    host: "",
                    language: "",
                    theme: "",
                    notFound: field === "notFound" ? { path: "/404" } : null,
                    serverError: field === "serverError" ? { path: "/500" } : null,
                },
            }),
            getPublishedPage: async (path: string) => {
                calls.push(path);
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
        const delivery = deliveryWithDraftFallback("notFound");
        const res = await renderRef(new Request("http://site/missing"), delivery, "notFound", 404, "Page not found");

        expect(res.status).toBe(404);
        expect(await res.text()).toBe("Page not found");
        expect(delivery.calls).toEqual(["/404"]);
    });

    test("does not render a draft 500 fallback page publicly", async () => {
        const delivery = deliveryWithDraftFallback("serverError");
        const res = await renderRef(new Request("http://site/error"), delivery, "serverError", 500, "Internal server error");

        expect(res.status).toBe(500);
        expect(await res.text()).toBe("Internal server error");
        expect(delivery.calls).toEqual(["/500"]);
    });
});
