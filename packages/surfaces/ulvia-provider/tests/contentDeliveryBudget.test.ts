import { expect, test } from "bun:test";
import { defaultSystem, type ContentRepository, type RenderablePage, type TPage } from "@bernouy/cms-content";
import {
    DefaultProviderCapabilityDispatcher,
    ProviderCapabilityDispatchError,
    type CmsContentDependencies,
} from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";

test("Page render delivery keeps one fixed repository-read budget", async () => {
    const fixture = deliveryFixture({ blocCount: 64 });
    const output = await read(fixture.dependencies, "content.page-render-inputs", { path: "/" });

    expect(output.chunks).toHaveLength(1);
    expect(jsonBytes(output)).toBeLessThan(128 * 1024);
    expect(fixture.calls()).toEqual({
        getBlocsList: 1,
        getBlocViewsJS: 1,
        getContentContributions: 1,
        getPageById: 1,
        getPageRequirements: 1,
        getPageRoute: 2,
        getSiteBlocsRevision: 1,
        getSystem: 3,
        getSystemRevision: 1,
    });
});

test("one Page render delivery includes behavior and collection-asset dependencies", async () => {
    const fixture = deliveryFixture({ hasBehavior: true, assetExpression: true });
    const output = await read(fixture.dependencies, "content.page-render-inputs", { path: "/" });
    const payload = JSON.parse(output.chunks.join(""));

    expect(payload.blocViews).toEqual({ "site-bloc-0": "export const tag = 'site-bloc-0';" });
    expect(payload.collectionAssets).toEqual([
        {
            collectionId: "ulvia-official",
            digest: "sha256:asset-release",
            asset: { id: "media/portrait.webp", mediaType: "image/webp", byteLength: 512 },
        },
    ]);
    expect(fixture.calls()).toMatchObject({
        getBlocViewsJS: 1,
        getInstalledAssetMetadataBatch: 1,
    });
});

test("unrelated Pages add neither delivery bytes nor repository requests", async () => {
    const baseline = deliveryFixture();
    const corpus = deliveryFixture({ unrelatedPageCount: 200 });

    const baselineOutput = await read(baseline.dependencies, "content.page-render-inputs", { path: "/" });
    const corpusOutput = await read(corpus.dependencies, "content.page-render-inputs", { path: "/" });

    expect(jsonBytes(corpusOutput)).toBe(jsonBytes(baselineOutput));
    expect(corpus.calls()).toEqual(baseline.calls());
});

test("one batched Bloc-view request reads each distinct Bloc once", async () => {
    const fixture = deliveryFixture({ hasBehavior: true });
    const output = await read(fixture.dependencies, "content.bloc-views", {
        tags: ["site-card", "site-action", "site-card", "site-action"],
    });

    expect(JSON.parse(output.chunks.join(""))).toEqual({
        "site-card": "export const tag = 'site-card';",
        "site-action": "export const tag = 'site-action';",
    });
    expect(fixture.calls()).toEqual({ getBlocViewsJS: 1 });
});

test("delivery refuses a render payload above the protocol byte budget", async () => {
    const fixture = deliveryFixture({ markupBytes: 8 * 1024 * 1024 });

    try {
        await read(fixture.dependencies, "content.page-render-inputs", { path: "/" });
        throw new Error("Expected the oversized response to be rejected");
    } catch (error) {
        expect(error).toBeInstanceOf(ProviderCapabilityDispatchError);
        expect((error as ProviderCapabilityDispatchError).code).toBe("RESPONSE_TOO_LARGE");
        expect((error as ProviderCapabilityDispatchError).status).toBe(413);
    }
});

async function read(
    dependencies: CmsContentDependencies,
    operation: string,
    input: Readonly<Record<string, unknown>>,
): Promise<{ readonly chunks: readonly string[] }> {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, dependencies);
    return (await dispatcher.invoke(
        "ulvia.cms.content",
        "delivery.read",
        { operation, inputJson: JSON.stringify(input) },
        {
            requestId: "00000000-0000-4000-8000-000000000001",
            contractVersion: "1.1.0",
            siteId: "site-a",
            providerId: "ulvia.official",
        },
    )) as { readonly chunks: readonly string[] };
}

function deliveryFixture(
    options: {
        unrelatedPageCount?: number;
        blocCount?: number;
        markupBytes?: number;
        hasBehavior?: boolean;
        assetExpression?: boolean;
    } = {},
): {
    dependencies: CmsContentDependencies;
    calls(): Record<string, number>;
} {
    const counts = new Map<string, number>();
    const count = (operation: string) => counts.set(operation, (counts.get(operation) ?? 0) + 1);
    const page = pageRecord("home", "/");
    const system = defaultSystem();
    system.site.language = "en";
    const unrelatedPages = Array.from({ length: options.unrelatedPageCount ?? 0 }, (_, index) =>
        renderablePage(pageRecord(`unrelated-${index}`, `/unrelated-${index}`)),
    );
    const markup = options.assetExpression
        ? "{{ cms.asset.ulvia-official.media/portrait.webp }}"
        : "x".repeat(options.markupBytes ?? 256);
    const blocs = Array.from({ length: options.blocCount ?? 1 }, (_, index) => ({
        id: `site-bloc-${index}`,
        kind: "component" as const,
        markupHTML: `<article>${markup}</article>`,
        root: { accepts: ["article"] },
        hasBehavior: options.hasBehavior ?? false,
    }));
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
            return blocs;
        },
        getBlocViewJS: async (tag: string) => {
            count("getBlocViewJS");
            return `export const tag = '${tag}';`;
        },
        getBlocViewsJS: async (tags: readonly string[]) => {
            count("getBlocViewsJS");
            return Object.fromEntries(
                tags.map((tag) => [tag, options.hasBehavior ? `export const tag = '${tag}';` : null]),
            );
        },
    } as unknown as ContentRepository;
    return {
        dependencies: {
            repo: repository,
            collections: {
                getInstalledAssetMetadataBatch: async () => {
                    count("getInstalledAssetMetadataBatch");
                    return [
                        {
                            collectionId: "ulvia-official",
                            digest: "sha256:asset-release",
                            asset: { id: "media/portrait.webp", mediaType: "image/webp", byteLength: 512 },
                        },
                    ];
                },
            } as never,
        },
        calls: () => Object.fromEntries([...counts].sort()),
    };
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
