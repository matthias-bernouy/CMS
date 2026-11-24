import { expect, test } from "bun:test";
import { reviewSystemUpgrade } from "../../../../src/runtime/instances/system/execution/upgrades";
import { previousInstance } from "./fixture";

test("the exact 1.9 upgrade adds mandatory Templates and Events, offers optional Forms and retains ordinary/Control families", async () => {
    for (const control of [false, true]) {
        const f = await previousInstance(control);
        const before = structuredClone(f.installed);
        const available = await f.system.available();
        const input = {
            expectedRevision: 1,
            administratorSub: "local:admin",
            manifestDigest: available.manifest.digest,
        };
        const review = await reviewSystemUpgrade(
            f.instance,
            input,
            f.stores,
            f.support,
            f.system,
            f.installed.installation.endpoint,
        );
        expect(review.source.manifest.version).toBe("1.9.0");
        expect(review.source.manifest.digest).toBe(
            "sha256:8f04a28e10cb8f85f3347c4fd760136842ea7ac0d69d7c291f4e02fccd9a592e",
        );
        expect(review.source.contracts.find(({ contractId }) => contractId === "ulvia/cms.access")?.version).toBe(
            "1.0.0",
        );
        expect(review.source.contracts.some(({ contractId }) => contractId === "ulvia/cms.email-templates")).toBe(
            false,
        );
        expect(review.target.manifest.version).toBe("1.15.0");
        expect(review.target.contracts.find(({ contractId }) => contractId === "ulvia/cms.access")?.version).toBe(
            "1.2.0",
        );
        expect(
            review.target.contracts
                .filter((pin) => !review.source.contracts.some((old) => old.contractId === pin.contractId))
                .map(({ contractId }) => contractId),
        ).toEqual(["ulvia/cms.email-templates", "ulvia/cms.events", "ulvia/cms.forms"]);
        expect(review.target.contracts.some(({ contractId }) => contractId === "ulvia/cms.hosting")).toBe(control);
        expect(review.target.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(false);
        expect(
            review.target.contracts.some(({ contractId }) =>
                ["ulvia/cluster.logs", "ulvia/provider.tls", "ulvia/provider.routing"].includes(contractId),
            ),
        ).toBe(false);
        expect(
            await reviewSystemUpgrade(
                f.instance,
                input,
                f.stores,
                f.support,
                f.system,
                f.installed.installation.endpoint,
            ),
        ).toEqual(review);
        expect(f.installed).toEqual(before);
    }
}, 20000);
