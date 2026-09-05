export const supportedParams = new Set([
    "q",
    "productId",
    "variantId",
    "sellerId",
    "conditionCode",
    "category",
    "brand",
    "priceMin",
    "priceMax",
    "sort",
]);

export const fixedFilters = [
    ["product-id", "productId"],
    ["variant-id", "variantId"],
    ["seller-id", "sellerId"],
    ["condition-code", "conditionCode"],
    ["category", "category"],
    ["brand", "brand"],
    ["minimum-price", "priceMin"],
    ["maximum-price", "priceMax"],
    ["sort", "sort"],
];

export function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function validIdentifier(value) {
    const candidate = value?.trim() || "";
    return /^[A-Za-z_$][\w$]*$/.test(candidate) ? candidate : "";
}

export function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

export function readFilterParams(host) {
    const entries = [];
    for (const control of host.querySelectorAll("[cms-param-sync], [data-commerce-param][data-url-param]")) {
        const urlParam = (
            control.getAttribute("data-url-param") ||
            control.getAttribute("cms-param-sync") ||
            control.getAttribute("name") ||
            ""
        ).trim();
        const endpointParam = (control.getAttribute("data-commerce-param") || urlParam).trim();
        if (urlParam && supportedParams.has(endpointParam)) {
            const schemaCategory = control
                .closest?.("[data-schema-category]")
                ?.getAttribute("data-schema-category")
                ?.trim();
            entries.push(schemaCategory ? [endpointParam, urlParam, schemaCategory] : [endpointParam, urlParam]);
        }
    }
    return entries.filter(
        ([endpointParam], index) => entries.findIndex(([candidate]) => candidate === endpointParam) === index,
    );
}

export function readMetadataFilters(host) {
    return [...host.querySelectorAll("mossa-commerce-offer-filter, [data-commerce-offer-filter]")].flatMap((filter) => {
        const field = filter.getAttribute("field")?.trim();
        const operator = filter.getAttribute("operator")?.trim() || "eq";
        const valueType = filter.getAttribute("value-type")?.trim() || "string";
        const control = filter.querySelector("[cms-param-sync]");
        const urlParam = control?.getAttribute("cms-param-sync")?.trim() || control?.getAttribute("name")?.trim();
        const schemaCategory = filter.closest("[data-schema-category]")?.getAttribute("data-schema-category")?.trim();
        return field && urlParam ? [{ field, operator, urlParam, valueType, schemaCategory }] : [];
    });
}

export function activeFilterParams(filters, params, activeCategory = "") {
    return filters.flatMap(([endpointParam, urlParam, schemaCategory]) => {
        if (schemaCategory && schemaCategory !== activeCategory) {
            return [];
        }
        const value = params.get(urlParam)?.trim();
        return value ? [[endpointParam, value]] : [];
    });
}

export function activeMetadataFilters(metadataFilters, params, activeCategory = "") {
    const filters = {};
    for (const { field, operator, urlParam, valueType, schemaCategory } of metadataFilters) {
        if (schemaCategory && schemaCategory !== activeCategory) {
            continue;
        }
        const rawValue = params.get(urlParam)?.trim();
        if (!rawValue) {
            continue;
        }
        const value =
            valueType === "number" ? Number(rawValue) : valueType === "boolean" ? rawValue === "true" : rawValue;
        if (valueType === "number" && !Number.isFinite(value)) {
            continue;
        }
        if (valueType === "boolean" && rawValue !== "true" && rawValue !== "false") {
            continue;
        }
        filters[field] ||= {};
        filters[field][operator] = value;
    }
    return filters;
}

export function schemaFiltersPending(host, activeCategory, params) {
    if (!activeCategory) {
        return false;
    }
    const panels = [
        ...host.querySelectorAll(
            'mossa-commerce-offer-filter[schema-driven]:not([schema-driven="false"]), [data-commerce-offer-filter][schema-driven]:not([schema-driven="false"])',
        ),
    ];
    const hasMetadataParams = [...params].some(([name, value]) => name.startsWith("filter_") && value.trim() !== "");
    const hasPendingBrand =
        Boolean(params.get("brand")?.trim()) && panels.some((panel) => panel.getAttribute("show-brand") !== "false");
    if (!hasMetadataParams && !hasPendingBrand) {
        return false;
    }
    return panels.some((panel) => {
        const status = panel.getAttribute("data-schema-status");
        if (status === "error" || status === "idle") {
            return false;
        }
        const rangesReady = [...panel.querySelectorAll("[data-numeric-range]")].every(
            (range) => range.getAttribute("data-range-status") === "ready",
        );
        return status !== "ready" || panel.getAttribute("data-schema-category") !== activeCategory || !rangesReady;
    });
}

export function filterSignature(filters, metadataFilters) {
    if (typeof location === "undefined") {
        return "";
    }
    const params = new URLSearchParams(location.search);
    return [...filters.map(([, urlParam]) => urlParam), ...metadataFilters.map((filter) => filter.urlParam)]
        .map((urlParam) => `${urlParam}=${params.get(urlParam) ?? ""}`)
        .join("&");
}
