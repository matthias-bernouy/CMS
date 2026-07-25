import { CMS_SIGNUP_LEGAL_CONSENT_TAG, type CmsSignupLegalConsent } from "../../src/components/index";

export type InternalsProbe = {
    formValue: string | File | FormData | null;
    formState: string | File | FormData | null;
    validity: ValidityStateFlags;
    message: string;
    anchor?: HTMLElement;
};

const probes = new WeakMap<HTMLElement, InternalsProbe>();
let originalAttachInternals: PropertyDescriptor | undefined;
let originalFetch: typeof fetch;

export function setupSignupLegalConsentTest(): void {
    document.body.replaceChildren();
    originalFetch = globalThis.fetch;
    originalAttachInternals = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "attachInternals");
    Object.defineProperty(HTMLElement.prototype, "attachInternals", {
        configurable: true,
        value(this: HTMLElement) {
            const probe: InternalsProbe = {
                formValue: null,
                formState: null,
                validity: {},
                message: "",
            };
            probes.set(this, probe);
            return {
                setFormValue(value: string | File | FormData | null, state: string | File | FormData | null = value) {
                    probe.formValue = value;
                    probe.formState = state;
                },
                setValidity(flags: ValidityStateFlags, message = "", anchor?: HTMLElement) {
                    probe.validity = { ...flags };
                    probe.message = message;
                    probe.anchor = anchor;
                },
                states: { add() {}, delete() {}, has: () => false },
                form: null,
                labels: [],
            } as unknown as ElementInternals;
        },
    });
}

export function teardownSignupLegalConsentTest(): void {
    document.body.replaceChildren();
    globalThis.fetch = originalFetch;
    if (originalAttachInternals) {
        Object.defineProperty(HTMLElement.prototype, "attachInternals", originalAttachInternals);
    } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).attachInternals;
    }
}

export function createConsent(): CmsSignupLegalConsent {
    const element = document.createElement(CMS_SIGNUP_LEGAL_CONSENT_TAG) as CmsSignupLegalConsent;
    document.body.append(element);
    return element;
}

export function probeFor(element: HTMLElement): InternalsProbe {
    const probe = probes.get(element);
    if (!probe) {
        throw new Error("Element internals probe was not installed.");
    }
    return probe;
}

export function requirements(...versionIds: string[]): object {
    return {
        documents: versionIds.map((versionId, index) => ({
            documentKey: `document-${index}`,
            versionId,
            label: `Read document ${index + 1}`,
            consentText: `I accept document ${index + 1}.`,
            page: {
                id: `page-${index}`,
                path: `/legal/document-${index + 1}`,
                title: `Document ${index + 1}`,
            },
            contentHash: `hash-${index}`,
        })),
    };
}

export function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export async function waitForState(element: HTMLElement, state: string): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt++) {
        if (element.dataset.state === state) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(`Timed out waiting for component state "${state}".`);
}
