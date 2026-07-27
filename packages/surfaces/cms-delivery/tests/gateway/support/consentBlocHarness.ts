import { Buffer, File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { BINDING_CORE_TAG, BindingCore } from "@bernouy/components/binding";
import type { IntegrationBlocArtifact } from "@bernouy/cms-integrations";
import type { ConsentSignupHarness } from "./consentSignupHarness";

const tag = "consent-field";
const realFetch = globalThis.fetch;
const realAttachInternals = HTMLElement.prototype.attachInternals;
let blocInstalled = false;

export type SignupForm = {
    form: HTMLFormElement;
    field: HTMLElement & { attemptId: string; __consentValid?: boolean };
    authBodies: Array<Record<string, unknown>>;
};

export async function mountConsentSignup(harness: ConsentSignupHarness, email: string): Promise<SignupForm> {
    await installBloc(harness.bloc);
    installInternalsShim();
    const authBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = routeFetch(harness, authBodies);
    location.href = "http://site/";
    const core = document.createElement(BINDING_CORE_TAG);
    const form = document.createElement("form");
    form.setAttribute("cms-source", "/.cms/sources/system-auth/signup as signupResult");
    form.setAttribute("cms-source-trigger", "submit");
    form.setAttribute("cms-source-method", "POST");
    form.setAttribute("cms-source-success-reset", "false");
    form.innerHTML = `
        <input name="email" type="email" value="${email}" required>
        <input name="password" type="password" value="password-1" required>
        ${defaultContent(harness.bloc)}
        <button type="submit">Create account</button>
    `;
    core.append(form);
    document.body.append(core);
    await waitFor(() => form.querySelector(`${tag}[cms-ready]`) !== null);
    const field = form.querySelector(tag) as SignupForm["field"] | null;
    if (!field) {
        throw new Error("Consent field was not mounted");
    }
    form.reportValidity = () => field.__consentValid !== false;
    await waitFor(() => form.querySelector("[data-consent-loading]") === null);
    return { form, field, authBodies };
}

export function acceptAll(form: HTMLFormElement): void {
    for (const checkbox of form.querySelectorAll<HTMLInputElement>("input[data-consent-version]")) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

export async function submitForm(form: HTMLFormElement, outcome: "success" | "failed") {
    const event = `cms-source:${outcome}`;
    const result = new Promise<CustomEvent>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`missing ${event}`)), 2_000);
        form.addEventListener(
            event,
            (candidate) => {
                clearTimeout(timer);
                resolve(candidate as CustomEvent);
            },
            { once: true },
        );
    });
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    return result;
}

export function resetConsentBlocHarness(): void {
    globalThis.fetch = realFetch;
    HTMLElement.prototype.attachInternals = realAttachInternals;
    document.body.replaceChildren();
    location.href = "http://localhost/";
}

export async function waitFor(predicate: () => boolean, attempts = 100): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached");
}

async function installBloc(artifact: IntegrationBlocArtifact): Promise<void> {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
    if (blocInstalled || customElements.get(tag)) {
        blocInstalled = true;
        return;
    }
    const built = await prepare_bloc(
        new File([artifact.viewJS], "Bloc.ts", { type: "text/typescript" }),
        artifact.editorJS ? new File([artifact.editorJS], "BlocEditor.ts", { type: "text/typescript" }) : null,
        artifact.name,
        artifact.group ?? "",
        artifact.description ?? "",
        artifact.tag,
        artifact.source,
        defaultContent(artifact),
    );
    new Function(built.viewJS)();
    blocInstalled = true;
}

function defaultContent(artifact: IntegrationBlocArtifact): string {
    const source = artifact.source ?? {};
    const manifest = JSON.parse(decode(source["manifest.json"])) as { defaultContent?: string };
    const path = manifest.defaultContent?.replace(/^\.\//, "");
    if (!path || !source[path]) {
        throw new Error("Consent bloc default content is unavailable");
    }
    return decode(source[path]);
}

function decode(value: string | undefined): string {
    return value ? Buffer.from(value, "base64").toString("utf8") : "{}";
}

function installInternalsShim(): void {
    HTMLElement.prototype.attachInternals = function () {
        if (this.localName !== tag) {
            return realAttachInternals.call(this);
        }
        const field = this as SignupForm["field"];
        return {
            setFormValue(value: FormData | null) {
                syncHiddenValues(field, value);
            },
            setValidity(flags: Record<string, boolean>) {
                field.__consentValid = Object.keys(flags).length === 0;
            },
        } as unknown as ElementInternals;
    };
}

function syncHiddenValues(field: HTMLElement, value: FormData | null): void {
    const form = field.closest("form");
    if (!form) {
        return;
    }
    for (const input of form.querySelectorAll(":scope > [data-consent-test-value]")) {
        input.remove();
    }
    for (const [name, entry] of value?.entries() ?? []) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(entry);
        input.dataset.consentTestValue = "";
        form.append(input);
    }
}

function routeFetch(harness: ConsentSignupHarness, authBodies: Array<Record<string, unknown>>): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw = input instanceof Request ? input.url : String(input);
        const request = input instanceof Request && !init ? input : new Request(new URL(raw, location.href), init);
        const url = new URL(request.url);
        if (url.hostname === "project.supabase.co") {
            return harness.backend.fetch(request);
        }
        if (url.pathname.startsWith("/.cms/sources/")) {
            if (url.pathname.endsWith("/system-auth/signup")) {
                authBodies.push(await request.clone().json());
            }
            return request.method === "GET" ? harness.get(request) : harness.post(request);
        }
        throw new Error(`unexpected test fetch: ${request.method} ${request.url}`);
    }) as typeof fetch;
}
