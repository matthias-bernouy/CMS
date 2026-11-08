const cms = new URL("../", import.meta.url);
const navigation = new AbortController();
window.addEventListener("pagehide", () => navigation.abort(), { once: true });

export async function request(path, method = "GET", input, operation = false) {
    const response = await fetch(new URL(`call/ulvia/${path}`, cms), {
        method,
        credentials: "same-origin",
        redirect: "error",
        signal: AbortSignal.any([navigation.signal, AbortSignal.timeout(120_000)]),
        headers: {
            accept: "application/json",
            "accept-language": "en",
            ...(input === undefined ? {} : { "content-type": "application/json" }),
            ...(operation ? { "idempotency-key": crypto.randomUUID() } : {}),
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(
            body.error?.output?.message ??
                body.error?.message ??
                body.message ??
                `The request could not be completed (${response.status}).`,
        );
        error.status = response.status;
        throw error;
    }
    return body;
}
export const setup = (path, method = "GET", input, operation = false) =>
    request(`cms.resources/initialization/${path}`, method, input, operation);
export const stopped = () => navigation.signal.aborted;
