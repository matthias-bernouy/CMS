import { describe, expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { capabilityDocument, contractDocument } from "../support/fixtures";

const payment = (version: string) =>
    contractDocument({
        contractId: "money.payment",
        version,
        capabilities: [capabilityDocument({ id: "payment.checkout.create" })],
    });
const commerce = (range: string, version = "1.0.0", supportRanges?: readonly string[]) =>
    contractDocument({
        contractId: "trade.commerce",
        version,
        capabilities: [
            capabilityDocument({
                id: "commerce.checkout.start",
                requires: [
                    {
                        contractId: "money.payment",
                        capabilityId: "payment.checkout.create",
                        versionRange: range,
                        ...(supportRanges ? { supportRanges } : {}),
                    },
                ],
            }),
        ],
    });

describe("catalogue requirement resolution", () => {
    test("rejects unknown dependencies but preserves references to yanked releases", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        const candidate = await admitContractRelease(commerce("^1.1.12"));
        await expect(catalogue.publish(candidate)).rejects.toThrow("no published money.payment release");
        await catalogue.publish(await admitContractRelease(payment("1.1.12")));
        await catalogue.setYank("money.payment", "1.1.12", { reason: "Unavailable" });
        await expect(catalogue.publish(candidate)).resolves.toMatchObject({ admission: { digest: candidate.digest } });
    });

    test("resolves compatible releases without silently adopting a new major", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(payment("1.1.12")));
        await catalogue.publish(await admitContractRelease(payment("2.0.0")));
        await catalogue.setYank("money.payment", "1.1.12", { reason: "Retired" });
        await expect(catalogue.publish(await admitContractRelease(commerce("^3.0.0")))).rejects.toThrow(
            "no published money.payment release",
        );
        await expect(catalogue.publish(await admitContractRelease(commerce("^2.0.0")))).resolves.toMatchObject({
            admission: { release: { contractId: "trade.commerce" } },
        });
    });

    test("requires a published target for every explicit support range", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        const candidate = await admitContractRelease(commerce("^1.0.0 || ^2.0.0", "1.0.0", ["^1.0.0", "^2.0.0"]));
        await catalogue.publish(await admitContractRelease(payment("1.4.5")));
        await expect(catalogue.publish(candidate)).rejects.toThrow("release in ^2.0.0");

        await catalogue.publish(await admitContractRelease(payment("2.0.0")));
        await expect(catalogue.publish(candidate)).resolves.toMatchObject({
            admission: { release: { contractId: "trade.commerce" } },
        });

        const otherCatalogue = new InMemoryReleaseCatalogue();
        await otherCatalogue.publish(await admitContractRelease(payment("1.4.5")));
        await otherCatalogue.publish(await admitContractRelease(payment("2.0.0")));
        await otherCatalogue.setYank("money.payment", "1.4.5", { reason: "Retired" });
        await expect(otherCatalogue.publish(candidate)).resolves.toMatchObject({
            admission: { digest: candidate.digest },
        });
    });

    test("allows maintenance after an old alternative dependency is yanked", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(payment("1.0.0")));
        await catalogue.publish(await admitContractRelease(payment("2.0.0")));
        await catalogue.publish(
            await admitContractRelease(commerce("^1.0.0 || ^2.0.0", "1.0.0", ["^1.0.0", "^2.0.0"])),
        );
        await catalogue.setYank("money.payment", "1.0.0", { reason: "Retired" });
        await expect(
            catalogue.publish(await admitContractRelease(commerce("^1.0.0 || ^2.0.0", "1.0.1", ["^1.0.0", "^2.0.0"]))),
        ).resolves.toMatchObject({ admission: { release: { version: "1.0.1" } } });
    });

    test("equivalent accepted sets have the same witness policy regardless of OR spelling", async () => {
        for (const range of ["^1.0.0 || ^2.0.0", ">=1.0.0 <3.0.0"]) {
            const catalogue = new InMemoryReleaseCatalogue();
            await catalogue.publish(await admitContractRelease(payment("1.4.5")));
            await expect(catalogue.publish(await admitContractRelease(commerce(range)))).resolves.toMatchObject({
                admission: { release: { contractId: "trade.commerce" } },
            });
        }
    });
});
