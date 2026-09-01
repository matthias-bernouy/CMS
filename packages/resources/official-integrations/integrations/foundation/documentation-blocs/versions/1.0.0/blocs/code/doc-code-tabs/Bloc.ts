import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

let instanceCount = 0;

export class Bloc extends Component {
    _panelId = "";
    _slot = null;
    _tabs = null;
    constructor() {
        super({ css, template });
        instanceCount += 1;
        this._panelId = `code-tab-panel-${instanceCount}`;
        this.shadowRoot?.querySelector(".panel")?.setAttribute("id", this._panelId);
    }
    connectedCallback() {
        this._slot = this.shadowRoot?.querySelector("slot") ?? null;
        this._tabs = this.shadowRoot?.querySelector(".tabs") ?? null;
        this._slot?.addEventListener("slotchange", this._onChange);
        this._tabs?.addEventListener("click", this._onTabClick);
        this._tabs?.addEventListener("keydown", this._onTabKeydown);
        this._onChange();
    }
    disconnectedCallback() {
        this._slot?.removeEventListener("slotchange", this._onChange);
        this._tabs?.removeEventListener("click", this._onTabClick);
        this._tabs?.removeEventListener("keydown", this._onTabKeydown);
    }
    _onChange = () => {
        if (!this._tabs) {
            return;
        }
        const children = this._slot?.assignedElements() ?? [];
        this._tabs.innerHTML = "";
        children.forEach((el, i) => {
            const label =
                el.getAttribute("filename") ||
                el.querySelector('[slot="filename"]')?.textContent?.trim() ||
                el.getAttribute("language") ||
                `Tab ${i + 1}`;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tab";
            btn.setAttribute("role", "tab");
            btn.id = `${this._panelId}-tab-${i}`;
            btn.setAttribute("aria-controls", this._panelId);
            btn.setAttribute("aria-selected", String(i === 0));
            btn.tabIndex = i === 0 ? 0 : -1;
            btn.dataset.index = String(i);
            btn.textContent = label;
            if (i === 0) {
                btn.classList.add("active");
                this.shadowRoot?.querySelector(".panel")?.setAttribute("aria-labelledby", btn.id);
            }
            this._tabs.appendChild(btn);
            el.style.display = i === 0 ? "" : "none";
        });
    };
    _onTabClick = (e) => {
        const btn = e.target.closest(".tab");
        if (!btn) {
            return;
        }
        this._activate(Number(btn.dataset.index));
    };
    _onTabKeydown = (e) => {
        const tabs = Array.from(this._tabs?.querySelectorAll(".tab") ?? []);
        const current = tabs.indexOf(e.target);
        if (current < 0) {
            return;
        }
        const last = tabs.length - 1;
        const next =
            e.key === "ArrowRight"
                ? current === last
                    ? 0
                    : current + 1
                : e.key === "ArrowLeft"
                  ? current === 0
                      ? last
                      : current - 1
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? last
                      : -1;
        if (next < 0) {
            return;
        }
        e.preventDefault();
        this._activate(next, true);
    };
    _activate = (index, focus = false) => {
        const tabs = Array.from(this._tabs?.querySelectorAll(".tab") ?? []);
        tabs.forEach((tab, i) => {
            const active = i === index;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-selected", String(active));
            tab.tabIndex = active ? 0 : -1;
            if (active && focus) {
                tab.focus();
            }
            if (active) {
                this.shadowRoot?.querySelector(".panel")?.setAttribute("aria-labelledby", tab.id);
            }
        });
        const children = this._slot?.assignedElements() ?? [];
        children.forEach((el, i) => {
            el.style.display = i === index ? "" : "none";
        });
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc);
