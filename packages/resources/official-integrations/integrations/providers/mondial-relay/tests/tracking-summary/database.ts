import { type JsonRecord, shipmentEvents, shipmentRow } from "./fixtures";

export type Scenario = {
    shipment?: JsonRecord | null;
    events?: JsonRecord[];
    failure?: "shipment" | "events";
    malformedEvents?: boolean;
};

export class TrackingDatabase {
    readonly calls: Array<{
        method: string;
        pathname: string;
        searchParams: Record<string, string>;
        body?: JsonRecord;
    }> = [];
    readonly reads: Array<"shipment" | "events"> = [];
    readonly events: JsonRecord[];
    private readonly shipment: JsonRecord | null;
    private eventReads = 0;
    private eventPause: ReturnType<typeof pause> | undefined;

    constructor(private readonly scenario: Scenario) {
        this.events = structuredClone(scenario.events ?? shipmentEvents);
        this.shipment = scenario.shipment === undefined ? structuredClone(shipmentRow) : scenario.shipment;
    }

    async respond(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = input instanceof Request && !init ? input : new Request(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        if (url.origin !== "https://project.supabase.co") {
            throw new Error(`unexpected provider call: ${request.url}`);
        }
        const text = method === "GET" ? "" : await request.clone().text();
        this.calls.push({
            method,
            pathname: url.pathname,
            searchParams: Object.fromEntries(url.searchParams),
            ...(text ? { body: JSON.parse(text) as JsonRecord } : {}),
        });
        if (url.pathname === "/rest/v1/shipments" && method === "GET") {
            this.reads.push("shipment");
            return this.scenario.failure === "shipment"
                ? databaseFailure()
                : Response.json(this.shipment ? [this.shipment] : []);
        }
        if (url.pathname === "/rest/v1/shipment_events" && method === "GET") {
            return await this.eventsResponse();
        }
        if (url.pathname === "/rest/v1/rpc/read_tracking_summary" && method === "POST") {
            return await this.contextResponse();
        }
        throw new Error(`unexpected database call: ${method} ${url.pathname}`);
    }

    eventReadCount(): number {
        return this.eventReads;
    }

    pauseEvents(): ReturnType<typeof pause> {
        this.eventPause = pause();
        return this.eventPause;
    }

    private async eventsResponse(): Promise<Response> {
        this.reads.push("events");
        this.eventReads += 1;
        await this.eventPause?.wait();
        if (this.scenario.failure === "events") {
            return databaseFailure();
        }
        return this.scenario.malformedEvents
            ? Response.json({ private: "malformed" })
            : Response.json(sorted(this.events));
    }

    private async contextResponse(): Promise<Response> {
        this.reads.push("shipment");
        if (this.scenario.failure === "shipment") {
            return databaseFailure();
        }
        if (!this.shipment) {
            return Response.json([{ shipment: null, events: [] }]);
        }
        this.eventReads += 1;
        await this.eventPause?.wait();
        this.reads.push("events");
        if (this.scenario.failure === "events") {
            return databaseFailure();
        }
        return Response.json([
            {
                shipment: projectedShipment(this.shipment),
                events: this.scenario.malformedEvents
                    ? { private: "malformed" }
                    : sorted(this.events).map(projectedEvent),
            },
        ]);
    }
}

function databaseFailure(): Response {
    return Response.json({ message: "private database failure", detail: "private@example.test" }, { status: 503 });
}

function sorted(events: JsonRecord[]): JsonRecord[] {
    return [...events].sort((left, right) => {
        const leftTime = left.occurred_at ? Date.parse(String(left.occurred_at)) : Number.NEGATIVE_INFINITY;
        const rightTime = right.occurred_at ? Date.parse(String(right.occurred_at)) : Number.NEGATIVE_INFINITY;
        return rightTime - leftTime || Date.parse(String(right.created_at)) - Date.parse(String(left.created_at));
    });
}

function projectedShipment(row: JsonRecord): JsonRecord {
    return Object.fromEntries(["id", "status", "latest_event_label", "latest_event_at"].map((key) => [key, row[key]]));
}

function projectedEvent(row: JsonRecord): JsonRecord {
    return Object.fromEntries(
        ["normalized_status", "occurred_at", "event_label", "event_date", "event_time", "location"].map((key) => [
            key,
            row[key],
        ]),
    );
}

function pause() {
    let enter!: () => void;
    let resume!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve));
    const resumed = new Promise<void>((resolve) => (resume = resolve));
    return {
        entered,
        resume,
        async wait() {
            enter();
            await resumed;
        },
    };
}
