import { NumericRangeElements } from "./range-elements";
import {
    activateSlider,
    commitManualControl,
    commitSlider,
    updateManualControl,
    updateSlider,
} from "./range-interactions";
import { snapRangeValue } from "./range-values";
import { applyRangeView, markRangePending, markRangeReady } from "./range-view";

export class NumericRangeFilters {
    constructor(host) {
        this.host = host;
        this.elements = new NumericRangeElements(host);
        this.timer = null;
        this.writingProxy = false;
        this.activeBound = null;
        this.readUrlOnSync = true;
    }

    connect() {
        markRangePending(this.host);
        this.listen("addEventListener");
        this.host.ownerDocument.addEventListener("cms-params:change", this.onParamsChange, true);
        this.host.ownerDocument.defaultView?.addEventListener("popstate", this.onPopState, true);
        this.schedule(true);
    }

    disconnect() {
        this.listen("removeEventListener");
        this.host.ownerDocument.removeEventListener("cms-params:change", this.onParamsChange, true);
        this.host.ownerDocument.defaultView?.removeEventListener("popstate", this.onPopState, true);
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    listen(method) {
        for (const slider of [this.elements.minimumSlider, this.elements.maximumSlider]) {
            slider?.[method]("input", this.onSliderInput);
            slider?.[method]("change", this.onSliderChange);
            slider?.[method]("focus", this.onSliderActivate);
            slider?.[method]("pointerdown", this.onSliderActivate);
        }
        for (const control of [this.elements.minimumControl, this.elements.maximumControl]) {
            control?.[method]("input", this.onManualInput);
            control?.[method]("change", this.onManualChange);
        }
        for (const proxy of [this.elements.minimumProxy, this.elements.maximumProxy]) {
            proxy?.[method]("input", this.onProxyChange);
            proxy?.[method]("change", this.onProxyChange);
        }
    }

    schedule = (fromUrl = false) => {
        this.readUrlOnSync ||= fromUrl;
        if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = null;
                if (this.host.isConnected) {
                    const readUrl = this.readUrlOnSync;
                    this.readUrlOnSync = false;
                    this.syncValues(readUrl);
                }
            }, 0);
        }
    };

    onProxyChange = () => {
        if (!this.writingProxy) {
            this.activeBound = null;
            markRangePending(this.host);
            this.schedule();
        }
    };

    onParamsChange = () => {
        if (!this.writingProxy) {
            this.activeBound = null;
            markRangePending(this.host);
        }
        this.schedule(true);
    };

    onPopState = () => {
        this.activeBound = null;
        markRangePending(this.host);
        this.schedule(true);
    };

    onSliderActivate = (event) => {
        activateSlider(this, event);
    };

    onSliderInput = (event) => {
        updateSlider(this, event);
    };

    onSliderChange = (event) => {
        commitSlider(this, event);
    };

    onManualInput = (event) => {
        updateManualControl(this, event);
    };

    onManualChange = (event) => {
        commitManualControl(this, event);
    };

    syncValues(fromUrl) {
        const rangeValue = fromUrl ? this.urlValue.bind(this) : this.proxyValue.bind(this);
        let minimum = rangeValue(this.elements.minimumProxy, this.elements.domainMinimum);
        const maximum = rangeValue(this.elements.maximumProxy, this.elements.domainMaximum);
        minimum = Math.min(minimum, maximum);
        const minimumValue = minimum === this.elements.domainMinimum ? "" : String(minimum);
        const maximumValue = maximum === this.elements.domainMaximum ? "" : String(maximum);
        this.normalizeProxy(this.elements.minimumProxy, minimumValue);
        this.normalizeProxy(this.elements.maximumProxy, maximumValue);
        this.setValidity(this.elements.minimumControl, true);
        this.setValidity(this.elements.maximumControl, true);
        this.applyValues(minimum, maximum, true);
        markRangeReady(this.host);
    }

    urlValue(proxy, fallback) {
        const name = proxy?.getAttribute("cms-param-sync")?.trim() || proxy?.name?.trim();
        const search = this.host.ownerDocument.defaultView?.location.search;
        const raw = name && search !== undefined ? new URLSearchParams(search).get(name) : null;
        return raw === null || raw.trim() === "" ? fallback : this.value(raw, fallback);
    }

    applyValues(minimum, maximum, reflectManual = true) {
        applyRangeView(this.elements, minimum, maximum, reflectManual, this.activeBound);
    }
    normalizeProxy(proxy, value) {
        if (proxy && proxy.value !== value) {
            this.writeProxy(proxy, value, "change");
        }
    }
    writeProxy(proxy, value, eventName) {
        if (!proxy || (eventName === "input" && proxy.value === value)) {
            return;
        }
        proxy.value = value;
        this.writingProxy = true;
        try {
            proxy.dispatchEvent(new Event(eventName, { bubbles: true, composed: true }));
        } finally {
            this.writingProxy = false;
        }
    }
    setValidity(control, valid) {
        control.setCustomValidity(valid ? "" : "Choose a value within the range.");
        valid ? control.removeAttribute("aria-invalid") : control.setAttribute("aria-invalid", "true");
    }
    boundValue(minimum) {
        return this.proxyValue(
            minimum ? this.elements.minimumProxy : this.elements.maximumProxy,
            this.endpoint(minimum),
        );
    }
    proxyValue(proxy, fallback) {
        return proxy?.value === "" ? fallback : this.value(proxy?.value, fallback);
    }
    endpoint(minimum) {
        return minimum ? this.elements.domainMinimum : this.elements.domainMaximum;
    }
    value(value, fallback) {
        return snapRangeValue(
            Number(value),
            this.elements.domainMinimum,
            this.elements.domainMaximum,
            this.elements.step,
            fallback,
        );
    }
}
