import { assertIJsonValue } from "@bernouy/cms-integration-packages";
import type {
    UpgradeFixtureHttpResponseV1,
    UpgradeFixtureJsonRequestV1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";

const FORBIDDEN_HEADERS = new Set(["authorization", "apikey", "cookie", "host"]);

export function jsonRequestInit(request: UpgradeFixtureJsonRequestV1 = {}): RequestInit {
    const headers = safeAuthorHeaders(request.headers);
    if (request.body !== undefined) {
        assertIJsonValue(request.body);
        headers.set("content-type", "application/json");
    }
    return {
        method: request.method ?? (request.body === undefined ? "GET" : "POST"),
        headers,
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    };
}

export async function fixtureHttpResponse(response: Response): Promise<UpgradeFixtureHttpResponseV1> {
    const text = await response.text();
    let body: UpgradeFixtureHttpResponseV1["body"] = null;
    if (text) {
        try {
            body = JSON.parse(text) as UpgradeFixtureHttpResponseV1["body"];
            assertIJsonValue(body);
        } catch {
            body = text;
        }
    }
    return Object.freeze({ status: response.status, ok: response.ok, body });
}

export function safeAuthorHeaders(input: Readonly<Record<string, string>> | undefined): Headers {
    const headers = new Headers();
    for (const [name, value] of Object.entries(input ?? {})) {
        if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
            throw new Error(`Upgrade fixtures cannot set protected HTTP header "${name}"`);
        }
        headers.set(name, value);
    }
    return headers;
}

export function localServiceUrl(baseUrl: string, path: string): URL {
    const url = new URL(path, `${baseUrl}/`);
    if (!path.startsWith("/") || url.origin !== new URL(baseUrl).origin) {
        throw new Error("Upgrade fixture requests must stay on the isolated Supabase origin");
    }
    return url;
}
