import { describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPOSITORY_CATALOG_EDITOR_DATA_SOURCE } from "@bernouy/cms-repository/catalog";
import { HttpRepositoryCatalogReader } from "../../src/repositoryCatalog";
import type { SourceEndpoint, SourceEndpointInterceptor } from "@bernouy/cms-sources";
import { mountProductionSurfaces, type ProductionSurfaceRuntime } from "../../src/runtime/mountSurfaces";
import { surfaceMountFixtures } from "./surfaceMountFixtures";

type CapturedSurfaces = {
    control?: Record<string, unknown>;
    delivery?: Record<string, unknown>;
    repository?: Record<string, unknown>;
};

function capturingRuntime(captured: CapturedSurfaces): ProductionSurfaceRuntime {
    class FakeRunner {
        readonly basePath = "/";

        group(_prefix: string, callback: (runner: FakeRunner) => void): void {
            callback(this);
        }

        start(): void {}

        async stopGracefully(): Promise<void> {}
    }

    return {
        Runner: FakeRunner,
        Repository: class {
            constructor(config: Record<string, unknown>) {
                captured.repository = config;
            }
        },
        Control: class {
            readonly ready = Promise.resolve();

            constructor(_runner: unknown, _repository: unknown, _auth: unknown, config: Record<string, unknown>) {
                captured.control = config;
            }
        },
        Delivery: class {
            constructor(config: Record<string, unknown>) {
                captured.delivery = config;
            }
        },
        startWorkers: () => ({
            ready: Promise.resolve(),
            runNow: async () => ({ status: "succeeded" as const }),
            stop: async () => undefined,
        }),
        startAnalyticsFinalizer: () => ({}),
        startEndpointPerformanceFlusher: () => ({
            stop() {},
            async run() {},
        }),
        log() {},
        reportError() {},
    } as unknown as ProductionSurfaceRuntime;
}

describe("production image rollout composition", () => {
    test("enables private management and the public catalog API only for the configured management CMS", async () => {
        const root = await mkdtemp(join(tmpdir(), "cms-management-surface-"));
        try {
            const tokenFile = join(root, "token");
            await writeFile(tokenFile, "private-service-token", { mode: 0o600 });
            const options = surfaceMountFixtures();
            options.env.repositoryManagement = {
                url: "http://cms-repository:3000/.cms/repository-management",
                tokenFile,
                administratorSubjectIdentifier: "opaque-admin-subject",
                timeoutMs: 5_000,
            };
            options.integrations.repositoryUrl = "http://cms-repository:3001/.cms/repository";
            const captured: CapturedSurfaces = {};

            const mounted = await mountProductionSurfaces(options as never, capturingRuntime(captured));

            expect(captured.control?.repositoryManagement).toMatchObject({
                administratorSubjectIdentifier: "opaque-admin-subject",
                gateway: expect.any(Object),
            });
            expect(captured.control?.editorDataSources).toEqual([REPOSITORY_CATALOG_EDITOR_DATA_SOURCE]);
            expect(captured.repository?.repositoryCatalog).toBeInstanceOf(HttpRepositoryCatalogReader);
            expect(captured.delivery?.publicPageProviders).toBeUndefined();
            await mounted.stop();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test.each([
        ["dark", false, false, false, false, false],
        ["transform only", true, false, false, false, false],
        ["invalid markup-only state", false, true, true, false, false],
        ["public markup", true, true, false, true, false],
        ["private markup", true, false, true, false, true],
        ["fully enabled", true, true, true, true, true],
    ] as const)(
        "injects the safe %s Source image capabilities into both surfaces",
        async (_label, transformsEnabled, publicRequested, privateRequested, publicEnabled, privateEnabled) => {
            const options = surfaceMountFixtures();
            let cacheDisposals = 0;
            options.env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED = transformsEnabled;
            options.env.CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED = publicRequested;
            options.env.CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED = privateRequested;
            if (!transformsEnabled) {
                options.core.sourceImageCache = null;
            } else {
                options.core.sourceImageCache!.dispose = async () => {
                    cacheDisposals++;
                };
            }
            const captured: CapturedSurfaces = {};

            const mounted = await mountProductionSurfaces(options as never, capturingRuntime(captured));

            const controlInterceptor = captured.control?.sourceImageInterceptor;
            const deliveryInterceptor = captured.delivery?.sourceImageInterceptor;
            expect(typeof controlInterceptor).toBe("function");
            expect(controlInterceptor).toBe(deliveryInterceptor);
            expect(captured.control?.responsivePublicSourceImagesEnabled).toBe(publicEnabled);
            expect(captured.delivery?.responsivePublicSourceImagesEnabled).toBe(publicEnabled);
            expect(captured.control?.responsivePrivateSourceImagesEnabled).toBe(privateEnabled);
            expect(captured.delivery?.responsivePrivateSourceImagesEnabled).toBe(privateEnabled);

            if (!transformsEnabled) {
                const next = mock(
                    async () =>
                        new Response(new Uint8Array([1, 2, 3]), {
                            headers: { "content-type": "image/jpeg" },
                        }),
                );
                const response = await (controlInterceptor as SourceEndpointInterceptor)(
                    staleImageEndpoint(),
                    new Request("https://cms.test/.cms/sources/commerce/image?id=42&cms-width=384"),
                    next,
                );
                expect(response.status).toBe(503);
                expect(response.headers.get("cache-control")).toBe("no-store");
                expect(next).toHaveBeenCalledTimes(0);
            }

            await mounted.stop();
            expect(cacheDisposals).toBe(transformsEnabled ? 1 : 0);
        },
    );
});

function staleImageEndpoint(): SourceEndpoint {
    return {
        urn: "urn:commerce:publicOfferImage",
        method: "GET",
        targetUrl: "https://connector.test/image",
        access: { mode: "public" },
        responseKind: "file",
        mediaType: "image/*",
        output: [{ status: "200" }],
    };
}
