import { formatRangeValue, rangePrecision } from "./range-values";

export function applyRangeView(elements, minimum, maximum, reflectManual, activeBound) {
    elements.minimumSlider.max = String(maximum);
    elements.maximumSlider.min = String(minimum);
    elements.minimumSlider.value = String(minimum);
    elements.maximumSlider.value = String(maximum);
    if (reflectManual) {
        elements.minimumControl.value = minimum === elements.domainMinimum ? "" : String(minimum);
        elements.maximumControl.value = maximum === elements.domainMaximum ? "" : String(maximum);
    }
    const span = elements.domainMaximum - elements.domainMinimum;
    const start = span > 0 ? ((minimum - elements.domainMinimum) / span) * 100 : 0;
    const end = span > 0 ? ((maximum - elements.domainMinimum) / span) * 100 : 100;
    elements.track?.style.setProperty("--_mossa-range-start", `${start}%`);
    elements.track?.style.setProperty("--_mossa-range-end", `${end}%`);
    const precision = rangePrecision(elements.domainMinimum, elements.domainMaximum, elements.step);
    const separator = minimum === maximum ? "" : ` – ${formatRangeValue(maximum, elements.locale, precision)}`;
    elements.output.textContent = `${formatRangeValue(minimum, elements.locale, precision)}${separator}${elements.unit ? ` ${elements.unit}` : ""}`;
    applyHandleLayers(elements, minimum, maximum, activeBound);
}

export function markRangePending(host) {
    host.setAttribute("data-range-status", "pending");
}

export function markRangeReady(host) {
    host.setAttribute("data-range-status", "ready");
    host.dispatchEvent(
        new CustomEvent("mossa-commerce-offer-filter:state", {
            bubbles: true,
            composed: true,
            detail: { state: "range-ready" },
        }),
    );
}

function applyHandleLayers(elements, minimum, maximum, activeBound) {
    let top = activeBound;
    if (minimum === maximum && !top) {
        top = minimum === elements.domainMaximum ? "minimum" : "maximum";
    }
    elements.minimumSlider.style.zIndex = top === "minimum" ? "2" : "1";
    elements.maximumSlider.style.zIndex = top === "maximum" ? "2" : "1";
}
