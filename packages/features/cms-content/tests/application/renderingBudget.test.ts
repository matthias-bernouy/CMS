import { expect, test } from "bun:test";
import { createContentReader, defaultSystem, type ContentRepository, type TPage } from "@bernouy/cms-content";

test("a Page render snapshot has a fixed repository-read budget", async () => {
    const fixture = renderingFixture();
    const inputs = await createContentReader(fixture.repository).getPageRenderInputs!("/");

    expect(inputs.route?.kind).toBe("current");
    expect(fixture.calls()).toEqual({
        getBlocsList: 1,
        getTextContributions: 1,
        getPageById: 1,
        getPageRequirements: 1,
        getPageRoute: 2,
        getSiteBlocsRevision: 1,
        getSystem: 2,
        getSystemRevision: 1,
    });
});

test("a Page revision check avoids loading render payloads", async () => {
    const fixture = renderingFixture();
    await createContentReader(fixture.repository).getPageRenderRevision!("/");

    expect(fixture.calls()).toEqual({
        getTextContributions: 1,
        getPageById: 1,
        getPageRequirements: 1,
        getPageRoute: 2,
        getSiteBlocsRevision: 1,
        getSystem: 2,
        getSystemRevision: 1,
    });
});

test("unrelated stored Pages do not increase the serialized Page render snapshot", async () => {
    const baseline = renderingFixture();
    const corpus = renderingFixture(200);

    const baselineInputs = await createContentReader(baseline.repository).getPageRenderInputs!("/");
    const corpusInputs = await createContentReader(corpus.repository).getPageRenderInputs!("/");

    expect(jsonBytes(corpusInputs)).toBe(jsonBytes(baselineInputs));
    expect(corpus.calls()).toEqual(baseline.calls());
});

test("large contribution revisions remain bounded and still invalidate Page render caches", async () => {
    const fixture = renderingFixture();
    const original = fixture.repository.getTextContributions!.bind(fixture.repository);
    let revision = "large-contribution-".repeat(1000);
    fixture.repository.getTextContributions = async () => ({ ...(await original()), revision });
    const reader = createContentReader(fixture.repository);
    const first = await reader.getPageRenderInputs!("/");
    expect(first.artifactRevision).toHaveLength(71);
    expect(first.renderingRevision).toHaveLength(71);
    expect(await reader.getPageRenderRevision!("/")).toBe(first.artifactRevision);
    expect(await reader.getRenderingRevision!()).toBe(first.renderingRevision);
    revision += "changed";
    const second = await reader.getPageRenderInputs!("/");
    expect(second.artifactRevision).not.toBe(first.artifactRevision);
    expect(second.renderingRevision).not.toBe(first.renderingRevision);
    expect(await reader.getPageRenderRevision!("/")).toBe(second.artifactRevision);
});

test("render inputs use the final checked settings and still reject a concurrent language migration", async () => {
    const fixture = renderingFixture();
    const read = fixture.repository.getSystem.bind(fixture.repository);
    let reads = 0;
    fixture.repository.getSystem = async () => {
        const system = await read();
        system.site.visible = ++reads === 1;
        return system;
    };
    const inputs = await createContentReader(fixture.repository).getPageRenderInputs!("/");
    expect(reads).toBe(2);
    expect(inputs.settings.site.visible).toBe(false);
    reads = 0;
    fixture.repository.getSystem = async () => {
        const system = await read();
        system.pageRoutesUpdating = ++reads > 1;
        return system;
    };
    expect((await createContentReader(fixture.repository).getPageRenderInputs!("/")).route).toEqual({
        kind: "updating",
    });
});

function renderingFixture(unrelatedPageCount = 0): {
    repository: ContentRepository;
    calls(): Record<string, number>;
} {
    const counts = new Map<string, number>();
    const count = (operation: string) => counts.set(operation, (counts.get(operation) ?? 0) + 1);
    const page = pageRecord("home", "/");
    const system = defaultSystem();
    system.site.language = "en";
    const unrelatedPages = Array.from({ length: unrelatedPageCount }, (_, index) =>
        pageRecord(`unrelated-${index}`, `/unrelated-${index}`),
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
        getTextContributions: async () => {
            count("getTextContributions");
            return { revision: 9, texts: [] };
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
        getPublishedPages: async () => {
            count("getPublishedPages");
            return structuredClone([page, ...unrelatedPages]);
        },
        getPageRequirements: async () => {
            count("getPageRequirements");
            return [];
        },
        getBlocsList: async (options) => {
            expect(options).toEqual({ includeHidden: true, projection: "rendering" });
            count("getBlocsList");
            return [];
        },
    } as unknown as ContentRepository;
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

function jsonBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
