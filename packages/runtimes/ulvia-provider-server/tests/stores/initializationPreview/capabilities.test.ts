import { expect, test } from "bun:test";
import type { ContractSelectionStore } from "@bernouy/repository/providers/selections";
import type { ReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { previewCapabilities } from "../../../src/runtime/stores/collections/preview/capabilities";

const digest = `sha256:${"a".repeat(64)}`;
const target = { contractId: "ulvia/catalog", capabilityId: "list", effect: "query" as const };

function fixture(contractCount = 1) {
    let selectionReads = 0;
    let releaseReads = 0;
    let fail = false;
    let available = true;
    let mismatch = false;
    const selections = {
        get: async () => {
            selectionReads++;
            return {
                plan: {
                    selections: available
                        ? Array.from({ length: contractCount }, (_, index) => ({
                              ...target,
                              contractId: contractCount === 1 ? target.contractId : `ulvia/catalog${index}`,
                              version: "1.0.0",
                              digest,
                          }))
                        : [],
                },
            };
        },
    } as unknown as ContractSelectionStore;
    const releases = {
        get: async () => {
            releaseReads++;
            if (fail) {
                throw new Error("Temporary catalogue failure");
            }
            return {
                admission: {
                    digest: mismatch ? `sha256:${"b".repeat(64)}` : digest,
                    release: {
                        capabilities: [{ id: "list", behavior: { effect: "query" }, output: { type: "string" } }],
                    },
                },
            };
        },
    } as unknown as ReleaseCatalogue;
    return {
        selections,
        releases,
        reads: () => ({ selectionReads, releaseReads }),
        fail: (value: boolean) => (fail = value),
        available: (value: boolean) => (available = value),
        mismatch: () => (mismatch = true),
    };
}

test("one disposable preview reads shared selection and exact contract evidence once", async () => {
    const f = fixture();
    const preview = previewCapabilities(f.selections, f.releases);
    for (let page = 0; page < 42; page++) {
        expect(await preview.resolveCapabilities([target])).toHaveLength(1);
    }
    expect(f.reads()).toEqual({ selectionReads: 1, releaseReads: 1 });
    // A later preparation must observe revocation, not another preview's evidence.
    f.available(false);
    await expect(previewCapabilities(f.selections, f.releases).resolveCapabilities([target])).rejects.toThrow(
        "not selected",
    );
    expect(f.reads().selectionReads).toBe(2);
});

test("failed catalogue loads are retried and exact selected digests remain mandatory", async () => {
    const f = fixture();
    const preview = previewCapabilities(f.selections, f.releases);
    f.fail(true);
    await expect(preview.resolveCapabilities([target])).rejects.toThrow("Temporary catalogue failure");
    f.fail(false);
    expect(await preview.resolveCapabilities([target])).toHaveLength(1);
    expect(f.reads().releaseReads).toBe(2);
    f.mismatch();
    await expect(previewCapabilities(f.selections, f.releases).resolveCapabilities([target])).rejects.toThrow(
        "unavailable or invalid",
    );
});

test("preview metadata reuse cannot authorize an unselected contract or a different effect", async () => {
    const f = fixture();
    const preview = previewCapabilities(f.selections, f.releases);
    await preview.resolveCapabilities([target]);
    await expect(preview.resolveCapabilities([{ ...target, contractId: "foreign/catalog" }])).rejects.toThrow();
    await expect(preview.resolveCapabilities([{ ...target, effect: "command" }])).rejects.toThrow();
    expect(f.reads()).toEqual({ selectionReads: 1, releaseReads: 1 });
});

test("contract evidence retention stays bounded even beyond the production selection limit", async () => {
    const f = fixture(65);
    const preview = previewCapabilities(f.selections, f.releases);
    const targets = Array.from({ length: 65 }, (_, index) => ({ ...target, contractId: `ulvia/catalog${index}` }));
    await preview.resolveCapabilities(targets);
    expect(f.reads()).toEqual({ selectionReads: 1, releaseReads: 65 });
    await preview.resolveCapabilities([targets[0]!]);
    expect(f.reads().releaseReads).toBe(65);
    await preview.resolveCapabilities([targets[64]!]);
    expect(f.reads().releaseReads).toBe(66);
});
