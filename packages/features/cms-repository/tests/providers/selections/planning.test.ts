import { describe, expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import {
    DEFAULT_CONTRACT_SELECTION_LIMITS,
    planContractSelections,
} from "@bernouy/cms-repository/providers/selections";
import { graphFixture, siteId } from "./fixtures";
import { contractDocument } from "../support/fixtures";

describe("exact site selection planning", () => {
    test("commerce widening admits payment v1 and v2 without choosing or changing pins", async () => {
        const { context, select } = await graphFixture();
        for (const version of ["1.0.0", "2.0.0"]) {
            const input = [await select("commerce", "1.1.0"), await select("payment", version)];
            const plan = await planContractSelections(siteId, input, context);
            expect(plan.selections).toEqual(input);
            expect(plan).toMatchObject({ structurallyValid: true, runtimeReadiness: "not-evaluated" });
            expect(plan.dependencies.map((dependency) => dependency.source)).toEqual(["contract", "implementation"]);
            expect(Object.isFrozen(plan.dependencies[0])).toBe(true);
        }
    });

    test("reports version conflicts and missing dependencies with the dependency path", async () => {
        const { context, select } = await graphFixture();
        await expect(
            planContractSelections(siteId, [await select("commerce"), await select("payment", "2.0.0")], context),
        ).rejects.toMatchObject({ code: "incompatible_dependency", dependencyPath: ["commerce", "payment:pay"] });
        await expect(planContractSelections(siteId, [await select("commerce")], context)).rejects.toMatchObject({
            code: "missing_dependency",
            dependencyPath: ["commerce", "payment:pay"],
        });
    });

    test("rejects cross-site selections, foreign installation IDs and disabled or revoked installations", async () => {
        const { context, installation, select } = await graphFixture();
        const payment = await select("payment");
        await expect(planContractSelections("site:OTHER", [payment], context)).rejects.toMatchObject({
            code: "cross_site_selection",
        });
        await expect(
            planContractSelections(siteId, [{ ...payment, installationId: "unknown" }], context),
        ).rejects.toMatchObject({ code: "installation_unavailable" });
        for (const status of ["disabled", "revoked"] as const) {
            await expect(
                planContractSelections(siteId, [payment], { ...context, installations: [{ ...installation, status }] }),
            ).rejects.toMatchObject({ code: "installation_unavailable" });
        }
        await expect(
            planContractSelections(siteId, [payment], {
                ...context,
                installations: [{ ...installation, siteId: "site:OTHER" }],
            }),
        ).rejects.toMatchObject({ code: "cross_site_selection" });
    });

    test("rejects fabricated manifest/release pins and unserved exact releases", async () => {
        const { context, installation, releases, select } = await graphFixture();
        const payment = await select("payment");
        const wrongDigest = (await releases.get("payment", "2.0.0"))!.admission.digest;
        await expect(
            planContractSelections(siteId, [{ ...payment, digest: wrongDigest }], context),
        ).rejects.toMatchObject({ code: "release_mismatch" });
        await expect(
            planContractSelections(siteId, [payment], {
                ...context,
                installations: [{ ...installation, approval: { ...installation.approval, manifestVersion: "9.0.0" } }],
            }),
        ).rejects.toMatchObject({ code: "manifest_mismatch" });
        const unserved = await admitContractRelease(contractDocument("payment", "pay", "3.0.0"));
        await releases.publish(unserved);
        await expect(
            planContractSelections(siteId, [{ ...payment, version: "3.0.0", digest: unserved.digest }], context),
        ).rejects.toThrow("does not serve the exact release");
    });

    test("rejects release and manifest yanks for every proposed replacement", async () => {
        const { context, releases, manifests, select } = await graphFixture();
        const payment = await select("payment");
        await releases.setYank("payment", "1.0.0", { reason: "withdrawn" });
        await expect(planContractSelections(siteId, [payment], context)).rejects.toMatchObject({
            code: "yanked_dependency",
        });
        await releases.setYank("payment", "1.0.0", null);
        await manifests.setYank("ulvia.example", "1.0.0", { reason: "withdrawn" });
        await expect(planContractSelections(siteId, [payment], context)).rejects.toMatchObject({
            code: "yanked_dependency",
        });
    });

    test("snapshots input before async reads and bounds dependency/installation counts", async () => {
        const { context, installation, select } = await graphFixture();
        const mutable = structuredClone(installation);
        const payment = { ...(await select("payment")) };
        const pending = planContractSelections(siteId, [payment], { ...context, installations: [mutable] });
        mutable.status = "disabled";
        payment.version = "2.0.0";
        expect((await pending).selections[0]!.version).toBe("1.0.0");
        expect(Object.isFrozen(mutable)).toBe(false);
        const graph = [await select("commerce"), await select("payment")];
        await expect(
            planContractSelections(siteId, graph, context, {
                ...DEFAULT_CONTRACT_SELECTION_LIMITS,
                maxDependencies: 1,
            }),
        ).rejects.toMatchObject({ code: "limit_exceeded" });
        await expect(
            planContractSelections(
                siteId,
                graph,
                { ...context, installations: [installation, installation] },
                { ...DEFAULT_CONTRACT_SELECTION_LIMITS, maxInstallations: 1 },
            ),
        ).rejects.toMatchObject({ code: "limit_exceeded" });
    });
});
