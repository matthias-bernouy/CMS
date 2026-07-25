const GENERATED_PAYLOAD = "data-sales-generated-payload";

export function prepareDraftPayload(form) {
    for (const control of form.querySelectorAll(`[${GENERATED_PAYLOAD}]`)) {
        control.remove();
    }

    let selectionCount = 0;
    for (const variant of form.querySelectorAll("[data-sales-variant]")) {
        if (!variant.checked) {
            continue;
        }
        const variantItemId = positiveId(variant.getAttribute("data-catalog-id"));
        if (!variantItemId) {
            continue;
        }
        const optionalFeatureItemIds = Array.from(form.querySelectorAll("[data-sales-feature]"))
            .filter((feature) => feature.checked && feature.getAttribute("data-variant-id") === String(variantItemId))
            .map((feature) => positiveId(feature.getAttribute("data-catalog-id")))
            .filter(Boolean);
        appendJson(form, "selections", { variantItemId, optionalFeatureItemIds });
        selectionCount += 1;
    }
    if (selectionCount === 0) {
        appendJson(form, "selections", []);
    }

    let requestCount = 0;
    for (const request of form.querySelectorAll("[data-sales-custom-request]")) {
        const labelControl = request.querySelector?.("[data-sales-request-label]") ?? request;
        const descriptionControl = request.querySelector?.("[data-sales-request-description]");
        const quantityControl = request.querySelector?.("[data-sales-request-quantity]");
        const label = controlValue(labelControl).trim();
        if (label) {
            const description = controlValue(descriptionControl).trim();
            appendJson(form, "customRequests", {
                label,
                description: description || null,
                quantity: positiveQuantity(controlValue(quantityControl)),
            });
            requestCount += 1;
        }
    }
    if (requestCount === 0) {
        appendJson(form, "customRequests", []);
    }
}

function controlValue(control) {
    return control ? String(control.value ?? control.getAttribute?.("value") ?? "") : "";
}

function positiveQuantity(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function appendJson(form, name, value) {
    const input = form.ownerDocument.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = JSON.stringify(value);
    input.setAttribute(GENERATED_PAYLOAD, "");
    form.append(input);
}

function positiveId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
