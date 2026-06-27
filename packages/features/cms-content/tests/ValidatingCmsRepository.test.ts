import { describe, test, expect } from "bun:test";
import { ValidatingCmsRepository, ContentValidationError } from "@bernouy/cms-content";
import type { CmsRepository } from "@bernouy/cms-content";

/** Capturing inner repo: records what the decorator forwards after validation
 *  + normalization, and answers the ref-existence reads. */
function makeRepo(opts: { blocs?: string[]; snippets?: string[] } = {}) {
    const calls: Record<string, any[]> = {
        insertPage: [], updatePage: [], createSnippet: [], updateSnippet: [], createTemplate: [], updateTemplate: [],
    };
    const inner = {
        insertPage:     async (path: string, title: string) => { calls.insertPage.push([path, title]); },
        updatePage:     async (p: any) => { calls.updatePage.push(p); },
        createSnippet:  async (s: any) => { calls.createSnippet.push(s); return { ...s, id: "s1" }; },
        updateSnippet:  async (id: string, d: any) => { calls.updateSnippet.push([id, d]); return null; },
        createTemplate: async (t: any) => { calls.createTemplate.push(t); return { ...t, id: "t1" }; },
        updateTemplate: async (id: string, d: any) => { calls.updateTemplate.push([id, d]); return null; },
        getBlocsList:        async () => (opts.blocs ?? []).map((id) => ({ id, name: id, group: "", description: "" })),
        getSnippetsMetadata: async () => (opts.snippets ?? []).map((identifier) => ({ id: identifier, identifier, name: identifier, category: "", updatedAt: "" })),
    } as unknown as CmsRepository;
    return { repo: new ValidatingCmsRepository(inner), calls };
}

describe("ValidatingCmsRepository — pages", () => {
    test("insertPage normalizes title and rejects a bad path", async () => {
        const { repo, calls } = makeRepo();
        await repo.insertPage("/ok", "  Hello  ");
        expect(calls.insertPage[0]).toEqual(["/ok", "Hello"]);          // title trimmed
        await expect(repo.insertPage("bad path", "T")).rejects.toThrow(ContentValidationError);
    });

    test("updatePage trims the title and forwards it", async () => {
        const { repo, calls } = makeRepo();
        await repo.updatePage({ id: "p1", title: "  Spaced  " });
        expect(calls.updatePage[0].title).toBe("Spaced");
    });

    test("updatePage rejects an empty title and an invalid path", async () => {
        const { repo } = makeRepo();
        await expect(repo.updatePage({ id: "p1", title: "   " })).rejects.toThrow(ContentValidationError);
        await expect(repo.updatePage({ id: "p1", path: "no-slash" })).rejects.toThrow(ContentValidationError);
    });

    test("updatePage validates + dedupes tags", async () => {
        const { repo, calls } = makeRepo();
        await repo.updatePage({ id: "p1", tags: ["a", "a", " b "] });
        expect(calls.updatePage[0].tags).toEqual(["a", "b"]);
        await expect(repo.updatePage({ id: "p1", tags: ["bad/char"] })).rejects.toThrow(ContentValidationError);
    });

    test("updatePage requires visible to be a strict boolean", async () => {
        const { repo, calls } = makeRepo();
        await repo.updatePage({ id: "p1", visible: false });
        expect(calls.updatePage[0].visible).toBe(false);
        await expect(repo.updatePage({ id: "p1", visible: "false" as any })).rejects.toThrow(ContentValidationError);
    });

    test("updatePage hardens content and checks refs exist", async () => {
        const { repo, calls } = makeRepo({ blocs: ["cs-card"] });
        await repo.updatePage({ id: "p1", content: "<cs-card></cs-card>" });
        expect(calls.updatePage[0].content).toContain("cs-card");
        await expect(repo.updatePage({ id: "p1", content: "<cs-ghost></cs-ghost>" })).rejects.toThrow();
    });
});

describe("ValidatingCmsRepository — snippets", () => {
    test("createSnippet rejects a non-kebab identifier", async () => {
        const { repo } = makeRepo();
        for (const bad of ["Hero", "hero_section", "hero section", "-leading", "trailing-", "double--dash"]) {
            await expect(repo.createSnippet({ identifier: bad, name: "X", description: "", content: "", category: "", createdAt: new Date(), updatedAt: new Date() }))
                .rejects.toThrow(ContentValidationError);
        }
    });

    test("createSnippet normalizes the name", async () => {
        const { repo, calls } = makeRepo();
        await repo.createSnippet({ identifier: "hero", name: "  Hero  ", description: "", content: "", category: "", createdAt: new Date(), updatedAt: new Date() });
        expect(calls.createSnippet[0].name).toBe("Hero");
    });

    test("updateSnippet trims the name", async () => {
        const { repo, calls } = makeRepo();
        await repo.updateSnippet("s1", { name: "  Redacted  " });
        expect(calls.updateSnippet[0][1].name).toBe("Redacted");
    });
});

describe("ValidatingCmsRepository — templates", () => {
    test("createTemplate rejects a non-kebab identifier and trims the name", async () => {
        const { repo, calls } = makeRepo();
        await expect(repo.createTemplate({ identifier: "Bad Id", name: "X", description: "", content: "", category: "", createdAt: new Date() }))
            .rejects.toThrow(ContentValidationError);
        await repo.createTemplate({ identifier: "ok", name: "  Tpl  ", description: "", content: "", category: "", createdAt: new Date() });
        expect(calls.createTemplate[0].name).toBe("Tpl");
    });
});

describe("ValidatingCmsRepository — pass-through", () => {
    test("reads delegate unchanged", async () => {
        const { repo } = makeRepo({ blocs: ["x"] });
        expect((await repo.getBlocsList()).map((b) => b.id)).toEqual(["x"]);
    });
});
