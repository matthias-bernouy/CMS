import type { StorageProvider } from "../../exports/StorageProvider";
import type { AdminErrorCode } from "../../interfaces/wire/AdminResponse";

type AdminHandler<T> = (req: Request, provider: StorageProvider) => Promise<T>;

/**
 * Wraps an admin endpoint so its successful return value is enveloped as
 * `{ ok: true, data }` and any thrown error is mapped to an `AdminErrorCode`
 * with the matching HTTP status. Until the core throws typed errors, the
 * code is inferred heuristically from the message.
 */
export function wrapAdmin<T>(handler: AdminHandler<T>): (req: Request, provider: StorageProvider) => Promise<Response> {
    return async (req, provider) => {
        try {
            const data = await handler(req, provider);
            return Response.json({ ok: true, data }, { status: 200 });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const code = mapErrorCode(err, message);
            return Response.json({ ok: false, error: { code, message } }, { status: HTTP_STATUS[code] });
        }
    };
}

function mapErrorCode(err: unknown, message: string): AdminErrorCode {
    if (err instanceof TypeError) return "validation_error";
    if (/not found/i.test(message)) return "not_found";
    if (/already taken|already exists|conflict/i.test(message)) return "conflict";
    if (/must be|invalid|cannot|too long|too short|out of range|reserved name|forbidden/i.test(message)) return "validation_error";
    return "unknown";
}

const HTTP_STATUS: Record<AdminErrorCode, number> = {
    not_found:        404,
    unauthorized:     401,
    forbidden:        403,
    conflict:         409,
    validation_error: 400,
    unknown:          500,
};
