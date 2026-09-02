import { expect, test } from "bun:test";
import { createHarness } from "../harness/create";
import { sourceJson } from "../harness/requests";
import { jsonBody, okJson } from "../harness/responses";

export function registerMetadataTest(): void {
    test("rejects unknown and disallowed flat metadata fields", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(harness, "createExtraField", {
                id: "level",
                label: "Level",
                type: "string",
                options: [
                    { value: "club", label: "Club" },
                    { value: "competition", label: "Competition" },
                ],
            }),
        );

        const unknown = await sourceJson(harness, "updateAccountMetadata", { hiddenRole: "admin" });
        const disallowed = await sourceJson(harness, "updateAccountMetadata", { level: "professional" });

        expect(unknown.status).toBe(400);
        expect(await unknown.text()).toBe("body.hiddenRole is not allowed");
        expect(disallowed.status).toBe(400);
        expect(await jsonBody(disallowed)).toEqual({ error: "level is not an allowed value" });
    });
}
