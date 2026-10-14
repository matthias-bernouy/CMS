import { describe, test, expect } from "bun:test";
import { ValidatingCmsRepository, ContentValidationError, InMemoryCmsRepository } from "@bernouy/cms-content";
import type { CmsRepository } from "@bernouy/cms-content";
import type { BindingQueryCapability } from "@bernouy/cms-content/page-document";

const queryCapability: BindingQueryCapability = {
    contractId: "catalog",
    capabilityId: "list",
    output: {
        type: "object",
        required: ["items"],
        properties: { items: { type: "array", items: { type: "string" } } },
    },
    errors: [],
};

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
                    ? {
                          slots: {
                              image: { accepts: [{ kind: "component" as const, tag: "fixture-image" }] },
                          },
                      }
                    : {}),
                ...(id === "fixture-newsletter-card"
                    ? {
                          slots: {
                              title: { accepts: [{ kind: "rich-text" as const, profile: "inline" as const }] },
                              actions: { accepts: [{ kind: "any-component" as const }] },
                              illustration: {
                                  accepts: [{ kind: "component" as const, tag: "fixture-image" }],
                              },
                              label: { accepts: [{ kind: "plain-text" as const }] },
                              criteria: { accepts: [{ kind: "rich-text" as const, profile: "prose" as const }] },
                          },
                      }
                    : {}),
                ...(id === "fixture-button" ? { nativeElement: { accepts: ["button" as const] } } : {}),
                ...(id === "fixture-image" ? { nativeElement: { accepts: ["img" as const] } } : {}),
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

    test("validates direct and transitive Bloc references with one Page grammar", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const bloc = (id: string, uses: readonly string[] = []) => ({
            id,
            name: id,
            group: "",
            description: "",
            viewJS: "customElements.define('fixture-unused', class extends HTMLElement {})",
            ownership: { kind: "code-managed" as const },
            uses,
        });
        await repo.createBloc(bloc("fixture-card"));
        await repo.createBloc(bloc("fixture-shell", ["fixture-card"]));
        await repo.insertPage("/page", "Page", "<fixture-shell></fixture-shell>");
        expect((await repo.getPage("/page"))?.content).toBe("<fixture-shell></fixture-shell>");
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
            slots: {},
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
                /CMS media item/,
            ],
            ['<fixture-card><img alt=""></fixture-card>', /alternative text/],
            [
                '<fixture-card><section cms-source="https:\/\/example.invalid\/items"></section></fixture-card>',
                /use cms-query for reads/,
            ],
            [
                `<fixture-card><form cms-source="/.cms/call/forms/contact" cms-source-method="POST"
                    cms-source-trigger="submit"><button formaction="https://example.invalid/steal">Send</button>
                </form></fixture-card>`,
                /formaction.*forbidden/,
            ],
            [
                `<form cms-source="/.cms/call/forms/contact" cms-source-method="POST"
                    cms-source-trigger="submit"
                    cms-source-body='{"safe":{"from":"literal","value":"yes"},"bad":{"from":"cookie"}}'></form>`,
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
        const { repo, calls } = makeRepo({ blocs: ["fixture-card", "fixture-image"] });
        const image =
            '<fixture-card><fixture-image slot="image"><img src="/.cms/call/ulvia.cms.files/files/photo/generation" alt="Product"></fixture-image></fixture-card>';
        await repo.updatePage({ id: "p1", content: image });
        expect(calls.updatePage[0].content).toContain("/.cms/call/ulvia.cms.files/files/");
        await expect(
            repo.updatePage({
                id: "p1",
                content:
                    '<fixture-card><fixture-image slot="image"><img src="/.cms/sources/catalog/image?id={{ product.image }}" alt="Product"></fixture-image></fixture-card>',
            }),
        ).rejects.toThrow("static value");
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
        const { repo, calls } = makeRepo({
            blocs: ["fixture-newsletter-card", "fixture-input", "fixture-button", "fixture-image"],
        });
        const content = `
            <fixture-newsletter-card>
                <h2 slot="title">Stay informed</h2>
                <fixture-button slot="actions"><button type="button">Subscribe</button></fixture-button>
                <fixture-image slot="illustration"><img src="/.cms/call/ulvia.cms.files/files/newsletter/generation" alt="Newsletter illustration"></fixture-image>
                <span slot="label">Newsletter label</span>
                <p slot="criteria">Component-owned criterion</p>
            </fixture-newsletter-card>
        `;

        await repo.insertPage("/newsletter", "Newsletter", content);
        await repo.updatePage({ id: "p1", content });

        expect(calls.insertPage[0][2]).toContain('slot="actions"');
        expect(calls.updatePage[0].content).toContain('slot="illustration"');
    });

    test("validates Page query bindings against resolved contract schemas", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository(), {
            requireQueryCapabilityResolution: true,
            resolveQueryCapabilities: async () => [queryCapability],
        });
        await repo.createBloc({
            id: "fixture-query",
            name: "Query",
            group: "",
            description: "",
            ownership: { kind: "code-managed" },
            nativeElement: { accepts: ["span"] },
            viewJS: "customElements.define('fixture-query', class extends HTMLElement {})",
        });

        await repo.insertPage(
            "/query",
            "Query",
            `<fixture-query>${queryDocument('<span cms-repeat="pages.data.items as item">{{ item }}</span>')}</fixture-query>`,
        );
        await expect(
            repo.insertPage(
                "/invalid-query",
                "Invalid query",
                `<fixture-query>${queryDocument("<span>{{ pages.data.missing }}</span>")}</fixture-query>`,
            ),
        ).rejects.toThrow("is not declared by the output schema");
    });
});

