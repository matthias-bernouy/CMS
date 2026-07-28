export const MANAGEMENT_URL = "https://admin.repository.example/cms/.cms/repository-management";
export const KIND = "commerce";
export const VERSION = "1.2.0";
export const DECISION_DIGEST = "a".repeat(64);
export const REPORT_DIGEST = "b".repeat(64);

export type CapturedRequest = Readonly<{
    url: string;
    method: string;
    authorization: string | null;
    redirect: string;
    body?: unknown;
}>;

export function scriptedFetch(responses: Response[]) {
    const requests: CapturedRequest[] = [];
    return {
        requests,
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            const body = init?.body ? JSON.parse(await new Response(init.body).text()) : undefined;
            requests.push({
                url: String(input),
                method: init?.method ?? "GET",
                authorization: headers.get("authorization"),
                redirect: init?.redirect ?? "follow",
                ...(body === undefined ? {} : { body }),
            });
            const response = responses.shift();
            if (!response) {
                throw new Error("Unexpected request");
            }
            return response;
        }) as typeof fetch,
    };
}

export function client(fetch: typeof globalThis.fetch) {
    return { managementUrl: MANAGEMENT_URL, token: "pat-admin", timeoutMs: 500, fetch };
}

export function release() {
    return {
        kind: KIND,
        version: VERSION,
        decision: { decisionId: "decision-1", decisionDigest: DECISION_DIGEST, admissible: true },
    };
}

export function versions() {
    return {
        kind: KIND,
        versions: [
            {
                version: VERSION,
                blockPreview: {
                    current: { stable: VERSION, latest: VERSION },
                    next: { stable: "1.1.0", latest: "1.1.0" },
                },
                release: { decisionRevisionId: "decision-1", decisionDigest: DECISION_DIGEST },
            },
        ],
    };
}

export function compatibility() {
    return {
        currentRevisionId: "report-1",
        currentReportDigest: REPORT_DIGEST,
        current: { kind: KIND, version: VERSION, reportId: "report-1" },
    };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return Response.json(body, { status, headers });
}
