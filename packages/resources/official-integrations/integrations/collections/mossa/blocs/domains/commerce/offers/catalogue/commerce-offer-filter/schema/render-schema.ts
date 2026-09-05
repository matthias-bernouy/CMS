import { filterControls, filterableFields, numericRange, schemaBrands } from "./schema-helpers";
import { createOptionElement, createSelectElement, element, filterWrapper } from "./render-elements";
import { renderNumberRange } from "../range/render-range";
import { schemaFilterStyle } from "./schema-style";

export function renderSchema(host, schema) {
    host.setAttribute("data-schema-status", "initializing");
    const schemaCategory = schema?.category?.fullSlug;
    if (typeof schemaCategory === "string" && schemaCategory.trim()) {
        host.setAttribute("data-schema-category", schemaCategory.trim());
    } else {
        host.removeAttribute("data-schema-category");
    }
    const stack = element("div", { "data-schema-filters": "" });
    const style = document.createElement("style");
    style.textContent = schemaFilterStyle.replaceAll("mossa-commerce-offer-filter", host.localName);
    stack.append(style);
    if (host.getAttribute("show-brand") !== "false") {
        stack.append(renderBrand(host, schema));
    }
    const fields = filterableFields(schema);
    if (fields.length > 0) {
        const heading = document.createElement("strong");
        heading.textContent = host.getAttribute("advanced-label") || "Advanced filters";
        stack.append(heading);
    }
    for (const field of fields) {
        const controls = filterControls(field);
        const range = numericRange(field);
        if (
            range &&
            controls.some(({ operator }) => operator === "gte") &&
            controls.some(({ operator }) => operator === "lte")
        ) {
            stack.append(renderNumberRange(host.localName, field, controls, range));
            continue;
        }
        for (const control of controls) {
            stack.append(renderField(host.localName, field, control));
        }
    }
    if (stack.childElementCount === 1) {
        const empty = document.createElement("p");
        empty.textContent = host.getAttribute("empty-label") || "No additional filters for this category.";
        stack.append(empty);
    }
    replaceSchemaContent(host, stack);
    setTimeout(() => {
        if (host.isConnected && host.contains(stack)) {
            publishSchemaState(host, "ready");
        }
    }, 0);
}

export function renderSchemaState(host, state, message = "") {
    const status = document.createElement("p");
    status.dataset.schemaState = state;
    status.setAttribute("role", state === "error" ? "alert" : "status");
    status.textContent =
        message ||
        (state === "loading"
            ? host.getAttribute("loading-label") || "Loading filters…"
            : host.getAttribute("select-category-label") || "Choose a category to display its filters.");
    replaceSchemaContent(host, status);
    publishSchemaState(host, state);
}

function replaceSchemaContent(host, content) {
    const authored = [...host.children].find(
        (child) => child.localName === "template" && child.hasAttribute("data-authored-filter-content"),
    );
    host.replaceChildren(...(authored ? [authored] : []), content);
}

function publishSchemaState(host, state) {
    host.setAttribute("data-schema-status", state);
    host.dispatchEvent(
        new CustomEvent("mossa-commerce-offer-filter:state", {
            bubbles: true,
            composed: true,
            detail: { state },
        }),
    );
}

function renderBrand(host, schema) {
    const select = createSelectElement(host.getAttribute("brand-label") || "Brand", {
        name: "brand",
        "cms-param-sync": "brand",
        "data-commerce-param": "brand",
        "data-url-param": "brand",
        "data-filter-param": "brand",
    });
    select.append(
        createOptionElement("", host.getAttribute("brand-all-label") || "All brands"),
        ...schemaBrands(schema).map((brand) => createOptionElement(brand.slug, brand.name)),
    );
    return select;
}

function renderField(filterTag, field, definition) {
    const wrapper = filterWrapper(filterTag, field, definition);
    const options = Array.isArray(field.options) ? field.options : [];
    if (options.length > 0 || field.type === "boolean") {
        const select = createSelectElement(field.label, {
            name: definition.param,
            "cms-param-sync": definition.param,
            "data-filter-param": definition.param,
        });
        select.append(createOptionElement("", `All · ${field.label}`));
        select.append(
            ...(field.type === "boolean"
                ? [createOptionElement("true", "Oui"), createOptionElement("false", "Non")]
                : options.map((value) => createOptionElement(String(value), String(value)))),
        );
        wrapper.append(select);
        return wrapper;
    }
    const label = element("label", { "data-schema-field": "" });
    const copy = document.createElement("span");
    copy.textContent = fieldLabel(field, definition.operator);
    const control = element("input", {
        name: definition.param,
        type: field.type === "number" ? "number" : "text",
        "cms-param-sync": definition.param,
        "data-filter-param": definition.param,
        ...(field.type === "number" ? { step: "any", inputmode: "decimal" } : {}),
    });
    label.append(copy, control);
    wrapper.append(label);
    return wrapper;
}

function fieldLabel(field, operator) {
    const unit = typeof field.unit === "string" && field.unit.trim() ? ` (${field.unit.trim()})` : "";
    const bound = operator === "gte" ? " — minimum" : operator === "lte" ? " — maximum" : "";
    return `${field.label}${bound}${unit}`;
}
