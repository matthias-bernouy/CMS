import { describe, expect, test } from "bun:test";
import { __dashboardViewTestInternals } from "cms-control/components/admin/Resources/Dashboards/DashboardView";

describe("dashboard lookup payloads", () => {
    test("rejects a stale lookup selection whose visible value no longer matches", async () => {
        const { form, lookup, input } = lookupForm();
        lookup.dataset.value = "009193";
        lookup.dataset.dashboardLookupDisplay = "009193";
        input.value = "034709";

        const payload = await __dashboardViewTestInternals.readWritePayload(form);

        expect(payload.ok).toBe(false);
        if (!payload.ok) {
            expect(payload.message).toBe("Pickup point must be selected from the list");
            expect(payload.control).toBe(lookup);
        }
    });

    test("uses the selected lookup value and mapped fields in the write body", async () => {
        const { form, lookup, input } = lookupForm();
        lookup.dataset.value = "034709";
        lookup.dataset.dashboardLookupDisplay = "034709";
        lookup.dataset.dashboardLookupMapped = JSON.stringify({
            deliveryRelayCountry: "FR",
            deliveryRelayNumber: "034709",
        });
        input.value = "034709";

        const payload = await __dashboardViewTestInternals.readWritePayload(form);

        expect(payload.ok).toBe(true);
        if (payload.ok) {
            expect(payload.body).toMatchObject({
                deliveryRelayCountry: "FR",
                deliveryRelayNumber: "034709",
            });
        }
    });

    test("does not rewrite the lookup control when mapped values target the same field", () => {
        const { form, lookup, input } = lookupForm();
        const country = document.createElement("input");
        country.setAttribute("data-dashboard-field", "");
        country.setAttribute("name", "deliveryRelayCountry");
        country.dataset.dashboardFieldType = "text";
        form.append(country);

        lookup.dataset.value = "034709";
        lookup.dataset.dashboardLookupDisplay = "RELAIS TEST";
        input.value = "RELAIS TEST";

        __dashboardViewTestInternals.applyLookupMappedValues(form, {
            deliveryRelayCountry: "FR",
            deliveryRelayNumber: "034709",
        }, lookup);

        expect(lookup.dataset.value).toBe("034709");
        expect(lookup.dataset.dashboardLookupDisplay).toBe("RELAIS TEST");
        expect(input.value).toBe("RELAIS TEST");
        expect(country.value).toBe("FR");
    });
});

function lookupForm(): { form: HTMLFormElement; lookup: HTMLElement; input: HTMLInputElement } {
    const form = document.createElement("form");
    const lookup = document.createElement("div");
    lookup.setAttribute("data-dashboard-field", "");
    lookup.setAttribute("name", "deliveryRelayNumber");
    lookup.setAttribute("required", "");
    lookup.dataset.dashboardFieldType = "lookup";
    lookup.dataset.dashboardFieldLabel = "Pickup point";

    const input = document.createElement("input");
    input.setAttribute("data-dashboard-lookup-search", "");
    lookup.append(input);
    form.append(lookup);
    return { form, lookup, input };
}
