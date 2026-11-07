import { describe, expect, test } from "bun:test";
import { admitContractReleaseJson } from "@bernouy/ulvia-contracts";

const fixturePath = new URL(
    "../../../../../platform/contracts/fixtures/protocol-v1/representative.contract.json",
    import.meta.url,
);

describe("representative Protocol v1 contract fixture", () => {
    test("admits every representative flow and preserves a golden digest", async () => {
        const source = await Bun.file(fixturePath).text();
        const admitted = await admitContractReleaseJson(source);

        expect(admitted.release.capabilities.map((capability) => capability.id)).toEqual([
            "catalog.item.list",
            "form.submission.create",
            "file.asset.upload",
            "file.asset.download",
            "report.export",
            "catalog.item.changes",
            "catalog.item.snapshot",
        ]);
        expect(admitted.digest).toBe("sha256:0f7adc66326ec67c2d3257be15992b07fde4e2d3e4abfee9372d9b82eeea7bce");
    });
});
