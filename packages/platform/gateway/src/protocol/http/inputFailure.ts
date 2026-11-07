import { SchemaValueError } from "@bernouy/ulvia-contracts/schema";
import { decodeRequestContext, REQUEST_CONTEXT_HEADER } from "./requestContext";
import { negotiateMessageLanguage } from "./messageLanguage";

/** Transport validation is separate from a capability's declared business failures. */
export function inputFailureResponse(
    request: Request,
    status: number,
    cause?: unknown,
    requestId?: string,
    trustedContext = false,
): Response {
    let preference = request.headers.get("accept-language");
    if (trustedContext) {
        try {
            const metadata = decodeRequestContext(request.headers.get(REQUEST_CONTEXT_HEADER));
            if (metadata) {
                preference = metadata.headers["accept-language"] ?? null;
            }
        } catch {
            preference = null;
        }
    }
    const language = negotiateMessageLanguage(preference);
    const path = schemaPath(cause);
    const message =
        status === 413
            ? language === "fr"
                ? "La requête dépasse la taille maximale autorisée."
                : "The request exceeds the maximum allowed size."
            : path
              ? language === "fr"
                  ? `Le champ « ${path} » ne respecte pas le format ou les limites attendus.`
                  : `Field “${path}” does not match the expected format or limits.`
              : language === "fr"
                ? "La requête est invalide. Vérifiez son format et les champs obligatoires."
                : "The request is invalid. Check its format and required fields.";
    const code = status === 413 ? "payload_too_large" : "invalid_input";
    const headers = new Headers({
        "cache-control": "private, no-store",
        "content-language": language,
        ...(requestId ? { "x-ulvia-request-id": requestId } : {}),
    });
    if (request.method === "HEAD") {
        headers.set("x-ulvia-error-code", code);
        return new Response(null, { status, headers });
    }
    return Response.json({ failure: { code, retryable: false, output: { message } } }, { status, headers });
}

function schemaPath(cause: unknown): string | undefined {
    for (let depth = 0; cause instanceof Error && depth < 4; depth++) {
        if (cause instanceof SchemaValueError) {
            return cause.path === "$"
                ? undefined
                : cause.path
                      .replace(/[\x00-\x1f\x7f]/gu, " ")
                      .slice(0, 256)
                      .toWellFormed();
        }
        cause = cause.cause;
    }
    return undefined;
}
