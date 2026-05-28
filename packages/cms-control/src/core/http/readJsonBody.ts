import InvalidParam from 'src/control/errors/Http/InvalidParam';

/**
 * Parse the request body as JSON. Returns a guaranteed-object value; throws
 * `InvalidParam("body")` for malformed JSON or non-object roots. Endpoints
 * can then destructure fields without re-checking the wrapper type.
 */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new InvalidParam('body', 'JSON object expected.');
    }
    return body as Record<string, unknown>;
}
