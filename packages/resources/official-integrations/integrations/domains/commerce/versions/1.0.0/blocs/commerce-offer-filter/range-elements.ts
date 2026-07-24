export class NumericRangeElements {
    constructor(host) {
        this.host = host;
    }

    get domainMinimum() {
        return Number(this.host.getAttribute("data-range-minimum"));
    }
    get domainMaximum() {
        return Number(this.host.getAttribute("data-range-maximum"));
    }
    get step() {
        return Number(this.minimumSlider?.step || 1);
    }
    get unit() {
        return this.host.getAttribute("data-range-unit") || "";
    }
    get locale() {
        return this.host.ownerDocument.documentElement.lang || undefined;
    }
    get minimumSlider() {
        return this.host.querySelector('[data-range-slider="minimum"]');
    }
    get maximumSlider() {
        return this.host.querySelector('[data-range-slider="maximum"]');
    }
    get minimumControl() {
        return this.host.querySelector('[data-range-control="minimum"]');
    }
    get maximumControl() {
        return this.host.querySelector('[data-range-control="maximum"]');
    }
    get minimumProxy() {
        return this.host.querySelector('[data-range-proxy="minimum"]');
    }
    get maximumProxy() {
        return this.host.querySelector('[data-range-proxy="maximum"]');
    }
    get track() {
        return this.host.querySelector("[data-range-track]");
    }
    get output() {
        return this.host.querySelector("[data-range-output]");
    }
}
