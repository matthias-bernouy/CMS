import { describe, expect, mock, test } from "bun:test";
import {
    InMemoryAuthTokenStore,
    InMemoryIdentityProviderRepository,
    InMemoryLocalCredentialStore,
    InMemoryPatRepository,
    InMemoryUsersRepository,
} from "@bernouy/cms-auth";
import {
    ConfiguredSupabaseConnectorBaselineAdopter,
    ConfiguredSupabaseConnectorDeployer,
    ConfiguredSupabaseConnectorMigrationAdapter,
    ConfiguredSupabaseFunctionMigrationHandler,
} from "@bernouy/cms-integrations/supabase";
import { FsIntegrationPackageCache, FsIntegrationPackageSource } from "@bernouy/cms-integration-packages/fs";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { StripeWebhookProvisioner } from "@bernouy/cms-integrations/stripe";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { createProductionAuth } from "../src/runtime/auth";
import { createProductionIntegrationServices } from "../src/runtime/integrations";
import { HttpRepositoryCompatibilityReader } from "../src/repositoryCatalog";
import type { CoreStores } from "../src/runtime/stores/core";
import { readRuntimeEnv } from "../src/runtimeEnv";

const runtimeEnv = () =>
    readRuntimeEnv({
        CONTROL_PUBLIC_URL: "https://admin.example.test",
        DELIVERY_PUBLIC_URL: "https://www.example.test",
        CMS_SESSION_SECRET: "session-secret-at-least-16-bytes",
        CMS_KEK_HEX: "00".repeat(32),
        CMS_ADMIN_EMAIL: "admin@example.test",
        CMS_ADMIN_PASSWORD: "Correct-Horse-Battery-Staple-42!",
        CMS_FILES_DIR: "/data/files",
        CMS_INTEGRATION_PACKAGE_CACHE_DIR: "/data/integration-packages",
        MONGO_URL: "mongodb://mongo:27017/cms",
        ANALYTICS_SALT_SECRET: "shared-analytics-secret",
    });

function authStores(): CoreStores {
    return {
        identityProviders: new InMemoryIdentityProviderRepository(),
        credentials: new InMemoryLocalCredentialStore(),
        users: new InMemoryUsersRepository<string>(),
        pats: new InMemoryPatRepository(),
        authTokens: new InMemoryAuthTokenStore(),
        rateLimit: new InMemoryRateLimiter({ limit: 8, windowSeconds: 300 }),
        repo: {
            getSystem: async () => ({
                email: {
                    enabled: false,
                    templates: {
                        emailVerification: { subject: "Verify {{siteName}}", html: "" },
                        passwordReset: { subject: "Reset {{siteName}}", html: "" },
                    },
                },
            }),
        },
        secrets: { get: async () => null },
    } as unknown as CoreStores;
}

