export function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    return input instanceof Request ? input : new Request(input, init);
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

export function filterValue(value: string | null): { operator: string; value: string } | null {
    if (!value) {
        return null;
    }
    const [operator, ...rest] = value.split(".");
    return { operator: operator ?? "", value: rest.join(".") };
}

export function same(a: unknown, b: unknown): boolean {
    return String(a) === String(b);
}
