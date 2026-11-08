import { expect, test } from "bun:test";
import { CmsDocumentation } from "@bernouy/documentation";
import { fixture } from "../fixture";

test("a cold lookup hints once without starting inference; prepared filters share one corpus", async () => {
    const first = await fixture("ulvia/example.first");
    const second = await fixture("ulvia/example.second");
    let hints = 0;
    const service = new CmsDocumentation(
        {
            resolve: async () => ({ revision: "1", releases: [first.admission, second.admission] }),
            isCurrent: async () => true,
            read: (reference) =>
                reference.contractId === "ulvia/example.first"
                    ? first.source.read(reference)
                    : second.source.read(reference),
        },
        first.model,
        undefined,
        undefined,
        () => {
            hints++;
        },
    );
    const cold = await service.search({ query: "revision" });
    expect(cold).toMatchObject({ mode: "lexical", degraded: true });
    expect(first.calls).toHaveLength(0);
    await service.search({ query: "upload" });
    expect(hints).toBe(1);
    const prepared = await service.prepare();
    expect(prepared.embedded).toBe(prepared.chunks);
    const results = await Promise.all([
        service.search({ query: "revision", contractId: "ulvia/example.first" }),
        service.search({ query: "revision", contractId: "ulvia/example.second", capabilityId: "read" }),
        service.search({ query: "revision" }),
    ]);
    expect(results.every((result) => result.mode === "hybrid")).toBe(true);
    expect(results[0]!.results.every((row) => row.reference.contractId === "ulvia/example.first")).toBe(true);
    expect(results[1]!.results).toHaveLength(1);
    expect(results[1]!.results[0]!.reference.contractId).toBe("ulvia/example.second");
    expect(first.calls.filter((call) => call.kind === "passage")).toHaveLength(1);
    expect(first.calls.filter((call) => call.kind === "query")).toHaveLength(3);
    expect(first.reads() + second.reads()).toBe(4);
    expect(await service.prepare()).toMatchObject({ embedded: 0, reused: prepared.chunks });
    await service.close();
});

test("failed preparation leaves lexical retrieval and direct document reads available", async () => {
    const f = await fixture();
    const service = new CmsDocumentation(f.source, {
        model: "broken",
        embed: async () => {
            throw new Error("Unavailable");
        },
    });
    await expect(service.prepare()).rejects.toThrow("Unavailable");
    expect(await service.search({ query: "revision" })).toMatchObject({ mode: "lexical", degraded: true });
    expect(
        (
            await service.get({
                reference: {
                    contractId: f.admission.release.contractId,
                    releaseDigest: f.admission.digest,
                    path: "guide-0.md",
                },
            })
        ).content,
    ).toBe(f.texts[0]!);
    await service.close();
});
