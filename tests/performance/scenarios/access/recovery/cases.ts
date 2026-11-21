import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../harness/clients/session";
import { observedSmtp } from "../../../harness/services/smtp/evidence";
import { recoveryToken } from "../../email/smtp/message";
import { assertCondition, requireRecord } from "../../queries/types";
import { recoveryFixture } from "./fixture";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { settingsTenants } from "../../content/settings/tenant";
import type { QueryEnvironment } from "../../queries/execute";

export async function prepareRecovery(
    inventory: CapabilityInventory,
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    capability: string,
): Promise<PreparedSample> {
    const state = await recoveryFixture(lease, environment, capability);
    try {
        const requesting = capability.startsWith("request-");
        const resetting = capability.includes("password-reset");
        const input = requesting
            ? { email: state.email }
            : { token: state.token, ...(resetting ? { password: state.nextPassword } : {}) };
        const member = async () => {
            const result = await state.client("ulvia/cms.access", "get-user", "http", { sub: state.sub });
            assertCondition(result.observation.validated);
            return requireRecord(result.output);
        };
        const before = canonicalizeIJson(await member());
        // The challenge is still valid here. Refuse it on the other instance before consuming it locally.
        const foreign = await scenarioClient(inventory, environment.main)(
            "ulvia/cms.access",
            capability,
            "http",
            input,
            undefined,
            { httpCredentials: {} },
        );
        assertCondition(
            requesting
                ? foreign.observation.validated && requireRecord(foreign.output).sent === false
                : !foreign.observation.validated && foreign.observation.status === 422,
        );
        if (!requesting) {
            const invalid = await state.call(capability, { ...input, token: `auth_${"0".repeat(43)}` });
            assertCondition(!invalid.observation.validated && invalid.observation.status === 422);
            if (resetting) {
                const weak = await state.call(capability, { ...input, password: "        " });
                assertCondition(!weak.observation.validated && weak.observation.status === 422);
            }
        }
        assertCondition(canonicalizeIJson(await member()) === before);
        return {
            async send() {
                const send = async () =>
                    (
                        await state.call(capability, input, (output) => {
                            const row = requireRecord(output);
                            assertCondition(requesting ? row.sent === true : row.confirmed === true);
                        })
                    ).observation;
                return requesting ? observedSmtp(state.service.control, state.email, send) : send();
            },
            async verify() {
                let token = state.token;
                if (requesting) {
                    const mailbox = await state.service.control.mailbox(state.email);
                    assertCondition(mailbox.messages.length === 1 && mailbox.counts.requests === 1);
                    token = recoveryToken(
                        mailbox.messages[0]!.raw,
                        state.session.origin,
                        resetting ? "/reset-password" : "/confirm-email",
                    );
                    // An immediate repeat stays in the real five-minute cooldown and must not send again.
                    assertCondition((await state.checked(capability, { email: state.email })).sent === false);
                    assertCondition(
                        (await state.checked(capability, { email: `missing-${crypto.randomUUID()}@performance.test` }))
                            .sent === false,
                    );
                    assertCondition(
                        canonicalizeIJson(await state.service.control.mailbox(state.email)) ===
                            canonicalizeIJson(mailbox),
                    );
                    assertCondition(
                        (
                            await state.checked(resetting ? "confirm-password-reset" : "confirm-email-verification", {
                                token,
                                ...(resetting ? { password: state.nextPassword } : {}),
                            })
                        ).confirmed === true,
                    );
                }
                const confirmed = resetting ? "confirm-password-reset" : "confirm-email-verification";
                const replay = await state.call(confirmed, {
                    token,
                    ...(resetting ? { password: state.nextPassword } : {}),
                });
                assertCondition(!replay.observation.validated && replay.observation.status === 422);
                const session = await repositoryApi(state.session.origin).session(
                    state.email,
                    resetting ? state.nextPassword : state.password,
                );
                assertCondition(session.accountId === state.sub && session.administrator === false);
                if (resetting) {
                    const oldPassword = await state.call("login-password", {
                        email: state.email,
                        password: state.password,
                    });
                    assertCondition(!oldPassword.observation.validated && oldPassword.observation.status === 401);
                    assertCondition(state.prior);
                    const oldSession = await state.client("ulvia/cms.access", "resolve-actor", "http", {}, undefined, {
                        httpCredentials: { cookie: state.prior.cookie },
                    });
                    assertCondition(
                        oldSession.observation.validated && requireRecord(oldSession.output).state === "anonymous",
                    );
                }
                const retained = await member();
                assertCondition(retained.email === state.email && retained.administrator === false);
            },
            close: state.cleanup,
        };
    } catch (error) {
        await state.cleanup();
        throw error;
    }
}
