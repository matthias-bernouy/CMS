import { describe, expect, test } from "bun:test";
import { mountProductionKernel, type ProductionKernelRuntime } from "../../src/runtime/mountKernel";
import { kernelMountFixtures, waitFor } from "./kernelMountFixtures";

describe("production Kernel mounting", () => {
    test("mounts and stops one runtime", async () => {
        const events: string[] = [];
        const logs: string[] = [];
        let kernelConfig: Record<string, unknown> | undefined;
        let releaseReady!: () => void;
        const ready = new Promise<void>((resolve) => {
            releaseReady = resolve;
        });
        let refreshStopped = false;
        let observationStarted = false;
        let observationStopped = false;

        class FakeRunner {
            readonly basePath = "/";
            constructor() {
                events.push("runner");
            }
            start(options: unknown): void {
                events.push(`start:${JSON.stringify(options)}`);
            }
            async stopGracefully(): Promise<void> {
                events.push("stop");
            }
        }

        class FakeKernel {
            readonly ready = ready;
            constructor(config: Record<string, unknown>) {
                kernelConfig = config;
                events.push("kernel");
            }
        }

        const runtime = {
            Runner: FakeRunner,
            Kernel: FakeKernel,
            startSitemapRefresh() {
                return { stop: async () => void (refreshStopped = true) };
            },
            log(message: string) {
                logs.push(message);
            },
            reportError() {},
        } as unknown as ProductionKernelRuntime;
        const options = kernelMountFixtures();
        const gateway = {
            siteId: "site:main",
            invoker: { invoke: async () => ({ requestId: "request", status: 200, kind: "success" as const }) },
            isAdministrator: async () => true,
            observations: {
                start: () => void (observationStarted = true),
                stop: async () => void (observationStopped = true),
            },
        };

        const mounting = mountProductionKernel({ ...options, gateway } as never, runtime);
        await waitFor(() => events.includes("kernel"));
        expect(events).toEqual(["runner", "kernel"]);
        releaseReady();
        const mounted = await mounting;

        expect(kernelConfig).toMatchObject({
            repository: options.core.repo,
            runner: expect.any(FakeRunner),
            publicAuth: {
                marker: "public-auth",
                emailVerificationUrl: options.env.CMS_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: options.env.CMS_AUTH_PASSWORD_RESET_URL,
            },
            capabilityGateway: { siteId: gateway.siteId },
        });
        expect(events).toContain('start:{"port":3100,"hostname":"127.0.0.1"}');
        expect(observationStarted).toBe(true);
        expect(logs).toContain("🚀 CMS listening");

        await mounted.stop();
        expect(refreshStopped).toBe(true);
        expect(observationStopped).toBe(true);
        expect(events.at(-1)).toBe("stop");
    });
});
