import {
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    LocalAuthentication,
    SignedCookieCodec,
    SubjectResolver,
    type PublicAuthRoutesConfig,
} from "@bernouy/cms-auth";

export function consentAuthHarness() {
    const users = new InMemoryUsersRepository<string>();
    const credentials = new InMemoryLocalCredentialStore();
    const emailer = new InMemoryEmailer();
    const auth: PublicAuthRoutesConfig<string> = {
        local: new LocalAuthentication<string>({
            providerId: "local",
            loginPagePath: "/login",
            logoutPath: "/.cms/auth/logout",
            credentials,
            resolver: new SubjectResolver(users, "user"),
            codec: new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes")),
            cookieName: "site-session",
        }),
        credentials,
        users,
        tokens: new InMemoryAuthTokenStore(),
        emailer,
        defaultRole: "user",
        emailVerificationUrl: "http://site.test/auth/verify-email",
        passwordResetUrl: "http://site.test/auth/reset-password",
        authEmailCooldownSeconds: 0,
    };
    return { auth, credentials, emailer, users };
}
