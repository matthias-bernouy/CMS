import { expect, test } from "bun:test";
import { CmsDocumentation } from "@bernouy/cms-documentation";
import { fixture } from "./fixture";

test("direct reads are exact, paginated, Unicode-safe and never build a semantic index", async () => {
    const f = await fixture("example.documents", true);
    const service = new CmsDocumentation(f.source, f.model);
    const reference = {
        contractId: f.admission.release.contractId,
        releaseDigest: f.admission.digest,
        path: "guide-1.md",
    };
    let offset = 0;
    let content = "";
    for (;;) {
        const page = await service.get({ reference, offset });
        expect(page.content.length).toBeLessThanOrEqual(16_384);
        expect(page.content.isWellFormed()).toBe(true);
        content += page.content;
        if (page.nextOffset === null) {
            break;
        }
        offset = page.nextOffset;
    }
    expect(content).toBe(f.texts[1]!);
    expect(f.calls).toHaveLength(0);
    await expect(service.get({ reference: { ...reference, path: "../private.md" } })).rejects.toMatchObject({
        code: "INVALID_INPUT",
    });
    await expect(service.get({ reference: { ...reference, path: "missing.md" } })).rejects.toMatchObject({
        code: "NOT_FOUND",
    });
});

test("corrupt document bytes are refused before either search or get returns content", async () => {
    const f = await fixture();
    const service = new CmsDocumentation({ ...f.source, read: async () => new Blob(["invalid"]) }, f.model);
    await expect(service.search({ query: "revision" })).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    await expect(
        service.get({
            reference: {
                contractId: f.admission.release.contractId,
                releaseDigest: f.admission.digest,
                path: "guide-0.md",
            },
        }),
    ).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
});
