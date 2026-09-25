import { describe, expect, test } from "bun:test";
import { DEFAULT_PROVIDER_INSTALLATION_LIMITS } from "cms-repository/providers/installations/core/limits";
import { installationWorkflow } from "./fixtures";

describe("installation approval document budgets", () => {
    for (const override of [{ maxJsonDepth: 3 }, { maxDocumentBytes: 800 }]) {
        test(`preserves ${JSON.stringify(override)} through approval and modification`, async () => {
            const { lifecycle, store, candidate, report, scope } = await installationWorkflow({
                limits: { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, ...override },
            });
            const preparation = await lifecycle.prepare(candidate, report);
            const approved = await lifecycle.approve(preparation, "admin:owner");
            expect(approved.revision).toBe(1);
            expect(await store.get(scope)).toEqual(approved);

            const modification = await lifecycle.prepareModification(
                scope,
                approved.revision,
                { configuration: { locale: "fr" } },
                report,
            );
            const modified = await lifecycle.modify(modification, "admin:owner");
            expect(modified.revision).toBe(2);
            expect(modified.installation.configuration.locale).toBe("fr");
            expect(await store.get(scope)).toEqual(modified);
        });
    }

    for (const document of ["candidate", "report"] as const) {
        for (const budget of ["bytes", "depth"] as const) {
            test(`still bounds individual ${document} ${budget} on direct store commands`, async () => {
                const { store, candidate, report, clock, scope, approve } = await installationWorkflow({
                    limits: { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxDocumentBytes: 800, maxJsonDepth: 3 },
                });
                const command = { candidate, report, preparedAt: clock(), approvedBy: "admin:owner" };
                const extra = budget === "bytes" ? "x".repeat(800) : { nested: { too: { deep: true } } };
                const invalid = { ...command, [document]: { ...command[document], extra } };
                const code = budget === "bytes" ? "body_limit_exceeded" : "json_depth_limit_exceeded";
                await expect(store.approve(invalid)).rejects.toMatchObject({ code });
                expect(await store.get(scope)).toBeNull();

                const approved = await approve();
                await expect(store.reapprove(scope, approved.revision, invalid)).rejects.toMatchObject({ code });
                expect(await store.get(scope)).toEqual(approved);
            });
        }
    }

    test("keeps strict envelope validation and bounded approval metadata", async () => {
        const { store, candidate, report, clock, scope } = await installationWorkflow();
        const command = { candidate, report, preparedAt: clock(), approvedBy: "admin:owner" };
        for (const invalid of [
            { ...command, extra: true },
            { ...command, approvedBy: "x".repeat(129) },
            { ...command, preparedAt: "x".repeat(65) },
            { ...command, approvedBy: "\ud800" },
        ]) {
            await expect(store.approve(invalid)).rejects.toMatchObject({ code: "invalid_installation" });
        }
        let getterCalls = 0;
        const accessor = Object.defineProperty({ ...command }, "candidate", {
            enumerable: true,
            get() {
                getterCalls += 1;
                return candidate;
            },
        });
        await expect(store.approve(accessor)).rejects.toMatchObject({ code: "invalid_installation" });
        expect(getterCalls).toBe(0);
        expect(await store.get(scope)).toBeNull();
    });

    test("snapshots both documents and metadata before asynchronous approval", async () => {
        const { store, candidate, report, clock } = await installationWorkflow({
            limits: { ...DEFAULT_PROVIDER_INSTALLATION_LIMITS, maxDocumentBytes: 800, maxJsonDepth: 3 },
        });
        const command = { candidate, report, preparedAt: clock(), approvedBy: "admin:owner" };
        const pending = store.approve(command);
        candidate.configuration.locale = "fr";
        report.account.id = "account:changed";
        command.approvedBy = "admin:changed";
        const approved = await pending;
        expect(approved.installation.configuration.locale).toBe("en");
        expect(approved.installation.approval.approvedBy).toBe("admin:owner");
        expect(Object.isFrozen(candidate.configuration)).toBe(false);
        expect(Object.isFrozen(report.account)).toBe(false);
    });

    test("does not overflow configured safe-integer budgets", async () => {
        const { approve } = await installationWorkflow({
            limits: {
                ...DEFAULT_PROVIDER_INSTALLATION_LIMITS,
                maxDocumentBytes: Number.MAX_SAFE_INTEGER,
                maxJsonDepth: Number.MAX_SAFE_INTEGER,
            },
        });
        expect((await approve()).revision).toBe(1);
    });
});
