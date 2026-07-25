export function surfaceMountFixtures() {
    const token = (name: string) => ({ name });
    return {
        env: {
            CONTROL_PORT: 3100,
            DELIVERY_PORT: 3101,
            CONTROL_PUBLIC_URL: "https://admin.example.test",
            DELIVERY_PUBLIC_URL: "https://www.example.test",
            CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL: "https://admin.example.test/auth/verify-email",
            CMS_CONTROL_AUTH_PASSWORD_RESET_URL: "https://admin.example.test/auth/reset-password",
            CMS_AUTH_EMAIL_VERIFICATION_URL: "https://www.example.test/auth/confirm-email",
            CMS_AUTH_PASSWORD_RESET_URL: "https://www.example.test/auth/reset-password",
            CMS_FILES_DIR: "/data/files",
            CMS_INTEGRATION_PACKAGE_CACHE_DIR: "/data/integration-packages",
            ANALYTICS_TRUST_PROXY: false,
            ANALYTICS_TRUSTED_PROXY_VERIFIED: false,
            ENDPOINT_PERFORMANCE_ENABLED: true,
            SOURCE_TIMING_SAMPLE_RATE: 0.01,
            SOURCE_SLOW_REQUEST_THRESHOLD_MS: 1_000,
            CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED: true,
            CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED: true,
            CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED: true,
            CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
            CMS_HTTP_TRUSTED_PROXY_HOPS: 1,
        },
        analyticsVisitorSecret: "analytics-secret",
        core: {
            repo: token("repo"),
            cache: token("cache"),
            secrets: token("secrets"),
            filesMetadata: token("files-metadata"),
            filesBlob: token("files-blob"),
            variantStore: token("variant-store"),
            sourceImageCache: {
                name: "source-image-cache",
                async dispose() {},
            } as { name: string; dispose: () => Promise<void> } | null,
            users: token("users"),
            identityProviders: token("identity-providers"),
            pats: token("pats"),
            credentials: token("credentials"),
            roles: token("roles"),
            repositoryPackageDownloadRateLimit: token("repository-package-download-rate-limit"),
            db: { databaseName: "cms-test" },
        },
        features: {
            integrationInstallations: token("installations"),
            integrationConnectorProviders: token("connector-providers"),
            dashboards: token("dashboards"),
            relations: token("relations"),
            functions: token("functions"),
            triggers: token("triggers"),
            identities: token("identities"),
            sourceOverlays: token("source-overlays"),
            sources: token("sources"),
            deliverySources: token("delivery-sources"),
            analytics: token("analytics"),
            endpointPerformanceRecorder: token("endpoint-performance-recorder"),
            endpointPerformanceReports: token("endpoint-performance-reports"),
            resolveSecret: token("resolve-secret"),
        },
        integrations: {
            integrationRepositoryCatalog: token("repository-catalog"),
            integrationRepositoryPackages: token("repository-packages"),
            integrationCatalog: token("integration-catalog"),
            integrationPackageResolver: token("package-resolver"),
            integrationConnectorDeployers: [token("deployer")],
            integrationProvisioners: [token("provisioner")],
        },
        authentication: {
            auth: token("auth"),
            publicAuthBase: { marker: "public-auth" },
        },
    };
}

export async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
        await Bun.sleep(1);
    }
}
