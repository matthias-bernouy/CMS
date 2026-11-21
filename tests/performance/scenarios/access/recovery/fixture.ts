import { repositoryApi } from "../../../../integration/instance/repository/client";
import { smtpLease } from "../../email/smtp/lease";
import { recoveryToken } from "../../email/smtp/message";
import { removeSignupChallenge } from "./store";
import { assertCondition, requireRecord } from "../../queries/types";
import { ClientFailure } from "../../../harness/clients/failure";
import type { settingsTenants } from "../../content/settings/tenant";
import type { QueryEnvironment } from "../../queries/execute";

export const RECOVERY_CAPABILITIES = [
    "request-email-verification",
    "confirm-email-verification",
    "request-password-reset",
    "confirm-password-reset",
] as const;

export async function recoveryFixture(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    capability: string,
) {
    const state = await smtpLease(lease, environment);
    const email = `recovery-${crypto.randomUUID()}@performance.test`;
    const password = `Original-${crypto.randomUUID()}!`;
    const nextPassword = `Replacement-${crypto.randomUUID()}!`;
    let sub: string | undefined;
    const call = (id: string, input: Readonly<Record<string, unknown>>, assert?: (output: unknown) => void) =>
        state.client("ulvia/cms.access", id, "http", input, assert, { httpCredentials: {} });
    const checked = async (id: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(id, input);
        if (!result.observation.validated) {
            throw new ClientFailure(`recovery-fixture-${id}-${result.observation.failure ?? "invalid-result"}`);
        }
        return requireRecord(result.output);
    };
    const lookup = async () => {
        const result = await state.client("ulvia/cms.access", "list-users", "http", {
            search: email,
            page: 1,
            limit: 2,
        });
        assertCondition(result.observation.validated);
        const users = requireRecord(result.output).users;
        assertCondition(Array.isArray(users));
        const owned = users.map(requireRecord).filter((row) => row.email === email);
        assertCondition(owned.length <= 1);
        return owned[0];
    };
    const cleanup = async () => {
        try {
            if (!sub) {
                const owned = await lookup();
                if (owned) {
                    assertCondition(typeof owned.sub === "string");
                    sub = owned.sub;
                }
            }
            if (sub) {
                const deleted = await state.client("ulvia/cms.access", "delete-user", "http", { sub });
                assertCondition(deleted.observation.validated && requireRecord(deleted.output).deleted === true);
            }
        } finally {
            try {
                await state.service.control.remove(email);
            } finally {
                await state.close();
            }
        }
    };
    try {
        assertCondition((await checked("signup", { email, password })).accepted === true);
        const member = await lookup();
        assertCondition(member && typeof member.sub === "string");
        sub = member.sub;
        const mailbox = await state.service.control.mailbox(email);
        assertCondition(mailbox.messages.length === 1);
        let token = recoveryToken(mailbox.messages[0]!.raw, state.session.origin, "/confirm-email");
        let prior: Awaited<ReturnType<ReturnType<typeof repositoryApi>["session"]>> | undefined;
        if (capability.includes("password-reset")) {
            assertCondition((await checked("confirm-email-verification", { token })).confirmed === true);
            prior = await repositoryApi(state.session.origin).session(email, password);
            assertCondition(prior.accountId === sub);
            await state.service.control.remove(email);
            if (capability === "confirm-password-reset") {
                assertCondition((await checked("request-password-reset", { email })).sent === true);
                const reset = await state.service.control.mailbox(email);
                assertCondition(reset.messages.length === 1);
                token = recoveryToken(reset.messages[0]!.raw, state.session.origin, "/reset-password");
            }
        } else if (capability === "request-email-verification") {
            await removeSignupChallenge(environment.stack.providerName, token);
            await state.service.control.remove(email);
        }
        return { ...state, email, password, nextPassword, sub, token, prior, call, checked, cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    }
}

export type RecoveryFixture = Awaited<ReturnType<typeof recoveryFixture>>;
