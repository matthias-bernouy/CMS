import { expect, test, setSystemTime } from "bun:test";
import { CmsDocumentation } from "@bernouy/cms-documentation";
import type { DocumentationVectorStore } from "@bernouy/cms-documentation";
import { fixture } from "../fixture";

test("a changed release embeds only its changed passage and an active corpus periodically revisits persisted vectors", async () => {
    const first = await fixture();
    const second = await fixture("example.documents", false, {
        texts: [first.texts[0]!, `${first.texts[1]}\nUse the new upload endpoint.\n`],
        version: "1.0.1",
    });
    let current = first;
    let revision = "1";
    let storeReads = 0;
    const rows = new Map<string, readonly number[]>();
    const store: DocumentationVectorStore = {
        get: async (keys) => {
            storeReads++;
            return new Map(keys.flatMap((key) => (rows.has(key) ? [[key, rows.get(key)!] as const] : [])));
        },
        put: async (values) => {
            for (const row of values) {
                rows.set(row.key, row.vector);
            }
        },
    };
    const source = {
        resolve: async () => ({ revision, releases: [current.admission] }),
        isCurrent: async (expected: string) => expected === revision,
        read: (reference: Parameters<typeof first.source.read>[0]) => current.source.read(reference),
    };
    const service = new CmsDocumentation(source, first.model, store);
    try {
        const initial = await service.prepare();
        expect(initial.embedded).toBe(initial.chunks);
        current = second;
        revision = "2";
        expect((await service.search({ query: "revision" })).mode).toBe("lexical");
        const updated = await service.prepare();
        expect(updated).toMatchObject({ embedded: 1, reused: initial.chunks - 1 });
        const before = first.calls.length;
        await service.prepare();
        expect(first.calls).toHaveLength(before);
        expect(storeReads).toBe(2);
        setSystemTime(new Date(Date.now() + 25 * 60 * 60_000));
        expect(await service.prepare()).toMatchObject({ embedded: 0, reused: updated.chunks });
        expect(first.calls).toHaveLength(before);
        expect(storeReads).toBe(3);
    } finally {
        setSystemTime();
        await service.close();
    }
});
