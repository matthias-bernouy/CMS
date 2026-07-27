import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    createConsent,
    jsonResponse,
    probeFor,
    requirements,
    setupSignupLegalConsentTest,
    teardownSignupLegalConsentTest,
    waitForState,
} from "./signupLegalConsentFixture";

beforeEach(setupSignupLegalConsentTest);
afterEach(teardownSignupLegalConsentTest);

describe("cms-signup-legal-consent failure boundaries", () => {
    test("fails closed on an unsafe page path", async () => {
        const body = requirements("version-1") as {
            documents: Array<{ page: { path: string } }>;
        };
        body.documents[0]!.page.path = "https://attacker.example/terms";
        globalThis.fetch = (async () => jsonResponse(body)) as typeof fetch;

        const element = createConsent();
        await waitForState(element, "error");

        expect(element.shadowRoot!.querySelector("input")).toBeNull();
        expect(element.shadowRoot!.querySelector('[role="alert"]')).not.toBeNull();
        expect(probeFor(element).formValue).toBeNull();
        expect(probeFor(element).validity).toEqual({ customError: true });
    });

    test("renders server copy as text and keeps legal links same-origin", async () => {
        const body = requirements("version-1") as {
            documents: Array<{ consentText: string; page: { path: string } }>;
        };
        body.documents[0]!.consentText = '<img src=x onerror="alert(1)">Accept.';
        body.documents[0]!.page.path = "/terms?version=1#content";
        globalThis.fetch = (async () => jsonResponse(body)) as typeof fetch;

        const element = createConsent();
        await waitForState(element, "ready");

        expect(element.shadowRoot!.querySelector("img")).toBeNull();
        expect(element.shadowRoot!.querySelector("label")?.textContent).toBe('<img src=x onerror="alert(1)">Accept.');
        const link = element.shadowRoot!.querySelector<HTMLAnchorElement>("a")!;
        expect(link.getAttribute("href")).toBe("/terms?version=1#content");
        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("noopener");
    });

    test("keeps the form invalid after a failed request and supports an explicit retry", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return calls === 1 ? jsonResponse({ error: "unavailable" }, 503) : jsonResponse(requirements("version-1"));
        }) as typeof fetch;

        const element = createConsent();
        await waitForState(element, "error");
        expect(probeFor(element).validity).toEqual({ customError: true });

        element.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click();
        await waitForState(element, "ready");
        expect(calls).toBe(2);
        expect(element.shadowRoot!.querySelector<HTMLInputElement>("input")!.checked).toBe(false);
    });

    test("rejects a cross-origin source prefix before making a request", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls++;
            return jsonResponse(requirements("version-1"));
        }) as typeof fetch;

        const element = document.createElement("cms-signup-legal-consent");
        element.setAttribute("source-prefix", "https://attacker.example/sources");
        document.body.append(element);
        await waitForState(element, "error");

        expect(calls).toBe(0);
        expect(probeFor(element).validity).toEqual({ customError: true });
    });
});
