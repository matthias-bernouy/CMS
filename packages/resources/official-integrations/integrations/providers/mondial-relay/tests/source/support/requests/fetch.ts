import type { ObservedFetchRequest } from "../runtime.ts";

export function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    if (input instanceof Request && !init) {
        return input;
    }
    return new Request(input instanceof Request ? input.url : String(input), {
        method: init?.method ?? (input instanceof Request ? input.method : undefined),
        headers: init?.headers ?? (input instanceof Request ? input.headers : undefined),
        body: init?.body ?? (input instanceof Request ? input.body : undefined),
        redirect: init?.redirect,
    });
}

export function observeFetchRequest(
    request: Request,
    url: URL,
    method: string,
    requestBody: string,
): ObservedFetchRequest {
    const observed: ObservedFetchRequest = {
        method,
        url: request.url,
        pathname: url.pathname,
        searchParams: Object.fromEntries(url.searchParams),
    };
    if (!requestBody) {
        return observed;
    }
    try {
        observed.body = JSON.parse(requestBody) as unknown;
    } catch {
        observed.body = requestBody;
    }
    return observed;
}
