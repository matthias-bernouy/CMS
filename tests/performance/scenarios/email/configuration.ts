import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import type { settingsTenants } from "../content/settings/tenant";
import type { PreparedSample } from "../../harness/execution/samples";
import type { QueryEnvironment } from "../queries/execute";

export function assertSmtpConfiguration(output: unknown, input: Readonly<Record<string, unknown>>) {
    const smtp = requireRecord(input.smtp);
    const expected = {
        ...input,
        smtp: {
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            username: smtp.username,
            passwordConfigured: true,
        },
    };
    assertCondition(canonicalizeIJson(output) === canonicalizeIJson(expected));
}

export async function prepareSmtpConfiguration(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
): Promise<PreparedSample> {
    const client = lease.value.client;
    const input = {
        enabled: false,
        fromEmail: "performance@example.test",
        fromName: `Performance ${randomUUID()}`,
        replyTo: "reply@example.test",
        smtp: { host: "performance-mail", port: 2525, secure: false, username: "performance", password: randomUUID() },
    };
    const read = async () => {
        const result = await client("ulvia/cms.emailer.smtp", "smtp.configuration.get", "http", {});
        assertCondition(result.observation.validated);
        return result.output;
    };
    return {
        async send() {
            return (
                await client("ulvia/cms.emailer.smtp", "smtp.configuration.update", "http", input, (output) =>
                    assertSmtpConfiguration(output, input),
                )
            ).observation;
        },
        async verify() {
            const stored = await read();
            assertSmtpConfiguration(stored, input);
            const invalid = await client("ulvia/cms.emailer.smtp", "smtp.configuration.update", "http", {
                ...input,
                enabled: true,
                fromEmail: "invalid",
            });
            assertCondition(!invalid.observation.validated && invalid.observation.status === 422);
            const foreign = await client(
                "ulvia/cms.emailer.smtp",
                "smtp.configuration.update",
                "http",
                input,
                undefined,
                { httpCredentials: { cookie: environment.main.cookie } },
            );
            assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
            assertCondition(canonicalizeIJson(await read()) === canonicalizeIJson(stored));
        },
        close: async () => lease.release(),
    };
}
