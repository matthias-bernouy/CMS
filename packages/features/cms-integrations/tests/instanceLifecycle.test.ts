import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstanceRepository,
    runIntegrationInstance,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { STRIPE_DEFINITION } from "./helpers";

describe("@bernouy/cms-integrations instance lifecycle", () => {
    test("does not persist a new instance when the first import fails", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();

        await expect(runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [STRIPE_DEFINITION],
            dto: { kind: "stripe", answers: { id: "stripe-main" }, options: {} },
        })).rejects.toThrow(/apiKey/);

        expect(await instances.get("stripe:stripe-main")).toBeNull();
    });

    test("reruns an instance with stored server-side secrets and force", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();

        await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [STRIPE_DEFINITION],
            dto: { kind: "stripe", answers: { id: "stripe-main", apiKey: "sk_test" }, options: {} },
        });

        const result = await runIntegrationInstance({
            mode: "rerun",
            deps: { sources, secrets },
            instances,
            instanceId: "stripe:stripe-main",
            body: {},
        });

        expect(result.artifacts).toEqual([{ type: "source", id: "urn:stripe-main", action: "updated" }]);
        expect(result.instance.runCount).toBe(2);
        expect(result.instance.runs.map(run => run.status)).toEqual(["success", "success"]);
        expect(JSON.stringify(result.instance)).not.toContain("sk_test");
    });

    test("records a failed rerun when answers try to change the identity", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const instances = new InMemoryIntegrationInstanceRepository();

        await runIntegrationInstance({
            mode: "create",
            deps: { sources, secrets },
            instances,
            siteIntegrations: [STRIPE_DEFINITION],
            dto: { kind: "stripe", answers: { id: "stripe-main", apiKey: "sk_test" }, options: {} },
        });

        await expect(runIntegrationInstance({
            mode: "rerun",
            deps: { sources, secrets },
            instances,
            instanceId: "stripe:stripe-main",
            body: { answers: { id: "stripe-other" } },
        })).rejects.toThrow(/cannot be changed/);

        const instance = await instances.get("stripe:stripe-main");
        expect(instance?.status).toBe("failed");
        expect(instance?.runCount).toBe(2);
        expect(instance?.runs.map(run => run.status)).toEqual(["success", "failed"]);
    });
});
