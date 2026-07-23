import { filterControls, filterableFields, schemaBrands } from "./schema-helpers";

export function renderSchema(host, schema) {
    const stack = element("div", { "data-schema-filters": "" });
    const style = document.createElement("style");
    style.textContent = `
        commerce-offer-filter[schema-driven] [data-schema-filters] {
            display: grid;
            gap: 1rem;
        }
        commerce-offer-filter[schema-driven] [data-schema-field] {
            display: grid;
            gap: .35rem;
            color: var(--text-main, inherit);
            font-size: .925rem;
            font-weight: 700;
        }
        commerce-offer-filter[schema-driven] [data-schema-field] :is(input, select) {
            box-sizing: border-box;
            width: 100%;
            min-height: 2.65rem;
            padding: .55rem .7rem;
            border: 1px solid var(--border-default, color-mix(in srgb, currentColor 22%, transparent));
            border-radius: var(--radius-control, .375rem);
            color: var(--text-main, inherit);
            background: var(--bg-surface, Canvas);
            font: inherit;
            font-weight: 400;
        }
        commerce-offer-filter[schema-driven] [data-schema-field] :is(input, select):focus-visible {
            outline: 2px solid var(--secondary-base, currentColor);
            outline-offset: 2px;
        }
    `;
    stack.append(style);
    if (host.getAttribute("show-brand") !== "false") {
        stack.append(renderBrand(host, schema));
    }
    const fields = filterableFields(schema);
    if (fields.length > 0) {
        const heading = document.createElement("strong");
        heading.textContent = host.getAttribute("advanced-label") || "Filtres avancés";
        stack.append(heading);
    }
    for (const field of fields) {
        for (const control of filterControls(field)) {
            stack.append(renderField(field, control));
        }
    }
    if (stack.childElementCount === 1) {
        const empty = document.createElement("p");
        empty.textContent = host.getAttribute("empty-label") || "Aucun filtre supplémentaire pour cette catégorie.";
        stack.append(empty);
    }
    host.replaceChildren(stack);
}

export function renderSchemaState(host, state, message = "") {
    const status = document.createElement("p");
    status.dataset.schemaState = state;
    status.setAttribute("role", state === "error" ? "alert" : "status");
    status.textContent =
        message ||
        (state === "loading"
            ? host.getAttribute("loading-label") || "Chargement des filtres…"
            : host.getAttribute("select-category-label") || "Choisis une catégorie pour afficher ses filtres.");
    host.replaceChildren(status);
}

function renderBrand(host, schema) {
    const field = element("label", { "data-schema-field": "" });
    const label = document.createElement("span");
    label.textContent = host.getAttribute("brand-label") || "Marque";
    const select = element("select", {
        name: "brand",
        "cms-param-sync": "brand",
        "data-commerce-param": "brand",
        "data-url-param": "brand",
        "data-filter-param": "brand",
    });
    select.append(
        option("", host.getAttribute("brand-all-label") || "Toutes les marques"),
        ...schemaBrands(schema).map((brand) => option(brand.slug, brand.name)),
    );
    field.append(label, select);
    return field;
}

function renderField(field, definition) {
    const wrapper = element("commerce-offer-filter", {
        field: field.key,
        operator: definition.operator,
        "value-type": definition.valueType,
        "data-filterable-field": field.key,
    });
    const label = fieldLabel(field, definition.operator);
    const options = Array.isArray(field.options) ? field.options : [];
    const labelElement = element("label", { "data-schema-field": "" });
    const labelCopy = document.createElement("span");
    labelCopy.textContent = label;
    let control;
    if (options.length > 0 || field.type === "boolean") {
        control = element("select", {
            name: definition.param,
            "cms-param-sync": definition.param,
            "data-filter-param": definition.param,
        });
        control.append(option("", `Tous · ${field.label}`));
        if (field.type === "boolean") {
            control.append(option("true", "Oui"), option("false", "Non"));
        } else {
            control.append(...options.map((value) => option(String(value), String(value))));
        }
    } else {
        control = element("input", {
            name: definition.param,
            type: field.type === "number" ? "number" : "text",
            "cms-param-sync": definition.param,
            "data-filter-param": definition.param,
            ...(field.type === "number" ? { step: "any", inputmode: "decimal" } : {}),
        });
    }
    labelElement.append(labelCopy, control);
    wrapper.append(labelElement);
    return wrapper;
}

function fieldLabel(field, operator) {
    const unit = typeof field.unit === "string" && field.unit.trim() ? ` (${field.unit.trim()})` : "";
    const bound = operator === "gte" ? " — minimum" : operator === "lte" ? " — maximum" : "";
    return `${field.label}${bound}${unit}`;
}

function element(tag, attributes) {
    const value = document.createElement(tag);
    for (const [name, content] of Object.entries(attributes)) {
        value.setAttribute(name, content);
    }
    return value;
}

function option(value, label) {
    const item = element("option", { value });
    item.textContent = label;
    return item;
}
