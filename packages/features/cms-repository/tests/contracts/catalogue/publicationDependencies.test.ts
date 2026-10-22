import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { capabilityDocument, contractDocument } from "../support/fixtures";

test("publishes a finite contract set in dependency order", async () => {
    const emailer = await release("example.emailer", "email.send");
    const access = await release("example.access", "account.signup", {
        contractId: "example.emailer",
        capabilityId: "email.send",
        versionRange: "^1.0.0",
    });
    const catalogue = new InMemoryReleaseCatalogue();

    const published = await publishContractSet(catalogue, [access, emailer]);

    expect(published.map(({ release }) => release.contractId)).toEqual(["example.emailer", "example.access"]);
    expect(await catalogue.get("example.access", "1.0.0")).not.toBeNull();
});

test("rejects a dependency cycle before partially publishing its members", async () => {
    const left = await release("example.left", "left.call", {
        contractId: "example.right",
        capabilityId: "right.call",
        versionRange: "^1.0.0",
    });
    const right = await release("example.right", "right.call", {
        contractId: "example.left",
        capabilityId: "left.call",
        versionRange: "^1.0.0",
    });
    const catalogue = new InMemoryReleaseCatalogue();

    await expect(publishContractSet(catalogue, [left, right])).rejects.toThrow("dependency cycle");
    expect(await catalogue.list()).toEqual([]);
});

async function release(
    contractId: string,
    capabilityId: string,
    requirement?: Readonly<{ contractId: string; capabilityId: string; versionRange: string }>,
) {
    return admitContractRelease(
        contractDocument({
            contractId,
            version: "1.0.0",
            capabilities: [
                capabilityDocument({
                    id: capabilityId,
                    ...(requirement ? { requires: [requirement] } : {}),
                }),
            ],
        }),
    );
}
