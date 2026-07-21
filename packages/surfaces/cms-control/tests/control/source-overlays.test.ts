import { describe, expect, test } from "bun:test";
import { InMemorySourceOverlayRepository } from "@bernouy/cms-sources";
import getOverlays from "cms-control/api/source-overlays/overlays.get";
import postOverlay from "cms-control/api/source-overlays/overlays.post";

describe("source overlays API", () => {
    test("stores and lists source overlays", async () => {
        const sourceOverlays = new InMemorySourceOverlayRepository();
        const cms = { sourceOverlays } as any;

        const posted = await postOverlay(
            new Request("http://localhost/cms/api/source-overlays/overlays", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    id: "user-account-extra-fields",
                    sourceId: "user-account",
                    input: [{ endpointId: "updateAccount", editable: "self" }],
                    output: [{ endpointId: "getAccount" }],
                    fieldSource: { endpointId: "listExtraFields", map: { options: "choices" } },
                    fields: [
                        {
                            id: "company",
                            label: "Company",
                            type: "string",
                            options: [{ value: "acme", label: "Acme" }],
                        },
                    ],
                }),
            }),
            cms,
        );
        const listed = await getOverlays(
            new Request("http://localhost/cms/api/source-overlays/overlays?sourceId=user-account"),
            cms,
        );

        expect(posted.status).toBe(200);
        expect(await posted.json()).toMatchObject({ id: "user-account-extra-fields", sourceId: "user-account" });
        expect(await listed.json()).toEqual([
            expect.objectContaining({
                id: "user-account-extra-fields",
                fieldSource: { endpointId: "listExtraFields", map: { options: "choices" } },
                fields: [
                    expect.objectContaining({
                        id: "company",
                        label: "Company",
                        options: [{ value: "acme", label: "Acme" }],
                    }),
                ],
            }),
        ]);
    });

    test("returns 501 when no repository is configured", async () => {
        const response = await getOverlays(new Request("http://localhost/cms/api/source-overlays/overlays"), {} as any);

        expect(response.status).toBe(501);
    });
});
