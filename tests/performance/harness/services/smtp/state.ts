export const SMTP_MESSAGE_BYTES = 4 * 1024 ** 2;
const MAILBOX_BYTES = 16 * 1024 ** 2;
export type SmtpCounts = Readonly<{ requests: number; requestBytes: number; responseBytes: number }>;
export type CapturedMail = Readonly<{ from: string; to: string; raw: string }>;

export function syntheticMailbox(value: string) {
    if (value.length > 320 || !/^[a-zA-Z0-9.+_-]+@performance\.test$/u.test(value)) {
        throw new Error("SMTP fixture accepts synthetic recipients only");
    }
    return value.toLowerCase();
}

/** A private in-memory sink: no relay, disk spool, message log or unbounded payload retention. */
export function smtpState() {
    const mailboxes = new Map<string, { messages: CapturedMail[]; counts: SmtpCounts; bytes: number }>();
    let totalBytes = 0;
    const empty = () => ({ requests: 0, requestBytes: 0, responseBytes: 0 });
    return {
        accept(message: CapturedMail, requestBytes: number, responseBytes: number) {
            const from = syntheticMailbox(message.from);
            const to = syntheticMailbox(message.to);
            const bytes = Buffer.byteLength(message.raw);
            const current = mailboxes.get(to) ?? { messages: [], counts: empty(), bytes: 0 };
            if (
                bytes > SMTP_MESSAGE_BYTES ||
                totalBytes + bytes > MAILBOX_BYTES ||
                current.messages.length >= 4 ||
                (!mailboxes.has(to) && mailboxes.size >= 512) ||
                ![requestBytes, responseBytes].every((value) => Number.isSafeInteger(value) && value > 0)
            ) {
                throw new Error("SMTP fixture retention bound exceeded");
            }
            current.messages.push({ from, to, raw: message.raw });
            current.bytes += bytes;
            totalBytes += bytes;
            current.counts = {
                requests: current.counts.requests + 1,
                requestBytes: current.counts.requestBytes + requestBytes,
                responseBytes: current.counts.responseBytes + responseBytes,
            };
            mailboxes.set(to, current);
        },
        read(recipient: string) {
            const current = mailboxes.get(syntheticMailbox(recipient));
            return { messages: current?.messages.slice() ?? [], counts: { ...(current?.counts ?? empty()) } };
        },
        remove(recipient: string) {
            const key = syntheticMailbox(recipient);
            totalBytes -= mailboxes.get(key)?.bytes ?? 0;
            mailboxes.delete(key);
        },
    };
}

export type SmtpState = ReturnType<typeof smtpState>;
