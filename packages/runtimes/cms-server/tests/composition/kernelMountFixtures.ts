export function kernelMountFixtures() {
    const token = (name: string) => ({ name });
    return {
        env: {
            MODE: "PROD" as const,
            KERNEL_PORT: 3100,
            KERNEL_HOST: "127.0.0.1",
            KERNEL_PUBLIC_URL: "https://www.example.test",
            CMS_AUTH_EMAIL_VERIFICATION_URL: "https://www.example.test/auth/confirm-email",
            CMS_AUTH_PASSWORD_RESET_URL: "https://www.example.test/auth/reset-password",
            CMS_FILES_DIR: "/data/files",
        },
        core: {
            repo: token("repo"),
            cache: token("cache"),
            sitemapStore: token("sitemap-store"),
            identityProviders: token("identity-providers"),
            collections: token("collections"),
            pageRoutes: token("page-routes"),
            collectionMigrations: token("collection-migrations"),
            db: { databaseName: "cms-test" },
        },
        authentication: {
            auth: token("auth"),
            createPublicAuth: (options: Record<string, unknown>) => ({ marker: "public-auth", ...options }),
            createEmailTest: () => ({ send: async () => undefined }),
        },
    };
}

export async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
        await Bun.sleep(1);
    }
}
