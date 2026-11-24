import {
    InMemoryAccountEventStore,
    InMemoryUsersRepository,
    InMemoryLocalCredentialStore,
    InMemoryAuthTokenStore,
} from "@bernouy/auth";
import type { AuthEmailComposeInput } from "@bernouy/auth";
import { InMemoryEmailer } from "@bernouy/email";
import type { PublicAuthFlowConfig } from "auth/application/core/public-flows/types";
import { testAccountComposer } from "../../email/fixture";
export function accountFixture(enabled: boolean | (() => boolean) = true) {
    let users!: InMemoryUsersRepository;
    const outbox = new InMemoryAccountEventStore(
        async (record) => {
            const user = await users.getBySub(record.intent.accountId);
            return user?.createdAt.toISOString() === record.intent.accountCreatedAt;
        },
        async (accountId) => {
            const user = await users.getBySub(accountId);
            return user
                ? { createdAt: user.createdAt.toISOString(), ...(user.email ? { email: user.email } : {}) }
                : null;
        },
    );
    const recording = { enabled: () => (typeof enabled === "function" ? enabled() : enabled) };
    users = new InMemoryUsersRepository({ events: outbox, recording });
    const credentials = new InMemoryLocalCredentialStore({ events: outbox, recording });
    const emailer = new InMemoryEmailer();
    const captured: AuthEmailComposeInput[] = [];
    const cfg: PublicAuthFlowConfig = {
        users,
        credentials,
        prepareEmailVerificationEvidence: async (id, createdAt, method) => ({
            method,
            accountCreatedAt: createdAt,
            accountRef: outbox.reference(id, createdAt),
        }),
        tokens: new InMemoryAuthTokenStore(),
        emailer,
        authEmailCooldownSeconds: 0,
        emailComposer: {
            compose: async (input) => {
                captured.push(input);
                return testAccountComposer.compose(input);
            },
        },
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
        revokeSessionsForSub: async () => {},
    };
    return {
        users,
        credentials,
        outbox,
        cfg,
        captured,
        emailer,
        records: () => outbox.due(25, Date.now()),
        signup: { email: "member@example.test", password: "Member-strong-password-123!" },
    };
}
