import { describe, expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import type { ProviderManifestYank } from "@bernouy/cms-repository/providers/catalogue";
import { manifestCatalogueFixture } from "./fixtures";

describe("provider catalogue history", () => {
    test("yanks and restores records without mutating earlier snapshots or their admission", async () => {
        const { catalogue, admission } = await manifestCatalogueFixture();
        const initial = await catalogue.publish(admission);
        const reason = { reason: "Publisher requested withdrawal" };
        const yanked = await catalogue.setYank("ulvia.example", "1.0.0", reason);
        reason.reason = "Caller mutation";
        expect(initial.yank).toBeUndefined();
        expect(yanked.yank?.reason).toBe("Publisher requested withdrawal");
        expect(Object.isFrozen(reason)).toBe(false);
        expect(Object.isFrozen(yanked.yank)).toBe(true);
        expect(yanked.admission).toBe(initial.admission);
        expect(yanked.publishedAt).toBe(initial.publishedAt);
        expect(await catalogue.get("ulvia.example", "1.0.0")).toBe(yanked);
        expect(await catalogue.findByDigest(admission.digest)).toBe(yanked);
        expect(await catalogue.list()).toEqual([yanked]);
        expect(await catalogue.publish(admission)).toBe(yanked);
        expect((await catalogue.setYank("ulvia.example", "1.0.0", null)).yank).toBeUndefined();
        expect(yanked.yank?.reason).toBe("Publisher requested withdrawal");
    });

    test("retains published history after a contract yank and resolves references for new versions", async () => {
        const { catalogue, admission, contracts, document } = await manifestCatalogueFixture();
        const initial = await catalogue.publish(admission);
        const later = await admitProviderManifest({ ...document, version: "1.0.1" }, contracts);
        await contracts.setYank("forms.submission", "1.0.0", { reason: "Withdrawn contract" });
        expect(await catalogue.publish(admission)).toBe(initial);
        expect(await catalogue.findByDigest(admission.digest)).toBe(initial);
        await expect(catalogue.publish(later)).rejects.toThrow("yanked contract");
        expect(await catalogue.list()).toEqual([initial]);
    });

    test("validates bounded yank reasons and rejects absent publications", async () => {
        const { catalogue, admission } = await manifestCatalogueFixture();
        await catalogue.publish(admission);
        for (const value of [
            { reason: " " },
            { reason: "x".repeat(1025) },
            { reason: "Known", unknown: true },
            { reason: "\ud800" },
        ]) {
            await expect(catalogue.setYank("ulvia.example", "1.0.0", value as ProviderManifestYank)).rejects.toThrow();
        }
        await expect(catalogue.setYank("missing", "1.0.0", null)).rejects.toThrow("not published");
        expect((await catalogue.get("ulvia.example", "1.0.0"))?.yank).toBeUndefined();
    });
});
