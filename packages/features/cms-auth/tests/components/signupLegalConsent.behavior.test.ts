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

describe("cms-signup-legal-consent form behavior", () => {
    test("loads one requirement and contributes its version only after explicit acceptance", async () => {
        let request: { url: string; init?: RequestInit } | undefined;
        globalThis.fetch = (async (url: string, init?: RequestInit) => {
            request = { url, init };
            return jsonResponse(requirements("version-1"));
        }) as typeof fetch;

        const element = createConsent();
        await waitForState(element, "ready");

        expect(request?.url).toBe("/.cms/sources/system-auth/signupLegalRequirements");
        expect(request?.init?.credentials).toBe("same-origin");
        const checkbox = element.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        expect(checkbox.checked).toBe(false);
        expect(checkbox.required).toBe(true);
        expect(probeFor(element).formValue).toBeNull();
        expect(probeFor(element).validity).toEqual({ valueMissing: true });
        expect(probeFor(element).anchor).toBe(checkbox);

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change"));

        const value = probeFor(element).formValue;
        expect(value).toBeInstanceOf(FormData);
        expect(Array.from((value as FormData).entries())).toEqual([["acceptedLegalDocumentVersionIds", "version-1"]]);
        expect(probeFor(element).validity).toEqual({});
    });

    test("renders compact consent as one checkbox line with the document label as its link", async () => {
        const body = requirements("version-1") as {
            documents: Array<{ label: string; consentText: string }>;
        };
        body.documents[0]!.label = "Terms of use";
        body.documents[0]!.consentText = "I accept the terms of use.";
        globalThis.fetch = (async () => jsonResponse(body)) as typeof fetch;

        const element = createConsent();
        element.setAttribute("appearance", "compact");
        await waitForState(element, "ready");

        const checkbox = element.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        const legend = element.shadowRoot!.querySelector("legend")!;
        const label = element.shadowRoot!.querySelector<HTMLLabelElement>("label")!;
        const link = label.querySelector<HTMLAnchorElement>("a")!;
        expect(checkbox.required).toBe(true);
        expect(legend.classList.contains("sr-only")).toBe(true);
        expect(label.htmlFor).toBe(checkbox.id);
        expect(label.childNodes[0]?.textContent).toBe("I accept the ");
        expect(link.firstChild?.textContent).toBe("Terms of use");
        expect(label.childNodes[2]?.textContent).toBe(".");
        expect(element.shadowRoot!.querySelector(".copy > a")).toBeNull();

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change"));
        expect(Array.from((probeFor(element).formValue as FormData).values())).toEqual(["version-1"]);
    });

    test("requires every document and resets to an unchecked state", async () => {
        globalThis.fetch = (async () => jsonResponse(requirements("version-1", "version-2"))) as typeof fetch;
        const element = createConsent();
        await waitForState(element, "ready");
        const checkboxes = Array.from(element.shadowRoot!.querySelectorAll<HTMLInputElement>("input"));

        checkboxes[0]!.checked = true;
        checkboxes[0]!.dispatchEvent(new Event("change"));
        expect(probeFor(element).formValue).toBeNull();

        checkboxes[1]!.checked = true;
        checkboxes[1]!.dispatchEvent(new Event("change"));
        expect(Array.from((probeFor(element).formValue as FormData).values())).toEqual(["version-1", "version-2"]);

        element.formResetCallback();
        expect(checkboxes.every((checkbox) => !checkbox.checked)).toBe(true);
        expect(probeFor(element).validity).toEqual({ valueMissing: true });
    });

    test("restores a browser-owned selection and respects disabled form state", async () => {
        globalThis.fetch = (async () => jsonResponse(requirements("version-1"))) as typeof fetch;
        const element = createConsent();
        element.formStateRestoreCallback(JSON.stringify(["version-1"]));
        await waitForState(element, "ready");

        const checkbox = element.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        expect(checkbox.checked).toBe(true);
        element.formDisabledCallback(true);
        expect(checkbox.disabled).toBe(true);
        expect(probeFor(element).formValue).toBeNull();
        expect(probeFor(element).validity).toEqual({});

        element.formDisabledCallback(false);
        expect(checkbox.disabled).toBe(false);
        expect(probeFor(element).formValue).toBeInstanceOf(FormData);
    });

    test("renders no control and remains valid when signup has no legal documents", async () => {
        globalThis.fetch = (async () => jsonResponse(requirements())) as typeof fetch;
        const element = createConsent();
        await waitForState(element, "empty");

        expect(element.shadowRoot!.querySelector("input")).toBeNull();
        expect(probeFor(element).formValue).toBeNull();
        expect(probeFor(element).validity).toEqual({});
    });
});
