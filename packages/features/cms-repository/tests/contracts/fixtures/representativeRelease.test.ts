import { describe, expect, test } from "bun:test";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";

const fixturePath = new URL("../../../fixtures/contracts/protocol-v1/representative.contract.json", import.meta.url);

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
        expect(admitted.digest).toBe("sha256:66216be960b7797662208059a69a942bb0969425bfdf6a8b6ca110c4cb28903d");
    });
});
