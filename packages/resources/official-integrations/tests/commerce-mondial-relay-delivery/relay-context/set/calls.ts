import type { CapturedCall } from "../harness";

export function callSnapshot(call: CapturedCall) {
    return {
        method: call.method,
        path: call.url.pathname,
        query: Object.fromEntries(call.url.searchParams),
        body: call.body,
        userId: call.userId,
        accountUserId: call.accountUserId,
    };
}

export function paths(calls: Array<{ url: URL }>): string[] {
    return calls.map((call) => call.url.pathname);
}
