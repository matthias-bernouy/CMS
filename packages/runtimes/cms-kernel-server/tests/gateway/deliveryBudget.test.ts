import { defaultSystem } from "@bernouy/cms-content";
import { projectRenderingSettings } from "@bernouy/cms-content/rendering";
import { expect, test } from "bun:test";
import type { GatewayInvocation, GatewayResult } from "@bernouy/cms-gateway";
import { createMemoryLogger } from "@bernouy/logging/testing";
import { GatewayContentClient } from "../../src/runtime/content/GatewayContentClient";

test("concurrent cold Page reads share one render-input request", async () => {
    const invocations: GatewayInvocation[] = [];
    const client = contentClient(invocations);

    const snapshots = await Promise.all(
        Array.from({ length: 32 }, () => client.content.getPageRenderInputs!("/about")),
    );

    expect(snapshots.every(({ artifactRevision }) => artifactRevision === "revision-1")).toBeTrue();
    expect(operationCount(invocations)).toEqual({ "content.page-render-inputs": 1 });
});

test("one thousand warm Page reads perform no additional Provider work", async () => {
    const invocations: GatewayInvocation[] = [];
    const client = contentClient(invocations);

    await client.content.getPageRenderInputs!("/about");
    await Promise.all(Array.from({ length: 1_000 }, () => client.content.getPageRenderInputs!("/about")));

    expect(operationCount(invocations)).toEqual({ "content.page-render-inputs": 1 });
});

test("Page render-input coalescing is isolated per path", async () => {
    const invocations: GatewayInvocation[] = [];
    const client = contentClient(invocations);

    await Promise.all([
        ...Array.from({ length: 12 }, () => client.content.getPageRenderInputs!("/about")),
        ...Array.from({ length: 12 }, () => client.content.getPageRenderInputs!("/contact")),
    ]);

    expect(operationCount(invocations)).toEqual({
        "content.page-render-inputs": 2,
    });
    expect(
        invocations.filter((invocation) => operation(invocation) === "content.page-render-inputs").map(deliveryInput),
    ).toEqual([{ path: "/about" }, { path: "/contact" }]);
});

test("an expired Page cache coalesces its revision check", async () => {
    const invocations: GatewayInvocation[] = [];
    let now = 0;
    const client = contentClient(invocations, { freshForMs: 100, now: () => now });

    await client.content.getPageRenderInputs!("/about");
    now = 100;
    await Promise.all(Array.from({ length: 100 }, () => client.content.getPageRenderInputs!("/about")));

    expect(operationCount(invocations)).toEqual({
        "content.page-render-inputs": 1,
        "content.page-render-revision": 1,
    });
});

test("a soft-expired Page responds before its remote revision check completes", async () => {
    const invocations: GatewayInvocation[] = [];
    let now = 0;
    let releaseRevision!: (value: GatewayResult) => void;
    const revision = new Promise<GatewayResult>((resolve) => {
        releaseRevision = resolve;
    });
    const client = contentClient(invocations, { freshForMs: 100, staleForMs: 1_000, now: () => now }, revision);

    await client.content.getPageRenderInputs!("/about");
    now = 100;
    const stale = await client.content.getPageRenderInputs!("/about");

    expect(stale.artifactRevision).toBe("revision-1");
    expect(operationCount(invocations)).toEqual({
        "content.page-render-inputs": 1,
        "content.page-render-revision": 1,
    });
    releaseRevision(success("revision-1"));
});

test("explicit invalidation reloads Page inputs without a redundant revision request", async () => {
    const invocations: GatewayInvocation[] = [];
    const client = contentClient(invocations);

    await client.content.getPageRenderInputs!("/about");
    client.invalidatePageRenderInputs();
    await client.content.getPageRenderInputs!("/about");

    expect(operationCount(invocations)).toEqual({ "content.page-render-inputs": 2 });
});

