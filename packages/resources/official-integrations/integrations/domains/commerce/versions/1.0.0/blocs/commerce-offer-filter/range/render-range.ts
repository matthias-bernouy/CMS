import { element, filterWrapper } from "../schema/render-elements";

export function renderNumberRange(filterTag, field, controls, range) {
    const group = element(filterTag, {
        "data-numeric-range": "",
        "data-range-minimum": String(range.minimum),
        "data-range-maximum": String(range.maximum),
        "data-range-unit": field.unit || "",
    });
    const fieldset = element("fieldset", { "data-range-fieldset": "" });
    const legend = element("legend", { "data-range-legend": "" });
    legend.textContent = field.label;
    const heading = element("div", { "data-range-heading": "" });
    const label = element("span", { "data-range-label": "", "aria-hidden": "true" });
    label.textContent = field.label;
    const output = element("output", { "data-range-output": "", "aria-live": "polite" });
    heading.append(label, output);
    const track = element("div", { "data-range-track": "" });
    track.append(
        element("span", { "data-range-rail": "", "aria-hidden": "true" }),
        element("span", { "data-range-fill": "", "aria-hidden": "true" }),
        rangeInput(field, "minimum", range),
        rangeInput(field, "maximum", range),
    );
    const manual = element("div", { "data-range-manual": "" });
    manual.append(
        manualBound(
            filterTag,
            field,
            controls.find(({ operator }) => operator === "gte"),
            "minimum",
            range,
        ),
        manualBound(
            filterTag,
            field,
            controls.find(({ operator }) => operator === "lte"),
            "maximum",
            range,
        ),
    );
    fieldset.append(legend, heading, track, manual);
    group.append(fieldset);
    return group;
}

function rangeInput(field, bound, range) {
    return element("input", {
        type: "range",
        min: String(range.minimum),
        max: String(range.maximum),
        step: String(range.step),
        value: String(bound === "minimum" ? range.minimum : range.maximum),
        "data-range-slider": bound,
        "aria-label": `${field.label} — ${bound === "minimum" ? "minimum" : "maximum"}${field.unit ? ` (${field.unit})` : ""}`,
        ...(range.minimum === range.maximum ? { disabled: "" } : {}),
    });
}

function manualBound(filterTag, field, definition, bound, range) {
    const wrapper = filterWrapper(filterTag, field, definition);
    const proxy = element("input", {
        name: definition.param,
        type: "hidden",
        "cms-param-sync": definition.param,
        "data-filter-param": definition.param,
        "data-range-proxy": bound,
    });
    const label = element("label", { "data-range-bound": bound });
    const copy = document.createElement("span");
    copy.textContent = bound === "minimum" ? "Min." : "Max.";
    const endpoint = bound === "minimum" ? range.minimum : range.maximum;
    const control = element("input", {
        type: "number",
        min: String(range.minimum),
        max: String(range.maximum),
        step: String(range.step),
        placeholder: String(endpoint),
        inputmode: "decimal",
        "data-range-control": bound,
        "aria-label": `${field.label} — ${bound === "minimum" ? "minimum" : "maximum"}${field.unit ? ` (${field.unit})` : ""}`,
    });
    label.append(copy, control);
    wrapper.append(proxy, label);
    return wrapper;
}
