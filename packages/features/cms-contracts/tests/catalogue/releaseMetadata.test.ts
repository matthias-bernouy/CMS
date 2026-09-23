import { describe, expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-contracts/catalogue";
import { contractDocument } from "../support/fixtures";

describe("catalogue release metadata", () => {
    test("publishing another version does not deprecate the previous release", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        const first = await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "2.0.0" })));

        expect((await catalogue.get("communication.email", "1.0.0"))?.deprecation).toBeUndefined();
        expect((await catalogue.get("communication.email", "1.0.0"))?.yank).toBeUndefined();
        expect(first.deprecation).toBeUndefined();
    });

    test("requires a meaningful deprecation signal and a published replacement", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));

        await expect(catalogue.setDeprecation("communication.email", "1.0.0", {})).rejects.toThrow(
            "must include reason, replacedByVersion, or sunsetAt",
        );
        await expect(catalogue.setDeprecation("communication.email", "1.0.0", { reason: "   " })).rejects.toThrow(
            "must not be blank",
        );
        await expect(
            catalogue.setDeprecation("communication.email", "1.0.0", { replacedByVersion: "2.0.0" }),
        ).rejects.toThrow("replacement must identify another published version");
        await expect(
            catalogue.setDeprecation("communication.email", "1.0.0", { sunsetAt: "2026-02-30T00:00:00Z" }),
        ).rejects.toThrow("must be a valid date-time");
    });

    test("deprecation and yank coexist and can be cleared independently", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        const first = await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        const deprecated = await catalogue.setDeprecation("communication.email", "1.0.0", {
            reason: "Use the newer API",
            sunsetAt: "2020-01-01T00:00:00Z",
        });
        expect(deprecated.yank).toBeUndefined();
        await expect(catalogue.setYank("communication.email", "1.0.0", { reason: "   " })).rejects.toThrow(
            "must not be blank",
        );

        const yanked = await catalogue.setYank("communication.email", "1.0.0", { reason: "Unsafe release" });
        expect(yanked.deprecation).toEqual(deprecated.deprecation);
        expect(yanked.yank).toEqual({ reason: "Unsafe release" });
        expect(yanked.admission.digest).toBe(first.admission.digest);
        expect(yanked.publishedAt).toBe(first.publishedAt);
        expect(await catalogue.findByDigest(first.admission.digest)).toBe(yanked);

        const restored = await catalogue.setYank("communication.email", "1.0.0", null);
        expect(restored.yank).toBeUndefined();
        expect(restored.deprecation).toEqual(deprecated.deprecation);
        const current = await catalogue.setDeprecation("communication.email", "1.0.0", null);
        expect(current.deprecation).toBeUndefined();
        expect(current.yank).toBeUndefined();
    });
});
