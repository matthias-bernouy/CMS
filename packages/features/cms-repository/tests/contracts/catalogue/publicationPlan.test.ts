import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import {
    InMemoryReleaseCatalogue,
    planContractPublications,
    publishContractSet,
} from "@bernouy/cms-repository/contracts/catalogue";
import { capabilityDocument, contractDocument } from "../support/fixtures";

test("publication plans validate the complete set and order staged requirements without mutation", async () => {
    const payment = await admitContractRelease(
        contractDocument({
            contractId: "money.payment",
            version: "1.0.0",
            capabilities: [capabilityDocument({ id: "payment.create" })],
        }),
    );
    const commerce = await admitContractRelease(
        contractDocument({
            contractId: "trade.commerce",
            version: "1.0.0",
            capabilities: [
                capabilityDocument({
                    id: "checkout.start",
                    requires: [
                        {
                            contractId: "money.payment",
                            capabilityId: "payment.create",
                            versionRange: "^1.0.0",
                        },
                    ],
                }),
            ],
        }),
    );
    const catalogue = new InMemoryReleaseCatalogue();

    const plan = await planContractPublications(catalogue, [commerce, payment]);

    expect(plan.map((admission) => admission.release.contractId)).toEqual(["money.payment", "trade.commerce"]);
    expect(await catalogue.list()).toEqual([]);
});

test("publication rejects mixed inheritance and requirement cycles before storing any artifact", async () => {
    const root = await admitContractRelease(
        contractDocument({
            contractId: "example.root",
            version: "1.0.0",
            capabilities: [
                capabilityDocument({
                    id: "root.call",
                    requires: [
                        { contractId: "example.dependency", capabilityId: "dependency.call", versionRange: "^1.0.0" },
                    ],
                }),
            ],
        }),
    );
    const child = await admitContractRelease(
        contractDocument({
            contractId: "example.child",
            version: "1.0.0",
            extends: { contractId: root.release.contractId, version: root.release.version, digest: root.digest },
            capabilities: [capabilityDocument({ id: "child.call" })],
        }),
    );
    const dependency = await admitContractRelease(
        contractDocument({
            contractId: "example.dependency",
            version: "1.0.0",
            capabilities: [
                capabilityDocument({
                    id: "dependency.call",
                    requires: [{ contractId: "example.child", capabilityId: "child.call", versionRange: "^1.0.0" }],
                }),
            ],
        }),
    );
    const catalogue = new InMemoryReleaseCatalogue();
    await expect(planContractPublications(catalogue, [child, root, dependency])).rejects.toThrow("dependency cycle");
    await expect(publishContractSet(catalogue, [child, root, dependency])).rejects.toThrow("dependency cycle");
    expect(await catalogue.list()).toEqual([]);
});

test("publication execution shares semantic version ordering and validates every candidate before writes", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    const first = await admitContractRelease(contractDocument({ version: "1.0.0" }));
    const next = await admitContractRelease(contractDocument({ version: "1.1.0" }));
    const ordered = await publishContractSet(catalogue, [next, first]);
    expect(ordered.map(({ release }) => release.version)).toEqual(["1.0.0", "1.1.0"]);
    const empty = new InMemoryReleaseCatalogue();
    const invalid = await admitContractRelease(
        contractDocument({ version: "1.2.0", publisherId: "another.publisher" }),
    );
    await expect(publishContractSet(empty, [first, invalid])).rejects.toThrow("ownership");
    expect(await empty.list()).toEqual([]);
});
