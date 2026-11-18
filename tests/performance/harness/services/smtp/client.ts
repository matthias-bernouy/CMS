import { isolatedOrigin, responseBytes } from "../../transport/http";
import { ClientFailure } from "../../clients/failure";
import { syntheticMailbox, SMTP_MESSAGE_BYTES } from "./state";
import type { CapturedMail, SmtpCounts } from "./state";

export function smtpControl(origin: string, key: string) {
    isolatedOrigin(origin);
    const call = async (path: string, method: string, recipient: string) => {
        const response = await fetch(
            `${origin}${path}?${new URLSearchParams({ recipient: syntheticMailbox(recipient) })}`,
            {
                method,
                redirect: "error",
                signal: AbortSignal.timeout(10_000),
                headers: { authorization: `Bearer ${key}` },
            },
        );
        if (!response.ok) {
            await response.body?.cancel();
            throw new ClientFailure("fixture-smtp-control-refused");
        }
        return JSON.parse(new TextDecoder().decode(await responseBytes(response, 32 * 1024 ** 2)));
    };
    const counts = (value: SmtpCounts) => {
        if (
            !value ||
            ![value.requests, value.requestBytes, value.responseBytes].every(
                (entry) => Number.isSafeInteger(entry) && entry >= 0,
            )
        ) {
            throw new ClientFailure("fixture-smtp-counts-invalid");
        }
        return value;
    };
    return {
        async mailbox(recipient: string): Promise<Readonly<{ messages: readonly CapturedMail[]; counts: SmtpCounts }>> {
            const result = await call("/mailbox", "GET", recipient);
            counts(result.counts);
            if (
                !Array.isArray(result.messages) ||
                result.messages.length > 4 ||
                result.messages.some(
                    (row: CapturedMail) =>
                        !row ||
                        row.to !== recipient.toLowerCase() ||
                        typeof row.raw !== "string" ||
                        Buffer.byteLength(row.raw) > SMTP_MESSAGE_BYTES,
                )
            ) {
                throw new ClientFailure("fixture-smtp-mailbox-invalid");
            }
            return result;
        },
        async counts(recipient: string): Promise<SmtpCounts> {
            return counts(await call("/counts", "GET", recipient));
        },
        async remove(recipient: string) {
            await call("/mailbox", "DELETE", recipient);
        },
    };
}

export type SmtpControl = ReturnType<typeof smtpControl>;
export type SmtpService = Readonly<{
    control: SmtpControl;
    connection: Readonly<{ host: string; port: number; secure: false; username: string; password: string }>;
}>;
