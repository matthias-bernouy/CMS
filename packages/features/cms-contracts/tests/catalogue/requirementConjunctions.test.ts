import { describe, expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-contracts/catalogue";
import { capabilityDocument, contractDocument } from "../support/fixtures";

const dependency = (version: string, ids: readonly string[]) =>
    contractDocument({
        contractId: "payment",
        version,
        capabilities: ids.map((id) =>
            capabilityDocument({
                id,
                binding: { transport: "http", method: "POST", path: `/${id}`, input: { body: true } },
            }),
        ),
    });

const requirement = (capabilityId: string, versionRange: string, supportRanges?: readonly string[]) => ({
    contractId: "payment",
    capabilityId,
    versionRange,
    ...(supportRanges ? { supportRanges } : {}),
});

const root = (requires: readonly unknown[]) =>
    admitContractRelease(
        contractDocument({
            version: "1.0.0",
            capabilities: [capabilityDocument({ requires })],
        }),
    );

describe("capability dependency conjunctions", () => {
    test("requires one release exposing all capabilities, not independent witnesses", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(dependency("1.0.0", ["create"])));
        await catalogue.publish(await admitContractRelease(dependency("2.0.0", ["refund"])));
        const candidate = await root([
            requirement("create", "^1.0.0 || ^2.0.0"),
            requirement("refund", "^1.0.0 || ^2.0.0"),
        ]);
        await expect(catalogue.publish(candidate)).rejects.toThrow("jointly exposes all required capabilities");
        await catalogue.publish(await admitContractRelease(dependency("2.1.0", ["create", "refund"])));
        await expect(catalogue.publish(candidate)).resolves.toMatchObject({ admission: { digest: candidate.digest } });
    });

    test("requires one version satisfying every incoming range on the same capability", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(dependency("1.0.0", ["create", "refund"])));
        await catalogue.publish(await admitContractRelease(dependency("2.0.0", ["create", "refund"])));
        await expect(
            catalogue.publish(await root([requirement("create", "^1.0.0"), requirement("refund", "^2.0.0")])),
        ).rejects.toThrow("jointly exposes all required capabilities");
    });

    test("requires each support range to retain a joint witness, including historical releases", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(dependency("1.0.0", ["create", "refund"])));
        await catalogue.publish(await admitContractRelease(dependency("2.0.0", ["create"])));
        const candidate = await root([
            requirement("create", "^1.0.0 || ^2.0.0", ["^1.0.0", "^2.0.0"]),
            requirement("refund", ">=1.0.0 <3.0.0"),
        ]);
        await expect(catalogue.publish(candidate)).rejects.toThrow("release in ^2.0.0 jointly");
        await catalogue.publish(await admitContractRelease(dependency("2.1.0", ["create", "refund"])));
        await catalogue.setYank("payment", "2.1.0", { reason: "Historical support" });
        await expect(catalogue.publish(candidate)).resolves.toMatchObject({ admission: { digest: candidate.digest } });
    });

    test("does not turn local publication checks into a cross-capability installation solver", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(dependency("1.0.0", ["create", "refund"])));
        await catalogue.publish(await admitContractRelease(dependency("2.0.0", ["create", "refund"])));
        const capabilities = ["^1.0.0", "^2.0.0"].map((range, index) =>
            capabilityDocument({
                id: `feature.${index === 0 ? "first" : "second"}`,
                requires: [requirement("create", range)],
                binding: { transport: "http", method: "POST", path: `/features/${index}`, input: { body: true } },
            }),
        );
        const candidate = await admitContractRelease(contractDocument({ version: "1.0.0", capabilities }));
        await expect(catalogue.publish(candidate)).resolves.toMatchObject({ admission: { digest: candidate.digest } });
    });
});
