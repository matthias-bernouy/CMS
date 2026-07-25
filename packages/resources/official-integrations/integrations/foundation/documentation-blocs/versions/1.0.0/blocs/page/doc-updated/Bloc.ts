import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

export class Bloc extends Component {
    _time = null;
    _dateSlot = null;
    constructor() {
        super({ css, template });
    }
    connectedCallback() {
        this._time = this.shadowRoot?.querySelector(".time") ?? null;
        this._dateSlot = this.shadowRoot?.querySelector('slot[name="date"]') ?? null;
        this._dateSlot?.addEventListener("slotchange", this._sync);
        this._sync();
    }
    disconnectedCallback() {
        this._dateSlot?.removeEventListener("slotchange", this._sync);
    }
    _sync = () => {
        if (!this._time) {
            return;
        }
        const raw =
            this._dateSlot
                ?.assignedNodes({ flatten: true })
                .map((n) => n.textContent ?? "")
                .join("")
                .trim() ?? "";
        if (!raw) {
            this._time.textContent = "";
            return;
        }
        const date = new Date(raw);
        if (isNaN(date.getTime())) {
            this._time.textContent = raw;
            return;
        }
        const locale = this.getAttribute("locale") ?? "en";
        const format = this.getAttribute("format") ?? "relative";
        const abs = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
        const rel = this._relative(date, locale);
        if (format === "absolute") {
            this._time.textContent = abs;
        } else if (format === "both") {
            this._time.textContent = `${abs} (${rel})`;
        } else {
            this._time.textContent = rel;
        }
        this._time.setAttribute("datetime", date.toISOString());
    };
    _relative(date, locale) {
        const diffMs = date.getTime() - Date.now();
        const diffDays = Math.round(diffMs / 86400000);
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
        if (Math.abs(diffDays) < 1) {
            return rtf.format(Math.round(diffMs / 3600000), "hour");
        }
        if (Math.abs(diffDays) < 30) {
            return rtf.format(diffDays, "day");
        }
        if (Math.abs(diffDays) < 365) {
            return rtf.format(Math.round(diffDays / 30), "month");
        }
        return rtf.format(Math.round(diffDays / 365), "year");
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
