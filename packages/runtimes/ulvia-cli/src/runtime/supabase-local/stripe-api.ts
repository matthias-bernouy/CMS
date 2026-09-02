type V1Endpoint = {
    id: string;
    api_version: string | null;
    metadata: Record<string, string>;
};

type V2Destination = {
    id: string;
    event_payload: "thin";
    events_from: string[];
    metadata: Record<string, string>;
    status: "enabled";
};

export class LocalStripeApi {
    private sequence = 0;
    private readonly v1 = new Map<string, V1Endpoint>();
    private readonly v2 = new Map<string, V2Destination>();

    async handle(request: Request, prefix: string): Promise<Response> {
        if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
            return json({ error: { message: "Missing API key" } }, 401);
        }
        const url = new URL(request.url);
        const path = url.pathname.slice(prefix.length);
        if (path === "/v1/webhook_endpoints" && request.method === "GET") {
            return json({ data: [...this.v1.values()] });
        }
        if (path === "/v1/webhook_endpoints" && request.method === "POST") {
            const body = new URLSearchParams(await request.text());
            const id = this.id("we");
            this.v1.set(id, {
                id,
                api_version: body.get("api_version"),
                metadata: formMetadata(body),
            });
            return json({ id, secret: `whsec_local_${id}` });
        }
        if (path.startsWith("/v1/webhook_endpoints/")) {
            return this.mutateV1(path.slice("/v1/webhook_endpoints/".length), request);
        }
        if (path === "/v2/core/event_destinations" && request.method === "GET") {
            return json({ data: [...this.v2.values()] });
        }
        if (path === "/v2/core/event_destinations" && request.method === "POST") {
            const body = await request.json();
            const id = this.id("ed");
            this.v2.set(id, v2Destination(id, body));
            return json({ id, webhook_endpoint: { signing_secret: `whsec_local_${id}` } });
        }
        if (path.startsWith("/v2/core/event_destinations/")) {
            return await this.mutateV2(path.slice("/v2/core/event_destinations/".length), request);
        }
        return json({ error: { message: "Unsupported local Stripe route" } }, 404);
    }

    private mutateV1(id: string, request: Request): Response {
        if (request.method === "DELETE") {
            this.v1.delete(id);
            return json({ id, deleted: true });
        }
        return this.v1.has(id) ? json({ id }) : json({ error: { message: "Unknown endpoint" } }, 404);
    }

    private async mutateV2(path: string, request: Request): Promise<Response> {
        const [id, action] = path.split("/");
        if (!id || !this.v2.has(id)) {
            return json({ error: { message: "Unknown destination" } }, 404);
        }
        if (request.method === "DELETE") {
            this.v2.delete(id);
            return json({ id, deleted: true });
        }
        if (request.method === "POST" && action !== "enable") {
            const current = this.v2.get(id)!;
            this.v2.set(id, v2Destination(id, await request.json(), current));
        }
        return json({ id });
    }

    private id(prefix: string): string {
        this.sequence += 1;
        return `${prefix}_local_${this.sequence}`;
    }
}

function formMetadata(body: URLSearchParams): Record<string, string> {
    return Object.fromEntries(
        [...body.entries()].flatMap(([name, value]) => {
            const match = /^metadata\[([^\]]+)\]$/u.exec(name);
            return match?.[1] ? [[match[1], value]] : [];
        }),
    );
}

function v2Destination(id: string, value: unknown, current?: V2Destination): V2Destination {
    const body = record(value);
    return {
        id,
        event_payload: current?.event_payload ?? "thin",
        events_from: stringArray(body.events_from) ?? current?.events_from ?? [],
        metadata: stringRecord(body.metadata) ?? current?.metadata ?? {},
        status: "enabled",
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const entries = Object.entries(value);
    return entries.every((entry): entry is [string, string] => typeof entry[1] === "string")
        ? Object.fromEntries(entries)
        : undefined;
}

function json(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
