import { expect, test } from "bun:test";
import { CmsDocumentation } from "@bernouy/cms-documentation";
import type { DocumentationEmbeddings, DocumentationVectorStore } from "@bernouy/cms-documentation";
import { fixture } from "./fixture";

test("hybrid retrieval handles paraphrases without lexical overlap and caches the derived corpus", async () => {
    const f = await fixture();
    const service = new CmsDocumentation(f.source, f.model);
    await service.prepare();
    const result = await service.search({ query: "Comment éviter d’écraser le travail des autres ?" });
    expect(result.mode).toBe("hybrid");
    expect(result.degraded).toBe(false);
    expect(result.results[0]?.reference.path).toBe("guide-0.md");
    expect(result.results[0]?.capabilities).toEqual(["read"]);
    expect(f.reads()).toBe(2);
    await service.search({ query: "revision" });
    expect(f.reads()).toBe(2);
    expect(f.calls.filter((call) => call.kind === "passage")).toHaveLength(1);
    expect(f.calls.filter((call) => call.kind === "query")).toHaveLength(2);
});

test("unavailable or invalid vectors produce an explicit lexical fallback with exact identifier matches", async () => {
    const f = await fixture();
    for (const model of [undefined, { model: "broken", embed: async () => [[Number.NaN]] }]) {
        const service = new CmsDocumentation(f.source, model);
        const result = await service.search({ query: "revision" });
        expect(result).toMatchObject({ mode: "lexical", degraded: true });
        expect(result.results[0]?.reference.path).toBe("guide-0.md");
    }
});

test("filters apply before ranking and selection changes fence both search and direct reads", async () => {
    const f = await fixture();
    const service = new CmsDocumentation(f.source, f.model);
    await service.prepare();
    const filtered = await service.search({ query: "upload", capabilityId: "read" });
    expect(filtered.results.every((result) => result.reference.path === "guide-0.md")).toBe(true);
    expect((await service.search({ query: "revision", contractId: "unselected" })).results).toEqual([]);
    const ref = { contractId: f.admission.release.contractId, releaseDigest: f.admission.digest, path: "guide-0.md" };
    const other = await fixture("another.instance.contract");
    const isolated = new CmsDocumentation(other.source, other.model);
    await expect(isolated.get({ reference: ref })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(service.search({ query: "revision", siteId: "another-instance" })).rejects.toMatchObject({
        code: "INVALID_INPUT",
    });
    f.changeDuringRead();
    await expect(service.search({ query: "revision" })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(service.get({ reference: ref })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
});

test("derived vectors survive a service restart and model changes use independent cache keys", async () => {
    const f = await fixture();
    const rows = new Map<string, readonly number[]>();
    const store: DocumentationVectorStore = {
        get: async (keys) => new Map(keys.flatMap((key) => (rows.has(key) ? [[key, rows.get(key)!] as const] : []))),
        put: async (values) => {
            for (const value of values) {
                rows.set(value.key, value.vector);
            }
        },
    };
    await new CmsDocumentation(f.source, f.model, store).prepare();
    const before = f.calls.filter((call) => call.kind === "passage").length;
    await new CmsDocumentation(f.source, f.model, store).prepare();
    expect(f.calls.filter((call) => call.kind === "passage")).toHaveLength(before);
    await new CmsDocumentation(f.source, { ...f.model, model: "new-model-v2" }, store).prepare();
    expect(f.calls.filter((call) => call.kind === "passage")).toHaveLength(before + 1);
});

test("slow embeddings cannot create unlimited background inference after search deadlines", async () => {
    const f = await fixture();
    let calls = 0;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
        started = resolve;
    });
    const releases: (() => void)[] = [];
    const model: DocumentationEmbeddings = {
        model: "slow",
        embed: async (texts) => {
            calls++;
            started();
            await new Promise<void>((resolve) => {
                releases.push(resolve);
            });
            return texts.map(() => [1, 0]);
        },
    };
    const service = new CmsDocumentation(f.source, model, undefined, 5);
    const preparation = service.prepare();
    await startedPromise;
    const results = await Promise.all(Array.from({ length: 12 }, () => service.search({ query: "revision" })));
    expect(results.every((result) => result.degraded)).toBe(true);
    expect(calls).toBe(1);
    releases.forEach((release) => release());
    await preparation;
    await service.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
});
