import { describe, expect, test } from "bun:test";
import { SourceOverlaySourceRepository } from "@bernouy/cms-sources";
import type { SecretStore } from "@bernouy/cms-secrets";
import type { Db } from "mongodb";
import { createCoreStores } from "../src/runtime/stores/core";
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
                "analytics_seen",
                "integrationInstallations",
            ]),
        );
        expect(stores.deliverySources).toBeInstanceOf(SourceOverlaySourceRepository);
        expect(typeof stores.resolveSecret).toBe("function");
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
        });

        await expect(createCoreStores(env)).rejects.toThrow(/Invalid scheme/);
    });
});
