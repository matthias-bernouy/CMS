import { expect, test } from "bun:test";
import { CmsDocumentation } from "@bernouy/cms-documentation";
import { fixture } from "./fixture";

test("ancestor documents retain their declaring contract and exact digest", async () => {
    const parent = await fixture("example.parent");
    const child = await fixture("example.child");
    const service = new CmsDocumentation({
        resolve: async () => ({ revision: "current", releases: [child.admission, parent.admission] }),
        isCurrent: async () => true,
        read: (reference) =>
            reference.contractId === "example.parent" ? parent.source.read(reference) : child.source.read(reference),
    });
    const result = await service.search({ query: "revision", contractId: "example.parent", capabilityId: "read" });
    expect(result.results).toHaveLength(1);
    const reference = result.results[0]!.reference;
    expect(reference).toEqual({
        contractId: "example.parent",
        releaseDigest: parent.admission.digest,
        path: "guide-0.md",
    });
    expect((await service.get({ reference })).content).toBe(parent.texts[0]!);
    await expect(service.get({ reference: { ...reference, contractId: "example.child" } })).rejects.toMatchObject({
        code: "REVISION_CONFLICT",
    });
});

test("oversized selected corpora are refused before any document body is read", async () => {
    const f = await fixture();
    const service = new CmsDocumentation({
        ...f.source,
        resolve: async () => ({ revision: "1", releases: Array.from({ length: 129 }, () => f.admission) }),
    });
    await expect(service.search({ query: "revision" })).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    expect(f.reads()).toBe(0);
});

test("document read slots remain bounded and release after completion", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let reads = 0;
    const service = new CmsDocumentation({
        ...f.source,
        read: async (reference) => {
            reads++;
            await gate;
            return f.source.read(reference);
        },
    });
    const reference = {
        contractId: f.admission.release.contractId,
        releaseDigest: f.admission.digest,
        path: "guide-0.md",
    };
    const pending = Array.from({ length: 16 }, () => service.get({ reference }));
    await expect(service.get({ reference })).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    expect(reads).toBe(16);
    release();
    await Promise.all(pending);
    expect((await service.get({ reference })).content).toBe(f.texts[0]!);
});
