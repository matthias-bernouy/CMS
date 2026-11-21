import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { CLUSTER_LOGS_CONTRACT_ID } from "@bernouy/observability/cluster/feature";
import { createProtectedProviderManagement } from "../../../src/runtime/gateway/protectedManagement";
import type { ProviderManagement } from "@bernouy/repository/providers/management";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import { fixture, operatorToken, input } from "./fixture";

test("Provider discovery offers only the cluster contract to the operator account and refuses other report credentials", async () => {
    const f = await fixture();
    const response = await f.report(operatorToken);
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.instanceId).toBe("instance:cluster-logs");
    expect(report.implementations.map((pin: { contractId: string }) => pin.contractId)).toEqual([
        CLUSTER_LOGS_CONTRACT_ID,
    ]);
    expect((await f.report("tenant-control-credential")).status).toBe(401);
    expect(f.reads()).toBe(0);
});
test("only the operator credential can read journals; untrusted identity headers grant nothing", async () => {
    const f = await fixture();
    for (const token of [null, "cms-administrator", "instance-control-token", "provider-delegation-token"]) {
        expect(
            (
                await f.call(token, input, {
                    "x-ulvia-system-service-id": "cluster-operator",
                    "x-ulvia-instance-id": "instance:cluster-logs",
                })
            ).status,
        ).toBe(401);
    }
    expect(f.reads()).toBe(0);
    const response = await f.call(operatorToken, input, { "x-ulvia-request-context": "malformed-untrusted-metadata" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
        items: [],
        partial: false,
        sources: [{ instanceId: "instance:tenant-a", status: "available" }],
    });
    expect(f.reads()).toBe(1);
    expect((await f.call(operatorToken, { ...input, json: "{}" })).status).toBe(400);
    expect(f.reads()).toBe(1);
});
test("operator concurrency is bounded across all queries and capacity is released after completion", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const f = await fixture(() => held);
    const pending = Array.from({ length: 4 }, () => f.call(operatorToken));
    try {
        for (let attempt = 0; f.reads() < 4 && attempt < 100; attempt++) {
            await Bun.sleep(1);
        }
        expect(f.reads()).toBe(4);
        const refused = await f.call(operatorToken);
        expect(refused.status).toBe(503);
        expect(refused.headers.get("retry-after")).toBe("1");
        expect(f.reads()).toBe(4);
    } finally {
        release();
        expect((await Promise.all(pending)).map((response) => response.status)).toEqual([200, 200, 200, 200]);
    }
    expect((await f.call(operatorToken)).status).toBe(200);
});
test("ordinary and Control plans never offer cluster logs; CMS registration refuses before service projection", async () => {
    const f = await fixture();
    for (const plan of [await f.system.current(), await f.system.control()]) {
        expect(plan.contracts.some(({ contractId }) => contractId === CLUSTER_LOGS_CONTRACT_ID)).toBe(false);
    }
    expect((await f.system.clusterLogs()).contracts.map(({ contractId }) => contractId)).toEqual([
        CLUSTER_LOGS_CONTRACT_ID,
    ]);
    const build = await loadOfficialFeatures();
    let projections = 0;
    const services = {
        get clusterLogs(): never {
            projections++;
            throw new Error("Must not project tenant services");
        },
    };
    for (const scope of [
        { siteId: "default", instanceId: "instance:tenant-a" },
        { siteId: "default", instanceId: "instance:control" },
    ]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        await expect(
            registerOfficialFeatures(
                dispatcher,
                services,
                build.implementations.filter((pin) => pin.contractId === CLUSTER_LOGS_CONTRACT_ID),
                { providerId: "ulvia/primary-provider", scope },
            ),
        ).rejects.toThrow("cannot be offered");
        dispatcher.seal([]);
    }
    expect(projections).toBe(0);
});
test("tenant selection mutations cannot introduce operator logs and perform no business reads or writes", async () => {
    let touched = false;
    const management = new Proxy({} as ProviderManagement, {
        get() {
            touched = true;
            throw new Error("Must refuse before management access");
        },
    });
    const protectedManagement = createProtectedProviderManagement(management, {} as ProviderInstanceRecord, {
        manifest: { providerId: "ulvia/primary-provider", version: "1.9.0", digest: "unused" },
        contracts: [],
    });
    await expect(
        protectedManagement.replaceSelections({
            expectedRevision: 1,
            selections: [
                {
                    installationId: "foreign",
                    contractId: CLUSTER_LOGS_CONTRACT_ID,
                    version: "1.0.0",
                    digest: `sha256:${"0".repeat(64)}`,
                },
            ],
        }),
    ).rejects.toThrow("cluster_logs_operator_only");
    expect(touched).toBe(false);
});
