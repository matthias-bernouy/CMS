import { expect, test } from "bun:test";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { publicationContract } from "./contract";

test("publication fixtures retain canonical namespace identities and independently verified documentation bytes", async () => {
    const resource = await publicationContract("performance-publication", "1.0.1", 4096);
    expect(resource.contractId).toBe("performance-publication/publication-fixture");
    expect(resource.version).toBe("1.0.1");
    const admitted = await admitContractBundleJson(resource.canonicalJson, [
        { id: resource.asset.id, bytes: resource.bytes },
    ]);
    expect(admitted.digest).toBe(resource.digest);
    const corrupt = Uint8Array.from(resource.bytes);
    corrupt[corrupt.length - 1] = corrupt[corrupt.length - 1]! ^ 1;
    await expect(
        admitContractBundleJson(resource.canonicalJson, [{ id: resource.asset.id, bytes: corrupt }]),
    ).rejects.toThrow();
    const source = JSON.parse(resource.sourceJson);
    expect(source.files.find((file: { path: string }) => file.path === resource.asset.id).content).toBe(
        new TextDecoder().decode(resource.bytes),
    );
});
