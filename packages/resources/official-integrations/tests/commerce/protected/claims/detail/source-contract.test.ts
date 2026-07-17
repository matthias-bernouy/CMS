import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expectedClaimDetail } from "./expected";

type Endpoint = { endpointId: string; output?: Array<{ status?: string; body?: DataShape }> };
type Definition = { artifacts: Array<{ source?: { endpoints: Endpoint[] } }> };

const definitionPath = resolve(
    import.meta.dir,
    "../../../../../integrations/commerce/versions/1.0.0/definition.json",
);

describe("commerce claim strict Source contract", () => {
    test("preserves the exact claim projection consumed by dashboards", async () => {
        const definition = JSON.parse(await readFile(definitionPath, "utf8")) as Definition;
        const endpoint = definition.artifacts
            .find(artifact => artifact.source)?.source?.endpoints
            .find(candidate => candidate.endpointId === "claim");
        const shape = endpoint?.output?.find(output => output.status === "200")?.body;
        if (!shape) throw new Error("Missing claim 200 output shape");

        expect(projectStrictDataShape(expectedClaimDetail(), shape, "response", {
            enforceRequired: false,
        })).toEqual({
            id: 7,
            publicId: "30000000-0000-4000-8000-000000000007",
            orderId: 42,
            reason: "not_as_described",
            status: "return_required",
            description: "The received item differs from the listing.",
            buyerRequestedAmount: 10_000,
            resolutionOutcome: "return_required",
            returnShipByAt: "2026-07-25T08:00:00.000Z",
            returnDeliveryStatus: "carrier_accepted",
            returnProviderReference: "return-42",
            returnCarrierAcceptedAt: "2026-07-20T08:00:00.000Z",
            returnRecipientHandoffAt: null,
            version: 3,
            events: [
                { id: 71, eventType: "opened", actorKind: "buyer", message: null, createdAt: "2026-07-17T08:00:00.000Z" },
                { id: 72, eventType: "return_required", actorKind: "admin", message: "Return authorized", createdAt: "2026-07-18T08:00:00.000Z" },
            ],
            evidence: [
                {
                    id: 81, submittedByKind: "buyer", mimeType: "application/pdf",
                    fileSize: 1_024, originalFilename: "buyer-proof.pdf", sha256: "a".repeat(64),
                    description: null, metadata: { upload_kind: "buyer" },
                    createdAt: "2026-07-17T09:00:00.000Z",
                },
                {
                    id: 82, submittedByKind: "seller", mimeType: "image/png",
                    fileSize: 2_048, originalFilename: "seller-proof.png", sha256: "b".repeat(64),
                    description: "Packing photograph", metadata: { upload_kind: "seller" },
                    createdAt: "2026-07-17T10:00:00.000Z",
                },
            ],
            returnEvents: [
                {
                    id: 91, providerEventId: "return:event:1", providerReference: "return-42",
                    normalizedStatus: "carrier_accepted", occurredAt: "2026-07-20T08:00:00.000Z",
                    createdAt: "2026-07-20T08:01:00.000Z",
                },
                {
                    id: 92, providerEventId: "return:event:2", providerReference: "return-42",
                    normalizedStatus: "in_transit", occurredAt: "2026-07-21T08:00:00.000Z",
                    createdAt: "2026-07-21T08:01:00.000Z",
                },
            ],
        });
    });
});
