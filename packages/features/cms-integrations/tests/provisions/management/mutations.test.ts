import { endpointFixture } from "./support/endpoint";
import { describe, expect, test } from "bun:test";
import { IntegrationManagementService } from "@bernouy/cms-integrations";
import { fixture } from "./support/fixture";

describe("integration-owned source mutations", () => {
    test("the endpoint owns continuation, grants, runtime synchronization and acknowledgement", async () => {
        const phases: string[] = [];
        let sync: Record<string, string> = {};
        const { write, installations, secrets } = await endpointFixture(
            async ({ values, _cms }) => {
                expect(_cms.secretValues).toEqual({ key: "selected-private-value" });
                expect(JSON.stringify(_cms)).not.toContain("other-private-value");
                const phase = _cms.continuation?.phase ?? "persist";
                phases.push(phase);
                if (phase === "persist") {
                    return { values, _cms: { rememberSecrets: true, continue: { phase: "connect" } } };
                }
                if (phase === "connect") {
                    return {
                        values,
                        _cms: {
                            generatedSecrets: { signing: "new-signing" },
                            syncRuntime: true,
                            continue: { phase: "acknowledge" },
                        },
                    };
                }
                expect(sync.SIGNING_KEY).toBe("new-signing");
                expect(_cms.generatedSecretValues.signing).toBe("new-signing");
                return { values, savedRevision: "2", appliedRevision: "2" };
            },
            {
                syncRuntimeSecrets: async (_installation, values) => {
                    phases.push("sync");
                    sync = values;
                },
            },
        );
        const result = await write({ values: { key: "${SELECTED_KEY}" } });
        expect(result.status).toBe(200);
        expect(phases).toEqual(["persist", "connect", "sync", "acknowledge"]);
        expect(sync).toEqual({ API_KEY: "selected-private-value", SIGNING_KEY: "new-signing" });
        expect(JSON.stringify(result)).not.toContain("new-signing");
        expect(await secrets.get("SELECTED_KEY")).toBe("selected-private-value");
        expect(await installations.get("test-management")).toMatchObject({
            status: "success",
            managementSecretRefs: { key: "${SELECTED_KEY}" },
            secretRefs: { signing: "MANAGED_SIGNING" },
        });
        expect((await installations.get("test-management"))?.managementLease).toBeUndefined();
    });
    test("durable lease rejects another service and releases after failure", async () => {
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
    test("sync failure retains generated outputs for retry and never acknowledges success", async () => {
        let calls = 0;
        const { write, secrets } = await endpointFixture(
            () => {
                calls++;
                return {
                    values: { key: "value" },
                    _cms: {
                        generatedSecrets: { signing: "retry-signing" },
                        syncRuntime: true,
                        continue: { phase: "acknowledge" },
                    },
                };
            },
            {
                syncRuntimeSecrets: async () => {
                    throw new Error("sync failed");
                },
            },
        );
        await expect(write({ values: {} })).rejects.toThrow("synchronization failed");
        expect(calls).toBe(1);
        expect(await secrets.get("MANAGED_SIGNING")).toBe("retry-signing");
    });
    test("expired invocation is fenced before generated writes or synchronization", async () => {
        let time = new Date();
        let synchronized = false;
        const { write, secrets } = await endpointFixture(
            () => {
                time = new Date(time.getTime() + 61000);
                return { _cms: { generatedSecrets: { signing: "stale" }, syncRuntime: true } };
            },
            {
                now: () => time,
                syncRuntimeSecrets: async () => {
                    synchronized = true;
                },
            },
        );
        await expect(write({ values: {} })).rejects.toThrow("fenced");
        expect(synchronized).toBe(false);
        expect(await secrets.get("MANAGED_SIGNING")).toBe("old-signing");
    });
});
