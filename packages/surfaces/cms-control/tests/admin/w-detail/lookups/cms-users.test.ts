import { afterEach, describe, expect, test } from "bun:test";
import {
    WIDGET_ACTION_EVENT,
    type WidgetActionDetail,
} from "../../../../src/components/admin/Resources/Dashboards/widgets/shared";
import { dashboardUserOptions } from "../../../../src/components/admin/Resources/Dashboards/api";
import { resetLookupTest } from "./lookupTestSetup";

afterEach(resetLookupTest);

describe("dashboard CMS user fields", () => {
    test("preserves the CMS subject byte for byte", () => {
        expect(dashboardUserOptions([{ sub: "OIDC:Tenant/User+Opaque==" }])).toEqual([
            {
                value: "OIDC:Tenant/User+Opaque==",
                label: "OIDC:Tenant/User+Opaque==",
            },
        ]);
    });

    test("searches the CMS directory and submits the opaque user subject", async () => {
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            return Response.json([
                {
                    sub: "local:alice:opaque",
                    displayName: "Alice Martin",
                    email: "alice@example.test",
                    role: "sales_partner",
                    roleLabel: "Sales partner",
                },
                {
                    sub: "oidc:bob:opaque",
                    email: "bob@example.test",
                    role: "user",
                    roleLabel: "User",
                },
            ]);
        }) as typeof fetch;

        const detail = cmsUserDetail("");
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) =>
            actions.push((event as CustomEvent<WidgetActionDetail>).detail),
        );
        document.body.append(detail);

        await waitFor(() => Boolean(detail.shadowRoot?.querySelector("option[value='local:alice:opaque']")));

        expect(requests).toEqual(["/api/users"]);
        const combobox = detail.shadowRoot!.querySelector<HTMLElement & { value: string; shadowRoot: ShadowRoot }>(
            "p9r-combobox",
        )!;
        const alice = combobox.querySelector<HTMLOptionElement>("option[value='local:alice:opaque']")!;
        expect(alice.textContent).toBe("Alice Martin — alice@example.test · Sales partner · local:alice:opaque");

        const input = combobox.shadowRoot.querySelector<HTMLInputElement>("input")!;
        expect(input.getAttribute("role")).toBe("combobox");
        expect(input.getAttribute("aria-autocomplete")).toBe("list");
        expect(input.labels?.[0]?.textContent).toBe("CMS user");
        expect(combobox.hasAttribute("required")).toBeTrue();

        detail.shadowRoot!.querySelector<HTMLElement>("p9r-button")!.click();
        expect(actions).toEqual([]);
        expect(combobox.getAttribute("hint")).toBe("This field is required.");
        expect(input.getAttribute("aria-required")).toBe("true");
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(combobox.shadowRoot.querySelector<HTMLElement>("#hint")?.textContent).toBe("This field is required.");

        input.focus();
        input.value = "alice martin";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(combobox.shadowRoot.querySelector("[role='listbox']")?.textContent).toContain("Alice Martin");
        expect(combobox.shadowRoot.querySelector("[role='listbox']")?.textContent).not.toContain("bob@example.test");

        input.value = "local:alice:opaque";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        detail.shadowRoot!.querySelector<HTMLElement>("p9r-button")!.click();

        expect(actions[0]?.fields?.cmsUserId).toBe("local:alice:opaque");
    });

    test("shows a directory error and retries it from the same field scope", async () => {
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            if (requests.length === 1) {
                return new Response("unavailable", { status: 503 });
            }
            return Response.json([{ sub: "local:retry:opaque", email: "retry@example.test" }]);
        }) as typeof fetch;

        const detail = cmsUserDetail("");
        document.body.append(detail);
        await waitFor(() => Boolean(detail.shadowRoot?.querySelector("p9r-combobox[invalid]")));

        const failed = detail.shadowRoot!.querySelector<HTMLElement & { shadowRoot: ShadowRoot }>("p9r-combobox")!;
        expect(requests).toEqual(["/api/users"]);
        expect(failed.getAttribute("hint")).toBe("Unable to load CMS users. Focus or click to retry.");
        expect(failed.shadowRoot.querySelector<HTMLInputElement>("input")?.getAttribute("aria-invalid")).toBe("true");
        expect(failed.shadowRoot.querySelector<HTMLElement>("#hint")?.hidden).toBe(false);

        failed.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }));
        await waitFor(() => Boolean(detail.shadowRoot?.querySelector("option[value='local:retry:opaque']")));

        const recovered = detail.shadowRoot!.querySelector<HTMLElement & { shadowRoot: ShadowRoot }>("p9r-combobox")!;
        expect(requests).toEqual(["/api/users", "/api/users"]);
        expect(recovered.hasAttribute("invalid")).toBe(false);
        expect(recovered.hasAttribute("hint")).toBe(false);
        expect(recovered.shadowRoot.querySelector<HTMLInputElement>("input")?.hasAttribute("aria-invalid")).toBe(false);
    });

    test("loads a CMS user field when field-driven visibility reveals it", async () => {
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            return Response.json([{ sub: "local:visible:opaque", email: "visible@example.test" }]);
        }) as typeof fetch;

        const detail = conditionalCmsUserDetail();
        document.body.append(detail);
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(requests).toEqual([]);
        expect(detail.shadowRoot!.querySelector("p9r-combobox")).toBeNull();

        const mode = detail.shadowRoot!.querySelector<HTMLElement & { value: string }>(
            "p9r-select[data-field-control='mode']",
        )!;
        mode.value = "assign";
        mode.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

        await waitFor(() => Boolean(detail.shadowRoot?.querySelector("option[value='local:visible:opaque']")));
        expect(requests).toEqual(["/api/users"]);
    });

    test("hydrates known users and preserves an orphaned subject without rewriting it", async () => {
        globalThis.fetch = (async () =>
            Response.json([
                {
                    sub: "oidc:known:opaque",
                    email: "known@example.test",
                    roleLabel: "User",
                },
            ])) as unknown as typeof fetch;

        const known = cmsUserDetail("oidc:known:opaque");
        document.body.append(known);
        await waitFor(() => Boolean(known.shadowRoot?.querySelector("option[value='oidc:known:opaque']")));
        const knownCombobox = known.shadowRoot!.querySelector<HTMLElement & { value: string; shadowRoot: ShadowRoot }>(
            "p9r-combobox",
        )!;
        expect(knownCombobox.value).toBe("oidc:known:opaque");
        expect(knownCombobox.shadowRoot.querySelector<HTMLInputElement>("input")?.value).toBe(
            "known@example.test · User · oidc:known:opaque",
        );

        known.remove();
        const orphan = cmsUserDetail("legacy:missing:opaque");
        document.body.append(orphan);
        await waitFor(() => Boolean(orphan.shadowRoot?.querySelector("option[value='legacy:missing:opaque']")));
        const orphanCombobox = orphan.shadowRoot!.querySelector<HTMLElement & { value: string }>("p9r-combobox")!;
        expect(orphanCombobox.value).toBe("legacy:missing:opaque");
        expect(orphanCombobox.querySelector("option[value='legacy:missing:opaque']")?.textContent).toBe(
            "Unknown CMS user · legacy:missing:opaque",
        );
    });

    test("does not load or render the picker once the CMS user attachment is immutable", async () => {
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            return Response.json([]);
        }) as typeof fetch;
        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "partnerDetail",
                source: { endpoint: "partner" },
                main: [
                    {
                        id: "identity",
                        title: "Identity",
                        fields: [
                            {
                                id: "cmsUserId",
                                label: "CMS user",
                                path: "cmsUserId",
                                type: "cms-user",
                                visibleWhen: { value: "$resource.id", equals: null },
                            },
                            {
                                id: "linkedCmsUserId",
                                label: "CMS user id",
                                path: "cmsUserId",
                                type: "readonly",
                                visibleWhen: { value: "$resource.id", notEquals: null },
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute("data-source-json", JSON.stringify({ id: 42, cmsUserId: "local:immutable:opaque" }));
        detail.setAttribute("data-row-key", "42");
        detail.setAttribute("data-source-id", "sales-configurator");
        document.body.append(detail);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(requests).toEqual([]);
        expect(detail.shadowRoot!.querySelector("p9r-combobox")).toBeNull();
        expect(detail.shadowRoot!.textContent).toContain("local:immutable:opaque");
    });
});

