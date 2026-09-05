import { describe, test, expect } from "bun:test";
import { ValidatingCmsRepository, ContentValidationError } from "@bernouy/cms-content";
import type { CmsRepository } from "@bernouy/cms-content";

/** Capturing inner repo: records what the decorator forwards after validation
 *  + normalization, and answers the ref-existence reads. */
function makeRepo(opts: { blocs?: string[] } = {}) {
    const calls: Record<string, any[]> = {
        insertPage: [],
        updatePage: [],
    };
    const inner = {
        insertPage: async (path: string, title: string, content?: string) => {
            calls.insertPage.push([path, title, content]);
        },
        updatePage: async (p: any) => {
            calls.updatePage.push(p);
        },
        getBlocsList: async () => (opts.blocs ?? []).map((id) => ({ id, name: id, group: "", description: "" })),
    } as unknown as CmsRepository;
    return { repo: new ValidatingCmsRepository(inner), calls };
}

describe("ValidatingCmsRepository — pages", () => {
    test("insertPage normalizes title and rejects a bad path", async () => {
        const { repo, calls } = makeRepo();
        await repo.insertPage("/ok", "  Hello  ");
        expect(calls.insertPage[0]).toEqual(["/ok", "Hello", undefined]); // title trimmed
        await expect(repo.insertPage("bad path", "T")).rejects.toThrow(ContentValidationError);
    });

    test("insertPage validates copied content and its bloc references", async () => {
        const { repo, calls } = makeRepo({ blocs: ["fixture-card"] });
        await repo.insertPage("/copy", "Copy", "<fixture-card></fixture-card>");
        expect(calls.insertPage[0][2]).toContain("fixture-card");
        await expect(repo.insertPage("/bad-copy", "Bad copy", "<fixture-ghost></fixture-ghost>")).rejects.toThrow();
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
        const { repo, calls } = makeRepo({ blocs: ["fixture-card"] });
        await repo.updatePage({ id: "p1", content: "<fixture-card></fixture-card>" });
        expect(calls.updatePage[0].content).toContain("fixture-card");
        await expect(repo.updatePage({ id: "p1", content: "<fixture-ghost></fixture-ghost>" })).rejects.toThrow();
    });

    test("rejects invalid native HTML at both page-write boundaries", async () => {
        const invalid = [
            ["<span>Root bypass</span>", /explicit component text slot/],
            ["<li>Orphan</li>", /direct child/],
            ["<ul><section>Not an item</section></ul>", /only direct <li>/],
            ["<ul><fixture-card>Not an item</fixture-card></ul>", /only direct <li>/],
            ["<ul>Loose text<li>Item</li></ul>", /only direct <li>/],
            ['<h1 class="forged">Title</h1>', /not allowed/],
            ['<img src="https:\/\/example.invalid\/photo.jpg" alt="Photo">', /CMS media item/],
            ['<img alt="Photo">', /CMS media item/],
            ["<form></form>", /declared CMS source endpoint/],
            ["<fixture-card><form></form></fixture-card>", /declared CMS source endpoint/],
            [
                '<fixture-card><img src="https:\/\/example.invalid\/photo.jpg" alt="Photo"></fixture-card>',
                /CMS media or a typed CMS Source image/,
            ],
            ['<fixture-card><img alt=""></fixture-card>', /CMS media or a typed CMS Source image/],
            ['<fixture-card cms-source="https:\/\/example.invalid\/items"></fixture-card>', /same-site endpoint/],
            [
                `<fixture-card><form cms-source="/.cms/sources/forms/contact" cms-source-method="POST"
                    cms-source-trigger="submit"><button formaction="https://example.invalid/steal">Send</button>
                </form></fixture-card>`,
                /formaction.*forbidden/,
            ],
            [
                `<form cms-source="/.cms/sources/forms/contact" cms-source-method="POST"
                    cms-source-trigger="submit"
                    cms-source-body='{"safe":{"from":"raw","value":"yes"},"bad":{"from":"cookie"}}'></form>`,
                /typed parameter map/,
            ],
        ] as const;

        for (const [content, message] of invalid) {
            const { repo } = makeRepo();
            await expect(repo.insertPage("/invalid", "Invalid", content)).rejects.toThrow(message);
            await expect(repo.updatePage({ id: "p1", content })).rejects.toThrow(message);
        }
    });

    test("persists controlled native content and component light DOM", async () => {
        const { repo, calls } = makeRepo({ blocs: ["mossa-newsletter-card", "mossa-input", "mossa-button"] });
        const content = `
            <mossa-newsletter-card cms-source="/.cms/sources/content/newsletter as newsletterPage">
                <h2 slot="title">Stay informed</h2>
                <form slot="form"
                    cms-source="/.cms/sources/newsletter/setSubscription as newsletterSubscription"
                    cms-source-id="newsletterSubscription"
                    cms-source-trigger="submit"
                    cms-source-method="POST"
                    cms-source-success-reset="true">
                    <mossa-input name="email"></mossa-input>
                    <mossa-button><button type="submit">Subscribe</button></mossa-button>
                    <p class="status" data-state="loading"
                        cms-condition="$sources.newsletterSubscription.loading">Loading</p>
                </form>
                <img slot="illustration" src="/.cms/files/by-id/newsletter" alt="Newsletter illustration">
                <span>Default-slot label</span>
                <li slot="criteria">Component-owned list criterion</li>
            </mossa-newsletter-card>
        `;

        await repo.insertPage("/newsletter", "Newsletter", content);
        await repo.updatePage({ id: "p1", content });

        expect(calls.insertPage[0][2]).toContain('cms-source-trigger="submit"');
        expect(calls.updatePage[0].content).toContain('slot="illustration"');
    });
});

describe("ValidatingCmsRepository — pass-through", () => {
    test("reads delegate unchanged", async () => {
        const { repo } = makeRepo({ blocs: ["x"] });
        expect((await repo.getBlocsList()).map((b) => b.id)).toEqual(["x"]);
    });
});
