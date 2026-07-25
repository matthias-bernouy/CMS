import { isRangeValue } from "./values";

export function activateSlider(range, event) {
    range.activeBound = event.currentTarget === range.elements.minimumSlider ? "minimum" : "maximum";
    range.applyValues(range.boundValue(true), range.boundValue(false), false);
}

export function updateSlider(range, event) {
    const minimumEdited = event.currentTarget === range.elements.minimumSlider;
    range.activeBound = minimumEdited ? "minimum" : "maximum";
    let minimum = range.value(range.elements.minimumSlider?.value, range.elements.domainMinimum);
    let maximum = range.value(range.elements.maximumSlider?.value, range.elements.domainMaximum);
    if (minimum > maximum) {
        [minimum, maximum] = minimumEdited ? [maximum, maximum] : [minimum, minimum];
    }
    range.applyValues(minimum, maximum);
    const proxy = minimumEdited ? range.elements.minimumProxy : range.elements.maximumProxy;
    const value = minimumEdited ? minimum : maximum;
    range.writeProxy(proxy, value === range.endpoint(minimumEdited) ? "" : String(value), "input");
}

export function commitSlider(range, event) {
    const proxy =
        event.currentTarget === range.elements.minimumSlider
            ? range.elements.minimumProxy
            : range.elements.maximumProxy;
    range.writeProxy(proxy, proxy?.value || "", "change");
}

export function updateManualControl(range, event) {
    const minimumEdited = event.currentTarget === range.elements.minimumControl;
    const control = event.currentTarget;
    const requested = control.value === "" ? range.endpoint(minimumEdited) : Number(control.value);
    const opposite = range.boundValue(!minimumEdited);
    const ordered = minimumEdited ? requested <= opposite : requested >= opposite;
    const valid = isRangeValue(
        requested,
        range.elements.domainMinimum,
        range.elements.domainMaximum,
        range.elements.step,
    );
    range.setValidity(control, valid && ordered);
    if (!valid || !ordered) {
        return;
    }
    range.activeBound = minimumEdited ? "minimum" : "maximum";
    const minimum = minimumEdited ? requested : range.boundValue(true);
    const maximum = minimumEdited ? range.boundValue(false) : requested;
    range.applyValues(minimum, maximum, false);
    const proxy = minimumEdited ? range.elements.minimumProxy : range.elements.maximumProxy;
    range.writeProxy(proxy, requested === range.endpoint(minimumEdited) ? "" : String(requested), "input");
}

export function commitManualControl(range, event) {
    const minimumEdited = event.currentTarget === range.elements.minimumControl;
    const opposite = range.boundValue(!minimumEdited);
    let value = event.currentTarget.value === "" ? range.endpoint(minimumEdited) : Number(event.currentTarget.value);
    value = range.value(value, opposite);
    value = minimumEdited ? Math.min(value, opposite) : Math.max(value, opposite);
    range.setValidity(event.currentTarget, true);
    range.activeBound = minimumEdited ? "minimum" : "maximum";
    range.applyValues(
        minimumEdited ? value : range.boundValue(true),
        minimumEdited ? range.boundValue(false) : value,
        true,
    );
    const proxy = minimumEdited ? range.elements.minimumProxy : range.elements.maximumProxy;
    range.writeProxy(proxy, value === range.endpoint(minimumEdited) ? "" : String(value), "change");
}
