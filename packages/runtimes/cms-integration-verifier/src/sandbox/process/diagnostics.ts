export type RedactedErrorCause = Readonly<{ name: string; message: string }>;

export function redactedErrorEvent(event: string, error: unknown): string {
    const causes: RedactedErrorCause[] = [];
    let current = error;
    while (current instanceof Error && causes.length < 5) {
        causes.push({ name: current.name.slice(0, 80), message: redactedErrorMessage(current.message) });
        current = current.cause;
    }
    return JSON.stringify({ event, causes });
}

export function redactedErrorMessage(message: string): string {
    return message
        .replace(/\b(?:https?|postgres(?:ql)?|mongodb):\/\/[^\s"']+/giu, "[redacted-url]")
        .replace(/\b(?:bearer|password|secret|token)\s*[=:]\s*[^\s,"']+/giu, "[redacted-credential]")
        .replace(/\b[A-Za-z0-9_-]{48,}\b/gu, "[redacted-value]")
        .slice(0, 1_024);
}
