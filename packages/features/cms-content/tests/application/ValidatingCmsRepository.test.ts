import { describe, test, expect } from "bun:test";
import { ValidatingCmsRepository, ContentValidationError, InMemoryCmsRepository } from "@bernouy/cms-content";
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
        getBlocsList: async () =>
            (opts.blocs ?? []).map((id) => ({
                id,
                name: id,
                group: "",
                description: "",
                ...(id === "fixture-card"
                    ? { collectionSlots: { image: { accepts: [{ kind: "media" as const }] } } }
                    : {}),
                ...(id === "fixture-newsletter-card"
                    ? {
                          collectionSlots: {
                              title: { accepts: [{ kind: "rich-text" as const, profile: "inline" as const }] },
                              actions: { accepts: [{ kind: "any-component" as const }] },
                              illustration: { accepts: [{ kind: "media" as const }] },
                              label: { accepts: [{ kind: "plain-text" as const }] },
                              criteria: { accepts: [{ kind: "rich-text" as const, profile: "prose" as const }] },
                          },
                      }
                    : {}),
                ...(id === "fixture-button" ? { nativeElement: { accepts: ["button" as const] } } : {}),
            })),
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

    test("enforces direct and transitive Bloc surfaces and keeps Page surfaces immutable", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const bloc = (id: string, surfaces: readonly ("control" | "delivery")[], uses: readonly string[] = []) => ({
            id,
            name: id,
            group: "",
            description: "",
            viewJS: "customElements.define('fixture-unused', class extends HTMLElement {})",
            ownership: { kind: "code-managed" as const },
            surfaces,
            uses,
        });
        await repo.createBloc(bloc("fixture-control-card", ["control"]));
        await repo.createBloc(bloc("fixture-shell", ["control", "delivery"], ["fixture-control-card"]));

        await expect(
            repo.insertPage("/public", "Public", "<fixture-control-card></fixture-control-card>"),
        ).rejects.toThrow("does not support the delivery surface");
        await expect(repo.insertPage("/public", "Public", "<fixture-shell></fixture-shell>")).rejects.toThrow(
            "does not support the delivery surface",
        );
        await repo.insertPage("/admin", "Admin", "<fixture-shell></fixture-shell>", { surface: "control" });
        const controlPage = (await repo.getPage("/admin"))!;

        await expect(repo.updatePage({ id: controlPage.id, surface: "delivery" })).rejects.toThrow(
            "cannot change after Page creation",
        );
    });

    test("updatePage trims the title and forwards it", async () => {
        const { repo, calls } = makeRepo();
        await repo.updatePage({ id: "p1", title: "  Spaced  " });
        expect(calls.updatePage[0].title).toBe("Spaced");
    });

    test("updatePage keeps language paths under the dedicated route writer", async () => {
        const { repo, calls } = makeRepo();
        await repo.updatePage({ id: "p1", title: "New title", paths: { fr: "/unreserved" } });
        expect(calls.updatePage[0]).toEqual({ id: "p1", title: "New title" });
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

    test("publish revalidates the stored document against the active catalogue", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const bloc = {
            id: "fixture-card",
            name: "Card",
            group: "",
            description: "",
            viewJS: "customElements.define('fixture-card', class extends HTMLElement {})",
            ownership: { kind: "code-managed" as const },
            collectionSlots: {},
        };
        await repo.createBloc(bloc);
        await repo.insertPage("/draft", "Draft", "<fixture-card></fixture-card>");
        const page = (await repo.getPage("/draft"))!;
        await repo.replaceBloc({ ...bloc, catalogue: "inactive" });

        await expect(repo.updatePage({ id: page.id, visible: true }, page.revision)).rejects.toThrow(
            "unknown or inactive",
        );
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
                /CMS media or a gateway provider image/,
            ],
            ['<fixture-card><img alt=""></fixture-card>', /CMS media or a gateway provider image/],
            ['<fixture-card cms-source="https:\/\/example.invalid\/items"></fixture-card>', /same-site endpoint/],
            [
                `<fixture-card><form cms-source="/.cms/call/forms/contact" cms-source-method="POST"
                    cms-source-trigger="submit"><button formaction="https://example.invalid/steal">Send</button>
                </form></fixture-card>`,
                /formaction.*forbidden/,
            ],
            [
                `<form cms-source="/.cms/call/forms/contact" cms-source-method="POST"
                    cms-source-trigger="submit"
                    cms-source-body='{"safe":{"from":"raw","value":"yes"},"bad":{"from":"cookie"}}'></form>`,
                /typed parameter map/,
            ],
            [
                `<form cms-source="/.cms/call/forms/contact" cms-source-method="POST" cms-source-trigger="submit" cms-source-inherit-query="maybe"></form>`,
                /query inheritance must be true or false/,
            ],
        ] as const;

        for (const [content, message] of invalid) {
            const { repo } = makeRepo();
            await expect(repo.insertPage("/invalid", "Invalid", content)).rejects.toThrow(message);
            await expect(repo.updatePage({ id: "p1", content })).rejects.toThrow(message);
        }
    });

    test("accepts immutable cms-files URLs and rejects the removed Source image route", async () => {
        const { repo, calls } = makeRepo({ blocs: ["fixture-card"] });
        const image =
            '<fixture-card><img slot="image" src="/.cms/call/ulvia.cms.files/files/photo/generation" alt="Product"></fixture-card>';
        await repo.updatePage({ id: "p1", content: image });
        expect(calls.updatePage[0].content).toContain("/.cms/call/ulvia.cms.files/files/");
        await expect(
            repo.updatePage({
                id: "p1",
                content:
                    '<fixture-card><img slot="image" src="/.cms/sources/catalog/image?id={{ product.image }}" alt="Product"></fixture-card>',
            }),
        ).rejects.toThrow("gateway provider image");
    });

    test("rejects authored runtime image attributes that could bypass the image source policy", async () => {
        const { repo } = makeRepo({ blocs: ["fixture-card"] });
        await expect(
            repo.updatePage({
                id: "p1",
                content:
                    '<fixture-card><img src="/.cms/call/ulvia.cms.files/files/photo-1/generation" data-cms-src="https://other.example/tracker.png" alt="Product"></fixture-card>',
            }),
        ).rejects.toThrow('attribute "data-cms-src" is forbidden');
    });

    test("persists controlled native content and component light DOM", async () => {
        const { repo, calls } = makeRepo({ blocs: ["fixture-newsletter-card", "fixture-input", "fixture-button"] });
        const content = `
            <fixture-newsletter-card>
                <h2 slot="title">Stay informed</h2>
                <fixture-button slot="actions"><button type="button">Subscribe</button></fixture-button>
                <img slot="illustration" src="/.cms/call/ulvia.cms.files/files/newsletter/generation" alt="Newsletter illustration">
                <span slot="label">Newsletter label</span>
                <p slot="criteria">Component-owned criterion</p>
            </fixture-newsletter-card>
        `;

        await repo.insertPage("/newsletter", "Newsletter", content);
        await repo.updatePage({ id: "p1", content });

        expect(calls.insertPage[0][2]).toContain('slot="actions"');
        expect(calls.updatePage[0].content).toContain('slot="illustration"');
    });
});

describe("ValidatingCmsRepository — pass-through", () => {
    test("reads delegate unchanged", async () => {
        const { repo } = makeRepo({ blocs: ["x"] });
        expect((await repo.getBlocsList()).map((b) => b.id)).toEqual(["x"]);
    });
});
