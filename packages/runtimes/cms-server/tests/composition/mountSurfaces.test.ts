import { describe, expect, test } from "bun:test";
import { mountProductionSurfaces, type ProductionSurfaceRuntime } from "../../src/runtime/mountSurfaces";
import { surfaceMountFixtures } from "./surfaceMountFixtures";

describe("production surface mounting", () => {
    test("waits for Control before wiring and starting both public surfaces", async () => {
        const events: string[] = [];
        const starts: Array<[string, number]> = [];
        const logs: string[] = [];
        const runners: FakeRunner[] = [];
        const repositoryRunner = { basePath: "/.cms/repository" };
        let repositoryConfig: Record<string, unknown> | undefined;
        let controlArguments: unknown[] = [];
        let deliveryConfig: Record<string, unknown> | undefined;
        let workerOptions: Record<string, unknown> | undefined;
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
                events.push(`group:${prefix}`);
                callback(repositoryRunner);
            }

            start(port: number): void {
                events.push(`start:${this.name}`);
                starts.push([this.name, port]);
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
                return {};
            },
            log(message: string) {
                logs.push(message);
            },
        } as unknown as ProductionSurfaceRuntime;
        const options = surfaceMountFixtures();

        const mounting = mountProductionSurfaces(options as never, runtime);
        await Promise.resolve();

        expect(events).toEqual(["runner:control", "group:/.cms/repository", "repository", "control"]);
        expect(repositoryConfig).toEqual({
            runner: repositoryRunner,
            integrationCatalog: options.integrations.integrationRepositoryCatalog,
        });

        releaseControl();
        await mounting;

        const controlConfig = controlArguments[3] as Record<string, unknown>;
        expect(controlArguments[0]).toBe(runners[0]);
        expect(controlArguments[1]).toBe(options.core.repo);
        expect(controlArguments[2]).toBe(options.authentication.auth);
        expect(controlConfig).toMatchObject({
            deliveryUrl: options.env.DELIVERY_PUBLIC_URL,
            integrationCatalog: options.integrations.integrationCatalog,
            publicAuth: {
                marker: "public-auth",
                emailVerificationUrl: options.env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: options.env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
                allowSignup: false,
            },
        });
        expect(controlArguments[15]).toEqual({ local: options.authentication.auth });

        expect(deliveryConfig).toMatchObject({
            runner: runners[1],
            repository: options.core.repo,
            sources: options.features.deliverySources,
            analyticsSalt: options.analyticsSalt,
            auth: {
                marker: "public-auth",
                emailVerificationUrl: options.env.CMS_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: options.env.CMS_AUTH_PASSWORD_RESET_URL,
            },
        });
        expect(workerOptions).toEqual({
            functions: options.features.functions,
            sources: options.features.deliverySources,
            deps: {
                resolveSecret: options.features.resolveSecret,
                identities: options.features.identities,
            },
        });
        expect(starts).toEqual([
            ["control", 3100],
            ["delivery", 3101],
        ]);
        expect(logs).toEqual([
            "🚀 CMS listening",
            "   admin:        https://admin.example.test/admin/",
            "   sign in:      https://admin.example.test/login",
            "   public site:  https://www.example.test/",
            "   storage:      mongo=cms-test, files=/data/files",
        ]);
    });
});
