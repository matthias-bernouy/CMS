import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../../support/fixtures";

test("changing an exact parent cannot hide an incompatible inherited capability", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    const first = await admitContractRelease(contractDocument({ contractId: "ulvia/example.first", version: "1.0.0" }));
    const second = await admitContractRelease(
        contractDocument({
            contractId: "ulvia/example.second",
            version: "1.0.0",
            capabilities: [capabilityDocument({ input: objectSchema({ value: stringSchema() }, ["value"]) })],
        }),
    );
    const child = (parent: typeof first, version: string) =>
        admitContractRelease(
            contractDocument({
                contractId: "ulvia/example.child",
                version,
                extends: {
                    contractId: parent.release.contractId,
                    version: parent.release.version,
                    digest: parent.digest,
                },
                capabilities: [
                    capabilityDocument({
                        id: "child.configure",
                        bindings: [{ transport: "http", method: "POST", path: "/child", input: { body: true } }],
                    }),
                ],
            }),
        );
    await publishContractSet(catalogue, [first, await child(first, "1.0.0")]);
    await catalogue.publish(second);
    await expect(catalogue.publish(await child(second, "2.0.0"))).rejects.toThrow("new capability");
    expect(await catalogue.get("ulvia/example.child", "2.0.0")).toBeNull();
});
test("restoring verified published bytes preserves historical baselines without republishing them", async () => {
    const first = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const historical = await admitContractRelease(
        contractDocument({
            version: "2.0.0",
            capabilities: [capabilityDocument({ input: objectSchema({ value: stringSchema() }, ["value"]) })],
        }),
    );
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.restore(first.canonicalJson, first.digest, "2026-01-01T00:00:00Z");
    await catalogue.restore(historical.canonicalJson, historical.digest, "2026-02-01T00:00:00Z");
    expect(await catalogue.publish(historical)).toMatchObject({ admission: { digest: historical.digest } });
    const next = await admitContractRelease({ ...historical.release, version: "2.0.1" });
    await expect(catalogue.publish(next)).resolves.toBeDefined();
    const changed = await admitContractRelease({
        ...historical.release,
        version: "3.0.0",
        capabilities: [capabilityDocument()],
    });
    await expect(catalogue.publish(changed)).rejects.toThrow("new capability");
});
