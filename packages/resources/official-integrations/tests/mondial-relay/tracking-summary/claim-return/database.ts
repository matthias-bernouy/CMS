import { expectedExternalOrderId, freshEvent, oldEvent, providerXml, shipmentRow, type JsonRecord } from "./fixtures";

export type Scenario = {
    externalOrderId?: string;
    refreshDue?: boolean;
    providerFailure?: boolean;
    missing?: boolean;
};

export class ClaimReturnDatabase {
    readonly calls: Array<{ method: string; origin: string; pathname: string; body?: unknown }> = [];
    readonly events: JsonRecord[] = [structuredClone(oldEvent)];
    private row: JsonRecord;

    constructor(private readonly scenario: Scenario) {
        this.row = {
            ...structuredClone(shipmentRow),
            external_order_id: scenario.externalOrderId ?? expectedExternalOrderId,
            ...(scenario.refreshDue ? { tracking_checked_at: "2020-01-01T00:00:00.000Z" } : {}),
        };
    }

    async respond(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = input instanceof Request && !init ? input : new Request(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const text = request.body ? await request.clone().text() : "";
        this.calls.push({
            method,
            origin: url.origin,
            pathname: url.pathname,
            ...(text ? { body: parseBody(text, request.headers.get("content-type")) } : {}),
        });
        if (url.origin === "https://api.mondialrelay.com") {
            return this.providerResponse();
        }
        if (url.origin !== "https://project.supabase.co") {
            throw new Error(`unexpected call: ${request.url}`);
        }
        return await this.databaseResponse(method, url, text);
    }

    private async databaseResponse(method: string, url: URL, text: string): Promise<Response> {
        if (url.pathname === "/rest/v1/shipments" && method === "GET") {
            if (this.scenario.missing) {
                return Response.json([]);
            }
            const embedded = (url.searchParams.get("select") ?? "").includes("events:");
            return Response.json([{ ...this.row, ...(embedded ? { events: sorted(this.events) } : {}) }]);
        }
        if (url.pathname === "/rest/v1/shipment_events" && method === "GET") {
            return Response.json(sorted(this.events));
        }
        if (url.pathname === "/rest/v1/shipment_events" && method === "POST") {
            const rows = JSON.parse(text) as JsonRecord[];
            this.events.unshift(...rows.map((row) => ({ ...row, created_at: new Date().toISOString() })));
            return new Response(null, { status: 204 });
        }
        if (url.pathname === "/rest/v1/shipments" && method === "PATCH") {
            const patch = JSON.parse(text) as JsonRecord;
            this.row = { ...this.row, ...patch };
            return Response.json([this.row]);
        }
        throw new Error(`unexpected database call: ${method} ${url.pathname}`);
    }

    private providerResponse(): Response {
        if (this.scenario.providerFailure) {
            return new Response("provider unavailable", { status: 503 });
        }
        return new Response(providerXml, { status: 200, headers: { "content-type": "text/xml" } });
    }
}

function sorted(events: JsonRecord[]): JsonRecord[] {
    return [...events].sort((left, right) =>
        String(right.occurred_at ?? "").localeCompare(String(left.occurred_at ?? "")),
    );
}

function parseBody(text: string, contentType: string | null): unknown {
    return contentType?.includes("json") ? JSON.parse(text) : text;
}
