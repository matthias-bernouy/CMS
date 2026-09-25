import { describe, expect, test } from "bun:test";
import { installationWorkflow } from "./fixtures";

describe("explicit installation modification and administrative intent", () => {
    test("captures the report before awaiting the stored installation", async () => {
        const { approve, lifecycle, scope, report } = await installationWorkflow();
        await approve();
        const expected = structuredClone(report);
        const pending = lifecycle.prepareModification(scope, 1, {}, report);
        report.account.id = "account:changed";
        report.account.label = "Changed after invocation";
        report.implementations[0]!.status = "unavailable";
        const preparation = await pending;
        expect(preparation.observation.report).toEqual(expected);
        expect(Object.isFrozen(report.account)).toBe(false);
    });

    test("a manifest upgrade awaits reapproval and discards old observations", async () => {
        const { approve, lifecycle, store, scope, upgrade, report, setTime } = await installationWorkflow();
        await approve();
        const observed = await lifecycle.observe(scope, 1, report);
        const next = await upgrade();
        setTime("2026-09-24T10:00:01Z");
        const pending = await lifecycle.prepareModification(
            scope,
            observed.revision,
            {
                manifestVersion: next.admission.manifest.version,
                manifestDigest: next.admission.digest,
                endpoint: "https://secondary.example.com",
                configuration: { locale: "fr" },
                providerTokenRef: "${ROTATED_TOKEN}",
            },
            next.report,
        );
        expect((await store.get(scope))!.installation.approval.manifestVersion).toBe("1.0.0");
        await expect(lifecycle.approve(pending, "admin:owner")).rejects.toMatchObject({ code: "invalid_preparation" });
        const changed = await lifecycle.modify(pending, "admin:owner");
        expect(changed.installation.approval.manifestVersion).toBe("2.0.0");
        expect(changed.installation.endpoint).toBe("https://secondary.example.com");
        expect(changed.installation.configuration.locale).toBe("fr");
        expect(changed.observation).toBeUndefined();
        expect(observed.installation.approval.manifestVersion).toBe("1.0.0");
        await expect(lifecycle.observe(scope, changed.revision, report)).rejects.toThrow();
    });

    test("blocks identity changes and scopes every existing-installation action to a site", async () => {
        const { approve, lifecycle, store, scope, candidate, report, clock } = await installationWorkflow();
        await approve();
        for (const patch of [
            { accountId: "account:new" },
            { siteId: "site:new" },
            { providerId: "other.provider" },
            { id: "installation:new" },
        ]) {
            await expect(lifecycle.prepareModification(scope, 1, patch as never, report)).rejects.toThrow();
        }
        await expect(
            store.reapprove(scope, 1, {
                candidate: { ...candidate, id: "installation:other" },
                report,
                preparedAt: clock(),
                approvedBy: "admin:owner",
            }),
        ).rejects.toMatchObject({ code: "identity_change" });
        const other = { ...scope, siteId: "site:other" };
        expect(await store.get(other)).toBeNull();
        await expect(lifecycle.disable(other, 1)).rejects.toMatchObject({ code: "installation_not_found" });
        await expect(lifecycle.observe(other, 1, report)).rejects.toMatchObject({ code: "installation_not_found" });
        await expect(lifecycle.prepareModification(other, 1, {}, report)).rejects.toMatchObject({
            code: "installation_not_found",
        });
    });

    test("disable and enable do not establish readiness, and revocation is terminal", async () => {
        const { approve, lifecycle, store, scope, report, candidate, clock } = await installationWorkflow();
        await approve();
        const disabled = await lifecycle.disable(scope, 1);
        expect(disabled.installation.status).toBe("disabled");
        const pending = await lifecycle.prepareModification(
            scope,
            disabled.revision,
            { configuration: { locale: "fr" } },
            report,
        );
        const modified = await lifecycle.modify(pending, "admin:owner");
        expect(modified.installation.status).toBe("disabled");
        const enabled = await lifecycle.enable(scope, modified.revision);
        expect(enabled.observation).toBeUndefined();
        const revoked = await lifecycle.revoke(scope, enabled.revision);
        expect(revoked.installation.status).toBe("revoked");
        for (const action of [
            () => lifecycle.enable(scope, revoked.revision),
            () => lifecycle.disable(scope, revoked.revision),
            () => lifecycle.observe(scope, revoked.revision, report),
            () => lifecycle.prepareModification(scope, revoked.revision, {}, report),
            () =>
                store.reapprove(scope, revoked.revision, {
                    candidate,
                    report,
                    preparedAt: clock(),
                    approvedBy: "admin:owner",
                }),
        ]) {
            await expect(action()).rejects.toMatchObject({ code: "installation_revoked" });
        }
        await expect(
            store.approve({ candidate, report, preparedAt: clock(), approvedBy: "admin:owner" }),
        ).rejects.toMatchObject({ code: "installation_exists" });
    });

    test("stale revisions cannot overwrite an intervening observation or status change", async () => {
        const { approve, lifecycle, scope, report } = await installationWorkflow();
        await approve();
        const pending = await lifecycle.prepareModification(scope, 1, {}, report);
        await lifecycle.disable(scope, 1);
        await expect(lifecycle.modify(pending, "admin:owner")).rejects.toMatchObject({ code: "revision_conflict" });
        await expect(lifecycle.observe(scope, 1, report)).rejects.toMatchObject({ code: "revision_conflict" });
    });
});
