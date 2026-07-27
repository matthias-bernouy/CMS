import { afterEach, describe, expect, test } from "bun:test";
import {
    acceptAll,
    mountConsentSignup,
    resetConsentBlocHarness,
    submitForm,
    waitFor,
} from "../support/consentBlocHarness";
import { consentSignupHarness } from "../support/consentSignupHarness";

afterEach(resetConsentBlocHarness);

describe("Consent signup integration", () => {
    test("prevents unchecked UI submission and blocks a forged unchecked request before credentials", async () => {
        const harness = await consentSignupHarness();
        const mounted = await mountConsentSignup(harness, "unchecked@example.com");

        expect(mounted.form.querySelectorAll("input[data-consent-version]")).toHaveLength(2);
        expect(mounted.form.reportValidity()).toBe(false);
        mounted.form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(mounted.authBodies).toEqual([]);

        const response = await harness.post(signupRequest("unchecked@example.com"));
        expect(response.status).toBe(502);
        expect(await response.json()).toMatchObject({ error: "Trigger failed", trigger: "consent-stage-target" });
        expect(await harness.credentials.getByEmail("unchecked@example.com")).toBeNull();
        expect((await harness.users.list()).users).toEqual([]);
        expect(harness.emailer.sent).toEqual([]);
    });

    test("rejects versions rotated after rendering and reloads fresh unchecked requirements", async () => {
        const harness = await consentSignupHarness();
        const mounted = await mountConsentSignup(harness, "stale@example.com");
        acceptAll(mounted.form);
        await waitFor(() => mounted.form.querySelectorAll("[data-consent-test-value]").length === 3);
        const staleAttempt = mounted.field.attemptId;
        const staleVersions = versionValues(mounted.form);
        harness.backend.rotateDocuments();

        const event = await submitForm(mounted.form, "failed");

        expect(event.detail).toMatchObject({
            status: 502,
            body: { error: "Trigger failed", trigger: "consent-stage-target" },
        });
        expect(mounted.authBodies[0]).toMatchObject({
            consentAttemptId: staleAttempt,
            acceptedConsentVersionIds: staleVersions,
        });
        expect(await harness.credentials.getByEmail("stale@example.com")).toBeNull();
        expect((await harness.users.list()).users).toEqual([]);
        expect(harness.emailer.sent).toEqual([]);
        await waitFor(() => currentField(mounted.form).attemptId !== staleAttempt);
        await waitFor(() => {
            const values = versionValues(mounted.form);
            return values.length === 2 && values.every((value) => value.startsWith("c") || value.startsWith("d"));
        });
        expect(
            [...mounted.form.querySelectorAll<HTMLInputElement>("input[data-consent-version]")].every(
                (checkbox) => !checkbox.checked,
            ),
        ).toBe(true);
    });

    test("allows signup without evidence when the installed context is disabled", async () => {
        const harness = await consentSignupHarness(false);
        const mounted = await mountConsentSignup(harness, "disabled@example.com");

        expect(mounted.form.querySelectorAll("input[data-consent-version]")).toHaveLength(0);
        expect(mounted.form.reportValidity()).toBe(true);
        const event = await submitForm(mounted.form, "success");

        expect(event.detail).toMatchObject({ ok: true, status: 200, body: { ok: true } });
        expect(mounted.authBodies[0]).not.toHaveProperty("consentAttemptId");
        expect(harness.backend.acceptances.size).toBe(0);
        expect(await harness.credentials.getByEmail("disabled@example.com")).not.toBeNull();
        expect((await harness.users.list()).users).toHaveLength(1);
        expect(harness.emailer.sent).toHaveLength(1);
    });

    test("keeps signup pending during a commit outage and completes one receipt on exact retry", async () => {
        const harness = await consentSignupHarness();
        const mounted = await mountConsentSignup(harness, "retry@example.com");
        acceptAll(mounted.form);
        await waitFor(() => mounted.form.querySelectorAll("[data-consent-test-value]").length === 3);
        const attemptId = mounted.field.attemptId;
        const acceptedVersionIds = versionValues(mounted.form);
        harness.backend.failCommit = true;

        const failed = await submitForm(mounted.form, "failed");

        expect(failed.detail).toMatchObject({
            status: 502,
            body: { error: "Trigger failed", trigger: "consent-commit-target" },
        });
        expect(await harness.credentials.getByEmail("retry@example.com")).not.toBeNull();
        expect((await harness.users.list()).users).toEqual([]);
        expect(harness.emailer.sent).toEqual([]);
        expect(harness.backend.intents.size).toBe(1);
        expect(harness.backend.acceptances.size).toBe(0);
        expect(mounted.field.attemptId).toBe(attemptId);

        harness.backend.failCommit = false;
        const retried = await submitForm(mounted.form, "success");

        expect(retried.detail).toMatchObject({ ok: true, status: 200, body: { ok: true } });
        expect(mounted.authBodies).toHaveLength(2);
        expect(mounted.authBodies[1]).toMatchObject({
            consentAttemptId: attemptId,
            acceptedConsentVersionIds: acceptedVersionIds,
        });
        expect(harness.backend.intents.size).toBe(0);
        expect(harness.backend.acceptances.size).toBe(1);
        expect((await harness.users.list()).users).toHaveLength(1);
        expect(harness.emailer.sent).toHaveLength(1);
        const evidence = harness.backend.acceptances.get(attemptId);
        expect(evidence?.cmsUserId).toMatch(/^local:/);
        expect(evidence?.versionIds).toEqual(acceptedVersionIds);
    });
});

function signupRequest(email: string): Request {
    return new Request("http://site/.cms/sources/system-auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "password-1" }),
    });
}

function versionValues(form: HTMLFormElement): string[] {
    return [...form.querySelectorAll<HTMLInputElement>("input[data-consent-version]")].map(({ value }) => value);
}

function currentField(form: HTMLFormElement): HTMLElement & { attemptId: string } {
    const field = form.querySelector("cms-consent-field") as (HTMLElement & { attemptId: string }) | null;
    if (!field) {
        throw new Error("Consent field is unavailable");
    }
    return field;
}
