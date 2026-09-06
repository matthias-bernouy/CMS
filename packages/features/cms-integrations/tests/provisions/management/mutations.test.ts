import { describe, expect, test } from "bun:test";
import { IntegrationManagementService } from "@bernouy/cms-integrations";
import { fixture } from "./fixture";
describe("integration settings mutations", () => {
    test("grants explicit refs, preserves ownership, synchronizes then confirms apply", async () => {
        const phases: string[] = [];
        let values: Record<string, unknown> = {};
        let sync: Record<string, string> = {};
        const { service, installations, secrets } = await fixture(
            async (_installation, _fn, payload, reader) => {
                phases.push(payload.operation);
                await expect(reader.get("OTHER_KEY")).rejects.toThrow("not granted");
                if (payload.operation === "save-settings") {
                    values = payload.input.values as Record<string, unknown>;
                    expect(payload.secretValues.key).toBe("selected-private-value");
                    return { values, savedRevision: "2", appliedRevision: null };
                }
                if (payload.operation === "apply-settings") {
                    return {
                        values,
                        savedRevision: "2",
                        appliedRevision: null,
                        generatedSecrets: { signing: "new-signing" },
                    };
                }
                expect(sync.SIGNING_KEY).toBe("new-signing");
                return { values, savedRevision: "2", appliedRevision: "2" };
            },
            {
                syncRuntimeSecrets: async (_installation, values) => {
                    phases.push("sync");
                    sync = values;
                },
            },
        );
        await service.saveSettings("test-management", { values: { key: "${SELECTED_KEY}" }, expectedRevision: null });
        const result = await service.action("test-management", "apply-settings");
        expect(phases).toEqual(["save-settings", "apply-settings", "sync", "confirm-apply"]);
        expect(sync).toEqual({ API_KEY: "selected-private-value", SIGNING_KEY: "new-signing" });
        expect(JSON.stringify(result)).not.toContain("new-signing");
        expect(await secrets.get("SELECTED_KEY")).toBe("selected-private-value");
        const installed = await installations.get("test-management");
        expect(installed?.status).toBe("success");
        expect(installed?.managementLease).toBeUndefined();
        expect(installed?.secretRefs).toEqual({ signing: "MANAGED_SIGNING" });
    });
    test("durable lease rejects other service instances and releases after a failed apply", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const { service, deps, installations } = await fixture(async () => {
            await gate;
            throw new Error("private-key");
        });
        const first = service.action("test-management", "retry");
        await Bun.sleep(5);
        await expect(new IntegrationManagementService(deps).action("test-management", "retry")).rejects.toThrow(
            "already running",
        );
        release();
        await expect(first).rejects.toThrow("unavailable");
        expect((await installations.get("test-management"))?.managementLease).toBeUndefined();
        deps.invoke = async () => ({ ok: true });
        expect(await service.action("test-management", "retry")).toEqual({ ok: true });
    });
    test("runtime sync failure keeps owned generated outputs available for retry and does not confirm", async () => {
        let confirm = false;
        const { service, secrets } = await fixture(
            async (_installation, _fn, payload) => {
                if (payload.operation === "confirm-apply") {
                    confirm = true;
                }
                return { values: { key: "value" }, savedRevision: "3", generatedSecrets: { signing: "retry-signing" } };
            },
            {
                syncRuntimeSecrets: async () => {
                    throw new Error("sync failed");
                },
            },
        );
        await expect(service.action("test-management", "apply-settings")).rejects.toThrow("sync failed");
        expect(confirm).toBe(false);
        expect(await secrets.get("MANAGED_SIGNING")).toBe("retry-signing");
    });
    test("expired invocation is fenced before generated writes or runtime synchronization", async () => {
        let time = new Date();
        let synchronized = false;
        const { service, secrets } = await fixture(
            async () => {
                time = new Date(time.getTime() + 61000);
                return {
                    values: { key: "value" },
                    savedRevision: "2",
                    generatedSecrets: { signing: "unauthorized-stale" },
                };
            },
            {
                now: () => time,
                syncRuntimeSecrets: async () => {
                    synchronized = true;
                },
            },
        );
        await expect(service.action("test-management", "apply-settings")).rejects.toThrow("fenced");
        expect(synchronized).toBe(false);
        expect(await secrets.get("MANAGED_SIGNING")).toBe("old-signing");
    });
});
