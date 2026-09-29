import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { createCoreStores } from "../src/runtime/stores/core";
import { createFeatureStores } from "../src/runtime/stores/features";
import { readRuntimeEnv } from "../src/runtimeEnv";

describe("production runtime stores", () => {
    test("initializes feature stores without a Source repository", async () => {
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
        const stores = await createFeatureStores(db);

        expect(indexedCollections).toEqual(
            expect.arrayContaining([
                "cms_identity_aliases",
                "dashboardAssignments",
                "analytics_rollups",
                "analytics_hll_sketches",
                "analytics_referrer_buckets",
                "analytics_governance",
                "analytics_source_performance_rollups",
            ]),
        );
        expect(indexedCollections).not.toContain("sources");
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
});
