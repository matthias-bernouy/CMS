import { describe, expect, test } from "bun:test";
import { ProductionIntegrationMigrationRuntime } from "@bernouy/cms-integrations";
import { mountProductionSurfaces, type ProductionSurfaceRuntime } from "../../src/runtime/mountSurfaces";
import { surfaceMountFixtures, waitFor } from "./surfaceMountFixtures";

describe("production surface mounting", () => {
    test("waits for Control before wiring and starting both public surfaces", async () => {
        const events: string[] = [];
        const starts: Array<[string, number]> = [];
        const logs: string[] = [];
        const runners: FakeRunner[] = [];
        let repositoryConfig: Record<string, unknown> | undefined;
        let controlArguments: unknown[] = [];
        let deliveryConfig: Record<string, unknown> | undefined;
        let workerOptions: Record<string, unknown> | undefined;
        let finalizerStore: unknown;
        let flusherRecorder: unknown;
        let flushes = 0;
        let flusherStopped = false;
        let sitemapRefreshOptions: Record<string, unknown> | undefined;
        let sitemapRefreshStopped = false;
        const runNow = async () => ({ status: "succeeded" });
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

        class FakeRepository {
            constructor(config: Record<string, unknown>) {
                repositoryConfig = config;
                events.push("repository");
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
            Repository: FakeRepository,
            Control: FakeControl,
            Delivery: FakeDelivery,
            startWorkers(options: Record<string, unknown>) {
                workerOptions = options;
                events.push("workers");
                return { ready: Promise.resolve(), runNow, stop: async () => undefined };
            },
            startAnalyticsFinalizer(store: unknown) {
                finalizerStore = store;
                return {};
            },
            startEndpointPerformanceFlusher(recorder: unknown) {
                flusherRecorder = recorder;
                return {
                    async run() {
                        flushes++;
                    },
                    stop() {
                        flusherStopped = true;
                    },
                };
            },
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

        const mounting = mountProductionSurfaces(options as never, runtime);
        await waitFor(() => events.includes("control"));

        expect(events).toEqual(["workers", "runner:control", "control"]);
        expect(repositoryConfig).toBeUndefined();

        releaseControl();
        const mounted = await mounting;

        const controlConfig = controlArguments[3] as Record<string, unknown>;
        expect(controlArguments[0]).toBe(runners[0]);
        expect(controlArguments[1]).toBe(options.core.repo);
        expect(controlArguments[2]).toBe(options.authentication.auth);
        expect(controlConfig).toMatchObject({
            deliveryUrl: options.env.DELIVERY_PUBLIC_URL,
            integrationCatalog: options.integrations.integrationCatalog,
            integrationPackageResolver: options.integrations.integrationPackageResolver,
            integrationMigrationRuntime: expect.any(ProductionIntegrationMigrationRuntime),
            integrationConnectorBaselineAdopters: options.integrations.integrationConnectorBaselineAdopters,
            publicAuth: {
                marker: "public-auth",
                emailVerificationUrl: options.env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: options.env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
                allowSignup: false,
            },
            scheduledTriggers: { enabled: true, runNow },
            endpointPerformanceReports: options.features.endpointPerformanceReports,
            sourceTelemetry: expect.any(Object),
            sourceTrustedConnectorTarget: expect.any(Function),
        });
        expect(controlArguments[15]).toEqual({ local: options.authentication.auth });
        expect(controlConfig.editorDataSources).toBeUndefined();
        expect(repositoryConfig).toBeUndefined();

        expect(deliveryConfig).toMatchObject({
            runner: runners[1],
            repository: options.core.repo,
            sources: options.features.sources,
            sourceOverlays: options.features.sourceOverlays,
            sourceTelemetry: expect.any(Object),
            sourceTrustedConnectorTarget: expect.any(Function),
            analyticsVisitorSecret: options.analyticsVisitorSecret,
            analyticsSiteScope: options.env.DELIVERY_PUBLIC_URL,
            analyticsTrustProxy: false,
            analyticsTrustedProxyVerified: false,
            sitemapStore: options.core.sitemapStore,
            auth: {
                marker: "public-auth",
                emailVerificationUrl: options.env.CMS_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: options.env.CMS_AUTH_PASSWORD_RESET_URL,
            },
        });
        expect(deliveryConfig?.publicPageProviders).toBeUndefined();
        expect(workerOptions).toEqual({
            functions: options.features.functions,
            sources: options.features.deliverySources,
            deps: {
                resolveSecret: options.features.resolveSecret,
                identities: options.features.identities,
            },
            users: options.core.users,
            installations: options.features.integrationInstallations,
            triggers: options.features.triggers,
        });
        expect(finalizerStore).toBe(options.features.analytics);
        expect(flusherRecorder).toBe(options.features.endpointPerformanceRecorder);
        expect(sitemapRefreshOptions).toEqual({ reportError: expect.any(Function) });
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
        expect(flusherStopped).toBe(true);
        expect(sitemapRefreshStopped).toBe(true);
        expect(flushes).toBe(1);
        expect(events.slice(-2)).toEqual(["stop:control", "stop:delivery"]);
    });
});
