import { expect, test } from "bun:test";
import { recoveryWorkerConfiguration, recoveryWorkerProfile, RECOVERY_WORKER_LIMITS } from "./workerConfiguration";
import { runRecoveryWorker } from "./worker";

const stack = { id: "ulvia-mcp-1234abcd", providerName: "ulvia-mcp-1234abcd-provider" };
const valid = () => [
    {
        Name: `/${stack.providerName}`,
        Image: `sha256:${"a".repeat(64)}`,
        State: { Running: true, OOMKilled: false },
        HostConfig: { NetworkMode: stack.id },
        NetworkSettings: { Networks: { [stack.id]: {} } },
        Config: {
            Labels: { "io.ulvia.component": "provider" },
            Env: [
                "MONGO_URL=mongodb://mongo:27017/mcp_provider_control?retryWrites=false",
                "CMS_FILES_DIR=/var/lib/cms/files",
                "CMS_SESSION_SECRET=fixture-only-secret",
            ],
        },
    },
];

test("recovery workers require the exact live owned runtime, internal Mongo and unambiguous bounded private environment", () => {
    const details = valid();
    const configured = recoveryWorkerConfiguration(stack, details);
    expect(configured.image).toBe(details[0]!.Image);
    expect(configured.env).toContain("CMS_SESSION_SECRET=fixture-only-secret\n");
    const refuse = (change: (value: ReturnType<typeof valid>[number]) => void) => {
        const inspected = valid();
        change(inspected[0]!);
        expect(() => recoveryWorkerConfiguration(stack, inspected)).toThrow("recovery-worker-scope-refused");
    };
    refuse((row) => {
        row.Name = "/production-provider";
    });
    refuse((row) => {
        row.State.OOMKilled = true;
    });
    refuse((row) => {
        row.State.Running = false;
    });
    refuse((row) => {
        row.HostConfig.NetworkMode = "host";
    });
    refuse((row) => {
        row.NetworkSettings.Networks = {};
    });
    refuse((row) => {
        row.Image = "latest";
    });
    refuse((row) => {
        row.Config.Env[0] = "MONGO_URL=mongodb://external.example.com/control";
    });
    refuse((row) => {
        row.Config.Env.push("MONGO_URL=mongodb://external.example.com/control");
    });
    refuse((row) => {
        row.Config.Env.push("BAD=first\nSECOND=value");
    });
    refuse((row) => {
        row.Config.Env.push(`LARGE=${"x".repeat(64 * 1024)}`);
    });
    expect(() => recoveryWorkerConfiguration({ ...stack, id: "production" }, details)).toThrow();
    expect(() => recoveryWorkerConfiguration(stack, [])).toThrow();
});

test("recovery worker scope is refused before Docker access and its separate resource profile is reproducible", async () => {
    await expect(runRecoveryWorker({ id: "production", providerName: "production-provider" }, "")).rejects.toThrow(
        "recovery-worker-scope-refused",
    );
    await expect(runRecoveryWorker(stack, "x".repeat(96 * 1024 + 1))).rejects.toThrow("recovery-worker-scope-refused");
    const profile = await recoveryWorkerProfile();
    expect(profile).toMatchObject(RECOVERY_WORKER_LIMITS);
    expect(profile.programDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(await recoveryWorkerProfile()).toEqual(profile);
});