test("one render batches repeated Bloc views into one bounded capability request", async () => {
    const invocations: GatewayInvocation[] = [];
    const client = contentClient(invocations);
    const requested = Array.from({ length: 128 }, (_, index) => `site-bloc-${index}`);

    const views = await Promise.all([...requested, ...requested].map((tag) => client.content.getBlocViewJS(tag)));

    expect(views).toHaveLength(256);
    expect(operationCount(invocations)).toEqual({ "content.bloc-views": 1 });
    const invocation = invocations[0]!;
    expect(deliveryInput(invocation)).toEqual({ tags: requested });
    expect(jsonBytes(invocation.input)).toBeLessThan(4 * 1024);
});

test("one Page snapshot primes Bloc views and collection metadata without more Provider calls", async () => {
    const invocations: GatewayInvocation[] = [];
    const gateway = {
        invoke: async (invocation: GatewayInvocation): Promise<GatewayResult> => {
            invocations.push(invocation);
            return success({
                route: null,
                artifactRevision: "revision-1",
                renderingRevision: "rendering-1",
                settings: projectRenderingSettings(defaultSystem()),
                renderableBlocs: [],
                blocViews: { "site-card": "export function mount() {}" },
                collectionAssets: [
                    {
                        collectionId: "ulvia-official",
                        digest: `sha256:${"b".repeat(64)}`,
                        asset: {
                            id: "media/card.webp",
                            mediaType: "image/webp",
                            byteLength: 512,
                            digest: `sha256:${"c".repeat(64)}`,
                        },
                    },
                ],
                texts: { defaultLocale: "en", sources: [] },
            });
        },
    };
    const client = new GatewayContentClient(gateway as never, createMemoryLogger().logger);

    await client.content.getPageRenderInputs!("/about");
    expect(await client.content.getBlocViewJS("site-card")).toBe("export function mount() {}");
    expect(
        await client.collectionAssets.store.getInstalledAssetMetadataBatch("default", [
            { collectionId: "ulvia-official", assetId: "media/card.webp" },
        ]),
    ).toHaveLength(1);
    expect(operationCount(invocations)).toEqual({ "content.page-render-inputs": 1 });
});

function contentClient(
    invocations: GatewayInvocation[],
    pageRenderInputs?: { readonly freshForMs: number; readonly staleForMs?: number; readonly now: () => number },
    revisionResult?: Promise<GatewayResult>,
): GatewayContentClient {
    const gateway = {
        invoke: async (invocation: GatewayInvocation): Promise<GatewayResult> => {
            invocations.push(invocation);
            const name = operation(invocation);
            if (name === "content.page-render-revision") {
                return revisionResult ?? success("revision-1");
            }
            if (name === "content.page-render-inputs") {
                return success({
                    route: null,
                    artifactRevision: "revision-1",
                    renderingRevision: "rendering-1",
                    settings: projectRenderingSettings(defaultSystem()),
                    renderableBlocs: [],
                    blocViews: {},
                    collectionAssets: [],
                    texts: { defaultLocale: "en", sources: [] },
                });
            }
            if (name === "content.bloc-views") {
                const tags = (deliveryInput(invocation).tags ?? []) as string[];
                return success(Object.fromEntries(tags.map((tag) => [tag, `export const tag = '${tag}';`])));
            }
            throw new Error(`Unexpected delivery operation: ${name}`);
        },
    };
    return new GatewayContentClient(gateway as never, createMemoryLogger().logger, { pageRenderInputs });
}

function operation(invocation: GatewayInvocation): string {
    return String((invocation.input as Record<string, unknown>).operation);
}

function operationCount(invocations: readonly GatewayInvocation[]): Record<string, number> {
    const counts = new Map<string, number>();
    for (const invocation of invocations) {
        const name = operation(invocation);
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Object.fromEntries([...counts].sort());
}

function deliveryInput(invocation: GatewayInvocation): Record<string, unknown> {
    const input = invocation.input as Record<string, unknown>;
    return input.inputJson ? (JSON.parse(String(input.inputJson)) as Record<string, unknown>) : {};
}

function success(value: unknown): GatewayResult {
    return {
        kind: "success",
        requestId: crypto.randomUUID(),
        status: 200,
        output: { chunks: [JSON.stringify(value)] },
    };
}

function jsonBytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
