import { expect, test } from "bun:test";
import { materializeStateSchemas } from "../../../../src/collections/tooling/authoring/stateSchemas";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { contractDocument } from "../../../providers/support/fixtures";

test("state schema references copy only the output of an exact admitted capability", async () => {
    const release = await admitContractRelease(contractDocument("schema.example", "read"));
    const contracts = new InMemoryReleaseCatalogue();
    await contracts.publish(release);
    const ref = {
        $capabilityOutput: {
            contractId: release.release.contractId,
            version: release.release.version,
            digest: release.digest,
            capabilityId: "read",
        },
    };
    const source = [{ id: "preview", schema: { type: "object", properties: { data: ref }, required: ["data"] } }];
    const result = (await materializeStateSchemas(source, contracts)) as typeof source;
    expect(result[0]!.schema.properties.data).toEqual(release.release.capabilities[0]!.output);
    expect(JSON.stringify(result)).not.toContain("$capabilityOutput");
    expect(source[0]!.schema.properties.data).toBe(ref);
    await expect(materializeStateSchemas(source)).rejects.toThrow("exact admitted");
    await expect(
        materializeStateSchemas(
            [{ $capabilityOutput: { ...ref.$capabilityOutput, digest: "sha256:" + "0".repeat(64) } }],
            contracts,
        ),
    ).rejects.toThrow("exact admitted");
    await expect(
        materializeStateSchemas(
            [{ $capabilityOutput: { ...ref.$capabilityOutput, capabilityId: "missing" } }],
            contracts,
        ),
    ).rejects.toThrow("missing");
    await expect(materializeStateSchemas([{ ...ref, type: "object" }], contracts)).rejects.toThrow("Invalid");
    let deep: unknown = {};
    for (let i = 0; i < 30; i++) {
        deep = { properties: deep };
    }
    await expect(materializeStateSchemas(deep, contracts)).rejects.toThrow("limits");
});
