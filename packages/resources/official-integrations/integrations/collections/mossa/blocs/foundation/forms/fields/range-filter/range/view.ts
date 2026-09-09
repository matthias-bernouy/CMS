import { formatRangeNumber, type NumericRange, type RangeValues } from "./values";

export type RangeMode = "range" | "min" | "max";

export function readRangeMode(host: HTMLElement): RangeMode {
    const mode = host.getAttribute("mode");
    return mode === "min" || mode === "max" ? mode : "range";
}

export function renderRange(
    host: HTMLElement,
    root: ShadowRoot,
    values: RangeValues,
    range: NumericRange,
    mode: RangeMode,
): void {
    const minimumHandle = root.querySelector<HTMLInputElement>(".input-min")!;
    const maximumHandle = root.querySelector<HTMLInputElement>(".input-max")!;
    const rangeElement = root.querySelector<HTMLElement>(".range")!;
    const labelElement = root.querySelector<HTMLElement>(".label")!;
    const unit = host.getAttribute("unit")?.trim() || "";
    const label = host.getAttribute("label")?.trim() || "";
    const language = host.ownerDocument.documentElement.lang || "en-US";

    for (const input of [minimumHandle, maximumHandle]) {
        input.min = String(range.minimum);
        input.max = String(range.maximum);
        input.step = String(range.step);
    }
    minimumHandle.value = String(mode === "max" ? range.minimum : values.minimum);
    maximumHandle.value = String(mode === "min" ? range.maximum : values.maximum);
    minimumHandle.ariaLabel = label ? `${label} minimum` : "Minimum";
    maximumHandle.ariaLabel = label ? `${label} maximum` : "Maximum";

    const span = range.maximum - range.minimum || 1;
    const leftValue = mode === "max" ? range.minimum : values.minimum;
    const rightValue = mode === "min" ? range.maximum : values.maximum;
    rangeElement.style.setProperty("--_mossa-lo", `${((leftValue - range.minimum) / span) * 100}%`);
    rangeElement.style.setProperty("--_mossa-hi", `${((rightValue - range.minimum) / span) * 100}%`);
    rangeElement.style.setProperty(
        "--_mossa-min-z",
        values.minimum === values.maximum && values.maximum === range.maximum ? "3" : "1",
    );

    const suffix = unit ? ` ${unit}` : "";
    const minimumText = formatRangeNumber(values.minimum, language, range.step);
    const maximumText = formatRangeNumber(values.maximum, language, range.step);
    const valueLabel =
        mode === "max"
            ? `${maximumText}${suffix}`
            : mode === "min"
              ? `${minimumText}${suffix}`
              : `${minimumText} — ${maximumText}${suffix}`;
    labelElement.textContent = `${label ? `${label}: ` : ""}${valueLabel}`;
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", label || valueLabel);
}
