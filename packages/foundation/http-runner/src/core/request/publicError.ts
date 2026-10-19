const PUBLIC_CODE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const PUBLIC_FIELD = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/u;
const MAX_PUBLIC_MESSAGE_LENGTH = 512;

export type PublicHttpErrorOptions = Readonly<{
    code?: string;
    field?: string;
    cause?: unknown;
}>;

export type PublicHttpErrorDetails = Readonly<{
    status: number;
    message: string;
    code?: string;
    field?: string;
}>;

/** An HTTP failure whose bounded message is explicitly safe to return to callers. */
export class PublicHttpError extends Error {
    readonly publicMessage: string;
    readonly publicCode?: string;
    readonly field?: string;

    constructor(
        readonly status: number,
        message: string,
        options: PublicHttpErrorOptions = {},
    ) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        assertStatus(status);
        assertMessage(message);
        if (options.code !== undefined && !PUBLIC_CODE.test(options.code)) {
            throw new TypeError("Public HTTP error code must be a stable lowercase identifier");
        }
        if (options.field !== undefined && !PUBLIC_FIELD.test(options.field)) {
            throw new TypeError("Public HTTP error field is invalid");
        }
        this.name = "PublicHttpError";
        this.publicMessage = message;
        this.publicCode = options.code;
        this.field = options.field;
    }
}

export function publicHttpErrorDetails(error: unknown): PublicHttpErrorDetails | undefined {
    if (!error || typeof error !== "object") {
        return undefined;
    }
    const candidate = error as Record<string, unknown>;
    if (
        !validStatus(candidate.status) ||
        typeof candidate.publicMessage !== "string" ||
        !validMessage(candidate.publicMessage)
    ) {
        return undefined;
    }
    const code =
        typeof candidate.publicCode === "string" && PUBLIC_CODE.test(candidate.publicCode)
            ? candidate.publicCode
            : undefined;
    const field =
        typeof candidate.field === "string" && PUBLIC_FIELD.test(candidate.field) ? candidate.field : undefined;
    return Object.freeze({
        status: candidate.status,
        message: candidate.publicMessage,
        ...(code ? { code } : {}),
        ...(field ? { field } : {}),
    });
}

function assertStatus(status: number): void {
    if (!validStatus(status)) {
        throw new RangeError("Public HTTP error status must be an integer from 400 through 599");
    }
}

function validStatus(status: unknown): status is number {
    return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599;
}

function assertMessage(message: string): void {
    if (!validMessage(message)) {
        throw new TypeError(`Public HTTP error message must contain 1-${MAX_PUBLIC_MESSAGE_LENGTH} characters`);
    }
}

function validMessage(message: string): boolean {
    return message.length > 0 && message.length <= MAX_PUBLIC_MESSAGE_LENGTH && message.trim() === message;
}
