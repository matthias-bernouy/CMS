import { expect, test } from "bun:test";
import { admitCollectionRelease } from "cms-repository/collections/core/admission/admitCollectionRelease";
import { RepositoryDiscovery } from "cms-repository/repository/search/client/discovery";
import { RepositoryInspection } from "../../src/repository/search/client/inspection";
import type { RepositoryDiscoverySource } from "../../src/repository/search/interfaces";

async function fixture() {
    let reads = 0;
    let fail = false;
    let release: (() => void) | undefined;
    const artifacts = await Promise.all(
        Array.from({ length: 9 }, (_, index) =>
            admitCollectionRelease({
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                publisherId: "example.official",
                collectionId: "example.official/sample",
                version: `1.0.${index}`,
                name: "name",
                locale: "en",
                translations: { en: { name: "Sample 😀" } },
                blocs: [],
                assets: [],
            }),
        ),
    );
    const source: RepositoryDiscoverySource = {
        id: "configured",
        search: async () => ({ revision: "one", mode: "lexical", degraded: true, results: [] }),
        read: async (reference) => {
            reads++;
            if (release) {
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
            }
            if (fail) {
                throw new Error("offline");
            }
            return new TextEncoder().encode(
                artifacts.find((artifact) => artifact.release.version === reference.version)!.canonicalJson,
            );
        },
    };
    return {
        source,
        reads: () => reads,
        fail: (value: boolean) => {
            fail = value;
        },
        wait: () => {
            release = () => undefined;
        },
        resume: () => {
            const done = release;
            release = undefined;
            done?.();
        },
        input: (index = 0) => ({
            repositoryId: source.id,
            reference: {
                kind: "collection",
                publisherId: "example.official",
                id: "example.official/sample",
                version: `1.0.${index}`,
                digest: artifacts[index]!.digest,
            },
        }),
    };
}

test("inspection caches verified continuations, coalesces loads and retries failures", async () => {
    const f = await fixture();
    const service = new RepositoryDiscovery([f.source]);
    f.fail(true);
    await expect(service.get(f.input())).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    f.fail(false);
    const parts = await Promise.all(Array.from({ length: 8 }, () => service.get({ ...f.input(), limit: 20 })));
    expect(f.reads()).toBe(2);
    expect(parts.every((part) => part.nextOffset === 20)).toBe(true);
    await service.get({ ...f.input(), offset: 20 });
    expect(f.reads()).toBe(2);
    f.wait();
    const pending = service.get(f.input(1));
    const joined = Array.from({ length: 7 }, () => service.get(f.input(1)));
    await expect(service.get(f.input(2))).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    f.resume();
    await Promise.all([pending, ...joined]);
    expect(f.reads()).toBe(3);
});

test("inspection evicts entries, respects byte budgets and rejects invalid selectors without reading", async () => {
    const f = await fixture();
    const sources = new Map([[f.source.id, f.source]]);
    const inspection = new RepositoryInspection();
    for (let index = 0; index < 9; index++) {
        await inspection.get(sources, f.input(index));
    }
    expect(f.reads()).toBe(9);
    await inspection.get(sources, f.input());
    expect(f.reads()).toBe(10);
    const tiny = new RepositoryInspection(16);
    await tiny.get(sources, f.input());
    await tiny.get(sources, f.input());
    expect(f.reads()).toBe(12);
    await expect(inspection.get(sources, { ...f.input(), blocId: "missing", exampleId: "missing" })).rejects.toThrow();
    expect(f.reads()).toBe(12);
    await expect(inspection.get(sources, { ...f.input(), offset: -1 })).rejects.toThrow();
    await expect(
        inspection.get(sources, {
            ...f.input(),
            reference: { ...f.input().reference, digest: `sha256:${"0".repeat(64)}` },
        }),
    ).rejects.toThrow();
});

test("inspection snapshots the caller reference before asynchronous reads", async () => {
    const f = await fixture();
    const service = new RepositoryDiscovery([f.source]);
    f.wait();
    const input = f.input();
    const pending = service.get(input);
    input.reference.version = "1.0.8";
    f.resume();
    const result = await pending;
    expect(result.reference.version).toBe("1.0.0");
    expect(input.reference.version).toBe("1.0.8");
});
