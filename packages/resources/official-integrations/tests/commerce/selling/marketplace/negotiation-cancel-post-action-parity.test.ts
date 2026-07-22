import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
    canceledProposalRow,
    cancellationEventRow,
    consumedFields,
    consumedProjection,
    eventProjection,
    pick,
    proposalProjection,
} from "./negotiation-cancel-fixtures";

type EdgeHandler = (request: Request) => Promise<Response>;
type ProviderCall = { path: string; method: string; body: unknown; headers: Headers };

test("returns the exact consumed proposal projection after administrator cancellation", async () => {
    const realDeno = (globalThis as { Deno?: unknown }).Deno;
    const realFetch = globalThis.fetch;
    const providerCalls: ProviderCall[] = [];
    let handler: EdgeHandler | undefined;
    const environment: Record<string, string> = {
        CMS_NEGOTIATION_API_KEY: "negotiation-key",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };
    (
        globalThis as {
            Deno?: { env: { get: (name: string) => string | undefined }; serve: (value: unknown) => unknown };
        }
    ).Deno = {
        env: { get: (name) => environment[name] },
        serve(value) {
            handler = value as EdgeHandler;
            return { shutdown() {} };
        },
    };
    globalThis.fetch = (async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        providerCalls.push({
            path,
            method: request.method,
            body: await request
                .clone()
                .json()
                .catch(() => null),
            headers: new Headers(request.headers),
        });
        if (path.endsWith("/rpc/moderate_proposal")) {
            return Response.json(canceledProposalRow);
        }
        if (path.endsWith("/rpc/get_admin_proposal_detail")) {
            return Response.json({ proposal: canceledProposalRow, events: [cancellationEventRow] });
        }
        return Response.json({ message: "unexpected provider call" }, { status: 500 });
    }) as typeof fetch;

    try {
        await loadNegotiationHandlerFresh();
        if (!handler) {
            throw new Error("commerce-negotiation handler was not registered");
        }
        const headers = {
            authorization: "Bearer negotiation-key",
            "content-type": "application/json",
            "x-cms-admin-id": "operator-9",
        };
        const mutation = await handler(
            new Request("https://project.supabase.co/functions/v1/cms-commerce-negotiation/admin/proposal/cancel", {
                method: "POST",
                headers,
                body: JSON.stringify({ id: 44, expectedVersion: 3, reason: "Duplicate listing" }),
            }),
        );
        const canceled = await mutation.json();
        const detail = await handler(
            new Request("https://project.supabase.co/functions/v1/cms-commerce-negotiation/admin/proposal?id=44", {
                headers: { authorization: "Bearer negotiation-key" },
            }),
        );
        const fetched = (await detail.json()) as Record<string, unknown>;
        const { events, ...fetchedProjection } = fetched;

        expect(mutation.status).toBe(200);
        expect(detail.status).toBe(200);
        expect(canceled).toEqual(proposalProjection);
        expect(canceled).not.toHaveProperty("events");
        expect(events).toEqual([eventProjection]);
        expect(fetchedProjection).toEqual(proposalProjection);
        expect(canceled).toEqual(fetchedProjection);
        expect(pick(canceled as Record<string, unknown>, consumedFields)).toEqual(consumedProjection);
        expect(providerCalls).toHaveLength(2);
        expect(providerCalls.map(({ path, method, body }) => ({ path, method, body }))).toEqual([
            {
                path: "/rest/v1/rpc/moderate_proposal",
                method: "POST",
                body: {
                    p_proposal_id: 44,
                    p_admin_id: "operator-9",
                    p_expected_version: 3,
                    p_reason: "Duplicate listing",
                },
            },
            {
                path: "/rest/v1/rpc/get_admin_proposal_detail",
                method: "POST",
                body: { p_id: 44, p_public_id: null },
            },
        ]);
        expect(providerCalls.every((call) => call.headers.get("apikey") === "service-role-key")).toBeTrue();
    } finally {
        globalThis.fetch = realFetch;
        (globalThis as { Deno?: unknown }).Deno = realDeno;
    }
});

async function loadNegotiationHandlerFresh(): Promise<void> {
    const moduleUrl = new URL(
        "../../../../integrations/extensions/commerce-negotiation/versions/1.0.0/connectors/supabase/functions/cms-commerce-negotiation/index.ts",
        import.meta.url,
    );
    const source = await Bun.file(moduleUrl).text();
    const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
    const directory = await mkdtemp(join(tmpdir(), "cms-negotiation-parity-"));
    const freshModule = join(directory, "index.mjs");
    try {
        await Bun.write(freshModule, javascript);
        await import(pathToFileURL(freshModule).href);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
