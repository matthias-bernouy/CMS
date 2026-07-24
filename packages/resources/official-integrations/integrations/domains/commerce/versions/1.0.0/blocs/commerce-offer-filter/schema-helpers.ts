export function filterableFields(schema) {
    if (!schema || typeof schema !== "object" || !Array.isArray(schema.fields)) {
        return [];
    }
    return schema.fields
        .filter(
            (field) =>
                field &&
                typeof field === "object" &&
                field.filterable === true &&
                typeof field.key === "string" &&
                isMetadataKey(field.key.trim()) &&
                typeof field.label === "string" &&
                Array.isArray(field.operators),
        )
        .sort((left, right) => numeric(left.position) - numeric(right.position) || left.key.localeCompare(right.key));
}

export function filterControls(field) {
    const operators = new Set(field.operators);
    if (field.type === "number") {
        const controls = [];
        if (operators.has("gte")) {
            controls.push({ operator: "gte", param: filterParam(field.key, "gte"), valueType: "number" });
        }
        if (operators.has("lte")) {
            controls.push({ operator: "lte", param: filterParam(field.key, "lte"), valueType: "number" });
        }
        if (controls.length === 0 && operators.has("eq")) {
            controls.push({ operator: "eq", param: filterParam(field.key, "eq"), valueType: "number" });
        }
        return controls;
    }
    if (operators.has("eq")) {
        return [
            {
                operator: "eq",
                param: filterParam(field.key, "eq"),
                valueType: field.type === "boolean" ? "boolean" : "string",
            },
        ];
    }
    return [];
}

export function numericRange(field) {
    const minimum = Number(field?.range?.minimum);
    const maximum = Number(field?.range?.maximum);
    const step = Number(field?.range?.step);
    if (
        field?.type !== "number" ||
        !Number.isFinite(minimum) ||
        !Number.isFinite(maximum) ||
        !Number.isFinite(step) ||
        minimum > maximum ||
        step <= 0
    ) {
        return null;
    }
    return { minimum, maximum, step };
}

export function filterParam(key, operator) {
    const safeKey = String(key).trim();
    const suffix = operator === "gte" ? ":gte" : operator === "lte" ? ":lte" : "";
    return `filter_${safeKey}${suffix}`;
}

export function legacyFilterParam(key, operator) {
    const safeKey = String(key).trim();
    const suffix = operator === "gte" ? "_min" : operator === "lte" ? "_max" : "";
    return `filter_${safeKey}${suffix}`;
}

export function schemaBrands(schema) {
    if (!schema || typeof schema !== "object" || !Array.isArray(schema.brands)) {
        return [];
    }
    return schema.brands.filter(
        (brand) =>
            brand &&
            typeof brand === "object" &&
            typeof brand.slug === "string" &&
            brand.slug.trim() &&
            typeof brand.name === "string" &&
            brand.name.trim(),
    );
}

function numeric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function isMetadataKey(value) {
    return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value);
}
