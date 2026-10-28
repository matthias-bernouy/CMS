import { expect, test } from "bun:test";
import { mountPublicPages, publicPage } from "./publicPage.fixture";

test("an administrator renders a hidden Page at its normal URL", async () => {
    let textResolutions = 0;
    const page = {
        ...publicPage("page-a", "/about", "<h1>{{ cms.i18n.preview.title }}</h1>"),
        visible: false,
    };
    const mounted = mountPublicPages({
        storedPages: [page],
        editorialPages: [page],
        activeLanguages: ["fr"],
        resolveActor: async () => ({ kind: "administrator", subjectId: "admin-a" }),
        contentTexts: [
            {
                namespace: "preview",
                resolve: (locale) => {
                    textResolutions += 1;
                    return { title: locale === "fr" ? "Aperçu" : "Preview" };
                },
            },
        ],
    });

    const response = await mounted.get(new Request("https://site.test/about"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-language")).toBe("en");
    expect(response.headers.get("content-security-policy")).toBeNull();

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(html).toContain("<h1>Preview</h1>");
    expect(html).not.toContain("cms.i18n");

    const repeated = await mounted.get(new Request("https://site.test/about"));
    expect(repeated.headers.get("cache-control")).toBe("private, no-store");
    expect(await repeated.text()).toContain("<h1>Preview</h1>");
    expect(textResolutions).toBe(1);
});

test("a hidden Page remains undiscoverable to non-administrators", async () => {
    const page = { ...publicPage("page-a", "/about"), visible: false };
    for (const kind of ["anonymous", "user"] as const) {
        let editorialLookups = 0;
        const mounted = mountPublicPages({
            storedPages: [page],
            editorialPages: [page],
            onEditorialLookup: () => {
                editorialLookups += 1;
            },
            resolveActor: async () => (kind === "anonymous" ? { kind } : { kind, subjectId: "user-a" }),
        });

        const response = await mounted.get(new Request("https://site.test/about"));

        expect(response.status).toBe(404);
        expect(editorialLookups).toBe(0);
    }
});

test("a public Page is same-origin embeddable without becoming private", async () => {
    const mounted = mountPublicPages({ storedPages: [publicPage("page-a", "/about")] });

    const response = await mounted.get(new Request("https://site.test/about"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBeNull();

    expect(response.headers.get("x-robots-tag")).toBeNull();
});

test("an editorial route infrastructure failure is not concealed as a missing Page", async () => {
    const page = { ...publicPage("page-a", "/about"), visible: false };
    const mounted = mountPublicPages({
        storedPages: [page],
        resolveActor: async () => ({ kind: "administrator", subjectId: "admin-a" }),
        resolveEditorialRoute: async () => {
            throw new Error("provider unavailable");
        },
    });

    const response = await mounted.get(new Request("https://site.test/about"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
});
