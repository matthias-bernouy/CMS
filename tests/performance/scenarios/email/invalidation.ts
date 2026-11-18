import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../queries/types";
import { assertSmtpConfiguration } from "./configuration";
import type { settingsTenants } from "../content/settings/tenant";
import type { QueryEnvironment } from "../queries/execute";
import type { PreparedSample } from "../../harness/execution/samples";

/** Prime the old public configuration, replace it through the real command, then measure the first new read. */
export async function prepareSmtpInvalidation(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
): Promise<PreparedSample> {
    const client = lease.value.client;
    const contract = "ulvia/cms.emailer.smtp";
    const first = {
        enabled: false,
        fromEmail: "before@performance.test",
        fromName: `Before ${crypto.randomUUID()}`,
        replyTo: "",
        smtp: {
            host: "before.performance.test",
            port: 2525,
            secure: false,
            username: "before",
            password: crypto.randomUUID(),
        },
    };
    const next = {
        enabled: false,
        fromEmail: "after@performance.test",
        fromName: `After ${crypto.randomUUID()}`,
        replyTo: "reply@performance.test",
        smtp: {
            host: "after.performance.test",
            port: 2526,
            secure: false,
            username: "after",
            password: crypto.randomUUID(),
        },
    };
    const read = () => client(contract, "smtp.configuration.get", "http", {});
    const update = (input: typeof first) =>
        client(contract, "smtp.configuration.update", "http", input, (output) =>
            assertSmtpConfiguration(output, input),
        );
    try {
        assertCondition((await update(first)).observation.validated);
        const primed = await read();
        assertCondition(primed.observation.validated);
        assertSmtpConfiguration(primed.output, first);
        assertCondition((await update(next)).observation.validated);
        let observed: unknown;
        return {
            async send() {
                return (
                    await client(contract, "smtp.configuration.get", "http", {}, (output) => {
                        assertSmtpConfiguration(output, next);
                        assertCondition(canonicalizeIJson(output) !== canonicalizeIJson(primed.output));
                        observed = output;
                    })
                ).observation;
            },
            async verify() {
                const refused = await client(contract, "smtp.configuration.update", "http", next, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                });
                assertCondition(!refused.observation.validated && [401, 403].includes(refused.observation.status));
                const malformed = await client(contract, "smtp.configuration.update", "http", {
                    ...next,
                    enabled: true,
                    fromEmail: "invalid",
                });
                assertCondition(!malformed.observation.validated && malformed.observation.status === 422);
                const saved = await read();
                assertCondition(
                    saved.observation.validated && canonicalizeIJson(saved.output) === canonicalizeIJson(observed),
                );
            },
            close: async () => lease.release(),
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}
