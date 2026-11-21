import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { observedSmtp } from "../../../harness/services/smtp/evidence";
import { ClientFailure } from "../../../harness/clients/failure";
import { assertCondition, requireRecord } from "../../queries/types";
import { capturedMessage } from "./message";
import { smtpLease } from "./lease";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { settingsTenants } from "../../content/settings/tenant";
import type { QueryEnvironment } from "../../queries/execute";
import type { Variant } from "../../../capabilities/types";

export async function prepareEmailDelivery(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    variant: Variant,
): Promise<PreparedSample> {
    const state = await smtpLease(lease, environment);
    const recipient = `recipient-${crypto.randomUUID()}@performance.test`;
    try {
        const marker = crypto.randomUUID();
        const input = {
            toEmail: recipient,
            toName: "Performance recipient",
            subject: `Performance ${marker}`,
            text: `Complete message ${marker}\n.second line${variant === "large" ? "\n" + "x".repeat(256 * 1024) : ""}`,
            html: `<p>Complete message ${marker}</p>`,
        };
        const key = crypto.randomUUID();
        const send = (value = input, options = { idempotencyKey: key }) =>
            state.client(
                "ulvia/cms.emailer.smtp",
                "emailer.send",
                "http",
                value,
                (output) => assertCondition(requireRecord(output).sent === true),
                options,
            );
        return {
            async send() {
                return observedSmtp(state.service.control, recipient, async () => (await send()).observation);
            },
            async verify() {
                const received = await state.service.control.mailbox(recipient);
                assertCondition(received.messages.length === 1 && received.counts.requests === 1);
                const mail = received.messages[0]!;
                const message = capturedMessage(mail.raw);
                assertCondition(mail.from === "sender@performance.test" && mail.to === recipient);
                assertCondition(
                    message.headers.subject === input.subject &&
                        message.headers["reply-to"] === "reply@performance.test",
                );
                assertCondition(message.text === input.text || message.text === input.text + "\n");
                assertCondition(message.html === input.html || message.html === input.html + "\n");
                const before = canonicalizeIJson(received);
                const replay = await send();
                if (!replay.observation.validated) {
                    throw new ClientFailure(`smtp-keyed-replay-${replay.observation.failure ?? "invalid-result"}`);
                }
                if (canonicalizeIJson(await state.service.control.mailbox(recipient)) !== before) {
                    throw new ClientFailure("smtp-keyed-replay-changed-mailbox");
                }
                const invalid = await send({ ...input, subject: "   " }, { idempotencyKey: crypto.randomUUID() });
                assertCondition(!invalid.observation.validated && invalid.observation.status === 422);
                const foreign = await state.client("ulvia/cms.emailer.smtp", "emailer.send", "http", input, undefined, {
                    httpCredentials: { cookie: environment.main.cookie },
                    idempotencyKey: crypto.randomUUID(),
                });
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                await state.configure(false);
                const disabled = await send(input, { idempotencyKey: crypto.randomUUID() });
                assertCondition(!disabled.observation.validated && disabled.observation.status === 409);
                assertCondition(canonicalizeIJson(await state.service.control.mailbox(recipient)) === before);
            },
            async close() {
                try {
                    await state.service.control.remove(recipient);
                } finally {
                    await state.close();
                }
            },
        };
    } catch (error) {
        await state.close();
        throw error;
    }
}
