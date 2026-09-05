import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleFormsRequest } from "../connectors/supabase/functions/cms-forms/handler";
import { registrationForm } from "./fixtures/registration";

const originalFetch = globalThis.fetch;

beforeEach(() => {
    Object.defineProperty(globalThis, "Deno", {
        configurable: true,
        value: {
            env: {
                get(name: string) {
                    return {
                        CMS_FORMS_API_KEY: "cms_forms_test",
                        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
                        SUPABASE_URL: "https://database.example.test",
                    }[name];
                },
            },
        },
    });
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, "Deno");
});

describe("Forms native submission", () => {
    test("uses structured answers with server-managed submission metadata", async () => {
        let stored: Record<string, unknown> | undefined;
        globalThis.fetch = async (input, init) => {
            const url = String(input);
            if (url.endsWith("/rpc/get_published_form")) {
                return json(registrationForm);
            }
            if (url.endsWith("/rpc/submit_form")) {
                stored = JSON.parse(String(init?.body));
                return json({ ok: true, receiptId: "5dd11f99-d6eb-4f49-97d-8de3aa182bf3" });
            }
            return json({ message: "unexpected request" }, 500);
        };

        const result = await handleFormsRequest(
            new Request("https://cms.example.test/cms-forms/public/submission?key=event-registration", {
                method: "POST",
                headers: { authorization: "Bearer cms_forms_test", "content-type": "application/json" },
                body: JSON.stringify({ answers: validAnswers() }),
            }),
        );

        expect(result.status).toBe(202);
        expect(stored).toMatchObject({
            p_form_key: "event-registration",
            p_version: 1,
            p_answers: { email: "alex@example.test", session: "morning" },
            p_actor_id: null,
        });
        expect(stored?.p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
        expect(stored?.p_session_id).toMatch(/^[0-9a-f-]{36}$/);
    });
});

function validAnswers(): Record<string, string> {
    return {
        attendeeName: "Alex Morgan",
        email: "alex@example.test",
        organization: "Example Organization",
        session: "morning",
        attendanceType: "in-person",
        city: "Bordeaux",
        consent: "true",
    };
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