function cmsUserDetail(cmsUserId: string): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute(
        "data-config-json",
        JSON.stringify({
            widget: "w-detail",
            id: "partnerDetail",
            source: { endpoint: "partner" },
            actions: [{ id: "savePartner", label: "Save partner", endpoint: { endpoint: "savePartner" } }],
            main: [
                {
                    id: "identity",
                    title: "Identity",
                    fields: [
                        {
                            id: "cmsUserId",
                            label: "CMS user",
                            path: "cmsUserId",
                            type: "cms-user",
                            placeholder: "Search by name, email, or CMS user id",
                            required: true,
                        },
                    ],
                },
            ],
        }),
    );
    detail.setAttribute("data-source-json", JSON.stringify({ id: null, cmsUserId }));
    detail.setAttribute("data-row-key", "__new__");
    detail.setAttribute("data-source-id", "sales-configurator");
    return detail;
}

function conditionalCmsUserDetail(): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute(
        "data-config-json",
        JSON.stringify({
            widget: "w-detail",
            id: "conditionalPartnerDetail",
            source: { endpoint: "partner" },
            main: [
                {
                    id: "identity",
                    title: "Identity",
                    fields: [
                        {
                            id: "mode",
                            label: "Mode",
                            path: "mode",
                            type: "select",
                            options: [
                                { value: "off", label: "Off" },
                                { value: "assign", label: "Assign" },
                            ],
                        },
                        {
                            id: "cmsUserId",
                            label: "CMS user",
                            path: "cmsUserId",
                            type: "cms-user",
                            visibleWhen: { value: "$field.mode", equals: "assign" },
                        },
                    ],
                },
            ],
        }),
    );
    detail.setAttribute("data-source-json", JSON.stringify({ id: null, mode: "off", cmsUserId: "" }));
    detail.setAttribute("data-row-key", "__new__");
    detail.setAttribute("data-source-id", "sales-configurator");
    return detail;
}

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let index = 0; index < tries; index += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(predicate()).toBe(true);
}
