import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

/**
 * Catches `InvalidParam` / `MissingParam` thrown by the secrets endpoints
 * and converts them to a structured `400` JSON response so the admin UI
 * can show a meaningful toast (`"Invalid key: must match /^[A-Z]/"`)
 * instead of a generic "save failed". Other errors propagate untouched
 * (the runner returns 500).
 */
export async function withValidationResponse(fn: () => Promise<Response>): Promise<Response> {
    try {
        return await fn();
    } catch (e) {
        if (e instanceof InvalidParam || e instanceof MissingParam) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }
        throw e;
    }
}
