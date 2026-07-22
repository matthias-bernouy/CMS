import {
    FsIntegrationDefinitionRepository,
    OFFICIAL_INTEGRATIONS_ROOT,
    dataApiError,
    expect,
    fallbackTrackingStatus,
    handleError,
    md5,
    normalizeTrackingLabel,
    statusAfterObservation,
    test,
} from "../support";

export function registerFoundationTests(): void {
    test("redacts internal and unexpected database error details", async () => {
        const publicDatabaseError = dataApiError(
            400,
            JSON.stringify({
                message: "validation: invalid projection claim settings",
            }),
        );
        expect(publicDatabaseError.status).toBe(400);
        expect(publicDatabaseError.message).toBe("invalid projection claim settings");

        const privateDatabaseError = dataApiError(
            500,
            JSON.stringify({
                message: "duplicate key violates delivery_shipments_private_reference_key",
                detail: "Key (private_reference)=(customer-secret) already exists",
            }),
        );
        expect(privateDatabaseError.status).toBe(502);
        expect(privateDatabaseError.message).toBe("Supabase Data API request failed (500)");
        expect(privateDatabaseError.message).not.toContain("customer-secret");

        const originalConsoleError = console.error;
        console.error = () => undefined;
        try {
            const response = handleError(new Error("MONDIAL_RELAY_CONNECT_PASSWORD=secret"));
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: "internal error" });
        } finally {
            console.error = originalConsoleError;
        }
    });

    test("computes the uppercase-compatible WebService security digest", () => {
        expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    });

    test("normalizes 24R milestones without treating STAT 82 or relay arrival as recipient handoff", () => {
        expect(fallbackTrackingStatus("82")).toBe("arrived_at_pickup_point");
        expect(normalizeTrackingLabel("Colis livré au Point Relais")).toBe("arrived_at_pickup_point");
        expect(normalizeTrackingLabel("Colis disponible au Point Relais")).toBe("available_for_pickup");
        expect(normalizeTrackingLabel("Colis remis au destinataire")).toBe("collected_by_recipient");
        for (const negativeHandoff of [
            "Colis non remis au destinataire",
            "Colis non livré au destinataire",
            "Remise impossible au destinataire",
            "Remise refusée par le destinataire",
            "Parcel not delivered to the recipient",
            "Handoff refused by the recipient",
            "Unable to deliver to the recipient",
            "Delivery failed for the recipient",
        ]) {
            expect(normalizeTrackingLabel(negativeHandoff)).toBe("incident");
            expect(normalizeTrackingLabel(negativeHandoff)).not.toBe("collected_by_recipient");
        }
        expect(normalizeTrackingLabel("Colis remis au destinataire avec réserve")).toBe("incident");
        expect(normalizeTrackingLabel("Package handed to customer with reservation")).toBe("incident");
        expect(normalizeTrackingLabel("Délai de retrait dépassé - colis non réclamé")).toBe("pickup_expired");
        expect(normalizeTrackingLabel("Colis en cours de retour vers l'expéditeur")).toBe("returning_to_sender");
        expect(normalizeTrackingLabel("Colis remis à l'expéditeur")).toBe("returned_to_sender");
        expect(statusAfterObservation("collected_by_recipient", "in_transit")).toBe("collected_by_recipient");
    });

    test("loads from the official integration catalog", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const list = await repo.list();
        const definition = await repo.get("mondial-relay");

        expect(list.map((entry) => entry.kind)).toContain("mondial-relay");
        expect(definition?.kind).toBe("mondial-relay");
        expect(definition?.version).toBe("1.0.0");
        const serialized = JSON.stringify(definition);
        expect(serialized).toContain("mondial-relay-picker");
        expect(serialized).toContain("reconcileShipments");
        expect(serialized).toContain("recipientHandoffAt");
        expect(definition?.inputs.find((input) => input.name === "mondialRelayConnectEndpoint")).toMatchObject({
            type: "select",
            options: [
                { label: "Sandbox", value: "https://connect-api-sandbox.mondialrelay.com/api/shipment" },
                { label: "Production", value: "https://connect-api.mondialrelay.com/api/shipment" },
            ],
        });
        expect(definition?.inputs.find((input) => input.name === "mondialRelayTrackingEndpoint")).toMatchObject({
            type: "select",
            options: [{ label: "Production WebService", value: "https://api.mondialrelay.com/WebService.asmx" }],
        });
        const sourceArtifact = definition?.artifacts.find((artifact) => artifact.type === "source");
        const createOutput = JSON.stringify(
            sourceArtifact?.type === "source"
                ? sourceArtifact.source.endpoints.find((endpoint) => endpoint.endpointId === "createShipment")?.output
                : null,
        );
        expect(createOutput).not.toContain("labelUrl");
    });

    test("claims due tracking rows with a stale lease and skip-locked concurrency", async () => {
        const schema = await Bun.file(
            new URL(
                "../../../../integrations/providers/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql",
                import.meta.url,
            ),
        ).text();

        expect(schema).toContain("create or replace function delivery.claim_due_shipments");
        expect(schema).toContain("for update skip locked");
        expect(schema).toContain("tracking_claimed_at <= now() - interval '20 minutes'");
        expect(schema).toContain("tracking_next_attempt_at");
    });

    test("declares durable projection leases, bounded retries, and manual review", async () => {
        const schema = await Bun.file(
            new URL(
                "../../../../integrations/providers/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql",
                import.meta.url,
            ),
        ).text();

        expect(schema).toContain("create or replace function delivery.claim_pending_shipment_events");
        expect(schema).toContain("projection_claim_token");
        expect(schema).toContain("projection_attempts");
        expect(schema).toContain("projection_next_attempt_at");
        expect(schema).toContain("projection_last_error");
        expect(schema).toContain("projection_status = 'manual_review'");
        expect(schema).toContain("for update skip locked");
    });
}
