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
            CMS_HTTP_CLIENT_ADDRESS_MODE: "trusted-proxy",
            CMS_HTTP_TRUSTED_PROXY_HOPS: 1,
        },
        core: {
            repo: token("repo"),
            cache: token("cache"),
            secrets: token("secrets"),
            sitemapStore: token("sitemap-store"),
            users: token("users"),
            identityProviders: token("identity-providers"),
            pats: token("pats"),
            credentials: token("credentials"),
            db: { databaseName: "cms-test" },
        },
        features: {
            identities: token("identities"),
        },
        authentication: {
            auth: token("auth"),
            createPublicAuth: (options: Record<string, unknown>) => ({ marker: "public-auth", ...options }),
            createControlEmailTest: () => ({ send: async () => undefined }),
        },
    };
}

export async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
        await Bun.sleep(1);
    }
}
