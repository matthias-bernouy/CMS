import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { planContractPublications } from "cms-repository/contracts/core/catalogue/planPublications";
import { publishContractSet } from "cms-repository/contracts/core/catalogue/publishContractSet";
import { capabilityDocument, contractDocument } from "../../../../../platform/contracts/tests/support/fixtures";

test("plans exact inheritance and semantic version ordering without provider dependency metadata", async () => {
    const parent = await admitContractRelease(contractDocument({ contractId: "ulvia/example.parent" }));
    const child = await admitContractRelease(
        contractDocument({
            contractId: "ulvia/example.child",
            extends: { contractId: parent.release.contractId, version: parent.release.version, digest: parent.digest },
            capabilities: [capabilityDocument({ id: "child.call" })],
        }),
    );
    const nextParent = await admitContractRelease(
        contractDocument({ contractId: "ulvia/example.parent", version: "1.1.0" }),
    );
    const catalogue = new InMemoryReleaseCatalogue();
    const ordered = await planContractPublications(catalogue, [child, nextParent, parent]);
    expect(ordered.indexOf(ordered.find(({ digest }) => digest === parent.digest)!)).toBeLessThan(
        ordered.indexOf(ordered.find(({ digest }) => digest === child.digest)!),
    );
    expect(await catalogue.list()).toEqual([]);
    await publishContractSet(catalogue, [child, nextParent, parent]);
    expect(await catalogue.list()).toHaveLength(3);
});
test("publication validates every candidate and parent pin before writing", async () => {
    const first = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const next = await admitContractRelease(contractDocument({ version: "1.1.0" }));
    const catalogue = new InMemoryReleaseCatalogue();
    expect((await publishContractSet(catalogue, [next, first])).map(({ release }) => release.version)).toEqual([
        "1.0.0",
        "1.1.0",
    ]);
    const empty = new InMemoryReleaseCatalogue();
    const invalid = structuredClone(await admitContractRelease(contractDocument({ version: "1.2.0" })));
    Object.assign(invalid.release, { publisherId: "another.publisher" });
    await expect(publishContractSet(empty, [first, invalid])).rejects.toThrow("namespace must match");
    expect(await empty.list()).toEqual([]);
    const orphan = await admitContractRelease(
        contractDocument({
            contractId: "ulvia/example.child",
            extends: { contractId: first.release.contractId, version: first.release.version, digest: first.digest },
            capabilities: [capabilityDocument({ id: "child.call" })],
        }),
    );
    await expect(publishContractSet(empty, [orphan])).rejects.toThrow();
    expect(await empty.list()).toEqual([]);
});
