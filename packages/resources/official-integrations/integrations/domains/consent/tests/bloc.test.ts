import { Buffer, File } from "node:buffer";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { BindingCore, BINDING_CORE_TAG } from "@bernouy/components/binding";

const tag = "consent-field";
const versionRoot = resolve(import.meta.dir, "..");
const blocRoot = resolve(versionRoot, "blocs/consent-field");
const originalFetch = globalThis.fetch;

beforeAll(async () => {
    if (!customElements.get(BINDING_CORE_TAG)) {
        customElements.define(BINDING_CORE_TAG, BindingCore);
    }
    if (!customElements.get(tag)) {
        const compiled = await compileBloc(tag);
        new Function(compiled.viewJS)();
    }
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    location.href = "http://localhost/";
});

describe("consent field", () => {
    test("is binding-native and exposes one stable authoring contract", async () => {
        const view = await read("Bloc.ts");
        const editor = await read("BlocEditor.ts");
        const content = await read("default.html");
        const compiled = await compileBloc("contract-consent-field");

        expect(view).not.toMatch(/\bfetch\s*\(/);
        expect(content).not.toContain("<cms-binding-core");
        expect(content).toContain('cms-condition="$source.loading"');
        expect(content).toContain('cms-condition="$source.error"');
        expect(content).toContain('cms-condition="$source.loaded"');
        expect(content).toContain('cms-repeat="consentRequirements.documents as document"');
        expect(content).toContain('cms-reload-on="consent:reload"');
        expect(content).toContain('target="_blank"');
        for (const attribute of [
            "heading",
            "loading-label",
            "load-error-label",
            "retry-label",
            "required-message",
            "changed-label",
            "new-tab-label",
        ]) {
            expect(content).toContain(`${attribute}=`);
            expect(editor).toContain(`attribute: "${attribute}"`);
        }
        expect(content).not.toMatch(/\serror-label=/);
        expect(content).not.toMatch(/\srequired-label=/);
        expect(view).toContain('this.getAttribute("source-prefix")');
        expect(editor).toContain('attribute: "source-prefix"');
        expect(compiled.viewJS).toContain('customElements.define("contract-consent-field"');
        expect(
            validateBloc({
                tag: "contract-consent-field",
                viewSource: compiled.viewJS,
                editorSource: compiled.editorJS,
            }).errors,
        ).toEqual([]);
    });

    test.each(["binding-disabled", "bind-stop"])(
        "shows only the clean preview and performs no fetch behind %s",
        async (boundary) => {
            let calls = 0;
            globalThis.fetch = (async () => {
                calls += 1;
                return Response.json(requirements());
            }) as typeof fetch;

            const core = document.createElement(BINDING_CORE_TAG);
            const wrapper = document.createElement("div");
            if (boundary === "binding-disabled") {
                core.setAttribute("cms-binding-disabled", "");
                core.setAttribute("cms-source-state-force", "error");
            } else {
                wrapper.setAttribute("cms-bind-stop", "");
            }
            wrapper.innerHTML = (await read("default.html")).replaceAll("consent-field", tag);
            core.append(wrapper);
            document.body.append(core);
            await settle();

            const field = core.querySelector(tag)!;
            const preview = field.querySelector<HTMLElement>("[data-consent-editor-preview]")!;
            const runtimeStates = [...field.querySelectorAll<HTMLElement>("[data-consent-runtime]")];
            expect(calls).toBe(0);
            expect(field.querySelectorAll("[data-consent-editor-preview]")).toHaveLength(1);
            expect(getComputedStyle(preview).display).not.toBe("none");
            expect(runtimeStates).toHaveLength(3);
            expect(runtimeStates.every((state) => getComputedStyle(state).display === "none")).toBe(true);
            expect(preview.textContent).not.toContain("{{");
        },
    );

    test("renders loading, error and ready states through Binding Core and retries globally", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            if (calls === 1) {
                return Response.json({ error: "temporary" }, { status: 503 });
            }
            return Response.json(requirements());
        }) as typeof fetch;

        const core = await mountRuntime();
        await waitFor(() => core.querySelector("[data-consent-error]") !== null);
        expect(core.querySelector("[data-consent-loading]")).toBeNull();
        expect(core.querySelector("[data-consent-ready]")).toBeNull();

        core.querySelector<HTMLElement>("[data-consent-retry]")!.click();
        await waitFor(() => core.querySelectorAll("input[data-consent-version]").length === 2);

        expect(calls).toBe(2);
        expect(core.querySelector("[data-consent-error]")).toBeNull();
        expect(core.querySelector("[data-consent-loading]")).toBeNull();
        expect(core.querySelector("[data-consent-ready]")).not.toBeNull();
        expect(core.textContent).toContain("Conditions requises");
        expect(core.textContent).toContain("nouvel onglet");
        expect(core.textContent).not.toContain("{{");
        await settle();
        const firstCopy = document.querySelector<HTMLElement>(`${tag} [data-consent-copy]`)!;
        expect(firstCopy.getAttribute("data-consent-text")).toBe(
            "J’accepte les Conditions générales de vente de Courtside.",
        );
        expect(firstCopy.getAttribute("data-consent-label")).toBe("Conditions générales de vente");
        expect(firstCopy.querySelector("[data-consent-prefix]")?.textContent).toBe("J’accepte les ");
        expect(firstCopy.querySelector("[data-consent-suffix]")?.textContent).toBe(" de Courtside.");
        expect(firstCopy.textContent?.match(/Conditions générales de vente/g)).toHaveLength(1);
    });

    test("emits one attempt id and repeated accepted version ids as FormData", async () => {
        globalThis.fetch = (async () => Response.json(requirements())) as typeof fetch;
        const records: Array<{ value: FormData | null; state?: string }> = [];
        const originalAttachInternals = HTMLElement.prototype.attachInternals;
        HTMLElement.prototype.attachInternals = function () {
            if (this.localName !== tag) {
                return originalAttachInternals.call(this);
            }
            return {
                setFormValue(value: FormData | null, state?: string) {
                    records.push({ value, state });
                },
                setValidity() {},
            } as unknown as ElementInternals;
        };
        try {
            const core = await mountRuntime();
            await waitFor(() => core.querySelectorAll("input[data-consent-version]").length === 2);
            const checkboxes = [...core.querySelectorAll<HTMLInputElement>("input[data-consent-version]")];
            for (const checkbox of checkboxes) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event("change", { bubbles: true }));
            }
            await settle();

            const field = core.querySelector(tag) as HTMLElement & { syncFormValue(): void };
            const requiredCopy = field.querySelector("[data-consent-required-copy]")!;
            let redundantHiddenMutations = 0;
            const observer = new MutationObserver((records) => {
                redundantHiddenMutations += records.length;
            });
            observer.observe(requiredCopy, { attributes: true, attributeFilter: ["hidden"] });
            field.syncFormValue();
            field.syncFormValue();
            await settle();
            observer.disconnect();
            expect(redundantHiddenMutations).toBe(0);

            const latest = [...records].reverse().find((record) => record.value instanceof FormData);
            expect(latest).toBeTruthy();
            expect([...latest!.value!.entries()]).toEqual([
                ["consentAttemptId", expect.stringMatching(/^[0-9a-f-]{36}$/i)],
                ["acceptedConsentVersionIds", "a".repeat(64)],
                ["acceptedConsentVersionIds", "b".repeat(64)],
            ]);
            expect(JSON.parse(latest!.state!)).toMatchObject({
                attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
                versionIds: ["a".repeat(64), "b".repeat(64)],
            });
        } finally {
            HTMLElement.prototype.attachInternals = originalAttachInternals;
        }
    });

    test("reveals the required message only after browser validation", async () => {
        globalThis.fetch = (async () => Response.json(requirements())) as typeof fetch;
        const core = await mountRuntime();
        await waitFor(() => core.querySelectorAll("input[data-consent-version]").length === 2);

        const field = core.querySelector(tag)!;
        const requiredCopy = field.querySelector<HTMLElement>("[data-consent-required-copy]")!;
        expect(requiredCopy.hidden).toBe(true);

        field.dispatchEvent(new Event("invalid"));
        expect(requiredCopy.hidden).toBe(false);

        for (const checkbox of field.querySelectorAll<HTMLInputElement>("input[data-consent-version]")) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
        expect(requiredCopy.hidden).toBe(true);
    });

    test("reloads only its own stale consent failure with fresh unchecked evidence", async () => {
        const form = document.createElement("form");
        form.innerHTML = `
            <${tag} changed-label="Relis les nouvelles conditions.">
                <p data-consent-changed hidden></p>
                <div data-consent-ready>
                    <input data-consent-version type="checkbox" value="${"a".repeat(64)}">
                    <input data-consent-version type="checkbox" value="${"b".repeat(64)}">
                    <p data-consent-required-copy hidden></p>
                </div>
            </${tag}>
        `;
        document.body.append(form);
        await settle();

        const field = form.firstElementChild as HTMLElement & {
            attemptId: string;
            failureTarget: Node | null;
        };
        expect(field.failureTarget?.nodeName).toBe("FORM");
        const eventForm = field.failureTarget as HTMLFormElement;
        const checkboxes = [...field.querySelectorAll<HTMLInputElement>("input[data-consent-version]")];
        let reloads = 0;
        document.addEventListener(
            "consent:reload",
            () => {
                reloads += 1;
            },
            { once: true },
        );
        for (const checkbox of checkboxes) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        }
        const firstAttempt = field.attemptId;
        eventForm.dispatchEvent(sourceFailure(eventForm, "another-auth-error"));
        await settle();
        expect(field.attemptId).toBe(firstAttempt);
        expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);
        expect(reloads).toBe(0);

        eventForm.dispatchEvent(sourceFailure(eventForm, "consent-stage-target"));
        expect(field.attemptId).not.toBe(firstAttempt);
        expect(checkboxes.every((checkbox) => !checkbox.checked)).toBe(true);
        expect(reloads).toBe(1);
        const changed = field.querySelector<HTMLElement>("[data-consent-changed]")!;
        expect(changed.hidden).toBe(false);
        expect(changed.textContent?.trim()).toBe("Relis les nouvelles conditions.");
    });
});