describe("production runtime services", () => {
    test("bootstraps the local provider and first administrator", async () => {
        const stores = authStores();

        const authentication = await createProductionAuth(runtimeEnv(), stores);

        expect(await stores.identityProviders.get("local")).toMatchObject({
            id: "local",
            kind: "local",
            enabled: true,
        });
        expect(await stores.credentials.getByEmail("admin@example.test")).not.toBeNull();
        expect((await stores.users.list({ role: "admin" })).total).toBe(1);
        expect(authentication.publicAuthBase.credentials).toBe(stores.credentials);
        expect(authentication.publicAuthBase.users).toBe(stores.users);
        expect(await authentication.publicAuthBase.emailer.isEnabled()).toBe(false);
        expect(
            (
                await authentication.publicAuthBase.emailComposer.compose({
                    kind: "password_reset",
                    to: { email: "admin@example.test" },
                    actionUrl: "https://admin.example.test/auth/reset-password?token=test",
                    token: "test",
                    expiresAt: new Date("2026-07-22T12:00:00.000Z"),
                    siteName: "CmsCore",
                })
            ).subject,
        ).toBe("Reset CmsCore");
    });

    test("reports an invalid first-admin password as runtime configuration", async () => {
        await expect(
            createProductionAuth({ ...runtimeEnv(), CMS_ADMIN_PASSWORD: "short" }, authStores()),
        ).rejects.toThrow(/Invalid CMS_ADMIN_PASSWORD for first admin bootstrap/);
    });

    test("selects the remote catalog and forwards only allow-listed function secrets", async () => {
        const services = createProductionIntegrationServices({
            providerRepository: {} as never,
            secrets: {} as never,
            localRepositoryUrl: "http://127.0.0.1:3000/.cms/repository",
            packageCacheDir: "/data/integration-packages",
            environment: {
                P9R_INTEGRATION_REPOSITORY_URL: "  https://integrations.example.test/catalog  ",
                SMTP_HOST: " smtp.example.test ",
                SMTP_PASSWORD: " secret ",
                UNRELATED_SECRET: "must-not-leak",
            },
        });

        expect(services.integrationCatalog).toBeInstanceOf(HttpIntegrationDefinitionRepository);
        expect(services.integrationPackageSource).toBeInstanceOf(HttpIntegrationPackageSource);
        expect(services.repositoryReadMode).toBe("global");
        expect(services.repositoryUrl).toBe("https://integrations.example.test/catalog");
        expect(services.publicRepositoryCatalog).toBe(services.integrationCatalog);
        expect(services.publicRepositoryPackages).toBe(services.integrationPackageSource);
        expect(services.publicRepositoryCompatibility).toBeInstanceOf(HttpRepositoryCompatibilityReader);
        expect(services.integrationPackageCache).toBeInstanceOf(FsIntegrationPackageCache);
        expect(services.integrationPackageResolver).toBeInstanceOf(FsIntegrationPackageResolver);
        expect(services.integrationRepositoryPackages).toBeInstanceOf(FsIntegrationPackageSource);
        const embeddedPackage = await services.integrationRepositoryPackages.getPackage("commerce", "1.0.0");
        expect(embeddedPackage?.envelope).toMatchObject({
            kind: "commerce",
            version: "1.0.0",
            releaseNotes: "README.md",
        });
        expect(embeddedPackage?.digest).toMatch(/^[a-f0-9]{64}$/);
        expect((services.integrationCatalog as unknown as { baseUrl: string }).baseUrl).toBe(
            "https://integrations.example.test/catalog",
        );
        const deployer = services.integrationConnectorDeployers[0];
        expect(deployer).toBeInstanceOf(ConfiguredSupabaseConnectorDeployer);
        expect(services.integrationConnectorMigrationAdapters[0]).toBeInstanceOf(
            ConfiguredSupabaseConnectorMigrationAdapter,
        );
        expect(services.integrationFunctionMigrationHandler).toBeInstanceOf(ConfiguredSupabaseFunctionMigrationHandler);
        expect(services.integrationConnectorBaselineAdopters[0]).toBeInstanceOf(
            ConfiguredSupabaseConnectorBaselineAdopter,
        );
        expect(services.integrationProvisioners[0]).toBeInstanceOf(StripeWebhookProvisioner);
        expect(
            (
                deployer as unknown as {
                    config: { functionSecrets: Record<string, string> };
                }
            ).config.functionSecrets,
        ).toEqual({
            SMTP_HOST: "smtp.example.test",
            SMTP_PASSWORD: "secret",
        });
    });

    test("keeps embedded public reads on filesystem without recursing through loopback", async () => {
        const definitionFetch = mock(async () => {
            throw new Error("embedded public reads must not use loopback HTTP");
        });
        const packageFetch = mock(async () => {
            throw new Error("embedded public reads must not use loopback HTTP");
        });
        const services = createProductionIntegrationServices({
            providerRepository: {} as never,
            secrets: {} as never,
            localRepositoryUrl: "http://127.0.0.1:3001/.cms/repository",
            packageCacheDir: "/data/integration-packages",
            environment: {},
            definitionFetch: definitionFetch as unknown as typeof fetch,
            packageFetch: packageFetch as unknown as typeof fetch,
        });

        expect(services.repositoryReadMode).toBe("embedded");
        expect(services.repositoryUrl).toBe("http://127.0.0.1:3001/.cms/repository");
        expect(services.publicRepositoryCatalog).toBe(services.integrationRepositoryCatalog);
        expect(services.publicRepositoryPackages).toBe(services.integrationRepositoryPackages);
        expect(services.publicRepositoryCompatibility).toBeUndefined();
        expect((await services.publicRepositoryCatalog.list()).some(({ kind }) => kind === "commerce")).toBeTrue();
        expect(await services.publicRepositoryPackages.getPackage("commerce", "1.0.0")).not.toBeNull();
        expect(definitionFetch).not.toHaveBeenCalled();
        expect(packageFetch).not.toHaveBeenCalled();
    });
});