describe("ValidatingCmsRepository — pass-through", () => {
    test("reads delegate unchanged", async () => {
        const { repo } = makeRepo({ blocs: ["x"] });
        expect((await repo.getBlocsList()).map((b) => b.id)).toEqual(["x"]);
    });
});

describe("ValidatingCmsRepository — blocs", () => {
    test("validates local query bindings against resolved contract schemas", async () => {
        const targets: string[] = [];
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository(), {
            requireQueryCapabilityResolution: true,
            resolveQueryCapabilities: async (requested) => {
                targets.push(...requested.map(({ contractId, capabilityId }) => `${contractId}:${capabilityId}`));
                return [queryCapability];
            },
        });
        const bloc = (body: string) => ({
            id: "fixture-query",
            name: "Query",
            group: "",
            description: "",
            ownership: { kind: "code-managed" as const },
            componentHTML: queryDocument(body),
            viewJS: "customElements.define('fixture-query', class extends HTMLElement {})",
        });

        await repo.createBloc(bloc('<p cms-repeat="pages.data.items as item">{{ item }}</p>'));
        expect(targets).toEqual(["catalog:list"]);
        await expect(repo.replaceBloc(bloc("<p>{{ pages.data.missing }}</p>"))).rejects.toThrow(
            "is not declared by the output schema",
        );
    });

    test("collects queries from default Bloc content for strict resolution", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository(), {
            requireQueryCapabilityResolution: true,
            resolveQueryCapabilities: async () => [],
        });
        await expect(
            repo.createBloc({
                id: "fixture-default-query",
                name: "Default query",
                group: "",
                description: "",
                ownership: { kind: "code-managed" },
                viewJS: "customElements.define('fixture-default-query', class extends HTMLElement {})",
                nativeElement: { accepts: ["span"] },
                defaultContent: '<span cms-query="catalog:list as pages"></span>',
            }),
        ).rejects.toThrow("cannot be resolved to an exact contract schema");
    });

    test("rejects cycles across persisted Bloc dependencies", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const composition = (id: string, compositionHTML: string) => ({
            id,
            name: id,
            group: "",
            description: "",
            viewJS: "",
            ownership: { kind: "code-managed" as const },
            compositionHTML,
        });
        await repo.createBloc(composition("fixture-child", "<slot></slot>"));
        await repo.createBloc(composition("fixture-parent", "<fixture-child></fixture-child>"));

        await expect(
            repo.replaceBloc(composition("fixture-child", "<fixture-parent></fixture-parent>")),
        ).rejects.toThrow("fixture-child -> fixture-parent -> fixture-child");

        const component = (id: string, uses: readonly string[]) => ({
            id,
            name: id,
            group: "",
            description: "",
            viewJS: "export {}",
            ownership: { kind: "code-managed" as const },
            uses,
        });
        await repo.createBloc(component("fixture-declared-a", ["fixture-declared-b"]));
        await expect(repo.createBloc(component("fixture-declared-b", ["fixture-declared-a"]))).rejects.toThrow(
            "fixture-declared-a -> fixture-declared-b -> fixture-declared-a",
        );
    });

    test("validates published Bloc documents against the same catalogue contracts as Pages", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        await repo.createBloc({
            id: "fixture-child",
            name: "Child",
            group: "",
            description: "",
            viewJS: "customElements.define('fixture-child', class extends HTMLElement {})",
            ownership: { kind: "code-managed" },
            slots: {},
        });
        await expect(
            repo.createBloc({
                id: "fixture-shell",
                name: "Shell",
                group: "",
                description: "",
                viewJS: "customElements.define('fixture-shell', class extends HTMLElement {})",
                ownership: { kind: "code-managed" },
                slots: { body: { accepts: [{ kind: "component", tag: "fixture-child" }] } },
                uses: ["fixture-child"],
                defaultContent: '<fixture-child slot="ghost"></fixture-child>',
            }),
        ).rejects.toThrow("does not declare slot");
    });
});

function queryDocument(success: string): string {
    return `<span cms-query="catalog:list as pages">
        <span cms-match="pages.outcome.kind">
            <span cms-case='"none"'></span>
            <span cms-case='"success"'>${success}</span>
            <span cms-case='"failure"'>Offline</span>
        </span>
    </span>`;
}
