import { describe, expect, test } from "bun:test";
import {
    confirmEmailVerification,
    confirmPasswordReset,
    InMemoryAuthTokenStore,
    InMemoryEmailer,
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    requestEmailVerification,
    requestPasswordReset,
    signupLocalUser,
    type PublicAuthFlowConfig,
} from "@bernouy/cms-auth";
import { createLegalPolicy } from "./fixtures";

type Role = "user";

describe("signup legal acceptance forward-only saga", () => {
    test("resumes after an ambiguous proof acknowledgement without duplicating evidence", async () => {
        const legal = createLegalPolicy();
        const append = legal.store.append.bind(legal.store);
        let loseFirstAcknowledgement = true;
        legal.store.append = async (acceptance) => {
            await append(acceptance);
            if (loseFirstAcknowledgement) {
                loseFirstAcknowledgement = false;
                throw new Error("proof acknowledgement lost");
            }
        };
        const cfg = flowConfig(legal.policy);
        const accepted = [(await legal.policy.requirements()).documents[0]!.versionId];

        await expect(signupLocalUser(cfg, input("pending@x.com", "password-1", accepted))).rejects.toThrow(
            "proof acknowledgement lost",
        );
        const credential = await cfg.credentials.getByEmail("pending@x.com");
        expect(credential?.emailVerifiedAt).toBeNull();
        expect((await cfg.users.list()).users).toEqual([]);
        expect(await legal.store.listForUser(`local:${credential!.sub}`)).toHaveLength(1);

        const resumed = await signupLocalUser(cfg, input("pending@x.com", "password-1", accepted));
        expect(resumed.created).toBe(false);
        expect((await cfg.users.list()).users).toHaveLength(1);
        expect(await legal.store.listForUser(`local:${credential!.sub}`)).toHaveLength(1);
    });

    test("does not resume a pending credential with a wrong password", async () => {
        const legal = createLegalPolicy();
        legal.store.append = async () => {
            throw new Error("proof unavailable");
        };
        const cfg = flowConfig(legal.policy);
        const accepted = [(await legal.policy.requirements()).documents[0]!.versionId];

        await expect(signupLocalUser(cfg, input("wrong@x.com", "password-1", accepted))).rejects.toThrow(
            "proof unavailable",
        );
        legal.store.append = async () => {};
        await expect(signupLocalUser(cfg, input("wrong@x.com", "wrong-password", accepted))).resolves.toEqual({
            created: false,
            sent: false,
        });
        expect((await cfg.users.list()).users).toEqual([]);
    });

    test("never verifies or activates a delivery-off credential before durable proof", async () => {
        const legal = createLegalPolicy();
        const append = legal.store.append.bind(legal.store);
        legal.store.append = async () => {
            throw new Error("proof unavailable");
        };
        const cfg = flowConfig(legal.policy, disabledEmailer());
        const accepted = [(await legal.policy.requirements()).documents[0]!.versionId];

        await expect(signupLocalUser(cfg, input("offline@x.com", "password-1", accepted))).rejects.toThrow(
            "proof unavailable",
        );
        expect(await requestEmailVerification(cfg, { email: "offline@x.com" })).toEqual({ sent: false });
        expect(await requestPasswordReset(cfg, { email: "offline@x.com" })).toEqual({ sent: false });
        const expiresAt = new Date(Date.now() + 60_000);
        const verification = await cfg.tokens.create({
            purpose: "email_verification",
            sub: (await cfg.credentials.getByEmail("offline@x.com"))!.sub,
            expiresAt,
        });
        await expect(confirmEmailVerification(cfg, { token: verification.token })).rejects.toThrow(
            "invalid or expired",
        );
        const reset = await cfg.tokens.create({
            purpose: "password_reset",
            sub: (await cfg.credentials.getByEmail("offline@x.com"))!.sub,
            expiresAt,
        });
        await expect(confirmPasswordReset(cfg, { token: reset.token, password: "changed-password" })).rejects.toThrow(
            "invalid or expired",
        );
        expect(await cfg.credentials.verify("offline@x.com", "password-1")).toBeNull();
        expect((await cfg.users.list()).users).toEqual([]);

        legal.store.append = append;
        await signupLocalUser(cfg, input("offline@x.com", "password-1", accepted));
        expect(await cfg.credentials.verify("offline@x.com", "password-1")).not.toBeNull();
        expect((await cfg.users.list()).users).toHaveLength(1);
    });

    test("does not backfill an already active legacy membership", async () => {
        const cfg = flowConfig(undefined);
        await signupLocalUser(cfg, input("legacy@x.com", "password-1"));
        const legal = createLegalPolicy();
        cfg.signupLegalAcceptance = legal.policy;
        const accepted = [(await legal.policy.requirements()).documents[0]!.versionId];

        await signupLocalUser(cfg, input("legacy@x.com", "password-1", accepted));

        const [user] = (await cfg.users.list()).users;
        expect(await legal.store.listForUser(user!.sub)).toEqual([]);
    });
});

function flowConfig(
    signupLegalAcceptance: PublicAuthFlowConfig<Role>["signupLegalAcceptance"],
    emailer = new InMemoryEmailer(),
): PublicAuthFlowConfig<Role> {
    return {
        credentials: new InMemoryLocalCredentialStore(),
        users: new InMemoryUsersRepository<Role>(),
        tokens: new InMemoryAuthTokenStore(),
        emailer,
        defaultRole: "user",
        emailVerificationUrl: "https://example.test/verify",
        passwordResetUrl: "https://example.test/reset",
        signupLegalAcceptance,
    };
}

function disabledEmailer(): InMemoryEmailer {
    const emailer = new InMemoryEmailer();
    emailer.isEnabled = async () => false;
    return emailer;
}

function input(email: string, password: string, acceptedLegalDocumentVersionIds?: string[]) {
    return { email, password, acceptedLegalDocumentVersionIds };
}
