import { describe, expect, test } from "bun:test";
import { SourceOverlaySourceRepository } from "@bernouy/cms-sources";
import type { SecretStore } from "@bernouy/cms-secrets";
import type { Db } from "mongodb";
import {
    createCoreStores,
    createRepositoryPackageDownloadRateLimiter,
    createRuntimeSourceImageCache,
} from "../src/runtime/stores/core";
import { createFeatureStores } from "../src/runtime/stores/features";
import { readRuntimeEnv } from "../src/runtimeEnv";

describe("production runtime stores", () => {
    test("initializes every indexed feature repository before composing delivery sources", async () => {
        const indexedCollections: string[] = [];
        const db = {
            collection(name: string) {
                return {
                    async createIndex() {
                        indexedCollections.push(name);
                        return `${name}-index`;
                    },
                    async deleteMany() {
                        return { deletedCount: 0 };
                    },
                    async updateOne() {
                        return {};
                    },
                    async findOne() {
                        return null;
                    },
                };
            },
        } as unknown as Db;
        const secrets = { get: async () => null } as unknown as SecretStore;

        const stores = await createFeatureStores(db, secrets);

        expect(indexedCollections).toEqual(
            expect.arrayContaining([
                "sources",
                "sourceOverlays",
                "functions",
                "triggers",
                "cms_identity_aliases",
                "dashboards",
                "relations",
                "dashboard_relation_projections",
                "analytics_rollups",
                "analytics_hll_sketches",
                "analytics_referrer_buckets",
                "analytics_governance",
                "analytics_source_performance_rollups",
                "integrationInstallations",
            ]),
        );
        expect(stores.deliverySources).toBeInstanceOf(SourceOverlaySourceRepository);
        expect(typeof stores.resolveSecret).toBe("function");
        expect(stores.endpointPerformanceRecorder.stats()).toMatchObject({
            accepted: 0,
            dropped: 0,
            invalid: 0,
        });
    });

    test("rejects an invalid Mongo connection string before initializing stores", async () => {
        const env = readRuntimeEnv({
            CONTROL_PUBLIC_URL: "https://admin.example.test",
            DELIVERY_PUBLIC_URL: "https://www.example.test",
            CMS_SESSION_SECRET: "session-secret",
            CMS_KEK_HEX: "00".repeat(32),
            CMS_ADMIN_EMAIL: "admin@example.test",
            CMS_ADMIN_PASSWORD: "Correct-Horse-Battery-Staple-42!",
            CMS_FILES_DIR: "/data/files",
            MONGO_URL: "not-a-mongodb-url",
            ANALYTICS_SALT_SECRET: "shared-analytics-secret",
        });

        await expect(createCoreStores(env)).rejects.toThrow(/Invalid scheme/);
    });

    test("does not touch the derivative cache directory while transforms are disabled", async () => {
        const cache = await createRuntimeSourceImageCache({
            CMS_FILES_DIR: "/proc/cms-must-not-be-created",
            CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: false,
        });

        expect(cache).toBeNull();
    });

    test("uses a dedicated Mongo namespace for public package downloads", async () => {
        const collections: string[] = [];
        const db = {
            collection(name: string) {
                collections.push(name);
                return { createIndex: async () => `${name}-ttl` };
            },
        } as unknown as Db;

        await createRepositoryPackageDownloadRateLimiter(db, {
            CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT: 12,
            CMS_INTEGRATION_PACKAGE_DOWNLOAD_WINDOW_SECONDS: 90,
        });

        expect(collections).toEqual(["repository_package_download_rate_limits"]);
    });
});
