import { expect, test } from "bun:test";
import {
    createContentReader,
    defaultSystem,
    type CmsRepository,
    type RenderablePage,
    type TPage,
} from "@bernouy/cms-content";

test("a Page render snapshot has a fixed repository-read budget", async () => {
    const fixture = renderingFixture();
    const inputs = await createContentReader(fixture.repository).getPageRenderInputs!("/");

    expect(inputs.route?.kind).toBe("current");
    expect(fixture.calls()).toEqual({
        getBlocsList: 1,
        getContentContributions: 2,
        getPageById: 1,
        getPageRequirements: 1,
        getPageRoute: 2,
        getSiteBlocsRevision: 1,
        getSystem: 3,
        getSystemRevision: 1,
    });
});

test("a Page revision check avoids loading render payloads", async () => {
    const fixture = renderingFixture();
    await createContentReader(fixture.repository).getPageRenderRevision!("/");

    expect(fixture.calls()).toEqual({
        getContentContributions: 1,
        getPageById: 1,
        getPageRequirements: 1,
        getPageRoute: 2,
        getSiteBlocsRevision: 1,
        getSystem: 2,
        getSystemRevision: 1,
    });
});

test("unrelated contributed Pages do not increase the serialized Page render snapshot", async () => {
    const baseline = renderingFixture();
    const corpus = renderingFixture(200);

    const baselineInputs = await createContentReader(baseline.repository).getPageRenderInputs!("/");
    const corpusInputs = await createContentReader(corpus.repository).getPageRenderInputs!("/");

    expect(jsonBytes(corpusInputs)).toBe(jsonBytes(baselineInputs));
    expect(corpus.calls()).toEqual(baseline.calls());
});

function renderingFixture(unrelatedPageCount = 0): {
    repository: CmsRepository;
    calls(): Record<string, number>;
} {
    const counts = new Map<string, number>();
    const count = (operation: string) => counts.set(operation, (counts.get(operation) ?? 0) + 1);
    const page = pageRecord("home", "/");
    const system = defaultSystem();
    system.site.language = "en";
    const unrelatedPages = Array.from({ length: unrelatedPageCount }, (_, index) =>
        renderablePage(pageRecord(`unrelated-${index}`, `/unrelated-${index}`)),
    );
    const repository = {
        getSystem: async () => {
            count("getSystem");
            return structuredClone(system);
        },
        getSystemRevision: async () => {
            count("getSystemRevision");
            return 4;
        },
        getContentContributions: async () => {
            count("getContentContributions");
            return { revision: 9, pages: unrelatedPages, texts: [] };
        },
        getSiteBlocsRevision: async () => {
            count("getSiteBlocsRevision");
            return "[]";
        },
        getPageRoute: async (path: string) => {
            count("getPageRoute");
            return path === "/"
                ? { path, state: "current" as const, pageId: page.id, ownerPageId: page.id, language: "en" }
                : null;
        },
        getPageById: async (id: string) => {
            count("getPageById");
            return id === page.id ? structuredClone(page) : null;
        },
        getPageRequirements: async () => {
            count("getPageRequirements");
            return [];
        },
        getBlocsList: async () => {
            count("getBlocsList");
            return [];
        },
    } as unknown as CmsRepository;
    return { repository, calls: () => Object.fromEntries([...counts].sort()) };
}

function pageRecord(id: string, path: string): TPage {
    return {
        id,
        revision: 1,
        path,
        title: id,
        description: "",
        content: "<main></main>",
        visible: true,
        tags: [],
    };
}

function renderablePage(page: TPage): RenderablePage {
    return {
        reference: { kind: "site", pageId: page.id },
        page,
        source: { kind: "site", pageId: page.id, revision: page.revision },
        requirements: [],
    };
}

function jsonBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
