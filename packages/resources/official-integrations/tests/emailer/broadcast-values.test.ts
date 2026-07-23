import { describe, expect, test } from "bun:test";
import { idParam } from "../../integrations/providers/emailer/versions/1.0.0/connectors/supabase/functions/cms-broadcast/values";
import { HttpError } from "../../integrations/providers/emailer/versions/1.0.0/connectors/supabase/functions/cms-broadcast/types";

describe("emailer broadcast campaign identifiers", () => {
    test("accepts canonical campaign UUIDs", () => {
        const id = "a9f35b45-4bb8-4a7e-b25f-416ff70884b1";
        expect(idParam(request(id))).toBe(id);
    });

    test("rejects missing and malformed campaign identifiers before PostgREST", () => {
        expectCampaignIdError(undefined, "id is required");
        expectCampaignIdError("codex-audit-missing", "id must be a UUID");
        expectCampaignIdError("a9f35b45-4bb8-4a7e-b25f", "id must be a UUID");
    });
});

function expectCampaignIdError(id: string | undefined, message: string): void {
    try {
        idParam(request(id));
        throw new Error("expected idParam to reject");
    } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect(error).toMatchObject({ status: 400, message });
    }
}

function request(id: string | undefined): Request {
    const url = new URL("https://cms.test/cms-broadcast/campaign");
    if (id !== undefined) {
        url.searchParams.set("id", id);
    }
    return new Request(url);
}
