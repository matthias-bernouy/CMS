import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, planContractPublications } from "@bernouy/cms-repository/contracts/catalogue";
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
