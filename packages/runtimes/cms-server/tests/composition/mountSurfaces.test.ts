import { describe, expect, test } from "bun:test";
import { mountProductionSurfaces, type ProductionSurfaceRuntime } from "../../src/runtime/mountSurfaces";
import { surfaceMountFixtures, waitFor } from "./surfaceMountFixtures";

describe("production surface mounting", () => {
    test("mounts and stops production surfaces", async () => {
        const events: string[] = [];
        const starts: Array<[string, number]> = [];
        const logs: string[] = [];
        const runners: FakeRunner[] = [];
        let controlArguments: unknown[] = [];
        let deliveryConfig: Record<string, unknown> | undefined;
        let sitemapRefreshOptions: Record<string, unknown> | undefined;
        let sitemapRefreshStopped = false;
        let observationStarted = false;
        let observationStopped = false;
        let releaseControl!: () => void;
        const controlReady = new Promise<void>((resolve) => {
            releaseControl = resolve;
        });

        class FakeRunner {
            readonly name = runners.length === 0 ? "control" : "delivery";
            constructor() {
                runners.push(this);
                events.push(`runner:${this.name}`);
            }
            group(prefix: string, callback: (runner: unknown) => void): void {
                events.push(`group:${this.name}:${prefix}`);
                callback({ basePath: prefix, owner: this.name });
            }
            start(port: number): void {
                events.push(`start:${this.name}`);
                starts.push([this.name, port]);
            }

            async stopGracefully(): Promise<void> {
                events.push(`stop:${this.name}`);
            }
        }

        class FakeControl {
            readonly ready = controlReady;

            constructor(...args: unknown[]) {
                controlArguments = args;
                events.push("control");
            }
        }

        class FakeDelivery {
            constructor(config: Record<string, unknown>) {
                deliveryConfig = config;
                events.push("delivery");
            }
        }

        const runtime = {
            Runner: FakeRunner,
            Control: FakeControl,
            Delivery: FakeDelivery,
            startSitemapRefresh(_delivery: unknown, options: Record<string, unknown>) {
                sitemapRefreshOptions = options;
                return {
                    ready: Promise.resolve(null),
                    refresh: async () => null,
                    stop: async () => {
                        sitemapRefreshStopped = true;
                    },
                };
            },
            log(message: string) {
                logs.push(message);
            },
            reportError() {},
        } as unknown as ProductionSurfaceRuntime;
        const options = surfaceMountFixtures();
        const gateway = {
            siteId: "site:main",
            invoker: { invoke: async () => ({ requestId: "request", status: 200, kind: "success" as const }) },
            isAdministrator: async () => true,
            administrators: {
                canRevoke: async () => true,
                list: async () => [],
                set: async () => ({ enabled: true, revision: 1, bootstrap: false }),
            },
            observations: {
                start: () => {
                    observationStarted = true;
                },
                stop: async () => {
                    observationStopped = true;
                },
            },
        };

        const mounting = mountProductionSurfaces({ ...options, gateway } as never, runtime);
        await waitFor(() => events.includes("control"));

        expect(events).toEqual(["runner:control", "control"]);

        releaseControl();
        const mounted = await mounting;

        const controlConfig = controlArguments[3] as Record<string, unknown>;
        expect(controlArguments[0]).toBe(runners[0]);
        expect(controlArguments[1]).toBe(options.core.repo);
        expect(controlArguments[2]).toBe(options.authentication.auth);
        expect(controlConfig).toMatchObject({
            deliveryUrl: options.env.DELIVERY_PUBLIC_URL,
            capabilityGateway: {
                siteId: gateway.siteId,
                invoker: expect.objectContaining({ invoke: expect.any(Function) }),
            },
            publicAuth: {
                marker: "public-auth",
                emailVerificationUrl: options.env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: options.env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
                allowSignup: false,
            },
        });
        expect(controlArguments[12]).toEqual({ local: options.authentication.auth });

        expect(deliveryConfig).toMatchObject({
            runner: runners[1],
            repository: { getPublishedPage: expect.any(Function), resolvePublishedRoute: expect.any(Function) },
            capabilityGateway: {
                siteId: gateway.siteId,
                invoker: expect.objectContaining({ invoke: expect.any(Function) }),
            },
            sitemapStore: { get: expect.any(Function), put: expect.any(Function), delete: expect.any(Function) },
            auth: {
                marker: "public-auth",
                emailVerificationUrl: options.env.CMS_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: options.env.CMS_AUTH_PASSWORD_RESET_URL,
            },
        });
        expect(deliveryConfig?.publicPageProviders).toBeUndefined();
        expect(deliveryConfig?.repository).not.toBe(options.core.repo);
        expect(deliveryConfig?.repository).not.toHaveProperty("getAllPages");
        expect(deliveryConfig?.repository).not.toHaveProperty("updatePage");
        expect(deliveryConfig?.filesBlob).not.toBe(options.core.filesBlob);
        expect(Object.keys(deliveryConfig?.filesBlob as object)).toEqual(["get", "head"]);
        expect(Object.keys(deliveryConfig?.filesMetadata as object).sort()).toEqual(["getItem", "getItemByPath"]);
        expect(Object.keys(deliveryConfig?.variantStore as object).sort()).toEqual(["get", "head", "put"]);
        expect(deliveryConfig?.sitemapStore).not.toBe(options.core.sitemapStore);
        expect(sitemapRefreshOptions).toEqual({ reportError: expect.any(Function) });
        expect(observationStarted).toBe(true);
        expect(starts).toEqual([
            ["control", 3100],
            ["delivery", 3101],
        ]);
        expect(events.filter((event) => event.includes("group:"))).toEqual([]);
        expect(logs).toEqual([
            "🚀 CMS listening",
            "   admin:        https://admin.example.test/admin/",
            "   sign in:      https://admin.example.test/login",
            "   public site:  https://www.example.test/",
            "   storage:      mongo=cms-test, files=/data/files",
        ]);

        await mounted.stop();
        expect(sitemapRefreshStopped).toBe(true);
        expect(observationStopped).toBe(true);
        expect(events.slice(-2)).toEqual(["stop:control", "stop:delivery"]);
    });
});
