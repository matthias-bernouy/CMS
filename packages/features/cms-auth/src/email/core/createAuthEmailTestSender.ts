import { DefaultAuthEmailComposer } from "cms-auth/email/default-implementation/DefaultAuthEmailComposer";
import type { AuthEmailComposer } from "cms-auth/email/interfaces/AuthEmailComposer";
import type { Emailer } from "cms-auth/email/interfaces/Emailer";

export type AuthEmailTestSenderConfig = {
    emailer: Emailer;
    emailComposer?: AuthEmailComposer;
    emailVerificationUrl: string;
    passwordResetUrl: string;
    siteName?: string;
};

export function createAuthEmailTestSender(config: AuthEmailTestSenderConfig) {
    const composer = config.emailComposer ?? new DefaultAuthEmailComposer();
    return {
        async send(input: { kind: "email_verification" | "password_reset"; to: string }): Promise<void> {
            const base = input.kind === "email_verification" ? config.emailVerificationUrl : config.passwordResetUrl;
            await config.emailer.send(
                await composer.compose({
                    kind: input.kind,
                    to: { email: input.to, displayName: "Test Recipient" },
                    actionUrl: demoActionUrl(base),
                    token: "test-token",
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                    siteName: config.siteName,
                }),
            );
        },
    };
}

function demoActionUrl(base: string): string {
    try {
        const url = new URL(base);
        url.searchParams.set("token", "test-token");
        return url.toString();
    } catch {
        return `${base}${base.includes("?") ? "&" : "?"}token=test-token`;
    }
}
