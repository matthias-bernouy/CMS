import { describe, test, expect } from "bun:test";
import { P9R_CACHE } from "@bernouy/cms-content";
import type { TPage, TSnippet } from "@bernouy/cms-content";
import { invalidatePagesReferencingFile } from "cms-control/core/server/cache/invalidation";

const page = (path: string, content: string): TPage =>
    ({ id: path, path, title: "", description: "", content, visible: true, tags: [] });
const snippet = (identifier: string, content: string): TSnippet =>
    ({ id: identifier, identifier, name: "", description: "", content, category: "", createdAt: new Date(), updatedAt: new Date() });

function makeCms(opts: { pages?: TPage[]; snippets?: TSnippet[]; favicon?: string }) {
    const deleteSpy: string[] = [];
    let allInvalidated = false;
    const cms: any = {
        repository: {
            getAllPages:    async () => opts.pages ?? [],
            getAllSnippets: async () => opts.snippets ?? [],
            getSystem:      async () => ({ site: { favicon: opts.favicon ?? "" } }),
        },
        cache: {
            delete:         (k: string) => deleteSpy.push(k),
            deleteMatching: () => { allInvalidated = true; },
        },
    };
    return { cms, deleteSpy, allInvalidated: () => allInvalidated };
}

const FID = "01h-file";
const imgRef = `<img src="/.cms/files/by-id/${FID}">`;

describe("invalidatePagesReferencingFile", () => {
    test("invalidates a page that references the file directly, leaves others", async () => {
        const { cms, deleteSpy } = makeCms({ pages: [page("/a", imgRef), page("/b", "<p>none</p>")] });
        await invalidatePagesReferencingFile(cms, FID);
        expect(deleteSpy).toEqual([P9R_CACHE.page("/a")]);
    });

    test("invalidates a page that references the file transitively via a snippet", async () => {
        const { cms, deleteSpy } = makeCms({
            pages:    [page("/a", `<w13c-snippet identifier="snip"></w13c-snippet>`)],
            snippets: [snippet("snip", imgRef)],
        });
        await invalidatePagesReferencingFile(cms, FID);
        expect(deleteSpy).toContain(P9R_CACHE.page("/a"));
    });

    test("no invalidation when nothing references the file", async () => {
        const { cms, deleteSpy } = makeCms({ pages: [page("/a", "<p>x</p>")] });
        await invalidatePagesReferencingFile(cms, FID);
        expect(deleteSpy).toHaveLength(0);
    });

    test("a favicon pointing at the file invalidates ALL pages", async () => {
        const { cms, deleteSpy, allInvalidated } = makeCms({ pages: [page("/a", "<p>x</p>")], favicon: `/.cms/files/by-id/${FID}` });
        await invalidatePagesReferencingFile(cms, FID);
        expect(allInvalidated()).toBe(true);
        expect(deleteSpy).toHaveLength(0); // took the all-pages shortcut
    });

    test("a different file id does not match a similar one", async () => {
        const { cms, deleteSpy } = makeCms({ pages: [page("/a", imgRef)] });
        await invalidatePagesReferencingFile(cms, "other-id");
        expect(deleteSpy).toHaveLength(0);
    });
});
