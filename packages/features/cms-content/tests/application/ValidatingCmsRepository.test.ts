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
                root: { accepts: ["div" as const] },
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
                              title: { accepts: [{ kind: "native-content" as const, profile: "inline" as const }] },
                              actions: { accepts: [{ kind: "any-component" as const }] },
                              illustration: {
                                  accepts: [{ kind: "component" as const, tag: "fixture-image" }],
                              },
                              label: { accepts: [{ kind: "plain-text" as const }] },
                              criteria: { accepts: [{ kind: "native-content" as const, profile: "prose" as const }] },
                          },
                      }
                    : {}),
                ...(id === "fixture-button" ? { content: { accepts: ["button" as const] } } : {}),
                ...(id === "fixture-image" ? { content: { accepts: ["img" as const] } } : {}),
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
        await repo.insertPage("/copy", "Copy", '<div cms-bloc="fixture-card"></div>');
        expect(calls.insertPage[0][2]).toContain("fixture-card");
        await expect(
            repo.insertPage("/bad-copy", "Bad copy", '<div cms-bloc="fixture-ghost"></div>'),
        ).rejects.toThrow();
    });

    test("validates direct and transitive Bloc references with one Page grammar", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const bloc = (id: string, uses: readonly string[] = []) => ({
            id,
            name: id,
            group: "",
            description: "",
            viewJS: "cmsRuntime.registerBloc('fixture-unused', { mount() {} })",
            ownership: { kind: "code-managed" as const },
            uses,
            root: { accepts: ["div" as const] },
        });
        await repo.createBloc(bloc("fixture-card"));
        await repo.createBloc(bloc("fixture-shell", ["fixture-card"]));
        await repo.insertPage("/page", "Page", '<div cms-bloc="fixture-shell"></div>');
        expect((await repo.getPage("/page"))?.content).toBe('<div cms-bloc="fixture-shell"></div>');
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
        await repo.updatePage({ id: "p1", content: '<div cms-bloc="fixture-card"></div>' });
        expect(calls.updatePage[0].content).toContain("fixture-card");
        await expect(repo.updatePage({ id: "p1", content: '<div cms-bloc="fixture-ghost"></div>' })).rejects.toThrow();
    });

    test("publish revalidates the stored document against the active catalogue", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const bloc = {
            id: "fixture-card",
            name: "Card",
            group: "",
            description: "",
            viewJS: "cmsRuntime.registerBloc('fixture-card', { mount() {} })",
            ownership: { kind: "code-managed" as const },
            slots: {},
            root: { accepts: ["div" as const] },
        };
        await repo.createBloc(bloc);
        await repo.insertPage("/draft", "Draft", '<div cms-bloc="fixture-card"></div>');
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
            ['<ul><div cms-bloc="fixture-card">Not an item</div></ul>', /only direct <li>/],
            ["<ul>Loose text<li>Item</li></ul>", /only direct <li>/],
            ['<h1 class="forged">Title</h1>', /not allowed/],
            ['<img src="https:\/\/example.invalid\/photo.jpg" alt="Photo">', /CMS media item/],
            ['<img alt="Photo">', /CMS media item/],
            ["<form></form>", /declared CMS mutation/],
            ['<div cms-bloc="fixture-card"><form></form></div>', /declared CMS mutation/],
            [
                '<div cms-bloc=\"fixture-card\"><img src="https:\/\/example.invalid\/photo.jpg" alt="Photo"></div>',
                /CMS media item/,
            ],
            ['<div cms-bloc=\"fixture-card\"><img alt=""></div>', /alternative text/],
            [
                '<div cms-bloc=\"fixture-card\"><section cms-source="https:\/\/example.invalid\/items"></section></div>',
                /not a declared CMS binding/,
            ],
            [
                `<div cms-bloc=\"fixture-card\"><form cms-mutation="forms:contact as contact"
                    ><button formaction="https://example.invalid/steal">Send</button>
                </form></div>`,
                /formaction.*forbidden/,
            ],
            [
                `<form cms-mutation="forms:contact as contact"
                    cms-mutation-input='{"safe":{"from":"literal","value":"yes"},"bad":{"from":"cookie"}}'></form>`,
                /typed parameter map/,
            ],
            [
                `<form cms-mutation="forms:contact as contact" cms-source-inherit-query="maybe"></form>`,
                /not a declared CMS binding/,
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
            '<div cms-bloc=\"fixture-card\"><div cms-bloc=\"fixture-image\" slot="image"><img src="/.cms/call/ulvia.cms.files/files/photo/generation" alt="Product"></div></div>';
        await repo.updatePage({ id: "p1", content: image });
        expect(calls.updatePage[0].content).toContain("/.cms/call/ulvia.cms.files/files/");
        await expect(
            repo.updatePage({
                id: "p1",
                content:
                    '<div cms-bloc=\"fixture-card\"><div cms-bloc=\"fixture-image\" slot="image"><img src="/.cms/sources/catalog/image?id={{ product.image }}" alt="Product"></div></div>',
            }),
        ).rejects.toThrow("static value");
    });

    test("rejects authored runtime image attributes that could bypass the image source policy", async () => {
        const { repo } = makeRepo({ blocs: ["fixture-card"] });
        await expect(
            repo.updatePage({
                id: "p1",
                content:
                    '<div cms-bloc=\"fixture-card\"><img src="/.cms/call/ulvia.cms.files/files/photo-1/generation" data-cms-src="https://other.example/tracker.png" alt="Product"></div>',
            }),
        ).rejects.toThrow('attribute "data-cms-src" is forbidden');
    });

    test("persists controlled native content and component light DOM", async () => {
        const { repo, calls } = makeRepo({
            blocs: ["fixture-newsletter-card", "fixture-input", "fixture-button", "fixture-image"],
        });
        const content = `
            <div cms-bloc=\"fixture-newsletter-card\">
                <h2 slot="title">Stay informed</h2>
                <div cms-bloc=\"fixture-button\" slot="actions"><button type="button">Subscribe</button></div>
                <div cms-bloc=\"fixture-image\" slot="illustration"><img src="/.cms/call/ulvia.cms.files/files/newsletter/generation" alt="Newsletter illustration"></div>
                <span slot="label">Newsletter label</span>
                <p slot="criteria">Component-owned criterion</p>
            </div>
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
            root: { accepts: ["div"] },
            content: { accepts: ["span"] },
            viewJS: "cmsRuntime.registerBloc('fixture-query', { mount() {} })",
        });

        await repo.insertPage(
            "/query",
            "Query",
            `<div cms-bloc=\"fixture-query\">${queryDocument('<span cms-repeat="pages.data.items as item">{{ item }}</span>')}</div>`,
        );
        await expect(
            repo.insertPage(
                "/invalid-query",
                "Invalid query",
                `<div cms-bloc=\"fixture-query\">${queryDocument("<span>{{ pages.data.missing }}</span>")}</div>`,
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
            templateHTML: queryDocument(body),
            root: { accepts: ["div"] as const },
            viewJS: "cmsRuntime.registerBloc('fixture-query', { mount() {} })",
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
                viewJS: "cmsRuntime.registerBloc('fixture-default-query', { mount() {} })",
                root: { accepts: ["div"] },
                content: { accepts: ["span"] },
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
            root: { accepts: ["div"] as const },
        });
        await repo.createBloc(composition("fixture-child", "<slot></slot>"));
        await repo.createBloc(composition("fixture-parent", '<div cms-bloc="fixture-child"></div>'));

        await expect(
            repo.replaceBloc(composition("fixture-child", '<div cms-bloc="fixture-parent"></div>')),
        ).rejects.toThrow("fixture-child -> fixture-parent -> fixture-child");

        const component = (id: string, uses: readonly string[]) => ({
            id,
            name: id,
            group: "",
            description: "",
            viewJS: "export {}",
            ownership: { kind: "code-managed" as const },
            uses,
            root: { accepts: ["div"] as const },
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
            viewJS: "cmsRuntime.registerBloc('fixture-child', { mount() {} })",
            ownership: { kind: "code-managed" },
            slots: {},
            root: { accepts: ["div"] },
        });
        await expect(
            repo.createBloc({
                id: "fixture-shell",
                name: "Shell",
                group: "",
                description: "",
                viewJS: "cmsRuntime.registerBloc('fixture-shell', { mount() {} })",
                ownership: { kind: "code-managed" },
                slots: { body: { accepts: [{ kind: "component", tag: "fixture-child" }] } },
                uses: ["fixture-child"],
                root: { accepts: ["div"] },
                defaultContent: '<div cms-bloc=\"fixture-child\" slot="ghost"></div>',
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