async function mountRuntime(): Promise<HTMLElement> {
    const core = document.createElement(BINDING_CORE_TAG);
    core.innerHTML = (await read("default.html")).replaceAll("consent-field", tag);
    document.body.append(core);
    return core;
}

async function compileBloc(outputTag: string) {
    const manifest = JSON.parse(await read("manifest.json")) as { meta: { title: string; description: string } };
    return prepare_bloc(
        new File([await read("Bloc.ts")], "Bloc.ts", { type: "text/typescript" }),
        new File([await read("BlocEditor.ts")], "BlocEditor.ts", { type: "text/typescript" }),
        manifest.meta.title,
        "Consent",
        manifest.meta.description,
        outputTag,
        { "style.css": Buffer.from(await read("style.css")).toString("base64") },
        await read("default.html"),
    );
}

function read(file: string): Promise<string> {
    return Bun.file(resolve(blocRoot, file)).text();
}

function requirements() {
    return {
        enabled: true,
        contextKey: "signup",
        documents: ["a", "b"].map((prefix, index) => ({
            documentKey: `document-${index}`,
            versionId: prefix.repeat(64),
            label: index === 0 ? "Conditions générales de vente" : `Document ${index + 1}`,
            consentText:
                index === 0 ? "J’accepte les Conditions générales de vente de Courtside." : "J’accepte Document 2",
            consentPrefix: index === 0 ? "J’accepte les " : "J’accepte ",
            consentSuffix: index === 0 ? " de Courtside." : "",
            page: { id: `page-${index}`, path: `/legal/${index}`, title: `Document ${index + 1}` },
            contentHash: prefix.repeat(64),
        })),
    };
}

function sourceFailure(form: HTMLFormElement, trigger: string): CustomEvent {
    return new CustomEvent("cms-source:failed", {
        bubbles: true,
        composed: true,
        detail: {
            ok: false,
            status: 502,
            statusText: "Bad Gateway",
            body: { error: "Trigger failed", trigger },
            message: "Trigger failed",
            form,
        },
    });
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}

async function waitFor(predicate: () => boolean, attempts = 80): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached");
}
