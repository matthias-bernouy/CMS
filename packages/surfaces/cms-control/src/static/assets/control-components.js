(() => {
  // ../../foundation/components/dist/index.js
  class s extends HTMLElement {
    _rawStyles = "";
    _styles = null;
    constructor(t) {
      super();
      let e = this.attachShadow({ mode: "open" });
      if (t) {
        this._rawStyles = t.css, this._styles = document.createElement("style"), this._styles.innerHTML = t.css, e.appendChild(this._styles);
        let r = document.createElement("template");
        r.innerHTML = t.template, e.appendChild(r.content.cloneNode(true));
      }
    }
    registerCSSVariables(t) {
      if (!this._styles)
        return;
      let e = this._rawStyles;
      Object.entries(t).forEach(([r, i]) => {
        e = e.replaceAll("var(--" + r + ")", i);
      }), this._styles.innerHTML = e;
    }
    connectedCallback() {}
  }
  function d(t, e) {
    if (Object.prototype.hasOwnProperty.call(t, e)) {
      let r = t[e];
      delete t[e], t[e] = r;
    }
  }
  var Qt = `<div class="accordion" part="accordion">
    <slot></slot>
</div>
`;
  var Gt = `:host {
  display: block;

  --_border: var(--border-default, #e5e7eb);
  --_radius: 8px;
}

.accordion {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--_border);
  border-radius: var(--_radius);
  overflow: hidden;
}

::slotted(p9r-accordion-item:not(:last-child)) {
  border-bottom: 1px solid var(--_border);
}

:host([flush]) .accordion {
  border: 0;
  border-radius: 0;
}

:host([flush]) ::slotted(p9r-accordion-item) {
  border-bottom: 1px solid var(--_border);
}
`;

  class Yt extends s {
    constructor() {
      super({ css: Gt, template: Qt });
    }
    connectedCallback() {
      this.addEventListener("accordion-item-toggle", this._handleItemToggle);
    }
    disconnectedCallback() {
      this.removeEventListener("accordion-item-toggle", this._handleItemToggle);
    }
    _items() {
      return Array.from(this.querySelectorAll("p9r-accordion-item"));
    }
    _handleItemToggle = (t) => {
      if (this.hasAttribute("multiple"))
        return;
      if (!t.detail.open)
        return;
      let e = t.target;
      for (let r of this._items())
        if (r !== e)
          r.removeAttribute("open");
    };
  }
  var Jt = `<div class="item" part="item">
    <div class="header" part="header">
        <button class="toggle title-toggle" part="title" type="button" aria-expanded="false">
            <span class="title"><slot name="header"></slot></span>
        </button>
        <span class="actions" part="actions"><slot name="header-actions"></slot></span>
        <button class="toggle chevron-toggle" type="button" tabindex="-1" aria-hidden="true">
            <span class="chevron" part="chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </span>
        </button>
    </div>
    <div class="panel" part="panel" role="region">
        <div class="content" part="content">
            <slot></slot>
        </div>
    </div>
</div>
`;
  var Ot = `:host {
  display: block;

  --_text: var(--text-main, #1f2937);
  --_muted: var(--text-muted, #6b7280);
  --_bg: transparent;
  --_hover-bg: var(--bg-base, #f8fafc);
  --_padding-y: 0.85rem;
  --_padding-x: 1rem;
}

.item {
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: stretch;
  width: 100%;
  background: var(--_bg);
}

.header:hover { background: var(--_hover-bg); }

.toggle {
  display: flex;
  align-items: center;
  background: transparent;
  border: 0;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--_text);
  cursor: pointer;
}

.title-toggle {
  flex: 1;
  min-width: 0;
  padding: var(--_padding-y) var(--_padding-x);
  text-align: left;
}

.chevron-toggle {
  flex: 0 0 auto;
  padding: var(--_padding-y) var(--_padding-x);
}

.actions {
  display: flex;
  align-items: center;
}

.toggle:focus-visible {
  outline: 2px solid var(--primary-base, #4361ee);
  outline-offset: -2px;
}

.title {
  flex: 1;
  min-width: 0;
}

.chevron {
  display: inline-flex;
  width: 16px;
  height: 16px;
  color: var(--_muted);
}

.chevron svg {
  width: 100%;
  height: 100%;
}

@media (prefers-reduced-motion: no-preference) {
  .chevron { transition: transform 0.18s ease; }
  .panel { transition: grid-template-rows 0.18s ease; }
}

:host([open]) .chevron {
  transform: rotate(180deg);
}

.panel {
  display: grid;
  grid-template-rows: 0fr;
}

:host([open]) .panel {
  grid-template-rows: 1fr;
}

.content {
  overflow: hidden;
  padding: 0 var(--_padding-x);
  font-size: 14px;
  color: var(--_text);
}

:host([open]) .content {
  padding-bottom: var(--_padding-y);
}

:host([disabled]) .toggle {
  opacity: 0.5;
  cursor: not-allowed;
}
`;

  class Wt extends s {
    _toggles;
    _titleToggle;
    static get observedAttributes() {
      return ["open", "disabled"];
    }
    constructor() {
      super({ css: Ot, template: Jt });
      this._toggles = Array.from(this.shadowRoot?.querySelectorAll(".toggle") ?? []), this._titleToggle = this.shadowRoot?.querySelector(".title-toggle") ?? null;
    }
    connectedCallback() {
      for (let t of ["open", "disabled"])
        d(this, t);
      this._toggles.forEach((t) => t.addEventListener("click", this._toggle)), this._syncAria();
    }
    disconnectedCallback() {
      this._toggles.forEach((t) => t.removeEventListener("click", this._toggle));
    }
    attributeChangedCallback(t, e, r) {
      if (t === "open" || t === "disabled")
        this._syncAria();
    }
    _toggle = () => {
      if (this.hasAttribute("disabled"))
        return;
      let t = !this.hasAttribute("open");
      if (t)
        this.setAttribute("open", "");
      else
        this.removeAttribute("open");
      this.dispatchEvent(new CustomEvent("accordion-item-toggle", { bubbles: true, detail: { open: t } }));
    };
    _syncAria() {
      this._titleToggle?.setAttribute("aria-expanded", String(this.hasAttribute("open")));
      let t = this.hasAttribute("disabled");
      for (let e of this._toggles)
        if (t)
          e.setAttribute("disabled", "");
        else
          e.removeAttribute("disabled");
    }
    get open() {
      return this.hasAttribute("open");
    }
    set open(t) {
      if (t)
        this.setAttribute("open", "");
      else
        this.removeAttribute("open");
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      if (t)
        this.setAttribute("disabled", "");
      else
        this.removeAttribute("disabled");
    }
  }
  var te = `<div class="alert" part="alert" role="alert">
    <span class="icon" part="icon" aria-hidden="true">
        <slot name="icon"></slot>
    </span>
    <div class="body" part="body">
        <strong class="title" part="title"><slot name="title"></slot></strong>
        <div class="message" part="message"><slot></slot></div>
    </div>
    <button class="close" part="close" aria-label="Dismiss" hidden>&times;</button>
</div>
`;
  var ee = `:host {
  display: block;

  --_bg: var(--info-muted, #eff6ff);
  --_color: var(--info-contrasted, #1e3a8a);
  --_accent: var(--info-base, #3b82f6);
  --_border: var(--info-base, #3b82f6);
  --_radius: 10px;
  --_padding: 0.85rem 1rem;

  --ctx-bg: var(--_bg);
  --ctx-fg: var(--_color);
  --ctx-fg-muted: color-mix(in oklab, var(--_color) 72%, var(--_bg));
  --ctx-border: var(--_border);
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: var(--_padding);
  background: var(--_bg);
  color: var(--_color);
  border-radius: var(--_radius);
  border-left: 4px solid var(--_border);
  font-size: 14px;
  line-height: 1.45;
}

.icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--_accent);
  margin-top: 1px;
}

.icon:has(slot[name="icon"]:not(:has(*))) {
  display: none;
}

.body {
  flex: 1;
  min-width: 0;
}

.title {
  display: block;
  font-weight: 600;
  margin-bottom: 0.15rem;
}

.title:has(slot[name="title"]:not(:has(*))) {
  display: none;
}

.message.is-empty {
  display: none;
}

.close {
  flex: 0 0 auto;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  opacity: 0.6;
}

.close:hover { opacity: 1; }
`;
  var re = `:host([type="success"]) {
  --_bg: var(--success-muted);
  --_color: var(--success-contrasted);
  --_accent: var(--success-base);
  --_border: var(--success-base);
}

:host([type="warning"]) {
  --_bg: var(--warning-muted);
  --_color: var(--warning-contrasted);
  --_accent: var(--warning-base);
  --_border: var(--warning-base);
}

:host([type="error"]),
:host([type="danger"]) {
  --_bg: var(--danger-muted);
  --_color: var(--danger-contrasted);
  --_accent: var(--danger-base);
  --_border: var(--danger-base);
}

:host([icon]) .icon:has(slot[name="icon"]:not(:has(*))) {
  display: inline-flex;
  background-color: var(--_accent);
  border-radius: 50%;
  position: relative;
}

:host([icon][type="success"]) .icon::before,
:host([type="success"]:not([icon="false"])) .icon:has(slot[name="icon"]:not(:has(*)))::before {
  content: "✓";
  color: var(--bg-surface);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

:host([icon][type="warning"]) .icon::before,
:host([type="warning"]:not([icon="false"])) .icon:has(slot[name="icon"]:not(:has(*)))::before,
:host([icon][type="error"]) .icon::before,
:host([type="error"]:not([icon="false"])) .icon:has(slot[name="icon"]:not(:has(*)))::before,
:host([icon][type="danger"]) .icon::before,
:host([type="danger"]:not([icon="false"])) .icon:has(slot[name="icon"]:not(:has(*)))::before {
  content: "!";
  color: var(--bg-surface);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

:host([icon]) .icon:has(slot[name="icon"]:not(:has(*)))::before,
:host(:not([type])) .icon:has(slot[name="icon"]:not(:has(*)))::before,
:host([type="info"]) .icon:has(slot[name="icon"]:not(:has(*)))::before {
  content: "i";
  color: var(--bg-surface);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

:host([dismissible]) .close {
  display: inline-block;
}

:host([leaving]) {
  animation: alert-out 160ms ease-in forwards;
}

@keyframes alert-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-6px); }
}
`;
  var wn = ee + re;

  class ie extends s {
    _close;
    _message;
    _messageSlot;
    static get observedAttributes() {
      return ["dismissible"];
    }
    constructor() {
      super({ css: wn, template: te });
      this._close = this.shadowRoot?.querySelector(".close") ?? null, this._message = this.shadowRoot?.querySelector(".message") ?? null, this._messageSlot = this.shadowRoot?.querySelector(".message slot") ?? null;
    }
    connectedCallback() {
      this._syncDismissible(), this._close?.addEventListener("click", this._handleClose), this._messageSlot?.addEventListener("slotchange", this._syncMessage), this._syncMessage();
    }
    disconnectedCallback() {
      this._close?.removeEventListener("click", this._handleClose), this._messageSlot?.removeEventListener("slotchange", this._syncMessage);
    }
    _syncMessage = () => {
      if (!this._message || !this._messageSlot)
        return;
      let t = this._messageSlot.assignedNodes({ flatten: true }).some((e) => e.nodeType === Node.ELEMENT_NODE || (e.textContent ?? "").trim() !== "");
      this._message.classList.toggle("is-empty", !t);
    };
    attributeChangedCallback(t, e, r) {
      if (t === "dismissible")
        this._syncDismissible();
    }
    _syncDismissible() {
      if (!this._close)
        return;
      this._close.hidden = !this.hasAttribute("dismissible");
    }
    _handleClose = () => {
      if (!this.dispatchEvent(new CustomEvent("dismiss", { bubbles: true, cancelable: true })))
        return;
      this.setAttribute("leaving", ""), this.addEventListener("animationend", () => this.remove(), { once: true });
    };
    dismiss() {
      this._handleClose();
    }
  }
  var ae = `<div class="avatar" part="avatar">
    <img class="image" part="image" alt="" hidden />
    <span class="initials" part="initials" aria-hidden="true"></span>
    <span class="fallback" part="fallback"><slot></slot></span>
</div>
`;
  var oe = `:host {
  display: inline-block;

  --_size: 2.5rem;
  --_radius: 50%;
  --_bg: var(--secondary-muted, #e5e7eb);
  --_color: var(--text-main, #1f2937);
  --_border: 0px solid transparent;
  --_font-size: calc(var(--_size) * 0.4);

  --ctx-bg: var(--_bg);
  --ctx-fg: var(--_color);
  --ctx-fg-muted: var(--text-muted);
  --ctx-border: transparent;
}

:host([size="xs"]) { --_size: 1.25rem; }
:host([size="sm"]) { --_size: 1.75rem; }
:host([size="md"]) { --_size: 2.5rem; }
:host([size="lg"]) { --_size: 3.5rem; }
:host([size="xl"]) { --_size: 5rem; }

:host([shape="square"]) { --_radius: 6px; }
:host([shape="rounded"]) { --_radius: 12px; }

:host([color="primary"]) { --_bg: var(--primary-muted); --_color: var(--primary-contrasted); }
:host([color="danger"])  { --_bg: var(--danger-muted);  --_color: var(--danger-contrasted); }
:host([color="success"]) { --_bg: var(--success-muted); --_color: var(--success-contrasted); }
:host([color="info"])    { --_bg: var(--info-muted);    --_color: var(--info-contrasted); }
:host([color="warning"]) { --_bg: var(--warning-muted); --_color: var(--warning-contrasted); }

:host([bordered]) {
  --_border: 2px solid var(--bg-surface, #fff);
  --ctx-border: var(--bg-surface);
}

.avatar {
  position: relative;
  width: var(--_size);
  height: var(--_size);
  border-radius: var(--_radius);
  background: var(--_bg);
  color: var(--_color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: var(--_border);
  box-sizing: border-box;
  font-size: var(--_font-size);
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.image[hidden] { display: none; }

.initials:empty { display: none; }

.avatar:has(.image:not([hidden])) .initials,
.avatar:has(.image:not([hidden])) .fallback {
  display: none;
}

.fallback:has(slot:not(:has(*))) { display: none; }

::slotted(svg) {
  width: 60%;
  height: 60%;
}
`;

  class ne extends s {
    _img;
    _initials;
    static get observedAttributes() {
      return ["src", "alt", "name", "initials"];
    }
    constructor() {
      super({ css: oe, template: ae });
      this._img = this.shadowRoot?.querySelector(".image") ?? null, this._initials = this.shadowRoot?.querySelector(".initials") ?? null;
    }
    connectedCallback() {
      if (this._img)
        this._img.addEventListener("error", this._handleImageError);
      this._syncImage(), this._syncInitials();
    }
    disconnectedCallback() {
      if (this._img)
        this._img.removeEventListener("error", this._handleImageError);
    }
    attributeChangedCallback(t, e, r) {
      if (t === "src" || t === "alt")
        this._syncImage();
      if (t === "name" || t === "initials")
        this._syncInitials();
    }
    _syncImage() {
      if (!this._img)
        return;
      let t = this.getAttribute("src"), e = this.getAttribute("alt") ?? this.getAttribute("name") ?? "";
      if (t)
        this._img.src = t, this._img.alt = e, this._img.hidden = false;
      else
        this._img.hidden = true, this._img.removeAttribute("src");
    }
    _syncInitials() {
      if (!this._initials)
        return;
      let t = this.getAttribute("initials");
      if (t) {
        this._initials.textContent = t;
        return;
      }
      let e = this.getAttribute("name");
      if (!e) {
        this._initials.textContent = "";
        return;
      }
      this._initials.textContent = e.split(/\s+/).filter(Boolean).slice(0, 2).map((r) => r[0]).join("").toUpperCase();
    }
    _handleImageError = () => {
      if (this._img)
        this._img.hidden = true;
    };
  }
  var se = `<span class="badge" part="badge">
    <span class="dot" part="dot" aria-hidden="true"></span>
    <span class="content" part="content"><slot></slot></span>
</span>
`;
  var le = `:host {
  display: inline-flex;

  --_bg: var(--secondary-muted, #f1f5f9);
  --_text: var(--text-main, #1f2937);
  --_border: transparent;
  --_padding-y: 0.15rem;
  --_padding-x: 0.5rem;
  --_radius: 999px;
  --_size: 11px;
  --_dot-color: var(--text-muted, #94a3b8);

  --ctx-bg: var(--_bg);
  --ctx-fg: var(--_text);
  --ctx-fg-muted: var(--text-muted);
  --ctx-border: var(--_border);
}

:host([color="primary"]) { --_bg: var(--primary-muted); --_text: var(--primary-contrasted); --_dot-color: var(--primary-base); }
:host([color="danger"])  { --_bg: var(--danger-muted);  --_text: var(--danger-contrasted);  --_dot-color: var(--danger-base); }
:host([color="success"]) { --_bg: var(--success-muted); --_text: var(--success-contrasted); --_dot-color: var(--success-base); }
:host([color="info"])    { --_bg: var(--info-muted);    --_text: var(--info-contrasted);    --_dot-color: var(--info-base); }
:host([color="warning"]) { --_bg: var(--warning-muted); --_text: var(--warning-contrasted); --_dot-color: var(--warning-base); }

:host([variant="filled"][color="primary"]) { --_bg: var(--primary-base); --_text: var(--primary-contrasted); }
:host([variant="filled"][color="danger"])  { --_bg: var(--danger-base);  --_text: var(--danger-contrasted); }
:host([variant="filled"][color="success"]) { --_bg: var(--success-base); --_text: var(--success-contrasted); }
:host([variant="filled"][color="info"])    { --_bg: var(--info-base);    --_text: var(--info-contrasted); }
:host([variant="filled"][color="warning"]) { --_bg: var(--warning-base); --_text: var(--warning-contrasted); }

:host([variant="outlined"]) {
  --_bg: transparent;
}
:host([variant="outlined"][color="primary"]) { --_border: var(--primary-base); --_text: var(--primary-base); }
:host([variant="outlined"][color="danger"])  { --_border: var(--danger-base);  --_text: var(--danger-base); }
:host([variant="outlined"][color="success"]) { --_border: var(--success-base); --_text: var(--success-base); }
:host([variant="outlined"][color="info"])    { --_border: var(--info-base);    --_text: var(--info-base); }
:host([variant="outlined"][color="warning"]) { --_border: var(--warning-base); --_text: var(--warning-base); }

:host([size="sm"]) { --_size: 10px; --_padding-y: 0.1rem; --_padding-x: 0.4rem; }
:host([size="md"]) { --_size: 11px; --_padding-y: 0.15rem; --_padding-x: 0.5rem; }
:host([size="lg"]) { --_size: 13px; --_padding-y: 0.25rem; --_padding-x: 0.7rem; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: var(--_padding-y) var(--_padding-x);
  background: var(--_bg);
  color: var(--_text);
  border: 1px solid var(--_border);
  border-radius: var(--_radius);
  font-size: var(--_size);
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
  white-space: nowrap;
}

.dot {
  display: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--_dot-color);
  flex-shrink: 0;
}

:host([dot]) .dot {
  display: inline-block;
}
`;

  class de extends s {
    constructor() {
      super({ css: le, template: se });
    }
  }
  var ge = `<article class="card" part="card">
    <header class="header" part="header">
        <slot name="header"></slot>
    </header>
    <section class="body" part="body">
        <slot></slot>
    </section>
    <footer class="footer" part="footer">
        <slot name="footer"></slot>
    </footer>
</article>
`;
  var ve = `:host {
  display: block;

  --_bg: var(--bg-surface, #ffffff);
  --_border-color: var(--border-default, #e5e7eb);
  --_border-width: 1px;
  --_radius: 12px;
  --_shadow: none;
  --_padding: 1.25rem;
  --_gap: 0.75rem;
  --_text: var(--text-main, #1f2937);

  --ctx-bg: var(--_bg);
  --ctx-fg: var(--_text);
  --ctx-fg-muted: var(--text-muted);
  --ctx-border: var(--_border-color);
}

:host([variant="outlined"]) {
  --_bg: var(--bg-surface);
  --_shadow: none;
}

:host([variant="elevated"]) {
  --_border-width: 0;
  --_shadow: 0 4px 12px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04);
}

:host([variant="filled"]) {
  --_bg: var(--bg-base, #f8fafc);
  --_border-width: 0;
  --_shadow: none;
}

:host([padding="none"]) { --_padding: 0; }
:host([padding="sm"])   { --_padding: 0.75rem; }
:host([padding="md"])   { --_padding: 1.25rem; }
:host([padding="lg"])   { --_padding: 2rem; }

.card {
  display: flex;
  flex-direction: column;
  background: var(--_bg);
  color: var(--_text);
  border: var(--_border-width) solid var(--_border-color);
  border-radius: var(--_radius);
  box-shadow: var(--_shadow);
  overflow: hidden;
}

.header,
.body,
.footer {
  padding: var(--_padding);
}

.header { border-bottom: 1px solid var(--_border-color); }
.footer { border-top: 1px solid var(--_border-color); }

.body { flex: 1; }

.header:has(slot[name="header"]:not(:has(*))),
.footer:has(slot[name="footer"]:not(:has(*))) {
  display: none;
}

:host([interactive]) {
  cursor: pointer;
}

:host([interactive]) .card {
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}

@media (prefers-reduced-motion: no-preference) {
  :host([interactive]) .card:hover {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }
}
`;

  class fe extends s {
    constructor() {
      super({ css: ve, template: ge });
    }
  }
  var _e = `:host {
    --_modal-width: 500px;
    --_modal-radius: 12px;
    --_modal-bg: var(--bg-surface);
    --_modal-border: var(--border-default);

    --ctx-bg: var(--_modal-bg);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--_modal-border);
}

dialog {
    border: 1px solid var(--_modal-border);
    border-radius: var(--_modal-radius);
    background: var(--_modal-bg);
    padding: 0;
    width: min(90vw, var(--_modal-width));
    max-height: 80vh;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    overflow: hidden;
    opacity: 0;
}

dialog[open] {
    opacity: 1;
}

dialog::backdrop {
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(4px);
    opacity: 0;
}

dialog[open]::backdrop {
    opacity: 1;
}

.modal-wrapper {
    display: flex;
    flex-direction: column;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.2rem 1.5rem;
    border-bottom: 1px solid var(--border-default);
}

.title-area {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-main);
    letter-spacing: -0.01em;
}

.body {
    padding: 1.5rem;
    color: var(--text-body);
    font-size: 14px;
    line-height: 1.5;
    overflow-y: auto;
}

footer.actions {
    padding: 1rem 1.5rem;
    background: var(--bg-base);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    border-top: 1px solid var(--border-default);
}

footer.actions slot[name="footer"]::slotted(*) {
    --ctx-bg: var(--bg-base);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--border-default);
}
`;
  var ye = `.close-icon {
    background: transparent;
    border: none;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;
    line-height: 1;
    padding: 8px;
    border-radius: 6px;
    aspect-ratio: 1/1;
}

.close-icon:hover {
    background: var(--bg-base);
    color: var(--text-main);
}

.close-icon:focus-visible {
    outline: 2px solid var(--primary-base, currentColor);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: no-preference) {
    dialog {
        transform: scale(0.95);
        transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                    display 0.2s allow-discrete,
                    overlay 0.2s allow-discrete;
    }

    dialog[open] {
        transform: scale(1);
    }

    dialog::backdrop {
        transition: opacity 0.2s allow-discrete;
    }

    @starting-style {
        dialog[open] {
            opacity: 0;
            transform: scale(0.95);
        }

        dialog[open]::backdrop {
            opacity: 0;
        }
    }

    .close-icon {
        transition: background 0.2s, color 0.2s;
    }
}
`;
  var Bn = _e + ye;
  var Ce = `<dialog id="drawer" part="dialog" aria-modal="true" role="dialog" aria-labelledby="title">
    <header part="header">
        <div id="title" part="title">
            <slot name="title">Dialog</slot>
        </div>
        <button id="close-btn" part="close" type="button" aria-label="Close">&times;</button>
    </header>

    <section class="content" part="content">
        <slot></slot>
    </section>

    <footer part="footer">
        <slot name="footer"></slot>
    </footer>
</dialog>
`;
  var Me = `:host {
    --drawer-width: 400px;
    --drawer-bg: var(--bg-surface);
    --transition-speed: 0.4s;
    --transition-curve: cubic-bezier(0.4, 0, 0.2, 1);

    --ctx-bg: var(--drawer-bg);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--border-default);

    position: fixed;
    top: 0;
    right: 0;
    z-index: 1000;
}

dialog {
    display: flex;
    flex-direction: column;
    margin-right: 0;
    margin-left: auto;
    height: 100dvh;
    width: var(--drawer-width);
    max-width: 100vw;
    border: none;
    padding: 0;
    background: var(--drawer-bg);
    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);

    transform: translateX(100%);
    opacity: 0;
    pointer-events: none;

    max-height: unset;
}

dialog[open] {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
}

dialog::backdrop {
    background: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0px);
}

dialog[open]::backdrop {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
}

dialog > * {
    pointer-events: auto;
}
`;
  var He = `header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    background-color: var(--drawer-bg);
    border-bottom: 1px solid var(--border-default);
    position: sticky;
    top: 0;
    z-index: 1;
}

header slot[name="title"]::slotted(*) {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-main);
    letter-spacing: -0.01em;
}

#close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 8px;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;
    line-height: 0;
}

#close-btn:hover {
    background-color: var(--bg-base);
    color: var(--text-main);
}

#close-btn:focus-visible {
    outline: 2px solid var(--primary-base);
    outline-offset: 2px;
}

.content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    scrollbar-width: thin;
}

footer {
    padding: 1.25rem 1.5rem;
    background-color: var(--bg-base);
    border-top: 1px solid var(--border-default);
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.75rem;
}

footer slot[name="footer"]::slotted(button) {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--border-default);
    background: var(--bg-surface);
    color: var(--text-main);
}

footer slot[name="footer"]::slotted(button[primary]) {
    background: var(--primary-base);
    color: var(--bg-surface);
    border-color: var(--primary-base);
}

footer slot[name="footer"]::slotted(button:hover) {
    filter: brightness(0.9);
}
`;
  var Te = `@media (prefers-reduced-motion: no-preference) {
    dialog {
        transition:
            transform var(--transition-speed) var(--transition-curve),
            opacity var(--transition-speed) var(--transition-curve),
            display var(--transition-speed) var(--transition-curve) allow-discrete,
            overlay var(--transition-speed) var(--transition-curve) allow-discrete;
    }

    @starting-style {
        dialog[open] {
            transform: translateX(100%);
            opacity: 0;
        }
    }

    dialog::backdrop {
        transition:
            background-color var(--transition-speed) var(--transition-curve),
            backdrop-filter var(--transition-speed) var(--transition-curve),
            display var(--transition-speed) var(--transition-curve) allow-discrete,
            overlay var(--transition-speed) var(--transition-curve) allow-discrete;
    }

    @starting-style {
        dialog[open]::backdrop {
            background: rgba(0, 0, 0, 0);
            backdrop-filter: blur(0px);
        }
    }

    header,
    footer,
    .content {
        transition: transform var(--transition-speed) var(--transition-curve);
    }

    #close-btn {
        transition: background-color 0.2s, color 0.2s;
    }

    footer slot[name="footer"]::slotted(button) {
        transition: all 0.2s;
    }
}
`;
  var ze = (t) => {
    t.dispatchEvent(new CustomEvent("open", { bubbles: true, composed: true }));
  };
  var Ie = (t) => {
    t.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };
  var Se = (t, e) => {
    let r = t.shadowRoot?.querySelector("dialog");
    if (e.target === r)
      t.close();
  };
  var qe = (t, e) => {
    e.preventDefault(), t.close();
  };
  var Pe = (t, e) => {
    e.preventDefault(), t.close();
  };
  var Be = (t) => {
    if (t.hasAttribute("open"))
      t.removeAttribute("open");
    Ie(t);
  };
  var Vn = Me + He + Te;

  class Fe extends s {
    _dialog;
    _closeBtn;
    static get observedAttributes() {
      return ["open"];
    }
    constructor() {
      super({ css: Vn, template: Ce });
      this._dialog = this.shadowRoot?.querySelector("dialog") ?? null, this._closeBtn = this.shadowRoot?.querySelector("#close-btn") ?? null;
    }
    connectedCallback() {
      d(this, "open"), this._dialog?.addEventListener("click", this._onBackdrop), this._dialog?.addEventListener("cancel", this._onCancel), this._dialog?.addEventListener("close", this._onClose), this._closeBtn?.addEventListener("click", this._onCloseClick);
    }
    disconnectedCallback() {
      this._dialog?.removeEventListener("click", this._onBackdrop), this._dialog?.removeEventListener("cancel", this._onCancel), this._dialog?.removeEventListener("close", this._onClose), this._closeBtn?.removeEventListener("click", this._onCloseClick);
    }
    attributeChangedCallback(t) {
      if (!this._dialog)
        return;
      if (t === "open") {
        let e = this.hasAttribute("open");
        if (e && !this._dialog.open)
          this._dialog.showModal();
        else if (!e && this._dialog.open)
          this._dialog.close();
      }
    }
    _onBackdrop = (t) => Se(this, t);
    _onCloseClick = (t) => qe(this, t);
    _onCancel = (t) => Pe(this, t);
    _onClose = () => Be(this);
    get open() {
      return this.hasAttribute("open");
    }
    set open(t) {
      if (t)
        this.setAttribute("open", "");
      else
        this.removeAttribute("open");
    }
    show() {
      if (!this._dialog)
        return;
      if (!this._dialog.open)
        this._dialog.showModal();
      if (!this.hasAttribute("open"))
        this.setAttribute("open", "");
      ze(this);
    }
    showModal() {
      this.show();
    }
    close() {
      if (!this._dialog)
        return;
      if (this._dialog.open)
        this._dialog.close();
    }
  }
  var Ke = (t, e) => {
    if (e.target === e.currentTarget)
      t.hide();
  };
  var De = (t, e) => {
    e.preventDefault(), t.hide();
  };
  var je = (t) => {
    if (t.hasAttribute("open"))
      t.removeAttribute("open");
    t.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };
  var Ve = `<dialog part="dialog">
    <form method="dialog" id="m-close"></form>
    <div class="panel" part="panel">
        <header class="header" part="header">
            <div class="title" part="title"><slot name="title"></slot></div>
            <button class="close" part="close" type="submit" form="m-close" aria-label="Close">&times;</button>
        </header>
        <section class="body" part="body"><slot></slot></section>
        <footer class="footer" part="footer"><slot name="footer"></slot></footer>
    </div>
</dialog>
`;
  var Ne = `:host {
    --modal-width: var(--p9r-modal-width, 520px);
    --modal-radius: var(--p9r-modal-radius, 12px);
    --modal-bg: var(--p9r-modal-bg, var(--bg-surface, #ffffff));
    --modal-border: var(--p9r-modal-border, var(--border-default, rgba(0,0,0,0.1)));
    --modal-pad: var(--p9r-modal-padding, 24px);
    --modal-shadow: var(--p9r-modal-shadow,
        0 20px 25px -5px rgba(0,0,0,0.1),
        0 10px 10px -5px rgba(0,0,0,0.04));

    --ctx-bg: var(--modal-bg);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--modal-border);
}

dialog {
    border: 1px solid var(--modal-border);
    border-radius: var(--modal-radius);
    background: transparent;
    padding: 0;
    width: min(90vw, var(--modal-width));
    max-height: 85vh;
    overflow: visible;
    opacity: 0;
}

dialog[open] { opacity: 1; }

dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
    opacity: 0;
}

dialog[open]::backdrop { opacity: 1; }

@media (prefers-reduced-motion: no-preference) {
    dialog {
        transform: scale(0.95) translateY(-8px);
        transition:
            opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
            transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
            display 0.2s allow-discrete,
            overlay 0.2s allow-discrete;
    }
    dialog[open] { transform: scale(1) translateY(0); }
    dialog::backdrop { transition: opacity 0.2s allow-discrete, display 0.2s allow-discrete, overlay 0.2s allow-discrete; }
    @starting-style {
        dialog[open] { opacity: 0; transform: scale(0.95) translateY(-8px); }
        dialog[open]::backdrop { opacity: 0; }
    }
}

.panel {
    background: var(--modal-bg);
    border-radius: var(--modal-radius);
    box-shadow: var(--modal-shadow);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: inherit;
}

.header, .footer { display: none; align-items: center; padding: 14px var(--modal-pad); }
.header { justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--modal-border); }
.footer { justify-content: flex-end; gap: 8px; border-top: 1px solid var(--modal-border); }

:host(:has(> [slot="title"])) .header,
:host(:not([no-close])) .header { display: flex; }
:host(:has(> [slot="footer"])) .footer { display: flex; }

.title { font-weight: 600; font-size: 1.05rem; }

.close {
    background: transparent; border: 0; cursor: pointer;
    font-size: 1.5rem; line-height: 1; padding: 2px 8px;
    color: inherit; border-radius: 6px;
}
.close:hover { background: color-mix(in oklab, var(--text-main) 6%, transparent); }
:host([no-close]) .close { display: none; }

.body { padding: var(--modal-pad); overflow: auto; }
`;

  class Re extends s {
    _dialog = null;
    _onBackdrop = (t) => Ke(this, t);
    _onCancel = (t) => De(this, t);
    _onClose = () => je(this);
    static get observedAttributes() {
      return ["open", "aria-label"];
    }
    constructor() {
      super({ css: Ne, template: Ve });
    }
    connectedCallback() {
      this._dialog ??= this.shadowRoot?.querySelector("dialog") ?? null, d(this, "open"), this._dialog?.addEventListener("click", this._onBackdrop), this._dialog?.addEventListener("cancel", this._onCancel), this._dialog?.addEventListener("close", this._onClose), this.addEventListener("form:success", this.hide), this._syncLabel(), this._syncOpen();
    }
    disconnectedCallback() {
      this._dialog?.removeEventListener("click", this._onBackdrop), this._dialog?.removeEventListener("cancel", this._onCancel), this._dialog?.removeEventListener("close", this._onClose), this.removeEventListener("form:success", this.hide);
    }
    attributeChangedCallback(t, e, r) {
      if (e === r || !this.isConnected)
        return;
      if (t === "aria-label")
        this._syncLabel();
      else if (t === "open")
        this._syncOpen();
    }
    _syncLabel() {
      let t = this.getAttribute("aria-label");
      if (t)
        this._dialog?.setAttribute("aria-label", t);
      else
        this._dialog?.removeAttribute("aria-label");
    }
    _syncOpen() {
      if (!this._dialog)
        return;
      let t = this.hasAttribute("open");
      if (t && !this._dialog.open)
        this._dialog.showModal(), this.dispatchEvent(new CustomEvent("open", { bubbles: true, composed: true }));
      else if (!t && this._dialog.open)
        this._dialog.close();
    }
    get open() {
      return this.hasAttribute("open");
    }
    set open(t) {
      t ? this.setAttribute("open", "") : this.removeAttribute("open");
    }
    show() {
      if (!this.hasAttribute("open"))
        this.setAttribute("open", "");
    }
    showModal() {
      this.show();
    }
    hide() {
      if (this.hasAttribute("open"))
        this.removeAttribute("open");
    }
    toggle() {
      if (this.open)
        this.hide();
      else
        this.show();
    }
  }
  var $e = `<slot></slot>
`;
  var Xe = `:host {
    display: contents;
    cursor: pointer;
}
`;

  class Ze extends s {
    constructor() {
      super({ css: Xe, template: $e });
    }
    connectedCallback() {
      if (!this.hasAttribute("role"))
        this.setAttribute("role", "button");
      if (!this.hasAttribute("tabindex"))
        this.setAttribute("tabindex", "0");
      this.addEventListener("click", this._open), this.addEventListener("keydown", this._handleKeydown);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._open), this.removeEventListener("keydown", this._handleKeydown);
    }
    _handleKeydown = (t) => {
      if (t.key !== "Enter" && t.key !== " ")
        return;
      t.preventDefault(), this._open();
    };
    _open = () => {
      let t = this.getAttribute("modal-target");
      if (!t)
        return;
      let e = this.getRootNode(), r = e.getElementById ? e.getElementById(t) : e.querySelector(`#${CSS.escape(t)}`);
      if (!r)
        return;
      if (typeof r.show === "function")
        r.show();
      else
        r.setAttribute("open", "");
    };
    get modalTarget() {
      return this.getAttribute("modal-target") ?? "";
    }
    set modalTarget(t) {
      if (t)
        this.setAttribute("modal-target", t);
      else
        this.removeAttribute("modal-target");
    }
  }
  var Ye = `<button id="btn" class="button" part="button">
    <slot name="icon-left"></slot>
    <span class="label">
        <slot>Button</slot>
    </span>
    <slot name="icon-right"></slot>
</button>
`;
  var Je = `:host {
  display: inline-block;

  --_btn-padding-y: 0.6rem;
  --_btn-padding-x: 1.2rem;
  --_btn-font-size: 13px;
  --_btn-line-height: 1;

  --_btn-bg: var(--bg-surface);
  --_btn-text: var(--text-main);
  --_btn-border: var(--border-default);
  --_btn-hover-bg: var(--bg-base);

  --_accent-base: var(--text-main);
  --_accent-muted: var(--bg-base);
  --_accent-contrast: var(--bg-surface);

  --_btn-radius: 8px;
  --_btn-font: inherit;

  --ctx-bg: var(--_btn-bg);
  --ctx-fg: var(--_btn-text);
  --ctx-fg-muted: var(--text-muted);
  --ctx-border: var(--_btn-border);
}

.button {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;

  padding: var(--_btn-padding-y) var(--_btn-padding-x);

  font-family: var(--_btn-font);
  font-size: var(--_btn-font-size);
  font-weight: 600;
  line-height: var(--_btn-line-height);
  letter-spacing: -0.015em;

  border-radius: var(--_btn-radius);
  border: 1.5px solid var(--_btn-border);
  background-color: var(--_btn-bg);
  color: var(--_btn-text);

  white-space: nowrap;
}

.button:focus-visible {
  outline: 2px solid var(--_accent-base);
  outline-offset: 2px;
}

.button:hover {
  background-color: var(--_btn-hover-bg);
  opacity: var(--_btn-hover-opacity, 1);
}

::slotted(svg) {
  width: 1.2rem;
}
`;
  var Oe = `:host([color="primary"]) {
  --_accent-base: var(--primary-base);
  --_accent-muted: var(--primary-muted);
  --_accent-contrast: var(--primary-contrasted);
}

:host([color="danger"]) {
  --_accent-base: var(--danger-base);
  --_accent-muted: var(--danger-muted);
  --_accent-contrast: var(--danger-contrasted);
}

:host([color="success"]) {
  --_accent-base: var(--success-base);
  --_accent-muted: var(--success-muted);
  --_accent-contrast: var(--success-contrasted);
}

:host([color="info"]) {
  --_accent-base: var(--info-base);
  --_accent-muted: var(--info-muted);
  --_accent-contrast: var(--info-contrasted);
}

:host([color="warning"]) {
  --_accent-base: var(--warning-base);
  --_accent-muted: var(--warning-muted);
  --_accent-contrast: var(--warning-contrasted);
}

:host([variant="filled"]) {
  --_btn-bg: var(--_accent-base);
  --_btn-text: var(--_accent-contrast);
  --_btn-border: transparent;
  --_btn-hover-bg: var(--_accent-base);
  --_btn-hover-opacity: 0.9;
  border-color: transparent;
}

:host([variant="outlined"]) {
  --_btn-bg: transparent;
  --_btn-border: var(--_accent-base);
  --_btn-text: var(--_accent-base);
  --_btn-hover-bg: var(--_accent-muted);
}

:host([variant="ghost"]) {
  --_btn-bg: transparent;
  --_btn-border: transparent;
  --_btn-text: var(--_accent-base);
  --_btn-hover-bg: var(--_accent-muted);
}

:host([fullwidth]), :host([fullwidth]) .button {
  width: 100%;
}

:host([align="left"]) .button {
  justify-content: start;
}

:host([align="right"]) .button {
  justify-content: end;
}

:host([disabled]) {
  opacity: 0.4;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .button {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .button:active {
    transform: translateY(0) scale(0.98);
  }
}
`;
  var Jn = Je + Oe;

  class We extends s {
    static formAssociated = true;
    _internals;
    _btn;
    constructor() {
      super({ css: Jn, template: Ye });
      this._internals = this.attachInternals(), this._btn = this.shadowRoot?.querySelector("button") ?? null;
    }
    static get observedAttributes() {
      return ["type", "disabled"];
    }
    connectedCallback() {
      for (let t of ["type", "disabled"])
        d(this, t);
      if (!this.hasAttribute("type"))
        this.setAttribute("type", "button");
      if (!this.hasAttribute("variant"))
        this.setAttribute("variant", "filled");
      this.addEventListener("click", this._handleClick);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._handleClick);
    }
    _handleClick = (t) => {
      if (this.hasAttribute("disabled")) {
        t.stopImmediatePropagation();
        return;
      }
      let e = this._internals.form;
      if (!e)
        return;
      let r = this.getAttribute("type");
      if (r === "submit")
        e.requestSubmit();
      if (r === "reset")
        e.reset();
    };
    attributeChangedCallback(t, e, r) {
      if (!this._btn)
        return;
      if (t === "type")
        this._btn.type = r ?? "button";
      if (t === "disabled")
        this._btn.disabled = this.hasAttribute("disabled");
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      if (t)
        this.setAttribute("disabled", "");
      else
        this.removeAttribute("disabled");
    }
  }

  class F extends s {
    static formAssociated = true;
    _internals;
    _defaultChecked = false;
    _defaultsCaptured = false;
    constructor(t) {
      super(t);
      this._internals = this.attachInternals();
    }
    _captureDefaults() {
      if (this._defaultsCaptured)
        return;
      this._defaultChecked = this.hasAttribute("checked"), this._defaultsCaptured = true;
    }
    formResetCallback() {
      this.checked = this._defaultChecked;
    }
    get checked() {
      return this.hasAttribute("checked");
    }
    set checked(t) {
      t ? this.setAttribute("checked", "") : this.removeAttribute("checked");
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      t ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get name() {
      return this.getAttribute("name") ?? "";
    }
    set name(t) {
      this.setAttribute("name", t);
    }
    get value() {
      return this.getAttribute("value") ?? "on";
    }
    set value(t) {
      this.setAttribute("value", t);
    }
    get form() {
      return this._internals.form;
    }
  }
  var tr = `<label class="checkbox-container" part="container">
    <span class="input-wrapper">
        <input type="checkbox" id="native-input" part="input" />
        <span class="custom-box" part="box" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="checkmark" part="checkmark">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span class="indeterminate-mark" part="indeterminate"></span>
        </span>
    </span>
    <span class="label-text" part="label">
        <slot></slot>
    </span>
</label>
`;
  var er = `:host {
  display: inline-block;
  --cb-size: 20px;
  --cb-border: var(--border-default, #d1d5db);
  --cb-bg: var(--bg-surface, #ffffff);
  --cb-active-bg: var(--primary-base, #000000);
  --cb-active-border: var(--primary-base, #000000);
  --cb-focus-ring: color-mix(in oklab, var(--cb-active-bg) 20%, transparent);
  --cb-text: var(--text-main, #374151);
  --cb-hover-border: var(--text-muted, #9ca3af);
  --cb-check-color: var(--bg-surface);
}

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
}

.input-wrapper {
  position: relative;
  display: inline-block;
  width: var(--cb-size);
  height: var(--cb-size);
  flex-shrink: 0;
}

input {
  position: absolute;
  inset: 0;
  opacity: 0;
  margin: 0;
  cursor: inherit;
  width: 100%;
  height: 100%;
}

.custom-box {
  position: absolute;
  inset: 0;
  background-color: var(--cb-bg);
  border: 2px solid var(--cb-border);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.checkmark {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--cb-check-color);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
}

.indeterminate-mark {
  position: absolute;
  width: 10px;
  height: 2px;
  background-color: var(--cb-check-color);
  border-radius: 1px;
  opacity: 0;
}

.label-text {
  font-size: 0.95rem;
  color: var(--cb-text);
}

.label-text.is-empty {
  display: none;
}
`;
  var rr = `input:checked ~ .custom-box {
  background-color: var(--cb-active-bg);
  border-color: var(--cb-active-border);
}

input:checked ~ .custom-box .checkmark {
  stroke-dashoffset: 0;
}

:host([indeterminate]) .custom-box {
  background-color: var(--cb-active-bg);
  border-color: var(--cb-active-border);
}

:host([indeterminate]) .checkmark {
  opacity: 0;
}

:host([indeterminate]) .indeterminate-mark {
  opacity: 1;
}

input:focus-visible ~ .custom-box {
  box-shadow: 0 0 0 3px var(--cb-focus-ring);
  border-color: var(--cb-active-border);
  outline: none;
}

.checkbox-container:hover input:not(:checked):not(:disabled) ~ .custom-box {
  border-color: var(--cb-hover-border);
}

:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .custom-box {
    transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .checkmark {
    transition: stroke-dashoffset 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .indeterminate-mark {
    transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
}
`;
  var L = (t, e, r) => {
    let i = e?.checked ?? t.hasAttribute("checked");
    r.setFormValue(i ? t.getAttribute("value") ?? "on" : null);
  };
  var ir = (t, e) => {
    if (!e)
      return;
    if (e.checked = t.hasAttribute("checked"), e.disabled = t.hasAttribute("disabled"), e.indeterminate = t.hasAttribute("indeterminate"), t.hasAttribute("name"))
      e.name = t.getAttribute("name") ?? "";
    if (t.hasAttribute("value"))
      e.value = t.getAttribute("value") ?? "";
  };
  var ar = (t, e, r, i, a) => {
    if (!e)
      return;
    if (i === "checked")
      e.checked = a !== null, L(t, e, r);
    else if (i === "disabled")
      e.disabled = a !== null;
    else if (i === "indeterminate")
      e.indeterminate = a !== null;
    else if (i === "name")
      e.name = a ?? "";
    else if (i === "value")
      e.value = a ?? "", L(t, e, r);
  };
  var or = (t, e, r) => {
    if (e?.checked ?? false)
      t.setAttribute("checked", "");
    else
      t.removeAttribute("checked");
    if (e && e.indeterminate === false && t.hasAttribute("indeterminate"))
      t.removeAttribute("indeterminate");
    L(t, e, r), t.dispatchEvent(new Event("change", { bubbles: true }));
  };
  var nr = (t, e) => {
    if (t.hasAttribute("disabled"))
      e.preventDefault(), e.stopImmediatePropagation();
  };
  var es = er + rr;

  class sr extends F {
    _input;
    _labelText;
    _labelSlot;
    _defaultIndeterminate = false;
    static get observedAttributes() {
      return ["checked", "disabled", "name", "value", "indeterminate"];
    }
    constructor() {
      super({ css: es, template: tr });
      this._input = this.shadowRoot?.querySelector("input") ?? null, this._labelText = this.shadowRoot?.querySelector(".label-text") ?? null, this._labelSlot = this.shadowRoot?.querySelector(".label-text slot:not([name])") ?? null;
    }
    connectedCallback() {
      this._captureDefaults(), ["checked", "disabled", "name", "value", "indeterminate"].forEach((t) => d(this, t)), ir(this, this._input), this._input?.addEventListener("change", this._onChange), this._input?.addEventListener("click", this._onClick), this._labelSlot?.addEventListener("slotchange", this._syncLabel), this._syncLabel(), L(this, this._input, this._internals);
    }
    disconnectedCallback() {
      this._input?.removeEventListener("change", this._onChange), this._input?.removeEventListener("click", this._onClick), this._labelSlot?.removeEventListener("slotchange", this._syncLabel);
    }
    _captureDefaults() {
      if (this._defaultsCaptured)
        return;
      this._defaultIndeterminate = this.hasAttribute("indeterminate"), super._captureDefaults();
    }
    _syncLabel = () => {
      if (!this._labelText || !this._labelSlot)
        return;
      let t = this._labelSlot.assignedNodes({ flatten: true }).some((e) => e.nodeType === Node.ELEMENT_NODE || (e.textContent ?? "").trim() !== "");
      this._labelText.classList.toggle("is-empty", !t);
    };
    formResetCallback() {
      this.indeterminate = this._defaultIndeterminate, super.formResetCallback();
    }
    attributeChangedCallback(t, e, r) {
      ar(this, this._input, this._internals, t, r);
    }
    _onChange = () => or(this, this._input, this._internals);
    _onClick = (t) => nr(this, t);
    get indeterminate() {
      return this._input?.indeterminate ?? this.hasAttribute("indeterminate");
    }
    set indeterminate(t) {
      if (t ? this.setAttribute("indeterminate", "") : this.removeAttribute("indeterminate"), this._input)
        this._input.indeterminate = t;
    }
    click() {
      this._input?.click();
    }
  }
  var hr = `<button id="btn" class="icon-button" part="button">
    <slot></slot>
</button>
`;
  var br = `:host {
  display: inline-block;

  --_size: 2.25rem;
  --_radius: 8px;
  --_bg: transparent;
  --_color: var(--text-main, #1f2937);
  --_border: 1.5px solid transparent;
  --_hover-bg: var(--bg-base, #f1f5f9);
  --_accent: var(--text-main);
  --_accent-contrast: var(--bg-surface);

  --ctx-bg: var(--_bg);
  --ctx-fg: var(--_color);
  --ctx-fg-muted: var(--text-muted);
  --ctx-border: var(--_border);
}

:host([size="sm"]) { --_size: 1.75rem; --_radius: 6px; }
:host([size="md"]) { --_size: 2.25rem; --_radius: 8px; }
:host([size="lg"]) { --_size: 2.75rem; --_radius: 10px; }

:host([color="primary"]) { --_accent: var(--primary-base); --_accent-contrast: var(--primary-contrasted); }
:host([color="danger"])  { --_accent: var(--danger-base); --_accent-contrast: var(--danger-contrasted); }
:host([color="success"]) { --_accent: var(--success-base); --_accent-contrast: var(--success-contrasted); }
:host([color="info"])    { --_accent: var(--info-base); --_accent-contrast: var(--info-contrasted); }
:host([color="warning"]) { --_accent: var(--warning-base); --_accent-contrast: var(--warning-contrasted); }

:host([variant="filled"]) {
  --_bg: var(--_accent);
  --_color: var(--_accent-contrast);
  --_hover-bg: var(--_accent);
}

:host([variant="outlined"]) {
  --_border: 1.5px solid var(--_accent);
  --_color: var(--_accent);
  --_hover-bg: color-mix(in oklab, var(--_accent) 10%, transparent);
}

:host([variant="ghost"]) {
  --_color: var(--_accent);
  --_hover-bg: color-mix(in oklab, var(--_accent) 10%, transparent);
}

:host([round]) { --_radius: 999px; }

.icon-button {
  width: var(--_size);
  height: var(--_size);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--_bg);
  color: var(--_color);
  border: var(--_border);
  border-radius: var(--_radius);
  cursor: pointer;
  font: inherit;
  box-sizing: border-box;
}

.icon-button:hover {
  background: var(--_hover-bg);
  opacity: var(--_hover-opacity, 1);
}

:host([variant="filled"]) .icon-button:hover {
  --_hover-opacity: 0.9;
}

.icon-button:focus-visible {
  outline: 2px solid var(--_accent);
  outline-offset: 2px;
}

:host([disabled]) {
  opacity: 0.4;
  pointer-events: none;
}

::slotted(svg) {
  width: 55%;
  height: 55%;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

@media (prefers-reduced-motion: no-preference) {
  .icon-button { transition: background-color 0.15s, color 0.15s, opacity 0.15s; }
  .icon-button:active { transform: scale(0.95); }
}
`;

  class mr extends s {
    static formAssociated = true;
    _internals;
    _btn;
    static get observedAttributes() {
      return ["type", "disabled", "aria-label"];
    }
    constructor() {
      super({ css: br, template: hr });
      this._internals = this.attachInternals(), this._btn = this.shadowRoot?.querySelector("button") ?? null;
    }
    connectedCallback() {
      for (let t of ["type", "disabled"])
        d(this, t);
      if (!this.hasAttribute("type"))
        this.setAttribute("type", "button");
      if (!this.hasAttribute("variant"))
        this.setAttribute("variant", "ghost");
      this.addEventListener("click", this._handleClick), this._syncAriaLabel();
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._handleClick);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._btn)
        return;
      if (t === "type")
        this._btn.type = r ?? "button";
      if (t === "disabled")
        this._btn.disabled = this.hasAttribute("disabled");
      if (t === "aria-label")
        this._syncAriaLabel();
    }
    _syncAriaLabel() {
      if (!this._btn)
        return;
      let t = this.getAttribute("aria-label");
      if (t)
        this._btn.setAttribute("aria-label", t);
      else
        this._btn.removeAttribute("aria-label");
    }
    _handleClick = (t) => {
      if (this.hasAttribute("disabled")) {
        t.stopImmediatePropagation();
        return;
      }
      let e = this._internals.form;
      if (!e)
        return;
      let r = this.getAttribute("type");
      if (r === "submit")
        e.requestSubmit();
      if (r === "reset")
        e.reset();
    };
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      if (t)
        this.setAttribute("disabled", "");
      else
        this.removeAttribute("disabled");
    }
  }
  var kr = `<div class="field" part="field">
    <label class="label" part="label"></label>
    <input class="input" part="input" type="text" />
    <div class="meta" part="meta" hidden>
        <small class="hint" part="hint"></small>
        <small class="counter" part="counter" hidden data-over="false"><span class="count">0</span>/<span class="max">0</span></small>
    </div>
</div>
`;
  var Er = `:host {
    display: block;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
}

.label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #94a3b8);
}

.label[hidden] {
    display: none;
}

.input {
    width: 100%;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-main, #1e293b);
    font-family: inherit;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    outline: none;
    box-sizing: border-box;
}

.input::placeholder {
    color: var(--text-muted, #94a3b8);
    font-weight: 400;
}

.meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.meta[hidden] {
    display: none;
}

.hint {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    line-height: 1.4;
    flex: 1;
    min-width: 0;
}

.counter {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
}

.counter[hidden] {
    display: none;
}
`;
  var Lr = `.input:hover:not(:disabled) {
    border-color: var(--text-muted, #94a3b8);
}

.input:focus-visible {
    border-color: var(--primary-base, #4361ee);
    box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
}

.input[aria-invalid="true"] {
    border-color: var(--danger-base, #ef4444);
}

.input[aria-invalid="true"]:focus-visible {
    box-shadow: 0 0 0 3px rgb(239 68 68 / 0.15);
}

.input:disabled {
    background: var(--bg-base, #f1f5f9);
    color: var(--text-muted, #94a3b8);
    cursor: not-allowed;
}

.hint[data-level="error"] {
    color: var(--danger-base, #ef4444);
}

.hint[data-level="success"] {
    color: var(--success-base, #10b981);
}

.counter[data-over="true"] {
    color: var(--danger-base, #ef4444);
    font-weight: 600;
}
`;
  var Ar = `@media (prefers-reduced-motion: no-preference) {
    .input { transition: border-color 0.15s, box-shadow 0.15s; }
}
`;
  var ct = (t) => {
    let e = t.getAttribute("max-count");
    if (e === null)
      return null;
    let r = parseInt(e, 10);
    return Number.isFinite(r) && r > 0 ? r : null;
  };
  var A = (t, e, r, i) => {
    if (!e || !r || !i)
      return;
    let a = ct(t);
    if (a === null)
      return;
    let o = e.value.length;
    i.textContent = String(o), r.dataset.over = String(o > a);
  };
  var pt = (t, e, r) => {
    if (!t || !e || !r)
      return;
    let i = (t.textContent ?? "").length > 0, a = !e.hidden;
    r.hidden = !i && !a;
  };
  var us = 0;
  var Cr = () => `p9r-input-label-${++us}`;
  var ut = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("label") ?? "";
    e.textContent = r, e.hidden = r === "";
  };
  var hs = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("placeholder");
    if (r === null)
      e.removeAttribute("placeholder");
    else
      e.setAttribute("placeholder", r);
  };
  var bs = (t, e) => {
    if (!e)
      return;
    e.setAttribute("type", t.getAttribute("type") ?? "text");
  };
  var ms = (t, e) => {
    if (e)
      e.disabled = t.hasAttribute("disabled");
  };
  var gs = (t, e) => {
    if (!e)
      return;
    let r = t.hasAttribute("required");
    if (e.required = r, r)
      e.setAttribute("aria-required", "true");
    else
      e.removeAttribute("aria-required");
  };
  var vs = (t, e, r, i) => {
    if (!e)
      return;
    e.textContent = t.getAttribute("hint") ?? "", pt(e, r, i);
  };
  var fs = (t, e) => {
    if (!e)
      return;
    e.dataset.level = t.getAttribute("hint-level") ?? "info";
  };
  var xs = (t, e) => {
    if (!e)
      return;
    if (t.hasAttribute("invalid"))
      e.setAttribute("aria-invalid", "true");
    else
      e.removeAttribute("aria-invalid");
  };
  var ht = (t, e, r, i, a) => {
    if (!e || !r)
      return;
    let o = ct(t);
    if (o === null)
      e.hidden = true;
    else
      e.hidden = false, r.textContent = String(o);
    pt(i, e, a);
  };
  var bt = (t, e, r, i, a, o, n) => {
    ut(t, r), hs(t, e), bs(t, e), ms(t, e), gs(t, e), vs(t, i, o, a), fs(t, i), xs(t, e), ht(t, o, n, i, a);
  };
  var Mr = (t, e, r, i, a) => {
    if (!e)
      return;
    r.setFormValue(e.value), A(t, e, i, a);
  };
  var Hr = (t, e) => {
    if (!t)
      return;
    e.setFormValue(t.value);
  };
  var _s = Er + Lr + Ar;

  class Tr extends s {
    static formAssociated = true;
    static get observedAttributes() {
      return ["value", "label", "placeholder", "type", "hint", "hint-level", "max-count", "invalid", "disabled", "required"];
    }
    _internals;
    _input;
    _labelEl;
    _hintEl;
    _metaEl;
    _counterEl;
    _countEl;
    _maxEl;
    _defaultValue = "";
    _defaultsCaptured = false;
    constructor() {
      super({ css: _s, template: kr });
      this._internals = this.attachInternals();
      let t = this.shadowRoot;
      this._labelEl = t.querySelector(".label"), this._input = t.querySelector(".input"), this._hintEl = t.querySelector(".hint"), this._metaEl = t.querySelector(".meta"), this._counterEl = t.querySelector(".counter"), this._countEl = t.querySelector(".count"), this._maxEl = t.querySelector(".max");
      let e = Cr();
      if (this._labelEl && this._input)
        this._labelEl.id = e, this._input.setAttribute("aria-labelledby", e);
    }
    connectedCallback() {
      if (!this._defaultsCaptured)
        this._defaultValue = this.getAttribute("value") ?? "", this._defaultsCaptured = true;
      ["value", "disabled", "required"].forEach((e) => d(this, e)), this._input?.addEventListener("input", this._onInput), this._input?.addEventListener("change", this._onChange), bt(this, this._input, this._labelEl, this._hintEl, this._metaEl, this._counterEl, this._maxEl);
      let t = this.getAttribute("value");
      if (t !== null)
        this.value = t;
      else
        A(this, this._input, this._counterEl, this._countEl);
    }
    disconnectedCallback() {
      this._input?.removeEventListener("input", this._onInput), this._input?.removeEventListener("change", this._onChange);
    }
    formResetCallback() {
      this.value = this._defaultValue;
    }
    attributeChangedCallback(t, e, r) {
      if (!this._input)
        return;
      if (t === "value" && r !== null)
        this.value = r;
      else if (t === "label")
        ut(this, this._labelEl);
      else if (t === "max-count")
        ht(this, this._counterEl, this._maxEl, this._hintEl, this._metaEl), A(this, this._input, this._counterEl, this._countEl);
      else
        bt(this, this._input, this._labelEl, this._hintEl, this._metaEl, this._counterEl, this._maxEl);
    }
    get value() {
      return this._input?.value ?? "";
    }
    set value(t) {
      if (!this._input)
        return;
      this._input.value = t, this._internals.setFormValue(t), A(this, this._input, this._counterEl, this._countEl);
    }
    get name() {
      return this.getAttribute("name") ?? "";
    }
    get disabled() {
      return this._input?.disabled ?? false;
    }
    set disabled(t) {
      t ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get required() {
      return this.hasAttribute("required");
    }
    set required(t) {
      t ? this.setAttribute("required", "") : this.removeAttribute("required");
    }
    focus() {
      this._input?.focus();
    }
    _onInput = () => Mr(this, this._input, this._internals, this._counterEl, this._countEl);
    _onChange = () => Hr(this._input, this._internals);
  }
  var Ir = `:host {
    display: block;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #94a3b8);
}

.label[hidden] {
    display: none;
}

.input-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 6px;
    padding: 2px 6px;
}

.number {
    width: 36px;
    border: none;
    outline: none;
    background: transparent;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-main, #1e293b);
    text-align: right;
    font-family: inherit;
    -moz-appearance: textfield;
}

.number::-webkit-inner-spin-button,
.number::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.unit {
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted, #94a3b8);
}

.unit[hidden] {
    display: none;
}

.bounds {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    font-weight: 500;
    color: var(--text-muted, #94a3b8);
    margin-top: -2px;
}
`;
  var Sr = `:host([disabled]) {
    opacity: 0.55;
    pointer-events: none;
}

.input-wrap:focus-within {
    border-color: var(--primary-base, #4361ee);
    box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
}

.track-container {
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
}

.track {
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--border-default, #e2e8f0);
    border-radius: 4px;
    overflow: hidden;
    pointer-events: none;
}

.fill {
    height: 100%;
    background: var(--primary-base, #4361ee);
    border-radius: 4px;
}

.slider {
    position: relative;
    width: 100%;
    height: 20px;
    margin: 0;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    z-index: 1;
    outline: none;
}

.slider:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.25));
}

.slider:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.25));
}

.slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--primary-base, #4361ee);
    border: 2px solid var(--bg-surface, #fff);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
    cursor: grab;
}

.slider::-webkit-slider-thumb:active {
    transform: scale(1.2);
    cursor: grabbing;
}

.slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--primary-base, #4361ee);
    border: 2px solid var(--bg-surface, #fff);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
    cursor: grab;
}

.slider::-moz-range-track {
    background: transparent;
    border: none;
}
`;
  var qr = `@media (prefers-reduced-motion: no-preference) {
    .input-wrap { transition: border-color 0.15s; }
    .fill { transition: width 0.05s ease; }
    .slider::-webkit-slider-thumb { transition: transform 0.1s; }
}
`;
  var Ls = Ir + Sr + qr;
  var Vr = `<div class="field">
    <span class="label"></span>
    <button class="trigger" type="button" tabindex="0"
            popovertarget="panel" popovertargetaction="toggle">
        <span class="value"></span>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"/>
        </svg>
    </button>
    <div id="panel" class="panel" popover>
        <ul class="list"></ul>
    </div>
</div>
<div hidden><slot></slot></div>
`;
  var Nr = `:host {
    display: block;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
}

.label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #94a3b8);
}

.label[hidden] {
    display: none;
}

.trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 7px 10px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
    outline: none;
}

.value {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-main, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.chevron {
    flex-shrink: 0;
    color: var(--text-muted, #94a3b8);
    transition: transform 0.2s ease;
}

.list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 200px;
    overflow-y: auto;
}

.option {
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-main, #1e293b);
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.1s;
}
`;
  var Rr = `.trigger:hover {
    border-color: var(--text-muted, #94a3b8);
}

.trigger:focus-visible {
    border-color: var(--primary-base, #4361ee);
    box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
}

.field:has(.panel:popover-open) .trigger {
    border-color: var(--primary-base, #4361ee);
}

.field:has(.panel:popover-open) .trigger .chevron {
    transform: rotate(180deg);
    color: var(--primary-base, #4361ee);
}

.panel {
    /* \`[popover]\` puts us in the browser top-layer when shown — escapes
     * \`overflow: hidden|auto\` ancestors, and the containing block for our
     * \`position: fixed\` is the viewport regardless of any transformed
     * ancestor (a \`<w13c-lateral-dialog>\` slides via \`transform\`, which
     * would otherwise hijack the containing block). \`top\`, \`left\`, \`width\`
     * set inline by the host on \`toggle\`. */
    position: fixed;
    margin: 0;
    padding: 0;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgb(0 0 0 / 0.08);
    overflow: hidden;
}

.option:hover {
    background: var(--bg-base, #f1f5f9);
}

.option.selected {
    background: var(--primary-muted, rgb(67 97 238 / 0.1));
    color: var(--primary-base, #4361ee);
    font-weight: 600;
}
`;
  var $r = (t, e) => {
    t.forEach((r) => r.classList.toggle("selected", r.dataset.value === e));
  };
  var Xr = (t, e) => {
    if (!t)
      return;
    let r = e.getAttribute("label") ?? e.getAttribute("name") ?? "";
    t.textContent = r, t.hidden = r === "";
  };
  var Zr = (t, e, r) => {
    let i = Array.from(t.querySelectorAll("option"));
    if (e)
      e.innerHTML = "";
    let a = [], o = "", n = "";
    if (i.forEach((l) => {
      let c = document.createElement("li");
      if (c.className = "option", c.textContent = l.textContent, c.dataset.value = l.value, c.addEventListener("click", () => r(l.value, l.textContent ?? "")), e?.appendChild(c), a.push(c), l.hasAttribute("selected") && !o)
        o = l.value, n = l.textContent ?? "";
    }), !o && i.length > 0)
      o = i[0].value, n = i[0].textContent ?? "";
    return { options: a, initialValue: o, initialLabel: n };
  };
  var Ur = (t, e, r, i) => {
    if (e)
      e.textContent = i;
    $r(t, r);
  };
  var Hs = Nr + Rr;

  class Qr extends s {
    static formAssociated = true;
    _internals;
    _trigger;
    _display;
    _list;
    _panel;
    _options = [];
    _value = "";
    _isOpen = false;
    constructor() {
      super({ css: Hs, template: Vr });
      this._internals = this.attachInternals(), this._trigger = this.shadowRoot.querySelector(".trigger"), this._display = this.shadowRoot.querySelector(".value"), this._list = this.shadowRoot.querySelector(".list"), this._panel = this.shadowRoot.querySelector(".panel");
    }
    connectedCallback() {
      Xr(this.shadowRoot.querySelector(".label"), this), this.shadowRoot.querySelector("slot").addEventListener("slotchange", this._onSlot), this._panel?.addEventListener("beforetoggle", this._onBeforeToggle), this._panel?.addEventListener("toggle", this._onToggle), this._syncFromSlot();
    }
    disconnectedCallback() {
      if (this.shadowRoot.querySelector("slot")?.removeEventListener("slotchange", this._onSlot), this._panel?.removeEventListener("beforetoggle", this._onBeforeToggle), this._panel?.removeEventListener("toggle", this._onToggle), this._isOpen)
        this._panel?.hidePopover?.();
      this._unbindReposition();
    }
    _syncFromSlot = () => {
      let { options: t, initialValue: e, initialLabel: r } = Zr(this, this._list, (a, o) => this._select(a, o));
      this._options = t;
      let i = this.getAttribute("value");
      if (i !== null) {
        let a = t.find((o) => o.dataset.value === i);
        if (a) {
          this._setValue(i, a.textContent ?? "");
          return;
        }
      }
      if (e)
        this._setValue(e, r);
    };
    _select(t, e) {
      this._setValue(t, e), this._panel?.hidePopover?.(), this.dispatchEvent(new Event("change", { bubbles: true }));
    }
    _setValue(t, e) {
      this._value = t, this._internals.setFormValue(t), Ur(this._options, this._display, t, e);
    }
    _onBeforeToggle = (t) => {
      if (t.newState === "open")
        this._reposition();
    };
    _onToggle = (t) => {
      if (this._isOpen = t.newState === "open", this._isOpen)
        window.addEventListener("scroll", this._reposition, { capture: true, passive: true }), window.addEventListener("resize", this._reposition);
      else
        this._unbindReposition();
    };
    _unbindReposition() {
      window.removeEventListener("scroll", this._reposition, { capture: true }), window.removeEventListener("resize", this._reposition);
    }
    _reposition = () => {
      if (!this._trigger || !this._panel)
        return;
      let t = this._trigger.getBoundingClientRect();
      this._panel.style.top = `${t.bottom + 4}px`, this._panel.style.left = `${t.left}px`, this._panel.style.width = `${t.width}px`;
    };
    get value() {
      return this._value;
    }
    set value(t) {
      let e = this._options.find((r) => r.dataset.value === t);
      if (e)
        this._setValue(t, e.textContent ?? "");
    }
    get name() {
      return this.getAttribute("name");
    }
    _onSlot = () => this._syncFromSlot();
  }
  var ni = `<div class="switch-container" part="container">
    <span class="label" id="group-label" part="label"></span>

    <div class="switch-wrapper" part="wrapper" role="radiogroup" aria-labelledby="group-label">
        <div class="selection-slider" part="slider"></div>

        <div class="options-container" part="options">
            <slot></slot>
        </div>
    </div>

    <span class="error-message" id="error-text" part="error">
        <slot name="error"></slot>
    </span>
</div>
`;
  var si = `:host {
  --active-index: 0;
  --total-options: 1;
  display: block;
}

.label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #94a3b8);
  margin-bottom: 4px;
}

.label:empty {
  display: none;
}

.options-container {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(var(--total-options), 1fr);
}

::slotted(option) {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  font-size: 0.85rem;
  color: var(--text-main);
  cursor: pointer;
  user-select: none;
  text-align: center;
}

@media (prefers-reduced-motion: no-preference) {
  ::slotted(option) {
    transition: color 0.2s;
  }
}

::slotted(option:focus-visible) {
  outline: 2px solid var(--primary-base);
  outline-offset: -2px;
  border-radius: 6px;
}

.switch-wrapper {
  position: relative;
  background-color: var(--bg-base);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 2px;
}

.selection-slider {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 4px) / var(--total-options));
  background-color: var(--bg-surface);
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  transform: translateX(calc(var(--active-index) * 100%));
  z-index: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .selection-slider {
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

::slotted([aria-checked="true"]) {
  color: var(--primary-base) !important;
  font-weight: 600;
}

:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}
`;
  var j = (t) => {
    if (!t)
      return [];
    return t.assignedElements().filter((e) => e.tagName === "OPTION");
  };
  var wt = (t, e) => {
    if (t)
      t.textContent = e;
  };
  var U = (t, e, r) => {
    let i = e.findIndex((a) => a.getAttribute("value") === r);
    if (i === -1)
      return;
    t.style.setProperty("--active-index", i.toString()), e.forEach((a, o) => {
      let n = o === i;
      a.setAttribute("aria-checked", n.toString()), a.setAttribute("tabindex", n ? "0" : "-1");
    });
  };
  var Q = (t, e) => {
    t.forEach((r) => {
      if (r.getAttribute("value") === e)
        r.setAttribute("selected", "");
      else
        r.removeAttribute("selected");
    });
  };
  var kt = (t, e) => {
    let r = j(e);
    t.style.setProperty("--total-options", r.length.toString()), r.forEach((i, a) => {
      if (i.setAttribute("role", "radio"), i.setAttribute("part", "segment"), !i.hasAttribute("tabindex"))
        i.setAttribute("tabindex", a === 0 ? "0" : "-1");
      i.onclick = () => {
        if (t.disabled)
          return;
        t.value = i.getAttribute("value") ?? "", i.focus();
      };
    }), U(t, r, t.value), Q(r, t.value);
  };
  var li = (t, e, r) => {
    if (t.disabled)
      return;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(r.key))
      return;
    let a = j(e);
    if (a.length === 0)
      return;
    let o = a.findIndex((p) => p.getAttribute("value") === t.value), n = o === -1 ? 0 : o, l = n;
    switch (r.key) {
      case "ArrowLeft":
      case "ArrowUp":
        l = (n - 1 + a.length) % a.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        l = (n + 1) % a.length;
        break;
      case "Home":
        l = 0;
        break;
      case "End":
        l = a.length - 1;
        break;
    }
    r.preventDefault();
    let c = a[l];
    if (!c)
      return;
    t.value = c.getAttribute("value") ?? "", c.focus();
  };

  class di extends s {
    static formAssociated = true;
    _internals;
    _labelEl;
    _slot;
    _defaultValue = "";
    _defaultsCaptured = false;
    _silentValueChange = false;
    static get observedAttributes() {
      return ["value", "disabled", "name", "label"];
    }
    constructor() {
      super({ css: si, template: ni });
      this._internals = this.attachInternals(), this._labelEl = this.shadowRoot?.querySelector(".label") ?? null, this._slot = this.shadowRoot?.querySelector("slot:not([name])") ?? null;
    }
    connectedCallback() {
      if (!this._defaultsCaptured)
        this._defaultValue = this.getAttribute("value") ?? "", this._defaultsCaptured = true;
      for (let t of ["value", "disabled", "name", "label"])
        d(this, t);
      if (this._slot)
        this._slot.addEventListener("slotchange", this._onSlotChange), kt(this, this._slot);
      this.addEventListener("keydown", this._onKey), wt(this._labelEl, this.getAttribute("label") ?? "");
    }
    disconnectedCallback() {
      this._slot?.removeEventListener("slotchange", this._onSlotChange), this.removeEventListener("keydown", this._onKey);
    }
    formResetCallback() {
      this._silentValueChange = true;
      try {
        this.value = this._defaultValue;
      } finally {
        this._silentValueChange = false;
      }
    }
    attributeChangedCallback(t, e, r) {
      if (!this.shadowRoot)
        return;
      if (t === "value")
        this.value = r ?? "";
      else if (t === "label")
        wt(this._labelEl, r ?? "");
    }
    get value() {
      return this.getAttribute("value") ?? "";
    }
    set value(t) {
      if (this.getAttribute("value") !== t)
        this.setAttribute("value", t);
      this._internals.setFormValue(t);
      let e = j(this._slot);
      if (U(this, e, t), Q(e, t), !this._silentValueChange)
        this.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value: t } }));
    }
    get name() {
      return this.getAttribute("name") ?? "";
    }
    set name(t) {
      t ? this.setAttribute("name", t) : this.removeAttribute("name");
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      t ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get label() {
      return this.getAttribute("label") ?? "";
    }
    set label(t) {
      t ? this.setAttribute("label", t) : this.removeAttribute("label");
    }
    _onSlotChange = () => kt(this, this._slot);
    _onKey = (t) => li(this, this._slot, t);
  }
  var mi = `<div class="container" part="container">
    <label for="main-input" part="label">
        <slot name="label">Tags</slot>
    </label>
    <div class="input-wrapper" part="input-wrapper">
        <input
            id="main-input"
            part="input"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="false"
            aria-haspopup="listbox"
            autocomplete="off"
            spellcheck="false"
        />
        <div
            id="suggestions"
            class="suggestions"
            part="listbox"
            role="listbox"
            hidden
        ></div>
    </div>
    <div
        id="tags-display"
        class="tags-list"
        part="chips"
        role="list"
        aria-label="Selected tags"
    ></div>
    <div
        id="live-region"
        class="sr-only"
        aria-live="polite"
        aria-atomic="true"
    ></div>
</div>
`;
  var gi = `:host {
    display: block;
    font-family: system-ui, -apple-system, sans-serif;
}

:host([disabled]) {
    opacity: 0.5;
    pointer-events: none;
}

.container {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
}

.input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

input {
    width: 100%;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-main, #1e293b);
    font-family: inherit;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background-color: var(--bg-surface, #fff);
    outline: none;
    box-sizing: border-box;
}

input::placeholder {
    color: var(--text-muted, #94a3b8);
    font-weight: 400;
}

@media (prefers-reduced-motion: no-preference) {
    input {
        transition: border-color 0.15s, box-shadow 0.15s;
    }
}
`;
  var vi = `input:hover:not(:disabled) {
    border-color: var(--text-muted, #94a3b8);
}

input:focus-visible {
    border-color: var(--primary-base, #4361ee);
    box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
}

input:disabled {
    cursor: not-allowed;
    background-color: var(--bg-base, #f1f5f9);
}

.suggestions {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    z-index: 1000;
    box-shadow: 0 8px 20px rgb(0 0 0 / 0.08);
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
}

.suggestion {
    padding: 6px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    border-radius: 6px;
}

@media (prefers-reduced-motion: no-preference) {
    .suggestion { transition: background 0.1s; }
    p9r-tag { transition: filter 0.2s; }
}

.suggestion[data-active="true"],
.suggestion:hover {
    background: var(--bg-base, #f1f5f9);
}

.suggestion .name {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-main, #1e293b);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
}

.tags-list:empty {
    display: none;
}

p9r-tag {
    cursor: pointer;
}

p9r-tag:hover {
    filter: brightness(0.92);
}
`;
  var G = (t, e) => {
    if (!t)
      return;
    t.textContent = "", window.setTimeout(() => {
      if (t)
        t.textContent = e;
    }, 10);
  };
  var Et = async (t) => {
    let e = t.getAttribute("resource");
    if (!e)
      return null;
    let r = t.getAttribute("api") || "../api/tags", i = new URL(r, window.location.href);
    i.searchParams.set("resource", e);
    try {
      let a = await fetch(i);
      if (!a.ok)
        return null;
      return await a.json();
    } catch {
      return null;
    }
  };
  var fi = (t, e, r, i) => {
    if (!t)
      return;
    if (t.innerHTML = "", e !== "multiple")
      return;
    r.forEach((a, o) => {
      let n = document.createElement("p9r-tag");
      n.setAttribute("color", "primary"), n.setAttribute("part", "chip"), n.setAttribute("role", "listitem"), n.textContent = a, n.title = `Remove ${a}`, n.setAttribute("aria-label", `Remove ${a}`), n.addEventListener("click", () => i(o)), t.appendChild(n);
    });
  };
  var xi = (t, e, r, i, a, o) => {
    if (!t || !e)
      return;
    if (r.length === 0) {
      Lt(t, e);
      return;
    }
    if (t.innerHTML = "", r.forEach((n, l) => {
      let c = document.createElement("div");
      c.className = "suggestion", c.id = `${a}-opt-${l}`, c.setAttribute("role", "option"), c.setAttribute("part", "option");
      let p = l === i;
      c.dataset.active = String(p), c.setAttribute("aria-selected", String(p));
      let u = document.createElement("span");
      u.className = "name", u.textContent = n.value, c.appendChild(u);
      let m = document.createElement("p9r-tag");
      m.setAttribute("color", "secondary"), m.setAttribute("part", "count"), m.textContent = String(n.count), c.appendChild(m), c.addEventListener("mousedown", (h) => {
        h.preventDefault(), o(n.value);
      }), t.appendChild(c);
    }), t.hidden = false, e.setAttribute("aria-expanded", "true"), i >= 0)
      e.setAttribute("aria-activedescendant", `${a}-opt-${i}`);
    else
      e.removeAttribute("aria-activedescendant");
  };
  var Lt = (t, e) => {
    if (t)
      t.hidden = true;
    if (e)
      e.setAttribute("aria-expanded", "false"), e.removeAttribute("aria-activedescendant");
  };
  var _i = (t, e, r) => {
    let i = t.filter((a) => !e.includes(a.value));
    if (r === "")
      return i.slice(0, 8);
    return i.filter((a) => a.value.toLowerCase().includes(r)).slice(0, 8);
  };
  var yi = (t, e) => {
    if (t === "multiple")
      return e.join(",");
    return e[0] ?? "";
  };
  var wi = (t, e) => {
    if (t === "multiple")
      return e ? e.split(",").map((r) => r.trim()).filter((r) => r !== "") : [];
    return e ? [e.trim()] : [];
  };
  var v = (t) => t;
  var V = (t, e) => {
    let r = v(t), i = t.getAttribute("mode") || "multiple", a = e.trim();
    if (!a || !r._input)
      return;
    if (i === "multiple") {
      if (!r._tags.includes(a))
        r._tags.push(a), G(r._liveRegion, `${a} added`);
      r._input.value = "";
    } else
      r._tags = [a], r._input.value = a, G(r._liveRegion, `${a} selected`);
    r._activeIndex = -1, Y(t), O(t);
  };
  var ki = (t, e) => {
    let r = v(t), i = e.trim();
    if (r._tags = i ? [i] : [], r._internals.setFormValue(r.value), r._silent)
      return;
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: r.value, tags: [...r._tags] } }));
  };
  var Ei = (t, e) => {
    let r = v(t), i = r._tags[e];
    if (i === undefined)
      return;
    r._tags.splice(e, 1), G(r._liveRegion, `${i} removed`), Y(t), r._input?.focus();
  };
  var Li = (t) => {
    let e = v(t);
    if (e._tags.length === 0)
      return;
    Ei(t, e._tags.length - 1);
  };
  var Y = (t) => {
    let e = v(t);
    if (At(t), e._internals.setFormValue(e.value), e._silent)
      return;
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: e.value, tags: [...e._tags] } }));
  };
  var At = (t) => {
    let e = v(t);
    fi(e._display, t.getAttribute("mode") || "multiple", e._tags, (r) => Ei(t, r));
  };
  var Ct = (t, e) => {
    let r = v(t), a = (t.getAttribute("mode") || "multiple") === "multiple" ? r._tags : [];
    r._suggestions = _i(r._allSuggestions, a, e), r._activeIndex = -1, J(t);
  };
  var J = (t) => {
    let e = v(t);
    xi(e._suggestionsEl, e._input, e._suggestions, e._activeIndex, e._uid, (r) => V(t, r));
  };
  var O = (t) => {
    let e = v(t);
    Lt(e._suggestionsEl, e._input), e._activeIndex = -1;
  };
  var Ai = (t, e) => {
    if (!e)
      return;
    Ct(t, e.value.trim().toLowerCase());
  };
  var Ci = (t) => {
    setTimeout(() => O(t), 150);
  };
  var Mi = (t, e) => {
    if (!e)
      return;
    if (Ct(t, e.value.trim().toLowerCase()), (t.getAttribute("mode") || "multiple") === "single")
      ki(t, e.value);
  };
  var Hi = (t, e, r) => {
    if (!e)
      return;
    let i = t.getAttribute("mode") || "multiple", a = t;
    if (r.key === "ArrowDown") {
      if (r.preventDefault(), a._suggestions.length === 0)
        return;
      a._activeIndex = Math.min(a._activeIndex + 1, a._suggestions.length - 1), J(t);
    } else if (r.key === "ArrowUp") {
      if (r.preventDefault(), a._suggestions.length === 0)
        return;
      a._activeIndex = Math.max(a._activeIndex - 1, -1), J(t);
    } else if (r.key === "Enter") {
      r.preventDefault();
      let o = a._activeIndex >= 0 ? a._suggestions[a._activeIndex] : undefined;
      if (o)
        V(t, o.value);
      else {
        let n = e.value.trim();
        if (n)
          V(t, n);
      }
    } else if (r.key === "Escape")
      r.preventDefault(), O(t);
    else if (r.key === "Backspace" && e.value === "" && i === "multiple")
      Li(t);
    else if (r.key === "," && i === "multiple") {
      r.preventDefault();
      let o = e.value.trim();
      if (o)
        V(t, o);
    }
  };
  var Ns = gi + vi;

  class Ti extends s {
    static formAssociated = true;
    static get observedAttributes() {
      return ["placeholder", "mode", "resource", "api", "disabled", "value"];
    }
    _internals;
    _tags = [];
    _suggestions = [];
    _activeIndex = -1;
    _input;
    _display;
    _suggestionsEl;
    _liveRegion;
    _allSuggestions = [];
    _uid;
    _defaultValue = "";
    _defaultsCaptured = false;
    _silent = false;
    constructor() {
      super({ css: Ns, template: mi });
      this._internals = this.attachInternals();
      let t = this.shadowRoot;
      if (this._input = t.querySelector("#main-input"), this._display = t.querySelector("#tags-display"), this._suggestionsEl = t.querySelector("#suggestions"), this._liveRegion = t.querySelector("#live-region"), this._uid = `ts-${Math.random().toString(36).slice(2, 9)}`, this._suggestionsEl)
        this._suggestionsEl.id = `${this._uid}-listbox`;
      if (this._input)
        this._input.setAttribute("aria-controls", `${this._uid}-listbox`);
    }
    connectedCallback() {
      if (!this._defaultsCaptured)
        this._defaultValue = this.getAttribute("value") ?? "", this._defaultsCaptured = true;
      ["placeholder", "mode", "resource", "api", "disabled", "value"].forEach((t) => d(this, t)), this._input?.addEventListener("input", this._onInput), this._input?.addEventListener("keydown", this._onKeyDown), this._input?.addEventListener("focus", this._onFocus), this._input?.addEventListener("blur", this._onBlur), Et(this).then((t) => {
        if (t)
          this._allSuggestions = t;
      });
    }
    disconnectedCallback() {
      this._input?.removeEventListener("input", this._onInput), this._input?.removeEventListener("keydown", this._onKeyDown), this._input?.removeEventListener("focus", this._onFocus), this._input?.removeEventListener("blur", this._onBlur);
    }
    formResetCallback() {
      this._silent = true;
      try {
        this.value = this._defaultValue;
      } finally {
        this._silent = false;
      }
    }
    attributeChangedCallback(t, e, r) {
      if (!this._input)
        return;
      if (t === "placeholder")
        this._input.placeholder = r ?? "";
      else if (t === "disabled")
        this._input.disabled = this.hasAttribute("disabled");
      else if (t === "resource" || t === "api")
        this._allSuggestions = [], Et(this).then((i) => {
          if (i)
            this._allSuggestions = i;
        });
      else if (t === "mode")
        At(this);
      else if (t === "value")
        this.value = r ?? "";
    }
    _onFocus = () => Ai(this, this._input);
    _onBlur = () => Ci(this);
    _onInput = () => Mi(this, this._input);
    _onKeyDown = (t) => Hi(this, this._input, t);
    get value() {
      return yi(this.getAttribute("mode") || "multiple", this._tags);
    }
    set value(t) {
      let e = this.getAttribute("mode") || "multiple";
      if (this._tags = wi(e, t), this._input)
        this._input.value = e === "multiple" ? "" : this._tags[0] ?? "";
      Y(this);
    }
    get name() {
      return this.getAttribute("name") || "";
    }
    get placeholder() {
      return this.getAttribute("placeholder") || "";
    }
    set placeholder(t) {
      t ? this.setAttribute("placeholder", t) : this.removeAttribute("placeholder");
    }
    get mode() {
      return this.getAttribute("mode") || "multiple";
    }
    set mode(t) {
      t ? this.setAttribute("mode", t) : this.removeAttribute("mode");
    }
    get resource() {
      return this.getAttribute("resource") || "";
    }
    set resource(t) {
      t ? this.setAttribute("resource", t) : this.removeAttribute("resource");
    }
    get api() {
      return this.getAttribute("api") || "";
    }
    set api(t) {
      t ? this.setAttribute("api", t) : this.removeAttribute("api");
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      t ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get tags() {
      return [...this._tags];
    }
  }
  var zi = `<div class="field" part="field">
    <label class="label" part="label" for="ta"></label>
    <textarea id="ta" class="textarea" part="textarea"></textarea>
    <div class="meta" part="meta" hidden>
        <small class="hint" part="hint"></small>
        <small class="counter" part="counter" hidden data-over="false"><span class="count">0</span>/<span class="max">0</span></small>
    </div>
</div>
`;
  var Ii = `:host {
  display: block;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #94a3b8);
}

.label[hidden] { display: none; }

.textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #1e293b);
  font-family: inherit;
  border: 1px solid var(--border-default, #e2e8f0);
  border-radius: 8px;
  background: var(--bg-surface, #fff);
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 4.5em;
  line-height: 1.5;
}

@media (prefers-reduced-motion: no-preference) {
  .textarea { transition: border-color 0.15s, box-shadow 0.15s; }
}

.textarea::placeholder {
  color: var(--text-muted, #94a3b8);
  font-weight: 400;
}

.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.meta[hidden] { display: none; }
`;
  var Si = `:host([resize="none"]) .textarea       { resize: none; }
:host([resize="horizontal"]) .textarea { resize: horizontal; }
:host([resize="vertical"]) .textarea   { resize: vertical; }
:host([resize="both"]) .textarea       { resize: both; }
:host([autosize]) .textarea            { resize: none; overflow: hidden; }

.textarea:hover:not(:disabled) {
  border-color: var(--text-muted, #94a3b8);
}

.textarea:focus-visible {
  border-color: var(--primary-base, #4361ee);
  box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
}

.textarea[aria-invalid="true"] {
  border-color: var(--danger-base, #ef4444);
}

.textarea[aria-invalid="true"]:focus-visible {
  box-shadow: 0 0 0 3px rgb(239 68 68 / 0.15);
}

.textarea:disabled {
  background: var(--bg-base, #f1f5f9);
  color: var(--text-muted, #94a3b8);
  cursor: not-allowed;
}

.hint {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  line-height: 1.4;
  flex: 1;
  min-width: 0;
}

.hint[data-level="error"]   { color: var(--danger-base, #ef4444); }
.hint[data-level="success"] { color: var(--success-base, #10b981); }

.counter {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.counter[hidden] { display: none; }

.counter[data-over="true"] {
  color: var(--danger-base, #ef4444);
  font-weight: 600;
}
`;
  var Mt = (t) => {
    let e = t.getAttribute("max-count");
    if (e === null)
      return null;
    let r = parseInt(e, 10);
    return Number.isFinite(r) && r > 0 ? r : null;
  };
  var T = (t, e, r, i) => {
    if (!e || !r || !i)
      return;
    let a = Mt(t);
    if (a === null)
      return;
    let o = e.value.length;
    i.textContent = String(o), r.dataset.over = String(o > a);
  };
  var Ht = (t, e, r) => {
    if (!t || !e || !r)
      return;
    let i = (t.textContent ?? "").length > 0, a = !e.hidden;
    r.hidden = !i && !a;
  };
  var N = (t, e) => {
    if (!e || !t.hasAttribute("autosize"))
      return;
    e.style.height = "auto", e.style.height = `${e.scrollHeight}px`;
  };
  var Zs = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("label") ?? "";
    e.textContent = r, e.hidden = r === "";
  };
  var Us = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("placeholder");
    if (r === null)
      e.removeAttribute("placeholder");
    else
      e.setAttribute("placeholder", r);
  };
  var Qs = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("rows");
    if (r)
      e.rows = Number(r) || 3;
  };
  var Gs = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("maxlength");
    if (r === null)
      e.removeAttribute("maxlength");
    else
      e.setAttribute("maxlength", r);
  };
  var Ys = (t, e) => {
    if (e)
      e.disabled = t.hasAttribute("disabled");
  };
  var Js = (t, e) => {
    if (!e)
      return;
    let r = t.hasAttribute("required");
    if (e.required = r, r)
      e.setAttribute("aria-required", "true");
    else
      e.removeAttribute("aria-required");
  };
  var Os = (t, e, r, i) => {
    if (!e)
      return;
    e.textContent = t.getAttribute("hint") ?? "", Ht(e, r, i);
  };
  var Ws = (t, e) => {
    if (!e)
      return;
    e.dataset.level = t.getAttribute("hint-level") ?? "info";
  };
  var tl = (t, e) => {
    if (!e)
      return;
    if (t.hasAttribute("invalid"))
      e.setAttribute("aria-invalid", "true");
    else
      e.removeAttribute("aria-invalid");
  };
  var Tt = (t, e, r, i, a) => {
    if (!e || !r)
      return;
    let o = Mt(t);
    if (o === null)
      e.hidden = true;
    else
      e.hidden = false, r.textContent = String(o);
    Ht(i, e, a);
  };
  var zt = (t, e, r, i, a, o, n) => {
    Zs(t, r), Us(t, e), Qs(t, e), Gs(t, e), Ys(t, e), Js(t, e), Os(t, i, o, a), Ws(t, i), tl(t, e), Tt(t, o, n, i, a);
  };
  var qi = (t, e, r, i, a) => {
    if (!e)
      return;
    r.setFormValue(e.value), T(t, e, i, a), N(t, e);
  };
  var Pi = (t, e) => {
    if (!t)
      return;
    e.setFormValue(t.value);
  };
  var el = Ii + Si;

  class Bi extends s {
    static formAssociated = true;
    static get observedAttributes() {
      return ["value", "label", "placeholder", "rows", "maxlength", "max-count", "hint", "hint-level", "invalid", "disabled", "required", "autosize"];
    }
    _internals;
    _textarea;
    _label;
    _hint;
    _meta;
    _counter;
    _count;
    _max;
    _defaultValue = "";
    _defaultsCaptured = false;
    constructor() {
      super({ css: el, template: zi });
      this._internals = this.attachInternals();
      let t = this.shadowRoot;
      this._textarea = t.querySelector("textarea"), this._label = t.querySelector(".label"), this._hint = t.querySelector(".hint"), this._meta = t.querySelector(".meta"), this._counter = t.querySelector(".counter"), this._count = t.querySelector(".count"), this._max = t.querySelector(".max");
    }
    connectedCallback() {
      if (!this._defaultsCaptured)
        this._defaultValue = this.getAttribute("value") ?? "", this._defaultsCaptured = true;
      ["value", "disabled", "required"].forEach((e) => d(this, e)), this._textarea?.addEventListener("input", this._onInput), this._textarea?.addEventListener("change", this._onChange), zt(this, this._textarea, this._label, this._hint, this._meta, this._counter, this._max);
      let t = this.getAttribute("value");
      if (t !== null)
        this.value = t;
      else
        T(this, this._textarea, this._counter, this._count);
    }
    disconnectedCallback() {
      this._textarea?.removeEventListener("input", this._onInput), this._textarea?.removeEventListener("change", this._onChange);
    }
    formResetCallback() {
      this.value = this._defaultValue;
    }
    attributeChangedCallback(t, e, r) {
      if (!this._textarea)
        return;
      if (t === "value" && r !== null)
        this.value = r;
      else if (t === "max-count")
        Tt(this, this._counter, this._max, this._hint, this._meta), T(this, this._textarea, this._counter, this._count);
      else if (t === "autosize")
        N(this, this._textarea);
      else
        zt(this, this._textarea, this._label, this._hint, this._meta, this._counter, this._max);
    }
    get value() {
      return this._textarea?.value ?? "";
    }
    set value(t) {
      if (!this._textarea)
        return;
      this._textarea.value = t, this._internals.setFormValue(t), T(this, this._textarea, this._counter, this._count), N(this, this._textarea);
    }
    get name() {
      return this.getAttribute("name") ?? "";
    }
    get disabled() {
      return this._textarea?.disabled ?? false;
    }
    set disabled(t) {
      t ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    get required() {
      return this.hasAttribute("required");
    }
    set required(t) {
      t ? this.setAttribute("required", "") : this.removeAttribute("required");
    }
    focus() {
      this._textarea?.focus();
    }
    _onInput = () => qi(this, this._textarea, this._internals, this._counter, this._count);
    _onChange = () => Pi(this._textarea, this._internals);
  }
  var ji = `<slot></slot>
`;
  var Vi = `:host {
    --max-width: var(--p9r-container-md, 768px);
    display: block;
    width: 100%;
    max-width: var(--max-width);
    margin-inline-start: 0;
    margin-inline-end: auto;
}

:host([size="xs"])   { --max-width: var(--p9r-container-xs, 480px); }
:host([size="sm"])   { --max-width: var(--p9r-container-sm, 640px); }
:host([size="md"])   { --max-width: var(--p9r-container-md, 768px); }
:host([size="lg"])   { --max-width: var(--p9r-container-lg, 1024px); }
:host([size="xl"])   { --max-width: var(--p9r-container-xl, 1280px); }
:host([size="full"]) { --max-width: 100%; }

:host([align="start"])  { margin-inline-start: 0;    margin-inline-end: auto; }
:host([align="center"]) { margin-inline-start: auto; margin-inline-end: auto; }
:host([align="end"])    { margin-inline-start: auto; margin-inline-end: 0;    }
`;

  class Ni extends s {
    constructor() {
      super({ css: Vi, template: ji });
    }
  }
  var Ri = `<slot></slot>
`;
  var $i = `:host {
    --min: 240px;
    --gap: var(--p9r-space-md, 16px);
    --max-width: 100%;

    display: grid;
    /* Intrinsically responsive: as many tracks as fit, each at least \`--min\`
       wide. \`min(--min, 100%)\` keeps a single track from overflowing a
       container narrower than \`--min\`. No media queries. */
    grid-template-columns: repeat(auto-fill, minmax(min(var(--min), 100%), 1fr));
    gap: var(--gap);

    /* Content zone: own width + horizontal placement within the parent.
       Placement via margin-inline (works under any parent), exposed in the
       editor as "Align self". */
    box-sizing: border-box;
    width: 100%;
    max-width: var(--max-width);
    margin-inline: 0 auto;
}

/* --- Min item width (drives the column count via minmax) --- */
:host([min="sm"]) { --min: 180px; }
:host([min="md"]) { --min: 240px; }
:host([min="lg"]) { --min: 300px; }
:host([min="xl"]) { --min: 360px; }

/* --- Content zone width (size) --- */
:host([size="sm"])   { --max-width: var(--p9r-container-sm, 640px); }
:host([size="md"])   { --max-width: var(--p9r-container-md, 768px); }
:host([size="lg"])   { --max-width: var(--p9r-container-lg, 1024px); }
:host([size="xl"])   { --max-width: var(--p9r-container-xl, 1280px); }
:host([size="full"]) { --max-width: 100%; }

/* --- Self placement (align self) --- */
:host([align-self="start"])  { margin-inline: 0 auto; }
:host([align-self="center"]) { margin-inline: auto; }
:host([align-self="end"])    { margin-inline: auto 0; }

/* --- Gap --- */
:host([gap="none"]) { --gap: 0; }
:host([gap="xs"])   { --gap: var(--p9r-space-xs, 4px); }
:host([gap="sm"])   { --gap: var(--p9r-space-sm, 8px); }
:host([gap="md"])   { --gap: var(--p9r-space-md, 16px); }
:host([gap="lg"])   { --gap: var(--p9r-space-lg, 24px); }
:host([gap="xl"])   { --gap: var(--p9r-space-xl, 32px); }
`;

  class Xi extends s {
    constructor() {
      super({ css: $i, template: Ri });
    }
  }
  var Zi = `<div class="app-container" part="container">
    <a class="skip-link" part="skip-link" href="#main-content">
        <slot name="skip-link">Skip to main content</slot>
    </a>

    <aside class="app-sidebar" part="sidebar" aria-label="Primary">
        <nav class="app-nav" part="nav" aria-label="Main navigation">
            <slot name="sidebar"></slot>
        </nav>
    </aside>

    <main id="main-content" class="app-content" part="content" tabindex="-1">
        <slot></slot>
    </main>
</div>
`;
  var Ui = `:host {
    display: block;
    height: 100vh;
    width: 100vw;
    overflow: hidden;

    --_sidebar-width: 260px;
    --_sidebar-collapsed-width: 0px;
    --_sidebar-bg: var(--bg-base);
    --_sidebar-border: var(--border-default);
    --_content-bg: var(--bg-surface);
    --_content-padding: 2rem;
    --_focus-ring: var(--primary-base, #2563eb);

    --ctx-bg: var(--_content-bg);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--border-default);
}

.app-container {
    display: flex;
    height: 100%;
    width: 100%;
}

.skip-link {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0.5rem 1rem;
    background: var(--_content-bg);
    color: var(--_focus-ring);
    text-decoration: none;
    border: 2px solid var(--_focus-ring);
    border-radius: 4px;
    z-index: 1000;
    transform: translateY(-150%);
}

.skip-link:focus-visible {
    transform: translateY(0);
    outline: 2px solid var(--_focus-ring);
    outline-offset: 2px;
}

.app-sidebar {
    flex-shrink: 0;
    height: 100%;
    width: var(--_sidebar-width);
    background-color: var(--_sidebar-bg);
    border-right: 1px solid var(--_sidebar-border);
    overflow: hidden;
}

.app-nav {
    height: 100%;
    overflow-y: auto;
}

::slotted([slot="sidebar"]) {
    --ctx-bg: var(--_sidebar-bg);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--_sidebar-border);
}

::slotted(:not([slot])) {
    --ctx-bg: var(--_content-bg);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--border-default);
}

:host([collapsed]) .app-sidebar {
    width: var(--_sidebar-collapsed-width);
    border-right-width: 0;
}

.app-content {
    flex-grow: 1;
    height: 100%;
    overflow-y: auto;
    padding: var(--_content-padding);
    box-sizing: border-box;
    background-color: var(--_content-bg);
}

.app-content:focus-visible {
    outline: 2px solid var(--_focus-ring);
    outline-offset: -4px;
}

@media (prefers-reduced-motion: no-preference) {
    .app-sidebar {
        transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                    border-right-width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .skip-link {
        transition: transform 0.2s ease-out;
    }
}
`;

  class Qi extends s {
    _sidebar;
    _content;
    constructor() {
      super({ css: Ui, template: Zi });
      this._sidebar = this.shadowRoot?.querySelector(".app-sidebar") ?? null, this._content = this.shadowRoot?.querySelector(".app-content") ?? null;
    }
    static get observedAttributes() {
      return ["collapsed"];
    }
    connectedCallback() {
      for (let t of ["collapsed"])
        d(this, t);
      this._syncAriaState();
    }
    disconnectedCallback() {}
    attributeChangedCallback(t, e, r) {
      if (!this._sidebar)
        return;
      if (e === r)
        return;
      if (t === "collapsed")
        this._syncAriaState(), this.dispatchEvent(new CustomEvent("w13c-left-menu-collapse", { bubbles: true, composed: true, detail: { collapsed: r !== null } }));
    }
    _syncAriaState() {
      if (!this._sidebar)
        return;
      let t = this.hasAttribute("collapsed");
      this._sidebar.setAttribute("aria-expanded", String(!t)), this._sidebar.setAttribute("aria-hidden", String(t));
    }
    get collapsed() {
      return this.hasAttribute("collapsed");
    }
    set collapsed(t) {
      if (t)
        this.setAttribute("collapsed", "");
      else
        this.removeAttribute("collapsed");
    }
    toggle() {
      this.collapsed = !this.collapsed;
    }
    focusContent() {
      this._content?.focus();
    }
  }
  var Gi = `<slot></slot>
`;
  var Yi = `:host {
    --gap: var(--p9r-space-md, 16px);
    --max-width: 100%;
    --divider-color: var(--p9r-stack-divider, var(--border-default, rgba(0,0,0,0.1)));

    display: flex;
    flex-direction: column;
    gap: var(--gap);

    /* Content zone: own width + horizontal placement within the parent.
       Placement uses margin-inline (works under any parent), exposed in the
       editor as "Align self" to distinguish it from "Align items" below. */
    box-sizing: border-box;
    width: 100%;
    max-width: var(--max-width);
    margin-inline: 0 auto;
}

/* --- Content zone width (size) --- */
:host([size="sm"])   { --max-width: var(--p9r-container-sm, 640px); }
:host([size="md"])   { --max-width: var(--p9r-container-md, 768px); }
:host([size="lg"])   { --max-width: var(--p9r-container-lg, 1024px); }
:host([size="xl"])   { --max-width: var(--p9r-container-xl, 1280px); }
:host([size="full"]) { --max-width: 100%; }

/* --- Self placement (align self) --- */
:host([align-self="start"])  { margin-inline: 0 auto; }
:host([align-self="center"]) { margin-inline: auto; }
:host([align-self="end"])    { margin-inline: auto 0; }

/* --- Gap --- */
:host([gap="none"]) { --gap: 0; }
:host([gap="xs"])   { --gap: var(--p9r-space-xs, 4px); }
:host([gap="sm"])   { --gap: var(--p9r-space-sm, 8px); }
:host([gap="md"])   { --gap: var(--p9r-space-md, 16px); }
:host([gap="lg"])   { --gap: var(--p9r-space-lg, 24px); }
:host([gap="xl"])   { --gap: var(--p9r-space-xl, 32px); }

/* --- Direction --- */
:host([direction="row"]) { flex-direction: row; }
:host([wrap]) { flex-wrap: wrap; }

/* --- Children cross-axis (align items) --- */
:host([align-items="start"])   { align-items: flex-start; }
:host([align-items="center"])  { align-items: center; }
:host([align-items="end"])     { align-items: flex-end; }
:host([align-items="stretch"]) { align-items: stretch; }

/* --- Children main-axis (justify) --- */
:host([justify="start"])   { justify-content: flex-start; }
:host([justify="center"])  { justify-content: center; }
:host([justify="end"])     { justify-content: flex-end; }
:host([justify="between"]) { justify-content: space-between; }
:host([justify="around"])  { justify-content: space-around; }
:host([justify="evenly"])  { justify-content: space-evenly; }

/* --- Dividers between children --- */
:host([divider]) { gap: 0; }

:host([divider]:not([direction="row"])) ::slotted(*:not(:first-child)) {
    border-block-start: 1px solid var(--divider-color);
    margin-block-start: var(--gap);
    padding-block-start: var(--gap);
}

:host([divider][direction="row"]) ::slotted(*:not(:first-child)) {
    border-inline-start: 1px solid var(--divider-color);
    margin-inline-start: var(--gap);
    padding-inline-start: var(--gap);
}
`;

  class Ji extends s {
    constructor() {
      super({ css: Yi, template: Gi });
    }
  }
  var Oi = `<section class="album" part="album">
    <slot class="images" name="images"></slot>
</section>
<section class="legend-album" part="legend-album" hidden></section>
<section class="preview" part="preview" role="dialog" aria-modal="true" aria-label="Apercu photo" hidden>
    <div class="preview-panel" part="preview-panel">
        <button class="preview-close" type="button" aria-label="Fermer l'apercu">&times;</button>
        <div class="preview-stage">
            <button class="preview-nav preview-prev" type="button" aria-label="Image precedente">&lsaquo;</button>
            <img class="preview-image" part="preview-image" alt="">
            <button class="preview-nav preview-next" type="button" aria-label="Image suivante">&rsaquo;</button>
        </div>
        <p class="preview-caption" part="preview-caption" hidden></p>
        <div class="preview-strip" part="preview-strip" role="listbox" aria-label="Autres images"></div>
    </div>
</section>
`;
  var Wi = `:host {
    --min: 260px;
    --gap: var(--p9r-space-lg, 24px);
    --radius: 8px;
    --fit: cover;
    --aspect-ratio: 4 / 3;
    --max-width: 100%;
    --image-bg: var(--bg-surface, #ffffff);
    --image-border: color-mix(in srgb, var(--border-default, #e5e7eb) 80%, transparent);
    --image-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);

    display: block;
    box-sizing: border-box;
    width: 100%;
    max-width: var(--max-width);
    margin-inline: 0 auto;
}

.album,
.legend-album {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--min), 100%), 1fr));
    gap: var(--gap);
    align-items: start;
}

.album[hidden],
.legend-album[hidden] {
    display: none !important;
}

.images {
    display: contents;
}

::slotted(img),
.figure img {
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: auto;
    aspect-ratio: var(--aspect-ratio);
    object-fit: var(--fit);
    border-radius: var(--radius);
    background: var(--image-bg);
    border: 1px solid var(--image-border);
    box-shadow: var(--image-shadow);
}

::slotted(img) {
    cursor: zoom-in;
}

.figure {
    display: grid;
    gap: var(--p9r-space-xs, 4px);
    margin: 0;
    break-inside: avoid;
}

.figure-trigger {
    display: block;
    width: 100%;
    padding: 0;
    cursor: zoom-in;
    appearance: none;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    font: inherit;
}

.figure-trigger:focus-visible,
.preview-close:focus-visible,
.preview-nav:focus-visible,
.preview-thumb:focus-visible {
    outline: 2px solid var(--primary-base, #2563eb);
    outline-offset: 3px;
}

.figure figcaption {
    color: var(--text-muted, #6b7280);
    font: inherit;
    font-size: 0.875rem;
    line-height: 1.45;
    text-align: center;
}

:host([layout="masonry"]) .album,
:host([layout="masonry"]) .legend-album {
    display: block;
    columns: var(--min);
    column-gap: var(--gap);
}

:host([layout="masonry"]) .images {
    display: contents;
}

:host([layout="masonry"]) ::slotted(img),
:host([layout="masonry"]) .figure {
    break-inside: avoid;
    margin-block-end: var(--gap);
}

:host([layout="masonry"]) ::slotted(img),
:host([layout="masonry"]) .figure img {
    aspect-ratio: auto;
}

:host([layout="strip"]) .album,
:host([layout="strip"]) .legend-album {
    display: flex;
    gap: var(--gap);
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
}

:host([layout="strip"]) .images {
    display: contents;
}

:host([layout="strip"]) ::slotted(img),
:host([layout="strip"]) .figure {
    flex: 0 0 min(var(--min), 82vw);
    scroll-snap-align: start;
}

.preview[hidden] {
    display: none !important;
}

.preview {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    padding: clamp(8px, 1.5vw, 20px);
    overflow: hidden;
    background: rgb(5 5 5 / 0.98);
}

.preview-panel {
    --preview-strip-height: 72px;

    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto var(--preview-strip-height);
    gap: var(--p9r-space-sm, 8px);
    width: 100%;
    height: 100%;
    min-height: 0;
    color: var(--text-main, #111827);
}

.preview-stage {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 0;
    overflow: hidden;
}

.preview-image {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: var(--radius);
    background: transparent;
}

.preview-close,
.preview-nav,
.preview-thumb {
    appearance: none;
    border: 0;
    font: inherit;
}

.preview-close,
.preview-nav {
    color: var(--primary-contrasted, #ffffff);
    background: rgb(0 0 0 / 0.72);
    border: 1px solid rgb(255 255 255 / 0.42);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.36);
    cursor: pointer;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
}

.preview-close {
    position: fixed;
    top: clamp(12px, 2vw, 24px);
    right: clamp(12px, 2vw, 24px);
    z-index: 2;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    font-size: 1.75rem;
    line-height: 1;
}

.preview-nav {
    position: fixed;
    top: 50%;
    z-index: 2;
    width: 52px;
    height: 52px;
    border-radius: 999px;
    font-size: 2.25rem;
    line-height: 1;
    transform: translateY(-50%);
}

.preview-prev {
    left: clamp(12px, 2vw, 24px);
}

.preview-next {
    right: clamp(12px, 2vw, 24px);
}

.preview-caption {
    max-width: 72ch;
    margin: 0 auto;
    color: var(--primary-contrasted, #ffffff);
    font-size: 0.95rem;
    line-height: 1.45;
    text-align: center;
}

.preview-strip {
    display: flex;
    gap: var(--p9r-space-sm, 8px);
    width: min(100%, 1120px);
    height: var(--preview-strip-height);
    max-width: 100%;
    margin-inline: auto;
    padding-block: var(--p9r-space-xs, 4px);
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
}

.preview-strip::-webkit-scrollbar {
    display: none;
}

.preview-thumb {
    flex: 0 0 76px;
    width: 76px;
    height: 58px;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    border-radius: 6px;
    background: var(--image-bg);
    opacity: 0.68;
    scroll-snap-align: center;
}

.preview-thumb[aria-selected="true"] {
    opacity: 1;
    box-shadow: 0 0 0 3px var(--primary-base, #2563eb);
}

.preview-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

:host([min="sm"]) { --min: 160px; }
:host([min="md"]) { --min: 260px; }
:host([min="lg"]) { --min: 340px; }
:host([min="xl"]) { --min: 440px; }

:host([gap="none"]) { --gap: 0; }
:host([gap="xs"]) { --gap: var(--p9r-space-xs, 4px); }
:host([gap="sm"]) { --gap: var(--p9r-space-sm, 8px); }
:host([gap="md"]) { --gap: var(--p9r-space-md, 16px); }
:host([gap="lg"]) { --gap: var(--p9r-space-lg, 24px); }
:host([gap="xl"]) { --gap: var(--p9r-space-xl, 32px); }

:host([ratio="square"]) { --aspect-ratio: 1 / 1; }
:host([ratio="landscape"]) { --aspect-ratio: 4 / 3; }
:host([ratio="wide"]) { --aspect-ratio: 16 / 9; }
:host([ratio="portrait"]) { --aspect-ratio: 3 / 4; }
:host([ratio="natural"]) { --aspect-ratio: auto; }

:host([fit="cover"]) { --fit: cover; }
:host([fit="contain"]) { --fit: contain; }

:host([radius="none"]) { --radius: 0; }
:host([radius="sm"]) { --radius: 4px; }
:host([radius="md"]) { --radius: 8px; }
:host([radius="lg"]) { --radius: 16px; }

:host([chrome="none"]) {
    --image-bg: transparent;
    --image-border: transparent;
    --image-shadow: none;
}

:host([chrome="framed"]) {
    --image-bg: var(--bg-surface, #ffffff);
    --image-border: color-mix(in srgb, var(--border-default, #e5e7eb) 80%, transparent);
    --image-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

:host([size="sm"]) { --max-width: var(--p9r-container-sm, 640px); }
:host([size="md"]) { --max-width: var(--p9r-container-md, 768px); }
:host([size="lg"]) { --max-width: var(--p9r-container-lg, 1024px); }
:host([size="xl"]) { --max-width: var(--p9r-container-xl, 1280px); }
:host([size="full"]) { --max-width: 100%; }

:host([align-self="start"]) { margin-inline: 0 auto; }
:host([align-self="center"]) { margin-inline: auto; }
:host([align-self="end"]) { margin-inline: auto 0; }
`;

  class ta extends s {
    _observer = null;
    _activeIndex = 0;
    static get observedAttributes() {
      return ["view-legend"];
    }
    constructor() {
      super({ css: Wi, template: Oi });
    }
    connectedCallback() {
      this._slot.addEventListener("slotchange", this._syncImages), this.addEventListener("click", this._onHostClick), this._preview.addEventListener("click", this._onPreviewClick), this._strip.addEventListener("click", this._onStripClick), this._closeButton.addEventListener("click", this._closePreview), this._prevButton.addEventListener("click", this._showPrevious), this._nextButton.addEventListener("click", this._showNext), this._observer = new MutationObserver(this._syncImages), this._observer.observe(this, { attributes: true, childList: true, subtree: true, attributeFilter: ["src", "alt", "width", "height", "slot"] }), this._syncImages();
    }
    disconnectedCallback() {
      this._slot.removeEventListener("slotchange", this._syncImages), this.removeEventListener("click", this._onHostClick), this._preview.removeEventListener("click", this._onPreviewClick), this._strip.removeEventListener("click", this._onStripClick), this._closeButton.removeEventListener("click", this._closePreview), this._prevButton.removeEventListener("click", this._showPrevious), this._nextButton.removeEventListener("click", this._showNext), document.removeEventListener("keydown", this._onKeyDown), this._observer?.disconnect(), this._observer = null;
    }
    attributeChangedCallback() {
      this._syncImages();
    }
    _syncImages = () => {
      let t = this.hasAttribute("view-legend");
      if (this._album.hidden = t, this._legendAlbum.hidden = !t, !t) {
        this._legendAlbum.replaceChildren(), this._syncPreview();
        return;
      }
      let e = this._images.map((r, i) => this._figureFor(r, i));
      this._legendAlbum.replaceChildren(...e), this._syncPreview();
    };
    _figureFor(t, e) {
      let r = document.createElement("figure");
      r.className = "figure", r.setAttribute("part", "figure");
      let i = document.createElement("button");
      i.className = "figure-trigger", i.type = "button", i.dataset.previewIndex = String(e), i.ariaLabel = t.alt.trim() || "Afficher l'image";
      let a = document.createElement("img");
      if (a.src = t.currentSrc || t.src, a.alt = t.alt, a.loading = t.loading || "lazy", t.width > 0)
        a.width = t.width;
      if (t.height > 0)
        a.height = t.height;
      let o = document.createElement("figcaption");
      return o.setAttribute("part", "legend"), o.textContent = t.alt, o.hidden = t.alt.trim() === "", i.append(a), r.append(i, o), r;
    }
    _onHostClick = (t) => {
      let e = this._images, r = t.composedPath().find((a) => {
        return a instanceof HTMLImageElement && e.includes(a);
      });
      if (r) {
        this._openPreview(e.indexOf(r));
        return;
      }
      let i = t.composedPath().find((a) => {
        return a instanceof HTMLButtonElement && a.dataset.previewIndex !== undefined;
      });
      if (!i)
        return;
      this._openPreview(Number(i.dataset.previewIndex));
    };
    _onPreviewClick = (t) => {
      if (t.target === this._preview)
        this._closePreview();
    };
    _onStripClick = (t) => {
      let e = t.composedPath().find((r) => {
        return r instanceof HTMLButtonElement && r.dataset.previewIndex !== undefined;
      });
      if (!e)
        return;
      this._setActiveIndex(Number(e.dataset.previewIndex));
    };
    _onKeyDown = (t) => {
      if (this._preview.hidden)
        return;
      if (t.key === "Escape")
        t.preventDefault(), this._closePreview();
      else if (t.key === "ArrowLeft")
        t.preventDefault(), this._showPrevious();
      else if (t.key === "ArrowRight")
        t.preventDefault(), this._showNext();
    };
    _openPreview(t) {
      if (!Number.isInteger(t) || t < 0 || t >= this._images.length)
        return;
      this._preview.hidden = false, document.addEventListener("keydown", this._onKeyDown), this._setActiveIndex(t), this._closeButton.focus();
    }
    _closePreview = () => {
      this._preview.hidden = true, document.removeEventListener("keydown", this._onKeyDown);
    };
    _showPrevious = () => {
      let t = this._images.length;
      if (t === 0)
        return;
      this._setActiveIndex((this._activeIndex - 1 + t) % t);
    };
    _showNext = () => {
      let t = this._images.length;
      if (t === 0)
        return;
      this._setActiveIndex((this._activeIndex + 1) % t);
    };
    _setActiveIndex(t) {
      let e = this._images;
      if (!Number.isInteger(t) || t < 0 || t >= e.length)
        return;
      this._activeIndex = t;
      let r = e[t];
      this._previewImage.src = r.currentSrc || r.src, this._previewImage.alt = r.alt, this._caption.textContent = r.alt, this._caption.hidden = !this.hasAttribute("view-legend") || r.alt.trim() === "", this._prevButton.hidden = e.length < 2, this._nextButton.hidden = e.length < 2, this._syncStrip();
    }
    _syncPreview() {
      if (this._preview.hidden)
        return;
      if (this._images.length === 0) {
        this._closePreview();
        return;
      }
      this._setActiveIndex(Math.min(this._activeIndex, this._images.length - 1));
    }
    _syncStrip() {
      let t = this._images.map((e, r) => {
        let i = document.createElement("button");
        i.className = "preview-thumb", i.type = "button", i.dataset.previewIndex = String(r), i.ariaSelected = r === this._activeIndex ? "true" : "false", i.setAttribute("role", "option"), i.ariaLabel = e.alt.trim() || `Image ${r + 1}`;
        let a = document.createElement("img");
        return a.src = e.currentSrc || e.src, a.alt = "", a.loading = e.loading || "lazy", i.append(a), i;
      });
      this._strip.replaceChildren(...t), this._strip.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    }
    get _images() {
      return this._slot.assignedElements({ flatten: true }).filter((t) => t instanceof HTMLImageElement);
    }
    get _slot() {
      return this.shadowRoot.querySelector('slot[name="images"]');
    }
    get _album() {
      return this.shadowRoot.querySelector(".album");
    }
    get _legendAlbum() {
      return this.shadowRoot.querySelector(".legend-album");
    }
    get _preview() {
      return this.shadowRoot.querySelector(".preview");
    }
    get _previewImage() {
      return this.shadowRoot.querySelector(".preview-image");
    }
    get _caption() {
      return this.shadowRoot.querySelector(".preview-caption");
    }
    get _strip() {
      return this.shadowRoot.querySelector(".preview-strip");
    }
    get _closeButton() {
      return this.shadowRoot.querySelector(".preview-close");
    }
    get _prevButton() {
      return this.shadowRoot.querySelector(".preview-prev");
    }
    get _nextButton() {
      return this.shadowRoot.querySelector(".preview-next");
    }
  }
  var ea = `<aside class="sidebar" part="sidebar">
    <div class="sidebar-header" part="header">
        <slot name="header">
            <h3>Menu</h3>
        </slot>
    </div>

    <nav class="sidebar-nav" part="nav">
        <slot></slot>
    </nav>

    <div class="sidebar-footer" part="footer">
        <slot name="footer"></slot>
    </div>
</aside>
`;
  var ra = `:host {
    display: flex;
    flex-direction: column;
    width: 260px;
    height: 100vh;
    background-color: var(--bg-surface);
    border-right: 1px solid var(--secondary-muted);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    box-sizing: border-box;

    --ctx-bg: var(--bg-surface);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--secondary-muted);
}

:host([collapsed]) {
    width: 72px;
}

.sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

@media (prefers-reduced-motion: no-preference) {
    :host {
        transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
}

.sidebar-header {
    padding: 2.5rem 1.5rem 1.5rem 1.5rem;
}

::slotted([slot="header"]) {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--secondary-contrasted);
    letter-spacing: -0.04em;
}

::slotted([slot="header"]) span {
    color: var(--primary-base);
}

::slotted([slot="header"])::after {
    content: "";
    width: 4px;
    height: 4px;
    margin-top: 8px;
    background-color: var(--primary-base);
    border-radius: 50%;
}

.sidebar-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 0.75rem;
}

.sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0.75rem;
    margin-top: auto;
    border-top: 1px solid var(--secondary-muted);
}

::slotted(w13c-lateral-menu-item) {
    --item-color: var(--secondary-base);
    --item-color-active: var(--primary-base);
    --item-bg-hover: var(--primary-muted);
}
`;
  var ia = (t) => {
    if (!t)
      return [];
    return t.assignedElements({ flatten: true }).filter((e) => e instanceof HTMLElement && e.tagName.toLowerCase() === "w13c-lateral-menu-item" && !e.hasAttribute("disabled"));
  };
  var aa = (t, e) => {
    let r = t.shadowRoot?.querySelector("slot:not([name])"), i = ia(r);
    if (i.length === 0)
      return;
    let a = document.activeElement, o = i.findIndex((c) => c === a || c.contains(a)), n = -1;
    switch (e.key) {
      case "ArrowDown":
        n = o < 0 ? 0 : (o + 1) % i.length;
        break;
      case "ArrowUp":
        n = o < 0 ? i.length - 1 : (o - 1 + i.length) % i.length;
        break;
      case "Home":
        n = 0;
        break;
      case "End":
        n = i.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    let l = i[n];
    if (l)
      l.focus();
  };

  class oa extends s {
    _sidebar;
    constructor() {
      super({ css: ra, template: ea });
      this._sidebar = this.shadowRoot?.querySelector(".sidebar") ?? null;
    }
    static get observedAttributes() {
      return ["collapsed"];
    }
    connectedCallback() {
      if (d(this, "collapsed"), !this.hasAttribute("aria-label"))
        this.setAttribute("aria-label", "Main navigation");
      this.addEventListener("keydown", this._onKey);
    }
    disconnectedCallback() {
      this.removeEventListener("keydown", this._onKey);
    }
    attributeChangedCallback(t) {
      if (!this._sidebar)
        return;
      if (t === "collapsed")
        this._sidebar.classList.toggle("collapsed", this.hasAttribute("collapsed"));
    }
    toggle() {
      this.collapsed = !this.collapsed;
    }
    get collapsed() {
      return this.hasAttribute("collapsed");
    }
    set collapsed(t) {
      if (t)
        this.setAttribute("collapsed", "");
      else
        this.removeAttribute("collapsed");
    }
    _onKey = (t) => aa(this, t);
  }
  var na = `<a class="menu-item" part="item" tabindex="-1">
    <span class="icon-wrapper" part="icon">
        <slot name="icon"></slot>
    </span>
    <span class="label" part="label">
        <slot></slot>
    </span>
    <span class="badge" part="badge" id="badge-element"></span>
</a>
`;
  var sa = `:host {
    display: block;
    width: 100%;
    outline: none;
    --item-color: var(--secondary-base, oklch(50% 0.02 260));
    --item-color-active: var(--primary-base, oklch(60% 0.15 265));
    --item-bg-active: var(--primary-muted, oklch(95% 0.02 265));
    --item-contrasted: var(--primary-contrasted, oklch(98% 0.01 260));
    --icon-size: 20px;

    --ctx-bg: transparent;
    --ctx-fg: var(--item-color);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: transparent;
}

:host([active]) {
    --ctx-bg: var(--item-bg-active);
    --ctx-fg: var(--item-color-active);
    --ctx-border: var(--item-color-active);
}

.menu-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0.75rem 1rem;
    text-decoration: none;
    color: var(--item-color);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 0.9rem;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
}

@media (prefers-reduced-motion: no-preference) {
    .menu-item {
        transition: background-color 0.2s ease, color 0.2s ease;
    }
}

.icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--icon-size);
    height: var(--icon-size);
    flex-shrink: 0;
}

::slotted(svg), .icon-wrapper svg {
    width: 100% !important;
    height: 100% !important;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
}

.label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.badge {
    display: none;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: 20px;
    white-space: nowrap;
    flex-shrink: 0;
}
`;
  var la = `.menu-item:hover {
    background-color: var(--item-bg-active);
    color: var(--item-color-active);
}

:host(:focus-visible) .menu-item {
    outline: 2px solid var(--item-color-active);
    outline-offset: 2px;
}

.menu-item.active {
    background-color: var(--item-bg-active);
    color: var(--item-color-active);
    font-weight: 600;
}

.menu-item.active::before {
    content: "";
    position: absolute;
    left: 0;
    width: 3px;
    height: 100%;
    background-color: var(--item-color-active);
    border-radius: 0 4px 4px 0;
}

.menu-item.active ::slotted(svg) {
    stroke: var(--item-color-active);
}

:host([disabled]) .menu-item {
    cursor: not-allowed;
    pointer-events: none;
    opacity: 0.5;
    filter: grayscale(1);
    background: transparent !important;
}

.menu-item:not(.active) .badge {
    background-color: var(--item-bg-active);
    color: var(--item-color-active);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--item-color-active), transparent 90%);
}

.menu-item.active .badge {
    background-color: var(--item-color-active);
    color: var(--item-contrasted);
    box-shadow: 0 2px 4px color-mix(in oklab, var(--item-color-active), transparent 80%);
}
`;
  var It = (t, e) => {
    if (!t)
      return;
    if (e)
      t.setAttribute("href", e);
    else
      t.removeAttribute("href");
  };
  var St = (t, e) => {
    if (!t)
      return;
    if (e)
      t.textContent = e, t.style.display = "inline-flex";
    else
      t.textContent = "", t.style.display = "none";
  };
  var qt = (t, e) => {
    if (!e || !t.hasAttribute("href"))
      return;
    let r = t.getAttribute("href");
    if (!r)
      return;
    try {
      let i = new URL(r, window.location.href), o = new URL(window.location.href).pathname, n = i.pathname;
      if (n === "/" ? o === "/" : o === n || o.startsWith(n + "/"))
        t.setAttribute("active", ""), t.setAttribute("aria-current", "page"), e.classList.add("active");
      else
        t.removeAttribute("active"), t.removeAttribute("aria-current"), e.classList.remove("active");
    } catch {
      console.warn("Invalid href in LateralMenuItem:", r);
    }
  };
  var da = (t, e, r) => {
    if (t.hasAttribute("disabled"))
      return;
    if (r.key !== "Enter" && r.key !== " ")
      return;
    if (r.target !== t)
      return;
    r.preventDefault(), e?.click();
  };
  var xl = sa + la;

  class ca extends s {
    _anchor;
    _badgeEl;
    constructor() {
      super({ css: xl, template: na });
      this._anchor = this.shadowRoot?.querySelector("a") ?? null, this._badgeEl = this.shadowRoot?.getElementById("badge-element") ?? null;
    }
    static get observedAttributes() {
      return ["href", "badge", "disabled"];
    }
    connectedCallback() {
      for (let t of ["href", "badge", "disabled"])
        d(this, t);
      if (!this.hasAttribute("role"))
        this.setAttribute("role", "listitem");
      if (!this.hasAttribute("tabindex"))
        this.setAttribute("tabindex", "0");
      It(this._anchor, this.getAttribute("href")), St(this._badgeEl, this.getAttribute("badge")), qt(this, this._anchor), window.addEventListener("popstate", this._onPopstate), this.addEventListener("keydown", this._onKey);
    }
    disconnectedCallback() {
      window.removeEventListener("popstate", this._onPopstate), this.removeEventListener("keydown", this._onKey);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._anchor)
        return;
      if (t === "href")
        It(this._anchor, r);
      if (t === "badge")
        St(this._badgeEl, r);
      if (t === "disabled") {
        let i = this.hasAttribute("disabled");
        this.setAttribute("aria-disabled", i ? "true" : "false"), this.setAttribute("tabindex", i ? "-1" : "0");
      }
    }
    get href() {
      return this.getAttribute("href");
    }
    set href(t) {
      t == null ? this.removeAttribute("href") : this.setAttribute("href", t);
    }
    get badge() {
      return this.getAttribute("badge");
    }
    set badge(t) {
      t == null ? this.removeAttribute("badge") : this.setAttribute("badge", t);
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      t ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    _onPopstate = () => qt(this, this._anchor);
    _onKey = (t) => da(this, this._anchor, t);
  }
  var Ia = `:host {
  display: flex;
  flex: 1;

  --_size: 28px;
  --_active: var(--primary-base, #4361ee);
  --_completed: var(--success-base, #10b981);
  --_pending: var(--border-default, #d1d5db);
  --_text: var(--text-main, #1f2937);
  --_muted: var(--text-muted, #6b7280);
  --_bg: var(--bg-surface, #fff);
  --_color: var(--_pending);
  --_label-color: var(--_muted);
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  flex: 1;
  list-style: none;
}

.indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 0 auto;
}

.bullet {
  width: var(--_size);
  height: var(--_size);
  border-radius: 50%;
  border: 2px solid var(--_color);
  background: var(--_bg);
  color: var(--_color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  position: relative;
}

.number,
.check {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.check {
  width: 60%;
  height: 60%;
  margin: auto;
  inset: auto;
  display: none;
}

.connector {
  background: var(--_color);
  flex: 1;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--_label-color);
}

.label:empty { display: none; }

.description {
  font-size: 12px;
  color: var(--_muted);
}

.description.is-empty { display: none; }
`;
  var Sa = `:host([data-state="active"], [state="active"]) {
  --_color: var(--_active);
  --_label-color: var(--_text);
}

:host([data-state="completed"], [state="completed"]) {
  --_color: var(--_completed);
  --_label-color: var(--_text);
}

:host([orientation="vertical"]) .step {
  flex-direction: row;
  align-items: flex-start;
}

:host(:not([orientation="vertical"])) .indicator {
  flex-direction: row;
  align-items: center;
  flex: 1;
}

:host([data-state="active"], [state="active"]) .bullet {
  background: var(--_color);
  color: var(--_bg);
}

:host([data-state="completed"], [state="completed"]) .bullet {
  background: var(--_color);
  color: var(--_bg);
  border-color: var(--_color);
}

:host([data-state="completed"], [state="completed"]) .number { display: none; }
:host([data-state="completed"], [state="completed"]) .check  { display: flex; }

:host(:not([orientation="vertical"])) .connector {
  height: 2px;
  margin-inline: 0.4rem;
  min-width: 1rem;
}

:host([orientation="vertical"]) .connector {
  width: 2px;
  margin-block: 0.4rem;
  min-height: 1.5rem;
  align-self: stretch;
}

:host([last]) .connector {
  display: none;
}

:host(:not([orientation="vertical"])) .step {
  flex-direction: column;
}

:host(:not([orientation="vertical"])) .body {
  text-align: center;
  margin-top: 0.4rem;
}
`;
  var Sl = Ia + Sa;
  var Pa = `<div class="table-container">
  <div class="p9r-table">
    <slot name="header"></slot>
    <slot></slot>
  </div>
</div>`;
  var Ba = `:host {
  display: block;
  width: 100%;

  --ctx-bg: var(--bg-surface);
  --ctx-fg: var(--text-main);
  --ctx-fg-muted: var(--text-muted);
  --ctx-border: var(--border-default);
}

.table-container {
  width: 100%;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
}

.p9r-table {
  display: table;
  width: 100%;
  border-collapse: collapse;
}

::slotted(p9r-row[slot="header"]) {
  background-color: var(--_header-bg);
  color: var(--text-main);
  font-weight: 600;
}

::slotted(p9r-row:not(:last-child)) {
  border-bottom: 1px solid var(--border-default);
}

::slotted(p9r-row:not(:first-child):hover) {
  background-color: var(--bg-base);
}
`;

  class Fa extends s {
    constructor() {
      super({ css: Ba, template: Pa });
    }
  }
  var Ka = `<slot></slot>
`;
  var Da = `:host {
  display: table-cell;
  padding: 12px 20px;
  vertical-align: middle;
  color: var(--text-body);
  font-size: 14px;
}

:host([variant="success"]) {
  color: var(--success-base);
}

:host([variant="danger"]) {
  color: var(--danger-base);
}

:host([variant="info"]) {
  color: var(--info-base);
}

:host([variant="primary"]) {
  color: var(--primary-base);
}
`;

  class ja extends s {
    constructor() {
      super({ css: Da, template: Ka });
    }
    connectedCallback() {
      if (!this.hasAttribute("role"))
        this.setAttribute("role", "cell");
    }
  }
  var Va = `<div class="header-wrapper" part="wrapper">
  <button
    type="button"
    class="label-section"
    id="sort-trigger"
    part="sort-trigger"
  >
    <slot></slot>
    <span class="sort-icon" id="sort-icon" part="sort-icon" aria-hidden="true">...</span>
  </button>

  <button
    type="button"
    class="filter-trigger"
    id="filter-btn"
    part="filter-trigger"
    aria-haspopup="dialog"
    aria-expanded="false"
    hidden
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
    </svg>
  </button>

  <div class="filter-popover" id="filter-popover" part="filter-popover" role="dialog" hidden>
    <input type="text" placeholder="Filter..." id="filter-input" part="filter-input" />
  </div>
</div>
`;
  var Na = `:host {
  display: table-cell;
  padding: 12px 20px;
  border-bottom: 2px solid var(--border-light);
  position: relative;
  vertical-align: middle;
}

.header-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.label-section {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  margin: 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: default;
}

.sort-icon {
  display: none;
}

.filter-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px;
  border: 0;
  background: transparent;
  border-radius: 4px;
  color: var(--text-muted);
}

.filter-popover {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  background: var(--bg-surface);
  border: 1px solid var(--border-default, #ddd);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 10px;
  border-radius: 6px;
  min-width: 150px;
}

.filter-popover[hidden] {
  display: none;
}

#filter-input {
  width: 100%;
  padding: 6px;
  border: 1px solid var(--border-default, #ddd);
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  box-sizing: border-box;
}
`;
  var Ra = `:host([sort]) .label-section {
  cursor: pointer;
}

.label-section:focus-visible,
.filter-trigger:focus-visible,
#filter-input:focus-visible {
  outline: 2px solid var(--primary-base);
  outline-offset: 2px;
}

:host([sort]) .sort-icon {
  display: inline;
}

:host([aria-sort="ascending"]) .sort-icon::before {
  content: "\\2191";
}

:host([aria-sort="descending"]) .sort-icon::before {
  content: "\\2193";
}

:host([aria-sort="ascending"]) .sort-icon,
:host([aria-sort="descending"]) .sort-icon {
  font-size: 0;
}

:host([aria-sort="ascending"]) .sort-icon::before,
:host([aria-sort="descending"]) .sort-icon::before {
  font-size: 14px;
}

:host([data-has-filter]) .filter-trigger {
  color: var(--primary-base, #007bff);
}

@media (prefers-reduced-motion: no-preference) {
  .filter-trigger {
    transition: background 0.2s;
  }
}

.filter-trigger:hover {
  background: var(--bg-base, #eee);
}
`;
  var Vl = (t) => {
    let e = t.getAttribute("filter-name");
    if (!e)
      return "";
    return new URL(window.location.href).searchParams.get(`f_${e}`) ?? "";
  };
  var Pt = (t, e, r) => {
    let i = t.getAttribute("filter-name");
    if (!e)
      return;
    if (!i) {
      e.setAttribute("hidden", ""), t.removeAttribute("data-has-filter");
      return;
    }
    e.removeAttribute("hidden");
    let a = Vl(t);
    if (r)
      r.value = a;
    if (a)
      t.setAttribute("data-has-filter", "");
    else
      t.removeAttribute("data-has-filter");
  };
  var $a = (t) => {
    let e = t.getAttribute("sort");
    if (!e)
      return;
    let r = new URL(window.location.href), i = r.searchParams.get("sort"), a = r.searchParams.get("direction"), o = i === e && a === "asc" ? "desc" : "asc";
    r.searchParams.set("sort", e), r.searchParams.set("direction", o), window.location.href = r.toString();
  };
  var Xa = (t, e) => {
    let r = t.getAttribute("filter-name");
    if (!r)
      return;
    let i = new URL(window.location.href);
    if (e)
      i.searchParams.set(`f_${r}`, e);
    else
      i.searchParams.delete(`f_${r}`);
    window.location.href = i.toString();
  };
  var Za = (t, e) => {
    if (e.composedPath().some((r) => r instanceof HTMLInputElement))
      return;
    $a(t);
  };
  var Ua = (t, e, r, i) => {
    if (t.stopPropagation(), !r || !e)
      return;
    if (r.hasAttribute("hidden"))
      r.removeAttribute("hidden"), e.setAttribute("aria-expanded", "true"), i?.focus();
    else
      r.setAttribute("hidden", ""), e.setAttribute("aria-expanded", "false");
  };
  var Qa = (t, e, r) => {
    if (r.key !== "Enter" || !e)
      return;
    Xa(t, e.value);
  };
  var Ga = (t, e) => {
    e?.setAttribute("hidden", ""), t?.setAttribute("aria-expanded", "false");
  };
  var Nl = Na + Ra;

  class Ya extends s {
    _sortTrigger;
    _filterBtn;
    _filterPopover;
    _filterInput;
    static get observedAttributes() {
      return ["sort", "filter-name"];
    }
    constructor() {
      super({ css: Nl, template: Va });
      this._sortTrigger = this.shadowRoot?.querySelector("#sort-trigger") ?? null, this._filterBtn = this.shadowRoot?.querySelector("#filter-btn") ?? null, this._filterPopover = this.shadowRoot?.querySelector("#filter-popover") ?? null, this._filterInput = this.shadowRoot?.querySelector("#filter-input") ?? null;
    }
    connectedCallback() {
      Pt(this, this._filterBtn, this._filterInput), this._sortTrigger?.addEventListener("click", this._onSort), this._filterBtn?.addEventListener("click", this._onFilterToggle), this._filterPopover?.addEventListener("click", this._stopPropagation), this._filterInput?.addEventListener("keydown", this._onFilterKey), window.addEventListener("click", this._onWindowClick);
    }
    disconnectedCallback() {
      this._sortTrigger?.removeEventListener("click", this._onSort), this._filterBtn?.removeEventListener("click", this._onFilterToggle), this._filterPopover?.removeEventListener("click", this._stopPropagation), this._filterInput?.removeEventListener("keydown", this._onFilterKey), window.removeEventListener("click", this._onWindowClick);
    }
    attributeChangedCallback() {
      Pt(this, this._filterBtn, this._filterInput);
    }
    _onSort = (t) => Za(this, t);
    _onFilterToggle = (t) => Ua(t, this._filterBtn, this._filterPopover, this._filterInput);
    _onFilterKey = (t) => Qa(this, this._filterInput, t);
    _onWindowClick = () => Ga(this._filterBtn, this._filterPopover);
    _stopPropagation = (t) => t.stopPropagation();
  }
  var Ja = `<slot></slot>
`;
  var Oa = `:host {
  display: table-row;
}

:host([href]) {
  cursor: pointer;
}

:host(:focus-visible) {
  outline: 2px inset var(--primary-base);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: no-preference) {
  :host {
    transition: background-color 0.15s ease;
  }
}
`;
  var Bt = (t) => {
    let e = t.getAttribute("href");
    if (!e)
      return;
    let r = t.getAttribute("target"), i = new CustomEvent("p9r-row-click", { detail: { href: e, target: r }, bubbles: true, composed: true, cancelable: true });
    if (!t.dispatchEvent(i))
      return;
    if (r === "_blank")
      window.open(e, "_blank", "noopener,noreferrer");
    else
      window.location.href = e;
  };
  var Wa = (t) => {
    if (!t.hasAttribute("href"))
      return;
    Bt(t);
  };
  var to = (t, e) => {
    if (!t.hasAttribute("href"))
      return;
    if (e.key === "Enter" || e.key === " ")
      e.preventDefault(), Bt(t);
  };
  var Ft = (t) => {
    if (t.hasAttribute("href")) {
      if (!t.hasAttribute("tabindex"))
        t.setAttribute("tabindex", "0");
      if (!t.hasAttribute("role"))
        t.setAttribute("role", "link");
    } else {
      if (t.getAttribute("role") === "link")
        t.removeAttribute("role");
      if (t.getAttribute("tabindex") === "0")
        t.removeAttribute("tabindex");
      if (!t.hasAttribute("role"))
        t.setAttribute("role", "row");
    }
  };

  class eo extends s {
    static get observedAttributes() {
      return ["href"];
    }
    constructor() {
      super({ css: Oa, template: Ja });
    }
    connectedCallback() {
      for (let t of ["href", "target"])
        d(this, t);
      this.addEventListener("click", this._onClick), this.addEventListener("keydown", this._onKey), Ft(this);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._onClick), this.removeEventListener("keydown", this._onKey);
    }
    attributeChangedCallback(t) {
      if (t === "href")
        Ft(this);
    }
    _onClick = () => Wa(this);
    _onKey = (t) => to(this, t);
    get href() {
      return this.getAttribute("href");
    }
    set href(t) {
      if (t === null)
        this.removeAttribute("href");
      else
        this.setAttribute("href", t);
    }
    get target() {
      return this.getAttribute("target");
    }
    set target(t) {
      if (t === null)
        this.removeAttribute("target");
      else
        this.setAttribute("target", t);
    }
  }
  var ro = `<div class="tabs" part="tabs">
    <div class="tablist" part="tablist" role="tablist"></div>
    <div class="panels" part="panels">
        <slot></slot>
    </div>
</div>
`;
  var io = `:host {
  display: block;

  --_border: var(--border-default, #e5e7eb);
  --_active: var(--primary-base, #4361ee);
  --_text: var(--text-body, #4b5563);
  --_text-active: var(--primary-base, #4361ee);
  --_pad-y: 0.6rem;
  --_pad-x: 1rem;
  --_size: 13px;
}

.tabs {
  display: flex;
  flex-direction: column;
}

.tablist {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--_border);
  overflow-x: auto;
  scrollbar-width: thin;
  overflow: hidden;
}

.tab {
  appearance: none;
  background: transparent;
  border: 0;
  padding: var(--_pad-y) var(--_pad-x);
  font: inherit;
  font-size: var(--_size);
  font-weight: 500;
  color: var(--_text);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}

.tab[aria-selected="true"] {
  color: var(--_text-active);
}

.tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  bottom: -1px;
  height: 2px;
  background: var(--_active);
}

.tab:hover:not([aria-selected="true"]) {
  color: var(--text-main, #1f2937);
}

.tab:focus-visible {
  outline: 2px solid var(--_active);
  outline-offset: -2px;
  border-radius: 4px;
}

.tab[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}

.panels {
  padding-top: 1rem;
  flex: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .tab { transition: color 0.15s; }
}
`;
  var ao = `:host([variant="pills"]) .tablist {
  border-bottom: 0;
  gap: 0.4rem;
  padding: 0.25rem;
  background: var(--bg-base, #f1f5f9);
  border-radius: 8px;
  width: max-content;
}

:host([orientation="vertical"]) .tabs {
  flex-direction: row;
  gap: 1rem;
}

:host([orientation="vertical"]) .tablist {
  flex-direction: column;
  border-bottom: 0;
  border-right: 1px solid var(--_border);
}

:host([variant="pills"]) .tab[aria-selected="true"]::after {
  display: none;
}

:host([variant="pills"]) .tab {
  border-radius: 6px;
}

:host([variant="pills"]) .tab[aria-selected="true"] {
  background: var(--bg-surface, #fff);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  color: var(--text-main);
}

:host([orientation="vertical"]) .panels {
  padding-top: 0;
  padding-left: 1rem;
}
`;
  var Kt = (t) => {
    if (!t)
      return [];
    return t.assignedElements({ flatten: true }).filter((e) => e.tagName === "P9R-TAB-PANEL");
  };
  var Ql = 0;
  var oo = () => `tabpanel-${Ql++}`;
  var no = (t, e) => {
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { active: e } }));
  };
  var Dt = (t, e, r) => {
    if (!e)
      return;
    e.innerHTML = "";
    let i = Kt(r), a = t.getAttribute("active");
    if (!a && i.length > 0)
      a = i[0]?.getAttribute("id") ?? null;
    if (i.forEach((o, n) => {
      let l = o.getAttribute("id") ?? oo();
      if (!o.id)
        o.id = l;
      let c = o.getAttribute("label") ?? `Tab ${n + 1}`, p = document.createElement("button");
      if (p.type = "button", p.className = "tab", p.setAttribute("part", "tab"), p.setAttribute("role", "tab"), p.setAttribute("id", `tab-${l}`), p.setAttribute("aria-controls", l), p.dataset.target = l, p.textContent = c, o.hasAttribute("disabled"))
        p.setAttribute("disabled", "");
      e.appendChild(p), o.setAttribute("role", "tabpanel"), o.setAttribute("aria-labelledby", `tab-${l}`);
    }), a)
      z(t, e, r, a);
  };
  var z = (t, e, r, i) => {
    let a = Kt(r), o = Array.from(e?.querySelectorAll(".tab") ?? []), n = false;
    if (a.forEach((l) => {
      let c = l.id === i;
      if (c)
        n = true;
      l.toggleAttribute("hidden", !c);
    }), o.forEach((l) => {
      let c = l.dataset.target === i;
      l.setAttribute("aria-selected", String(c)), l.setAttribute("tabindex", c ? "0" : "-1");
    }), n && t.getAttribute("active") !== i)
      t.setAttribute("active", i), no(t, i);
  };
  var so = (t, e, r, i) => {
    let a = i.target.closest(".tab");
    if (!a || a.hasAttribute("disabled"))
      return;
    let o = a.dataset.target;
    if (o)
      z(t, e, r, o);
  };
  var lo = (t, e, r, i) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(i.key))
      return;
    let a = Array.from(e?.querySelectorAll(".tab:not([disabled])") ?? []);
    if (a.length === 0)
      return;
    let o = a.findIndex((u) => u === document.activeElement), n = o === -1 ? 0 : o, l = n;
    if (i.key === "ArrowLeft")
      l = (n - 1 + a.length) % a.length;
    if (i.key === "ArrowRight")
      l = (n + 1) % a.length;
    if (i.key === "Home")
      l = 0;
    if (i.key === "End")
      l = a.length - 1;
    i.preventDefault();
    let c = a[l];
    if (!c)
      return;
    let p = c.dataset.target;
    if (p)
      z(t, e, r, p);
    c.focus();
  };
  var Gl = io + ao;

  class co extends s {
    _tablist;
    _slot;
    static get observedAttributes() {
      return ["active"];
    }
    constructor() {
      super({ css: Gl, template: ro });
      this._tablist = this.shadowRoot?.querySelector(".tablist") ?? null, this._slot = this.shadowRoot?.querySelector("slot") ?? null;
    }
    connectedCallback() {
      this._slot?.addEventListener("slotchange", this._onRebuild), this._tablist?.addEventListener("click", this._onClick), this._tablist?.addEventListener("keydown", this._onKey), Dt(this, this._tablist, this._slot);
    }
    disconnectedCallback() {
      this._slot?.removeEventListener("slotchange", this._onRebuild), this._tablist?.removeEventListener("click", this._onClick), this._tablist?.removeEventListener("keydown", this._onKey);
    }
    attributeChangedCallback(t, e, r) {
      if (t === "active" && r !== null)
        z(this, this._tablist, this._slot, r);
    }
    get active() {
      return this.getAttribute("active") ?? "";
    }
    set active(t) {
      this.setAttribute("active", t);
    }
    _onRebuild = () => Dt(this, this._tablist, this._slot);
    _onClick = (t) => so(this, this._tablist, this._slot, t);
    _onKey = (t) => lo(this, this._tablist, this._slot, t);
  }
  var po = `<div class="panel" part="panel">
    <slot></slot>
</div>
`;
  var uo = `:host {
  display: block;
}

:host([hidden]) { display: none; }

.panel {
  outline: none;
}
`;

  class ho extends s {
    constructor() {
      super({ css: uo, template: po });
    }
  }
  var bo = `<span class="label" part="label"><slot></slot></span>
<button type="button" class="remove" part="remove" aria-label="Remove" hidden>&times;</button>
`;
  var mo = `:host {
    --_tag-font-family: ui-monospace, SFMono-Regular, Menlo, monospace;

    --_tag-bg: var(--info-muted, oklch(95% 0.02 230));
    --_tag-color: var(--text-body, oklch(45% 0.02 265));
    --_tag-border: var(--border-default, oklch(90% 0.02 265));

    --_tag-fs: 12px;
    --_tag-padding: 2px 8px;
    --_tag-radius: 6px;
    --_tag-gap: 4px;

    --ctx-bg: var(--_tag-bg);
    --ctx-fg: var(--_tag-color);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--_tag-border);

    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: var(--_tag-gap);

    font-family: var(--_tag-font-family);
    background-color: var(--_tag-bg);
    color: var(--_tag-color);

    font-size: var(--_tag-fs);
    padding: var(--_tag-padding);
    border-radius: var(--_tag-radius);
}

:host([border]) {
    border: 1px solid var(--_tag-border);
}

.label {
    display: inline-flex;
    align-items: center;
}

.remove {
    appearance: none;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    line-height: 1;
    padding: 0 2px;
    margin: 0;
    cursor: pointer;
    opacity: 0.6;
    font-size: 14px;
}

.remove:hover {
    opacity: 1;
}

.remove:focus-visible {
    outline: 2px solid var(--_tag-color);
    outline-offset: 1px;
    border-radius: 2px;
}

.remove[hidden] {
    display: none;
}

@media (prefers-reduced-motion: no-preference) {
    .remove {
        transition: opacity 0.15s ease;
    }
}
`;
  var go = `:host([color="info"]) {
    --_tag-bg: var(--info-muted, oklch(95% 0.02 230));
    --_tag-color: var(--info-base, oklch(65% 0.12 230));
    --_tag-border: var(--info-contrasted, oklch(25% 0.08 230));
}

:host([color="danger"]) {
    --_tag-bg: var(--danger-muted, oklch(95% 0.02 20));
    --_tag-color: var(--danger-base, oklch(65% 0.12 20));
    --_tag-border: var(--danger-contrasted, oklch(25% 0.08 20));
}

:host([color="success"]) {
    --_tag-bg: var(--success-muted, oklch(95% 0.02 120));
    --_tag-color: var(--success-base, oklch(65% 0.12 120));
    --_tag-border: var(--success-contrasted, oklch(25% 0.08 120));
}

:host([color="warning"]) {
    --_tag-bg: var(--warning-muted, oklch(95% 0.02 50));
    --_tag-color: var(--warning-base, oklch(65% 0.12 50));
    --_tag-border: var(--warning-contrasted, oklch(25% 0.08 50));
}

:host([color="primary"]) {
    --_tag-bg: var(--primary-muted, oklch(95% 0.02 265));
    --_tag-color: var(--primary-base, oklch(65% 0.12 265));
    --_tag-border: var(--primary-contrasted, oklch(25% 0.08 265));
}

:host([color="secondary"]) {
    --_tag-bg: var(--secondary-muted, oklch(95% 0.02 265));
    --_tag-color: var(--secondary-base, oklch(65% 0.12 265));
    --_tag-border: var(--secondary-contrasted, oklch(25% 0.08 265));
}
`;
  var ed = mo + go;

  class vo extends s {
    _removeBtn;
    static get observedAttributes() {
      return ["removable"];
    }
    constructor() {
      super({ css: ed, template: bo });
      this._removeBtn = this.shadowRoot?.querySelector(".remove") ?? null;
    }
    connectedCallback() {
      for (let t of ["removable"])
        d(this, t);
      this._syncRemovable(), this._removeBtn?.addEventListener("click", this._handleRemoveClick);
    }
    disconnectedCallback() {
      this._removeBtn?.removeEventListener("click", this._handleRemoveClick);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._removeBtn)
        return;
      if (t === "removable")
        this._syncRemovable();
    }
    _syncRemovable() {
      if (!this._removeBtn)
        return;
      this._removeBtn.hidden = !this.hasAttribute("removable");
    }
    _handleRemoveClick = (t) => {
      if (t.stopPropagation(), !this.dispatchEvent(new CustomEvent("remove", { bubbles: true, cancelable: true, detail: { value: this.getAttribute("value") ?? this.textContent?.trim() ?? "" } })))
        return;
      this.remove();
    };
    get removable() {
      return this.hasAttribute("removable");
    }
    set removable(t) {
      if (t)
        this.setAttribute("removable", "");
      else
        this.removeAttribute("removable");
    }
  }
  var fo = `<div class="icon" part="icon"></div>
<div class="content">
    <span class="message"><slot></slot></span>
</div>
<button class="close" aria-label="Dismiss">&times;</button>
`;
  var xo = `:host {
    --_bg: var(--bg-surface, #ffffff);
    --_color: var(--text-main, #1f2937);
    --_border: var(--border-default, #e5e7eb);
    --_accent: var(--info-base, #3b82f6);

    --ctx-bg: var(--_bg);
    --ctx-fg: var(--_color);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--_border);

    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 280px;
    max-width: 420px;
    padding: 12px 14px;
    background: var(--_bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-left: 4px solid var(--_accent);
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 10px -3px rgba(0, 0, 0, 0.08);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.4;

    animation: toast-in 180ms ease-out;
}

.icon {
    flex: 0 0 20px;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: var(--_accent);
    position: relative;
    margin-top: 1px;
}

.icon::before {
    content: "i";
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--bg-surface);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
}

.content {
    flex: 1;
    min-width: 0;
    padding-top: 1px;
}

.message {
    display: block;
    word-wrap: break-word;
}

.close {
    flex: 0 0 auto;
    background: transparent;
    border: none;
    color: var(--_color);
    opacity: 0.5;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
    margin-top: -2px;
}

.close:hover {
    opacity: 1;
}
`;
  var _o = `:host([leaving]) {
    animation: toast-out 160ms ease-in forwards;
}

:host([type="success"]) {
    --_accent: var(--success-base, #10b981);
}

:host([type="error"]) {
    --_accent: var(--danger-base, #ef4444);
}

:host([type="warning"]) {
    --_accent: var(--warning-base, #f59e0b);
}

:host([type="info"]) {
    --_accent: var(--info-base, #3b82f6);
}

:host([type="success"]) .icon::before {
    content: "✓";
}

:host([type="error"]) .icon::before,
:host([type="warning"]) .icon::before {
    content: "!";
}

:host([type="info"]) .icon::before {
    content: "i";
}

@keyframes toast-in {
    from { opacity: 0; transform: translateX(-20px); }
    to   { opacity: 1; transform: translateX(0); }
}

@keyframes toast-out {
    from { opacity: 1; transform: translateX(0); }
    to   { opacity: 0; transform: translateX(-20px); }
}
`;
  var od = xo + _o;

  class yo extends s {
    _timer = null;
    constructor() {
      super({ css: od, template: fo });
    }
    connectedCallback() {
      this.shadowRoot?.querySelector(".close")?.addEventListener("click", () => this.dismiss());
      let e = Number(this.getAttribute("duration") ?? 3500);
      if (e > 0)
        this._timer = setTimeout(() => this.dismiss(), e);
    }
    disconnectedCallback() {
      if (this._timer)
        clearTimeout(this._timer);
    }
    dismiss() {
      if (this.hasAttribute("leaving"))
        return;
      if (this.setAttribute("leaving", ""), this._timer)
        clearTimeout(this._timer);
      this.addEventListener("animationend", () => {
        this.dispatchEvent(new CustomEvent("toast-dismissed", { bubbles: true })), this.remove();
      }, { once: true });
    }
  }
  var wo = `<slot></slot>
`;
  var ko = `:host {
    position: fixed;
    top: 24px;
    left: 24px;
    right: auto;
    bottom: auto;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    overflow: visible;
    width: auto;
    height: auto;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
}

:host(:popover-open) {
    display: flex;
}

:host([position="top-right"]) {
    top: 24px;
    right: 24px;
    left: auto;
}

:host([position="bottom-right"]) {
    bottom: 24px;
    right: 24px;
    top: auto;
    left: auto;
    flex-direction: column-reverse;
}

:host([position="bottom-left"]) {
    bottom: 24px;
    left: 24px;
    top: auto;
    flex-direction: column-reverse;
}

::slotted(p9r-toast) {
    pointer-events: auto;
}
`;

  class Eo extends s {
    constructor() {
      super({ css: ko, template: wo });
    }
    connectedCallback() {
      if (!this.hasAttribute("popover"))
        this.setAttribute("popover", "manual");
      try {
        this.showPopover?.();
      } catch {}
    }
    push(t, e = {}) {
      let r = document.createElement("p9r-toast");
      if (r.setAttribute("type", e.type ?? "info"), e.duration !== undefined)
        r.setAttribute("duration", String(e.duration));
      return r.textContent = t, this.appendChild(r), r;
    }
  }
  var f = null;
  function ld() {
    if (f && f.isConnected)
      return f;
    if (f = document.querySelector("p9r-toast-stack"), f)
      return f;
    return f = document.createElement("p9r-toast-stack"), document.body.appendChild(f), f;
  }
  function dd(t, e = {}) {
    return ld().push(t, e);
  }
  var Ao = `:host {
  display: inline-block;
  position: relative;

  --_bg: var(--text-main, #1f2937);
  --_color: var(--bg-surface, #fff);
  --_radius: 6px;
  --_padding: 6px 10px;
  --_size: 12px;
  --_offset: 8px;
  --_max-w: 240px;
  --_arrow-size: 5px;

  --ctx-bg: var(--_bg);
  --ctx-fg: var(--_color);
  --ctx-fg-muted: color-mix(in oklab, var(--_color) 72%, var(--_bg));
  --ctx-border: var(--_bg);
}

.trigger {
  display: contents;
}

.tooltip {
  position: absolute;
  z-index: 9999;
  background: var(--_bg);
  color: var(--_color);
  padding: var(--_padding);
  border-radius: var(--_radius);
  font-size: var(--_size);
  font-weight: 500;
  line-height: 1.4;
  max-width: var(--_max-w);
  width: max-content;
  pointer-events: none;
  opacity: 0;
  white-space: normal;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

:host([open]) .tooltip {
  opacity: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .tooltip { transition: opacity 0.12s ease; }
}

.text:empty { display: none; }

.tooltip {
  bottom: calc(100% + var(--_offset));
  left: 50%;
  transform: translateX(-50%);
}

.tooltip::after {
  content: "";
  position: absolute;
  border: var(--_arrow-size) solid transparent;
}

.tooltip::after {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: var(--_bg);
}
`;
  var Co = `:host([position="bottom"]) .tooltip {
  top: calc(100% + var(--_offset));
  bottom: auto;
  left: 50%;
  transform: translateX(-50%);
}

:host([position="left"]) .tooltip {
  right: calc(100% + var(--_offset));
  left: auto;
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
}

:host([position="right"]) .tooltip {
  left: calc(100% + var(--_offset));
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
}

:host([position="bottom"]) .tooltip::after {
  top: auto;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: transparent;
  border-bottom-color: var(--_bg);
}

:host([position="left"]) .tooltip::after {
  top: 50%;
  left: 100%;
  transform: translateY(-50%);
  border-top-color: transparent;
  border-left-color: var(--_bg);
}

:host([position="right"]) .tooltip::after {
  top: 50%;
  left: auto;
  right: 100%;
  transform: translateY(-50%);
  border-top-color: transparent;
  border-right-color: var(--_bg);
}
`;
  var hd = Ao + Co;
  function tt(t) {
    let e = new URL(t, window.location.href);
    for (let [r, i] of new URLSearchParams(window.location.search))
      e.searchParams.append(r, i);
    return e;
  }
  async function I(t) {
    try {
      let e = await fetch(tt(t), { headers: { Accept: "application/json" } });
      return e.ok ? await e.json() : null;
    } catch {
      return null;
    }
  }
  var bd = new Intl.NumberFormat("fr-FR");
  var md = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  var x = (t) => t.replace(/[&<>"]/g, (e) => e === "&" ? "&amp;" : e === "<" ? "&lt;" : e === ">" ? "&gt;" : "&quot;");
  var gd = (t) => t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : t >= 1000 ? `${(t / 1000).toFixed(1)}k` : String(Math.round(t));
  function jt(t, e) {
    if (e === "ms")
      return `${Math.round(t)} ms`;
    if (e === "pct")
      return `${(t * 100).toFixed(1).replace(".", ",")} %`;
    return bd.format(Math.round(t));
  }
  var Ho = (t) => {
    let e = new Date(t);
    return Number.isNaN(e.getTime()) ? t : md.format(e);
  };
  function et(t, e) {
    return `<div class="empty"><svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><p class="empty-title">${x(t)}</p>${e ? `<p class="empty-hint">${x(e)}</p>` : ""}</div>`;
  }
  function To(t) {
    if (t.length === 0)
      return "";
    let e = 320, r = 140, i = 32, a = 8, o = 10, n = 22, l = e - i - a, c = r - o - n, p = o + c, u = Math.max(...t.map((k) => k.value), 1), m = t.length, h = t.map((k, B) => [i + (m === 1 ? l / 2 : B / (m - 1) * l), o + (1 - k.value / u) * c]), _ = h.map(([k, B]) => `${k.toFixed(1)},${B.toFixed(1)}`).join(" "), hn = `${h[0][0].toFixed(1)},${p} ${_} ${h[m - 1][0].toFixed(1)},${p}`, bn = h.map(([k, B]) => `<circle class="dot" cx="${k.toFixed(1)}" cy="${B.toFixed(1)}" r="2.5"/>`).join("");
    return `<svg class="line" viewBox="0 0 ${e} ${r}" role="img"><defs><linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1"><stop class="grad-top" offset="0%"/><stop class="grad-bottom" offset="100%"/></linearGradient></defs><line class="axis" x1="${i}" y1="${o}" x2="${i}" y2="${p}"/><line class="axis" x1="${i}" y1="${p}" x2="${e - a}" y2="${p}"/><text class="tick" x="${i - 4}" y="${o + 3}" text-anchor="end">${gd(u)}</text><text class="tick" x="${i - 4}" y="${p}" text-anchor="end">0</text><polygon class="area" points="${hn}" fill="url(#lc-grad)"/><polyline class="stroke" points="${_}"/>${bn}<text class="tick" x="${i}" y="${r - 6}">${x(t[0].label)}</text><text class="tick" x="${e - a}" y="${r - 6}" text-anchor="end">${x(t[m - 1].label)}</text></svg>`;
  }
  function zo(t, e) {
    if (t.length === 0)
      return "";
    let r = t.reduce((i, a) => i + a.value, 0) || 1;
    return t.map((i) => {
      let a = i.value / r * 100, o = `${a.toFixed(1).replace(".", ",")} %`;
      return `<div class="bar"><span class="bar-key" title="${x(i.label)}">${x(i.label)}</span><svg class="bar-svg" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect height="8" width="${a.toFixed(1)}"/></svg><span class="bar-val">${e ? `${jt(i.value, "int")} · ${o}` : o}</span></div>`;
    }).join("");
  }
  var Io = `<div class="stat">
    <span class="label"></span>
    <strong class="value">—</strong>
    <span class="note"></span>
</div>
`;
  var So = `:host {
    display: block;
    flex: 1 1 0;
    min-width: 0;

    --ctx-bg: var(--bg-surface);
    --ctx-fg: var(--text-main);
    --ctx-fg-muted: var(--text-muted);
    --ctx-border: var(--border-default);
}

.stat {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 1.25rem;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e7e9ee);
    border-radius: 12px;
}

.label {
    font-size: 13px;
    color: var(--text-muted, #6b7280);
}

.value {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--text-main, #1f2937);
}

.value.is-empty {
    color: var(--border-default, #cbd5e1);
}

.note {
    font-size: 12px;
    color: var(--text-muted, #9aa3b2);
    min-height: 1em;
}
`;

  class qo extends s {
    constructor() {
      super({ css: So, template: Io });
    }
    connectedCallback() {
      let t = this.shadowRoot;
      t.querySelector(".label").textContent = this.getAttribute("label") ?? "", this._load(t);
    }
    async _load(t) {
      let e = t.querySelector(".value"), r = t.querySelector(".note"), i = this.getAttribute("url"), a = i ? await I(i) : null, o = a && typeof a === "object" ? a[this.getAttribute("field") ?? "value"] : undefined;
      if (o === undefined || o === null) {
        e.textContent = "—", e.classList.add("is-empty"), r.textContent = this.getAttribute("empty") ?? "Aucune donnée";
        return;
      }
      e.classList.remove("is-empty"), e.textContent = jt(Number(o), this.getAttribute("format") ?? "int"), r.textContent = "";
    }
  }
  var Po = `<div class="chart"></div>
`;
  var Bo = `:host {
    display: block;
}

.chart {
    width: 100%;
}

.line {
    display: block;
    width: 100%;
    height: 160px;
}

.line .stroke {
    fill: none;
    stroke: var(--primary-base, #4f46e5);
    stroke-width: 2;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
}

.line .dot {
    fill: var(--bg-surface, #fff);
    stroke: var(--primary-base, #4f46e5);
    stroke-width: 1.5;
}

.grad-top {
    stop-color: var(--primary-base, #4f46e5);
    stop-opacity: 0.18;
}

.grad-bottom {
    stop-color: var(--primary-base, #4f46e5);
    stop-opacity: 0;
}

.line .axis {
    stroke: var(--border-default, #e7e9ee);
    stroke-width: 1;
}

.line .tick {
    fill: var(--text-muted, #9aa3b2);
    font-size: 9px;
}

.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 16px;
    text-align: center;
}

.empty-icon {
    width: 28px;
    height: 28px;
    color: var(--border-default, #cbd5e1);
}

.empty-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted, #6b7280);
}

.empty-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted, #9aa3b2);
}
`;

  class Fo extends s {
    constructor() {
      super({ css: Bo, template: Po });
    }
    connectedCallback() {
      this._load();
    }
    async _load() {
      let t = this.shadowRoot.querySelector(".chart"), e = this.getAttribute("url"), r = e ? await I(e) : null, i = Array.isArray(r) ? r : [];
      if (i.length === 0) {
        t.innerHTML = et(this.getAttribute("empty-title") ?? "Aucune donnée à afficher", this.getAttribute("empty-hint") ?? undefined);
        return;
      }
      let a = this.getAttribute("value") ?? "value", o = this.getAttribute("x") ?? "", n = i.map((l) => ({ label: o ? Ho(String(l[o] ?? "")) : "", value: Number(l[a] ?? 0) }));
      t.innerHTML = To(n);
    }
  }
  var Ko = `<div class="list"></div>
`;
  var Do = `:host {
    display: block;
}

.list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.bar {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
}

.bar-key {
    flex: 0 0 34%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-body, #374151);
}

.bar-svg {
    flex: 1;
    height: 8px;
    background: var(--border-light, #f1f3f7);
    border-radius: 999px;
    overflow: hidden;
}

.bar-svg rect {
    fill: var(--primary-base, #4f46e5);
}

.bar-val {
    flex: 0 0 auto;
    min-width: 3.5em;
    text-align: right;
    color: var(--text-muted, #6b7280);
    font-variant-numeric: tabular-nums;
}

.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 12px;
    text-align: center;
}

.empty-icon {
    width: 24px;
    height: 24px;
    color: var(--border-default, #cbd5e1);
}

.empty-title {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted, #9aa3b2);
}

.empty-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted, #9aa3b2);
}
`;

  class jo extends s {
    constructor() {
      super({ css: Do, template: Ko });
    }
    connectedCallback() {
      this._load();
    }
    async _load() {
      let t = this.shadowRoot.querySelector(".list"), e = this.getAttribute("url"), r = e ? await I(e) : null, i = Array.isArray(r) ? r : [];
      if (i.length === 0) {
        t.innerHTML = et(this.getAttribute("empty") ?? "Aucune donnée");
        return;
      }
      let a = this.getAttribute("label-field") ?? "key", o = this.getAttribute("value-field") ?? "value", n = i.map((l) => ({ label: String(l[a] ?? ""), value: Number(l[o] ?? 0) }));
      t.innerHTML = zo(n, this.hasAttribute("show-count"));
    }
  }
  var Vo = `<div class="tabs" role="group" aria-label="Période"></div>
`;
  var No = `:host {
    display: inline-block;
}

.tabs {
    display: inline-flex;
    border: 1px solid var(--border-default, #e7e9ee);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-surface, #fff);
}

.tabs button {
    appearance: none;
    border: 0;
    border-left: 1px solid var(--border-default, #e7e9ee);
    background: transparent;
    color: var(--text-body, #374151);
    padding: 6px 14px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
}

.tabs button:first-child {
    border-left: 0;
}

.tabs button:hover {
    background: var(--primary-muted, #eef0fb);
}

.tabs button.active {
    background: var(--primary-base, #4f46e5);
    color: var(--primary-contrasted);
}
`;

  class Ro extends s {
    constructor() {
      super({ css: No, template: Vo });
    }
    connectedCallback() {
      let t = this.getAttribute("param") ?? "range", e = new URLSearchParams(window.location.search).get(t) ?? this.getAttribute("default") ?? "", r = (this.getAttribute("tabs") ?? "").split(",").map((a) => a.split(":")).filter((a) => a[0]), i = this.shadowRoot.querySelector(".tabs");
      i.innerHTML = r.map(([a, o]) => `<button type="button" data-v="${x(a)}"${a === e ? ' class="active"' : ""}>${x(o ?? a)}</button>`).join(""), i.addEventListener("click", (a) => {
        let o = a.target.closest("button")?.dataset.v;
        if (!o)
          return;
        let n = new URL(window.location.href);
        n.searchParams.set(t, o), window.location.assign(n.toString());
      });
    }
  }
  function $o(t, e) {
    if (t.key !== "Enter")
      return;
    if (t.target.tagName === "TEXTAREA")
      return;
    t.preventDefault(), e.requestSubmit();
  }
  async function Vt(t, e) {
    t.preventDefault();
    let r = t.target, i = new FormData(r), a = Object.fromEntries(i.entries()), o = await fetch(tt(e.target), { method: e.method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) }), n = await o.json().catch(() => null), l = { status: o.status, body: n };
    if (o.ok) {
      if (r.reset(), e.dispatchEvent(new CustomEvent("form:success", { bubbles: true, composed: true, detail: l })), e.emit)
        document.dispatchEvent(new CustomEvent(e.emit, { bubbles: true, composed: true, detail: l }));
      if (e.redirect)
        window.location.href = e.redirect;
    } else
      e.dispatchEvent(new CustomEvent("form:failed", { bubbles: true, composed: true, detail: l }));
  }

  class Xo extends HTMLElement {
    _nativeForm = null;
    static get observedAttributes() {
      return ["redirect", "target", "method", "emit"];
    }
    _handleInternalSubmit = (t) => {
      Vt(t, this);
    };
    _handleKeydown = (t) => {
      $o(t, this._nativeForm);
    };
    connectedCallback() {
      requestAnimationFrame(() => {
        if (this._nativeForm)
          return;
        this._nativeForm = document.createElement("form");
        let t = this.getAttribute("id");
        if (t)
          this._nativeForm.id = t, this.removeAttribute("id");
        while (this.firstChild)
          this._nativeForm.appendChild(this.firstChild);
        this.appendChild(this._nativeForm), this._nativeForm.addEventListener("submit", this._handleInternalSubmit), this.addEventListener("keydown", this._handleKeydown);
      });
    }
    disconnectedCallback() {
      this._nativeForm?.removeEventListener("submit", this._handleInternalSubmit), this.removeEventListener("keydown", this._handleKeydown);
    }
    attributeChangedCallback() {}
    get redirect() {
      return this.getAttribute("redirect");
    }
    get target() {
      let t = this.getAttribute("target");
      if (!t)
        throw Error("CmsForm target attribute should be set");
      return t;
    }
    get method() {
      return this.getAttribute("method");
    }
    get emit() {
      return this.getAttribute("emit");
    }
  }
  async function Qo(t, e) {
    let r;
    try {
      r = await fetch(t, { headers: { Accept: "application/json" }, signal: e });
    } catch (a) {
      return Zo(a) ? { kind: "aborted" } : { kind: "error", status: null, message: Uo(a) };
    }
    if (!r.ok)
      return { kind: "error", status: r.status, message: `HTTP ${r.status}` };
    let i;
    try {
      i = await r.text();
    } catch (a) {
      return Zo(a) ? { kind: "aborted" } : { kind: "error", status: r.status, message: Uo(a) };
    }
    if (i.trim() === "")
      return { kind: "success", data: null };
    try {
      return { kind: "success", data: JSON.parse(i) };
    } catch {
      return { kind: "error", status: r.status, message: "Invalid JSON response" };
    }
  }
  function Zo(t) {
    return t?.name === "AbortError";
  }
  function Uo(t) {
    return t instanceof Error ? t.message : String(t);
  }
  var Ld = { found: false, value: undefined };
  function R(t, e) {
    if (e === ".")
      return { found: true, value: t.value };
    if (e === "value")
      return { found: true, value: Ad(t) };
    let r = e.indexOf("."), i = r === -1 ? e : e.slice(0, r), a = r === -1 ? "" : e.slice(r + 1);
    for (let o = t;o; o = o.parent) {
      if (o.vars && i in o.vars)
        return { found: true, value: Go(o.vars[i], a) };
      let n = o.value;
      if (Yo(n) && i in n)
        return { found: true, value: Go(n[i], a) };
    }
    return Ld;
  }
  function Ad(t) {
    let e = t.value;
    if (Yo(e) && "value" in e)
      return e.value;
    return e;
  }
  function Go(t, e) {
    if (e === "")
      return t;
    let r = t;
    for (let i of e.split(".")) {
      if (r == null)
        return;
      r = r[i];
    }
    return r;
  }
  function Yo(t) {
    return t !== null && typeof t === "object";
  }
  var Cd = /\{\{\s*([\w.]+)(?:\s*\|\s*(\w+))?\s*\}\}/g;
  function Nt(t, e, r = {}) {
    return t.replace(Cd, (i, a, o) => {
      let n = R(e, a);
      if (!n.found)
        return "";
      let l = o ? r[o] : undefined, c = l ? l(n.value) : n.value;
      return c == null ? "" : String(c);
    });
  }
  var rt = "cms-repeat";
  var Md = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
  function Jo(t) {
    let e = t.match(Md);
    if (e)
      return { path: e[1], name: e[2] };
    return { path: t.trim() };
  }
  var g = "cms-source";
  function Rt(t, e, r = {}) {
    if (t.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      Wo(t, e, r);
      return;
    }
    Oo(t, e, r, true);
  }
  function Oo(t, e, r, i) {
    if (t.nodeType === Node.TEXT_NODE) {
      let o = t.nodeValue ?? "", n = Nt(o, e, r);
      if (n !== o)
        t.nodeValue = n;
      return;
    }
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let a = t;
    for (let o of Array.from(a.attributes)) {
      let n = Nt(o.value, e, r);
      if (n !== o.value)
        a.setAttribute(o.name, n);
    }
    if (!i && (a.hasAttribute(g) || a.localName === "cms-binding-core"))
      return;
    if (Td(a, e))
      return;
    Wo(a, e, r);
  }
  var Hd = /^\{\{\s*([\w.]+)\s*\|\s*innerHTML\s*\}\}$/;
  function Td(t, e) {
    if (t.childNodes.length !== 1)
      return false;
    let r = t.firstChild;
    if (r.nodeType !== Node.TEXT_NODE)
      return false;
    let i = (r.nodeValue ?? "").trim().match(Hd);
    if (!i)
      return false;
    let a = R(e, i[1]), o = (t.ownerDocument ?? document).createElement("template");
    return o.innerHTML = a.found && a.value != null ? String(a.value) : "", t.replaceWith(o.content), true;
  }
  function Wo(t, e, r) {
    for (let i of Array.from(t.childNodes))
      if (i.nodeType === Node.ELEMENT_NODE && i.hasAttribute(rt))
        zd(i, e, r);
      else
        Oo(i, e, r, false);
  }
  function zd(t, e, r) {
    let i = t.parentNode;
    if (!i)
      return;
    let a = Jo(t.getAttribute(rt) ?? ""), o = R(e, a.path), n = document.createComment(`cms-repeat ${a.path}`);
    if (i.replaceChild(n, t), !Array.isArray(o.value)) {
      if (o.found && o.value != null)
        console.warn(`cms-repeat="${a.path}" expected an array, got`, o.value);
      return;
    }
    for (let l of o.value) {
      let c = t.cloneNode(true);
      c.removeAttribute(rt);
      let p = a.name ? { vars: { [a.name]: l }, parent: e } : { value: l, parent: e };
      Rt(c, p, r), i.insertBefore(c, n);
    }
  }
  var tn = "cms-slot";
  var Id = ["loading", "error", "empty"];
  function en(t) {
    let e = {}, r = document.createDocumentFragment(), i = document.createDocumentFragment();
    for (let a of Array.from(t.childNodes)) {
      i.appendChild(qd(a));
      let o = Sd(a);
      if (!o) {
        if (a.nodeType === Node.ELEMENT_NODE && a.tagName === "TEMPLATE")
          r.appendChild(a.content), a.remove();
        else
          r.appendChild(a);
        continue;
      }
      a.removeAttribute(tn);
      let n = e[o] ?? document.createDocumentFragment();
      n.appendChild(a), e[o] = n;
    }
    return { template: i, body: r, slots: e };
  }
  function S(t, e, r, i = {}) {
    let a = e.cloneNode(true);
    if (r)
      Rt(a, r, i);
    t.replaceChildren(a);
  }
  function rn(t) {
    if (t == null)
      return true;
    if (Array.isArray(t))
      return t.length === 0;
    if (typeof t === "object")
      return Object.keys(t).length === 0;
    return false;
  }
  function Sd(t) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return null;
    let e = t.getAttribute(tn);
    return e && Id.includes(e) ? e : null;
  }
  function qd(t) {
    return t.cloneNode(true);
  }
  var E = "cms-params:change";
  var Pd = /#\{\s*(\w+)\s*\}/g;
  function an(t) {
    return /#\{\s*\w+\s*\}/.test(t);
  }
  function it() {
    return new URLSearchParams(typeof location > "u" ? "" : location.search);
  }
  function on(t, e = it()) {
    return t.replace(Pd, (r, i) => encodeURIComponent(e.get(i) ?? ""));
  }
  function $t(t, e) {
    let r = it();
    if (e === "")
      r.delete(t);
    else
      r.set(t, e);
    let i = r.toString();
    history.replaceState(history.state, "", location.pathname + (i ? `?${i}` : "") + location.hash), document.dispatchEvent(new Event("cms-params:change"));
  }
  var q = "cms-binding-core";
  var w = "cms-bind-stop";
  var b = "cms-ready";
  var Bd = "cms-reload-on";
  var Fd = "cms-source:reload";
  var Kd = /^\s*([\s\S]+?)\s+as\s+[A-Za-z_$][\w$]*\s*$/;

  class Xt {
    el;
    filters;
    captured;
    abort = null;
    reloadEvents = [];
    paramReactive = false;
    lastUrl = null;
    onReload = () => {
      if (this.el.isConnected)
        this.run();
    };
    onParamsChange = () => {
      if (this.el.isConnected)
        this.run({ onlyIfUrlChanged: true });
    };
    constructor(t, e = {}) {
      this.el = t;
      this.filters = e;
      this.captured = en(t);
    }
    start() {
      this.listen(), this.run(), this.el.setAttribute(b, "");
    }
    dispose() {
      this.abort?.abort(), this.abort = null, this.unlisten();
    }
    renderTemplate() {
      this.abort?.abort(), this.abort = null, S(this.el, this.captured.template, null, this.filters);
    }
    listen() {
      let t = (this.el.getAttribute(Bd) ?? "").split(/\s+/).filter(Boolean);
      this.reloadEvents = [Fd, ...t];
      for (let e of this.reloadEvents)
        document.addEventListener(e, this.onReload);
      if (an(nn(this.el.getAttribute(g) ?? "")))
        this.paramReactive = true, document.addEventListener(E, this.onParamsChange), window.addEventListener("popstate", this.onParamsChange);
    }
    unlisten() {
      for (let t of this.reloadEvents)
        document.removeEventListener(t, this.onReload);
      if (this.reloadEvents = [], this.paramReactive)
        document.removeEventListener(E, this.onParamsChange), window.removeEventListener("popstate", this.onParamsChange), this.paramReactive = false;
    }
    async run(t) {
      let e = nn(this.el.getAttribute(g) ?? "");
      if (!e)
        return;
      let r = on(e);
      if (t?.onlyIfUrlChanged && r === this.lastUrl)
        return;
      this.lastUrl = r;
      let { slots: i, body: a } = this.captured;
      if (i.loading)
        S(this.el, i.loading, null, this.filters);
      this.abort?.abort();
      let o = new AbortController;
      this.abort = o;
      let n = await Qo(r, o.signal);
      if (o.signal.aborted)
        return;
      if (n.kind === "aborted")
        return;
      if (n.kind === "error") {
        if (i.error) {
          let c = { value: { status: n.status, message: n.message } };
          S(this.el, i.error, c, this.filters);
        } else
          this.el.replaceChildren(), console.warn(`cms-source "${r}": ${n.message}`);
        return;
      }
      let l = n.data;
      if (rn(l) && i.empty)
        S(this.el, i.empty, { value: l }, this.filters);
      else
        S(this.el, a, { value: l }, this.filters);
    }
  }
  function nn(t) {
    return (Kd.exec(t)?.[1] ?? t).trim();
  }
  var P = "cms-param-sync";
  var Dd = 300;

  class Zt {
    el;
    key;
    timer = null;
    reflectTimer = null;
    last = null;
    reflecting = false;
    childObserver = null;
    onInput = () => this.schedule();
    onChange = () => this.write();
    onParams = () => this.reflect();
    onChildren = () => {
      if (this.reflectTimer)
        clearTimeout(this.reflectTimer);
      this.reflectTimer = setTimeout(() => this.reflect(), 0);
    };
    constructor(t) {
      this.el = t;
      this.key = (t.getAttribute(P) || "").trim() || t.name || "";
    }
    start() {
      if (!this.key) {
        console.warn(`${P}: no key — set ${P}="<param>" or a name attribute`, this.el);
        return;
      }
      this.reflect(), this.el.addEventListener("input", this.onInput), this.el.addEventListener("change", this.onChange), document.addEventListener(E, this.onParams), window.addEventListener("popstate", this.onParams), this.childObserver = new MutationObserver(this.onChildren), this.childObserver.observe(this.el, { childList: true });
    }
    dispose() {
      if (this.el.removeEventListener("input", this.onInput), this.el.removeEventListener("change", this.onChange), document.removeEventListener(E, this.onParams), window.removeEventListener("popstate", this.onParams), this.childObserver?.disconnect(), this.childObserver = null, this.timer)
        clearTimeout(this.timer);
      if (this.reflectTimer)
        clearTimeout(this.reflectTimer);
      this.timer = this.reflectTimer = null;
    }
    reflect() {
      if (this.timer)
        return;
      let t = it().get(this.key) ?? "", e = this.el;
      if (e.type === "checkbox") {
        let r = t !== "" && t === (e.value || "true");
        if (e.checked !== r)
          this.set(() => {
            e.checked = r;
          });
      } else if (e.value !== t)
        this.set(() => {
          e.value = t;
        });
      this.last = this.currentValue();
    }
    set(t) {
      this.reflecting = true;
      try {
        t();
      } finally {
        this.reflecting = false;
      }
    }
    currentValue() {
      let t = this.el;
      return t.type === "checkbox" ? t.checked ? t.value || "true" : "" : t.value ?? "";
    }
    schedule() {
      if (this.reflecting)
        return;
      if (this.timer)
        clearTimeout(this.timer);
      this.timer = setTimeout(() => this.write(), Dd);
    }
    write() {
      if (this.reflecting)
        return;
      if (this.timer)
        clearTimeout(this.timer), this.timer = null;
      let t = this.currentValue();
      if (t === this.last)
        return;
      this.last = t, $t(this.key, t);
    }
  }

  class Ut {
    root;
    filters;
    sources = new Map;
    paramSyncs = new Map;
    observer = null;
    stopped = false;
    constructor(t, e = {}) {
      this.root = t;
      this.filters = e;
    }
    start() {
      if (typeof document < "u" && document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", () => this.activate(), { once: true });
      else
        this.activate();
    }
    activate() {
      if (this.stopped)
        return;
      dn(this.root), this.registerWithin(this.root), this.observer = new MutationObserver((t) => {
        for (let e of t)
          e.removedNodes.forEach((r) => this.unregisterWithin(r)), e.addedNodes.forEach((r) => {
            dn(r), this.registerWithin(r);
          });
      }), this.observer.observe(this.root, { childList: true, subtree: true });
    }
    stop() {
      this.teardown();
    }
    deactivate() {
      this.teardown({ beforeSourceDispose: (t) => t.renderTemplate(), afterDispose: () => $(this.root) });
    }
    teardown(t) {
      if (this.stopped)
        return;
      this.stopped = true, this.observer?.disconnect(), this.observer = null;
      for (let e of this.sources.values())
        t?.beforeSourceDispose?.(e), e.dispose();
      for (let e of this.paramSyncs.values())
        e.dispose();
      this.sources.clear(), this.paramSyncs.clear(), t?.afterDispose?.();
    }
    get isStopped() {
      return this.stopped;
    }
    get size() {
      return this.sources.size;
    }
    registerWithin(t) {
      at(t, g, this.root, (e) => {
        if (!e.isConnected || this.sources.has(e))
          return;
        let r = new Xt(e, this.filters);
        this.sources.set(e, r), r.start();
      }), at(t, P, this.root, (e) => {
        if (!e.isConnected || this.paramSyncs.has(e))
          return;
        let r = new Zt(e);
        this.paramSyncs.set(e, r), r.start();
      });
    }
    unregisterWithin(t) {
      at(t, g, this.root, (e) => {
        let r = this.sources.get(e);
        if (!r)
          return;
        r.dispose(), this.sources.delete(e);
      }), at(t, P, this.root, (e) => {
        let r = this.paramSyncs.get(e);
        if (!r)
          return;
        r.dispose(), this.paramSyncs.delete(e);
      });
    }
  }
  function at(t, e, r, i) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let a = t;
    if (a !== r && ln(a, r))
      return;
    if (a.hasAttribute(e))
      i(a);
    a.querySelectorAll(`[${e}]`).forEach((o) => {
      if (!ln(o, r))
        i(o);
    });
  }
  function ln(t, e) {
    for (let r = t.parentElement;r && r !== e; r = r.parentElement)
      if (r.localName === q || r.hasAttribute(w))
        return true;
    return false;
  }
  function $(t) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let e = t;
    if (e.hasAttribute(g))
      e.setAttribute(b, "");
    e.querySelectorAll(`[${g}]:not([${b}])`).forEach((r) => r.setAttribute(b, ""));
  }
  function dn(t) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let e = t;
    if (e.hasAttribute(w)) {
      $(e);
      return;
    }
    e.querySelectorAll(`[${w}]`).forEach($);
  }
  var cn = "cms-binding-cloak";
  var jd = `${q}{display:contents}[${g}]:not([${b}]){visibility:hidden}`;
  var pn = {};
  class un extends HTMLElement {
    _runtime = null;
    connectedCallback() {
      if (Nd(this.ownerDocument ?? document), this.closest(`[${w}]`)) {
        $(this);
        return;
      }
      this.startRuntime();
    }
    disconnectedCallback() {
      this._runtime?.stop(), this._runtime = null;
    }
    get runtime() {
      return this._runtime;
    }
    startRuntime() {
      if (this._runtime && !this._runtime.isStopped)
        return;
      this._runtime = new Ut(this, pn), this._runtime.start();
    }
  }
  function Nd(t) {
    if (t.getElementById(cn))
      return;
    let e = t.createElement("style");
    e.id = cn, e.textContent = jd, (t.head ?? t.documentElement).appendChild(e);
  }

  // ../../foundation/components/dist/base.js
  class A2 extends HTMLElement {
    _rawStyles = "";
    _styles = null;
    constructor(j2) {
      super();
      let q2 = this.attachShadow({ mode: "open" });
      if (j2) {
        this._rawStyles = j2.css, this._styles = document.createElement("style"), this._styles.innerHTML = j2.css, q2.appendChild(this._styles);
        let x2 = document.createElement("template");
        x2.innerHTML = j2.template, q2.appendChild(x2.content.cloneNode(true));
      }
    }
    registerCSSVariables(j2) {
      if (!this._styles)
        return;
      let q2 = this._rawStyles;
      Object.entries(j2).forEach(([x2, z2]) => {
        q2 = q2.replaceAll("var(--" + x2 + ")", z2);
      }), this._styles.innerHTML = q2;
    }
    connectedCallback() {}
  }

  // src/components/globals.ts
  window.p9r = {
    Component: A2
  };

  // src/components/admin/AdminLayout/template.html
  var template_default = `<w13c-left-menu-layout>

    <w13c-lateral-menu slot="sidebar">
        <h2 slot="header">Page Builder</h2>

        <w13c-lateral-menu-item data-route="files">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
            Files
        </w13c-lateral-menu-item>

        <w13c-lateral-menu-item data-route="pages">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="M12 11h4" />
                <path d="M12 16h4" />
                <path d="M8 11h.01" />
                <path d="M8 16h.01" />
            </svg>
            Pages
        </w13c-lateral-menu-item>
        <w13c-lateral-menu-item data-route="snippets">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="m18 16 4-4-4-4" />
                <path d="m6 8-4 4 4 4" />
                <path d="m14.5 4-5 16" />
            </svg>
            Snippets
        </w13c-lateral-menu-item>
        <w13c-lateral-menu-item data-route="templates">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
            </svg>
            Templates
        </w13c-lateral-menu-item>

        <w13c-lateral-menu-item data-route="gateway-providers">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22v-5" />
                <path d="M9 8V2" />
                <path d="M15 8V2" />
                <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
            </svg>
            Gateway
        </w13c-lateral-menu-item>

        <w13c-lateral-menu-item data-route="analytics">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics
        </w13c-lateral-menu-item>

        <w13c-lateral-menu-item disabled data-route="components" badge="upcoming">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 3H3v7h7V3Z" />
                <path d="M21 3h-7v7h7V3Z" />
                <path d="M10 14H3v7h7v-7Z" />
                <path d="M21 14h-7v7h7v-7Z" />
            </svg>
            Blocks
        </w13c-lateral-menu-item>



        <w13c-lateral-menu-item disabled data-route="components" badge="upcoming">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                <path
                    d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.92 0 1.75-.13 2.5-.35 1.1-.33 1.5-1.65.9-2.65-.6-1-1.4-1.5-1.4-2.5 0-1.1.9-2 2-2h4c1.1 0 2-.9 2-2 0-5.5-4.5-10-10-10Z" />
            </svg>
            Theme
        </w13c-lateral-menu-item>


        <w13c-lateral-menu-item data-route="users" slot="footer">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Users
        </w13c-lateral-menu-item>

        <w13c-lateral-menu-item data-route="settings" slot="footer">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path
                    d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
        </w13c-lateral-menu-item>

        <w13c-lateral-menu-item data-role="profil" data-route="profil" slot="footer">
            <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="10" r="3" />
                <path d="M6.5 18.5a6 6 0 0 1 11 0" />
            </svg>
            Profil
        </w13c-lateral-menu-item>
    </w13c-lateral-menu>

    <div>

        <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem;">
            <h1 style="margin: 0; line-height: 1;">
                <slot name="title"></slot>
            </h1>

            <div style="display: flex; align-items: center; gap: 0.75rem;padding-top: 4px">
                <slot name="action"></slot>
            </div>
        </div>
        <slot></slot>

    </div>

</w13c-left-menu-layout>`;

  // src/components/admin/AdminLayout/AdminLayout.ts
  class FixedAdminLayout extends A2 {
    constructor() {
      super({
        css: "",
        template: template_default
      });
    }
    connectedCallback() {
      super.connectedCallback();
      const root = this.shadowRoot;
      if (!root)
        return;
      const meta = document.querySelector('meta[name="basePath"]');
      const basePath = (meta?.getAttribute("content") ?? "").replace(/\/+$/, "");
      const items = Array.from(root.querySelectorAll("[data-route]"));
      for (const item of items) {
        const route = item.dataset.route ?? "";
        if (!route)
          continue;
        item.setAttribute("href", `${basePath}/admin/${route}`);
      }
    }
  }
  customElements.define("w13c-fixed-admin-layout", FixedAdminLayout);

  // src/core/dom/BubblesEvent.ts
  class BubblesEvent extends Event {
    constructor(type) {
      super(type, {
        bubbles: true,
        composed: true
      });
    }
  }

  // src/components/admin/ConfirmForm/ConfirmForm.ts
  class CmsConfirmForm extends HTMLElement {
    _busy = false;
    _onClick = async (e) => {
      const trigger = e.target.closest("p9r-button, button");
      if (!trigger || !this.contains(trigger))
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this._busy)
        return;
      const message = this.getAttribute("message") || "Are you sure?";
      if (!confirm(message))
        return;
      this._busy = true;
      try {
        await this._submit(false);
      } finally {
        this._busy = false;
      }
    };
    connectedCallback() {
      this.addEventListener("click", this._onClick, true);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._onClick, true);
    }
    async _submit(force) {
      const target = this.getAttribute("target");
      const method = this.getAttribute("method") || "POST";
      if (!target) {
        dd("cms-confirm-form: missing target", { type: "error" });
        return;
      }
      const url = force ? withForce(target) : target;
      let res;
      try {
        res = await fetch(url, { method });
      } catch (e) {
        dd(`Request failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
        return;
      }
      if (res.ok) {
        this._onSuccess();
        return;
      }
      if (res.status === 409 && !force) {
        const body = await res.json().catch(() => ({}));
        const followUp = formatConflict(body);
        const followMessage = this.getAttribute("conflict-confirm-message") || "Proceed anyway?";
        if (confirm(`${body.error ?? "Conflict"}

${followUp}

${followMessage}`)) {
          await this._submit(true);
        }
        return;
      }
      const text = await res.text().catch(() => "");
      let message = text;
      try {
        const body = JSON.parse(text);
        if (body?.error)
          message = body.error;
      } catch {}
      dd(message || `HTTP ${res.status}`, { type: "error" });
    }
    _onSuccess() {
      const emit = this.getAttribute("emit");
      if (emit)
        document.dispatchEvent(new BubblesEvent(emit));
      const redirect = this.getAttribute("redirect");
      if (redirect)
        window.location.href = redirect;
    }
  }
  function withForce(target) {
    return target + (target.includes("?") ? "&" : "?") + "force=true";
  }
  function formatConflict(body) {
    const lines = [];
    const pages = Array.isArray(body?.pages) ? body.pages : [];
    const templates = Array.isArray(body?.templates) ? body.templates : [];
    const snippets = Array.isArray(body?.snippets) ? body.snippets : [];
    if (pages.length) {
      lines.push("Pages:");
      for (const p of pages)
        lines.push(`  • ${p.title || p.path}`);
    }
    if (templates.length) {
      if (lines.length)
        lines.push("");
      lines.push("Templates:");
      for (const t of templates)
        lines.push(`  • ${t.name || t.identifier}`);
    }
    if (snippets.length) {
      if (lines.length)
        lines.push("");
      lines.push("Snippets:");
      for (const s2 of snippets)
        lines.push(`  • ${s2.name || s2.identifier}`);
    }
    return lines.join(`
`);
  }
  customElements.define("cms-confirm-form", CmsConfirmForm);

  // src/components/admin/CredentialSelect/CredentialSelect.css
  var CredentialSelect_default = `:host { display: block; }

.field { display: flex; flex-direction: column; gap: 6px; position: relative; }

.label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #94a3b8);
}

.input-row { display: flex; gap: 4px; }

.trigger {
    display: flex; align-items: center; gap: 8px;
    flex: 1; min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    cursor: pointer; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
}
.trigger:hover           { border-color: var(--text-muted, #94a3b8); }
.trigger:focus-visible   { border-color: var(--primary-base, #4361ee); box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15)); }
.trigger.open            { border-color: var(--primary-base, #4361ee); }
.trigger.has-value       { border-color: var(--primary-base, #4361ee); background: var(--primary-muted, rgb(67 97 238 / 0.06)); }

.key-icon { flex-shrink: 0; color: var(--text-muted, #94a3b8); }
.trigger.has-value .key-icon { color: var(--primary-base, #4361ee); }

.value {
    flex: 1; min-width: 0;
    font-size: 12px; font-weight: 500;
    color: var(--text-main, #1e293b);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-family: ui-monospace, monospace;
}

.chevron { flex-shrink: 0; color: var(--text-muted, #94a3b8); transition: transform 0.2s ease; }
.trigger.open .chevron { transform: rotate(180deg); color: var(--primary-base, #4361ee); }

.clear-btn {
    display: none; align-items: center; justify-content: center;
    width: 32px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    color: var(--text-muted, #94a3b8);
    cursor: pointer; flex-shrink: 0;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.clear-btn:hover {
    color: var(--danger-base, #ef4444);
    border-color: var(--danger-base, #ef4444);
    background: color-mix(in srgb, var(--danger-base, #ef4444) 6%, transparent);
}

/* ── Popover panel (top-layer, JS-positioned via inset) ── */

.panel {
    /* Reset UA popover styles */
    margin: 0; padding: 0; border: 0;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgb(0 0 0 / 0.08);
    overflow: hidden;
    /* Position is JS-driven — \`top\`/\`left\`/\`width\` set on showPopover() */
}
.panel:popover-open { display: block; }

.create-btn {
    display: block; width: 100%;
    padding: 9px 10px;
    border: 0; border-bottom: 1px solid var(--border-default, #e2e8f0);
    background: var(--bg-base, #f8fafc);
    font: inherit; font-size: 11px; font-weight: 600;
    color: var(--primary-base, #4361ee);
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
}
.create-btn:hover { background: var(--primary-muted, rgb(67 97 238 / 0.08)); }

.search-wrap { padding: 6px 6px 2px; }
.search {
    width: 100%; box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid var(--border-default, #e2e8f0); border-radius: 6px;
    background: var(--bg-base, #f8fafc);
    font-size: 11px; font-family: inherit; color: var(--text-main, #1e293b);
    outline: none; transition: border-color 0.15s;
}
.search:focus { border-color: var(--primary-base, #4361ee); }

.list { list-style: none; margin: 0; padding: 4px; max-height: 200px; overflow-y: auto; }
.empty { display: none; padding: 12px; text-align: center; font-size: 11px; color: var(--text-muted, #94a3b8); }
.list:empty + .empty { display: block; }

.option {
    padding: 6px 10px; border-radius: 6px;
    font-size: 12px; font-weight: 500;
    color: var(--text-main, #1e293b);
    font-family: ui-monospace, monospace;
    cursor: pointer;
    transition: background 0.1s;
}
.option:hover    { background: var(--bg-base, #f1f5f9); }
.option.selected { background: var(--primary-muted, rgb(67 97 238 / 0.1)); color: var(--primary-base, #4361ee); }
`;

  // src/components/admin/CredentialSelect/icons.ts
  var ICON_KEY = `
<svg class="key-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/>
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>
</svg>
`;

  // src/components/admin/CredentialSelect/template.ts
  function buildShadow(host, label) {
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>${CredentialSelect_default}</style>
        <div class="field">
            ${label ? `<span class="label">${label}</span>` : ""}
            <div class="input-row">
                <button class="trigger" type="button" tabindex="0">
                    ${ICON_KEY}
                    <span class="value">No credential</span>
                    <svg class="chevron" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                        stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <path d="m6 9 6 6 6-6"/>
                    </svg>
                </button>
                <button class="clear-btn" type="button" title="Remove credential">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="panel" popover="auto">
            <button type="button" class="create-btn">+ Create new credential</button>
            <div class="search-wrap"><input class="search" type="text" placeholder="Search credentials..." spellcheck="false"></div>
            <ul class="list"></ul>
            <div class="empty">No credentials yet</div>
        </div>
    `;
    return {
      trigger: shadow.querySelector(".trigger"),
      display: shadow.querySelector(".value"),
      clearBtn: shadow.querySelector(".clear-btn"),
      panel: shadow.querySelector(".panel"),
      list: shadow.querySelector(".list"),
      empty: shadow.querySelector(".empty"),
      search: shadow.querySelector(".search"),
      createBtn: shadow.querySelector(".create-btn")
    };
  }

  // ../../features/cms-secrets/src/default-implementation/InMemorySecretStore.ts
  class InMemorySecretStore {
    _data = new Map;
    async get(key) {
      return this._data.get(key) ?? null;
    }
    async set(key, value) {
      this._data.set(key, value);
    }
    async delete(key) {
      this._data.delete(key);
    }
    async list() {
      return Array.from(this._data, ([key, value]) => ({ key, value }));
    }
    async listKeys() {
      return Array.from(this._data.keys());
    }
  }
  // ../../features/cms-secrets/src/core/secretRef.ts
  var SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
  var SECRET_KEY_MAX_LENGTH = 128;
  var SECRET_KEY_PATTERN_DESCRIPTION = "/^[A-Z][A-Z0-9_]*$/";
  var EXACT_SECRET_REF_PATTERN = /^\$\{([A-Z][A-Z0-9_]*)\}$/;
  function secretKeyError(key) {
    if (key.length === 0)
      return "secret key is required";
    if (!SECRET_KEY_PATTERN.test(key))
      return `secret key must match ${SECRET_KEY_PATTERN_DESCRIPTION} (env-var style)`;
    if (key.length > SECRET_KEY_MAX_LENGTH)
      return `secret key too long; max ${SECRET_KEY_MAX_LENGTH} characters`;
    return null;
  }
  function secretKeyToRef(key) {
    return `\${${key}}`;
  }
  function secretRefToKey(ref) {
    return ref.match(EXACT_SECRET_REF_PATTERN)?.[1] ?? null;
  }
  // src/components/admin/CredentialSelect/flows.ts
  var SAVED_EVENT = "secret:saved";
  async function fetchKeys(api) {
    const res = await fetch(`${api}/keys`, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      dd("Failed to load credentials", { type: "error" });
      return [];
    }
    return res.json();
  }
  async function createCredential(api, key, value) {
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value })
    });
    if (res.ok) {
      document.dispatchEvent(new BubblesEvent(SAVED_EVENT));
      return { ok: true };
    }
    let error = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && typeof body.error === "string")
        error = body.error;
    } catch {}
    return { ok: false, error };
  }

  // src/components/admin/CredentialSelect/controller.ts
  function refToDisplay(ref) {
    return secretRefToKey(ref) ?? "";
  }
  function keyToRef(key) {
    return secretKeyToRef(key);
  }
  function setValue(host, ref) {
    host._value = ref;
    host._internals.setFormValue(ref);
    const display = refToDisplay(ref);
    host._refs.display.textContent = display || "No credential";
    const has = ref !== "";
    host._refs.trigger.classList.toggle("has-value", has);
    host._refs.clearBtn.style.display = has ? "flex" : "none";
    host._refs.list.querySelectorAll(".option").forEach((li2) => {
      li2.classList.toggle("selected", li2.dataset.key === display);
    });
  }
  function openPanel(host) {
    positionPanel(host);
    host._refs.panel.showPopover();
    host._refs.trigger.classList.add("open");
    host._isOpen = true;
    refreshList(host);
    setTimeout(() => host._refs.search.focus(), 0);
  }
  function closePanel(host) {
    if (host._refs.panel.matches(":popover-open"))
      host._refs.panel.hidePopover();
    host._refs.trigger.classList.remove("open");
    host._isOpen = false;
    host._refs.search.value = "";
    renderList(host, host._keys);
  }
  function positionPanel(host) {
    const r = host._refs.trigger.getBoundingClientRect();
    const p = host._refs.panel;
    p.style.top = `${r.bottom + 4}px`;
    p.style.left = `${r.left}px`;
    p.style.width = `${r.width}px`;
    p.style.position = "fixed";
  }
  async function refreshList(host) {
    host._keys = await fetchKeys(host._api);
    host._keys.sort((a, b2) => a.localeCompare(b2));
    renderList(host, host._keys);
  }
  function renderList(host, keys) {
    const selected = refToDisplay(host._value);
    host._refs.list.replaceChildren(...keys.map((k) => buildOption(k, k === selected)));
  }
  function buildOption(key, selected) {
    const li2 = document.createElement("li");
    li2.className = "option" + (selected ? " selected" : "");
    li2.dataset.key = key;
    li2.textContent = key;
    return li2;
  }

  // src/components/admin/CredentialSelect/dialog.ts
  function buildModal(host) {
    const m = document.createElement("p9r-modal");
    m.setAttribute("aria-label", "Create credential");
    m.innerHTML = `
        <p9r-stack gap="md">
            <strong class="cs-create-title">Create credential</strong>
            <p9r-input data-role="key" label="Key" placeholder="MY_API_KEY"
                hint="Uppercase letters, digits, underscore"></p9r-input>
            <p9r-input data-role="value" label="Value" type="password"
                placeholder="Kept server-side"></p9r-input>
            <p9r-stack direction="row" gap="sm" justify="end">
                <p9r-button data-role="cancel" variant="outlined">Cancel</p9r-button>
                <p9r-button data-role="create" color="primary">Create</p9r-button>
            </p9r-stack>
        </p9r-stack>`;
    m.querySelector('[data-role="cancel"]').addEventListener("click", () => m.removeAttribute("open"));
    m.querySelector('[data-role="create"]').addEventListener("click", () => void submitCreate(host));
    document.body.appendChild(m);
    return m;
  }
  function inputs(m) {
    return {
      key: m.querySelector('[data-role="key"]'),
      value: m.querySelector('[data-role="value"]')
    };
  }
  function openCreateDialog(host) {
    const m = host._createModal ??= buildModal(host);
    const { key, value } = inputs(m);
    key.value = "";
    value.value = "";
    key.removeAttribute("invalid");
    key.removeAttribute("hint-level");
    key.setAttribute("hint", "Uppercase letters, digits, underscore");
    m.setAttribute("open", "");
    setTimeout(() => key.focus?.(), 0);
  }
  function destroyCreateDialog(host) {
    host._createModal?.remove();
    host._createModal = undefined;
  }
  async function submitCreate(host) {
    const m = host._createModal;
    if (!m)
      return;
    const { key: keyInput, value: valueInput } = inputs(m);
    const key = keyInput.value.trim();
    const value = valueInput.value;
    const keyError = secretKeyError(key);
    if (keyError) {
      keyInput.setAttribute("invalid", "");
      keyInput.setAttribute("hint", keyError);
      keyInput.setAttribute("hint-level", "error");
      dd(`Invalid key: ${keyError}`, { type: "error" });
      return;
    }
    if (host._keys.includes(key)) {
      dd(`Credential ${key} already exists`, { type: "warning" });
      return;
    }
    const r = await createCredential(host._api, key, value);
    if (!r.ok) {
      dd(`Create failed: ${r.error}`, { type: "error" });
      return;
    }
    dd(`Credential ${key} created`, { type: "success" });
    m.removeAttribute("open");
    await refreshList(host);
    setValue(host, keyToRef(key));
    host.dispatchEvent(new Event("change", { bubbles: true }));
    closePanel(host);
  }

  // src/components/admin/CredentialSelect/CredentialSelect.ts
  class CredentialSelect extends HTMLElement {
    static formAssociated = true;
    _refs;
    _internals;
    _value = "";
    _isOpen = false;
    _keys = [];
    _createModal;
    _onSecretSaved = () => {
      if (this._isOpen)
        refreshList(this);
    };
    constructor() {
      super();
      this._internals = this.attachInternals();
    }
    connectedCallback() {
      if (!this.shadowRoot) {
        this._refs = buildShadow(this, this.getAttribute("label"));
        this._wire();
      }
      const v2 = this._value || this.getAttribute("value") || "";
      setValue(this, v2);
      document.addEventListener("secret:saved", this._onSecretSaved);
    }
    disconnectedCallback() {
      document.removeEventListener("secret:saved", this._onSecretSaved);
      destroyCreateDialog(this);
    }
    get value() {
      return this._value;
    }
    set value(v2) {
      setValue(this, v2);
    }
    get name() {
      return this.getAttribute("name");
    }
    get _api() {
      return this.getAttribute("api") ?? "/api/secrets";
    }
    _wire() {
      const r = this._refs;
      r.trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        this._isOpen ? closePanel(this) : openPanel(this);
      });
      r.clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setValue(this, "");
        this.dispatchEvent(new Event("change", { bubbles: true }));
      });
      r.panel.addEventListener("toggle", (e) => {
        const newState = e.newState;
        if (newState === "closed" && this._isOpen)
          closePanel(this);
      });
      r.search.addEventListener("input", () => {
        const q2 = r.search.value.trim().toUpperCase();
        const filtered = q2 ? this._keys.filter((k) => k.includes(q2)) : this._keys;
        renderList(this, filtered);
      });
      r.list.addEventListener("click", (e) => {
        const li2 = e.target.closest(".option");
        if (!li2 || !li2.dataset.key)
          return;
        setValue(this, keyToRef(li2.dataset.key));
        this.dispatchEvent(new Event("change", { bubbles: true }));
        closePanel(this);
      });
      r.createBtn.addEventListener("click", () => openCreateDialog(this));
    }
  }
  if (!customElements.get("cms-credential-select")) {
    customElements.define("cms-credential-select", CredentialSelect);
  }

  // src/components/admin/EmptyState/template.html
  var template_default2 = `<div class="cell">
    <slot name="icon"></slot>
    <slot name="title"></slot>
    <slot name="hint"></slot>
</div>
`;

  // src/components/admin/EmptyState/style.css
  var style_default = `:host {
    display: table-row;
    position: relative;
    height: 320px;
}

/* \`fluid\` — normal-flow variant for grid/panel contexts (vs the table-row
   default used as the empty slot of p9r-table listings). */
:host([fluid]) {
    display: block;
    height: auto;
}

.cell {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
}

:host([fluid]) .cell {
    position: static;
    padding: 48px 24px;
}

::slotted([slot="icon"]) {
    width: 48px;
    height: 48px;
    opacity: 0.35;
    color: var(--text-muted);
}

::slotted([slot="title"]) {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-main);
}

::slotted([slot="hint"]) {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
}
`;

  // src/components/admin/EmptyState/EmptyState.ts
  class EmptyState extends A2 {
    constructor() {
      super({
        css: style_default,
        template: template_default2
      });
    }
    static create(opts) {
      const el2 = document.createElement("cms-empty-state");
      el2.setAttribute("fluid", "");
      if (opts.icon) {
        const fragment = document.createRange().createContextualFragment(opts.icon);
        const iconRoot = fragment.firstElementChild;
        if (iconRoot) {
          iconRoot.setAttribute("slot", "icon");
          el2.appendChild(iconRoot);
        }
      }
      const title = document.createElement("p");
      title.slot = "title";
      title.textContent = opts.title;
      el2.appendChild(title);
      if (opts.hint) {
        const hint = document.createElement("p");
        hint.slot = "hint";
        hint.textContent = opts.hint;
        el2.appendChild(hint);
      }
      return el2;
    }
  }
  if (!customElements.get("cms-empty-state")) {
    customElements.define("cms-empty-state", EmptyState);
  }

  // src/components/admin/EndpointsInput/EndpointsInput.css
  var EndpointsInput_default = `/* \`<cms-endpoints-input>\` is light-DOM (its named controls must stay in the
   parent <cms-form>'s tree for FormData). This sheet is injected once into the
   document head; every rule is scoped to the tag so nothing leaks. */

cms-endpoints-input {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

/* Collapsed-header summary (method tag + id + path) */
cms-endpoints-input .ep-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1;
    min-width: 0;
}
cms-endpoints-input .ep-id {
    flex: 0 0 auto;
    white-space: nowrap;
}
cms-endpoints-input .ep-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted, #94a3b8);
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
}

/* In-tab section headings + muted hints/labels */
cms-endpoints-input .ep-heading { font-size: 13px; }
cms-endpoints-input .ep-hint {
    margin: 0;
    color: var(--text-muted, #94a3b8);
    font-size: 13px;
}
cms-endpoints-input .ep-meta {
    color: var(--text-muted, #94a3b8);
    font-size: 13px;
    white-space: nowrap;
}

/* Query-param row controls */
cms-endpoints-input .ep-name { flex: 1; min-width: 0; }
cms-endpoints-input .ep-type { min-width: 7rem; }
cms-endpoints-input .ep-required { white-space: nowrap; }

/* Compact response-status chooser (select + custom-code input) — not full-width,
   so the remove ✕ sits next to it. */
cms-endpoints-input .ep-status { flex: 0 0 auto; min-width: 7rem; }

/* The DataShape tree wraps its head, property box and "Remove body" with vertical
   gap (the root box has margin/padding/border:0, so without this they sit flush). */
cms-endpoints-input .ep-tree { display: flex; flex-direction: column; gap: .5rem; }

/* Out-tab response row — status line on top, body tree below; boxed so rows
   (which each embed a DataShape tree) read as distinct entries. */
cms-endpoints-input [data-role="response-row"] {
    padding: 0.6rem;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-subtle, #f8fafc);
}

/* Read-only path-param name chip */
cms-endpoints-input .ep-path-name {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px dashed var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-subtle, #f8fafc);
    color: var(--text-main, #1e293b);
    font-family: ui-monospace, monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* "+ Add query param" text button */
cms-endpoints-input .ep-add-param {
    align-self: flex-start;
    background: transparent;
    border: 0;
    color: var(--primary-base, #4361ee);
    font: inherit;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    padding: 0.25rem 0;
}

/* ── Body shape tree ──────────────────────────────────────────────── */
/* "Root type [select]" header */
cms-endpoints-input .ep-root-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
/* Inline type picker; for arrays it also holds "of <elementType>" */
cms-endpoints-input .ep-type-cell {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: 0 0 auto;
}
cms-endpoints-input .ep-of { color: var(--text-muted, #94a3b8); font-size: 12px; }

/* A nested object/array element groups its rows in a shaded, indented box */
cms-endpoints-input .ep-box {
    margin-top: 0.4rem;
    margin-left: 1.1rem;
    padding: 0.6rem;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-subtle, #f8fafc);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
/* The root object isn't boxed — it reads as the top level */
cms-endpoints-input .ep-box-root {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
}
cms-endpoints-input .ep-prop-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
/* One property: the row, plus any nested box below it */
cms-endpoints-input .ep-prop {
    display: flex;
    flex-direction: column;
    gap: 0;
}
cms-endpoints-input .ep-prop-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
cms-endpoints-input .ep-prop-name { flex: 1; min-width: 0; }
cms-endpoints-input .ep-required { flex: 0 0 auto; white-space: nowrap; }

/* Bordered "+ Add property" button */
cms-endpoints-input .ep-add-prop {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--border-default, #d1d5db);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    color: var(--text-main, #1e293b);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}
cms-endpoints-input .ep-add-prop:hover { border-color: var(--primary-base, #4361ee); color: var(--primary-base, #4361ee); }

cms-endpoints-input .ep-remove-body {
    align-self: flex-start;
    background: transparent;
    border: 0;
    color: var(--text-muted, #94a3b8);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 0.25rem 0;
}
cms-endpoints-input .ep-remove-body:hover { color: var(--danger-base, #ef4444); }

/* Full-width dashed "Add endpoint" button (hover handled here, not in JS) */
cms-endpoints-input .ep-add {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.8rem;
    border: 1.5px dashed var(--border-default, #d1d5db);
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted, #6b7280);
    font: inherit;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease;
}
cms-endpoints-input .ep-add:hover {
    border-color: var(--primary-base, #4361ee);
    color: var(--primary-base, #4361ee);
}
`;

  // ../../features/cms-gateway/src/interfaces/Gateway.ts
  var HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
  // ../../features/cms-gateway/src/core/headerPolicy.ts
  var FORBIDDEN_REQUEST_HEADERS = new Set([
    "host",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "upgrade",
    "proxy-connection",
    "proxy-authorization",
    "trailer",
    "content-length",
    "cookie"
  ]);
  var HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  var isForbiddenHeaderName = (n) => FORBIDDEN_REQUEST_HEADERS.has(n.toLowerCase());
  var isValidHeaderName = (n) => HEADER_NAME_RE.test(n);
  // ../../features/cms-gateway/src/core/validateProvider.ts
  var RESPONSE_STATUS = /^[1-5][0-9][0-9]$/;
  function isValidResponseStatus(status) {
    return status === "default" || RESPONSE_STATUS.test(status);
  }
  // ../../features/cms-gateway/src/core/buildUpstreamUrl.ts
  var PATH_PLACEHOLDER = /\{(\w+)\}/g;
  function extractPathParamNames(targetUrl) {
    const out = [];
    const seen = new Set;
    for (const m of targetUrl.matchAll(PATH_PLACEHOLDER)) {
      const name = m[1];
      if (seen.has(name))
        continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }
  // src/components/admin/EndpointsInput/controls.ts
  var ICON_SVG = (paths, size = 16) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  var ICON_PLUS = ICON_SVG('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18);
  var ICON_X = ICON_SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
  var ICON_TRASH = ICON_SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
  function makeInput(name, label, placeholder, value) {
    const input = document.createElement("p9r-input");
    if (name)
      input.setAttribute("name", name);
    if (label)
      input.setAttribute("label", label);
    input.setAttribute("placeholder", placeholder);
    if (value != null)
      input.setAttribute("value", value);
    return input;
  }
  function makeSelect(values, value, opts = {}) {
    const select = document.createElement("p9r-select");
    if (opts.name)
      select.setAttribute("name", opts.name);
    select.setAttribute("label", opts.label ?? "");
    for (const v2 of values) {
      const o = select.appendChild(document.createElement("option"));
      o.value = v2;
      o.textContent = v2;
    }
    select.setAttribute("value", value && values.includes(value) ? value : values[0]);
    return select;
  }
  var makeMethodSelect = (name, value) => makeSelect(HTTP_METHODS, value, { name, label: "Method" });
  function makeIconButton(svg, opts) {
    const btn = document.createElement("p9r-icon-button");
    btn.setAttribute("variant", "ghost");
    btn.setAttribute("color", "danger");
    btn.setAttribute("size", "sm");
    btn.setAttribute("aria-label", opts.ariaLabel);
    if (opts.slot)
      btn.setAttribute("slot", opts.slot);
    if (opts.action)
      btn.dataset.action = opts.action;
    if (opts.onClick)
      btn.addEventListener("click", opts.onClick);
    btn.innerHTML = svg;
    return btn;
  }
  function makeRequiredCheckbox(checked, onChange) {
    const cb = document.createElement("w13c-checkbox");
    cb.dataset.role = "required";
    cb.className = "ep-required";
    if (checked)
      cb.setAttribute("checked", "");
    cb.textContent = "Required";
    cb.addEventListener("change", onChange);
    return cb;
  }
  var makeDeleteButton = () => makeIconButton(ICON_TRASH, { ariaLabel: "Delete endpoint", slot: "header-actions", action: "remove-endpoint" });
  function makeAddButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ep-add";
    btn.dataset.action = "add-endpoint";
    btn.innerHTML = `${ICON_PLUS} Add endpoint`;
    return btn;
  }

  // src/components/admin/EndpointsInput/pathParams.ts
  var extractPathNames = extractPathParamNames;
  function makePathParamRow(name) {
    const row = document.createElement("p9r-stack");
    row.setAttribute("direction", "row");
    row.setAttribute("gap", "sm");
    row.setAttribute("align", "center");
    row.dataset.role = "path-param-row";
    row.dataset.paramName = name;
    const nameEl = document.createElement("code");
    nameEl.className = "ep-path-name";
    nameEl.textContent = name;
    const type = document.createElement("span");
    type.className = "ep-meta";
    type.textContent = "string";
    const req = document.createElement("span");
    req.className = "ep-meta";
    req.textContent = "required";
    row.append(nameEl, type, req);
    return row;
  }
  function renderPathParams(container, targetUrl) {
    const names = extractPathNames(targetUrl);
    container.replaceChildren();
    if (!names.length) {
      const hint = document.createElement("p");
      hint.className = "ep-hint";
      hint.textContent = "Add {placeholders} to the Target URL to declare path params.";
      container.appendChild(hint);
      return;
    }
    const rows = document.createElement("p9r-stack");
    rows.setAttribute("gap", "sm");
    names.forEach((n) => rows.appendChild(makePathParamRow(n)));
    container.appendChild(rows);
  }

  // src/components/admin/EndpointsInput/shared.ts
  var PARAM_TYPES = ["string", "number", "boolean"];
  var SHAPE_TYPES = ["string", "number", "boolean", "object", "array"];
  var readControl = (el2) => {
    const live = el2.value;
    return typeof live === "string" ? live : el2.getAttribute("value") ?? "";
  };
  function jsonField(name, role) {
    const f2 = document.createElement("input");
    f2.type = "hidden";
    f2.name = name;
    if (role)
      f2.dataset.role = role;
    f2.sync = (read) => {
      const v2 = read();
      f2.value = v2 == null || Array.isArray(v2) && v2.length === 0 ? "" : JSON.stringify(v2);
    };
    return f2;
  }
  var METHOD_COLOR = {
    GET: "success",
    POST: "info",
    PUT: "warning",
    PATCH: "warning",
    DELETE: "danger"
  };
  var methodColor = (m) => METHOD_COLOR[m] ?? "primary";

  // src/components/admin/EndpointsInput/queryRow.ts
  function makeQueryParamRow(seed, onChange) {
    const row = document.createElement("p9r-stack");
    row.setAttribute("direction", "row");
    row.setAttribute("gap", "sm");
    row.setAttribute("align", "center");
    row.dataset.role = "query-param-row";
    if (seed.description)
      row.dataset.description = seed.description;
    const name = makeInput("", "", "param name", seed.name);
    name.className = "ep-name";
    name.dataset.role = "param-name";
    name.addEventListener("input", onChange);
    const type = makeSelect(PARAM_TYPES, seed.type);
    type.className = "ep-type";
    type.dataset.role = "param-type";
    type.addEventListener("change", onChange);
    const req = makeRequiredCheckbox(!!seed.required, onChange);
    const remove = makeIconButton(ICON_X, {
      ariaLabel: "Remove param",
      onClick: () => {
        row.remove();
        onChange();
      }
    });
    row.append(name, type, req, remove);
    return row;
  }
  function readQueryParamRow(row) {
    const name = readControl(row.querySelector('[data-role="param-name"]')).trim();
    if (!name)
      return null;
    const type = readControl(row.querySelector('[data-role="param-type"]'));
    const required = row.querySelector('[data-role="required"]').hasAttribute("checked");
    const description = row.dataset.description;
    return { name, in: "query", type, required, ...description ? { description } : {} };
  }

  // src/components/admin/EndpointsInput/bodyNode.ts
  function makeNode(seed, onChange, depth = 0) {
    const typeSelect = makeSelect(SHAPE_TYPES, seed.type);
    typeSelect.dataset.role = "node-type";
    typeSelect.className = "ep-type";
    const typeEl = document.createElement("span");
    typeEl.className = "ep-type-cell";
    typeEl.appendChild(typeSelect);
    const childrenEl = document.createElement("div");
    const props = [];
    let itemsNode = null;
    const makeProp = (name, shape, required) => {
      const nameEl = makeInput("", "", "field name", name);
      nameEl.classList.add("ep-prop-name");
      nameEl.addEventListener("input", onChange);
      const child = makeNode(shape, onChange, depth + 1);
      const reqEl = makeRequiredCheckbox(required, onChange);
      const wrapper = document.createElement("div");
      wrapper.className = "ep-prop";
      const row = document.createElement("div");
      row.className = "ep-prop-row";
      const trash = makeIconButton(ICON_X, {
        ariaLabel: "Remove property",
        onClick: () => {
          const i = props.findIndex((p) => p.nameEl === nameEl);
          if (i >= 0)
            props.splice(i, 1);
          wrapper.remove();
          onChange();
        }
      });
      row.append(nameEl, child.typeEl, reqEl, trash);
      wrapper.append(row, child.childrenEl);
      props.push({ nameEl, reqEl, child });
      return wrapper;
    };
    const rebuild = (type, s2) => {
      props.length = 0;
      itemsNode = null;
      while (typeSelect.nextSibling)
        typeSelect.nextSibling.remove();
      childrenEl.replaceChildren();
      if (type === "object") {
        const box = document.createElement("div");
        box.className = depth > 0 ? "ep-box" : "ep-box ep-box-root";
        const list = document.createElement("div");
        list.className = "ep-prop-list";
        const req = new Set(s2.required ?? []);
        for (const [k, v2] of Object.entries(s2.properties ?? {}))
          list.appendChild(makeProp(k, v2, req.has(k)));
        const add = document.createElement("button");
        add.type = "button";
        add.className = "ep-add-prop";
        add.dataset.role = "add-prop";
        add.textContent = "+ Add property";
        add.addEventListener("click", () => {
          list.appendChild(makeProp("", { type: "string" }, false));
          onChange();
        });
        box.append(list, add);
        childrenEl.appendChild(box);
      } else if (type === "array") {
        itemsNode = makeNode(s2.items ?? { type: "string" }, onChange, depth + 1);
        const of = document.createElement("span");
        of.className = "ep-of";
        of.textContent = "of";
        typeEl.append(of, itemsNode.typeEl);
        childrenEl.appendChild(itemsNode.childrenEl);
      }
    };
    typeSelect.addEventListener("change", () => {
      const t = readControl(typeSelect);
      typeSelect.setAttribute("value", t);
      rebuild(t, { type: t });
      onChange();
    });
    rebuild(seed.type, seed);
    const read = () => {
      const type = readControl(typeSelect);
      if (type === "object") {
        const properties = {};
        const required = [];
        for (const p of props) {
          const n = readControl(p.nameEl).trim();
          if (!n)
            continue;
          properties[n] = p.child.read();
          if (p.reqEl.hasAttribute("checked"))
            required.push(n);
        }
        const out = { type };
        if (Object.keys(properties).length)
          out.properties = properties;
        if (required.length)
          out.required = required.filter((n) => Object.hasOwn(properties, n));
        return out;
      }
      if (type === "array")
        return itemsNode ? { type, items: itemsNode.read() } : { type };
      return { type };
    };
    return { typeEl, childrenEl, read };
  }

  // src/components/admin/EndpointsInput/dataShapeTree.ts
  function makeDataShapeTree(seed, onChange, labels) {
    const defineLabel = labels?.define ?? "+ Define request body";
    const removeLabel = labels?.remove ?? "Remove body";
    const rootLabel = labels?.root ?? "Root type";
    const element = document.createElement("div");
    element.className = "ep-tree";
    let root = null;
    const showEmpty = () => {
      root = null;
      const define = document.createElement("button");
      define.type = "button";
      define.className = "ep-add-param";
      define.dataset.role = "define-body";
      define.textContent = defineLabel;
      define.addEventListener("click", () => {
        showTree({ type: "object" });
        onChange();
      });
      element.replaceChildren(define);
    };
    const showTree = (s2) => {
      root = makeNode(s2, onChange, 0);
      const head = document.createElement("div");
      head.className = "ep-root-head";
      const label = document.createElement("span");
      label.className = "ep-meta";
      label.textContent = rootLabel;
      head.append(label, root.typeEl);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ep-remove-body";
      remove.textContent = removeLabel;
      remove.addEventListener("click", () => {
        showEmpty();
        onChange();
      });
      element.replaceChildren(head, root.childrenEl, remove);
    };
    if (seed)
      showTree(seed);
    else
      showEmpty();
    return { element, read: () => root?.read() };
  }

  // src/components/admin/EndpointsInput/bodyEditor.ts
  function makeBodySection(ei, seedBody) {
    const container = document.createElement("div");
    container.dataset.role = "body";
    const field = jsonField(`endpoints.${ei}.body`);
    const tree = makeDataShapeTree(seedBody, () => field.sync(() => tree.read()));
    tree.element.dataset.role = "body-slot";
    field.sync(() => seedBody);
    container.append(field, tree.element);
    return container;
  }

  // src/components/admin/EndpointsInput/inPanel.ts
  function makeInPanel(endpointIdx, seed, urlInput) {
    const seedParams = seed.params ?? [];
    const panel = document.createElement("p9r-tab-panel");
    panel.id = `in-${endpointIdx}`;
    panel.setAttribute("label", "In");
    const wrap = document.createElement("p9r-stack");
    wrap.setAttribute("gap", "m");
    const pathContainer = document.createElement("div");
    pathContainer.dataset.role = "path-params";
    const renderPath = () => {
      const live = urlInput.value;
      renderPathParams(pathContainer, typeof live === "string" ? live : urlInput.getAttribute("value") ?? "");
    };
    renderPath();
    urlInput.addEventListener("input", renderPath);
    urlInput.addEventListener("change", renderPath);
    const queryParams = seedParams.filter((p) => (p.in ?? "query") === "query");
    const container = document.createElement("div");
    container.dataset.role = "query-params";
    const paramsField = jsonField(`endpoints.${endpointIdx}.params`);
    const rows = document.createElement("p9r-stack");
    rows.setAttribute("gap", "sm");
    rows.dataset.role = "query-param-rows";
    const readRows = () => Array.from(rows.querySelectorAll('[data-role="query-param-row"]'), readQueryParamRow).filter((p) => p !== null);
    const sync = () => paramsField.sync(readRows);
    queryParams.forEach((p) => rows.appendChild(makeQueryParamRow(p, sync)));
    const add = document.createElement("button");
    add.type = "button";
    add.className = "ep-add-param";
    add.dataset.role = "add-query-param";
    add.textContent = "+ Add query param";
    add.addEventListener("click", () => {
      rows.appendChild(makeQueryParamRow({}, sync));
      sync();
    });
    paramsField.sync(() => queryParams);
    container.append(paramsField, rows, add);
    wrap.append(heading("Path params"), pathContainer, heading("Query params"), container, heading("Body"), makeBodySection(endpointIdx, seed.body), passthrough(`endpoints.${endpointIdx}.meta`, "meta-passthrough", seed.meta));
    panel.appendChild(wrap);
    return panel;
  }
  function passthrough(name, role, seed) {
    const f2 = jsonField(name, role);
    f2.sync(() => seed);
    return f2;
  }
  function heading(text) {
    const h = document.createElement("strong");
    h.className = "ep-heading";
    h.textContent = text;
    return h;
  }

  // src/components/admin/EndpointsInput/statusField.ts
  var COMMON = [
    "200",
    "201",
    "202",
    "204",
    "301",
    "302",
    "304",
    "400",
    "401",
    "403",
    "404",
    "409",
    "422",
    "429",
    "500",
    "502",
    "503"
  ];
  var CUSTOM = "custom";
  function buildSelect(value) {
    const select = document.createElement("p9r-select");
    select.dataset.role = "response-status";
    select.className = "ep-status";
    select.setAttribute("label", "");
    const opt = (v2, label) => {
      const o = select.appendChild(document.createElement("option"));
      o.value = v2;
      o.textContent = label;
    };
    opt("", "Status…");
    for (const c of COMMON)
      opt(c, c);
    opt("default", "default");
    opt(CUSTOM, "Custom…");
    select.setAttribute("value", value);
    return select;
  }
  function makeStatusField(seed, onChange) {
    const custom = seed != null && seed !== "" && ![...COMMON, "default"].includes(seed);
    const select = buildSelect(custom ? CUSTOM : seed ?? "");
    const input = document.createElement("p9r-input");
    input.dataset.role = "response-status-custom";
    input.className = "ep-status";
    input.setAttribute("placeholder", "e.g. 418");
    if (custom)
      input.setAttribute("value", seed);
    input.style.display = custom ? "" : "none";
    const validate = () => {
      const v2 = readControl(input).trim();
      if (readControl(select) === CUSTOM && v2 && !isValidResponseStatus(v2)) {
        input.setAttribute("invalid", "");
        input.setAttribute("hint", 'Code 100-599 or "default"');
        input.setAttribute("hint-level", "error");
      } else {
        input.removeAttribute("invalid");
        input.removeAttribute("hint");
        input.removeAttribute("hint-level");
      }
    };
    select.addEventListener("change", () => {
      const v2 = readControl(select);
      select.setAttribute("value", v2);
      input.style.display = v2 === CUSTOM ? "" : "none";
      validate();
      onChange();
    });
    input.addEventListener("input", () => {
      validate();
      onChange();
    });
    if (custom)
      validate();
    const element = document.createElement("p9r-stack");
    element.setAttribute("direction", "row");
    element.setAttribute("gap", "sm");
    element.setAttribute("align", "center");
    element.append(select, input);
    const read = () => {
      const sel = readControl(select);
      if (sel === CUSTOM) {
        const v2 = readControl(input).trim();
        return v2 || null;
      }
      return sel || null;
    };
    return { element, read };
  }

  // src/components/admin/EndpointsInput/responseRow.ts
  function makeResponseRow(seed, onChange, onRemove) {
    const row = document.createElement("p9r-stack");
    row.setAttribute("gap", "sm");
    row.dataset.role = "response-row";
    const head = document.createElement("p9r-stack");
    head.setAttribute("direction", "row");
    head.setAttribute("gap", "sm");
    head.setAttribute("align", "center");
    const status = makeStatusField(seed.status, onChange);
    const remove = makeIconButton(ICON_X, {
      ariaLabel: "Remove response",
      onClick: onRemove
    });
    head.append(status.element, remove);
    const tree = makeDataShapeTree(seed.body, onChange, {
      define: "+ Define body",
      remove: "Remove body",
      root: "Body type"
    });
    tree.element.dataset.role = "response-body";
    row.append(head, tree.element);
    const read = () => {
      const s2 = status.read();
      if (!s2)
        return null;
      const body = tree.read();
      return { status: s2, ...body ? { body } : {} };
    };
    return { element: row, read };
  }

  // src/components/admin/EndpointsInput/outPanel.ts
  function makeOutPanel(endpointIdx, seed) {
    const panel = document.createElement("p9r-tab-panel");
    panel.id = `out-${endpointIdx}`;
    panel.setAttribute("label", "Out");
    const wrap = document.createElement("p9r-stack");
    wrap.setAttribute("gap", "m");
    const field = jsonField(`endpoints.${endpointIdx}.output`);
    const rows = document.createElement("p9r-stack");
    rows.setAttribute("gap", "sm");
    rows.dataset.role = "response-rows";
    const handles = [];
    const readRows = () => handles.map((h) => h.read()).filter((r) => r !== null);
    const sync = () => field.sync(readRows);
    const addRow = (r) => {
      const handle = makeResponseRow(r, sync, () => {
        const i = handles.indexOf(handle);
        if (i >= 0)
          handles.splice(i, 1);
        handle.element.remove();
        sync();
      });
      handles.push(handle);
      rows.appendChild(handle.element);
    };
    (seed.output ?? []).forEach(addRow);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "ep-add-param";
    add.dataset.role = "add-response";
    add.textContent = "+ Add response";
    add.addEventListener("click", () => {
      addRow({});
      sync();
    });
    field.sync(() => seed.output);
    wrap.append(field, heading2("Responses"), rows, add);
    panel.appendChild(wrap);
    return panel;
  }
  function heading2(text) {
    const h = document.createElement("strong");
    h.className = "ep-heading";
    h.textContent = text;
    return h;
  }

  // src/components/admin/EndpointsInput/headerRow.ts
  function makeHeaderRow(seed, onChange, onRemove, opts) {
    const row = document.createElement("p9r-stack");
    row.setAttribute("direction", "row");
    row.setAttribute("gap", "sm");
    row.setAttribute("align", "center");
    row.dataset.role = "header-row";
    const from = seed.source?.from ?? "static";
    const name = makeInput("", "", "X-Api-Version", seed.name);
    name.className = "ep-name";
    name.dataset.role = "header-name";
    const validate = () => {
      const n = readControl(name).trim();
      if (n && (!isValidHeaderName(n) || isForbiddenHeaderName(n))) {
        name.setAttribute("invalid", "");
        name.setAttribute("hint", "Invalid or reserved header name");
        name.setAttribute("hint-level", "error");
      } else {
        name.removeAttribute("invalid");
        name.removeAttribute("hint");
        name.removeAttribute("hint-level");
      }
    };
    name.addEventListener("input", () => {
      validate();
      onChange();
    });
    if (seed.name)
      validate();
    const fromSelect = makeSelect(["static", "secret"], from);
    fromSelect.className = "ep-status";
    fromSelect.dataset.role = "header-from";
    const staticInput = makeInput("", "", "value", from === "static" ? seed.source?.value : undefined);
    staticInput.className = "ep-name";
    staticInput.dataset.role = "header-value-static";
    staticInput.style.display = from === "static" ? "" : "none";
    staticInput.addEventListener("input", onChange);
    const credSelect = document.createElement("cms-credential-select");
    credSelect.dataset.role = "header-value-secret";
    credSelect.className = "ep-name";
    credSelect.setAttribute("label", "");
    if (opts?.api)
      credSelect.setAttribute("api", opts.api);
    if (from === "secret")
      credSelect.setAttribute("value", seed.source.ref ?? "");
    credSelect.style.display = from === "secret" ? "" : "none";
    credSelect.addEventListener("change", onChange);
    fromSelect.addEventListener("change", () => {
      const v2 = readControl(fromSelect);
      fromSelect.setAttribute("value", v2);
      staticInput.style.display = v2 === "static" ? "" : "none";
      credSelect.style.display = v2 === "secret" ? "" : "none";
      onChange();
    });
    const remove = makeIconButton(ICON_X, { ariaLabel: "Remove header", onClick: onRemove });
    row.append(name, fromSelect, staticInput, credSelect, remove);
    const read = () => {
      const n = readControl(name).trim();
      if (!n)
        return null;
      if (readControl(fromSelect) === "secret") {
        const ref = (credSelect.value || credSelect.getAttribute("value") || "").trim();
        return ref ? { name: n, source: { from: "secret", ref } } : null;
      }
      return { name: n, source: { from: "static", value: readControl(staticInput) } };
    };
    return { element: row, read };
  }

  // src/components/admin/EndpointsInput/headersPanel.ts
  function makeHeadersPanel(endpointIdx, seed, opts) {
    const panel = document.createElement("p9r-tab-panel");
    panel.id = `headers-${endpointIdx}`;
    panel.setAttribute("label", "Headers");
    const wrap = document.createElement("p9r-stack");
    wrap.setAttribute("gap", "m");
    const field = jsonField(`endpoints.${endpointIdx}.headers`);
    const rows = document.createElement("p9r-stack");
    rows.setAttribute("gap", "sm");
    rows.dataset.role = "header-rows";
    const handles = [];
    const readRows = () => handles.map((h) => h.read()).filter((r) => r !== null);
    const sync = () => field.sync(readRows);
    const addRow = (h) => {
      const handle = makeHeaderRow(h, sync, () => {
        const i = handles.indexOf(handle);
        if (i >= 0)
          handles.splice(i, 1);
        handle.element.remove();
        sync();
      }, opts);
      handles.push(handle);
      rows.appendChild(handle.element);
    };
    (seed.headers ?? []).forEach(addRow);
    const add = document.createElement("button");
    add.type = "button";
    add.className = "ep-add-param";
    add.dataset.role = "add-header";
    add.textContent = "+ Add header";
    add.addEventListener("click", () => {
      addRow({});
      sync();
    });
    field.sync(() => seed.headers);
    wrap.append(field, heading3("Headers"), rows, add);
    panel.appendChild(wrap);
    return panel;
  }
  function heading3(text) {
    const h = document.createElement("strong");
    h.className = "ep-heading";
    h.textContent = text;
    return h;
  }

  // src/components/admin/EndpointsInput/rows.ts
  function makeEndpointRow(idx, seed = {}, api) {
    const method = seed.method && HTTP_METHODS.includes(seed.method) ? seed.method : HTTP_METHODS[0];
    const item = document.createElement("p9r-accordion-item");
    item.dataset.role = "endpoint-row";
    const header = document.createElement("span");
    header.className = "ep-header";
    header.setAttribute("slot", "header");
    const methodTag = document.createElement("p9r-tag");
    methodTag.dataset.display = "method";
    methodTag.setAttribute("color", methodColor(method));
    methodTag.textContent = method;
    const idEl = document.createElement("strong");
    idEl.className = "ep-id";
    idEl.dataset.display = "endpointId";
    idEl.textContent = seed.endpointId || "(new endpoint)";
    const pathEl = document.createElement("span");
    pathEl.className = "ep-path";
    pathEl.dataset.display = "targetUrl";
    pathEl.textContent = seed.targetUrl || "";
    header.append(methodTag, idEl, pathEl);
    const tabs = document.createElement("p9r-tabs");
    const infos = document.createElement("p9r-tab-panel");
    infos.id = `infos-${idx}`;
    infos.setAttribute("label", "Infos");
    const infosBody = document.createElement("p9r-stack");
    infosBody.setAttribute("gap", "m");
    const idInput = makeInput(`endpoints.${idx}.endpointId`, "Endpoint id", "getUser", seed.endpointId);
    const methodSelect = makeMethodSelect(`endpoints.${idx}.method`, method);
    const urlInput = makeInput(`endpoints.${idx}.targetUrl`, "Target URL", "https://api.example.com/path", seed.targetUrl);
    infosBody.append(idInput, methodSelect, urlInput);
    infos.appendChild(infosBody);
    tabs.append(infos, makeInPanel(idx, seed, urlInput), makeOutPanel(idx, seed), makeHeadersPanel(idx, seed, { api }));
    tabs.setAttribute("active", `infos-${idx}`);
    item.append(header, makeDeleteButton(), tabs);
    bindHeaderSync(methodTag, idEl, pathEl, idInput, methodSelect, urlInput);
    return item;
  }
  function bindHeaderSync(methodTag, idEl, pathEl, idInput, methodSelect, urlInput) {
    const update = () => {
      const m = readControl(methodSelect) || HTTP_METHODS[0];
      methodTag.textContent = m;
      methodTag.setAttribute("color", methodColor(m));
      idEl.textContent = readControl(idInput).trim() || "(new endpoint)";
      pathEl.textContent = readControl(urlInput);
    };
    for (const el2 of [idInput, methodSelect, urlInput]) {
      el2.addEventListener("input", update);
      el2.addEventListener("change", update);
    }
  }

  // src/components/admin/EndpointsInput/EndpointsInput.ts
  class CmsEndpointsInput extends HTMLElement {
    _rowCount = 0;
    _initialized = false;
    _rowsContainer = null;
    _onClick = (e) => {
      const target = e.target;
      const addBtn = target.closest('[data-action="add-endpoint"]');
      if (addBtn && this.contains(addBtn)) {
        e.preventDefault();
        this._addRow({})?.scrollIntoView({ block: "nearest" });
        return;
      }
      const removeBtn = target.closest('[data-action="remove-endpoint"]');
      if (removeBtn && this.contains(removeBtn)) {
        e.preventDefault();
        removeBtn.closest('[data-role="endpoint-row"]')?.remove();
      }
    };
    connectedCallback() {
      if (!this._initialized) {
        this._initialized = true;
        ensureStyles();
        this._render();
        const seeds = this._parseValue();
        if (seeds.length)
          seeds.forEach((seed) => this._addRow(seed));
        else if (!this.hasAttribute("value"))
          this._addRow({});
      }
      this.addEventListener("click", this._onClick);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._onClick);
    }
    _parseValue() {
      const raw = this.getAttribute("value");
      if (!raw)
        return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    _render() {
      this._rowsContainer = document.createElement("p9r-accordion");
      this.append(this._rowsContainer, makeAddButton());
    }
    _addRow(seed = {}) {
      if (!this._rowsContainer)
        return null;
      const api = this.getAttribute("api") ?? this.getAttribute("secrets-api") ?? undefined;
      const item = makeEndpointRow(this._rowCount++, seed, api);
      this._rowsContainer.appendChild(item);
      return item;
    }
  }
  var stylesInjected = false;
  function ensureStyles() {
    if (stylesInjected || document.getElementById("cms-endpoints-input-styles"))
      return;
    stylesInjected = true;
    const style = document.createElement("style");
    style.id = "cms-endpoints-input-styles";
    style.textContent = EndpointsInput_default;
    document.head.appendChild(style);
  }
  customElements.define("cms-endpoints-input", CmsEndpointsInput);

  // src/components/admin/EventToast/EventToast.ts
  class CmsEventToast extends HTMLElement {
    _attached = null;
    _onEvent = () => {
      const message = this.getAttribute("message") ?? "";
      const type = this.getAttribute("type") ?? "success";
      if (message)
        dd(message, { type });
    };
    connectedCallback() {
      this.style.display = "none";
      const evt = this.getAttribute("event");
      if (!evt)
        return;
      document.addEventListener(evt, this._onEvent);
      this._attached = evt;
    }
    disconnectedCallback() {
      if (this._attached)
        document.removeEventListener(this._attached, this._onEvent);
      this._attached = null;
    }
  }
  customElements.define("cms-event-toast", CmsEventToast);

  // ../../features/cms-auth/src/core/validation.ts
  function isBuiltinProvider(kind) {
    return kind === "local";
  }
  // ../../features/cms-auth/src/components/LoginMethods/LoginMethods.ts
  class CmsLoginMethods extends HTMLElement {
    async connectedCallback() {
      const base = this.getAttribute("base") ?? "";
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          .sep { display: flex; align-items: center; gap: .75rem; color: var(--text-muted, #999); font-size: .8rem; margin: 1rem 0; }
          .sep::before, .sep::after { content: ""; flex: 1; height: 1px; background: var(--border-default, #ddd); }
          a.provider { display: block; text-align: center; padding: .6rem; margin-top: .5rem; text-decoration: none;
                       border: 1px solid var(--border-default, #ddd); border-radius: var(--radius-sm, 6px);
                       color: var(--text-main, #111); background: var(--bg-surface, #fff); }
          a.provider:hover { background: var(--bg-base, #f6f6f6); }
        </style>
        <div class="methods"></div>`;
      const wrap = root.querySelector(".methods");
      const returnTo = new URL(location.href).searchParams.get("returnTo") ?? "";
      const rt2 = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      try {
        const res = await fetch(`${base}/auth/methods`);
        const methods = res.ok ? await res.json() : [];
        const redirect = methods.filter((m) => m.loginUrl);
        if (!redirect.length)
          return;
        wrap.innerHTML = `<div class="sep">or</div>` + redirect.map((m) => `<a class="provider" href="${esc(m.loginUrl)}${rt2}">${esc(m.displayName)}</a>`).join("");
      } catch {}
    }
  }
  var esc = (s2) => s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  customElements.define("cms-login-methods", CmsLoginMethods);
  // src/components/admin/ProviderActions/ProviderActions.ts
  class CmsProviderActions extends HTMLElement {
    static get observedAttributes() {
      return ["provider-id", "kind", "enabled"];
    }
    connectedCallback() {
      this._render();
    }
    attributeChangedCallback() {
      if (this.isConnected)
        this._render();
    }
    get _base() {
      return this.getAttribute("base-url") ?? "/api/identity/provider";
    }
    get _id() {
      return this.getAttribute("provider-id") ?? "";
    }
    get _kind() {
      return this.getAttribute("kind") ?? "";
    }
    get _enabled() {
      return this.getAttribute("enabled") === "true";
    }
    get _emit() {
      return this.getAttribute("emit");
    }
    get _builtin() {
      return isBuiltinProvider(this._kind);
    }
    _render() {
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      const on2 = this._enabled;
      root.innerHTML = `
        <style>
          :host { display: inline-flex; }
          .row { display: inline-flex; gap: .6rem; align-items: center; }
          .switch { width: 38px; height: 22px; padding: 0; border-radius: 11px; border: 1px solid var(--border-default, #ddd);
                    background: var(--bg-base, #eee); position: relative; cursor: pointer; transition: background .15s, border-color .15s; }
          .switch.on { background: var(--success-base, #16a34a); border-color: var(--success-base, #16a34a); }
          .switch .knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
                          background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
          .switch.on .knob { transform: translateX(16px); }
          .state { font-size: .85rem; color: var(--text-muted, #777); min-width: 4.5em; }
          .btn { font: inherit; cursor: pointer; border-radius: var(--radius-sm, 6px); padding: .3rem .55rem;
                 border: 1px solid var(--border-default, #ddd); background: var(--bg-surface, #fff); color: var(--text-body, #333); }
          .btn:hover { background: var(--bg-base, #f3f3f3); }
          .remove { border-color: var(--danger-muted, #fee2e2); color: var(--danger-base, #dc2626); }
          .remove:hover { background: var(--danger-muted, #fee2e2); }
        </style>
        <div class="row">
          <button type="button" class="switch ${on2 ? "on" : ""}" role="switch" aria-checked="${on2}" title="${on2 ? "Disable" : "Enable"}"><span class="knob"></span></button>
          <span class="state">${on2 ? "Enabled" : "Disabled"}</span>
          ${this._builtin ? "" : `<button type="button" class="btn edit">Edit</button>`}
          ${this._builtin ? "" : `<button type="button" class="btn remove">Remove</button>`}
        </div>`;
      root.querySelector(".switch").addEventListener("click", () => this._toggle());
      root.querySelector(".edit")?.addEventListener("click", () => document.getElementById(`edit-${this._id}`)?.setAttribute("open", ""));
      root.querySelector(".remove")?.addEventListener("click", () => this._remove());
    }
    async _toggle() {
      const next = !this._enabled;
      if (await this._send("PATCH", { id: this._id, enabled: next })) {
        this.setAttribute("enabled", String(next));
        dd(next ? "Provider enabled" : "Provider disabled", { type: "success" });
        this._fire();
      }
    }
    async _remove() {
      if (!confirm(`Remove provider "${this._id}"?`))
        return;
      if (await this._send("DELETE", { id: this._id })) {
        dd("Provider removed", { type: "success" });
        this._fire();
      }
    }
    async _send(method, body) {
      try {
        const res = await fetch(this._base, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) {
          dd("Action failed", { type: "error" });
          return false;
        }
        return true;
      } catch {
        dd("Network error", { type: "error" });
        return false;
      }
    }
    _fire() {
      if (this._emit)
        document.dispatchEvent(new Event(this._emit, { bubbles: true }));
    }
  }
  customElements.define("cms-provider-actions", CmsProviderActions);

  // ../../foundation/http-runner/src/core/html.ts
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  var escapeAttr = escapeHtml;
  // src/components/admin/RoleSelect/RoleSelect.ts
  class CmsRoleSelect extends HTMLElement {
    static formAssociated = true;
    static get observedAttributes() {
      return ["sub", "value"];
    }
    internals;
    roles = [];
    constructor() {
      super();
      this.internals = this.attachInternals();
    }
    connectedCallback() {
      this.internals.setFormValue(this._value);
      this._load();
    }
    attributeChangedCallback() {
      if (this.isConnected)
        this._render();
    }
    get _url() {
      return this.getAttribute("url") ?? "/api/users/role";
    }
    get _listUrl() {
      return this.getAttribute("list-url") ?? "/api/roles/list";
    }
    get _sub() {
      return this.getAttribute("sub") ?? "";
    }
    get _value() {
      return this.getAttribute("value") ?? "user";
    }
    get _emit() {
      return this.getAttribute("emit");
    }
    async _load() {
      try {
        const res = await fetch(this._listUrl, { headers: { Accept: "application/json" } });
        this.roles = res.ok ? await res.json() : [];
      } catch {
        this.roles = [];
      }
      this._render();
    }
    _render() {
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      const current = this._value;
      const opts = this.roles.length ? this.roles : [{ id: current, label: current }];
      root.innerHTML = `
        <style>
          select { font: inherit; padding: .35rem .5rem; border-radius: var(--radius-sm, 6px);
                   border: 1px solid var(--border-default, #ddd); background: var(--bg-surface, #fff); color: var(--text-body, #333); }
        </style>
        <select>${opts.map((r) => `<option value="${escapeHtml(r.id)}"${r.id === current ? " selected" : ""}>${escapeHtml(r.label)}</option>`).join("")}</select>`;
      const sel = root.querySelector("select");
      this.internals.setFormValue(sel.value);
      sel.addEventListener("change", () => this._onChange(sel.value));
    }
    _onChange(role) {
      this.internals.setFormValue(role);
      if (this._sub)
        this._save(role);
    }
    async _save(role) {
      try {
        const res = await fetch(this._url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sub: this._sub, role })
        });
        if (res.ok) {
          dd("Role updated", { type: "success" });
          if (this._emit)
            document.dispatchEvent(new Event(this._emit, { bubbles: true }));
        } else {
          dd("Failed to update role", { type: "error" });
        }
      } catch {
        dd("Network error", { type: "error" });
      }
    }
    get name() {
      return this.getAttribute("name");
    }
  }
  customElements.define("cms-role-select", CmsRoleSelect);

  // src/components/admin/RoleEditor/RoleEditor.ts
  class CmsRoleEditor extends HTMLElement {
    data = null;
    get _api() {
      return this.getAttribute("api") ?? "/api/roles";
    }
    get _back() {
      return this.getAttribute("back") ?? "/admin/roles";
    }
    get _id() {
      return new URLSearchParams(location.search).get("id") ?? "";
    }
    connectedCallback() {
      this._load();
    }
    async _load() {
      const id = this._id;
      if (!id) {
        location.href = this._back;
        return;
      }
      try {
        const res = await fetch(`${this._api}/editor?id=${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } });
        if (!res.ok)
          throw new Error;
        this.data = await res.json();
      } catch {
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        root.innerHTML = `<p>Could not load this role.</p>`;
        return;
      }
      this._render();
    }
    _render() {
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
      const d2 = this.data;
      const checked = new Set(d2.role.grants);
      const cb = (id, label) => `<w13c-checkbox value="${escapeHtml(id)}"${checked.has(id) ? " checked" : ""}>${escapeHtml(label)}</w13c-checkbox>`;
      const section = (label, items) => {
        const n = items.filter((i) => checked.has(i.id)).length;
        return `
              <p9r-accordion-item>
                <span slot="header" class="grp">${escapeHtml(label)}<span class="badge"${n ? "" : " hidden"}>${n}</span></span>
                <div class="grid">${items.map((i) => cb(i.id, i.label)).join("")}</div>
              </p9r-accordion-item>`;
      };
      const cmsItems = d2.catalog.cms.map((g2) => section(g2.label, g2.permissions.map((p) => ({ id: p.id, label: p.verb })))).join("");
      const gwBlock = d2.catalog.gateway.length ? `<p9r-accordion multiple>${d2.catalog.gateway.map((g2) => section(g2.label, g2.endpoints)).join("")}</p9r-accordion>` : `<p class="muted">No gateway providers configured.</p>`;
      root.innerHTML = `
          <style>
            :host { display:block; max-width: 64rem; }
            .intro { margin: 0 0 1.25rem; color: var(--text-body,#333); }
            .intro code { background: var(--bg-muted,#f3f4f6); padding: .1rem .4rem; border-radius: 4px; }
            section { margin: 0 0 1.5rem; }
            h3 { margin: 0 0 .6rem; font-size: 1rem; }
            p9r-accordion-item { display:block; }
            .grp { display:inline-flex; align-items:center; gap:.5rem; font-weight:600; }
            .badge { display:inline-flex; min-width:1.3rem; height:1.3rem; padding:0 .4rem; align-items:center; justify-content:center;
                     font-size:.72rem; font-weight:700; border-radius:999px; background: var(--bg-muted,#eef0f4); color: var(--text-body,#333); }
            .grid { display:flex; flex-wrap:wrap; gap:.55rem 1.75rem; padding:.5rem .25rem; }
            .muted { color: var(--text-muted,#666); }
            .bar { display:flex; align-items:center; gap:1rem; margin-top:1.75rem; }
            .cancel { text-decoration:none; color: var(--text-muted,#666); font:inherit; }
          </style>
          <p class="intro">Editing role <strong>${escapeHtml(d2.role.label)}</strong> <code>${escapeHtml(d2.role.id)}</code></p>

          <section>
            <h3>CMS capabilities</h3>
            <p9r-accordion multiple>${cmsItems}</p9r-accordion>
          </section>

          <section>
            <h3>Gateway endpoints</h3>
            ${gwBlock}
          </section>

          <div class="bar">
            <p9r-button color="primary" class="save">Save</p9r-button>
            <a class="cancel" href="${escapeHtml(this._back)}">Cancel</a>
          </div>`;
      root.querySelector(".save").addEventListener("click", () => void this._save());
      root.addEventListener("change", () => this._refreshBadges());
    }
    _refreshBadges() {
      this.shadowRoot.querySelectorAll("p9r-accordion-item").forEach((item) => {
        const n = item.querySelectorAll("w13c-checkbox[checked]").length;
        const badge = item.querySelector(".badge");
        if (!badge)
          return;
        badge.textContent = String(n);
        badge.toggleAttribute("hidden", n === 0);
      });
    }
    async _save() {
      const grants = Array.from(this.shadowRoot.querySelectorAll("w13c-checkbox")).filter((el2) => el2.hasAttribute("checked")).map((el2) => ({ permission: el2.getAttribute("value") }));
      try {
        const res = await fetch(this._api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: this.data.role.id, label: this.data.role.label, grants })
        });
        if (res.ok) {
          dd("Role permissions saved", { type: "success" });
          location.href = this._back;
        } else {
          dd("Failed to save permissions", { type: "error" });
        }
      } catch {
        dd("Network error", { type: "error" });
      }
    }
  }
  customElements.define("cms-role-editor", CmsRoleEditor);

  // src/components/admin/Tokens/TokenCreate.ts
  class CmsTokenCreate extends HTMLElement {
    _token = "";
    connectedCallback() {
      this.innerHTML = TEMPLATE;
      this._q('[data-role="create"]').addEventListener("click", () => this._create());
      this._q('[data-role="copy"]').addEventListener("click", () => this._copy());
      this._q('[data-role="done"]').addEventListener("click", () => this._close());
      this.closest("p9r-modal")?.addEventListener("open", () => this._reset());
    }
    _q(sel) {
      return this.querySelector(sel);
    }
    get _api() {
      return this.getAttribute("api") ?? "/api/pats";
    }
    get _emit() {
      return this.getAttribute("emit") ?? "pat:changed";
    }
    async _create() {
      const input = this._q('[data-role="name"]');
      const name = (input.value ?? "").trim();
      if (!name) {
        input.setAttribute("invalid", "");
        input.focus?.();
        return;
      }
      input.removeAttribute("invalid");
      const btn = this._q('[data-role="create"]');
      btn.setAttribute("disabled", "");
      try {
        const res = await fetch(this._api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
        if (!res.ok) {
          dd("Could not create token", { type: "error" });
          return;
        }
        const { token } = await res.json();
        this._token = token;
        this._q('[data-role="token"]').value = token;
        this._q('[data-role="form"]').hidden = true;
        this._q('[data-role="reveal"]').hidden = false;
        document.dispatchEvent(new Event(this._emit, { bubbles: true }));
      } catch {
        dd("Network error", { type: "error" });
      } finally {
        btn.removeAttribute("disabled");
      }
    }
    _copy() {
      navigator.clipboard?.writeText(this._token);
      dd("Token copied", { type: "success" });
    }
    _reset() {
      this._token = "";
      this._q('[data-role="name"]').value = "";
      this._q('[data-role="form"]').hidden = false;
      this._q('[data-role="reveal"]').hidden = true;
    }
    _close() {
      this._reset();
      this.closest("p9r-modal")?.removeAttribute("open");
    }
  }
  var TEMPLATE = `
<div data-role="form">
  <p9r-stack gap="md">
    <p9r-input data-role="name" name="name" label="Token name" placeholder="my laptop CLI"></p9r-input>
    <p9r-button data-role="create" color="primary" fullWidth>Create token</p9r-button>
  </p9r-stack>
</div>
<div data-role="reveal" hidden>
  <p9r-stack gap="md">
    <p9r-alert type="warning">
      <span slot="title">Copy this token now</span>
      It won't be shown again.
    </p9r-alert>
    <p9r-input data-role="token" label="Token"></p9r-input>
    <p9r-stack direction="row" gap="sm" justify="end">
      <p9r-button data-role="copy" variant="outlined">Copy</p9r-button>
      <p9r-button data-role="done" color="primary">Done</p9r-button>
    </p9r-stack>
  </p9r-stack>
</div>`;
  customElements.define("cms-token-create", CmsTokenCreate);

  // src/components/admin/Secrets/template.html
  var template_default3 = `<div class="add">
    <p9r-input data-role="add-key"
        placeholder="MY_API_KEY"></p9r-input>
    <p9r-input data-role="add-value" type="password"
        placeholder="Value (kept server-side)"></p9r-input>
    <p9r-button color="primary" data-action="add-submit">Add</p9r-button>
</div>

<div data-role="list"></div>

<template data-role="row-template">
    <div class="row">
        <strong data-role="key"></strong>
        <p9r-input data-role="value" type="password"></p9r-input>
        <button class="icon-btn" data-action="reveal" data-icon="eye"   title="Reveal / hide" type="button"></button>
        <button class="icon-btn" data-action="save"   data-icon="save"  title="Save"          type="button"></button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-icon="trash" title="Delete" type="button"></button>
    </div>
</template>

<div data-role="empty" hidden>No secrets yet.</div>
`;

  // src/components/admin/Secrets/style.css
  var style_default2 = `:host {
    display: block;
}

.add {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    margin-bottom: 16px;
}

.add > p9r-input { flex: 1; min-width: 0; }

[data-role="list"] {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
}

.row > [data-role="key"] {
    min-width: 14rem;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: var(--text-main, #1e293b);
}

.row > [data-role="value"] { flex: 1; min-width: 0; }

.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted, #64748b);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
}

.icon-btn:hover {
    background: var(--bg-base, #f1f5f9);
    color: var(--text-main, #1e293b);
}

.icon-btn--danger:hover {
    color: var(--danger-base, #dc2626);
    background: var(--danger-muted, #fef2f2);
}

[data-role="empty"] {
    padding: 32px 16px;
    text-align: center;
    color: var(--text-muted, #94a3b8);
    border: 1px dashed var(--border-default, #e2e8f0);
    border-radius: 8px;
}
`;

  // src/components/admin/Secrets/actions.ts
  var RELOAD_EVENT = "secret:saved";
  async function fetchSecrets(api) {
    const res = await fetch(api, { headers: { Accept: "application/json" } });
    if (!res.ok)
      throw new Error("Failed to load secrets");
    return res.json();
  }
  async function postSecret(api, key, value) {
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value })
    });
    if (res.ok) {
      document.dispatchEvent(new BubblesEvent(RELOAD_EVENT));
      return { ok: true };
    }
    return { ok: false, error: await readError(res) };
  }
  async function deleteSecret(api, key) {
    const url = `${api}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      document.dispatchEvent(new BubblesEvent(RELOAD_EVENT));
      return { ok: true };
    }
    return { ok: false, error: await readError(res) };
  }
  async function readError(res) {
    try {
      const body = await res.json();
      if (body && typeof body.error === "string")
        return body.error;
    } catch {}
    return `HTTP ${res.status}`;
  }
  var SECRETS_RELOAD_EVENT = RELOAD_EVENT;

  // src/components/icons.ts
  var ICON_EYE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>
    <circle cx="12" cy="12" r="3"/>
</svg>
`;
  var ICON_SAVE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
</svg>
`;
  var ICON_TRASH2 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
</svg>
`;

  // src/components/admin/Secrets/icons.ts
  var ICONS = { eye: ICON_EYE, save: ICON_SAVE, trash: ICON_TRASH2 };
  function injectIcons(root) {
    root.querySelectorAll("[data-icon]").forEach((el2) => {
      const name = el2.dataset.icon;
      if (ICONS[name])
        el2.innerHTML = ICONS[name];
    });
  }

  // src/components/admin/Secrets/ops.ts
  async function opSaveRow(api, key, value) {
    const r = await postSecret(api, key, value);
    if (r.ok)
      dd(`Secret ${key} updated`, { type: "success" });
    else
      dd(`Update failed: ${r.error}`, { type: "error" });
  }
  async function opAddSecret(api, keyEl, valueEl, knownKeys) {
    const key = keyEl.value.trim();
    const value = valueEl.value;
    if (!key) {
      dd("Key is required", { type: "error" });
      return;
    }
    const keyError = secretKeyError(key);
    if (keyError) {
      dd(`Invalid key: ${keyError}`, { type: "error" });
      return;
    }
    if (knownKeys.has(key)) {
      dd(`Secret ${key} already exists — edit it inline below`, { type: "warning" });
      return;
    }
    const r = await postSecret(api, key, value);
    if (r.ok) {
      keyEl.value = "";
      valueEl.value = "";
      dd(`Secret ${key} created`, { type: "success" });
    } else {
      dd(`Create failed: ${r.error}`, { type: "error" });
    }
  }
  async function opDeleteSecret(api, key) {
    if (!confirm(`Delete secret "${key}"?`))
      return;
    const r = await deleteSecret(api, key);
    if (r.ok)
      dd(`Secret ${key} deleted`, { type: "success" });
    else
      dd(`Delete failed: ${r.error}`, { type: "error" });
  }

  // src/components/admin/Secrets/Secrets.ts
  class CmsSecrets extends A2 {
    _list = null;
    _rowTemplate = null;
    _empty = null;
    _knownKeys = new Set;
    _onReload = () => this._reload();
    constructor() {
      super({ css: style_default2, template: template_default3 });
    }
    connectedCallback() {
      const sr2 = this.shadowRoot;
      this._list = sr2.querySelector('[data-role="list"]');
      this._empty = sr2.querySelector('[data-role="empty"]');
      this._rowTemplate = sr2.querySelector('[data-role="row-template"]');
      sr2.querySelector('[data-action="add-submit"]')?.addEventListener("click", () => this._add());
      document.addEventListener(SECRETS_RELOAD_EVENT, this._onReload);
      this._reload();
    }
    disconnectedCallback() {
      document.removeEventListener(SECRETS_RELOAD_EVENT, this._onReload);
    }
    get _api() {
      return this.getAttribute("api") ?? "/api/secrets";
    }
    async _reload() {
      if (!this._list || !this._empty)
        return;
      try {
        const items = await fetchSecrets(this._api);
        items.sort((a, b2) => a.key.localeCompare(b2.key));
        this._knownKeys = new Set(items.map((it2) => it2.key));
        this._list.replaceChildren(...items.map((it2) => this._buildRow(it2.key, it2.value)));
        this._empty.hidden = items.length > 0;
      } catch {
        this._empty.hidden = false;
        this._empty.textContent = "Failed to load secrets.";
      }
    }
    _buildRow(key, value) {
      const frag = this._rowTemplate.content.cloneNode(true);
      const row = frag.firstElementChild;
      row.dataset.key = key;
      row.querySelector('[data-role="key"]').textContent = key;
      row.querySelector('[data-role="value"]').value = value;
      injectIcons(row);
      row.querySelector('[data-action="reveal"]')?.addEventListener("click", () => this._toggleReveal(row));
      row.querySelector('[data-action="save"]')?.addEventListener("click", () => this._save(row));
      row.querySelector('[data-action="delete"]')?.addEventListener("click", () => opDeleteSecret(this._api, key));
      return row;
    }
    _toggleReveal(row) {
      const input = row.querySelector('[data-role="value"]');
      const cur = input.getAttribute("type") ?? "password";
      input.setAttribute("type", cur === "password" ? "text" : "password");
    }
    _save(row) {
      const key = row.dataset.key;
      const value = row.querySelector('[data-role="value"]').value;
      return opSaveRow(this._api, key, value);
    }
    _add() {
      const sr2 = this.shadowRoot;
      const keyEl = sr2.querySelector('[data-role="add-key"]');
      const valueEl = sr2.querySelector('[data-role="add-value"]');
      return opAddSecret(this._api, keyEl, valueEl, this._knownKeys);
    }
  }
  if (!customElements.get("cms-secrets"))
    customElements.define("cms-secrets", CmsSecrets);

  // ../../features/cms-editor-system-v2/src/components/Layout/TopBar/template.html
  var template_default4 = `<header class="topbar">
    <div class="start">
        <a class="back" href="#">
            <span class="chevron">‹</span>
            <span class="back-label">Pages</span>
        </a>
        <div class="divider"></div>
        <div class="title">
            <span class="name">Pricing</span>
            <span class="path">/pricing</span>
        </div>
    </div>
    <div class="center">
        <div class="segmented device-switch" aria-label="Device viewport">
            <button class="icon-button" type="button" data-viewport="desktop" aria-label="Desktop viewport" title="Desktop" aria-pressed="false">
                <span class="device-icon desktop-icon" aria-hidden="true"></span>
            </button>
            <button class="icon-button" type="button" data-viewport="tablet" aria-label="Tablet viewport" title="Tablet" aria-pressed="false">
                <span class="device-icon tablet-icon" aria-hidden="true"></span>
            </button>
            <button class="icon-button" type="button" data-viewport="mobile" aria-label="Mobile viewport" title="Mobile" aria-pressed="false">
                <span class="device-icon mobile-icon" aria-hidden="true"></span>
            </button>
        </div>
        <div class="segmented fit-switch" aria-label="Canvas fit">
            <button type="button" data-viewport="full" aria-pressed="false">Full</button>
            <button class="active" type="button" data-viewport="bleed" aria-pressed="true">Bleed</button>
        </div>
        <div class="segmented mode-switch" aria-label="Editor mode">
            <button class="active" type="button" data-editor-mode="edit" aria-pressed="true">Edit</button>
            <button type="button" data-editor-mode="view" aria-pressed="false">View</button>
        </div>
    </div>
    <div class="end">
        <button class="danger" type="button" data-action="delete">Delete</button>
        <button type="button" data-action="page-settings"><span class="settings-label">Page settings</span></button>
        <button class="primary" type="button" data-action="save"><span class="save-label">Save</span></button>
    </div>
</header>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/TopBar/style.css
  var style_default3 = `:host {
    display: block;
    min-width: 0;
    border-bottom: 1px solid var(--editor-v2-border);
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
}

* {
    box-sizing: border-box;
}

.topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 14px 0 12px;
}

.start,
.center,
.end {
    display: flex;
    align-items: center;
    min-width: 0;
}

.start {
    gap: 10px;
}

.center {
    justify-content: center;
    gap: 8px;
}

.end {
    justify-content: flex-end;
    gap: 8px;
}

.back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    border-radius: 6px;
    color: var(--editor-v2-muted);
    padding: 0 8px;
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
}

.back:hover {
    background: var(--editor-v2-surface-muted);
    color: var(--editor-v2-text);
}

.chevron {
    font-size: 18px;
    line-height: 1;
    transform: translateY(-1px);
}

.divider {
    width: 1px;
    height: 24px;
    background: var(--editor-v2-border);
}

.title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
}

.name {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
}

.path {
    color: var(--editor-v2-muted);
    font-size: 12px;
    white-space: nowrap;
}

.segmented {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface-muted);
    padding: 3px;
}

button {
    font: inherit;
    min-height: 28px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-muted);
    padding: 0 8px;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
}

.segmented button {
    min-width: 54px;
}

.device-switch button {
    min-width: 34px;
    width: 34px;
    padding: 0;
}

.fit-switch button {
    min-width: 56px;
}

.mode-switch button {
    min-width: 54px;
}

.device-icon {
    display: block;
    margin: 0 auto;
    border: 1.5px solid currentColor;
    border-radius: 3px;
    position: relative;
}

.desktop-icon {
    width: 17px;
    height: 11px;
}

.desktop-icon::before {
    content: "";
    position: absolute;
    left: 5px;
    right: 5px;
    bottom: -4px;
    height: 3px;
    border-bottom: 1.5px solid currentColor;
}

.tablet-icon {
    width: 13px;
    height: 17px;
    border-radius: 4px;
}

.mobile-icon {
    width: 10px;
    height: 17px;
    border-radius: 4px;
}

button:hover {
    border-color: var(--editor-v2-border);
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
}

.segmented button.active {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    box-shadow: 0 1px 2px rgba(16, 24, 21, .08);
}

.save-state {
    color: var(--editor-v2-muted);
    font-size: 11px;
    white-space: nowrap;
}

.dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    border-radius: 999px;
    background: var(--editor-v2-success);
    vertical-align: 1px;
}

.primary {
    border-color: var(--editor-v2-accent);
    background: var(--editor-v2-accent);
    color: #fff;
    padding: 0 11px;
}

.primary:hover {
    border-color: var(--editor-v2-accent);
    background: var(--editor-v2-accent);
    color: #fff;
}

.danger {
    color: var(--editor-v2-danger, #b42318);
}

.danger:hover {
    border-color: color-mix(in srgb, var(--editor-v2-danger, #b42318) 35%, transparent);
    background: color-mix(in srgb, var(--editor-v2-danger, #b42318) 10%, transparent);
    color: var(--editor-v2-danger, #b42318);
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/TopBar/TopBar.ts
  var template = document.createElement("template");
  template.innerHTML = `<style>${String(style_default3)}</style>${String(template_default4)}`;
  var TOPBAR_VIEWPORT_CHANGE_EVENT = "editor-v2:viewport-change";
  var TOPBAR_EDITOR_MODE_CHANGE_EVENT = "editor-v2:editor-mode-change";
  var TOPBAR_SAVE_EVENT = "editor-v2:save";
  var TOPBAR_DELETE_EVENT = "editor-v2:topbar-delete-document";
  var TOPBAR_PAGE_SETTINGS_EVENT = "editor-v2:page-settings";

  class TopBar extends HTMLElement {
    _viewport = "bleed";
    _mode = "edit";
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }
    connectedCallback() {
      this.shadowRoot.addEventListener("click", this._onClick);
      this._syncButtons();
    }
    disconnectedCallback() {
      this.shadowRoot.removeEventListener("click", this._onClick);
    }
    get viewport() {
      return this._viewport;
    }
    set viewport(viewport) {
      this._setViewport(viewport, false);
    }
    get mode() {
      return this._mode;
    }
    set mode(mode) {
      this._setMode(mode, false);
    }
    set saveStatus(label) {
      const target = this.shadowRoot.querySelector(".save-label") ?? this.shadowRoot.querySelector('[data-action="save"]');
      if (target)
        target.textContent = label;
    }
    setPageTitle(title, path) {
      this.shadowRoot.querySelector(".name").textContent = title;
      this.shadowRoot.querySelector(".path").textContent = path;
    }
    setNavigation(input) {
      const back = this.shadowRoot.querySelector(".back");
      back.setAttribute("href", input.backHref);
      this.shadowRoot.querySelector(".back-label").textContent = input.backLabel;
      this.shadowRoot.querySelector(".settings-label").textContent = input.settingsLabel;
    }
    _onClick = (event) => {
      const button = event.target?.closest("button");
      if (!button)
        return;
      const viewport = button.dataset.viewport;
      if (viewport) {
        this._setViewport(viewport, true);
        return;
      }
      const mode = button.dataset.editorMode;
      if (mode) {
        this._setMode(mode, true);
        return;
      }
      if (button.dataset.action === "save") {
        this.dispatchEvent(new CustomEvent(TOPBAR_SAVE_EVENT, {
          bubbles: true,
          composed: true
        }));
      } else if (button.dataset.action === "delete") {
        this.dispatchEvent(new CustomEvent(TOPBAR_DELETE_EVENT, {
          bubbles: true,
          composed: true
        }));
      } else if (button.dataset.action === "page-settings") {
        this.dispatchEvent(new CustomEvent(TOPBAR_PAGE_SETTINGS_EVENT, {
          bubbles: true,
          composed: true
        }));
      }
    };
    _setViewport(viewport, emit) {
      if (this._viewport === viewport)
        return;
      this._viewport = viewport;
      this._syncButtons();
      if (!emit)
        return;
      this._emitViewportChange();
    }
    _setMode(mode, emit) {
      if (this._mode === mode)
        return;
      this._mode = mode;
      this._syncButtons();
      if (!emit)
        return;
      this.dispatchEvent(new CustomEvent(TOPBAR_EDITOR_MODE_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail: { mode }
      }));
    }
    _syncButtons() {
      this._syncButtonGroup("[data-viewport]", "viewport", this._viewport);
      this._syncButtonGroup("[data-editor-mode]", "editorMode", this._mode);
    }
    _syncButtonGroup(selector, dataKey, value) {
      for (const button of Array.from(this.shadowRoot.querySelectorAll(selector))) {
        const isActive = button.dataset[dataKey] === value;
        button.classList.toggle("active", isActive);
        button.ariaPressed = String(isActive);
      }
    }
    _emitViewportChange() {
      this.dispatchEvent(new CustomEvent(TOPBAR_VIEWPORT_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail: { viewport: this._viewport }
      }));
    }
  }
  if (!customElements.get("cms-editor-v2-topbar")) {
    customElements.define("cms-editor-v2-topbar", TopBar);
  }

  // ../../features/cms-editor-system-v2/src/components/Layout/Panel/template.html
  var template_default5 = `<aside class="panel">
    <div class="panel-head">
        <div class="title">
            <slot name="title"></slot>
        </div>
        <div class="action">
            <slot name="action"></slot>
        </div>
    </div>
    <div class="panel-body">
        <slot></slot>
    </div>
</aside>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/Panel/style.css
  var style_default4 = `:host {
    display: block;
    min-width: 0;
    min-height: 0;
    background: inherit;
}

:host([side="left"]) {
    border-right: 1px solid var(--editor-v2-border);
}

:host([side="right"]) {
    border-left: 1px solid var(--editor-v2-border);
}

* {
    box-sizing: border-box;
}

.panel {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
}

:host([has-header]) .panel {
    grid-template-rows: 44px minmax(0, 1fr);
}

.panel-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border-bottom: 1px solid var(--editor-v2-border);
    background: color-mix(in srgb, var(--editor-v2-surface) 82%, transparent);
}

:host(:not([has-header])) .panel-head {
    display: none;
}

.title {
    min-width: 0;
    color: var(--editor-v2-muted);
    font-size: 11px;
    font-weight: 750;
    letter-spacing: .06em;
    text-transform: uppercase;
}

.action {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
}

.panel-body {
    min-height: 0;
    overflow: auto;
    scrollbar-color: transparent transparent;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    background: transparent;
    padding-bottom: 12px;
}

.panel-body:hover {
    scrollbar-color: color-mix(in srgb, var(--editor-v2-muted) 42%, transparent) transparent;
}

.panel-body::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.panel-body::-webkit-scrollbar-track {
    background: transparent;
}

.panel-body::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: transparent;
}

.panel-body:hover::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--editor-v2-muted) 38%, transparent);
}

.panel-body::-webkit-scrollbar-button {
    display: none;
    width: 0;
    height: 0;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/Panel/Panel.ts
  var template2 = document.createElement("template");
  template2.innerHTML = `<style>${String(style_default4)}</style>${String(template_default5)}`;

  class Panel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template2.content.cloneNode(true));
    }
    connectedCallback() {
      this._syncHeaderVisibility();
    }
    _syncHeaderVisibility() {
      const title = this.querySelector("[slot='title']");
      const action = this.querySelector("[slot='action']");
      this.toggleAttribute("has-header", Boolean(title || action));
    }
  }
  if (!customElements.get("cms-editor-v2-panel")) {
    customElements.define("cms-editor-v2-panel", Panel);
  }

  // ../../features/cms-content/src/interfaces/Editor/Editor.ts
  class Editor {
    target;
    constructor(target) {
      this.target = target;
    }
    settings() {
      return [];
    }
    dataScopes() {
      return [];
    }
    contentSlots() {
      return [];
    }
    textCapability() {
      return null;
    }
    states() {
      return [];
    }
    structureMode() {
      return "editable";
    }
    getSettings() {
      return this.settings();
    }
    addSettings(_settings) {}
    getDataScopes() {
      return this.dataScopes();
    }
    declareDataScope(_scope) {}
    getContentSlots() {
      return this.contentSlots();
    }
    addContentSlots(_slots) {}
    getTextCapability() {
      return this.textCapability();
    }
    setTextCapability(_capability) {}
    getStates() {
      return this.states();
    }
    addStates(_states) {}
    getChildren() {
      return [];
    }
    getStructureMode() {
      return this.structureMode();
    }
    mountEditor() {}
    unmountEditor() {}
  }
  // ../../features/cms-content/src/interfaces/Editor/BindingSyntax.ts
  var CMS_BINDING_ATTRIBUTES = {
    condition: "cms-condition",
    repeat: "cms-repeat",
    source: "cms-source",
    slot: "cms-slot"
  };
  var CMS_SOURCE_STATES = ["loaded", "loading", "empty", "error"];
  var CMS_SOURCE_SLOT_VALUES = ["loading", "empty", "error"];
  var SOURCE_ALIAS_PATTERN = /^\s*([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
  var REPEAT_ALIAS_PATTERN = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
  function asInterpolation(expression) {
    return `{{ ${expression.trim()} }}`;
  }
  function asSource(source) {
    if (typeof source === "string")
      return source.trim();
    const url = sourceUrlWithParams(source.url, source.params);
    const alias = source.alias?.trim();
    return alias ? `${url} as ${alias}` : url;
  }
  function parseSource(value) {
    const match = SOURCE_ALIAS_PATTERN.exec(value);
    if (match) {
      const url2 = match[1].trim();
      return url2 ? { url: url2, alias: match[2] } : null;
    }
    const url = value.trim();
    return url ? { url } : null;
  }
  function asRepeat(binding) {
    const path = binding.path.trim();
    const alias = binding.alias?.trim();
    return alias ? `${path} as ${alias}` : path;
  }
  function parseRepeat(value) {
    const match = REPEAT_ALIAS_PATTERN.exec(value);
    if (match) {
      return {
        path: match[1].trim(),
        alias: match[2]
      };
    }
    const path = value.trim();
    return path ? { path } : null;
  }
  function isCmsSourceSlotValue(value) {
    return CMS_SOURCE_SLOT_VALUES.includes(value ?? "");
  }
  function sourceStateFromElement(element) {
    const value = element.getAttribute(CMS_BINDING_ATTRIBUTES.slot);
    return isCmsSourceSlotValue(value) ? value : "loaded";
  }
  function applySourceState(element, state) {
    if (state === "loaded") {
      element.removeAttribute(CMS_BINDING_ATTRIBUTES.slot);
      return;
    }
    element.setAttribute(CMS_BINDING_ATTRIBUTES.slot, state);
  }
  function sourceUrlWithParams(rawUrl, params) {
    const url = rawUrl.trim();
    if (!params)
      return url;
    const entries = Object.entries(params).filter((entry) => {
      const [name, value] = entry;
      if (name.trim() === "" || value === null || value === undefined)
        return false;
      if (value.from === "queryParam")
        return value.name.trim() !== "";
      return String(value.value).trim() !== "";
    });
    if (entries.length === 0)
      return url;
    const hashIndex = url.indexOf("#");
    const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
    const separator = beforeHash.endsWith("?") || beforeHash.endsWith("&") ? "" : beforeHash.includes("?") ? "&" : "?";
    const query = entries.map(([name, value]) => `${encodeURIComponent(name)}=${encodeSourceParamValue(value)}`).join("&");
    return `${beforeHash}${separator}${query}${hash}`;
  }
  function encodeSourceParamValue(value) {
    if (value.from === "queryParam")
      return `#{${value.name.trim()}}`;
    return encodeURIComponent(String(value.value).trim());
  }
  // ../../features/cms-content/src/core/editor/EditorCatalog.ts
  function fallbackElementConstructor() {
    const constructor = globalThis.HTMLElement;
    if (!constructor) {
      throw new Error("Cannot create editor catalog entry without HTMLElement.");
    }
    return constructor;
  }
  function createEditorCatalogEntry(entry, defaults) {
    const tag = entry.tag ?? defaults.tag;
    const editor = entry.editor;
    if (!editor) {
      throw new Error(`Editor catalog entry for ${tag} is missing an editor constructor.`);
    }
    return {
      tag,
      label: entry.label ?? defaults.label,
      description: entry.description ?? defaults.description,
      icon: entry.icon,
      category: entry.category ?? defaults.category,
      subCategory: entry.subCategory,
      defaultContent: entry.defaultContent ?? defaults.defaultContent,
      bloc: entry.bloc ?? defaults.bloc ?? globalThis.customElements?.get(tag) ?? fallbackElementConstructor(),
      editor
    };
  }
  function mergeEditorCatalogs(...catalogs) {
    const byTag = new Map;
    for (const catalog of catalogs) {
      for (const entry of catalog) {
        byTag.set(entry.tag.toLowerCase(), entry);
      }
    }
    return [...byTag.values()];
  }
  // ../../features/cms-content/src/core/constants/snippet.ts
  var CMS_SNIPPET_TAG = "w13c-snippet";
  // ../../features/cms-editor-system-v2/src/components/Layout/DataSourcePicker/template.html
  var template_default6 = `<div class="backdrop" hidden>
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="data-source-picker-title">
        <header class="header">
            <div>
                <h2 id="data-source-picker-title">Add source</h2>
                <p class="subtitle"></p>
            </div>
            <button class="close" type="button" aria-label="Close">×</button>
        </header>
        <input class="search" type="search" placeholder="Search sources" />
        <div class="body">
            <aside class="providers" aria-label="Providers"></aside>
            <div class="sources" role="listbox" aria-label="Data sources"></div>
            <aside class="details"></aside>
            <aside class="binding"></aside>
        </div>
    </section>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/DataSourcePicker/style.css
  var style_default5 = `:host {
    display: contents;
}

* {
    box-sizing: border-box;
}

.backdrop {
    --source-picker-top-offset: min(8vh, 64px);

    position: fixed;
    inset: 0;
    z-index: 130;
    display: grid;
    place-items: start center;
    padding: var(--source-picker-top-offset) 24px 24px;
    background: color-mix(in srgb, black 20%, transparent);
}

.backdrop[hidden] {
    display: none;
}

.modal {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
    width: min(1120px, calc(100vw - 48px));
    height: min(620px, calc(100vh - var(--source-picker-top-offset) - 24px));
    border: 1px solid var(--editor-v2-border);
    border-radius: 10px;
    background: var(--editor-v2-bg);
    box-shadow: 0 24px 70px color-mix(in srgb, black 18%, transparent);
    padding: 14px;
}

.header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
}

h2 {
    margin: 0;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 15px;
    font-weight: 780;
}

.subtitle {
    margin: 4px 0 0;
    color: var(--editor-v2-muted);
    font-size: 12px;
}

.close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
}

.close:hover {
    color: var(--editor-v2-text);
}

.search {
    width: 100%;
    height: 34px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    outline: none;
    padding: 0 10px;
}

.search:focus {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 52%, var(--editor-v2-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--editor-v2-accent) 12%, transparent);
}

.body {
    display: grid;
    grid-template-columns: minmax(150px, 190px) minmax(220px, 1fr) minmax(190px, 260px) minmax(220px, 300px);
    gap: 12px;
    min-height: 0;
}

.providers,
.sources,
.details,
.binding {
    min-height: 0;
    min-width: 0;
    overflow: auto;
}

.providers {
    display: grid;
    align-content: start;
    gap: 4px;
    border-right: 1px solid var(--editor-v2-border);
    padding-right: 12px;
}

.provider {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 0 8px;
    text-align: left;
    cursor: pointer;
}

.provider:hover {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
}

.provider[aria-pressed="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 28%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
}

.count {
    color: var(--editor-v2-subtle);
    font-size: 11px;
}

.sources {
    display: grid;
    align-content: start;
    gap: 7px;
}

.source {
    display: grid;
    gap: 5px;
    width: 100%;
    min-height: 78px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    text-align: left;
    padding: 10px;
    cursor: pointer;
}

.source:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 34%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 5%, var(--editor-v2-surface));
}

.source[aria-selected="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 56%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
}

.name {
    overflow: hidden;
    color: var(--editor-v2-text);
    font-size: 12px;
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.description {
    display: -webkit-box;
    overflow: hidden;
    color: var(--editor-v2-muted);
    font-size: 11px;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.url {
    color: var(--editor-v2-subtle);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 10px;
    overflow-wrap: anywhere;
}

.details,
.binding {
    display: grid;
    gap: 12px;
    border-left: 1px solid var(--editor-v2-border);
    padding-left: 12px;
}

.details {
    align-content: start;
}

.binding {
    grid-template-rows: minmax(0, 1fr) auto;
    overflow-x: hidden;
}

.binding-scroll {
    display: grid;
    align-content: start;
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
}

.binding-scroll > .config-heading {
    padding-bottom: 2px;
    border-bottom: 1px solid var(--editor-v2-border);
}

.binding-footer {
    display: grid;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--editor-v2-border);
}

.details-eyebrow {
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

.details h3 {
    margin: 0;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 18px;
    font-weight: 780;
}

.details p {
    margin: 0;
    color: var(--editor-v2-muted);
    font-size: 12px;
    line-height: 1.45;
}

.binding-config {
    display: grid;
    gap: 12px;
    min-width: 0;
}

.binding-config label {
    display: grid;
    gap: 5px;
    color: var(--editor-v2-muted);
    font-size: 11px;
    font-weight: 700;
}

.source-alias,
.param-value,
.param-mode {
    width: 100%;
    min-width: 0;
    height: 32px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 6px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    outline: none;
    padding: 0 9px;
}

.source-alias:focus,
.param-value:focus,
.param-mode:focus {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 52%, var(--editor-v2-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--editor-v2-accent) 12%, transparent);
}

.config-heading {
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

.param-row {
    display: grid;
    gap: 8px;
    min-width: 0;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface);
    padding: 10px;
}

.param-header {
    display: grid;
    gap: 5px;
}

.param-controls {
    display: grid;
    gap: 7px;
}

.param-header {
    color: var(--editor-v2-text);
    font-size: 12px;
    font-weight: 760;
}

.param-name {
    min-width: 0;
    overflow-wrap: anywhere;
}

.param-meta {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
}

.param-meta span {
    border: 1px solid color-mix(in srgb, var(--editor-v2-accent) 18%, var(--editor-v2-border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--editor-v2-accent) 5%, var(--editor-v2-bg));
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 720;
    line-height: 1;
    padding: 3px 5px;
}

.param-meta span:first-child {
    text-transform: uppercase;
}

.param-meta span:last-child {
    color: var(--editor-v2-muted);
}

.param-row p {
    color: var(--editor-v2-muted);
    font-size: 11px;
    line-height: 1.35;
}

.param-mode,
.param-value {
    background: var(--editor-v2-bg);
}

.fields {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 8px;
    color: var(--editor-v2-text);
    font-size: 11px;
    line-height: 1.35;
    padding: 3px 0 3px calc(var(--field-depth, 0) * 12px);
}

.field-path {
    min-width: 0;
    overflow-wrap: anywhere;
}

.field-children {
    display: grid;
    grid-column: 1 / -1;
    gap: 2px;
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
}

.field-type {
    color: var(--editor-v2-muted);
    font-size: 10px;
}

.insert {
    margin-top: 2px;
    min-height: 32px;
    border: 1px solid var(--editor-v2-accent);
    border-radius: 7px;
    background: var(--editor-v2-accent);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 730;
    cursor: pointer;
}

.remove-source {
    min-height: 32px;
    border: 1px solid color-mix(in srgb, #b42318 36%, var(--editor-v2-border));
    border-radius: 7px;
    background: transparent;
    color: #b42318;
    font: inherit;
    font-size: 12px;
    font-weight: 730;
    cursor: pointer;
}

.remove-source:hover {
    background: color-mix(in srgb, #b42318 7%, transparent);
}

.details-empty,
.empty {
    color: var(--editor-v2-muted);
    font-size: 12px;
    line-height: 1.45;
}

.empty {
    padding: 24px 0;
    text-align: center;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/DataSourcePicker/DataSourcePicker.ts
  var template3 = document.createElement("template");
  template3.innerHTML = `<style>${String(style_default5)}</style>${String(template_default6)}`;
  var DATA_SOURCE_PICKER_SELECT_EVENT = "editor-v2:data-source-select";
  var DATA_SOURCE_PICKER_REMOVE_EVENT = "editor-v2:data-source-remove";

  class DataSourcePicker extends HTMLElement {
    _sources = [];
    _activeProvider = "";
    _activeSource = null;
    _canRemove = false;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template3.content.cloneNode(true));
    }
    connectedCallback() {
      this.closeButton.addEventListener("click", this.close);
      this.backdrop.addEventListener("click", this._onBackdropClick);
      this.search.addEventListener("input", this._onSearchInput);
      this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }
    disconnectedCallback() {
      this.closeButton.removeEventListener("click", this.close);
      this.backdrop.removeEventListener("click", this._onBackdropClick);
      this.search.removeEventListener("input", this._onSearchInput);
      this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }
    open(sources, contextLabel, options = {}) {
      this._sources = sources.map((source) => ({
        ...source,
        fields: [...source.fields]
      }));
      this._activeProvider = this._providerGroups()[0]?.key ?? "";
      this._activeSource = null;
      this._canRemove = options.canRemove === true;
      this.subtitle.textContent = contextLabel ? `Choose a data source for ${contextLabel}.` : "Choose a data source.";
      this.search.value = "";
      this.backdrop.hidden = false;
      this._render();
      this.search.focus();
    }
    close = () => {
      this.backdrop.hidden = true;
    };
    _render() {
      this._renderProviders();
      this._renderSources();
      this._renderDetails();
      this._renderBinding();
    }
    _renderProviders() {
      this.providers.replaceChildren();
      const groups = this._providerGroups();
      if (groups.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No sources available.";
        this.providers.append(empty);
        return;
      }
      for (const group of groups) {
        const button = document.createElement("button");
        button.className = "provider";
        button.type = "button";
        button.ariaPressed = String(group.key === this._activeProvider);
        button.innerHTML = `<span>${this._escape(group.label)}</span><span class="count">${group.count}</span>`;
        button.addEventListener("click", () => {
          this._activeProvider = group.key;
          this._activeSource = null;
          this._render();
        });
        this.providers.append(button);
      }
    }
    _renderSources() {
      this.sourcesList.replaceChildren();
      const sources = this._visibleSources();
      if (sources.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No matching sources.";
        this.sourcesList.append(empty);
        return;
      }
      if (!this._activeSource || !sources.includes(this._activeSource)) {
        this._activeSource = sources[0] ?? null;
      }
      for (const source of sources) {
        const button = document.createElement("button");
        button.className = "source";
        button.type = "button";
        button.ariaSelected = String(source === this._activeSource);
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = source.label;
        const description = document.createElement("span");
        description.className = "description";
        description.textContent = source.description ?? "No description.";
        const url = document.createElement("span");
        url.className = "url";
        url.textContent = source.url;
        button.append(name, description, url);
        button.addEventListener("click", () => {
          this._activeSource = source;
          this._renderSources();
          this._renderDetails();
          this._renderBinding();
        });
        button.addEventListener("dblclick", () => this._select(source));
        this.sourcesList.append(button);
      }
    }
    _renderDetails() {
      this.details.replaceChildren();
      if (!this._activeSource) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select a source to inspect its schema.";
        this.details.append(empty);
        return;
      }
      const heading4 = document.createElement("div");
      heading4.className = "details-eyebrow";
      heading4.textContent = "Response fields";
      this.details.append(heading4, this._renderFields(this._activeSource.fields));
    }
    _renderBinding() {
      this.binding.replaceChildren();
      if (!this._activeSource) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select a source to configure its binding.";
        this.binding.append(empty);
        return;
      }
      const title = document.createElement("div");
      title.className = "config-heading";
      title.textContent = "Binding";
      const config = this._renderBindingConfig(this._activeSource);
      const scroll = document.createElement("div");
      scroll.className = "binding-scroll";
      scroll.append(title, config);
      const insert = document.createElement("button");
      insert.className = "insert";
      insert.type = "button";
      insert.textContent = "Use source";
      insert.addEventListener("click", () => this._select(this._activeSource));
      const footer = document.createElement("footer");
      footer.className = "binding-footer";
      if (this._canRemove) {
        const remove = document.createElement("button");
        remove.className = "remove-source";
        remove.type = "button";
        remove.textContent = "Remove source";
        remove.addEventListener("click", this._remove);
        footer.append(remove);
      }
      footer.append(insert);
      this.binding.append(scroll, footer);
    }
    _renderBindingConfig(source) {
      const section = document.createElement("section");
      section.className = "binding-config";
      const aliasLabel = document.createElement("label");
      aliasLabel.textContent = "Alias";
      const alias = document.createElement("input");
      alias.className = "source-alias";
      alias.value = "data";
      alias.placeholder = "data";
      aliasLabel.append(alias);
      section.append(aliasLabel);
      const params = source.params ?? [];
      if (params.length === 0)
        return section;
      const heading4 = document.createElement("div");
      heading4.className = "config-heading";
      heading4.textContent = "Request params";
      section.append(heading4);
      for (const param of params) {
        const row = document.createElement("div");
        row.className = "param-row";
        row.dataset.paramName = param.name;
        const header = document.createElement("div");
        header.className = "param-header";
        const name = document.createElement("span");
        name.className = "param-name";
        name.textContent = param.required ? `${param.name} *` : param.name;
        const meta = document.createElement("span");
        meta.className = "param-meta";
        const location2 = document.createElement("span");
        location2.textContent = param.in;
        const type = document.createElement("span");
        type.textContent = param.type ?? "unknown";
        meta.append(location2, type);
        header.append(name, meta);
        const description = document.createElement("p");
        description.textContent = param.description ?? "";
        description.hidden = !param.description;
        const controls = document.createElement("div");
        controls.className = "param-controls";
        const mode = document.createElement("select");
        mode.className = "param-mode";
        const queryParamOption = document.createElement("option");
        queryParamOption.value = "queryParam";
        queryParamOption.textContent = "Query param";
        const rawOption = document.createElement("option");
        rawOption.value = "raw";
        rawOption.textContent = "Raw value";
        mode.append(queryParamOption, rawOption);
        const value = document.createElement("input");
        value.className = "param-value";
        value.placeholder = param.name;
        controls.append(mode, value);
        row.append(header, description, controls);
        section.append(row);
      }
      return section;
    }
    _renderFields(fields) {
      const list = document.createElement("ul");
      list.className = "fields";
      for (const field of fields)
        list.append(this._renderField(field, 0));
      if (list.children.length === 0) {
        const empty = document.createElement("p");
        empty.className = "details-empty";
        empty.textContent = "No schema fields declared.";
        return empty;
      }
      return list;
    }
    _renderField(field, depth) {
      const item = document.createElement("li");
      item.className = "field";
      item.style.setProperty("--field-depth", String(depth));
      const path = document.createElement("span");
      path.className = "field-path";
      path.textContent = field.path;
      const type = document.createElement("span");
      type.className = "field-type";
      type.textContent = field.type ?? "unknown";
      item.append(path, type);
      if (field.children?.length) {
        const children = document.createElement("ul");
        children.className = "field-children";
        for (const child of field.children)
          children.append(this._renderField(child, depth + 1));
        item.append(children);
      }
      return item;
    }
    _select(source) {
      this.dispatchEvent(new CustomEvent(DATA_SOURCE_PICKER_SELECT_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          source,
          binding: this._sourceBinding(source)
        }
      }));
      this.close();
    }
    _remove = () => {
      this.dispatchEvent(new CustomEvent(DATA_SOURCE_PICKER_REMOVE_EVENT, {
        bubbles: true,
        composed: true
      }));
      this.close();
    };
    _sourceBinding(source) {
      const alias = this.shadowRoot.querySelector(".source-alias")?.value.trim();
      const params = {};
      for (const row of Array.from(this.shadowRoot.querySelectorAll(".param-row"))) {
        const name = row.dataset.paramName;
        const modeElement = row.querySelector(".param-mode");
        const mode = modeElement?.getAttribute("value") ?? modeElement?.value;
        const rawValue = row.querySelector(".param-value")?.value.trim();
        if (!name || !rawValue)
          continue;
        params[name] = mode === "raw" ? { from: "raw", value: rawValue } : { from: "queryParam", name: rawValue };
      }
      return {
        url: source.url,
        ...alias ? { alias } : {},
        ...Object.keys(params).length ? { params } : {}
      };
    }
    _providerGroups() {
      const groups = new Map;
      for (const source of this._filteredSources()) {
        const key = source.provider ?? "default";
        const current = groups.get(key) ?? {
          key,
          label: source.providerLabel ?? source.provider ?? "Sources",
          count: 0
        };
        current.count += 1;
        groups.set(key, current);
      }
      return [...groups.values()];
    }
    _visibleSources() {
      return this._filteredSources().filter((source) => (source.provider ?? "default") === this._activeProvider);
    }
    _filteredSources() {
      const query = this.search.value.trim().toLowerCase();
      if (!query)
        return this._sources;
      return this._sources.filter((source) => [
        source.label,
        source.description,
        source.provider,
        source.providerLabel,
        source.url
      ].some((value) => value?.toLowerCase().includes(query)));
    }
    _escape(value) {
      return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }
    _onBackdropClick = (event) => {
      if (event.target === this.backdrop)
        this.close();
    };
    _onSearchInput = () => {
      this._activeProvider = this._providerGroups()[0]?.key ?? "";
      this._activeSource = null;
      this._render();
    };
    _onKeydown = (event) => {
      if (!this.backdrop.hidden && event.key === "Escape")
        this.close();
    };
    get backdrop() {
      return this.shadowRoot.querySelector(".backdrop");
    }
    get closeButton() {
      return this.shadowRoot.querySelector(".close");
    }
    get subtitle() {
      return this.shadowRoot.querySelector(".subtitle");
    }
    get search() {
      return this.shadowRoot.querySelector(".search");
    }
    get providers() {
      return this.shadowRoot.querySelector(".providers");
    }
    get sourcesList() {
      return this.shadowRoot.querySelector(".sources");
    }
    get details() {
      return this.shadowRoot.querySelector(".details");
    }
    get binding() {
      return this.shadowRoot.querySelector(".binding");
    }
  }
  if (!customElements.get("cms-editor-v2-data-source-picker")) {
    customElements.define("cms-editor-v2-data-source-picker", DataSourcePicker);
  }

  // ../../features/cms-editor-system-v2/src/components/Layout/BlockPickerModal/template.html
  var template_default7 = `<div class="backdrop" hidden>
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="block-picker-title">
        <header class="header">
            <div>
                <h2 id="block-picker-title">Add child</h2>
                <p class="subtitle"></p>
            </div>
            <button class="close" type="button" aria-label="Close">×</button>
        </header>
        <input class="search" type="search" placeholder="Search content" />
        <div class="slot-tabs" role="tablist" aria-label="Content slots"></div>
        <div class="body">
            <aside class="sidebar">
                <div class="sidebar-section">
                    <div class="sidebar-title">Sources</div>
                    <div class="sources"></div>
                </div>
                <div class="sidebar-section">
                    <div class="sidebar-title">Categories</div>
                    <div class="categories"></div>
                </div>
            </aside>
            <div class="results" role="listbox" aria-label="Available content"></div>
            <aside class="details"></aside>
        </div>
    </section>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/BlockPickerModal/style.css
  var style_default6 = `:host {
    display: contents;
}

* {
    box-sizing: border-box;
}

.backdrop {
    --block-picker-top-offset: min(8vh, 64px);

    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: start center;
    padding: var(--block-picker-top-offset) 24px 24px;
    background: color-mix(in srgb, black 20%, transparent);
}

.backdrop[hidden] {
    display: none;
}

.modal {
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    gap: 12px;
    width: min(1040px, calc(100vw - 48px));
    height: min(720px, calc(100vh - var(--block-picker-top-offset) - 24px));
    border: 1px solid var(--editor-v2-border);
    border-radius: 10px;
    background: var(--editor-v2-bg);
    box-shadow: 0 24px 70px color-mix(in srgb, black 18%, transparent);
    padding: 14px;
}

.header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
}

h2 {
    margin: 0;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 15px;
    font-weight: 780;
}

.subtitle {
    margin: 4px 0 0;
    color: var(--editor-v2-muted);
    font-size: 12px;
}

.close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
}

.close:hover {
    color: var(--editor-v2-text);
}

.search {
    width: 100%;
    height: 34px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    outline: none;
    padding: 0 10px;
}

.search:focus {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 52%, var(--editor-v2-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--editor-v2-accent) 12%, transparent);
}

.slot-tabs {
    display: flex;
    gap: 5px;
    overflow-x: auto;
    border-bottom: 1px solid var(--editor-v2-border);
    padding-bottom: 8px;
}

.tab {
    flex: 0 0 auto;
    height: 28px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 999px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 11px;
    font-weight: 720;
    padding: 0 10px;
    cursor: pointer;
}

.tab[aria-selected="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 42%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 9%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
}

.tab:disabled {
    opacity: .46;
    cursor: not-allowed;
}

.body {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr) 280px;
    gap: 12px;
    min-height: 0;
}

.sidebar,
.details,
.results {
    min-height: 0;
    overflow: auto;
}

.sidebar {
    display: grid;
    align-content: start;
    gap: 18px;
    border-right: 1px solid var(--editor-v2-border);
    padding-right: 12px;
}

.sidebar-section {
    display: grid;
    gap: 7px;
}

.sidebar-title {
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

.sources,
.categories {
    display: grid;
    gap: 3px;
}

.filter {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    padding: 0 7px;
    text-align: left;
    cursor: pointer;
}

.filter:hover {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
}

.filter[aria-pressed="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 28%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
}

.filter:disabled {
    opacity: .48;
    cursor: not-allowed;
}

.filter:disabled:hover {
    background: transparent;
    color: var(--editor-v2-muted);
}

.count {
    color: var(--editor-v2-subtle);
    font-size: 11px;
}

.results {
    display: grid;
    align-content: start;
    gap: 7px;
    padding-right: 2px;
}

.block {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 10px;
    min-height: 76px;
    width: 100%;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    text-align: left;
    padding: 10px;
    cursor: pointer;
}

.block:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 34%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 5%, var(--editor-v2-surface));
}

.block[aria-selected="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 56%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
}

.icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-bg);
    color: var(--editor-v2-accent);
    font-size: 11px;
    font-weight: 780;
}

.name {
    display: block;
    overflow: hidden;
    color: var(--editor-v2-text);
    font-size: 12px;
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.description {
    display: -webkit-box;
    margin-top: 3px;
    overflow: hidden;
    color: var(--editor-v2-muted);
    font-size: 11px;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}

.category {
    display: block;
    margin-top: 6px;
    color: var(--editor-v2-subtle);
    font-size: 10px;
    font-weight: 720;
    text-transform: uppercase;
}

.details {
    display: grid;
    align-content: start;
    gap: 12px;
    border-left: 1px solid var(--editor-v2-border);
    padding-left: 12px;
}

.preview {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 10;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background:
        linear-gradient(135deg, color-mix(in srgb, var(--editor-v2-accent) 8%, transparent), transparent 52%),
        var(--editor-v2-surface);
}

.preview-icon {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border: 1px solid color-mix(in srgb, var(--editor-v2-accent) 28%, var(--editor-v2-border));
    border-radius: 10px;
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
    font-size: 15px;
    font-weight: 780;
}

.details-eyebrow {
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

.details h3 {
    margin: 0;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 18px;
    font-weight: 780;
}

.details p {
    margin: 0;
    color: var(--editor-v2-muted);
    font-size: 12px;
    line-height: 1.45;
}

dl {
    display: grid;
    gap: 8px;
    margin: 0;
}

dl > div {
    display: grid;
    gap: 2px;
}

dt {
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

dd {
    margin: 0;
    color: var(--editor-v2-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    overflow-wrap: anywhere;
}

.insert {
    min-height: 32px;
    border: 1px solid var(--editor-v2-accent);
    border-radius: 7px;
    background: var(--editor-v2-accent);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 730;
    cursor: pointer;
}

.details-empty,
.empty {
    color: var(--editor-v2-muted);
    font-size: 12px;
    line-height: 1.45;
}

.empty {
    padding: 24px 0;
    text-align: center;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/BlockPickerModal/BlockPickerModal.ts
  var template4 = document.createElement("template");
  template4.innerHTML = `<style>${String(style_default6)}</style>${String(template_default7)}`;
  var BLOCK_PICKER_SELECT_EVENT = "editor-v2:block-picker-select";

  class BlockPickerModal extends HTMLElement {
    _groups = [];
    _activeSlotKey = "";
    _activeSource = "block";
    _activeCategory = "";
    _activeOption = null;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template4.content.cloneNode(true));
    }
    connectedCallback() {
      this.closeButton.addEventListener("click", this.close);
      this.backdrop.addEventListener("click", this._onBackdropClick);
      this.search.addEventListener("input", this._onSearchInput);
      this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }
    disconnectedCallback() {
      this.closeButton.removeEventListener("click", this.close);
      this.backdrop.removeEventListener("click", this._onBackdropClick);
      this.search.removeEventListener("input", this._onSearchInput);
      this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }
    open(groups, contextLabel) {
      this._groups = groups.map((group) => ({
        ...group,
        options: group.options.map((option) => this._normalizeOption(option))
      }));
      this._activeSlotKey = this._firstEnabledGroup()?.slot ?? "";
      this._activeSource = "block";
      this._activeCategory = "";
      this._activeOption = null;
      this.subtitle.textContent = contextLabel ? `Choose content to add inside ${contextLabel}.` : "Choose content to add.";
      this.search.value = "";
      this.backdrop.hidden = false;
      this._render();
      this.search.focus();
    }
    close = () => {
      this.backdrop.hidden = true;
    };
    _onSearchInput = () => {
      this._activeOption = null;
      this._renderEntries();
    };
    _render = () => {
      this._renderTabs();
      this._renderSidebar();
      this._renderEntries();
    };
    _renderEntries() {
      const query = this.search.value.trim().toLowerCase();
      const group = this._activeGroup();
      const options = group?.options.filter((option) => this._isVisibleOption(option, query)) ?? [];
      this.results.replaceChildren();
      if (group?.disabledReason) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = group.disabledReason;
        this.results.append(empty);
        this._activeOption = null;
        this._renderDetails();
        return;
      }
      if (options.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No content available";
        this.results.append(empty);
        this._activeOption = null;
        this._renderDetails();
        return;
      }
      if (!this._activeOption || !options.includes(this._activeOption)) {
        this._activeOption = options[0] ?? null;
      }
      for (const option of options) {
        this.results.append(this._renderOption(option));
      }
      this._renderDetails();
    }
    _renderSidebar() {
      this.sources.replaceChildren();
      this.categories.replaceChildren();
      this.sources.append(this._filterButton("Blocks", this._activeSource === "block", () => {
        this._activeSource = "block";
        this._activeCategory = "";
        this._renderSidebar();
        this._renderEntries();
      }, this._sourceCount("block")), this._filterButton("Templates", this._activeSource === "template", () => {
        this._activeSource = "template";
        this._activeCategory = "";
        this._activeOption = null;
        this._renderSidebar();
        this._renderEntries();
      }, this._sourceCount("template"), this._sourceCount("template") === 0), this._filterButton("Snippets", this._activeSource === "snippet", () => {
        this._activeSource = "snippet";
        this._activeCategory = "";
        this._activeOption = null;
        this._renderSidebar();
        this._renderEntries();
      }, this._sourceCount("snippet"), this._sourceCount("snippet") === 0), this._filterButton("Media", this._activeSource === "media", () => {
        if (this._selectSingleSourceOption("media"))
          return;
        this._activeSource = "media";
        this._activeCategory = "";
        this._activeOption = null;
        this._renderSidebar();
        this._renderEntries();
      }, this._sourceCount("media"), this._sourceCount("media") === 0));
      const categories = this._categories();
      this.categories.append(this._filterButton("All", this._activeCategory === "", () => {
        this._activeCategory = "";
        this._renderSidebar();
        this._renderEntries();
      }, this._sourceCount(this._activeSource)));
      for (const category of categories) {
        this.categories.append(this._filterButton(category, this._activeCategory === category, () => {
          this._activeCategory = category;
          this._renderSidebar();
          this._renderEntries();
        }, this._categoryCount(category)));
      }
    }
    _filterButton(label, active, onClick, count, disabled = false) {
      const button = document.createElement("button");
      button.className = "filter";
      button.type = "button";
      button.disabled = disabled;
      button.ariaPressed = String(active);
      button.addEventListener("click", () => {
        if (button.disabled)
          return;
        onClick();
      });
      const text = document.createElement("span");
      text.textContent = label;
      const badge = document.createElement("span");
      badge.className = "count";
      badge.textContent = String(count);
      button.append(text, badge);
      return button;
    }
    _renderDetails() {
      this.details.replaceChildren();
      const option = this._activeOption;
      if (!option) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select content to see details.";
        this.details.append(empty);
        return;
      }
      const item = this._optionItem(option);
      const eyebrow = document.createElement("div");
      eyebrow.className = "details-eyebrow";
      eyebrow.textContent = this._sourceLabel(item.kind);
      const title = document.createElement("h3");
      title.textContent = this._itemLabel(item);
      const description = document.createElement("p");
      description.textContent = this._itemDescription(item);
      const preview = document.createElement("div");
      preview.className = "preview";
      const previewIcon = document.createElement("span");
      previewIcon.className = "preview-icon";
      previewIcon.textContent = this._iconText(item);
      preview.append(previewIcon);
      const meta = document.createElement("dl");
      meta.append(this._metaRow("Source", this._sourceLabel(item.kind)), this._metaRow("Handle", this._itemHandle(item)), this._metaRow("Slot", option.slotLabel), this._metaRow("Category", this._categoryLabel(option)));
      const insert = document.createElement("button");
      insert.className = "insert";
      insert.type = "button";
      insert.textContent = "Insert";
      insert.addEventListener("click", () => this._selectOption(option));
      this.details.append(preview, eyebrow, title, description, meta, insert);
    }
    _metaRow(label, value) {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      wrapper.append(term, detail);
      return wrapper;
    }
    _renderTabs() {
      this.tabs.replaceChildren();
      for (const group of this._groups) {
        const button = document.createElement("button");
        const slotKey = group.slot ?? "";
        button.className = "tab";
        button.type = "button";
        button.role = "tab";
        button.textContent = group.label;
        button.disabled = Boolean(group.disabledReason);
        button.ariaSelected = String(slotKey === this._activeSlotKey);
        if (group.disabledReason)
          button.title = group.disabledReason;
        button.addEventListener("click", () => {
          if (button.disabled)
            return;
          this._activeSlotKey = slotKey;
          this._activeCategory = "";
          this._activeOption = null;
          this._render();
        });
        this.tabs.append(button);
      }
    }
    _renderOption(option) {
      const button = document.createElement("button");
      button.className = "block";
      button.type = "button";
      button.ariaSelected = String(option === this._activeOption);
      button.addEventListener("click", () => {
        this._activeOption = option;
        this._renderEntries();
      });
      button.addEventListener("dblclick", () => this._selectOption(option));
      const item = this._optionItem(option);
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = this._iconText(item);
      const body = document.createElement("span");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = this._itemLabel(item);
      const description = document.createElement("span");
      description.className = "description";
      description.textContent = this._itemDescription(item);
      const category = document.createElement("span");
      category.className = "category";
      category.textContent = this._categoryLabel(option);
      body.append(name, description, category);
      button.append(icon, body);
      return button;
    }
    _selectOption(option) {
      this.dispatchEvent(new CustomEvent(BLOCK_PICKER_SELECT_EVENT, {
        bubbles: true,
        composed: true,
        detail: { option }
      }));
      this.close();
    }
    _isVisibleOption(option, query) {
      const item = this._optionItem(option);
      if (item.kind !== this._activeSource)
        return false;
      if (this._activeCategory && this._categoryLabel(option) !== this._activeCategory)
        return false;
      return this._matches(option, query);
    }
    _sourceCount(source) {
      return this._activeGroup()?.options.filter((option) => this._optionItem(option).kind === source).length ?? 0;
    }
    _selectSingleSourceOption(source) {
      const options = this._activeGroup()?.options.filter((option) => this._optionItem(option).kind === source) ?? [];
      if (options.length !== 1)
        return false;
      this._selectOption(options[0]);
      return true;
    }
    _categoryCount(category) {
      return this._activeGroup()?.options.filter((option) => this._optionItem(option).kind === this._activeSource && this._categoryLabel(option) === category).length ?? 0;
    }
    _categories() {
      const categories = new Set;
      for (const option of this._activeGroup()?.options ?? []) {
        if (this._optionItem(option).kind !== this._activeSource)
          continue;
        categories.add(this._categoryLabel(option));
      }
      return [...categories].sort((a, b2) => a.localeCompare(b2));
    }
    _matches(option, query) {
      if (!query)
        return true;
      const item = this._optionItem(option);
      return [
        this._itemLabel(item),
        this._itemDescription(item),
        this._itemCategory(item),
        this._itemSubCategory(item),
        this._itemHandle(item),
        option.slotLabel
      ].some((value) => value?.toLowerCase().includes(query));
    }
    _iconText(item) {
      return (this._itemIcon(item) ?? this._itemLabel(item)).slice(0, 1).toUpperCase();
    }
    _categoryLabel(option) {
      const item = this._optionItem(option);
      const category = this._itemCategory(item) ?? this._sourceLabel(item.kind);
      const subCategory = this._itemSubCategory(item);
      return subCategory ? `${category} / ${subCategory}` : category;
    }
    _normalizeOption(option) {
      if (option.item) {
        return {
          ...option,
          kind: option.item.kind
        };
      }
      if (!option.entry) {
        throw new Error("Block picker option requires either item or entry.");
      }
      return {
        ...option,
        kind: "block",
        item: {
          kind: "block",
          entry: option.entry
        }
      };
    }
    _optionItem(option) {
      if (option.item)
        return option.item;
      if (option.entry) {
        return {
          kind: "block",
          entry: option.entry
        };
      }
      throw new Error("Block picker option requires either item or entry.");
    }
    _sourceLabel(kind) {
      if (kind === "template")
        return "Template";
      if (kind === "snippet")
        return "Snippet";
      if (kind === "media")
        return "Media";
      return "Block";
    }
    _itemLabel(item) {
      return item.kind === "block" ? item.entry.label : item.label;
    }
    _itemDescription(item) {
      if (item.kind === "block")
        return item.entry.description ?? item.entry.tag;
      return item.description ?? this._itemHandle(item);
    }
    _itemCategory(item) {
      return item.kind === "block" ? item.entry.category : item.category;
    }
    _itemSubCategory(item) {
      return item.kind === "block" ? item.entry.subCategory : item.subCategory;
    }
    _itemIcon(item) {
      return item.kind === "block" ? item.entry.icon : item.icon;
    }
    _itemHandle(item) {
      if (item.kind === "block")
        return item.entry.tag;
      if (item.kind === "snippet")
        return item.identifier;
      if (item.kind === "media")
        return item.accept?.join(", ") ?? "media";
      return item.id;
    }
    _activeGroup() {
      return this._groups.find((group) => (group.slot ?? "") === this._activeSlotKey) ?? this._groups[0];
    }
    _firstEnabledGroup() {
      return this._groups.find((group) => !group.disabledReason) ?? this._groups[0];
    }
    _onBackdropClick = (event) => {
      if (event.target === this.backdrop)
        this.close();
    };
    _onKeydown = (event) => {
      if (event.key === "Escape")
        this.close();
    };
    get backdrop() {
      return this.shadowRoot.querySelector(".backdrop");
    }
    get closeButton() {
      return this.shadowRoot.querySelector(".close");
    }
    get search() {
      return this.shadowRoot.querySelector(".search");
    }
    get tabs() {
      return this.shadowRoot.querySelector(".slot-tabs");
    }
    get subtitle() {
      return this.shadowRoot.querySelector(".subtitle");
    }
    get sources() {
      return this.shadowRoot.querySelector(".sources");
    }
    get categories() {
      return this.shadowRoot.querySelector(".categories");
    }
    get results() {
      return this.shadowRoot.querySelector(".results");
    }
    get details() {
      return this.shadowRoot.querySelector(".details");
    }
  }
  if (!customElements.get("cms-editor-v2-block-picker-modal")) {
    customElements.define("cms-editor-v2-block-picker-modal", BlockPickerModal);
  }

  // ../../features/cms-editor-system-v2/src/components/Layout/StructureTree/template.html
  var template_default8 = `<nav class="structure-tree" aria-label="Page structure">
    <div class="empty">No editable elements</div>
</nav>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/StructureTree/style.css
  var style_default7 = `:host {
    display: block;
    position: relative;
    min-height: 100%;
}

* {
    box-sizing: border-box;
}

.structure-tree {
    display: grid;
    align-content: start;
    gap: 2px;
    min-height: 100%;
    padding: 0 10px 14px;
}

.row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    min-height: 30px;
    padding-left: calc(6px + (var(--structure-depth, 0) * 12px));
}

.toggle,
.toggle-spacer {
    display: grid;
    place-items: center;
    width: 18px;
    height: 30px;
}

.toggle {
    border: 0;
    background: transparent;
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
}

.toggle:hover {
    color: var(--editor-v2-text);
}

.item {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    width: 100%;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
}

.item[draggable="true"] {
    cursor: grab;
}

.item[draggable="true"]:active {
    cursor: grabbing;
}

.item:hover {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
}

.row.drop-before .item {
    border-top-color: var(--editor-v2-accent);
    box-shadow: inset 0 2px 0 var(--editor-v2-accent);
}

.row.drop-after .item {
    border-bottom-color: var(--editor-v2-accent);
    box-shadow: inset 0 -2px 0 var(--editor-v2-accent);
}

.item.active {
    color: var(--editor-v2-text);
}

.item.selected {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 26%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 10%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
}

.item.source-state {
    grid-template-columns: 16px minmax(0, 1fr) auto;
    min-height: 23px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: color-mix(in srgb, var(--editor-v2-muted) 88%, transparent);
    cursor: default;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 11px;
    font-weight: 720;
}

.source-state-row {
    opacity: 0.94;
}

.source-state-row:has(+ .row:not(.source-state-row)) {
    margin-bottom: 8px;
}

.item.source-state:hover {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
}

.item.source-state.state-filled {
    color: var(--editor-v2-text);
}

.item.source-state.state-loaded {
    color: color-mix(in srgb, var(--editor-v2-text) 82%, var(--editor-v2-muted));
}

.item.source-state.state-loading {
    color: color-mix(in srgb, #087f8c 68%, var(--editor-v2-muted));
}

.item.source-state.state-empty {
    color: color-mix(in srgb, #8a6d1d 68%, var(--editor-v2-muted));
}

.item.source-state.state-error {
    color: color-mix(in srgb, #9a2f2f 72%, var(--editor-v2-muted));
}

.state-spacer {
    width: 16px;
}

.state-add {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 999px;
    background: var(--editor-v2-bg);
    color: var(--editor-v2-muted);
    cursor: pointer;
    font: inherit;
    font-family: inherit;
    font-size: 13px;
    font-weight: 780;
    line-height: 1;
}

.state-add:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 36%, var(--editor-v2-border));
    color: var(--editor-v2-accent);
}

.icon {
    display: grid;
    place-items: center;
    color: var(--editor-v2-muted);
    font-size: 11px;
    font-weight: 700;
}

.label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.badges {
    display: flex;
    gap: 4px;
    min-width: 0;
}

.badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 999px;
    padding: 1px 6px;
    background: var(--editor-v2-bg);
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
}

.badge.data {
    border-color: color-mix(in srgb, #087f8c 24%, var(--editor-v2-border));
    background: color-mix(in srgb, #087f8c 7%, var(--editor-v2-bg));
    color: color-mix(in srgb, #087f8c 72%, var(--editor-v2-text));
}

.badge-icon {
    display: inline-grid;
    place-items: center;
    width: 10px;
    height: 10px;
    font-size: 9px;
    line-height: 1;
}

.badge.more {
    cursor: pointer;
}

.badge.more:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 32%, var(--editor-v2-border));
    color: var(--editor-v2-accent);
}

.empty {
    display: grid;
    gap: 10px;
    padding: 14px 10px;
    color: var(--editor-v2-muted);
    font-size: 12px;
}

.empty button {
    width: max-content;
    min-height: 30px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    cursor: pointer;
    font: inherit;
    font-weight: 720;
    padding: 0 10px;
}

.empty button:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 34%, var(--editor-v2-border));
    color: var(--editor-v2-accent);
}

.context-menu {
    position: fixed;
    z-index: 120;
    display: grid;
    gap: 2px;
    min-width: 160px;
    max-width: 220px;
    max-height: 280px;
    overflow: auto;
    padding: 5px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-bg);
    box-shadow: 0 10px 24px color-mix(in srgb, black 14%, transparent);
}

.context-item {
    width: 100%;
    min-height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
}

.context-item:hover {
    background: var(--editor-v2-surface);
}

.context-item:disabled {
    color: color-mix(in srgb, var(--editor-v2-muted) 58%, transparent);
    cursor: not-allowed;
}

.context-item:disabled:hover {
    background: transparent;
}

.context-item.danger {
    color: #9a2f2f;
}

.context-item.danger:disabled {
    color: color-mix(in srgb, #9a2f2f 36%, var(--editor-v2-muted));
}

.context-item.danger:hover {
    background: #fff0f0;
}

.context-separator {
    height: 1px;
    margin: 4px 2px;
    background: var(--editor-v2-border);
}

.context-title {
    padding: 2px 7px 4px;
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

.context-empty {
    padding: 6px 7px;
    color: var(--editor-v2-muted);
    font-size: 12px;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/StructureTree/StructureTree.ts
  var template5 = document.createElement("template");
  template5.innerHTML = `<style>${String(style_default7)}</style>${String(template_default8)}`;

  class StructureTree extends HTMLElement {
    _nodes = [];
    _selectedEditor = null;
    _catalog = [];
    _dataSources = [];
    _defaultTemplateSelection = {};
    _insertItems = [];
    _scrollSelectedIntoViewOnRender = false;
    _repeatableTargets = new WeakSet;
    _pendingPickerAction = null;
    _pendingSourceEditor = null;
    _draggedNode = null;
    _dropRow = null;
    _collapsedTargets = new Set;
    _expandedBadgeTargets = new Set;
    _sourceStateKeys = new WeakMap;
    _renderedRows = new WeakMap;
    _scrollRequestId = 0;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template5.content.cloneNode(true));
    }
    connectedCallback() {
      this.ownerDocument.addEventListener("click", this._closeContextMenu);
      this.ownerDocument.addEventListener("keydown", this._onDocumentKeydown);
      this._blockPicker.addEventListener(BLOCK_PICKER_SELECT_EVENT, this._onBlockPickerSelect);
      this._dataSourcePicker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect);
      this._dataSourcePicker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
      this._tree.addEventListener("click", this._onTreeClick);
      this._tree.addEventListener("contextmenu", this._onTreeContextMenu);
    }
    disconnectedCallback() {
      this.ownerDocument.removeEventListener("click", this._closeContextMenu);
      this.ownerDocument.removeEventListener("keydown", this._onDocumentKeydown);
      this._blockPicker.removeEventListener(BLOCK_PICKER_SELECT_EVENT, this._onBlockPickerSelect);
      this._dataSourcePicker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect);
      this._dataSourcePicker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
      this._tree.removeEventListener("click", this._onTreeClick);
      this._tree.removeEventListener("contextmenu", this._onTreeContextMenu);
    }
    setCatalog(catalog) {
      this.catalog = catalog;
    }
    setInsertItems(items) {
      this._insertItems = items.map((item) => ({ ...item }));
    }
    setDefaultTemplateSelection(selection) {
      this._defaultTemplateSelection = { ...selection };
      this._render();
    }
    setDataSources(sources) {
      this._dataSources = sources.map((source) => ({
        ...source,
        fields: [...source.fields]
      }));
    }
    get catalog() {
      return this._catalog;
    }
    set catalog(catalog) {
      this._catalog = [...catalog];
    }
    setStructure(nodes, selectedEditor = null, catalog = this._catalog, options = {}) {
      this._nodes = nodes;
      this._selectedEditor = selectedEditor;
      this._catalog = [...catalog];
      this._scrollSelectedIntoViewOnRender = options.scrollSelectedIntoView === true;
      if (this._scrollSelectedIntoViewOnRender)
        this._expandPathToSelected();
      this._setRepeatableTargets(options.repeatableTargets ?? []);
      this._render();
    }
    _render(request = {}) {
      this._scrollRequestId += 1;
      const tree = this._tree;
      const scrollContainer = this._scrollContainer;
      const previousScrollTop = scrollContainer.scrollTop;
      tree.replaceChildren();
      this._contextMenu.remove();
      if (this._nodes.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        const button = document.createElement("button");
        button.type = "button";
        const defaultTemplates = this._defaultTemplateItems();
        button.textContent = defaultTemplates.length > 0 ? "Use default template" : "Add block";
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (this._useDefaultTemplate(defaultTemplates))
            return;
          this._openRootPicker();
        });
        empty.append("No editable elements", button);
        tree.append(empty);
        return;
      }
      for (const node of this._visibleNodes(this._nodes)) {
        tree.append(this._renderNode(node.item, node.depth));
      }
      if (request.anchor) {
        this._restoreScrollAnchor(request.anchor);
      } else if (this._scrollSelectedIntoViewOnRender) {
        this._scrollSelectedIntoView();
      } else {
        scrollContainer.scrollTop = previousScrollTop;
      }
    }
    _renderNode(node, depth) {
      const row = document.createElement("div");
      row.className = this._rowClass(node);
      row.style.setProperty("--structure-depth", String(depth));
      this._trackRenderedRow(node, row);
      if (node.children.length > 0) {
        const toggle = document.createElement("button");
        toggle.className = "toggle";
        toggle.type = "button";
        toggle.textContent = this._isCollapsed(node) ? "›" : "⌄";
        toggle.setAttribute("aria-label", this._isCollapsed(node) ? "Expand" : "Collapse");
        toggle.addEventListener("click", () => {
          this._toggleNode(node);
        });
        row.append(toggle);
      } else if (this._isSourceStateNode(node)) {
        row.append(document.createElement("span"));
      } else {
        const spacer = document.createElement("span");
        spacer.className = "toggle-spacer";
        row.append(spacer);
      }
      const item = this._isSourceStateNode(node) ? document.createElement("div") : document.createElement("button");
      item.className = this._itemClass(node);
      item.draggable = !this._isSourceStateNode(node);
      if (!this._isSourceStateNode(node) && node.editor === this._selectedEditor)
        item.classList.add("selected");
      if (!this._isSourceStateNode(node))
        item.type = "button";
      item.addEventListener("click", () => {
        if (this._isSourceStateNode(node))
          return;
        this.dispatchEvent(new CustomEvent("editor-v2:select-editor", {
          bubbles: true,
          composed: true,
          detail: { editor: node.editor }
        }));
      });
      item.addEventListener("contextmenu", (event) => {
        const mouseEvent = event;
        event.preventDefault();
        event.stopPropagation();
        this._openContextMenu(node, mouseEvent.clientX, mouseEvent.clientY);
      });
      if (!this._isSourceStateNode(node)) {
        item.addEventListener("dragstart", (event) => this._onDragStart(node, event));
        item.addEventListener("dragover", (event) => this._onDragOver(node, row, event));
        item.addEventListener("dragleave", () => this._clearDropRow());
        item.addEventListener("drop", (event) => this._onDrop(node, event));
        item.addEventListener("dragend", () => this._clearDragState());
      }
      const icon = document.createElement("span");
      icon.className = this._iconClass(node);
      icon.textContent = this._iconText(node);
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = this._nodeLabel(node);
      const badges = document.createElement("span");
      badges.className = "badges";
      const visibleBadges = this._visibleBadges(node);
      for (const value of visibleBadges) {
        badges.append(this._renderBadge(value));
      }
      const hiddenCount = node.badges.length - visibleBadges.length;
      if (hiddenCount > 0) {
        const more = document.createElement("span");
        more.className = "badge more";
        more.role = "button";
        more.tabIndex = 0;
        more.textContent = `+${hiddenCount}`;
        more.addEventListener("click", (event) => {
          event.stopPropagation();
          this._toggleBadges(node);
        });
        more.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ")
            return;
          event.preventDefault();
          event.stopPropagation();
          this._toggleBadges(node);
        });
        badges.append(more);
      }
      if (this._isSourceStateNode(node) && node.children.length === 0) {
        badges.append(this._sourceStateAddButton(node));
      }
      item.append(icon, label, badges);
      row.append(item);
      return row;
    }
    _sourceStateAddButton(node) {
      const button = document.createElement("button");
      button.className = "state-add";
      button.type = "button";
      button.textContent = "+";
      button.setAttribute("aria-label", `Add ${node.state} state content`);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._openSourceStatePicker(node);
      });
      return button;
    }
    _renderBadge(value) {
      const badge = document.createElement("span");
      badge.className = this._badgeClass(value);
      const icon = this._badgeIcon(value);
      if (icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "badge-icon";
        iconEl.textContent = icon;
        badge.append(iconEl);
      }
      const label = document.createElement("span");
      label.textContent = value;
      badge.append(label);
      return badge;
    }
    _badgeClass(value) {
      return value === "Source" || value === "Repeat" ? "badge data" : "badge";
    }
    _badgeIcon(value) {
      if (value === "Source")
        return "▦";
      if (value === "Repeat")
        return "↻";
      return null;
    }
    _scrollSelectedIntoView() {
      if (!this._selectedEditor)
        return;
      const requestId = this._scrollRequestId;
      requestAnimationFrame(() => {
        if (requestId !== this._scrollRequestId)
          return;
        const selected = this.shadowRoot.querySelector(".item.selected");
        if (!selected)
          return;
        const scrollContainer = this._scrollContainer;
        const selectedTop = selected.offsetTop;
        const targetOffset = scrollContainer.clientHeight * 0.2;
        const nextScrollTop = selectedTop - targetOffset + selected.offsetHeight / 2;
        const top = Math.max(0, nextScrollTop);
        if (typeof scrollContainer.scrollTo === "function") {
          scrollContainer.scrollTo({ top, behavior: "smooth" });
        } else {
          scrollContainer.scrollTop = top;
        }
      });
    }
    _restoreScrollAnchor(anchor) {
      const row = this._findRenderedRow(anchor.key);
      if (!row)
        return;
      const scrollContainer = this._scrollContainer;
      scrollContainer.scrollTop += row.getBoundingClientRect().top - anchor.offsetTop;
    }
    _trackRenderedRow(node, row) {
      const key = this._nodeCollapseKey(node);
      if (typeof key !== "object")
        return;
      this._renderedRows.set(key, row);
    }
    _findRenderedRow(key) {
      if (typeof key !== "object")
        return null;
      return this._renderedRows.get(key) ?? null;
    }
    _openContextMenu(node, clientX, clientY) {
      this._closeContextMenu();
      if (this._isSourceStateNode(node)) {
        this._openSourceStateContextMenu(node, clientX, clientY);
        return;
      }
      const menu = this._contextMenu;
      menu.replaceChildren();
      const sourceAction = this._contextMenuButton(this._sourceActionLabel(node), () => {
        this._openSourcePicker(node);
      }, undefined, this._sourceDataSources.length === 0);
      const repeatAction = node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat) ? this._contextMenuButton("Remove repeat", () => this._emitAction("remove-repeat", node.editor)) : this._contextMenuButton("Add repeat", () => this._emitAction("configure-repeat", node.editor), undefined, !this._repeatableTargets.has(node.target));
      const snippet = this._snippetItemForNode(node);
      const modifySnippetAction = this._contextMenuButton("Modify Snippet", () => {
        if (!snippet)
          return;
        this._redirectToSnippetEditor(snippet.id);
      }, undefined, !snippet);
      menu.append(this._contextMenuButton("Add child", () => {
        this._openPickerOrEmitSingleMedia({ action: "add-child", editor: node.editor }, this._childGroups(node), node.label);
      }, undefined, !this._hasEnabledGroup(this._childGroups(node))), this._contextMenuButton("Copy", () => this._emitAction("copy", node.editor)), this._contextMenuButton("Paste after", () => this._emitAction("paste-after", node.editor)), this._contextMenuButton("Duplicate", () => this._emitAction("duplicate", node.editor), undefined, !this._canDuplicate(node)), ...this._isSnippetNode(node) ? [modifySnippetAction] : [], this._contextSeparator(), sourceAction, repeatAction, this._contextSeparator(), this._contextMenuButton("Replace", () => {
        this._openPickerOrEmitSingleMedia({ action: "replace", editor: node.editor }, this._replaceGroups(node), node.label);
      }, undefined, !this._hasEnabledGroup(this._replaceGroups(node))), this._contextMenuButton("Delete", () => this._emitAction("delete", node.editor), "danger", !this._canDelete(node)));
      this.shadowRoot.append(menu);
      this._positionContextMenu(menu, clientX, clientY);
    }
    _redirectToSnippetEditor(id) {
      window.location.href = this._snippetEditorUrl(id);
    }
    _snippetEditorUrl(id) {
      return `${this._basePath()}/editor/snippet?id=${encodeURIComponent(id)}`;
    }
    _basePath() {
      return document.querySelector('meta[name="basePath"]')?.content ?? "";
    }
    _positionContextMenu(menu, clientX, clientY) {
      const margin = 6;
      const menuBounds = menu.getBoundingClientRect();
      const maxLeft = Math.max(margin, window.innerWidth - menuBounds.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - menuBounds.height - margin);
      menu.style.left = `${Math.min(Math.max(clientX, margin), maxLeft)}px`;
      menu.style.top = `${Math.min(Math.max(clientY, margin), maxTop)}px`;
    }
    _openSourcePicker(node) {
      this._pendingSourceEditor = node.editor;
      const picker = this._dataSourcePicker;
      picker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect);
      picker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
      picker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect);
      picker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
      picker.open(this._sourceDataSources, node.label, {
        canRemove: node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source)
      });
    }
    _contextMenuButton(label, action, variant, disabled = false) {
      const button = document.createElement("button");
      button.className = variant ? `context-item ${variant}` : "context-item";
      button.type = "button";
      button.disabled = disabled;
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (button.disabled)
          return;
        this._closeContextMenu();
        action();
      });
      return button;
    }
    _contextSeparator() {
      const separator = document.createElement("div");
      separator.className = "context-separator";
      separator.role = "separator";
      return separator;
    }
    _openRootContextMenu(clientX, clientY) {
      this._closeContextMenu();
      const menu = this._contextMenu;
      menu.replaceChildren(this._contextMenuButton("Add block", () => this._openRootPicker(), undefined, !this._hasEnabledGroup(this._rootGroups())), this._contextMenuButton("Paste", () => this._emitAction("paste-after")));
      this.shadowRoot.append(menu);
      this._positionContextMenu(menu, clientX, clientY);
    }
    _openRootPicker() {
      this._pendingPickerAction = { action: "add-root" };
      this._blockPicker.open(this._rootGroups(), "Page");
    }
    _openSourceStateContextMenu(node, clientX, clientY) {
      const menu = this._contextMenu;
      menu.replaceChildren(this._contextMenuButton("Add block", () => {
        this._openSourceStatePicker(node);
      }, undefined, !this._hasEnabledGroup(this._sourceStateGroups(node))), this._contextMenuButton("Paste", () => this._emitAction("paste-after", node.sourceEditor, undefined, undefined, node.state)), this._contextMenuButton("Clear state", () => this._emitAction("clear-source-state", node.sourceEditor, undefined, undefined, node.state), "danger", node.children.length === 0));
      this.shadowRoot.append(menu);
      this._positionContextMenu(menu, clientX, clientY);
    }
    _openSourceStatePicker(node) {
      const groups = this._sourceStateGroups(node);
      if (!this._hasEnabledGroup(groups))
        return;
      this._openPickerOrEmitSingleMedia({
        action: "add-source-state-child",
        editor: node.sourceEditor,
        sourceState: node.state
      }, groups, node.label);
    }
    _openPickerOrEmitSingleMedia(action, groups, contextLabel) {
      const option = this._singleEnabledOption(groups);
      if (option?.item?.kind === "media") {
        this._emitAction(action.action, action.editor, option.item, option.slot, action.sourceState);
        return;
      }
      this._pendingPickerAction = action;
      this._blockPicker.open(groups, contextLabel);
    }
    _singleEnabledOption(groups) {
      const options = groups.filter((group) => !group.disabledReason).flatMap((group) => group.options);
      return options.length === 1 ? options[0] ?? null : null;
    }
    _emitAction(action, editor, item, slot, sourceState, sourceEditor, dataSource, sourceBinding) {
      this.dispatchEvent(new CustomEvent("editor-v2:structure-action", {
        bubbles: true,
        composed: true,
        detail: {
          action,
          editor,
          sourceEditor,
          item,
          dataSource,
          sourceBinding,
          entry: item?.kind === "block" ? item.entry : undefined,
          slot,
          sourceState
        }
      }));
    }
    _rootGroups() {
      const options = [
        ...this._catalog.filter((entry) => entry.category !== "Runtime").map((entry) => ({
          item: {
            kind: "block",
            entry
          },
          entry,
          slotLabel: "Page"
        })),
        ...this._insertItems.filter((item) => item.kind !== "media").map((item) => ({
          item,
          slotLabel: "Page"
        }))
      ];
      return [{
        label: "Page",
        disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
        options
      }];
    }
    _defaultTemplateGroups(templates) {
      return [{
        label: "Default templates",
        disabledReason: templates.length === 0 ? "No default templates." : undefined,
        options: templates.map((item) => ({
          item,
          slotLabel: "Page"
        }))
      }];
    }
    _childGroups(node) {
      return node.editor.getContentSlots().map((slot) => {
        const isFull = this._isSlotFull(node, slot);
        const options = isFull ? [] : this._slotOptions(slot, node);
        return {
          slot: slot.slot,
          label: slot.label,
          disabledReason: isFull ? "This slot is full." : options.length === 0 ? "No compatible blocks." : undefined,
          options
        };
      });
    }
    _sourceStateGroups(node) {
      const parentNode = this._nodeForEditor(node.sourceEditor);
      if (!parentNode)
        return [];
      const slot = {
        label: node.label,
        accepts: [{ kind: "any-component" }]
      };
      const options = this._slotOptions(slot, parentNode).map((option) => ({
        ...option,
        slot: undefined,
        slotLabel: node.label
      }));
      return [{
        label: node.label,
        disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
        options
      }];
    }
    _replaceGroups(node) {
      const parent = this._parentNode(node);
      if (!parent)
        return this._rootGroups();
      const slot = this._slotForChild(parent, node);
      if (!slot)
        return [];
      const options = this._slotOptions(slot, parent, node);
      return [{
        slot: slot.slot,
        label: slot.label,
        disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
        options
      }];
    }
    _slotOptions(slot, parent, replaced) {
      const blockOptions = this._catalog.filter((entry) => {
        if (entry.category === "Runtime")
          return false;
        return slot.accepts.some((accept) => this._acceptsEntry(accept, entry));
      }).map((entry) => ({
        item: {
          kind: "block",
          entry
        },
        entry,
        slot: slot.slot,
        slotLabel: slot.label
      }));
      const externalOptions = this._insertItems.filter((item) => slot.accepts.some((accept) => this._acceptsItem(accept, item))).filter((item) => this._canFitItem(parent, slot, item, replaced)).map((item) => ({
        item,
        slot: slot.slot,
        slotLabel: slot.label
      }));
      const mediaAccept = this._mediaAcceptForSlot(slot);
      const mediaOptions = mediaAccept ? [{
        item: {
          kind: "media",
          label: "Media",
          description: "Choose a file from the CMS library.",
          category: "Media",
          subCategory: mediaAccept.join(", "),
          icon: "M",
          accept: mediaAccept
        },
        slot: slot.slot,
        slotLabel: slot.label
      }] : [];
      return [
        ...blockOptions.filter((option) => this._canFitItem(parent, slot, option.item, replaced)),
        ...externalOptions,
        ...mediaOptions.filter((option) => option.item && this._canFitItem(parent, slot, option.item, replaced))
      ];
    }
    _mediaAcceptForSlot(slot) {
      const explicit = slot.accepts.find((accept) => accept.kind === "media");
      if (explicit?.kind === "media")
        return explicit.accept ?? ["image"];
      if (slot.accepts.some((accept) => accept.kind === "component" && accept.tag.toLowerCase() === "img")) {
        return ["image"];
      }
      if (slot.accepts.some((accept) => accept.kind === "any-component")) {
        return ["image"];
      }
      return null;
    }
    _hasEnabledGroup(groups) {
      return groups.some((group) => !group.disabledReason && group.options.length > 0);
    }
    _acceptsEntry(accept, entry) {
      if (accept.kind === "media")
        return false;
      if (accept.kind === "any-component")
        return true;
      return accept.tag.toLowerCase() === entry.tag.toLowerCase();
    }
    _acceptsItem(accept, item) {
      if (item.kind === "media")
        return accept.kind === "media";
      if (item.kind === "block")
        return this._acceptsEntry(accept, item.entry);
      if (accept.kind === "media")
        return false;
      if (accept.kind === "any-component")
        return true;
      if (item.kind === "snippet")
        return accept.tag.toLowerCase() === CMS_SNIPPET_TAG;
      return false;
    }
    _canFitItem(parent, slot, item, replaced) {
      if (typeof slot.max !== "number")
        return true;
      const replacedSlot = replaced ? this._slotForChild(parent, replaced) : undefined;
      const replacedCount = replacedSlot && this._sameSlot(replacedSlot, slot) ? 1 : 0;
      return this._slotChildCount(parent, slot) - replacedCount + this._itemRootCount(item) <= slot.max;
    }
    _itemRootCount(item) {
      if (item.kind !== "template")
        return 1;
      const template6 = document.createElement("template");
      template6.innerHTML = item.content;
      const elementCount = template6.content.children.length;
      if (elementCount > 0)
        return elementCount;
      return template6.content.textContent?.trim() ? 1 : 0;
    }
    _canDuplicate(node) {
      const parent = this._parentNode(node);
      if (!parent)
        return true;
      const slot = this._slotForChild(parent, node);
      if (!slot?.max)
        return true;
      return this._slotChildCount(parent, slot) < slot.max;
    }
    _canDelete(node) {
      const parent = this._parentNode(node);
      if (!parent)
        return true;
      const slot = this._slotForChild(parent, node);
      if (!slot?.min)
        return true;
      return this._slotChildCount(parent, slot) > slot.min;
    }
    _isSlotFull(parent, slot) {
      return typeof slot.max === "number" && this._slotChildCount(parent, slot) >= slot.max;
    }
    _slotForChild(parent, child) {
      const childSlot = child.target.getAttribute("slot") ?? undefined;
      return parent.editor.getContentSlots().find((slot) => (slot.slot ?? undefined) === childSlot);
    }
    _sameSlot(left, right) {
      return (left.slot ?? undefined) === (right.slot ?? undefined);
    }
    _slotChildCount(parent, slot) {
      return this._editorChildrenOf(parent).filter((child) => (child.target.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined)).length;
    }
    _editorChildrenOf(parent) {
      return parent.children.flatMap((child) => this._isSourceStateNode(child) ? child.children : [child]);
    }
    _parentNode(child) {
      const visit = (nodes) => {
        for (const node of nodes) {
          if (this._isSourceStateNode(node)) {
            if (node.children.includes(child))
              return this._nodeForEditor(node.sourceEditor);
            const stateParent = visit(node.children);
            if (stateParent)
              return stateParent;
            continue;
          }
          if (node.children.includes(child))
            return node;
          const parent = visit(node.children);
          if (parent)
            return parent;
        }
        return null;
      };
      return visit(this._nodes);
    }
    _nodeForEditor(editor) {
      return this._flattenNodes(this._nodes).filter((node) => !this._isSourceStateNode(node)).find((node) => node.editor === editor) ?? null;
    }
    _onBlockPickerSelect = (event) => {
      if (!this._pendingPickerAction)
        return;
      const { action, editor, sourceState } = this._pendingPickerAction;
      this._emitAction(action, editor, event.detail.option.item, event.detail.option.slot, sourceState);
      this._pendingPickerAction = null;
    };
    _onDataSourceSelect = (event) => {
      if (!this._pendingSourceEditor)
        return;
      this._emitAction("set-source", this._pendingSourceEditor, undefined, undefined, undefined, undefined, event.detail.source, event.detail.binding);
      this._pendingSourceEditor = null;
    };
    _onDataSourceRemove = () => {
      if (!this._pendingSourceEditor)
        return;
      this._emitAction("remove-source", this._pendingSourceEditor);
      this._pendingSourceEditor = null;
    };
    _closeContextMenu = () => {
      this._contextMenu.remove();
    };
    _onDocumentKeydown = (event) => {
      if (event.key === "Escape") {
        this._closeContextMenu();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && this._selectedEditor && !this._isEditableKeyEvent(event)) {
        event.preventDefault();
        this._emitAction("delete", this._selectedEditor);
        return;
      }
      if (!event.ctrlKey && !event.metaKey)
        return;
      if (this._isEditableKeyEvent(event))
        return;
      const key = event.key.toLowerCase();
      if (key === "c" && this._selectedEditor) {
        event.preventDefault();
        this._emitAction("copy", this._selectedEditor);
      } else if (key === "v") {
        event.preventDefault();
        this._emitAction("paste-after", this._selectedEditor ?? undefined);
      }
    };
    _onTreeClick = (event) => {
      if (event.target !== this._tree)
        return;
      this._openRootPicker();
    };
    _onTreeContextMenu = (event) => {
      if (event.target !== this._tree)
        return;
      event.preventDefault();
      const mouseEvent = event;
      this._openRootContextMenu(mouseEvent.clientX, mouseEvent.clientY);
    };
    _onDragStart(node, event) {
      this._draggedNode = node;
      event.dataTransfer?.setData("text/plain", node.label);
      if (event.dataTransfer)
        event.dataTransfer.effectAllowed = "move";
    }
    _onDragOver(node, row, event) {
      if (!this._draggedNode || this._draggedNode === node || this._isDescendantNode(node, this._draggedNode))
        return;
      event.preventDefault();
      this._clearDropRow();
      const position = this._dropPosition(row, event);
      row.classList.add(position === "before" ? "drop-before" : "drop-after");
      this._dropRow = row;
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = "move";
    }
    _onDrop(node, event) {
      if (!this._draggedNode || this._draggedNode === node || this._isDescendantNode(node, this._draggedNode))
        return;
      event.preventDefault();
      const position = this._dropPosition(event.currentTarget, event);
      this._emitAction(position === "before" ? "move-before" : "move-after", node.editor, undefined, undefined, undefined, this._draggedNode.editor);
      this._clearDragState();
    }
    _dropPosition(target, event) {
      const rect = target.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    }
    _clearDragState() {
      this._draggedNode = null;
      this._clearDropRow();
    }
    _clearDropRow() {
      this._dropRow?.classList.remove("drop-before", "drop-after");
      this._dropRow = null;
    }
    _isDescendantNode(candidate, parent) {
      return parent.children.some((child) => {
        if (this._isSourceStateNode(child)) {
          return child.children.some((grandChild) => grandChild === candidate || this._isDescendantNode(candidate, grandChild));
        }
        return child === candidate || this._isDescendantNode(candidate, child);
      });
    }
    _isEditableKeyEvent(event) {
      return event.composedPath().some((target) => {
        if (!(target instanceof Element))
          return false;
        return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      });
    }
    _visibleNodes(nodes, depth = 0) {
      return nodes.flatMap((node) => {
        const current = [{ item: node, depth }];
        if (this._isCollapsed(node))
          return current;
        return [
          ...current,
          ...this._visibleNodes(node.children, depth + 1)
        ];
      });
    }
    _expandPathToSelected() {
      if (!this._selectedEditor)
        return;
      const path = this._pathToEditor(this._nodes, this._selectedEditor);
      if (!path)
        return;
      for (const node of path.slice(0, -1)) {
        this._collapsedTargets.delete(this._nodeCollapseKey(node));
      }
    }
    _pathToEditor(nodes, editor, ancestors = []) {
      for (const node of nodes) {
        const path = [...ancestors, node];
        if (!this._isSourceStateNode(node) && node.editor === editor)
          return path;
        const childPath = this._pathToEditor(node.children, editor, path);
        if (childPath)
          return childPath;
      }
      return null;
    }
    _toggleNode(node) {
      const key = this._nodeCollapseKey(node);
      const row = this._findRenderedRow(key);
      const anchor = row ? {
        key,
        offsetTop: row.getBoundingClientRect().top
      } : undefined;
      if (this._isCollapsed(node)) {
        this._collapsedTargets.delete(key);
      } else {
        this._collapsedTargets.add(key);
      }
      this._render({ anchor });
    }
    _isCollapsed(node) {
      return this._collapsedTargets.has(this._nodeCollapseKey(node));
    }
    _visibleBadges(node) {
      if (this._areBadgesExpanded(node))
        return node.badges;
      return node.badges.slice(0, 2);
    }
    _toggleBadges(node) {
      if (this._areBadgesExpanded(node)) {
        this._expandedBadgeTargets.delete(this._nodeBadgeKey(node));
      } else {
        this._expandedBadgeTargets.add(this._nodeBadgeKey(node));
      }
      this._render();
    }
    _areBadgesExpanded(node) {
      return this._expandedBadgeTargets.has(this._nodeBadgeKey(node));
    }
    _iconText(node) {
      if (this._isSourceStateNode(node))
        return "";
      if (node.icon)
        return node.icon.slice(0, 1).toUpperCase();
      return node.label.slice(0, 1).toUpperCase();
    }
    _nodeLabel(node) {
      if (!this._isSourceStateNode(node))
        return node.label;
      return node.label;
    }
    _rowClass(node) {
      if (this._isSourceStateNode(node))
        return "row source-state-row";
      return "row";
    }
    _itemClass(node) {
      if (this._isSourceStateNode(node)) {
        return node.children.length > 0 ? `item source-state state-filled state-${node.state}` : `item source-state state-${node.state}`;
      }
      return "item";
    }
    _iconClass(node) {
      if (this._isSourceStateNode(node))
        return "icon state-spacer";
      return "icon";
    }
    _sourceActionLabel(node) {
      return node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source) ? "Update source" : "Add source";
    }
    _isSnippetNode(node) {
      return node.tag.toLowerCase() === CMS_SNIPPET_TAG;
    }
    _snippetItemForNode(node) {
      if (!this._isSnippetNode(node))
        return null;
      const identifier = node.target.getAttribute("identifier")?.trim();
      if (!identifier)
        return null;
      return this._insertItems.find((item) => item.kind === "snippet" && item.identifier === identifier) ?? null;
    }
    _defaultTemplateItems() {
      const templates = this._insertItems.filter((item) => item.kind === "template");
      if (this._defaultTemplateSelection.category) {
        return templates.filter((item) => item.category === this._defaultTemplateSelection.category);
      }
      return [];
    }
    _useDefaultTemplate(templates = this._defaultTemplateItems()) {
      if (templates.length === 0)
        return false;
      if (templates.length === 1) {
        this._emitAction("add-root", undefined, templates[0]);
        return true;
      }
      this._pendingPickerAction = { action: "add-root" };
      this._blockPicker.open(this._defaultTemplateGroups(templates), "Page");
      return true;
    }
    _setRepeatableTargets(targets) {
      for (const node of this._flattenNodes(this._nodes)) {
        if (this._isSourceStateNode(node))
          continue;
        if (!targets.includes(node.target))
          this._repeatableTargets.delete(node.target);
      }
      for (const target of targets) {
        this._repeatableTargets.add(target);
      }
    }
    _flattenNodes(nodes) {
      return nodes.flatMap((node) => [
        node,
        ...this._flattenNodes(node.children)
      ]);
    }
    _isSourceStateNode(node) {
      return node.kind === "source-state";
    }
    _nodeCollapseKey(node) {
      if (this._isSourceStateNode(node))
        return this._sourceStateKey(node);
      return node.target;
    }
    _nodeBadgeKey(node) {
      return this._nodeCollapseKey(node);
    }
    _sourceStateKey(node) {
      let sourceKeys = this._sourceStateKeys.get(node.sourceEditor.target);
      if (!sourceKeys) {
        sourceKeys = new Map;
        this._sourceStateKeys.set(node.sourceEditor.target, sourceKeys);
      }
      let key = sourceKeys.get(node.state);
      if (!key) {
        key = {};
        sourceKeys.set(node.state, key);
      }
      return key;
    }
    get _sourceDataSources() {
      return this._dataSources.filter((source) => (source.method ?? "GET") === "GET");
    }
    get _contextMenu() {
      let menu = this.shadowRoot.querySelector(".context-menu");
      if (!menu) {
        menu = document.createElement("div");
        menu.className = "context-menu";
        menu.setAttribute("role", "menu");
      }
      return menu;
    }
    get _tree() {
      return this.shadowRoot.querySelector(".structure-tree");
    }
    get _scrollContainer() {
      const panelBody = this.parentElement?.shadowRoot?.querySelector(".panel-body");
      if (panelBody)
        return panelBody;
      return this;
    }
    get _blockPicker() {
      let picker = this.shadowRoot.querySelector("cms-editor-v2-block-picker-modal");
      if (!picker) {
        picker = document.createElement("cms-editor-v2-block-picker-modal");
        this.shadowRoot.append(picker);
      }
      return picker;
    }
    get _dataSourcePicker() {
      let picker = this.shadowRoot.querySelector("cms-editor-v2-data-source-picker");
      if (!picker) {
        picker = new DataSourcePicker;
        this.shadowRoot.append(picker);
      }
      return picker;
    }
  }
  if (!customElements.get("cms-editor-v2-structure-tree")) {
    customElements.define("cms-editor-v2-structure-tree", StructureTree);
  }

  // ../../features/cms-editor-system-v2/src/components/Layout/Canvas/template.html
  var template_default9 = `<main class="canvas">
    <div class="viewport">
        <div class="page">
            <iframe title="Page canvas" sandbox="allow-scripts allow-same-origin"></iframe>
        </div>
    </div>
</main>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/Canvas/style.css
  var style_default8 = `:host {
    display: block;
    min-width: 0;
    min-height: 0;
    --editor-v2-viewport-width: 1440px;
    --editor-v2-viewport-height: 900px;
    background: var(--editor-v2-bg);
}

* {
    box-sizing: border-box;
}

.canvas {
    height: 100%;
    min-height: 0;
    overflow: auto;
    padding: 32px 36px 46px;
    background-image: radial-gradient(var(--editor-v2-border-strong) 1px, transparent 1px);
    background-size: 22px 22px;
}

:host([viewport-padding="none"]) .canvas {
    padding: 0;
}

.viewport {
    width: 100%;
    min-width: var(--editor-v2-viewport-width);
    min-height: var(--editor-v2-viewport-height);
    display: flex;
    justify-content: center;
    align-items: flex-start;
}

:host([viewport-fit="fluid"]) .viewport {
    min-width: 0;
    height: 100%;
    min-height: 0;
}

.page {
    width: var(--editor-v2-viewport-width);
    height: var(--editor-v2-viewport-height);
    border: 1px solid var(--editor-v2-border);
    border-radius: 10px;
    background: var(--editor-v2-surface);
    box-shadow: var(--editor-v2-shadow);
    overflow: hidden;
}

:host([viewport-fit="fluid"]) .page {
    width: 100%;
    height: 100%;
}

:host([viewport-padding="none"]) .page {
    border-radius: 0;
}

iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: var(--editor-v2-surface);
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/Canvas/Canvas.ts
  var template6 = document.createElement("template");
  template6.innerHTML = `<style>${String(style_default8)}</style>${String(template_default9)}`;
  var CANVAS_FRAME_READY_EVENT = "editor-v2:frame-ready";
  var CANVAS_BACKGROUND_CLICK_EVENT = "editor-v2:canvas-background-click";

  class Canvas extends HTMLElement {
    _currentFrameUrl = null;
    static get observedAttributes() {
      return ["max-width", "viewport-width", "viewport-height", "frame-url", "viewport-padding", "viewport-fit"];
    }
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template6.content.cloneNode(true));
    }
    connectedCallback() {
      this.frame.addEventListener("load", this.onFrameLoad);
      this.shadowRoot.addEventListener("click", this.onBackgroundClick);
      this.syncViewportSize();
      this.syncFrameUrl();
    }
    disconnectedCallback() {
      this.frame.removeEventListener("load", this.onFrameLoad);
      this.shadowRoot.removeEventListener("click", this.onBackgroundClick);
    }
    attributeChangedCallback(name) {
      if (name === "frame-url") {
        this.syncFrameUrl();
        return;
      }
      this.syncViewportSize();
    }
    onFrameLoad = () => {
      const frameDocument = this.frame.contentDocument;
      if (!frameDocument)
        return;
      this.dispatchEvent(new CustomEvent(CANVAS_FRAME_READY_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          document: frameDocument,
          frame: this.frame,
          url: this._currentFrameUrl ?? this.frame.src
        }
      }));
    };
    onBackgroundClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element))
        return;
      if (target.closest(".page"))
        return;
      this.dispatchEvent(new CustomEvent(CANVAS_BACKGROUND_CLICK_EVENT, {
        bubbles: true,
        composed: true
      }));
    };
    syncFrameUrl() {
      const url = this.getAttribute("frame-url")?.trim() || "about:blank";
      if (this._currentFrameUrl === url)
        return;
      this._currentFrameUrl = url;
      if (this.frame.contentWindow) {
        this.frame.contentWindow.location.replace(url);
      } else {
        this.frame.setAttribute("src", url);
      }
    }
    syncViewportSize() {
      const width = this.cssSize(this.getAttribute("viewport-width") ?? this.getAttribute("max-width"));
      const height = this.cssSize(this.getAttribute("viewport-height"));
      if (width) {
        this.style.setProperty("--editor-v2-viewport-width", width);
      } else {
        this.style.removeProperty("--editor-v2-viewport-width");
      }
      if (height) {
        this.style.setProperty("--editor-v2-viewport-height", height);
      } else {
        this.style.removeProperty("--editor-v2-viewport-height");
      }
    }
    cssSize(value) {
      const size = value?.trim();
      if (!size)
        return null;
      return /^\d+$/.test(size) ? `${size}px` : size;
    }
    get frame() {
      return this.shadowRoot.querySelector("iframe");
    }
  }
  if (!customElements.get("cms-editor-v2-canvas")) {
    customElements.define("cms-editor-v2-canvas", Canvas);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/Section/template.html
  var template_default10 = `<section class="section">
    <button class="head" type="button" aria-expanded="true">
        <span class="label"></span>
        <span class="chevron">⌄</span>
    </button>
    <div class="body">
        <slot></slot>
    </div>
</section>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Section/style.css
  var style_default9 = `:host {
    display: block;
}

* {
    box-sizing: border-box;
}

.section {
    display: grid;
    gap: 9px;
}

.head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 22px;
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--editor-v2-subtle);
    padding: 0;
    font: inherit;
    font-size: 10px;
    font-weight: 780;
    letter-spacing: .09em;
    text-align: left;
    text-transform: uppercase;
    cursor: pointer;
}

.head::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--editor-v2-border);
}

.head:hover {
    color: var(--editor-v2-text);
}

.chevron {
    order: 3;
    color: var(--editor-v2-subtle);
    font-size: 12px;
    letter-spacing: 0;
}

.body {
    display: grid;
    gap: 12px;
    padding: 0 0 2px;
}

:host([collapsed]) .chevron {
    transform: rotate(-90deg);
}

:host([collapsed]) .body {
    display: none;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Section/Section.ts
  var template7 = document.createElement("template");
  template7.innerHTML = `<style>${String(style_default9)}</style>${String(template_default10)}`;

  class Section extends HTMLElement {
    toggle = () => {
      const collapsed = this.toggleAttribute("collapsed");
      this.shadowRoot.querySelector("button").ariaExpanded = String(!collapsed);
    };
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template7.content.cloneNode(true));
    }
    connectedCallback() {
      this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") ?? "";
      this.shadowRoot.querySelector("button").addEventListener("click", this.toggle);
    }
    disconnectedCallback() {
      this.shadowRoot.querySelector("button").removeEventListener("click", this.toggle);
    }
  }
  if (!customElements.get("cms-editor-v2-section")) {
    customElements.define("cms-editor-v2-section", Section);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/TextInput/template.html
  var template_default11 = `<label class="field">
    <span class="label"></span>
    <input>
    <span class="hint"></span>
</label>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/TextInput/style.css
  var style_default10 = `:host {
    display: block;
}

* {
    box-sizing: border-box;
}

.field {
    display: grid;
    gap: 5px;
}

.label {
    color: var(--editor-v2-label);
    font-size: 12px;
    font-weight: 640;
}

input {
    width: 100%;
    min-height: 32px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    padding: 0 9px;
    font: inherit;
    font-size: 12px;
}

input:disabled {
    border-color: color-mix(in srgb, var(--editor-v2-border) 70%, transparent);
    background: color-mix(in srgb, var(--editor-v2-surface-muted) 82%, var(--editor-v2-surface));
    color: var(--editor-v2-muted);
    cursor: not-allowed;
    opacity: .72;
}

.hint {
    color: var(--editor-v2-muted);
    font-size: 11px;
    line-height: 1.35;
}

.hint:empty {
    display: none;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/TextInput/TextInput.ts
  var template8 = document.createElement("template");
  template8.innerHTML = `<style>${String(style_default10)}</style>${String(template_default11)}`;

  class TextInput extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template8.content.cloneNode(true));
    }
    connectedCallback() {
      this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") ?? "";
      this.shadowRoot.querySelector(".hint").textContent = this.getAttribute("hint") ?? "";
      const input = this.shadowRoot.querySelector("input");
      input.value = this.getAttribute("value") ?? "";
      input.placeholder = this.getAttribute("placeholder") ?? "";
    }
  }
  if (!customElements.get("cms-editor-v2-text-input")) {
    customElements.define("cms-editor-v2-text-input", TextInput);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/Textarea/template.html
  var template_default12 = `<label class="field">
    <span class="label"></span>
    <textarea rows="3"></textarea>
    <span class="hint"></span>
</label>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Textarea/style.css
  var style_default11 = `:host {
    display: block;
}

* {
    box-sizing: border-box;
}

.field {
    display: grid;
    gap: 5px;
}

.label {
    color: var(--editor-v2-label);
    font-size: 12px;
    font-weight: 640;
}

.hint {
    color: var(--editor-v2-muted);
    font-size: 11px;
}

textarea {
    width: 100%;
    resize: vertical;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    padding: 8px 9px;
    font: inherit;
    font-size: 12px;
    line-height: 1.45;
}

textarea:disabled {
    border-color: color-mix(in srgb, var(--editor-v2-border) 70%, transparent);
    background: color-mix(in srgb, var(--editor-v2-surface-muted) 82%, var(--editor-v2-surface));
    color: var(--editor-v2-muted);
    cursor: not-allowed;
    opacity: .72;
}

.hint:empty {
    display: none;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Textarea/Textarea.ts
  var template9 = document.createElement("template");
  template9.innerHTML = `<style>${String(style_default11)}</style>${String(template_default12)}`;

  class Textarea extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template9.content.cloneNode(true));
    }
    connectedCallback() {
      this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") ?? "";
      this.shadowRoot.querySelector(".hint").textContent = this.getAttribute("hint") ?? "";
      this.shadowRoot.querySelector("textarea").value = this.getAttribute("value") ?? "";
    }
  }
  if (!customElements.get("cms-editor-v2-textarea")) {
    customElements.define("cms-editor-v2-textarea", Textarea);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/RichTextEditor/template.html
  var template_default13 = `<div class="field">
    <span class="label"></span>
    <span class="toolbar" aria-label="Rich text tools"></span>
    <div class="editor" contenteditable="true" role="textbox" aria-multiline="true"></div>
    <span class="hint"></span>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/RichTextEditor/style.css
  var style_default12 = `:host {
    display: block;
}

* {
    box-sizing: border-box;
}

.field {
    display: grid;
    gap: 8px;
}

.label {
    color: var(--editor-v2-label);
    font-size: 12px;
    font-weight: 640;
}

.toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: max-content;
    max-width: 100%;
    padding: 4px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--editor-v2-bg) 72%, var(--editor-v2-surface));
    box-shadow: inset 0 1px 0 color-mix(in srgb, white 65%, transparent);
    user-select: none;
}

.tool {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    font-weight: 760;
    cursor: pointer;
    user-select: none;
    transition:
        background 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
}

.tool svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2;
    pointer-events: none;
}

.size-tool {
    font-size: 15px;
}

.underline-icon {
    text-decoration: underline;
    text-underline-offset: 2px;
    pointer-events: none;
}

.tool:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 30%, var(--editor-v2-border));
    background: var(--editor-v2-surface);
    color: var(--editor-v2-accent);
}

.tool:active {
    background: color-mix(in srgb, var(--editor-v2-accent) 10%, var(--editor-v2-surface));
    transform: translateY(1px);
}

.editor {
    min-height: 96px;
    width: 100%;
    overflow: auto;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    padding: 8px 9px;
    font: inherit;
    font-size: 12px;
    line-height: 1.45;
    outline: none;
    cursor: text;
}

.editor:focus {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 52%, var(--editor-v2-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--editor-v2-accent) 12%, transparent);
}

.hint {
    color: var(--editor-v2-muted);
    font-size: 11px;
}

.hint:empty {
    display: none;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/RichTextEditor/RichTextEditor.ts
  var template10 = document.createElement("template");
  template10.innerHTML = `<style>${String(style_default12)}</style>${String(template_default13)}`;
  var TEXT_SIZE_STEPS = [".875em", "1em", "1.125em", "1.25em", "1.5em"];

  class RichTextEditor extends HTMLElement {
    _savedRange = null;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template10.content.cloneNode(true));
    }
    connectedCallback() {
      this.label.textContent = this.getAttribute("label") ?? "";
      this.hint.textContent = this.getAttribute("hint") ?? "";
      this.editor.innerHTML = this.getAttribute("value") ?? "";
      this.renderToolbar();
      this.editor.addEventListener("input", this.emitInput);
      this.editor.addEventListener("keyup", this.saveSelection);
      this.editor.addEventListener("mouseup", this.saveSelection);
      this.editor.addEventListener("pointerup", this.saveSelection);
      this.editor.addEventListener("blur", this.saveSelection);
    }
    disconnectedCallback() {
      this.editor.removeEventListener("input", this.emitInput);
      this.editor.removeEventListener("keyup", this.saveSelection);
      this.editor.removeEventListener("mouseup", this.saveSelection);
      this.editor.removeEventListener("pointerup", this.saveSelection);
      this.editor.removeEventListener("blur", this.saveSelection);
    }
    renderToolbar() {
      this.toolbar.replaceChildren();
      const capability = this.capability;
      const actions = [];
      if (capability.size)
        this.toolbar.append(this.renderSizeButton("decrease"), this.renderSizeButton("increase"));
      if (capability.bold)
        actions.push("bold");
      if (capability.italic)
        actions.push("italic");
      if (capability.underline)
        actions.push("underline");
      if (capability.code)
        actions.push("code");
      if (capability.link)
        actions.push("link");
      if (capability.dynamic)
        actions.push("dynamic");
      for (const action of actions) {
        const button = document.createElement("button");
        button.className = "tool";
        button.type = "button";
        button.innerHTML = this.actionIcon(action);
        button.title = this.actionTitle(action);
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.runAction(action);
        });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        this.toolbar.append(button);
      }
    }
    renderSizeButton(direction) {
      const button = document.createElement("button");
      button.className = "tool size-tool";
      button.type = "button";
      button.title = direction === "increase" ? "Increase text size" : "Decrease text size";
      button.textContent = direction === "increase" ? "+" : "-";
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.stepTextSize(direction);
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      return button;
    }
    runAction(action) {
      if (action !== "dynamic" && (!this._savedRange || this._savedRange.collapsed))
        return;
      if (action === "bold") {
        this.toggleRange("strong");
      } else if (action === "italic") {
        this.toggleRange("em");
      } else if (action === "underline") {
        this.toggleRange("u");
      } else if (action === "code") {
        this.toggleRange("code");
      } else if (action === "link") {
        if (this.unwrapMatchingRange("a")) {
          this.finishAction();
          return;
        }
        const href = window.prompt("Link URL");
        if (href)
          this.wrapRange("a", { href });
      } else {
        const expression = window.prompt("Data expression");
        if (expression)
          this.insertText(asInterpolation(expression));
      }
      this.finishAction();
    }
    stepTextSize(direction) {
      if (!this._savedRange || this._savedRange.collapsed)
        return;
      const range = this.getUsableRange();
      if (!range)
        return;
      const wrapper = this.findRangeWrapper(range, "span", (element) => element.style.fontSize !== "");
      const currentIndex = wrapper ? TEXT_SIZE_STEPS.indexOf(wrapper.style.fontSize) : 1;
      const fallbackIndex = currentIndex >= 0 ? currentIndex : 1;
      const nextIndex = direction === "increase" ? Math.min(TEXT_SIZE_STEPS.length - 1, fallbackIndex + 1) : Math.max(0, fallbackIndex - 1);
      if (wrapper)
        this.unwrapElement(wrapper);
      this.applySpanStyle("fontSize", TEXT_SIZE_STEPS[nextIndex]);
    }
    applySpanStyle(property, value) {
      if (!this._savedRange || this._savedRange.collapsed)
        return;
      if (!value) {
        if (this.unwrapMatchingRange("span", (element) => element.style[property] !== "")) {
          this.finishAction();
        }
        return;
      }
      this.wrapRange("span", { style: `${this.cssPropertyName(property)}: ${value}` });
      this.finishAction();
    }
    cssPropertyName(property) {
      return property === "fontSize" ? "font-size" : "color";
    }
    finishAction() {
      this.editor.focus();
      this.restoreSelection();
      this.emitInput();
    }
    toggleRange(tagName) {
      if (this.unwrapMatchingRange(tagName))
        return;
      this.wrapRange(tagName);
    }
    wrapRange(tagName, attributes = {}) {
      const range = this.getUsableRange();
      if (!range)
        return;
      if (range.collapsed)
        return;
      const wrapper = document.createElement(tagName);
      for (const [name, value] of Object.entries(attributes)) {
        wrapper.setAttribute(name, value);
      }
      wrapper.append(range.extractContents());
      range.insertNode(wrapper);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(wrapper);
      this.setSavedRange(nextRange);
    }
    unwrapMatchingRange(tagName, predicate = () => true) {
      const range = this.getUsableRange();
      if (!range)
        return false;
      const wrapper = this.findRangeWrapper(range, tagName, predicate);
      if (!wrapper)
        return false;
      this.unwrapElement(wrapper);
      return true;
    }
    findRangeWrapper(range, tagName, predicate) {
      const start = this.closestWrapper(range.startContainer, tagName, predicate);
      if (!start)
        return null;
      const end = this.closestWrapper(range.endContainer, tagName, predicate);
      if (start === end)
        return start;
      return null;
    }
    closestWrapper(node, tagName, predicate) {
      const normalizedTag = tagName.toUpperCase();
      let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
      while (current && current !== this.editor) {
        if (current instanceof HTMLElement && current.tagName === normalizedTag && predicate(current)) {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    }
    unwrapElement(element) {
      const fragment = document.createDocumentFragment();
      const firstChild = element.firstChild;
      const lastChild = element.lastChild;
      while (element.firstChild) {
        fragment.append(element.firstChild);
      }
      element.replaceWith(fragment);
      const nextRange = document.createRange();
      if (firstChild && lastChild) {
        nextRange.setStartBefore(firstChild);
        nextRange.setEndAfter(lastChild);
      } else {
        nextRange.selectNodeContents(this.editor);
        nextRange.collapse(false);
      }
      this.setSavedRange(nextRange);
    }
    insertText(text) {
      const range = this.getUsableRange();
      if (!range) {
        this.editor.append(text);
        const nextRange2 = document.createRange();
        nextRange2.selectNodeContents(this.editor);
        nextRange2.collapse(false);
        this.setSavedRange(nextRange2);
        return;
      }
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      const nextRange = document.createRange();
      nextRange.setStartAfter(node);
      nextRange.collapse(true);
      this.setSavedRange(nextRange);
    }
    getSelection() {
      const shadowSelection = this.shadowRoot.getSelection?.();
      return shadowSelection ?? this.ownerDocument.getSelection();
    }
    saveSelection = () => {
      const selection = this.getSelection();
      if (!selection || selection.rangeCount === 0)
        return;
      const range = selection.getRangeAt(0);
      if (!this.editor.contains(range.commonAncestorContainer))
        return;
      this._savedRange = range.cloneRange();
    };
    getUsableRange() {
      if (this._savedRange && this.editor.contains(this._savedRange.commonAncestorContainer)) {
        return this._savedRange.cloneRange();
      }
      const selection = this.getSelection();
      if (!selection || selection.rangeCount === 0)
        return null;
      const range = selection.getRangeAt(0);
      if (!this.editor.contains(range.commonAncestorContainer))
        return null;
      return range.cloneRange();
    }
    setSavedRange(range) {
      this._savedRange = range.cloneRange();
    }
    restoreSelection() {
      if (!this._savedRange)
        return;
      const selection = this.getSelection();
      if (!selection)
        return;
      selection.removeAllRanges();
      selection.addRange(this._savedRange);
    }
    actionIcon(action) {
      const icons = {
        bold: "<strong>B</strong>",
        italic: "<em>I</em>",
        underline: '<span class="underline-icon">U</span>',
        code: "<span>{}</span>",
        link: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/></svg>`,
        dynamic: `<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>`
      };
      return icons[action];
    }
    actionTitle(action) {
      if (action === "bold")
        return "Bold";
      if (action === "italic")
        return "Italic";
      if (action === "underline")
        return "Underline";
      if (action === "code")
        return "Code";
      if (action === "link")
        return "Link";
      return "Dynamic data";
    }
    emitInput = () => {
      this.dispatchEvent(new CustomEvent("input", {
        bubbles: true,
        composed: true,
        detail: { value: this.editor.innerHTML }
      }));
    };
    get capability() {
      const raw = this.getAttribute("capability") ?? "{}";
      try {
        return JSON.parse(raw);
      } catch {
        return { format: "richtext" };
      }
    }
    get label() {
      return this.shadowRoot.querySelector(".label");
    }
    get hint() {
      return this.shadowRoot.querySelector(".hint");
    }
    get toolbar() {
      return this.shadowRoot.querySelector(".toolbar");
    }
    get editor() {
      return this.shadowRoot.querySelector(".editor");
    }
  }
  if (!customElements.get("cms-editor-v2-rich-text-editor")) {
    customElements.define("cms-editor-v2-rich-text-editor", RichTextEditor);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/Select/template.html
  var template_default14 = `<label class="field">
    <span class="label"></span>
    <select></select>
    <span class="hint"></span>
</label>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Select/style.css
  var style_default13 = `:host {
    display: block;
}

* {
    box-sizing: border-box;
}

.field {
    display: grid;
    gap: 5px;
}

.label {
    color: var(--editor-v2-label);
    font-size: 12px;
    font-weight: 640;
}

.hint {
    color: var(--editor-v2-muted);
    font-size: 11px;
}

select {
    width: 100%;
    min-height: 32px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    padding: 0 8px;
    font: inherit;
    font-size: 12px;
}

select:disabled {
    border-color: color-mix(in srgb, var(--editor-v2-border) 70%, transparent);
    background: color-mix(in srgb, var(--editor-v2-surface-muted) 82%, var(--editor-v2-surface));
    color: var(--editor-v2-muted);
    cursor: not-allowed;
    opacity: .72;
}

.hint:empty {
    display: none;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Select/Select.ts
  var template11 = document.createElement("template");
  template11.innerHTML = `<style>${String(style_default13)}</style>${String(template_default14)}`;

  class Select extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template11.content.cloneNode(true));
    }
    connectedCallback() {
      this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") ?? "";
      this.shadowRoot.querySelector(".hint").textContent = this.getAttribute("hint") ?? "";
      const current = this.getAttribute("value");
      const options = this._parseOptions();
      this.shadowRoot.querySelector("select").replaceChildren(...options.map((option) => {
        const element = document.createElement("option");
        element.textContent = option.label;
        element.value = option.value;
        element.selected = option.value === current;
        return element;
      }));
    }
    _parseOptions() {
      const raw = this.getAttribute("options") ?? "";
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => {
            return Boolean(item) && typeof item === "object" && typeof item.label === "string" && typeof item.value === "string";
          });
        }
      } catch {}
      return raw.split(",").map((item) => item.trim()).filter(Boolean).map((item) => ({ label: item, value: item }));
    }
  }
  if (!customElements.get("cms-editor-v2-select")) {
    customElements.define("cms-editor-v2-select", Select);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/Toggle/template.html
  var template_default15 = `<button class="toggle" type="button" aria-pressed="false">
    <span class="copy">
        <span class="label"></span>
        <span class="hint"></span>
    </span>
    <span class="switch"></span>
</button>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Toggle/style.css
  var style_default14 = `:host {
    display: block;
}

* {
    box-sizing: border-box;
}

.toggle {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface-muted);
    color: var(--editor-v2-text);
    padding: 10px 11px;
    font: inherit;
    text-align: left;
}

.toggle:disabled {
    border-color: color-mix(in srgb, var(--editor-v2-border) 70%, transparent);
    background: color-mix(in srgb, var(--editor-v2-surface-muted) 82%, var(--editor-v2-surface));
    color: var(--editor-v2-muted);
    cursor: not-allowed;
    opacity: .72;
}

.toggle:disabled .switch {
    background: var(--editor-v2-border);
}

.copy {
    display: grid;
    gap: 2px;
}

.label {
    font-size: 12px;
    font-weight: 700;
}

.hint {
    color: var(--editor-v2-muted);
    font-size: 11px;
    line-height: 1.35;
}

.switch {
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: var(--editor-v2-border-strong);
    padding: 2px;
}

.switch::after {
    content: "";
    display: block;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: #fff;
}

:host([checked]) .switch {
    background: var(--editor-v2-accent);
}

:host([checked]) .switch::after {
    transform: translateX(14px);
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/Toggle/Toggle.ts
  var template12 = document.createElement("template");
  template12.innerHTML = `<style>${String(style_default14)}</style>${String(template_default15)}`;

  class Toggle extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template12.content.cloneNode(true));
    }
    connectedCallback() {
      this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") ?? "";
      this.shadowRoot.querySelector(".hint").textContent = this.getAttribute("hint") ?? "";
      this.shadowRoot.querySelector("button").ariaPressed = String(this.hasAttribute("checked"));
    }
  }
  if (!customElements.get("cms-editor-v2-toggle")) {
    customElements.define("cms-editor-v2-toggle", Toggle);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/SegmentedControl/template.html
  var template_default16 = `<div class="segmented">
    <slot></slot>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/SegmentedControl/style.css
  var style_default15 = `:host {
    display: block;
}

.segmented {
    display: flex;
    gap: 2px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface-muted);
    padding: 3px;
}

::slotted(button) {
    flex: 1;
    min-height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
}

::slotted(button:disabled) {
    color: color-mix(in srgb, var(--editor-v2-muted) 72%, transparent);
    cursor: not-allowed;
    opacity: .62;
}

::slotted(button[aria-pressed="true"]:disabled) {
    background: color-mix(in srgb, var(--editor-v2-surface-muted) 84%, var(--editor-v2-surface));
    color: var(--editor-v2-muted);
    box-shadow: none;
}

::slotted(button[aria-pressed="true"]) {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    box-shadow: 0 1px 2px rgba(16, 24, 21, .08);
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/SegmentedControl/SegmentedControl.ts
  var template13 = document.createElement("template");
  template13.innerHTML = `<style>${String(style_default15)}</style>${String(template_default16)}`;

  class SegmentedControl extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template13.content.cloneNode(true));
    }
  }
  if (!customElements.get("cms-editor-v2-segmented-control")) {
    customElements.define("cms-editor-v2-segmented-control", SegmentedControl);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/PageLink/template.html
  var template_default17 = `<div class="page-link">
    <div class="head">
        <span class="label"></span>
        <span class="hint"></span>
    </div>
    <div class="tabs" role="tablist"></div>
    <div class="panel page-panel">
        <input class="search" type="search" placeholder="Search pages" />
        <div class="picker" hidden>
            <div class="page-list" role="listbox"></div>
            <div class="empty" hidden>No pages found</div>
        </div>
    </div>
    <div class="panel external-panel" hidden>
        <input class="external-input" type="url" placeholder="https://example.com" />
    </div>
    <div class="panel media-panel" hidden>
        <button class="file-button" type="button">
            <span class="file-preview" aria-hidden="true"></span>
            <span class="file-copy">
                <strong class="file-title">Choose file</strong>
                <code class="file-value">No file selected</code>
            </span>
            <span class="file-action">Change</span>
        </button>
    </div>
    <div class="target">
        <span class="icon">↗</span>
        <span class="copy">
            <strong></strong>
            <code></code>
        </span>
    </div>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/PageLink/style.css
  var style_default16 = `:host {
    display: block;
}

:host([disabled]) {
    cursor: not-allowed;
}

* {
    box-sizing: border-box;
}

.page-link {
    display: grid;
    gap: 7px;
}

.head {
    display: grid;
    gap: 2px;
}

.label {
    color: var(--editor-v2-label);
    font-size: 12px;
    font-weight: 720;
}

.hint {
    color: var(--editor-v2-muted);
    font-size: 11px;
    line-height: 1.35;
}

.tabs {
    display: flex;
    gap: 2px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface-muted);
    padding: 3px;
}

.tabs:empty {
    display: none;
}

.tabs[hidden] {
    display: none;
}

button {
    font: inherit;
}

.tabs button {
    flex: 1;
    min-height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-muted);
    font-size: 12px;
    font-weight: 650;
}

.tabs button[aria-selected="true"] {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    box-shadow: 0 1px 2px rgba(16, 24, 21, .08);
}

.panel {
    display: grid;
    gap: 6px;
}

.panel[hidden] {
    display: none;
}

.page-panel {
    position: relative;
}

.search,
.external-input {
    width: 100%;
    min-height: 32px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    outline: none;
    padding: 0 10px;
}

.file-button {
    display: grid;
    gap: 8px;
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--editor-v2-border) 76%, transparent);
    border-radius: 8px;
    background: var(--editor-v2-surface-muted);
    color: var(--editor-v2-text);
    padding: 8px;
    cursor: pointer;
    text-align: left;
}

.file-button:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 32%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 4%, var(--editor-v2-surface));
}

.file-preview {
    display: grid;
    overflow: hidden;
    place-items: center;
    width: 100%;
    min-height: 112px;
    aspect-ratio: 16 / 9;
    border-radius: 7px;
    background: color-mix(in srgb, var(--editor-v2-accent) 10%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
    font-size: 18px;
}

.file-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
}

.file-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
}

.file-title,
.file-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.file-value[hidden] {
    display: none;
}

.file-action {
    justify-self: start;
    color: var(--editor-v2-accent);
    font-size: 11px;
    font-weight: 720;
}

.search:focus,
.external-input:focus {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 46%, var(--editor-v2-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--editor-v2-accent) 10%, transparent);
}

.picker {
    position: absolute;
    z-index: 20;
    top: calc(100% + 4px);
    right: 0;
    left: 0;
    overflow: hidden;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface);
    box-shadow: 0 12px 28px rgba(16, 24, 21, .14);
}

.picker[hidden] {
    display: none;
}

.page-list {
    display: grid;
    max-height: 184px;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 4px;
}

.page-option {
    display: grid;
    gap: 2px;
    min-height: 34px;
    width: 100%;
    min-width: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-text);
    padding: 6px 7px;
    text-align: left;
    cursor: pointer;
}

.page-option:hover {
    background: color-mix(in srgb, var(--editor-v2-accent) 4%, var(--editor-v2-surface));
}

.page-option[aria-selected="true"] {
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
}

.page-title {
    overflow: hidden;
    min-width: 0;
    font-size: 12px;
    font-weight: 720;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.page-path {
    overflow: hidden;
    min-width: 0;
    color: var(--editor-v2-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.empty {
    color: var(--editor-v2-muted);
    font-size: 12px;
    padding: 10px 11px;
}

.target {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 34px;
    border: 1px solid color-mix(in srgb, var(--editor-v2-border) 76%, transparent);
    border-radius: 7px;
    background: var(--editor-v2-surface-muted);
    padding: 6px 8px;
    cursor: pointer;
}

.target[hidden] {
    display: none;
}

.icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--editor-v2-accent) 12%, var(--editor-v2-surface));
    color: var(--editor-v2-accent);
    font-size: 12px;
}

.copy {
    min-width: 0;
    display: grid;
    gap: 2px;
}

strong {
    overflow: hidden;
    color: var(--editor-v2-text);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

code {
    overflow: hidden;
    color: var(--editor-v2-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

:host([disabled]) button,
:host([disabled]) input,
:host([disabled]) .target {
    opacity: .62;
    cursor: not-allowed;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/FilesCenter/template.html
  var template_default18 = `<div class="backdrop" hidden>
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="files-title">
        <header class="top">
            <div>
                <h2 id="files-title">Choose file</h2>
                <p>Select a file from the CMS library.</p>
            </div>
            <button class="icon-button close" type="button" aria-label="Close">×</button>
        </header>

        <div class="toolbar">
            <nav class="breadcrumb" aria-label="Current folder"></nav>
            <input class="search" type="search" placeholder="Search files" />
        </div>

        <div class="grid" role="listbox"></div>
        <div class="empty" hidden>No files found</div>

        <footer class="footer">
            <div class="selection">
                <strong>No file selected</strong>
                <code>Choose a file</code>
            </div>
            <div class="actions">
                <button class="secondary cancel" type="button">Cancel</button>
                <button class="primary select" type="button" disabled>Select file</button>
            </div>
        </footer>
    </section>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/FilesCenter/style.css
  var style_default17 = `:host {
    color: var(--editor-v2-text, #111);
    font: 12px/1.35 system-ui, sans-serif;
}

* {
    box-sizing: border-box;
}

.backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0;
    display: grid;
    place-items: start center;
    overflow: auto;
    background: rgba(16, 24, 21, .34);
    padding: 72px 24px 24px;
}

.backdrop[hidden] {
    display: none;
}

.modal {
    display: grid;
    grid-template-rows: auto auto minmax(180px, 1fr) auto;
    width: min(940px, calc(100vw - 48px));
    max-height: min(760px, calc(100vh - 96px));
    overflow: hidden;
    border: 1px solid var(--editor-v2-border, #d7ddd9);
    border-radius: 8px;
    background: var(--editor-v2-surface, #fff);
    box-shadow: 0 24px 70px rgba(16, 24, 21, .22);
}

.top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--editor-v2-border, #d7ddd9);
    padding: 16px 18px;
}

h2,
p {
    margin: 0;
}

h2 {
    font-size: 15px;
    font-weight: 760;
}

p {
    margin-top: 3px;
    color: var(--editor-v2-muted, #708078);
}

button,
input {
    font: inherit;
}

.icon-button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--editor-v2-border, #d7ddd9);
    border-radius: 7px;
    background: var(--editor-v2-surface, #fff);
    cursor: pointer;
}

.toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 10px;
    align-items: center;
    border-bottom: 1px solid var(--editor-v2-border, #d7ddd9);
    padding: 10px 12px;
}

.breadcrumb {
    display: flex;
    min-width: 0;
    gap: 4px;
    overflow: hidden;
}

.breadcrumb button {
    min-width: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-muted, #708078);
    cursor: pointer;
    font-weight: 650;
    padding: 5px 7px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.breadcrumb button:hover,
.breadcrumb button[aria-current="page"] {
    background: var(--editor-v2-surface-muted, #f5f7f6);
    color: var(--editor-v2-text, #111);
}

.search {
    min-height: 32px;
    min-width: 0;
    border: 1px solid var(--editor-v2-border, #d7ddd9);
    border-radius: 7px;
    outline: none;
    padding: 0 10px;
}

.search:focus {
    border-color: color-mix(in srgb, var(--editor-v2-accent, #176b58) 46%, var(--editor-v2-border, #d7ddd9));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--editor-v2-accent, #176b58) 10%, transparent);
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    align-content: start;
    gap: 10px;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 12px;
}

.item {
    display: grid;
    grid-template-rows: 108px auto;
    gap: 8px;
    min-height: 168px;
    min-width: 0;
    border: 1px solid var(--editor-v2-border, #d7ddd9);
    border-radius: 7px;
    background: var(--editor-v2-surface, #fff);
    color: var(--editor-v2-text, #111);
    cursor: pointer;
    padding: 8px;
    text-align: left;
}

.item:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent, #176b58) 34%, var(--editor-v2-border, #d7ddd9));
    background: color-mix(in srgb, var(--editor-v2-accent, #176b58) 4%, var(--editor-v2-surface, #fff));
}

.item[aria-selected="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent, #176b58) 66%, var(--editor-v2-border, #d7ddd9));
    background: color-mix(in srgb, var(--editor-v2-accent, #176b58) 8%, var(--editor-v2-surface, #fff));
}

.preview {
    display: grid;
    place-items: center;
    overflow: hidden;
    width: 100%;
    height: 108px;
    border-radius: 6px;
    background: var(--editor-v2-surface-muted, #f5f7f6);
    color: var(--editor-v2-accent, #176b58);
}

.preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.preview svg {
    width: 46px;
    height: 46px;
    fill: color-mix(in srgb, var(--editor-v2-accent, #176b58) 72%, var(--editor-v2-text, #111));
    opacity: .9;
}

.item[data-type="folder"] .preview {
    background: color-mix(in srgb, #e2b45c 16%, var(--editor-v2-surface-muted, #f5f7f6));
    color: #9a6a10;
}

.item[data-type="folder"] .preview svg {
    fill: currentColor;
}

.item[data-type="pdf"] .preview {
    background: color-mix(in srgb, #c84d4d 12%, var(--editor-v2-surface-muted, #f5f7f6));
    color: #9d3030;
}

.preview text {
    fill: currentColor;
    font: 700 5px system-ui, sans-serif;
}

.copy {
    display: grid;
    min-width: 0;
    gap: 1px;
}

.name,
.meta,
.selection strong,
.selection code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.name {
    font-weight: 720;
}

.meta,
.selection code {
    color: var(--editor-v2-muted, #708078);
    font-size: 11px;
}

.empty {
    color: var(--editor-v2-muted, #708078);
    padding: 18px;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--editor-v2-border, #d7ddd9);
    padding: 12px;
}

.selection {
    display: grid;
    min-width: 0;
    gap: 2px;
}

.actions {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
}

.secondary,
.primary {
    min-height: 32px;
    border-radius: 7px;
    cursor: pointer;
    font-weight: 720;
    padding: 0 12px;
}

.secondary {
    border: 1px solid var(--editor-v2-border, #d7ddd9);
    background: var(--editor-v2-surface, #fff);
    color: var(--editor-v2-text, #111);
}

.primary {
    border: 1px solid var(--editor-v2-accent, #176b58);
    background: var(--editor-v2-accent, #176b58);
    color: #fff;
}

.primary:disabled {
    opacity: .45;
    cursor: not-allowed;
}

@media (max-width: 720px) {
    .toolbar {
        grid-template-columns: 1fr;
    }

    .modal {
        width: calc(100vw - 24px);
    }
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/FilesCenter/FilesCenter.ts
  var template14 = document.createElement("template");
  template14.innerHTML = `<style>${String(style_default17)}</style>${String(template_default18)}`;

  class FilesCenter extends HTMLElement {
    _folder = null;
    _trail = [{ id: null, label: "Files" }];
    _items = [];
    _selected = null;
    _selectedMany = [];
    _wired = false;
    _accept = ["folder", "file"];
    _fileAccept = null;
    _multiple = false;
    _maxSelection = null;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template14.content.cloneNode(true));
    }
    connectedCallback() {
      this._wire();
    }
    show(options = {}) {
      this._wire();
      this._accept = options.accept ?? ["folder", "file"];
      this._fileAccept = options.fileAccept ?? null;
      this._multiple = options.multiple === true;
      this._maxSelection = typeof options.maxSelection === "number" ? Math.max(1, options.maxSelection) : null;
      this._folder = null;
      this._trail = [{ id: null, label: "Files" }];
      this._selected = null;
      this._selectedMany = [];
      this.searchInput.value = "";
      this.backdrop.hidden = false;
      this._load();
    }
    _wire() {
      if (this._wired)
        return;
      this._wired = true;
      this.closeButton.addEventListener("click", () => this._close());
      this.cancelButton.addEventListener("click", () => this._close());
      this.backdrop.addEventListener("click", (event) => {
        if (event.target === this.backdrop)
          this._close();
      });
      this.selectButton.addEventListener("click", () => this._confirm());
      this.searchInput.addEventListener("input", () => this._renderItems());
    }
    async _load() {
      this._selected = null;
      this._updateSelection();
      const params = new URLSearchParams;
      if (this._folder)
        params.set("parentId", this._folder);
      params.set("accept", this._accept.join(","));
      params.set("sortBy", "name");
      params.set("limit", "10000");
      const response = await fetch(`${this._basePath()}/api/files?${params.toString()}`);
      if (!response.ok) {
        this._items = [];
      } else {
        const page = await response.json();
        this._items = page.items;
      }
      this._render();
    }
    _render() {
      this._renderBreadcrumb();
      this._renderItems();
      this._updateSelection();
    }
    _renderBreadcrumb() {
      this.breadcrumb.replaceChildren();
      this._trail.forEach((entry, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = entry.label;
        button.ariaCurrent = index === this._trail.length - 1 ? "page" : null;
        button.addEventListener("click", () => {
          this._folder = entry.id;
          this._trail = this._trail.slice(0, index + 1);
          this._load();
        });
        this.breadcrumb.append(button);
      });
    }
    _renderItems() {
      this.grid.replaceChildren();
      const query = this.searchInput.value.trim().toLowerCase();
      const items = this._items.filter((item) => {
        if (item.type === "file" && !this._matchesFileAccept(item))
          return false;
        if (!query)
          return true;
        return item.name.toLowerCase().includes(query);
      });
      this.empty.hidden = items.length > 0;
      for (const item of items) {
        const button = document.createElement("button");
        button.className = "item";
        button.dataset.type = item.type === "folder" ? "folder" : this._fileKind(item);
        button.type = "button";
        button.ariaSelected = String(this._isSelected(item));
        button.addEventListener("click", () => {
          if (item.type === "folder") {
            this._openFolder(item);
            return;
          }
          this._selectFile(item);
          this._renderItems();
          this._updateSelection();
        });
        button.addEventListener("dblclick", () => {
          if (item.type === "file" && !this._multiple)
            this._confirm();
        });
        const preview = this._preview(item);
        const copy = document.createElement("span");
        copy.className = "copy";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = item.name;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = item.type === "folder" ? "Folder" : this._fileMeta(item);
        copy.append(name, meta);
        button.append(preview, copy);
        this.grid.append(button);
      }
    }
    _openFolder(item) {
      this._folder = item.id;
      this._trail.push({ id: item.id, label: item.name });
      this.searchInput.value = "";
      this._load();
    }
    _updateSelection() {
      if (this._multiple) {
        const count = this._selectedMany.length;
        this.selectButton.disabled = count === 0;
        this.selectButton.textContent = count === 1 ? "Select 1 file" : `Select ${count} files`;
        this.selectionTitle.textContent = count === 0 ? "No files selected" : `${count} files selected`;
        this.selectionValue.textContent = this._maxSelection ? `Up to ${this._maxSelection} files` : "Choose files";
        return;
      }
      this.selectButton.disabled = !this._selected;
      this.selectButton.textContent = "Select file";
      this.selectionTitle.textContent = this._selected?.name ?? "No file selected";
      this.selectionValue.textContent = this._selected ? this._fileMeta(this._selected) : "Choose a file";
    }
    _confirm() {
      if (this._multiple) {
        if (this._selectedMany.length === 0)
          return;
        this.dispatchEvent(new CustomEvent("select-files", {
          bubbles: true,
          composed: true,
          detail: {
            files: this._selectedMany.map((file) => this._fileDetail(file))
          }
        }));
        this._close();
        return;
      }
      if (!this._selected)
        return;
      this.dispatchEvent(new CustomEvent("select-file", {
        bubbles: true,
        composed: true,
        detail: this._fileDetail(this._selected)
      }));
      this._close();
    }
    _selectFile(item) {
      if (!this._multiple) {
        this._selected = item;
        return;
      }
      const existingIndex = this._selectedMany.findIndex((selected) => selected.id === item.id);
      if (existingIndex >= 0) {
        this._selectedMany.splice(existingIndex, 1);
        return;
      }
      if (this._maxSelection && this._selectedMany.length >= this._maxSelection)
        return;
      this._selectedMany.push(item);
    }
    _isSelected(item) {
      if (this._multiple)
        return this._selectedMany.some((selected) => selected.id === item.id);
      return this._selected?.id === item.id;
    }
    _fileDetail(item) {
      return {
        id: item.id,
        label: item.name,
        src: this._fileUrl(item.id),
        mimeType: item.mimeType
      };
    }
    _close() {
      this.backdrop.hidden = true;
      this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
    }
    _fileUrl(id) {
      return `${this._basePath()}/.cms/files/by-id/${encodeURIComponent(id)}`;
    }
    _preview(item) {
      const preview = document.createElement("span");
      preview.className = "preview";
      if (item.type === "folder") {
        preview.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.8A2.8 2.8 0 0 1 5.8 4h4.1l2 2H18.2A2.8 2.8 0 0 1 21 8.8v8.4a2.8 2.8 0 0 1-2.8 2.8H5.8A2.8 2.8 0 0 1 3 17.2Z"/></svg>`;
        return preview;
      }
      if (item.mimeType?.startsWith("image/")) {
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.src = this._fileUrl(item.id);
        preview.append(image);
        return preview;
      }
      preview.innerHTML = this._fileKind(item) === "pdf" ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><text x="7" y="17">PDF</text></svg>` : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></svg>`;
      return preview;
    }
    _fileKind(item) {
      if (item.mimeType?.startsWith("image/"))
        return "image";
      if (item.mimeType?.includes("pdf"))
        return "pdf";
      return "file";
    }
    _matchesFileAccept(item) {
      if (!this._fileAccept || this._fileAccept.length === 0)
        return true;
      const mimeType = item.mimeType ?? "";
      if (this._fileAccept.includes("image") && mimeType.startsWith("image/"))
        return true;
      if (this._fileAccept.includes("svg") && mimeType === "image/svg+xml")
        return true;
      if (this._fileAccept.includes("bitmap") && mimeType.startsWith("image/") && mimeType !== "image/svg+xml")
        return true;
      if (this._fileAccept.includes("video") && mimeType.startsWith("video/"))
        return true;
      if (this._fileAccept.includes("audio") && mimeType.startsWith("audio/"))
        return true;
      if (this._fileAccept.includes("document") && !mimeType.startsWith("image/") && !mimeType.startsWith("video/") && !mimeType.startsWith("audio/"))
        return true;
      return false;
    }
    _fileMeta(item) {
      const parts = [item.mimeType ?? "File"];
      if (typeof item.size === "number")
        parts.push(this._formatSize(item.size));
      return parts.join(" · ");
    }
    _formatSize(size) {
      if (size < 1024)
        return `${size} B`;
      if (size < 1024 * 1024)
        return `${Math.round(size / 1024)} KB`;
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    }
    _basePath() {
      return document.querySelector('meta[name="basePath"]')?.content ?? "";
    }
    get backdrop() {
      return this.shadowRoot.querySelector(".backdrop");
    }
    get closeButton() {
      return this.shadowRoot.querySelector(".close");
    }
    get cancelButton() {
      return this.shadowRoot.querySelector(".cancel");
    }
    get selectButton() {
      return this.shadowRoot.querySelector(".select");
    }
    get searchInput() {
      return this.shadowRoot.querySelector(".search");
    }
    get breadcrumb() {
      return this.shadowRoot.querySelector(".breadcrumb");
    }
    get grid() {
      return this.shadowRoot.querySelector(".grid");
    }
    get empty() {
      return this.shadowRoot.querySelector(".empty");
    }
    get selectionTitle() {
      return this.shadowRoot.querySelector(".selection strong");
    }
    get selectionValue() {
      return this.shadowRoot.querySelector(".selection code");
    }
  }
  if (!customElements.get("cms-editor-v2-files-center")) {
    customElements.define("cms-editor-v2-files-center", FilesCenter);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/PageLink/PageLink.ts
  var template15 = document.createElement("template");
  template15.innerHTML = `<style>${String(style_default16)}</style>${String(template_default17)}`;

  class PageLink extends HTMLElement {
    _pages = [];
    _mode = "page";
    _value = "";
    _loaded = false;
    _wired = false;
    _pickerOpen = false;
    _isReflectingValue = false;
    _mediaLabel = "";
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template15.content.cloneNode(true));
    }
    connectedCallback() {
      this._syncFromAttributes();
      this._wire();
      this._loadPages();
      this._render();
    }
    static get observedAttributes() {
      return ["label", "hint", "value", "allow-page", "allow-external", "allow-media", "disabled"];
    }
    attributeChangedCallback() {
      if (!this.shadowRoot)
        return;
      if (this._isReflectingValue)
        return;
      this._syncFromAttributes();
      this._render();
    }
    get value() {
      return this._value;
    }
    set value(value) {
      this._value = value;
      this._reflectValue(value);
      this._render();
    }
    _syncFromAttributes() {
      this._value = this.getAttribute("value") ?? "";
      if (this._value && this._isMedia(this._value)) {
        this._mode = "media";
      } else if (this._value && this._isExternal(this._value)) {
        this._mode = "external";
      } else if (!this._allowPage() && !this._allowExternal() && this._allowMedia()) {
        this._mode = "media";
      } else if (!this._allowPage() && this._allowExternal()) {
        this._mode = "external";
      } else {
        this._mode = "page";
      }
    }
    _wire() {
      if (this._wired)
        return;
      this._wired = true;
      this.searchInput.addEventListener("focus", () => this._openPicker());
      this.searchInput.addEventListener("click", () => this._openPicker());
      this.searchInput.addEventListener("input", () => {
        this._pickerOpen = true;
        this._renderPages();
      });
      this.externalInput.addEventListener("input", () => {
        if (this.disabled)
          return;
        this._setValue(this.externalInput.value);
      });
      this.fileButton.addEventListener("click", () => this._openFilesCenter());
      this.pagePanel.addEventListener("focusout", () => {
        setTimeout(() => {
          if (this.shadowRoot?.activeElement && this.pagePanel.contains(this.shadowRoot.activeElement))
            return;
          this._closePicker();
        }, 0);
      });
      this.target.addEventListener("click", () => {
        if (this.disabled || this._mode !== "page")
          return;
        this.searchInput.focus();
        this._openPicker();
      });
    }
    async _loadPages() {
      if (this._loaded || !this._allowPage())
        return;
      this._loaded = true;
      try {
        const response = await fetch(`${this._basePath()}/api/page/links`);
        if (!response.ok)
          return;
        this._pages = await response.json();
        this._renderPages();
        this._renderSummary();
      } catch {
        this._pages = [];
        this._renderPages();
      }
    }
    _render() {
      this.label.textContent = this.getAttribute("label") ?? "Link";
      this.hint.textContent = this.getAttribute("hint") ?? "";
      this.hint.toggleAttribute("hidden", !this.hint.textContent);
      this._renderTabs();
      this._renderPanels();
      this._renderPages();
      this._renderSummary();
    }
    _renderTabs() {
      this.tabs.replaceChildren();
      if (this._allowedModes().length <= 1) {
        this.tabs.hidden = true;
        return;
      }
      this.tabs.hidden = false;
      if (this._allowPage()) {
        this.tabs.append(this._tab("Page", "page"));
      }
      if (this._allowExternal()) {
        this.tabs.append(this._tab("External", "external"));
      }
      if (this._allowMedia()) {
        this.tabs.append(this._tab("Media", "media"));
      }
    }
    _tab(label, mode) {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "tab";
      button.textContent = label;
      button.ariaSelected = String(this._mode === mode);
      button.disabled = this.disabled;
      button.addEventListener("click", () => {
        if (this.disabled)
          return;
        this._mode = mode;
        if (mode !== "page")
          this._pickerOpen = false;
        if (mode === "external")
          this.externalInput.value = this._value;
        this._render();
      });
      return button;
    }
    _renderPanels() {
      this.pagePanel.hidden = this._mode !== "page" || !this._allowPage();
      this.externalPanel.hidden = this._mode !== "external" || !this._allowExternal();
      this.mediaPanel.hidden = this._mode !== "media" || !this._allowMedia();
      this.searchInput.disabled = this.disabled;
      this.externalInput.disabled = this.disabled;
      this.fileButton.disabled = this.disabled;
      this.picker.hidden = !this._pickerOpen || this.pagePanel.hidden;
      if (this._mode === "external")
        this.externalInput.value = this._value;
      this._renderMediaFile();
    }
    _renderPages() {
      this.pageList.replaceChildren();
      this.picker.hidden = !this._pickerOpen || this.pagePanel.hidden;
      const query = this.searchInput.value.trim().toLowerCase();
      const pages = this._pages.filter((page) => {
        if (!query)
          return true;
        return page.title.toLowerCase().includes(query) || page.path.toLowerCase().includes(query);
      });
      this.empty.hidden = !this._pickerOpen || pages.length > 0;
      for (const page of pages) {
        const button = document.createElement("button");
        button.className = "page-option";
        button.type = "button";
        button.ariaSelected = String(page.path === this._value);
        button.disabled = this.disabled;
        button.addEventListener("click", () => {
          if (this.disabled)
            return;
          this._setValue(page.path);
          this.searchInput.value = "";
          this._closePicker();
        });
        const title = document.createElement("span");
        title.className = "page-title";
        title.textContent = page.title;
        const path = document.createElement("span");
        path.className = "page-path";
        path.textContent = page.path;
        button.append(title, path);
        this.pageList.append(button);
      }
    }
    _renderSummary() {
      const page = this._pages.find((candidate) => candidate.path === this._value);
      this.summaryTitle.textContent = page?.title ?? (this._value ? this._summaryFallback() : "No link selected");
      this.summaryValue.textContent = this._value || "Choose a target";
      this.target.hidden = !this._value || this._mode === "media";
    }
    _setValue(value) {
      this._value = value;
      this._reflectValue(value);
      this._renderPages();
      this._renderSummary();
      this._renderMediaFile();
      this.dispatchEvent(new CustomEvent("input", {
        bubbles: true,
        composed: true,
        detail: { value }
      }));
    }
    _openPicker() {
      if (this.disabled || this._mode !== "page")
        return;
      this._pickerOpen = true;
      this._renderPages();
    }
    _closePicker() {
      this._pickerOpen = false;
      this._renderPages();
    }
    _openFilesCenter() {
      if (this.disabled)
        return;
      const center = new FilesCenter;
      const cleanup = () => center.remove();
      center.addEventListener("close", cleanup, { once: true });
      center.addEventListener("select-file", (event) => {
        const detail = event.detail;
        if (!detail?.src)
          return;
        this._mode = "media";
        this._mediaLabel = detail.label;
        this._setValue(detail.src);
      }, { once: true });
      document.body.append(center);
      center.show({ accept: ["folder", "file"] });
    }
    _renderMediaFile() {
      const title = this.fileTitle;
      const value = this.fileValue;
      const preview = this.filePreview;
      const action = this.fileAction;
      const hasValue = this._mode === "media" && this._value !== "";
      const isImage = hasValue && this._isImageMedia(this._value);
      title.textContent = hasValue ? this._mediaDisplayName(this._value, isImage) : "Choose file";
      value.textContent = hasValue ? this._mediaSelectionLabel(isImage) : "No file selected";
      value.toggleAttribute("hidden", hasValue && isImage);
      action.textContent = hasValue ? "Change" : "Choose";
      preview.replaceChildren();
      preview.dataset.kind = isImage ? "image" : "file";
      if (isImage) {
        const image = document.createElement("img");
        image.src = this._value;
        image.alt = "";
        image.loading = "lazy";
        preview.append(image);
        return;
      }
      preview.textContent = "↗";
    }
    _reflectValue(value) {
      this._isReflectingValue = true;
      this.setAttribute("value", value);
      this._isReflectingValue = false;
    }
    _allowPage() {
      return this.getAttribute("allow-page") !== "false";
    }
    _allowExternal() {
      return this.getAttribute("allow-external") !== "false";
    }
    _allowMedia() {
      return this.getAttribute("allow-media") !== "false";
    }
    _allowedModes() {
      const modes = [];
      if (this._allowPage())
        modes.push("page");
      if (this._allowExternal())
        modes.push("external");
      if (this._allowMedia())
        modes.push("media");
      return modes;
    }
    _isExternal(value) {
      return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
    }
    _isMedia(value) {
      return value.includes("/.cms/files/by-id/");
    }
    _isImageMedia(value) {
      return /\.(avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value) || value.includes("/.cms/files/by-id/");
    }
    _mediaDisplayName(value, isImage) {
      if (this._mediaLabel)
        return this._mediaLabel;
      if (value.includes("/.cms/files/by-id/"))
        return isImage ? "Image" : "Selected file";
      const clean = value.split(/[?#]/, 1)[0] ?? value;
      const segment = clean.split("/").filter(Boolean).at(-1);
      if (!segment)
        return "File";
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    }
    _mediaSelectionLabel(isImage) {
      return isImage ? "Image" : "File selected";
    }
    _summaryFallback() {
      if (this._mode === "external")
        return "External URL";
      if (this._mode === "media")
        return "File";
      return "Internal page";
    }
    _basePath() {
      return document.querySelector('meta[name="basePath"]')?.content ?? "";
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    get label() {
      return this.shadowRoot.querySelector(".label");
    }
    get hint() {
      return this.shadowRoot.querySelector(".hint");
    }
    get tabs() {
      return this.shadowRoot.querySelector(".tabs");
    }
    get pagePanel() {
      return this.shadowRoot.querySelector(".page-panel");
    }
    get externalPanel() {
      return this.shadowRoot.querySelector(".external-panel");
    }
    get mediaPanel() {
      return this.shadowRoot.querySelector(".media-panel");
    }
    get searchInput() {
      return this.shadowRoot.querySelector(".search");
    }
    get externalInput() {
      return this.shadowRoot.querySelector(".external-input");
    }
    get fileButton() {
      return this.shadowRoot.querySelector(".file-button");
    }
    get filePreview() {
      return this.shadowRoot.querySelector(".file-preview");
    }
    get fileTitle() {
      return this.shadowRoot.querySelector(".file-title");
    }
    get fileValue() {
      return this.shadowRoot.querySelector(".file-value");
    }
    get fileAction() {
      return this.shadowRoot.querySelector(".file-action");
    }
    get pageList() {
      return this.shadowRoot.querySelector(".page-list");
    }
    get picker() {
      return this.shadowRoot.querySelector(".picker");
    }
    get empty() {
      return this.shadowRoot.querySelector(".empty");
    }
    get summaryTitle() {
      return this.shadowRoot.querySelector(".target strong");
    }
    get summaryValue() {
      return this.shadowRoot.querySelector(".target code");
    }
    get target() {
      return this.shadowRoot.querySelector(".target");
    }
  }
  if (!customElements.get("cms-editor-v2-page-link")) {
    customElements.define("cms-editor-v2-page-link", PageLink);
  }

  // ../../features/cms-editor-system-v2/src/components/Controls/SchemaPicker/template.html
  var template_default19 = `<div class="schema">
    <div class="source">
        <span class="dot"></span>
        <span>
            <strong></strong>
            <code></code>
        </span>
    </div>
    <div class="fields">
        <button type="button">plans[].name</button>
        <button class="active" type="button">plans[].cta.label</button>
        <button type="button">plans[].cta.href</button>
    </div>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/SchemaPicker/style.css
  var style_default18 = `:host {
    display: block;
}

:host([disabled]) {
    cursor: not-allowed;
}

* {
    box-sizing: border-box;
}

.schema {
    display: grid;
    gap: 8px;
}

.source {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface-muted);
    padding: 10px;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--editor-v2-success);
}

strong,
code {
    display: block;
}

strong {
    font-size: 12px;
}

code {
    color: var(--editor-v2-muted);
    font-size: 11px;
}

.fields {
    display: grid;
    gap: 5px;
}

button {
    min-height: 28px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-muted);
    padding: 0 9px;
    font: inherit;
    font-size: 12px;
    text-align: left;
}

:host([disabled]) .source,
:host([disabled]) button {
    border-color: color-mix(in srgb, var(--editor-v2-border) 70%, transparent);
    background: color-mix(in srgb, var(--editor-v2-surface-muted) 82%, var(--editor-v2-surface));
    color: var(--editor-v2-muted);
    cursor: not-allowed;
    opacity: .72;
}

:host([disabled]) .dot {
    background: var(--editor-v2-border-strong);
}

button.active {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 34%, var(--editor-v2-border));
    color: var(--editor-v2-accent);
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
}
`;

  // ../../features/cms-editor-system-v2/src/components/Controls/SchemaPicker/SchemaPicker.ts
  var template16 = document.createElement("template");
  template16.innerHTML = `<style>${String(style_default18)}</style>${String(template_default19)}`;

  class SchemaPicker extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template16.content.cloneNode(true));
    }
    connectedCallback() {
      this.shadowRoot.querySelector("strong").textContent = this.getAttribute("source") ?? "Plans data";
      this.shadowRoot.querySelector("code").textContent = this.getAttribute("path") ?? "urn:supabase:listPlans";
    }
  }
  if (!customElements.get("cms-editor-v2-schema-picker")) {
    customElements.define("cms-editor-v2-schema-picker", SchemaPicker);
  }

  // ../../features/cms-editor-system-v2/src/components/Settings/SettingsView/template.html
  var template_default20 = `<div class="settings-view">
    <div class="empty">Select an editable element</div>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Settings/SettingsView/style.css
  var style_default19 = `:host {
    display: block;
}

.settings-view {
    display: grid;
    gap: 17px;
    padding: 0 12px 16px;
}

.empty,
.section-empty {
    color: var(--editor-v2-muted);
    font-size: 12px;
}

.empty {
    padding: 12px 0;
}

.field {
    display: grid;
    gap: 7px;
}

.field-label {
    color: var(--editor-v2-muted);
    font-size: 11px;
    font-weight: 760;
}

.state-button {
    display: grid;
    gap: 3px;
    width: 100%;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    padding: 9px 10px;
    text-align: left;
    cursor: pointer;
}

.state-button:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 32%, var(--editor-v2-border));
}

.state-button[aria-pressed="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 52%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
}

.state-label {
    font-size: 12px;
    font-weight: 760;
}

.state-description {
    color: var(--editor-v2-muted);
    font-size: 11px;
}

.content-slot {
    display: grid;
    gap: 3px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    padding: 10px 11px;
    background: var(--editor-v2-surface);
}

.content-slot strong {
    font-size: 12px;
}

.content-slot span {
    color: var(--editor-v2-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
}

.content-slot {
    background: color-mix(in srgb, var(--editor-v2-accent) 5%, var(--editor-v2-surface));
}
`;

  // ../../features/cms-editor-system-v2/src/components/Settings/SettingsView/SettingsView.ts
  var template17 = document.createElement("template");
  template17.innerHTML = `<style>${String(style_default19)}</style>${String(template_default20)}`;
  var SETTINGS_VIEW_SETTING_CHANGE_EVENT = "editor-v2:setting-change";
  var SETTINGS_VIEW_CONTENT_CHANGE_EVENT = "editor-v2:content-change";
  var SETTINGS_VIEW_STATE_TOGGLE_EVENT = "editor-v2:state-toggle";

  class SettingsView extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template17.content.cloneNode(true));
    }
    setSettings(sections, textCapability = null, textValue = "", mode = "settings", states = []) {
      const view = this.shadowRoot.querySelector(".settings-view");
      view.replaceChildren();
      const visibleSections = sections.filter((section) => mode === "settings" ? section.kind === "self" : section.kind === "surcharge");
      const shouldRenderText = mode === "settings" && textCapability;
      const shouldRenderStates = mode === "settings" && states.length > 0;
      if (visibleSections.length === 0 && !shouldRenderText && !shouldRenderStates) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = sections.length === 0 && !textCapability ? "Select an editable element" : mode === "settings" ? "No settings" : "No overrides";
        view.append(empty);
        return;
      }
      if (shouldRenderText) {
        view.append(this._renderTextCapability(textCapability, textValue));
      }
      if (shouldRenderStates) {
        view.append(this._renderStates(states));
      }
      for (const section of visibleSections) {
        view.append(this._renderSettingSection(section));
      }
    }
    _renderStates(states) {
      const section = document.createElement("cms-editor-v2-section");
      section.setAttribute("label", "States");
      for (const state of states) {
        const button = document.createElement("button");
        button.className = "state-button";
        button.type = "button";
        button.ariaPressed = String(state.isActive());
        const label = document.createElement("span");
        label.className = "state-label";
        label.textContent = state.label;
        const description = document.createElement("span");
        description.className = "state-description";
        description.textContent = state.description ?? (state.isActive() ? "Active" : "Inactive");
        button.append(label, description);
        button.addEventListener("click", () => {
          this.dispatchEvent(new CustomEvent(SETTINGS_VIEW_STATE_TOGGLE_EVENT, {
            bubbles: true,
            composed: true,
            detail: { state }
          }));
        });
        section.append(button);
      }
      return section;
    }
    _renderSettingSection(section) {
      const element = document.createElement("cms-editor-v2-section");
      element.setAttribute("label", section.kind === "surcharge" ? `${section.label} override` : section.label);
      if (section.settings.length === 0) {
        const empty = document.createElement("div");
        empty.className = "section-empty";
        empty.textContent = "No settings";
        element.append(empty);
        return element;
      }
      for (const setting of section.settings) {
        element.append(this._renderSetting(setting));
      }
      return element;
    }
    _renderSetting(setting) {
      if (setting.type === "textarea") {
        const control2 = this._control("cms-editor-v2-textarea", setting);
        this._wireTextControl(control2, "textarea", setting);
        return control2;
      }
      if (setting.type === "select") {
        const control2 = this._control("cms-editor-v2-select", setting);
        control2.setAttribute("options", JSON.stringify(setting.options));
        this._wireTextControl(control2, "select", setting);
        return control2;
      }
      if (setting.type === "segmented") {
        const wrapper = document.createElement("div");
        wrapper.className = "field";
        const label = document.createElement("div");
        label.className = "field-label";
        label.textContent = setting.label;
        const control2 = document.createElement("cms-editor-v2-segmented-control");
        for (const option of setting.options) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = option.label;
          button.value = option.value;
          button.disabled = setting.disabled === true;
          button.ariaPressed = String(option.value === setting.defaultValue);
          button.addEventListener("click", () => {
            if (setting.disabled)
              return;
            for (const item of Array.from(control2.querySelectorAll("button"))) {
              item.ariaPressed = String(item === button);
            }
            this._emitSettingChange(setting, option.value);
          });
          control2.append(button);
        }
        wrapper.append(label, control2);
        return wrapper;
      }
      if (setting.type === "toggle") {
        const control2 = this._control("cms-editor-v2-toggle", setting);
        if (setting.defaultValue)
          control2.setAttribute("checked", "");
        this._wireToggleControl(control2, setting);
        return control2;
      }
      if (setting.type === "page-link") {
        const control2 = this._control("cms-editor-v2-page-link", setting);
        control2.setAttribute("allow-page", String(setting.allowPage !== false));
        control2.setAttribute("allow-external", String(setting.allowExternal !== false));
        control2.setAttribute("allow-media", String(setting.allowMedia !== false));
        this._applyDisabled(control2, setting);
        this._wirePageLinkControl(control2, setting);
        return control2;
      }
      if (setting.type === "schema-picker") {
        const control2 = document.createElement("cms-editor-v2-schema-picker");
        control2.setAttribute("source", setting.label);
        control2.setAttribute("path", setting.defaultValue ?? setting.attribute);
        this._applyDisabled(control2, setting);
        return control2;
      }
      const control = this._control("cms-editor-v2-text-input", setting);
      this._wireTextControl(control, "input", setting);
      return control;
    }
    _control(tag, setting) {
      const control = document.createElement(tag);
      control.setAttribute("label", setting.label);
      control.setAttribute("value", String(setting.defaultValue ?? ""));
      if (setting.help)
        control.setAttribute("hint", setting.help);
      if (setting.placeholder)
        control.setAttribute("placeholder", setting.placeholder);
      this._applyDisabled(control, setting);
      return control;
    }
    _renderTextCapability(capability, value) {
      const section = document.createElement("cms-editor-v2-section");
      section.setAttribute("label", "Content");
      const setting = {
        type: "text",
        label: capability.format === "richtext" ? "Rich text" : "Text",
        attribute: "__text",
        defaultValue: value,
        help: capability.format === "richtext" ? undefined : this._formatTextCapability(capability)
      };
      const control = this._control(capability.format === "richtext" ? "cms-editor-v2-rich-text-editor" : "cms-editor-v2-text-input", setting);
      if (capability.format === "richtext") {
        control.setAttribute("capability", JSON.stringify(capability));
        this._wireRichTextControl(control);
      } else {
        this._wireContentControl(control, "input");
      }
      section.append(control);
      return section;
    }
    _formatTextCapability(capability) {
      const options = [
        capability.bold ? "bold" : null,
        capability.italic ? "italic" : null,
        capability.link ? "link" : null,
        capability.code ? "code" : null,
        capability.dynamic ? "dynamic" : null
      ].filter((option) => Boolean(option));
      return options.length > 0 ? options.join(", ") : "Plain text";
    }
    _wireTextControl(control, selector, setting) {
      const wire = () => {
        const input = control.shadowRoot?.querySelector(selector);
        if (!input)
          return;
        input.disabled = setting.disabled === true;
        if (setting.disabled)
          return;
        input.addEventListener("input", () => this._emitSettingChange(setting, input.value));
        input.addEventListener("change", () => this._emitSettingChange(setting, input.value));
      };
      this._whenDefined(control, wire);
    }
    _wireContentControl(control, selector) {
      const wire = () => {
        const input = control.shadowRoot?.querySelector(selector);
        if (!input)
          return;
        input.addEventListener("input", () => this._emitContentChange(input.value, "text"));
        input.addEventListener("change", () => this._emitContentChange(input.value, "text"));
      };
      this._whenDefined(control, wire);
    }
    _wireRichTextControl(control) {
      const wire = () => {
        control.addEventListener("input", (event) => {
          const value = event.detail?.value;
          if (typeof value !== "string")
            return;
          this._emitContentChange(value, "html");
        });
      };
      this._whenDefined(control, wire);
    }
    _wirePageLinkControl(control, setting) {
      const wire = () => {
        if (setting.disabled)
          return;
        control.addEventListener("input", (event) => {
          const value = event.detail?.value;
          if (typeof value !== "string")
            return;
          this._emitSettingChange(setting, value);
        });
      };
      this._whenDefined(control, wire);
    }
    _wireToggleControl(control, setting) {
      const wire = () => {
        const button = control.shadowRoot?.querySelector("button");
        if (!button)
          return;
        button.disabled = setting.disabled === true;
        if (setting.disabled)
          return;
        button.addEventListener("click", () => {
          const checked = button.ariaPressed !== "true";
          button.ariaPressed = String(checked);
          control.toggleAttribute("checked", checked);
          this._emitSettingChange(setting, checked);
        });
      };
      this._whenDefined(control, wire);
    }
    _applyDisabled(control, setting) {
      if (setting.disabled) {
        control.setAttribute("disabled", "");
        control.setAttribute("aria-disabled", "true");
      } else {
        control.removeAttribute("disabled");
        control.removeAttribute("aria-disabled");
      }
    }
    _whenDefined(control, callback) {
      if (customElements.get(control.localName)) {
        callback();
        return;
      }
      customElements.whenDefined(control.localName).then(callback);
    }
    _emitSettingChange(setting, value) {
      this.dispatchEvent(new CustomEvent(SETTINGS_VIEW_SETTING_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail: { setting, value }
      }));
    }
    _emitContentChange(value, format) {
      this.dispatchEvent(new CustomEvent(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail: { value, format }
      }));
    }
  }
  if (!customElements.get("cms-editor-v2-settings-view")) {
    customElements.define("cms-editor-v2-settings-view", SettingsView);
  }

  // ../../features/cms-editor-system-v2/src/components/Layout/RepeatPicker/template.html
  var template_default21 = `<div class="backdrop" hidden>
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="repeat-picker-title">
        <header class="header">
            <div>
                <h2 id="repeat-picker-title">Add repeat</h2>
                <p class="subtitle"></p>
            </div>
            <button class="close" type="button" aria-label="Close">×</button>
        </header>
        <input class="search" type="search" placeholder="Search arrays" />
        <div class="body">
            <div class="arrays" role="listbox" aria-label="Array fields"></div>
            <aside class="details"></aside>
            <aside class="binding"></aside>
        </div>
    </section>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/RepeatPicker/style.css
  var style_default20 = `:host {
    display: contents;
}

* {
    box-sizing: border-box;
}

.backdrop {
    --repeat-picker-top-offset: min(8vh, 64px);

    position: fixed;
    inset: 0;
    z-index: 130;
    display: grid;
    place-items: start center;
    padding: var(--repeat-picker-top-offset) 24px 24px;
    background: color-mix(in srgb, black 20%, transparent);
}

.backdrop[hidden] {
    display: none;
}

.modal {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
    width: min(920px, calc(100vw - 48px));
    height: min(560px, calc(100vh - var(--repeat-picker-top-offset) - 24px));
    border: 1px solid var(--editor-v2-border);
    border-radius: 10px;
    background: var(--editor-v2-bg);
    box-shadow: 0 24px 70px color-mix(in srgb, black 18%, transparent);
    overflow: hidden;
    padding: 14px;
}

.header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
}

h2 {
    margin: 0;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 15px;
    font-weight: 780;
}

.subtitle {
    margin: 4px 0 0;
    color: var(--editor-v2-muted);
    font-size: 12px;
}

.close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
}

.search,
.alias {
    width: 100%;
    height: 34px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    outline: none;
    padding: 0 10px;
}

.search:focus,
.alias:focus {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 52%, var(--editor-v2-border));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--editor-v2-accent) 12%, transparent);
}

.body {
    display: grid;
    grid-template-columns: minmax(190px, 240px) minmax(240px, 1fr) minmax(220px, 280px);
    gap: 12px;
    min-height: 0;
    min-width: 0;
}

.arrays,
.details,
.binding {
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
}

.arrays {
    display: grid;
    align-content: start;
    gap: 7px;
}

.array {
    display: grid;
    gap: 5px;
    width: 100%;
    min-height: 58px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    text-align: left;
    padding: 10px;
    cursor: pointer;
}

.array:hover {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 34%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 5%, var(--editor-v2-surface));
}

.array[aria-selected="true"] {
    border-color: color-mix(in srgb, var(--editor-v2-accent) 56%, var(--editor-v2-border));
    background: color-mix(in srgb, var(--editor-v2-accent) 8%, var(--editor-v2-surface));
}

.name {
    overflow: hidden;
    color: var(--editor-v2-text);
    font-size: 12px;
    font-weight: 760;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.scope {
    color: var(--editor-v2-muted);
    font-size: 11px;
}

.details {
    display: grid;
    align-content: start;
    gap: 12px;
    border-left: 1px solid var(--editor-v2-border);
    padding-left: 12px;
}

.binding {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 12px;
    border-left: 1px solid var(--editor-v2-border);
    padding-left: 12px;
}

.binding-scroll {
    display: grid;
    align-content: start;
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
}

.binding-footer {
    display: grid;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--editor-v2-border);
}

.details-eyebrow {
    padding-bottom: 2px;
    border-bottom: 1px solid var(--editor-v2-border);
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

.details h3 {
    margin: 0;
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 18px;
    font-weight: 780;
    overflow-wrap: anywhere;
}

.binding-config,
label {
    display: grid;
    gap: 5px;
    min-width: 0;
}

label {
    color: var(--editor-v2-muted);
    font-size: 11px;
    font-weight: 700;
}

.repeat-path {
    display: grid;
    gap: 5px;
    min-width: 0;
}

.repeat-path span {
    color: var(--editor-v2-muted);
    font-size: 10px;
    font-weight: 780;
    text-transform: uppercase;
}

.repeat-path strong {
    color: var(--editor-v2-text);
    font-size: 12px;
    overflow-wrap: anywhere;
}

.fields {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 8px;
    color: var(--editor-v2-text);
    font-size: 11px;
    line-height: 1.35;
    min-width: 0;
    padding: 3px 0 3px calc(var(--field-depth, 0) * 12px);
}

.field-path {
    min-width: 0;
    overflow-wrap: anywhere;
}

.field-children {
    display: grid;
    grid-column: 1 / -1;
    gap: 2px;
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
}

.field-type {
    color: var(--editor-v2-muted);
    font-size: 10px;
}

.insert {
    min-height: 32px;
    border: 1px solid var(--editor-v2-accent);
    border-radius: 7px;
    background: var(--editor-v2-accent);
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 730;
    cursor: pointer;
}

.details-empty,
.empty {
    color: var(--editor-v2-muted);
    font-size: 12px;
    line-height: 1.45;
}

.empty {
    padding: 24px 0;
    text-align: center;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/RepeatPicker/RepeatPicker.ts
  var template18 = document.createElement("template");
  template18.innerHTML = `<style>${String(style_default20)}</style>${String(template_default21)}`;
  var REPEAT_PICKER_SELECT_EVENT = "editor-v2:repeat-select";

  class RepeatPicker extends HTMLElement {
    _options = [];
    _activeOption = null;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template18.content.cloneNode(true));
    }
    connectedCallback() {
      this.closeButton.addEventListener("click", this.close);
      this.backdrop.addEventListener("click", this._onBackdropClick);
      this.search.addEventListener("input", this._onSearchInput);
      this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }
    disconnectedCallback() {
      this.closeButton.removeEventListener("click", this.close);
      this.backdrop.removeEventListener("click", this._onBackdropClick);
      this.search.removeEventListener("input", this._onSearchInput);
      this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }
    open(scopes, contextLabel) {
      this._options = this._arrayOptions(scopes);
      this._activeOption = null;
      this.subtitle.textContent = contextLabel ? `Choose an array to repeat ${contextLabel}.` : "Choose an array to repeat.";
      this.search.value = "";
      this.backdrop.hidden = false;
      this._render();
      this.search.focus();
    }
    close = () => {
      this.backdrop.hidden = true;
    };
    _render() {
      this._renderOptions();
      this._renderDetails();
      this._renderBinding();
    }
    _renderOptions() {
      this.arrays.replaceChildren();
      const options = this._visibleOptions();
      if (options.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No array fields available.";
        this.arrays.append(empty);
        this._activeOption = null;
        return;
      }
      if (!this._activeOption || !options.includes(this._activeOption)) {
        this._activeOption = options[0] ?? null;
      }
      for (const option of options) {
        const button = document.createElement("button");
        button.className = "array";
        button.type = "button";
        button.ariaSelected = String(option === this._activeOption);
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = option.path;
        const scope = document.createElement("span");
        scope.className = "scope";
        scope.textContent = option.scopeLabel;
        button.append(name, scope);
        button.addEventListener("click", () => {
          this._activeOption = option;
          this._render();
        });
        button.addEventListener("dblclick", () => this._select(option));
        this.arrays.append(button);
      }
    }
    _renderDetails() {
      this.details.replaceChildren();
      if (!this._activeOption) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select an array field to inspect item fields.";
        this.details.append(empty);
        return;
      }
      const option = this._activeOption;
      const heading4 = document.createElement("div");
      heading4.className = "details-eyebrow";
      heading4.textContent = "Response fields";
      this.details.append(heading4, this._renderFields(option.fields));
    }
    _renderBinding() {
      this.binding.replaceChildren();
      if (!this._activeOption) {
        const empty = document.createElement("div");
        empty.className = "details-empty";
        empty.textContent = "Select an array field to configure repeat.";
        this.binding.append(empty);
        return;
      }
      const option = this._activeOption;
      const heading4 = document.createElement("div");
      heading4.className = "details-eyebrow";
      heading4.textContent = "Binding";
      const path = document.createElement("div");
      path.className = "repeat-path";
      const pathLabel = document.createElement("span");
      pathLabel.textContent = "Array";
      const pathValue = document.createElement("strong");
      pathValue.textContent = option.path;
      path.append(pathLabel, pathValue);
      const config = document.createElement("section");
      config.className = "binding-config";
      const label = document.createElement("label");
      label.textContent = "Alias";
      const alias = document.createElement("input");
      alias.className = "alias";
      alias.value = this._defaultAlias(option.path);
      label.append(alias);
      config.append(label);
      const insert = document.createElement("button");
      insert.className = "insert";
      insert.type = "button";
      insert.textContent = "Use repeat";
      insert.addEventListener("click", () => this._select(option, alias.value));
      const scroll = document.createElement("div");
      scroll.className = "binding-scroll";
      scroll.append(heading4, path, config);
      const footer = document.createElement("footer");
      footer.className = "binding-footer";
      footer.append(insert);
      this.binding.append(scroll, footer);
    }
    _renderFields(fields) {
      const list = document.createElement("ul");
      list.className = "fields";
      for (const field of fields)
        list.append(this._renderField(field, 0));
      if (list.children.length === 0) {
        const empty = document.createElement("p");
        empty.className = "details-empty";
        empty.textContent = "No item fields declared.";
        return empty;
      }
      return list;
    }
    _renderField(field, depth) {
      const item = document.createElement("li");
      item.className = "field";
      item.style.setProperty("--field-depth", String(depth));
      const path = document.createElement("span");
      path.className = "field-path";
      path.textContent = field.path;
      const type = document.createElement("span");
      type.className = "field-type";
      type.textContent = field.type ?? "unknown";
      item.append(path, type);
      if (field.children?.length) {
        const children = document.createElement("ul");
        children.className = "field-children";
        for (const child of field.children)
          children.append(this._renderField(child, depth + 1));
        item.append(children);
      }
      return item;
    }
    _select(option, alias = this._defaultAlias(option.path)) {
      const cleanAlias = alias.trim();
      if (!cleanAlias)
        return;
      this.dispatchEvent(new CustomEvent(REPEAT_PICKER_SELECT_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          path: option.path,
          alias: cleanAlias
        }
      }));
      this.close();
    }
    _arrayOptions(scopes) {
      const byPath = new Map;
      for (const option of scopes.flatMap((scope) => this._arrayFields(scope.fields, scope.name, scope.label ?? scope.name))) {
        if (!byPath.has(option.path))
          byPath.set(option.path, option);
      }
      return [...byPath.values()];
    }
    _arrayFields(fields, scopeName, scopeLabel, prefix = "") {
      return fields.flatMap((field) => {
        const relativePath = prefix && field.path !== "." ? `${prefix}.${field.path}` : field.path === "." ? prefix : field.path;
        const fullPath = relativePath ? `${scopeName}.${relativePath}` : scopeName;
        if (field.type !== "array")
          return this._arrayFields(field.children ?? [], scopeName, scopeLabel, relativePath);
        return [{
          path: fullPath,
          label: field.path,
          scopeLabel,
          fields: field.children ?? []
        }];
      });
    }
    _visibleOptions() {
      const query = this.search.value.trim().toLowerCase();
      if (!query)
        return this._options;
      return this._options.filter((option) => [
        option.path,
        option.label,
        option.scopeLabel
      ].some((value) => value.toLowerCase().includes(query)));
    }
    _defaultAlias(path) {
      const segment = path.split(".").filter(Boolean).at(-1) ?? "item";
      const singular = segment.endsWith("ies") ? `${segment.slice(0, -3)}y` : segment.endsWith("s") && segment.length > 1 ? segment.slice(0, -1) : segment;
      return singular.replace(/[^A-Za-z0-9_$]/g, "") || "item";
    }
    _onBackdropClick = (event) => {
      if (event.target === this.backdrop)
        this.close();
    };
    _onSearchInput = () => {
      this._activeOption = null;
      this._render();
    };
    _onKeydown = (event) => {
      if (!this.backdrop.hidden && event.key === "Escape")
        this.close();
    };
    get backdrop() {
      return this.shadowRoot.querySelector(".backdrop");
    }
    get closeButton() {
      return this.shadowRoot.querySelector(".close");
    }
    get subtitle() {
      return this.shadowRoot.querySelector(".subtitle");
    }
    get search() {
      return this.shadowRoot.querySelector(".search");
    }
    get arrays() {
      return this.shadowRoot.querySelector(".arrays");
    }
    get details() {
      return this.shadowRoot.querySelector(".details");
    }
    get binding() {
      return this.shadowRoot.querySelector(".binding");
    }
  }
  if (!customElements.get("cms-editor-v2-repeat-picker")) {
    customElements.define("cms-editor-v2-repeat-picker", RepeatPicker);
  }

  // ../../features/cms-editor-system-v2/src/runtime/EditorRegistry/EditorRegistry.ts
  class EditorRegistry {
    _editorsByTarget = new Map;
    register(editor) {
      const current = this._editorsByTarget.get(editor.target);
      if (current && current !== editor) {
        throw new Error("An editor is already registered for this element.");
      }
      this._editorsByTarget.set(editor.target, editor);
    }
    unregister(editor) {
      if (this._editorsByTarget.get(editor.target) === editor) {
        this._editorsByTarget.delete(editor.target);
      }
    }
    getEditor(target) {
      return this._editorsByTarget.get(target);
    }
    getClosestEditor(target, stopAt) {
      let current = target;
      while (current) {
        const editor = this._editorsByTarget.get(current);
        if (editor)
          return editor;
        if (stopAt && current === stopAt)
          return;
        current = current.parentElement;
      }
      return;
    }
    getDirectChildren(parent) {
      const children = [];
      for (const editor of this._editorsByTarget.values()) {
        if (editor.target === parent)
          continue;
        if (!parent.contains(editor.target))
          continue;
        if (this._getClosestRegisteredAncestor(editor.target) !== parent)
          continue;
        children.push(editor);
      }
      return children;
    }
    getAncestors(target) {
      const ancestors = [];
      let current = target.parentElement;
      while (current) {
        const editor = this._editorsByTarget.get(current);
        if (editor)
          ancestors.unshift(editor);
        current = current.parentElement;
      }
      return ancestors;
    }
    collectDataScopes(target) {
      const editors = [
        ...this.getAncestors(target),
        this.getEditor(target)
      ].filter((editor) => Boolean(editor));
      return editors.flatMap((editor) => editor.getDataScopes());
    }
    _getClosestRegisteredAncestor(target) {
      let current = target.parentElement;
      while (current) {
        if (this._editorsByTarget.has(current))
          return current;
        current = current.parentElement;
      }
      return;
    }
  }
  // ../../features/cms-editor-system-v2/src/runtime/events.ts
  var CMS_EDITOR_SETTINGS_CHANGE_EVENT = "cms-editor-settings-change";
  var CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT = "cms-editor-data-scopes-change";
  var CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT = "cms-editor-content-slots-change";
  var CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT = "cms-editor-text-capability-change";
  var CMS_EDITOR_STATES_CHANGE_EVENT = "cms-editor-states-change";

  // ../../features/cms-editor-system-v2/src/runtime/EditorRuntime/createRuntimeEditor.ts
  function createRuntimeEditor(entry, target, registry) {
    const EditorClass = entry.editor;

    class CatalogRuntimeEditor extends EditorClass {
      catalogEntry = entry;
      _addedSettings = [];
      _declaredDataScopes = [];
      _addedContentSlots = [];
      _addedStates = [];
      _textCapabilityOverride;
      _isMounted = false;
      constructor() {
        super(target);
        registry.register(this);
      }
      mount() {
        if (this._isMounted)
          return;
        this._isMounted = true;
        this.mountEditor();
      }
      unmount() {
        if (!this._isMounted)
          return;
        this._isMounted = false;
        this.unmountEditor();
      }
      getSettings() {
        return [
          ...super.getSettings(),
          ...this._addedSettings
        ];
      }
      addSettings(settings) {
        const list = Array.isArray(settings) ? settings : [settings];
        this._addedSettings.push(...list);
        this._emit(CMS_EDITOR_SETTINGS_CHANGE_EVENT, {
          editor: this,
          settings: this.getSettings()
        });
      }
      getDataScopes() {
        return [
          ...super.getDataScopes(),
          ...this._declaredDataScopes
        ];
      }
      declareDataScope(scope) {
        const list = Array.isArray(scope) ? scope : [scope];
        this._declaredDataScopes.push(...list);
        this._emit(CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT, {
          editor: this,
          dataScopes: this.getDataScopes()
        });
      }
      getContentSlots() {
        return [
          ...super.getContentSlots(),
          ...this._addedContentSlots
        ];
      }
      addContentSlots(slots) {
        const list = Array.isArray(slots) ? slots : [slots];
        this._addedContentSlots.push(...list);
        this._emit(CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT, {
          editor: this,
          contentSlots: this.getContentSlots()
        });
      }
      getTextCapability() {
        return this._textCapabilityOverride !== undefined ? this._textCapabilityOverride : super.getTextCapability();
      }
      setTextCapability(capability) {
        this._textCapabilityOverride = capability;
        this._emit(CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT, {
          editor: this,
          textCapability: this.getTextCapability()
        });
      }
      getStates() {
        return [
          ...super.getStates(),
          ...this._addedStates
        ];
      }
      addStates(states) {
        const list = Array.isArray(states) ? states : [states];
        this._addedStates.push(...list);
        this._emit(CMS_EDITOR_STATES_CHANGE_EVENT, {
          editor: this,
          states: this.getStates()
        });
      }
      getChildren() {
        return registry.getDirectChildren(this.target);
      }
      dispose() {
        this.unmount();
        registry.unregister(this);
      }
      _emit(eventName, detail) {
        const CustomEventConstructor = this.target.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
        this.target.dispatchEvent(new CustomEventConstructor(eventName, {
          bubbles: true,
          composed: true,
          detail
        }));
      }
    }
    return new CatalogRuntimeEditor;
  }

  // ../../features/cms-editor-system-v2/src/runtime/EditorRuntime/EditorRuntime.ts
  var SOURCE_STATE_NAMES = CMS_SOURCE_STATES;
  var SOURCE_STATE_LABELS = {
    loaded: ":loaded",
    loading: ":loading",
    empty: ":empty",
    error: ":error"
  };

  class EditorRuntime {
    _dataSources;
    registry = new EditorRegistry;
    _catalogByTag = new Map;
    _entriesByEditor = new Map;
    _editors = [];
    _document = null;
    _selectedEditor = null;
    constructor(catalog, _dataSources = []) {
      this._dataSources = _dataSources;
      for (const entry of catalog) {
        this._catalogByTag.set(entry.tag.toLowerCase(), entry);
      }
    }
    load(document2) {
      this.dispose();
      this._assertDocument(document2);
      this._document = document2;
      for (const element of this._walkElements(document2.root)) {
        const entry = this._catalogByTag.get(element.localName);
        if (!entry)
          continue;
        const editor = createRuntimeEditor(entry, element, this.registry);
        this._editors.push(editor);
        this._entriesByEditor.set(editor, entry);
      }
      for (const editor of this._editors) {
        editor.mount();
        this._declareBindingDataScopes(editor);
      }
    }
    dispose() {
      for (const editor of [...this._editors].reverse()) {
        editor.dispose();
      }
      this._editors.length = 0;
      this._entriesByEditor.clear();
      this._document = null;
      this._selectedEditor = null;
    }
    getEditor(target) {
      return this.registry.getEditor(target);
    }
    getClosestEditor(target) {
      const document2 = this._requireDocument();
      if (!target || !document2.contentRoot.contains(target))
        return;
      const closest = this.registry.getClosestEditor(target, document2.contentRoot);
      if (!closest)
        return;
      let current = closest.target;
      while (current && document2.contentRoot.contains(current)) {
        const editor = this.registry.getEditor(current);
        if (editor?.getStructureMode() === "opaque")
          return editor;
        if (current === document2.contentRoot)
          break;
        current = current.parentElement;
      }
      return closest;
    }
    getStructure() {
      const document2 = this._requireDocument();
      return this._getStructureChildren(document2.contentRoot);
    }
    select(targetOrEditor) {
      if (!targetOrEditor) {
        this._selectedEditor = null;
        return null;
      }
      const editor = targetOrEditor instanceof Editor ? targetOrEditor : this.registry.getEditor(targetOrEditor);
      this._selectedEditor = editor ?? null;
      return this.getSelection();
    }
    getSelection() {
      if (!this._selectedEditor)
        return null;
      return {
        editor: this._selectedEditor,
        settings: this._selectedEditor.getSettings(),
        contentSlots: this._selectedEditor.getContentSlots(),
        textCapability: this._selectedEditor.getTextCapability(),
        states: this._selectedEditor.getStates()
      };
    }
    getSelectedSettings() {
      return this._selectedEditor?.getSettings() ?? [];
    }
    getSelectedDataScopes() {
      if (!this._selectedEditor)
        return [];
      return this.registry.collectDataScopes(this._selectedEditor.target);
    }
    _declareBindingDataScopes(editor) {
      this._declareSourceDataScope(editor);
      this._declareRepeatDataScope(editor);
    }
    _declareSourceDataScope(editor) {
      const source = this._parseSourceBinding(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
      if (!source)
        return;
      const dataSource = this._dataSources.find((candidate) => candidate.url === this._sourceSchemaUrl(source.url));
      editor.declareDataScope({
        name: source.alias ?? "data",
        label: dataSource?.label ?? source.url,
        source: source.url,
        fields: dataSource?.fields ?? []
      });
    }
    _parseSourceBinding(value) {
      const parsed = parseSource(value);
      if (!parsed)
        return null;
      return typeof parsed === "string" ? { url: parsed } : parsed;
    }
    _sourceSchemaUrl(url) {
      return url.split("?")[0] ?? url;
    }
    _declareRepeatDataScope(editor) {
      const repeat = parseRepeat(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.repeat) ?? "");
      if (!repeat?.alias)
        return;
      const field = this._findDataField(this.registry.collectDataScopes(editor.target), repeat.path);
      editor.declareDataScope({
        name: repeat.alias,
        label: repeat.alias,
        fields: field?.children ?? []
      });
    }
    _findDataField(scopes, path) {
      for (const scope of scopes) {
        const field = this._findDataFieldInList(scope.fields, path) ?? this._findDataFieldInList(scope.fields, this._stripScopeName(scope.name, path));
        if (field)
          return field;
      }
      return;
    }
    _findDataFieldInList(fields, path) {
      for (const field of fields) {
        if (field.path === path)
          return field;
        const child = field.children ? this._findDataFieldInList(field.children, path) : undefined;
        if (child)
          return child;
      }
      return;
    }
    _stripScopeName(scopeName, path) {
      const prefix = `${scopeName}.`;
      return path.startsWith(prefix) ? path.slice(prefix.length) : path;
    }
    _getStructureChildren(parent) {
      const document2 = this._requireDocument();
      const children = [];
      for (const editor of this._editors) {
        if (!document2.contentRoot.contains(editor.target))
          continue;
        if (editor.target === parent)
          continue;
        if (!parent.contains(editor.target))
          continue;
        if (this._getClosestStructureParent(editor.target, parent) !== parent)
          continue;
        const entry = this._entriesByEditor.get(editor);
        if (!entry)
          continue;
        children.push({
          kind: "editor",
          editor,
          target: editor.target,
          tag: entry.tag,
          label: entry.label,
          icon: entry.icon,
          badges: this._getStructureBadges(editor),
          children: editor.getStructureMode() === "opaque" ? [] : this._getStructureChildren(editor.target)
        });
      }
      if (parent.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) {
        return this._groupSourceChildren(this.registry.getEditor(parent), parent, children);
      }
      return children;
    }
    _groupSourceChildren(sourceEditor, sourceTarget, children) {
      if (!sourceEditor)
        return children;
      return SOURCE_STATE_NAMES.map((state) => {
        const stateChildren = children.filter((child) => this._sourceStateOf(child.target) === state);
        return {
          kind: "source-state",
          sourceEditor,
          target: sourceTarget,
          state,
          label: SOURCE_STATE_LABELS[state],
          badges: [],
          children: stateChildren
        };
      });
    }
    _sourceStateOf(target) {
      return sourceStateFromElement(target);
    }
    _getStructureBadges(editor) {
      const badges = [];
      const slot = editor.target.getAttribute("slot");
      if (slot)
        badges.push(slot);
      if (editor.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source))
        badges.push("Source");
      if (editor.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat))
        badges.push("Repeat");
      return badges;
    }
    _getClosestStructureParent(target, stopAt) {
      const document2 = this._requireDocument();
      let current = target.parentElement;
      while (current && current !== stopAt) {
        if (document2.contentRoot.contains(current)) {
          const editor = this.registry.getEditor(current);
          if (editor)
            return current;
        }
        current = current.parentElement;
      }
      return stopAt;
    }
    _walkElements(root) {
      return [
        root,
        ...Array.from(root.querySelectorAll("*"))
      ];
    }
    _assertDocument(document2) {
      if (document2.root !== document2.contentRoot && !document2.root.contains(document2.contentRoot)) {
        throw new Error("EditorDocument contentRoot must be inside root.");
      }
    }
    _requireDocument() {
      if (!this._document) {
        throw new Error("EditorRuntime has not loaded a document.");
      }
      return this._document;
    }
  }
  // ../../features/cms-editor-system-v2/src/components/Layout/Shell/FrameHighlight.ts
  var STYLE_ID = "cms-editor-v2-highlight-style";
  var HIGHLIGHT_ATTR = "data-cms-editor-v2-highlight";

  class FrameHighlight {
    _target = null;
    _overlay = null;
    _resizeObserver = null;
    show(editor, options = {}) {
      this.hide();
      this._target = editor.target;
      const doc = editor.target.ownerDocument;
      this._ensureStyle(doc);
      if (options.scrollIntoView) {
        editor.target.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth"
        });
      }
      this._overlay = doc.createElement("div");
      this._overlay.setAttribute(HIGHLIGHT_ATTR, "");
      doc.body.append(this._overlay);
      this._resizeObserver = new ResizeObserver(() => this.update());
      this._resizeObserver.observe(editor.target);
      doc.defaultView?.addEventListener("scroll", this.update, true);
      doc.defaultView?.addEventListener("resize", this.update);
      this.update();
    }
    hide() {
      if (this._target) {
        const win = this._target.ownerDocument.defaultView;
        win?.removeEventListener("scroll", this.update, true);
        win?.removeEventListener("resize", this.update);
      }
      this._resizeObserver?.disconnect();
      this._resizeObserver = null;
      this._overlay?.remove();
      this._overlay = null;
      this._target = null;
    }
    dispose() {
      this.hide();
    }
    update = () => {
      if (!this._target || !this._overlay)
        return;
      const win = this._target.ownerDocument.defaultView;
      if (!win)
        return;
      const rect = this._target.getBoundingClientRect();
      this._overlay.style.left = `${rect.left + win.scrollX}px`;
      this._overlay.style.top = `${rect.top + win.scrollY}px`;
      this._overlay.style.width = `${rect.width}px`;
      this._overlay.style.height = `${rect.height}px`;
    };
    _ensureStyle(doc) {
      if (doc.getElementById(STYLE_ID))
        return;
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
[${HIGHLIGHT_ATTR}] {
    position: absolute;
    z-index: 2147483647;
    pointer-events: none;
    outline: 2px solid #16775f;
    outline-offset: -2px;
    border-radius: 8px;
    box-shadow: 0 0 0 1px rgba(22, 119, 95, 0.18), 0 8px 24px rgba(22, 119, 95, 0.14);
}
`;
      doc.head.append(style);
    }
  }

  // ../../features/cms-editor-system-v2/src/components/Layout/Shell/template.html
  var template_default22 = `<div class="shell">
    <cms-editor-v2-topbar></cms-editor-v2-topbar>
    <div class="workspace">
        <cms-editor-v2-panel class="structure-panel" side="left">
            <cms-editor-v2-structure-tree></cms-editor-v2-structure-tree>
        </cms-editor-v2-panel>
        <cms-editor-v2-panel class="settings-panel" side="left">
            <div class="panel-tabs">
                <button class="active" type="button" data-settings-mode="settings">Settings</button>
                <button type="button" data-settings-mode="overrides">Overrides</button>
            </div>
            <cms-editor-v2-settings-view></cms-editor-v2-settings-view>
        </cms-editor-v2-panel>
        <cms-editor-v2-canvas viewport-width="100%" viewport-height="100%" viewport-padding="none" viewport-fit="fluid"></cms-editor-v2-canvas>
    </div>
    <div class="page-settings-modal" hidden>
        <div class="page-settings-backdrop" data-page-settings-close></div>
        <section class="page-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="page-settings-title">
            <header class="page-settings-header">
                <div>
                    <h2 id="page-settings-title">Page settings</h2>
                    <p class="settings-description">Configure page-level metadata and routing.</p>
                </div>
                <button class="icon-button" type="button" data-page-settings-close aria-label="Close page settings">×</button>
            </header>
            <div class="page-settings-body">
                <label>
                    <span>Title</span>
                    <input type="text" data-page-field="title">
                </label>
                <label>
                    <span data-page-label="path">Path</span>
                    <input type="text" data-page-field="path">
                </label>
                <label>
                    <span data-page-label="published">Status</span>
                    <select data-page-field="published">
                        <option value="false">Draft</option>
                        <option value="true">Published</option>
                    </select>
                </label>
                <label>
                    <span data-page-label="description">SEO description</span>
                    <textarea rows="4" data-page-field="description"></textarea>
                </label>
                <label>
                    <span data-page-label="tags">Tags</span>
                    <div class="tag-field">
                        <input type="text" data-page-field="tags" placeholder="pricing, landing">
                    </div>
                </label>
            </div>
            <footer class="page-settings-footer">
                <button type="button" data-page-settings-close>Cancel</button>
                <button class="primary" type="button" data-page-settings-apply>Apply</button>
            </footer>
        </section>
    </div>
</div>
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/Shell/style.css
  var style_default21 = `:host {
    --editor-v2-bg: #f6f7f7;
    --editor-v2-surface: #ffffff;
    --editor-v2-surface-muted: #f9faf9;
    --editor-v2-border: #e2e6e4;
    --editor-v2-border-strong: #c9d1ce;
    --editor-v2-text: #151b19;
    --editor-v2-label: #5f6d68;
    --editor-v2-muted: #87948f;
    --editor-v2-subtle: #a3ada9;
    --editor-v2-accent: #165f4b;
    --editor-v2-success: #1a7f4e;
    --editor-v2-shadow: 0 1px 0 rgba(16, 24, 21, .035), 0 12px 32px rgba(16, 24, 21, .045);
    --editor-v2-left-rail-width: 288px;
    --editor-v2-inspector-width: 348px;
    display: block;
    height: 100%;
    min-height: 560px;
    color: var(--editor-v2-text);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
    box-sizing: border-box;
}

.shell {
    display: grid;
    grid-template-rows: 48px minmax(0, 1fr);
    height: 100%;
    min-height: 560px;
    border: 1px solid var(--editor-v2-border);
    background: var(--editor-v2-bg);
}

.workspace {
    display: grid;
    grid-template-columns:
        var(--editor-v2-left-rail-width)
        var(--editor-v2-inspector-width)
        minmax(0, 1fr);
    min-height: 0;
}

.structure-panel {
    background: var(--editor-v2-surface-muted);
}

.structure-panel cms-editor-v2-structure-tree {
    display: block;
    height: 100%;
    padding-top: 12px;
}

.settings-panel {
    background: var(--editor-v2-surface);
}

.empty-panel {
    margin: 0 12px;
    border: 1px dashed var(--editor-v2-border-strong);
    border-radius: 8px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-muted);
    padding: 13px 12px;
    font-size: 12px;
    line-height: 1.45;
}

.panel-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 12px 12px 14px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 8px;
    background: var(--editor-v2-surface-muted);
    padding: 3px;
}

.panel-tabs button {
    flex: 1;
    min-height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
}

.panel-tabs button.active {
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    box-shadow: 0 1px 2px rgba(16, 24, 21, .08);
}

.spacer {
    flex: 1;
}

.page-settings-modal[hidden] {
    display: none;
}

.page-settings-modal {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: grid;
    place-items: center;
    padding: 24px;
}

.page-settings-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(21, 27, 25, .32);
}

.page-settings-dialog {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(520px, 100%);
    max-height: min(680px, calc(100vh - 48px));
    border: 1px solid var(--editor-v2-border);
    border-radius: 10px;
    background: var(--editor-v2-surface);
    box-shadow: 0 18px 48px rgba(16, 24, 21, .16);
    overflow: hidden;
}

.page-settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    border-bottom: 1px solid var(--editor-v2-border);
    padding: 16px 18px;
}

.page-settings-header h2 {
    margin: 0;
    color: var(--editor-v2-text);
    font-size: 15px;
    line-height: 1.25;
}

.page-settings-header p {
    margin: 4px 0 0;
    color: var(--editor-v2-muted);
    font-size: 12px;
    line-height: 1.45;
}

.icon-button {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--editor-v2-muted);
    font: inherit;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
}

.icon-button:hover {
    border-color: var(--editor-v2-border);
    background: var(--editor-v2-surface-muted);
    color: var(--editor-v2-text);
}

.page-settings-body {
    display: grid;
    gap: 14px;
    min-height: 0;
    overflow: auto;
    padding: 18px;
}

.page-settings-body label {
    display: grid;
    gap: 6px;
}

.page-settings-body span {
    color: var(--editor-v2-label);
    font-size: 11px;
    font-weight: 700;
}

.page-settings-body input,
.page-settings-body select,
.page-settings-body textarea {
    width: 100%;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 13px;
    padding: 8px 10px;
}

.page-settings-body textarea {
    resize: vertical;
}

.tag-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 7px;
    background: var(--editor-v2-surface);
    padding: 5px 6px;
}

.tag-field .tag {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 999px;
    background: var(--editor-v2-surface-muted);
    color: var(--editor-v2-text);
    padding: 0 9px;
    font-size: 12px;
    font-weight: 650;
}

.tag-field input {
    flex: 1;
    min-width: 96px;
    min-height: 24px;
    border: 0;
    border-radius: 0;
    padding: 0 4px;
}

.tag-field input:focus {
    outline: none;
}

.page-settings-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--editor-v2-border);
    padding: 12px 18px;
}

.page-settings-footer button {
    min-height: 30px;
    border: 1px solid var(--editor-v2-border);
    border-radius: 6px;
    background: var(--editor-v2-surface);
    color: var(--editor-v2-text);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    padding: 0 12px;
    cursor: pointer;
}

.page-settings-footer .primary {
    border-color: var(--editor-v2-accent);
    background: var(--editor-v2-accent);
    color: #fff;
}
`;

  // ../../features/cms-editor-system-v2/src/components/Layout/Shell/Shell.ts
  var template19 = document.createElement("template");
  template19.innerHTML = `<style>${String(style_default21)}</style>${String(template_default22)}`;
  var VIEWPORTS = {
    desktop: {
      label: "Desktop",
      width: 1440,
      height: 900,
      padding: "normal",
      fit: "fixed"
    },
    tablet: {
      label: "Tablet",
      width: 768,
      height: 900,
      padding: "normal",
      fit: "fixed"
    },
    mobile: {
      label: "Mobile",
      width: 390,
      height: 844,
      padding: "normal",
      fit: "fixed"
    },
    full: {
      label: "Full",
      width: "100%",
      height: "100%",
      padding: "normal",
      fit: "fluid"
    },
    bleed: {
      label: "Bleed",
      width: "100%",
      height: "100%",
      padding: "none",
      fit: "fluid"
    }
  };
  var EDITOR_V2_SAVE_DOCUMENT_EVENT = "editor-v2:save-document";
  var EDITOR_V2_DELETE_DOCUMENT_EVENT = "editor-v2:delete-document";

  class Shell extends HTMLElement {
    static get observedAttributes() {
      return [
        "resource",
        "back-href",
        "back-label",
        "settings-label",
        "settings-title",
        "settings-description",
        "settings-path-label",
        "settings-tags-label",
        "settings-status-label",
        "settings-description-label"
      ];
    }
    _catalog = [];
    _dataSources = [];
    _defaultTemplateSelection = {};
    _insertItems = [];
    _runtime = null;
    _frameDocument = null;
    _editorDocument = null;
    _settingsMode = "settings";
    _viewport = "bleed";
    _editorMode = "edit";
    _pageConfig = null;
    _clipboardElement = null;
    _chromeSyncPending = false;
    _stateSessions = new WeakMap;
    _pendingRepeatEditor = null;
    _highlight = new FrameHighlight;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).append(template19.content.cloneNode(true));
    }
    attributeChangedCallback() {
      this._syncChromeLabels();
    }
    connectedCallback() {
      this._structureTree.addEventListener("editor-v2:select-editor", this._onSelectEditor);
      this._structureTree.addEventListener("editor-v2:structure-action", this._onStructureAction);
      this._settings.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, this._onSettingChange);
      this._settings.addEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, this._onContentChange);
      this._settings.addEventListener(SETTINGS_VIEW_STATE_TOGGLE_EVENT, this._onStateToggle);
      this._repeatPicker.addEventListener(REPEAT_PICKER_SELECT_EVENT, this._onRepeatSelect);
      this._canvas.addEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady);
      this._canvas.addEventListener(CANVAS_BACKGROUND_CLICK_EVENT, this._onCanvasBackgroundClick);
      this._topBar.addEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, this._onViewportChange);
      this._topBar.addEventListener(TOPBAR_EDITOR_MODE_CHANGE_EVENT, this._onEditorModeChange);
      this._topBar.addEventListener(TOPBAR_PAGE_SETTINGS_EVENT, this._onPageSettings);
      this._topBar.addEventListener(TOPBAR_SAVE_EVENT, this._onSave);
      this._topBar.addEventListener(TOPBAR_DELETE_EVENT, this._onDeleteDocument);
      this._pageSettingsModal.addEventListener("click", this._onPageSettingsModalClick);
      this.shadowRoot.addEventListener("keydown", this._onKeyDown);
      this._settingsTabs.addEventListener("click", this._onSettingsTabsClick);
      this._syncStructureTreeCatalog();
      this._syncStructureTreeDataSources();
      this._syncViewport();
      this._syncEditorMode();
      this._syncChromeLabels();
    }
    disconnectedCallback() {
      this._structureTree.removeEventListener("editor-v2:select-editor", this._onSelectEditor);
      this._structureTree.removeEventListener("editor-v2:structure-action", this._onStructureAction);
      this._settings.removeEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, this._onSettingChange);
      this._settings.removeEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, this._onContentChange);
      this._settings.removeEventListener(SETTINGS_VIEW_STATE_TOGGLE_EVENT, this._onStateToggle);
      this._repeatPicker.removeEventListener(REPEAT_PICKER_SELECT_EVENT, this._onRepeatSelect);
      this._canvas.removeEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady);
      this._canvas.removeEventListener(CANVAS_BACKGROUND_CLICK_EVENT, this._onCanvasBackgroundClick);
      this._topBar.removeEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, this._onViewportChange);
      this._topBar.removeEventListener(TOPBAR_EDITOR_MODE_CHANGE_EVENT, this._onEditorModeChange);
      this._topBar.removeEventListener(TOPBAR_PAGE_SETTINGS_EVENT, this._onPageSettings);
      this._topBar.removeEventListener(TOPBAR_SAVE_EVENT, this._onSave);
      this._topBar.removeEventListener(TOPBAR_DELETE_EVENT, this._onDeleteDocument);
      this._pageSettingsModal.removeEventListener("click", this._onPageSettingsModalClick);
      this.shadowRoot.removeEventListener("keydown", this._onKeyDown);
      this._settingsTabs.removeEventListener("click", this._onSettingsTabsClick);
      this._unbindFrameDocument();
      this._highlight.dispose();
      this._exitAllStateSessions();
      this._runtime?.dispose();
      this._runtime = null;
    }
    get catalog() {
      return this._catalog;
    }
    set catalog(catalog) {
      this.setCatalog(catalog);
    }
    setCatalog(catalog) {
      this._catalog = [...catalog];
      this.setAttribute("catalog-size", String(this._catalog.length));
      this._syncStructureTreeCatalog();
    }
    setInsertItems(items) {
      this._insertItems = items.map((item) => ({ ...item }));
      this._syncStructureTreeInsertItems();
      if (this._runtime)
        this._renderStructure();
    }
    setDefaultTemplateSelection(selection) {
      this._defaultTemplateSelection = { ...selection };
      this._syncStructureTreeDefaultTemplateSelection();
    }
    setDataSources(sources) {
      this._dataSources = sources.map((source) => ({
        ...source,
        fields: [...source.fields]
      }));
      this._syncStructureTreeDataSources();
    }
    setPageConfig(config) {
      this._pageConfig = {
        ...config,
        tags: [...config.tags]
      };
      if (config.defaultTemplateCategory) {
        this.setDefaultTemplateSelection({
          category: config.defaultTemplateCategory
        });
      }
      this._topBar.setPageTitle(config.title, config.path);
      this._syncPageSettingsForm();
    }
    setSaveStatus(label) {
      this._setSaveStatus(label);
    }
    loadDocument(document2, selectedTarget = null) {
      this._exitAllStateSessions();
      this._runtime?.dispose();
      this._editorDocument = document2;
      this._runtime = new EditorRuntime(this._catalog, this._dataSources);
      this._runtime.load(document2);
      this._renderStructure();
      this._select(selectedTarget ? this._runtime.getEditor(selectedTarget) ?? this._runtime.getClosestEditor(selectedTarget) ?? null : null, { scrollStructureIntoView: true });
    }
    _onSelectEditor = (event) => {
      if (this._editorMode !== "edit")
        return;
      const editor = event.detail.editor;
      this._select(editor, {
        scrollFrameIntoView: true,
        scrollStructureIntoView: false
      });
    };
    _onSettingsTabsClick = (event) => {
      const button = event.target?.closest("[data-settings-mode]");
      if (!button)
        return;
      this._settingsMode = button.dataset.settingsMode === "overrides" ? "overrides" : "settings";
      this._syncSettingsTabs();
      this._renderSettings();
    };
    _onViewportChange = (event) => {
      this._viewport = event.detail.viewport;
      this._syncViewport();
    };
    _onEditorModeChange = (event) => {
      this._editorMode = event.detail.mode;
      this._syncEditorMode();
    };
    _onPageSettings = () => {
      this._openPageSettings();
    };
    _onSave = () => {
      this._applyPageSettingsForm();
      this._saveDocument();
    };
    _onDeleteDocument = () => {
      if (!this._pageConfig) {
        this._setSaveStatus("No page");
        return;
      }
      this.dispatchEvent(new CustomEvent(EDITOR_V2_DELETE_DOCUMENT_EVENT, {
        bubbles: true,
        composed: true
      }));
    };
    _saveDocument() {
      if (!this._pageConfig) {
        this._setSaveStatus("No page");
        return;
      }
      this._setSaveStatus("Saving");
      this.dispatchEvent(new CustomEvent(EDITOR_V2_SAVE_DOCUMENT_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          page: {
            ...this._pageConfig,
            tags: [...this._pageConfig.tags]
          },
          content: this._getContentHtml()
        }
      }));
    }
    _onPageSettingsModalClick = (event) => {
      const applyTarget = event.target?.closest("[data-page-settings-apply]");
      if (applyTarget) {
        this._applyPageSettingsForm();
        this._closePageSettings();
        this._saveDocument();
        return;
      }
      const closeTarget = event.target?.closest("[data-page-settings-close]");
      if (closeTarget)
        this._closePageSettings();
    };
    _onKeyDown = (event) => {
      const keyboardEvent = event;
      if (keyboardEvent.key === "Escape" && !this._pageSettingsModal.hidden) {
        this._closePageSettings();
      }
    };
    _onStructureAction = (event) => {
      if (!this._runtime)
        return;
      if (this._editorMode !== "edit")
        return;
      const { action, editor, entry, item, sourceEditor, sourceState } = event.detail;
      if (action === "duplicate") {
        if (!editor)
          return;
        this._duplicateEditor(editor);
      } else if (action === "delete") {
        if (!editor)
          return;
        this._deleteEditor(editor);
      } else if (action === "copy") {
        if (!editor)
          return;
        this._copyEditor(editor);
      } else if (action === "paste-after") {
        this._pasteAfter(editor ?? null, sourceState);
      } else if (action === "set-source" && editor && event.detail.dataSource) {
        this._setSource(editor, event.detail.dataSource, event.detail.sourceBinding);
      } else if (action === "remove-source" && editor) {
        this._removeSource(editor);
      } else if (action === "configure-repeat" && editor) {
        this._openRepeatPicker(editor);
      } else if (action === "remove-repeat" && editor) {
        this._removeRepeat(editor);
      } else if (action === "clear-source-state" && editor && sourceState) {
        this._clearSourceState(editor, sourceState);
      } else if ((action === "move-before" || action === "move-after") && editor && sourceEditor) {
        this._moveEditor(sourceEditor, editor, action === "move-before" ? "before" : "after");
      } else if (action === "replace" && (item || entry)) {
        if (!editor)
          return;
        this._replaceEditor(editor, item ?? { kind: "block", entry }, event.detail.slot);
      } else if (action === "add-root" && (item || entry)) {
        this._addRoot(item ?? { kind: "block", entry });
      } else if (action === "add-source-state-child" && editor && (item || entry)) {
        if (!sourceState)
          return;
        this._addSourceStateChild(editor, item ?? { kind: "block", entry }, sourceState);
      } else if (item || entry) {
        if (!editor)
          return;
        this._addChild(editor, item ?? { kind: "block", entry }, event.detail.slot);
      }
    };
    _onFrameReady = (event) => {
      const frameDocument = event.detail.document;
      this._bindFrameDocument(frameDocument);
      const root = frameDocument.querySelector("[data-cms-editor-root]") ?? frameDocument.querySelector("cms-binding-core");
      const contentRoot = frameDocument.querySelector("[data-cms-content]");
      if (!root || !contentRoot) {
        this._runtime?.dispose();
        this._runtime = null;
        this._editorDocument = null;
        this._renderStructure();
        this._settings.setSettings([]);
        return;
      }
      this.loadDocument({
        root,
        contentRoot
      });
    };
    _onSettingChange = (event) => {
      if (!this._runtime)
        return;
      if (this._editorMode !== "edit")
        return;
      const selection = this._runtime.getSelection();
      if (!selection)
        return;
      this._applySetting(selection.editor, event.detail.setting, event.detail.value);
      this._highlight.show(selection.editor);
    };
    _onContentChange = (event) => {
      if (!this._runtime)
        return;
      if (this._editorMode !== "edit")
        return;
      const selection = this._runtime.getSelection();
      if (!selection?.textCapability)
        return;
      if (event.detail.format === "html") {
        selection.editor.target.innerHTML = event.detail.value;
      } else {
        selection.editor.target.textContent = event.detail.value;
      }
      this._highlight.show(selection.editor);
    };
    _onStateToggle = (event) => {
      if (!this._runtime)
        return;
      if (this._editorMode !== "edit")
        return;
      const selection = this._runtime.getSelection();
      if (!selection)
        return;
      this._toggleState(selection.editor, event.detail.state);
      this._renderSettings();
      this._highlight.show(selection.editor);
    };
    _onRepeatSelect = (event) => {
      if (!this._pendingRepeatEditor)
        return;
      this._setRepeat(this._pendingRepeatEditor, event.detail.path, event.detail.alias);
      this._pendingRepeatEditor = null;
    };
    _onFrameClick = (event) => {
      if (!this._runtime)
        return;
      if (this._editorMode !== "edit")
        return;
      event.preventDefault();
      const target = this._eventElement(event);
      const editor = this._runtime.getClosestEditor(target);
      this._select(editor ?? null, { scrollStructureIntoView: true });
    };
    _onCanvasBackgroundClick = () => {
      if (!this._runtime)
        return;
      if (this._editorMode !== "edit")
        return;
      this._select(null, { scrollStructureIntoView: false });
    };
    _select(editor, options = {}) {
      if (!this._runtime)
        return;
      const selection = this._runtime.select(editor);
      this._renderStructure(options);
      if (!selection) {
        this._settings.setSettings([]);
        this._highlight.hide();
        return;
      }
      this._renderSettings();
      this._highlight.show(selection.editor, {
        scrollIntoView: options.scrollFrameIntoView === true
      });
    }
    _renderSettings() {
      if (!this._runtime)
        return;
      const selection = this._runtime.getSelection();
      if (!selection) {
        this._settings.setSettings([]);
        return;
      }
      this._settings.setSettings(this._resolveSettingsValues(selection.editor, selection.settings), selection.textCapability, selection.textCapability ? this._getTextValue(selection.editor, selection.textCapability.format) : "", this._settingsMode, selection.states);
    }
    _applySetting(editor, setting, value) {
      const attribute = setting.attribute;
      if (typeof value === "boolean") {
        editor.target.toggleAttribute(attribute, value);
        return;
      }
      if (value === "") {
        editor.target.removeAttribute(attribute);
        return;
      }
      if (typeof value !== "string")
        return;
      editor.target.setAttribute(attribute, value);
    }
    _toggleState(editor, state) {
      const sessions = this._stateSessions.get(editor) ?? new Map;
      if (sessions.has(state.id)) {
        this._exitStateSession(editor, state.id);
        return;
      }
      if (state.group) {
        for (const candidate of editor.getStates()) {
          if (candidate.id !== state.id && candidate.group === state.group) {
            this._exitStateSession(editor, candidate.id);
          }
        }
      }
      const session = state.enter();
      sessions.set(state.id, session);
      this._stateSessions.set(editor, sessions);
    }
    _exitStateSession(editor, stateId) {
      const sessions = this._stateSessions.get(editor);
      const session = sessions?.get(stateId);
      if (!sessions || !session)
        return;
      session.exit();
      sessions.delete(stateId);
    }
    _exitAllStateSessions() {
      if (!this._runtime)
        return;
      for (const node of this._flattenStructure(this._runtime.getStructure())) {
        if (this._isSourceStateNode(node))
          continue;
        const sessions = this._stateSessions.get(node.editor);
        if (!sessions)
          continue;
        for (const session of sessions.values()) {
          session.exit();
        }
        sessions.clear();
      }
    }
    _addChild(parent, item, slotName) {
      const slot = this._findSlot(parent, slotName);
      if (!slot || this._isSlotFull(parent, slot))
        return;
      if (item.kind === "media") {
        this._insertMedia(parent, item, slot, slotName);
        return;
      }
      const insertion = this._createInsertion(item, slotName);
      if (!insertion || !this._canInsertNodeCount(parent, slot, insertion.slotElements))
        return;
      parent.target.append(insertion.fragment);
      this._reloadFrameDocument(insertion.selectionTarget);
    }
    _addRoot(item) {
      if (!this._editorDocument || item.kind === "media")
        return;
      const insertion = this._createInsertion(item);
      if (!insertion)
        return;
      if (this._isEmptyDocumentContent()) {
        this._editorDocument.contentRoot.replaceChildren();
      }
      this._editorDocument.contentRoot.append(insertion.fragment);
      this._reloadFrameDocument(insertion.selectionTarget);
    }
    _duplicateEditor(editor) {
      if (!this._canDuplicate(editor))
        return;
      const clone = editor.target.cloneNode(true);
      editor.target.after(clone);
      this._reloadFrameDocument(clone);
    }
    _deleteEditor(editor) {
      if (!this._canDelete(editor))
        return;
      const nextSelectionTarget = this._findNextSelectionTargetAfterDelete(editor);
      editor.target.remove();
      this._reloadFrameDocument(nextSelectionTarget);
    }
    _replaceEditor(editor, item, slotName) {
      const parent = this._parentEditor(editor);
      if (!parent) {
        this._replaceRootEditor(editor, item);
        return;
      }
      const slot = this._findSlot(parent, slotName);
      if (!slot)
        return;
      const sourceState = this._sourceStateForSibling(editor);
      if (item.kind === "media") {
        this._replaceWithMedia(editor, parent, item, slot, slotName, sourceState);
        return;
      }
      const insertion = this._createInsertion(item, slotName, sourceState);
      if (!insertion || !this._canReplaceNodeCount(parent, editor, slot, insertion.slotElements))
        return;
      editor.target.replaceWith(insertion.fragment);
      this._reloadFrameDocument(insertion.selectionTarget);
    }
    _replaceRootEditor(editor, item) {
      if (item.kind === "media")
        return;
      const insertion = this._createInsertion(item);
      if (!insertion)
        return;
      editor.target.replaceWith(insertion.fragment);
      this._reloadFrameDocument(insertion.selectionTarget);
    }
    _copyEditor(editor) {
      this._clipboardElement = editor.target.cloneNode(true);
    }
    _pasteAfter(editor, sourceState) {
      if (!this._clipboardElement || !this._editorDocument)
        return;
      const clone = this._clipboardElement.cloneNode(true);
      if (!editor) {
        this._editorDocument.contentRoot.append(clone);
        this._reloadFrameDocument(clone);
        return;
      }
      if (sourceState) {
        this._applySourceState(clone, sourceState);
        editor.target.append(clone);
        this._reloadFrameDocument(clone);
        return;
      }
      if (!this._canInsertSibling(editor, clone))
        return;
      editor.target.after(clone);
      this._reloadFrameDocument(clone);
    }
    _addSourceStateChild(parent, item, sourceState) {
      const slot = this._sourceStateSlot(parent, sourceState);
      if (!slot || this._isSlotFull(parent, slot))
        return;
      if (item.kind === "media") {
        this._insertMedia(parent, item, slot, undefined, sourceState);
        return;
      }
      const insertion = this._createInsertion(item, undefined, sourceState);
      if (!insertion || !this._canInsertNodeCount(parent, slot, insertion.slotElements))
        return;
      parent.target.append(insertion.fragment);
      this._reloadFrameDocument(insertion.selectionTarget);
    }
    _sourceStateSlot(parent, sourceState) {
      return {
        label: sourceState.slice(0, 1).toUpperCase() + sourceState.slice(1),
        accepts: [{ kind: "any-component" }]
      };
    }
    _clearSourceState(parent, sourceState) {
      if (sourceState === "loaded") {
        for (const child of Array.from(parent.target.children)) {
          if (!child.hasAttribute(CMS_BINDING_ATTRIBUTES.slot))
            child.remove();
        }
        this._reloadFrameDocument(parent.target);
        return;
      }
      for (const child of Array.from(parent.target.children)) {
        if (child.getAttribute(CMS_BINDING_ATTRIBUTES.slot) === sourceState)
          child.remove();
      }
      this._reloadFrameDocument(parent.target);
    }
    _setSource(editor, source, binding = { url: source.url }) {
      editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.source, asSource(binding));
      this._reloadFrameDocument(editor.target);
    }
    _removeSource(editor) {
      editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.source);
      this._reloadFrameDocument(editor.target);
    }
    _openRepeatPicker(editor) {
      if (!this._runtime)
        return;
      this._pendingRepeatEditor = editor;
      this._runtime.select(editor);
      this._repeatPicker.open(this._runtime.getSelectedDataScopes(), this._findStructureNodeLabel(editor) ?? editor.target.localName);
    }
    _setRepeat(editor, path, alias) {
      editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.repeat, asRepeat({ path, alias }));
      this._reloadFrameDocument(editor.target);
    }
    _removeRepeat(editor) {
      editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.repeat);
      this._reloadFrameDocument(editor.target);
    }
    _moveEditor(source, target, position) {
      if (source === target || source.target.contains(target.target))
        return;
      if (!this._canMoveEditor(source, target))
        return;
      this._applySlot(source.target, target.target.getAttribute("slot") ?? undefined);
      this._applySourceState(source.target, this._sourceStateForSibling(target));
      if (position === "before") {
        target.target.before(source.target);
      } else {
        target.target.after(source.target);
      }
      this._reloadFrameDocument(source.target);
    }
    _createInsertion(item, slotName, sourceState) {
      const document2 = this._frameDocument;
      if (!document2)
        return null;
      if (item.kind === "media")
        return null;
      if (item.kind === "block") {
        const fragment2 = this._createBlockFragment(document2, item.entry);
        const slotElements2 = Array.from(fragment2.children).filter(this._isElementNode);
        for (const child of slotElements2) {
          this._applySlot(child, slotName);
          this._applySourceState(child, sourceState);
        }
        const selectionTarget2 = slotElements2.find((child) => child.tagName.toLowerCase() === item.entry.tag) ?? slotElements2[0] ?? null;
        if (!selectionTarget2)
          return null;
        return {
          fragment: fragment2,
          selectionTarget: selectionTarget2,
          slotElements: slotElements2
        };
      }
      if (item.kind === "snippet") {
        const snippet = document2.createElement(CMS_SNIPPET_TAG);
        snippet.setAttribute("identifier", item.identifier);
        snippet.innerHTML = item.content;
        this._applySlot(snippet, slotName);
        this._applySourceState(snippet, sourceState);
        const fragment2 = document2.createDocumentFragment();
        fragment2.append(snippet);
        return {
          fragment: fragment2,
          selectionTarget: snippet,
          slotElements: [snippet]
        };
      }
      const template20 = document2.createElement("template");
      template20.innerHTML = item.content;
      const fragment = template20.content.cloneNode(true);
      this._expandSnippetReferences(fragment);
      const slotElements = Array.from(fragment.children).filter(this._isElementNode);
      for (const child of slotElements) {
        this._applySlot(child, slotName);
        this._applySourceState(child, sourceState);
      }
      const selectionTarget = slotElements[0] ?? null;
      if (!selectionTarget)
        return null;
      return {
        fragment,
        selectionTarget,
        slotElements
      };
    }
    _createBlockFragment(document2, entry) {
      if (!entry.defaultContent) {
        const fragment2 = document2.createDocumentFragment();
        fragment2.append(document2.createElement(entry.tag));
        return fragment2;
      }
      const template20 = document2.createElement("template");
      template20.innerHTML = entry.defaultContent;
      const fragment = template20.content.cloneNode(true);
      this._expandSnippetReferences(fragment);
      return fragment;
    }
    _insertMedia(parent, item, slot, slotName, sourceState) {
      const remaining = this._remainingSlotCapacity(parent, slot);
      if (remaining <= 0)
        return;
      this._openMediaPicker(item.accept, {
        multiple: remaining > 1,
        maxSelection: typeof slot.max === "number" ? remaining : undefined
      }, (elements) => {
        if (elements.length === 0 || !this._canInsertNodeCount(parent, slot, elements))
          return;
        for (const element of elements) {
          this._applySlot(element, slotName);
          this._applySourceState(element, sourceState);
        }
        parent.target.append(...elements);
        this._reloadFrameDocument(elements[0] ?? null);
      });
    }
    _replaceWithMedia(editor, parent, item, slot, slotName, sourceState) {
      if (!this._canReplaceNodeCount(parent, editor, slot, [editor.target]))
        return;
      this._openMediaPicker(item.accept, {
        multiple: false
      }, (elements) => {
        const element = elements[0];
        if (!element)
          return;
        this._applySlot(element, slotName);
        this._applySourceState(element, sourceState);
        editor.target.replaceWith(element);
        this._reloadFrameDocument(element);
      });
    }
    _openMediaPicker(accept, options, onSelect) {
      const center = new FilesCenter;
      const cleanup = () => center.remove();
      center.addEventListener("close", cleanup, { once: true });
      center.addEventListener("select-file", (event) => {
        const detail = event.detail;
        const element = this._createMediaElement(detail);
        if (!element)
          return;
        onSelect([element]);
      }, { once: true });
      center.addEventListener("select-files", (event) => {
        const detail = event.detail;
        const elements = detail.files.map((file) => this._createMediaElement(file)).filter((element) => Boolean(element));
        onSelect(elements);
      }, { once: true });
      document.body.append(center);
      center.show({
        accept: ["folder", "file"],
        fileAccept: accept ?? ["image"],
        multiple: options.multiple === true,
        maxSelection: options.maxSelection
      });
    }
    _createMediaElement(detail) {
      const document2 = this._frameDocument;
      if (!document2)
        return null;
      if (detail.mimeType?.startsWith("image/") ?? true) {
        const image = document2.createElement("img");
        image.setAttribute("src", detail.src);
        image.setAttribute("alt", detail.label);
        image.addEventListener("load", () => {
          if (image.naturalWidth > 0)
            image.setAttribute("width", String(image.naturalWidth));
          if (image.naturalHeight > 0)
            image.setAttribute("height", String(image.naturalHeight));
        }, { once: true });
        return image;
      }
      if (detail.mimeType?.startsWith("video/")) {
        const video = document2.createElement("video");
        video.setAttribute("src", detail.src);
        video.setAttribute("controls", "");
        return video;
      }
      if (detail.mimeType?.startsWith("audio/")) {
        const audio = document2.createElement("audio");
        audio.setAttribute("src", detail.src);
        audio.setAttribute("controls", "");
        return audio;
      }
      const link = document2.createElement("a");
      link.setAttribute("href", detail.src);
      link.textContent = detail.label;
      return link;
    }
    _expandSnippetReferences(fragment) {
      const snippets = this._insertItems.filter((item) => item.kind === "snippet");
      if (snippets.length === 0)
        return;
      for (const element of Array.from(fragment.querySelectorAll(CMS_SNIPPET_TAG))) {
        const identifier = element.getAttribute("identifier");
        if (!identifier)
          continue;
        const snippet = snippets.find((item) => item.identifier === identifier);
        if (!snippet)
          continue;
        element.innerHTML = snippet.content;
      }
    }
    _isElementNode(node) {
      return node.nodeType === Node.ELEMENT_NODE;
    }
    _canInsertNodeCount(parent, slot, insertedElements) {
      if (typeof slot.max !== "number")
        return true;
      return this._slotChildCount(parent, slot) + insertedElements.length <= slot.max;
    }
    _canReplaceNodeCount(parent, replaced, slot, insertedElements) {
      if (typeof slot.max !== "number")
        return true;
      const replacedCount = (replaced.target.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined) ? 1 : 0;
      return this._slotChildCount(parent, slot) - replacedCount + insertedElements.length <= slot.max;
    }
    _findNextSelectionTargetAfterDelete(editor) {
      const parent = editor.target.parentElement;
      if (!parent || !this._runtime)
        return null;
      return this._runtime.getClosestEditor(parent)?.target ?? null;
    }
    _canDuplicate(editor) {
      const parent = this._parentEditor(editor);
      if (!parent)
        return true;
      const slot = this._findSlot(parent, editor.target.getAttribute("slot") ?? undefined);
      if (!slot)
        return true;
      return !this._isSlotFull(parent, slot);
    }
    _canDelete(editor) {
      const parent = this._parentEditor(editor);
      if (!parent)
        return true;
      const slot = this._findSlot(parent, editor.target.getAttribute("slot") ?? undefined);
      if (!slot?.min)
        return true;
      return this._slotChildCount(parent, slot) > slot.min;
    }
    _canInsertSibling(reference, insertedElement) {
      const parent = this._parentEditor(reference);
      if (!parent) {
        this._applySlot(insertedElement, undefined);
        this._applySourceState(insertedElement, undefined);
        return true;
      }
      const slotName = reference.target.getAttribute("slot") ?? undefined;
      const slot = this._findSlot(parent, slotName);
      if (!slot || !this._canInsertNodeCount(parent, slot, [insertedElement]))
        return false;
      this._applySlot(insertedElement, slotName);
      this._applySourceState(insertedElement, this._sourceStateForSibling(reference));
      return true;
    }
    _canMoveEditor(source, target) {
      if (!this._canDelete(source))
        return false;
      const targetParent = this._parentEditor(target);
      if (!targetParent)
        return true;
      const targetSlotName = target.target.getAttribute("slot") ?? undefined;
      const targetSlot = this._findSlot(targetParent, targetSlotName);
      if (!targetSlot)
        return false;
      const sourceParent = this._parentEditor(source);
      const isSameSlot = sourceParent === targetParent && (source.target.getAttribute("slot") ?? undefined) === targetSlotName;
      if (isSameSlot)
        return true;
      return this._canInsertNodeCount(targetParent, targetSlot, [source.target]);
    }
    _isSlotFull(parent, slot) {
      return typeof slot.max === "number" && this._slotChildCount(parent, slot) >= slot.max;
    }
    _findSlot(parent, slotName) {
      return parent.getContentSlots().find((slot) => (slot.slot ?? undefined) === slotName);
    }
    _slotChildCount(parent, slot) {
      return Array.from(parent.target.children).filter((child) => (child.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined)).length;
    }
    _remainingSlotCapacity(parent, slot) {
      if (typeof slot.max !== "number")
        return Number.MAX_SAFE_INTEGER;
      return Math.max(0, slot.max - this._slotChildCount(parent, slot));
    }
    _parentEditor(editor) {
      if (!this._runtime || !editor.target.parentElement)
        return null;
      return this._runtime.getClosestEditor(editor.target.parentElement)?.target === editor.target ? null : this._runtime.getClosestEditor(editor.target.parentElement) ?? null;
    }
    _applySlot(element, slotName) {
      if (slotName) {
        element.setAttribute("slot", slotName);
      } else {
        element.removeAttribute("slot");
      }
    }
    _applySourceState(element, sourceState) {
      applySourceState(element, sourceState ?? "loaded");
    }
    _sourceStateForSibling(reference) {
      return sourceStateFromElement(reference.target);
    }
    _reloadFrameDocument(selectedTarget = null) {
      if (!this._frameDocument)
        return;
      const root = this._frameDocument.querySelector("[data-cms-editor-root]") ?? this._frameDocument.querySelector("cms-binding-core");
      const contentRoot = this._frameDocument.querySelector("[data-cms-content]");
      if (!root || !contentRoot)
        return;
      this.loadDocument({ root, contentRoot }, selectedTarget);
    }
    _resolveSettingsValues(editor, sections) {
      return sections.map((section) => ({
        ...section,
        settings: section.settings.map((setting) => this._resolveSettingValue(editor, setting))
      }));
    }
    _resolveSettingValue(editor, setting) {
      if (setting.type === "toggle") {
        return {
          ...setting,
          defaultValue: editor.target.hasAttribute(setting.attribute)
        };
      }
      return {
        ...setting,
        defaultValue: editor.target.getAttribute(setting.attribute) ?? setting.defaultValue
      };
    }
    _getTextValue(editor, format) {
      return format === "richtext" ? editor.target.innerHTML : editor.target.textContent ?? "";
    }
    _bindFrameDocument(document2) {
      this._unbindFrameDocument();
      this._frameDocument = document2;
      document2.addEventListener("click", this._onFrameClick, true);
    }
    _unbindFrameDocument() {
      this._frameDocument?.removeEventListener("click", this._onFrameClick, true);
      this._frameDocument = null;
    }
    _eventElement(event) {
      const target = event.target;
      if (!target || !("nodeType" in target))
        return null;
      if (target.nodeType === Node.ELEMENT_NODE)
        return target;
      return target.parentElement;
    }
    _renderStructure(options = {}) {
      if (!this._runtime || this._isEmptyDocumentContent()) {
        this._structureTree.setStructure([], null, this._catalog);
        return;
      }
      const structure = this._decorateStructure(this._runtime.getStructure());
      this._structureTree.setStructure(structure, this._runtime.getSelection()?.editor ?? null, this._catalog, {
        scrollSelectedIntoView: options.scrollStructureIntoView === true,
        repeatableTargets: this._repeatableTargets(structure)
      });
    }
    _decorateStructure(nodes) {
      return nodes.map((node) => {
        if (this._isSourceStateNode(node)) {
          return {
            ...node,
            children: this._decorateEditorStructure(node.children)
          };
        }
        return this._decorateEditorStructureNode(node);
      });
    }
    _decorateEditorStructure(nodes) {
      return nodes.map((node) => this._decorateEditorStructureNode(node));
    }
    _decorateEditorStructureNode(node) {
      const snippet = this._snippetStructureDetails(node);
      return {
        ...node,
        label: snippet?.label ?? node.label,
        icon: snippet?.icon ?? node.icon,
        children: this._decorateStructure(node.children)
      };
    }
    _snippetStructureDetails(node) {
      if (node.tag.toLowerCase() !== CMS_SNIPPET_TAG)
        return null;
      const identifier = node.target.getAttribute("identifier")?.trim() ?? "";
      const item = this._insertItems.find((candidate) => candidate.kind === "snippet" && candidate.identifier === identifier);
      return {
        label: item?.label || identifier || node.label,
        icon: item?.icon || "S"
      };
    }
    _isEmptyDocumentContent() {
      const contentRoot = this._editorDocument?.contentRoot;
      if (!contentRoot)
        return true;
      const meaningfulNodes = Array.from(contentRoot.childNodes).filter((node2) => node2.nodeType !== Node.TEXT_NODE || (node2.textContent ?? "").trim() !== "");
      if (meaningfulNodes.length === 0)
        return true;
      if (meaningfulNodes.length !== 1)
        return false;
      const node = meaningfulNodes[0];
      if (!node)
        return true;
      if (node.nodeType !== Node.ELEMENT_NODE)
        return false;
      const element = node;
      if (element.tagName.toLowerCase() !== "p" || element.attributes.length > 0)
        return false;
      return Array.from(element.childNodes).every((child) => {
        if (child.nodeType === Node.TEXT_NODE)
          return (child.textContent ?? "").trim() === "";
        return child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === "br";
      });
    }
    _repeatableTargets(nodes) {
      if (!this._runtime)
        return [];
      return this._flattenStructure(nodes).filter((node) => !this._isSourceStateNode(node)).filter((node) => this._hasArrayFields(this._runtime.registry.collectDataScopes(node.target))).map((node) => node.target);
    }
    _hasArrayFields(scopes) {
      return scopes.some((scope) => this._fieldsContainArray(scope.fields));
    }
    _fieldsContainArray(fields) {
      return fields.some((field) => field.type === "array" || this._fieldsContainArray(field.children ?? []));
    }
    _syncStructureTreeDataSources() {
      const tree = this.shadowRoot.querySelector("cms-editor-v2-structure-tree");
      if (this._isStructureTree(tree)) {
        tree.setDataSources(this._dataSources);
        return;
      }
      customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
        const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(upgradedTree))
          upgradedTree.setDataSources(this._dataSources);
      });
    }
    _syncSettingsTabs() {
      for (const button of Array.from(this._settingsTabs.querySelectorAll("[data-settings-mode]"))) {
        const isActive = button.dataset.settingsMode === this._settingsMode;
        button.classList.toggle("active", isActive);
        button.ariaPressed = String(isActive);
      }
    }
    _syncViewport() {
      const viewport = VIEWPORTS[this._viewport];
      this._canvas.setAttribute("viewport-width", String(viewport.width));
      this._canvas.setAttribute("viewport-height", String(viewport.height));
      this._canvas.setAttribute("viewport-padding", viewport.padding);
      this._canvas.setAttribute("viewport-fit", viewport.fit);
      this._topBar.viewport = this._viewport;
    }
    _syncEditorMode() {
      this._topBar.mode = this._editorMode;
      this.toggleAttribute("view-mode", this._editorMode === "view");
      if (this._editorMode === "view") {
        this._select(null);
      }
    }
    _syncChromeLabels() {
      const resource = this.getAttribute("resource") ?? "page";
      const defaults = this._resourceChromeDefaults(resource);
      const topBar = this.shadowRoot.querySelector("cms-editor-v2-topbar");
      if (!this._isTopBar(topBar)) {
        this._requestChromeSyncWhenTopBarIsReady();
        return;
      }
      this._applyChromeLabels(topBar, resource, defaults);
    }
    _requestChromeSyncWhenTopBarIsReady() {
      if (this._chromeSyncPending)
        return;
      this._chromeSyncPending = true;
      customElements.whenDefined("cms-editor-v2-topbar").then(() => {
        this._chromeSyncPending = false;
        const topBar = this.shadowRoot?.querySelector("cms-editor-v2-topbar");
        if (topBar)
          customElements.upgrade(topBar);
        if (!this._isTopBar(topBar))
          return;
        const resource = this.getAttribute("resource") ?? "page";
        this._applyChromeLabels(topBar, resource, this._resourceChromeDefaults(resource));
      });
    }
    _applyChromeLabels(topBar, resource, defaults) {
      topBar.setNavigation({
        backHref: this.getAttribute("back-href") ?? defaults.backHref,
        backLabel: this.getAttribute("back-label") ?? defaults.backLabel,
        settingsLabel: this.getAttribute("settings-label") ?? defaults.settingsLabel
      });
      this.shadowRoot.querySelector("#page-settings-title").textContent = this.getAttribute("settings-title") ?? defaults.settingsTitle;
      this.shadowRoot.querySelector(".settings-description").textContent = this.getAttribute("settings-description") ?? defaults.settingsDescription;
      this.shadowRoot.querySelector('[data-page-label="path"]').textContent = this.getAttribute("settings-path-label") ?? defaults.pathLabel;
      this.shadowRoot.querySelector('[data-page-label="tags"]').textContent = this.getAttribute("settings-tags-label") ?? defaults.tagsLabel;
      this.shadowRoot.querySelector('[data-page-label="published"]').textContent = this.getAttribute("settings-status-label") ?? defaults.statusLabel;
      this.shadowRoot.querySelector('[data-page-label="description"]').textContent = this.getAttribute("settings-description-label") ?? defaults.descriptionLabel;
      const isPage = resource === "page";
      this._pageField("path").disabled = !isPage;
      this._pageField("published").closest("label").hidden = !isPage;
    }
    _resourceChromeDefaults(resource) {
      if (resource === "template") {
        return {
          backHref: "/admin/templates",
          backLabel: "Templates",
          settingsLabel: "Template settings",
          settingsTitle: "Template settings",
          settingsDescription: "Configure template metadata.",
          pathLabel: "Identifier",
          tagsLabel: "Category",
          statusLabel: "Status",
          descriptionLabel: "Description"
        };
      }
      if (resource === "snippet") {
        return {
          backHref: "/admin/snippets",
          backLabel: "Snippets",
          settingsLabel: "Snippet settings",
          settingsTitle: "Snippet settings",
          settingsDescription: "Configure snippet metadata.",
          pathLabel: "Identifier",
          tagsLabel: "Category",
          statusLabel: "Status",
          descriptionLabel: "Description"
        };
      }
      return {
        backHref: "/admin/pages",
        backLabel: "Pages",
        settingsLabel: "Page settings",
        settingsTitle: "Page settings",
        settingsDescription: "Configure page-level metadata and routing.",
        pathLabel: "Path",
        tagsLabel: "Tags",
        statusLabel: "Status",
        descriptionLabel: "SEO description"
      };
    }
    _openPageSettings() {
      this._pageSettingsModal.hidden = false;
      const firstInput = this._pageSettingsModal.querySelector("input");
      firstInput?.focus();
    }
    _closePageSettings() {
      this._pageSettingsModal.hidden = true;
    }
    _syncPageSettingsForm() {
      if (!this._pageConfig)
        return;
      this._pageField("title").value = this._pageConfig.title;
      this._pageField("path").value = this._pageConfig.path;
      this._pageField("published").value = String(this._pageConfig.published);
      this._pageField("description").value = this._pageConfig.description;
      this._pageField("tags").value = this._pageConfig.tags.join(", ");
    }
    _applyPageSettingsForm() {
      if (!this._pageConfig)
        return;
      this._pageConfig = {
        id: this._pageConfig.id,
        title: this._pageField("title").value.trim(),
        path: this._pageField("path").value.trim(),
        published: this._pageField("published").value === "true",
        description: this._pageField("description").value,
        tags: this._parseTags(this._pageField("tags").value)
      };
      this._topBar.setPageTitle(this._pageConfig.title, this._pageConfig.path);
    }
    _getContentHtml() {
      const content = this._frameDocument?.querySelector("[data-cms-content]")?.cloneNode(true);
      if (!content)
        return "";
      for (const snippet of Array.from(content.querySelectorAll(CMS_SNIPPET_TAG))) {
        snippet.replaceChildren();
      }
      return content.innerHTML;
    }
    _parseTags(value) {
      return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
    }
    _pageField(name) {
      return this.shadowRoot.querySelector(`[data-page-field="${name}"]`);
    }
    _setSaveStatus(label) {
      this._topBar.saveStatus = label;
    }
    _syncStructureTreeCatalog() {
      const tree = this.shadowRoot.querySelector("cms-editor-v2-structure-tree");
      if (this._isStructureTree(tree)) {
        tree.catalog = this._catalog;
        tree.setInsertItems(this._insertItems);
        tree.setDefaultTemplateSelection(this._defaultTemplateSelection);
        return;
      }
      customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
        const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(upgradedTree)) {
          upgradedTree.catalog = this._catalog;
          upgradedTree.setInsertItems(this._insertItems);
          upgradedTree.setDefaultTemplateSelection(this._defaultTemplateSelection);
        }
      });
    }
    _syncStructureTreeInsertItems() {
      const tree = this.shadowRoot.querySelector("cms-editor-v2-structure-tree");
      if (this._isStructureTree(tree)) {
        tree.setInsertItems(this._insertItems);
        tree.setDefaultTemplateSelection(this._defaultTemplateSelection);
        return;
      }
      customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
        const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(upgradedTree)) {
          upgradedTree.setInsertItems(this._insertItems);
          upgradedTree.setDefaultTemplateSelection(this._defaultTemplateSelection);
        }
      });
    }
    _syncStructureTreeDefaultTemplateSelection() {
      const tree = this.shadowRoot.querySelector("cms-editor-v2-structure-tree");
      if (this._isStructureTree(tree)) {
        tree.setDefaultTemplateSelection(this._defaultTemplateSelection);
        return;
      }
      customElements.whenDefined("cms-editor-v2-structure-tree").then(() => {
        const upgradedTree = this.shadowRoot?.querySelector("cms-editor-v2-structure-tree");
        if (this._isStructureTree(upgradedTree)) {
          upgradedTree.setDefaultTemplateSelection(this._defaultTemplateSelection);
        }
      });
    }
    _isStructureTree(value) {
      return Boolean(value && "catalog" in value && "setStructure" in value && "setInsertItems" in value && "setDefaultTemplateSelection" in value);
    }
    _isTopBar(value) {
      return Boolean(value && "setNavigation" in value);
    }
    _findStructureNodeLabel(editor) {
      const visit = (nodes) => {
        for (const node of nodes) {
          if (!this._isSourceStateNode(node) && node.editor === editor)
            return node.label;
          const childLabel = visit(node.children);
          if (childLabel)
            return childLabel;
        }
        return null;
      };
      return this._runtime ? visit(this._runtime.getStructure()) : null;
    }
    _flattenStructure(nodes) {
      return nodes.flatMap((node) => [
        node,
        ...this._flattenStructure(node.children)
      ]);
    }
    _isSourceStateNode(node) {
      return node.kind === "source-state";
    }
    get _structureTree() {
      return this.shadowRoot.querySelector("cms-editor-v2-structure-tree");
    }
    get _settings() {
      return this.shadowRoot.querySelector("cms-editor-v2-settings-view");
    }
    get _settingsTabs() {
      return this.shadowRoot.querySelector(".panel-tabs");
    }
    get _canvas() {
      return this.shadowRoot.querySelector("cms-editor-v2-canvas");
    }
    get _topBar() {
      return this.shadowRoot.querySelector("cms-editor-v2-topbar");
    }
    get _repeatPicker() {
      let picker = this.shadowRoot.querySelector("cms-editor-v2-repeat-picker");
      if (!picker) {
        picker = new RepeatPicker;
        this.shadowRoot.append(picker);
      }
      return picker;
    }
    get _pageSettingsModal() {
      return this.shadowRoot.querySelector(".page-settings-modal");
    }
  }
  if (!customElements.get("cms-editor-shell")) {
    customElements.define("cms-editor-shell", Shell);
  }
  // src/core/dom/meta/getMetaBasePath.ts
  function getMetaBasePath() {
    const meta = document.querySelector('meta[name="basePath"]');
    const content = meta?.getAttribute("content") ?? "";
    if (!content || content === "/")
      return "";
    return content.replace(/\/+$/, "");
  }

  // src/core/editorSystemV2/defaultEditors/BindingCoreEditor.ts
  class BindingCoreEditor extends Editor {
    mountEditor() {
      this.declareDataScope({
        name: "plans",
        label: "Plans data",
        source: "urn:demo:plans",
        fields: [
          { path: "name", type: "string" },
          { path: "price", type: "number" },
          { path: "cta.label", type: "string" }
        ]
      });
    }
  }
  // src/core/editorSystemV2/defaultEditors/CodeEditor.ts
  class CodeEditor extends Editor {
    textCapability() {
      return {
        format: "text",
        dynamic: true
      };
    }
  }
  // src/core/editorSystemV2/defaultEditors/HeadingEditor.ts
  class HeadingEditor extends Editor {
    textCapability() {
      return {
        format: "richtext",
        bold: true,
        italic: true,
        underline: true,
        link: true,
        color: true,
        dynamic: true
      };
    }
  }
  // src/core/editorSystemV2/defaultEditors/ImageEditor.ts
  class ImageEditor extends Editor {
    settings() {
      return [
        {
          kind: "self",
          label: "Image",
          settings: [
            {
              type: "page-link",
              label: "Source",
              attribute: "src",
              allowPage: false,
              allowExternal: false,
              allowMedia: true
            },
            {
              type: "text",
              label: "Alt text",
              attribute: "alt"
            },
            {
              type: "text",
              label: "Width",
              attribute: "width"
            },
            {
              type: "text",
              label: "Height",
              attribute: "height"
            }
          ]
        }
      ];
    }
  }
  // src/core/editorSystemV2/defaultEditors/ListEditor.ts
  class ListEditor extends Editor {
    contentSlots() {
      return [
        {
          label: "Items",
          min: 1,
          accepts: [{ kind: "component", tag: "li" }]
        }
      ];
    }
  }
  // src/core/editorSystemV2/defaultEditors/ListItemEditor.ts
  class ListItemEditor extends Editor {
    textCapability() {
      return {
        format: "richtext",
        bold: true,
        italic: true,
        underline: true,
        link: true,
        color: true,
        size: true,
        dynamic: true
      };
    }
  }
  // src/core/editorSystemV2/defaultEditors/ParagraphEditor.ts
  class ParagraphEditor extends Editor {
    textCapability() {
      return {
        format: "richtext",
        bold: true,
        italic: true,
        underline: true,
        link: true,
        color: true,
        size: true,
        dynamic: true
      };
    }
  }
  // src/core/editorSystemV2/defaultEditors/QuoteEditor.ts
  class QuoteEditor extends Editor {
    textCapability() {
      return {
        format: "richtext",
        bold: true,
        italic: true,
        underline: true,
        link: true,
        dynamic: true
      };
    }
  }
  // src/core/editorSystemV2/defaultEditors/SnippetEditor.ts
  class SnippetEditor extends Editor {
    structureMode() {
      return "opaque";
    }
    settings() {
      return [
        {
          kind: "self",
          label: "Snippet",
          settings: [
            {
              type: "text",
              label: "Identifier",
              attribute: "identifier",
              disabled: true
            }
          ]
        }
      ];
    }
  }
  // src/core/editorSystemV2/defaultEditors/SpanEditor.ts
  class SpanEditor extends Editor {
    textCapability() {
      return {
        format: "richtext",
        bold: true,
        italic: true,
        underline: true,
        link: true,
        dynamic: true
      };
    }
  }
  // src/core/editorSystemV2/editorCatalog.ts
  function nativeElementConstructor(name) {
    const constructor = globalThis[name];
    if (!constructor) {
      throw new Error(`Cannot create editor catalog: ${name} is not available.`);
    }
    return constructor;
  }
  function createControlEditorCatalog() {
    return [
      {
        tag: "cms-binding-core",
        label: "Binding core",
        description: "Provides global data scopes to editable content.",
        icon: "database",
        category: "Runtime",
        bloc: un,
        editor: BindingCoreEditor
      },
      {
        tag: CMS_SNIPPET_TAG,
        label: "Snippet",
        description: "References a reusable snippet. Edit the snippet itself from the snippet editor.",
        icon: "braces",
        category: "Content",
        subCategory: "Reusable",
        bloc: nativeElementConstructor("HTMLElement"),
        editor: SnippetEditor
      },
      {
        tag: "p",
        label: "Paragraph",
        description: "Plain rich text content.",
        icon: "pilcrow",
        category: "Text",
        defaultContent: "<p>Text</p>",
        bloc: nativeElementConstructor("HTMLParagraphElement"),
        editor: ParagraphEditor
      },
      ...headingCatalogEntries(),
      {
        tag: "img",
        label: "Image",
        description: "A media image with source, alt text and intrinsic dimensions.",
        icon: "image",
        category: "Media",
        subCategory: "Image",
        bloc: nativeElementConstructor("HTMLImageElement"),
        editor: ImageEditor
      },
      {
        tag: "span",
        label: "Span",
        description: "Inline rich text content.",
        icon: "type",
        category: "Text",
        subCategory: "Inline",
        bloc: nativeElementConstructor("HTMLSpanElement"),
        editor: SpanEditor
      },
      {
        tag: "code",
        label: "Code",
        description: "Inline code content.",
        icon: "code",
        category: "Text",
        subCategory: "Inline",
        bloc: nativeElementConstructor("HTMLElement"),
        editor: CodeEditor
      },
      {
        tag: "blockquote",
        label: "Quote",
        description: "Quoted rich text content.",
        icon: "quote",
        category: "Text",
        subCategory: "Blocks",
        bloc: nativeElementConstructor("HTMLQuoteElement"),
        editor: QuoteEditor
      },
      {
        tag: "ul",
        label: "Unordered list",
        description: "A list of unordered items.",
        icon: "list",
        category: "Text",
        subCategory: "Lists",
        defaultContent: "<ul><li>List item</li></ul>",
        bloc: nativeElementConstructor("HTMLUListElement"),
        editor: ListEditor
      },
      {
        tag: "ol",
        label: "Ordered list",
        description: "A list of ordered items.",
        icon: "list-ordered",
        category: "Text",
        subCategory: "Lists",
        defaultContent: "<ol><li>List item</li></ol>",
        bloc: nativeElementConstructor("HTMLOListElement"),
        editor: ListEditor
      },
      {
        tag: "li",
        label: "List item",
        description: "An item inside a list.",
        icon: "list-tree",
        category: "Text",
        subCategory: "Lists",
        defaultContent: "<li>List item</li>",
        bloc: nativeElementConstructor("HTMLLIElement"),
        editor: ListItemEditor
      }
    ];
  }
  function headingCatalogEntries() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      label: `Heading ${level}`,
      description: `Level ${level} section heading.`,
      icon: "heading",
      category: "Text",
      subCategory: "Headings",
      defaultContent: `<h${level}>Heading</h${level}>`,
      bloc: nativeElementConstructor("HTMLHeadingElement"),
      editor: HeadingEditor
    }));
  }

  // src/components/editorSystemV2/bootstrap.ts
  var catalogPromise = null;
  var configuredShells = new WeakSet;
  var saveDocumentListener = (event) => {
    onSaveDocument(event);
  };
  var deleteDocumentListener = (event) => {
    onDeleteDocument(event);
  };
  function currentPageIdentifier() {
    return new URL(window.location.href).searchParams.get("id");
  }
  function shellResource(shell) {
    const resource = shell.getAttribute("resource");
    if (resource === "template" || resource === "snippet")
      return resource;
    return "page";
  }
  function configureShell(shell) {
    if (!(shell instanceof Shell))
      return;
    if (configuredShells.has(shell))
      return;
    configuredShells.add(shell);
    shell.addEventListener(EDITOR_V2_SAVE_DOCUMENT_EVENT, saveDocumentListener);
    shell.addEventListener(EDITOR_V2_DELETE_DOCUMENT_EVENT, deleteDocumentListener);
    configureShellCatalogAndFrame(shell);
    if (currentPageIdentifier())
      loadDocumentConfig(shell, shellResource(shell), currentPageIdentifier());
  }
  async function configureShellCatalogAndFrame(shell) {
    const [catalog, insertItems, dataSources, settings] = await Promise.all([
      loadEditorCatalog(),
      loadInsertItems(),
      loadDataSources(),
      loadEditorSettings()
    ]);
    console.log(dataSources);
    shell.setCatalog(catalog);
    shell.setInsertItems(insertItems);
    shell.setDataSources(dataSources);
    shell.setDefaultTemplateSelection({
      category: settings.editor?.layoutCategory || undefined
    });
    const documentId = currentPageIdentifier();
    const resource = shellResource(shell);
    const frameUrl = documentId ? `${getMetaBasePath()}/api/editor/frame?type=${resource}&id=${encodeURIComponent(documentId)}` : `${getMetaBasePath()}/api/editor/frame?type=${resource}`;
    shell.shadowRoot?.querySelector("cms-editor-v2-canvas")?.setAttribute("frame-url", frameUrl);
  }
  async function loadInsertItems() {
    const [templates, snippets] = await Promise.all([
      loadTemplateItems(),
      loadSnippetItems()
    ]);
    return [
      ...templates,
      ...snippets
    ];
  }
  async function loadDataSources() {
    return fetchJson("editor/sources", []);
  }
  async function loadEditorSettings() {
    return fetchJson("system/settings", {});
  }
  async function loadTemplateItems() {
    const templates = await fetchJson("template/list", []);
    const details = await Promise.all(templates.map((template20) => fetchJson(`template?id=${encodeURIComponent(template20.id)}`, {
      ...template20,
      content: ""
    })));
    return details.filter((template20) => template20.content).map((template20) => ({
      kind: "template",
      id: template20.id,
      label: template20.name,
      description: template20.description,
      category: template20.category || "Templates",
      icon: "T",
      content: template20.content ?? ""
    }));
  }
  async function loadSnippetItems() {
    const snippets = await fetchJson("snippet/list", []);
    const details = await Promise.all(snippets.map((snippet) => fetchJson(`snippet?id=${encodeURIComponent(snippet.id)}`, {
      ...snippet,
      content: ""
    })));
    return details.filter((snippet) => snippet.identifier).map((snippet) => ({
      kind: "snippet",
      id: snippet.id,
      identifier: snippet.identifier,
      label: snippet.name,
      description: snippet.description,
      category: snippet.category || "Snippets",
      icon: "S",
      content: snippet.content ?? ""
    }));
  }
  async function fetchJson(path, fallback) {
    try {
      const response = await fetch(`${getMetaBasePath()}/api/${path}`);
      if (!response.ok)
        return fallback;
      return await response.json();
    } catch (error) {
      console.error("[editor] failed to load picker source", path, error);
      return fallback;
    }
  }
  async function loadEditorCatalog() {
    catalogPromise ??= loadEditorCatalogOnce();
    return catalogPromise;
  }
  async function loadEditorCatalogOnce() {
    const runtime = installEditorCatalogRuntime();
    try {
      await loadScript(`${getMetaBasePath()}/api/editor/script.js`);
    } catch (error) {
      console.error("[editor] editor catalog script failed", error);
    }
    return mergeEditorCatalogs(createControlEditorCatalog(), runtime.getCatalog());
  }
  function installEditorCatalogRuntime() {
    const entries = [];
    const runtime = {
      Editor,
      registerEditor(entry) {
        try {
          entries.push(createEditorCatalogEntry(entry, {
            tag: entry.tag ?? "unknown-bloc",
            label: entry.label ?? entry.tag ?? "Unknown bloc",
            description: entry.description,
            category: entry.category,
            defaultContent: entry.defaultContent,
            bloc: entry.bloc
          }));
        } catch (error) {
          console.error("[editor] invalid editor catalog entry", entry, error);
        }
      },
      getCatalog() {
        return [...entries];
      }
    };
    window.p9rEditor = runtime;
    return runtime;
  }
  async function loadScript(src) {
    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-editor-catalog-script="${src}"]`);
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.editorCatalogScript = src;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.append(script);
    });
  }
  async function loadDocumentConfig(shell, resource, id) {
    if (resource !== "page") {
      await loadReusableConfig(shell, resource, id);
      return;
    }
    await loadPageConfig(shell, id);
  }
  async function loadPageConfig(shell, pageId) {
    const response = await fetch(`${getMetaBasePath()}/api/page/configDetail?id=${encodeURIComponent(pageId)}`);
    if (response.redirected) {
      window.location.href = response.url;
      return;
    }
    if (!response.ok) {
      shell.setSaveStatus("Page load failed");
      return;
    }
    const page = await response.json();
    shell.setPageConfig({
      id: page.id,
      title: page.title,
      path: page.path,
      description: page.description,
      tags: page.tags,
      published: page.published,
      defaultTemplateCategory: page.defaultTemplateCategory
    });
  }
  async function loadReusableConfig(shell, resource, id) {
    const response = await fetch(`${getMetaBasePath()}/api/${resource}?id=${encodeURIComponent(id)}`);
    if (response.redirected) {
      window.location.href = response.url;
      return;
    }
    if (!response.ok) {
      shell.setSaveStatus(`${resourceLabel(resource)} load failed`);
      return;
    }
    const detail = await response.json();
    shell.setPageConfig({
      id: detail.id,
      title: detail.name,
      path: detail.identifier,
      description: detail.description ?? "",
      tags: detail.category ? [detail.category] : [],
      published: true
    });
  }
  async function onSaveDocument(event) {
    const shell = event.currentTarget;
    if (!(shell instanceof Shell))
      return;
    try {
      await saveDocument(shellResource(shell), event.detail.page, event.detail.content);
      shell.setSaveStatus("Saved");
    } catch (error) {
      console.error("[editor] save failed", error);
      shell.setSaveStatus("Save failed");
    }
  }
  async function onDeleteDocument(event) {
    const shell = event.currentTarget;
    if (!(shell instanceof Shell))
      return;
    const resource = shellResource(shell);
    const id = currentPageIdentifier();
    if (!id) {
      shell.setSaveStatus(`${resourceLabel(resource)} delete failed`);
      return;
    }
    if (!window.confirm(`Delete this ${resource}? This cannot be undone.`))
      return;
    try {
      await deleteDocument(resource, id);
      window.location.href = listUrl(resource);
    } catch (error) {
      console.error("[editor] delete failed", error);
      shell.setSaveStatus(`${resourceLabel(resource)} delete failed`);
    }
  }
  async function saveDocument(resource, page, content) {
    if (resource === "page") {
      await savePage(page, content);
      return;
    }
    await saveReusable(resource, page, content);
  }
  async function savePage(page, content) {
    const response = await fetch(`${getMetaBasePath()}/api/page`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: page.id,
        title: page.title,
        path: page.path,
        description: page.description,
        visible: page.published,
        tags: page.tags,
        content
      })
    });
    if (!response.ok) {
      throw new Error(`Page save failed with ${response.status}`);
    }
  }
  async function saveReusable(resource, page, content) {
    const response = await fetch(`${getMetaBasePath()}/api/${resource}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: page.id,
        name: page.title,
        category: page.tags[0] ?? "",
        description: page.description,
        content
      })
    });
    if (!response.ok) {
      throw new Error(`${resourceLabel(resource)} save failed with ${response.status}`);
    }
  }
  async function deleteDocument(resource, id) {
    const response = await fetch(`${getMetaBasePath()}/api/${resource}?id=${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    if (response.status === 409 && resource === "snippet") {
      await deleteSnippetInUse(id, response);
      return;
    }
    if (!response.ok) {
      throw new Error(`${resourceLabel(resource)} delete failed with ${response.status}`);
    }
  }
  async function deleteSnippetInUse(id, response) {
    const body = await response.json().catch(() => null);
    const pages = Array.isArray(body?.pages) ? body.pages : [];
    const suffix = pages.length ? `

Used by:
${pages.map((page) => `- ${page.title || page.path || "Untitled"}`).join(`
`)}` : "";
    if (!window.confirm(`This snippet is used by pages. Delete it anyway?${suffix}`)) {
      throw new Error("Snippet delete cancelled");
    }
    const forced = await fetch(`${getMetaBasePath()}/api/snippet?id=${encodeURIComponent(id)}&force=true`, {
      method: "DELETE"
    });
    if (!forced.ok) {
      throw new Error(`Snippet delete failed with ${forced.status}`);
    }
  }
  function listUrl(resource) {
    return `${getMetaBasePath()}/admin/${resource === "page" ? "pages" : `${resource}s`}`;
  }
  function resourceLabel(resource) {
    return resource[0].toUpperCase() + resource.slice(1);
  }
  function configureExistingShells() {
    document.querySelectorAll("cms-editor-shell").forEach(configureShell);
  }
  function configureAddedShells(node) {
    if (!(node instanceof Element))
      return;
    if (node.matches("cms-editor-shell")) {
      configureShell(node);
    }
    node.querySelectorAll("cms-editor-shell").forEach(configureShell);
  }
  customElements.whenDefined("cms-editor-shell").then(() => {
    configureExistingShells();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", configureExistingShells, { once: true });
    }
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(configureAddedShells);
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  });

  // src/components/media/CardMedia/template.html
  var template_default23 = `<div class="card">
    <div class="preview">
        <slot name="image">
            <span class="placeholder">
                <svg class="placeholder-img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2"/>
                    <circle cx="9" cy="9" r="2"/>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                </svg>
                <svg class="placeholder-folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/>
                </svg>
            </span>
        </slot>
    </div>
    <div class="info">
        <span class="label"><slot name="label"></slot></span>
    </div>
</div>
`;

  // src/components/media/CardMedia/style.css
  var style_default22 = `:host {
    --card-bg: var(--bg-surface, #fff);
    --card-border: var(--border-default, #e2e8f0);
    --card-radius: 12px;
    --card-hover-border: var(--primary-base, #4361ee);
    --card-hover-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    --preview-bg: var(--bg-base, #f8fafc);
    --label-color: var(--text-main, #1e293b);
    --placeholder-color: var(--text-muted, #94a3b8);
    --folder-color: var(--primary-base, #4361ee);

    display: block;
    cursor: pointer;
}

.card {
    border: 1px solid var(--card-border);
    border-radius: var(--card-radius);
    overflow: hidden;
    background: var(--card-bg);
    transition: border-color 0.15s, box-shadow 0.15s;
}

.card:hover {
    border-color: var(--card-hover-border);
    box-shadow: var(--card-hover-shadow);
}

/* ── Folder variant ── */
:host([type="folder"]) .card {
    border-style: dashed;
    border-color: var(--card-border);
}

:host([type="folder"]) .card:hover {
    border-color: var(--folder-color);
}

:host([type="folder"]) .preview {
    background: var(--preview-bg);
    background-image: none;
}

:host([type="folder"]) .placeholder-img {
    display: none;
}

:host([type="folder"]) .placeholder-folder {
    display: block;
    color: var(--folder-color);
    opacity: 0.6;
}

:host([type="folder"]) .card:hover .placeholder-folder {
    opacity: 1;
}

/* ── Preview ── */
.preview {
    aspect-ratio: 4/3;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--preview-bg);
    background-image:
        linear-gradient(45deg, #eee 25%, transparent 25%),
        linear-gradient(-45deg, #eee 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #eee 75%),
        linear-gradient(-45deg, transparent 75%, #eee 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
    overflow: hidden;
    position: relative;
}

::slotted([slot="image"]) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}

.placeholder {
    color: var(--placeholder-color);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--preview-bg);
}

.placeholder svg {
    width: 40px;
    height: 40px;
    opacity: 0.4;
}

.placeholder-folder {
    display: none;
    width: 48px;
    height: 48px;
}

/* ── Info ── */
.info {
    padding: 10px 12px;
    border-top: 1px solid var(--card-border);
}

.label {
    font-size: 12px;
    font-weight: 500;
    color: var(--label-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
}
`;

  // src/components/media/CardMedia/CardMedia.ts
  class CardMedia extends A2 {
    constructor() {
      super({
        css: style_default22,
        template: template_default23
      });
    }
  }
  if (!customElements.get("p9r-card-media")) {
    customElements.define("p9r-card-media", CardMedia);
  }

  // src/components/media/CropSystem/template.html
  var template_default24 = `<div class="backdrop" id="backdrop">
    <div class="modal">
        <div class="header">
            <h3>Crop image</h3>
            <button class="close-btn" id="close-btn" title="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="body">
            <div class="canvas-area">
                <slot name="image"></slot>
            </div>
            <div class="sidebar">
                <div class="field">
                    <label>Aspect ratio</label>
                    <div class="ratio-buttons">
                        <button class="ratio-btn active" data-ratio="free">Free</button>
                        <button class="ratio-btn" data-ratio="1:1">1:1</button>
                        <button class="ratio-btn" data-ratio="4:3">4:3</button>
                        <button class="ratio-btn" data-ratio="16:9">16:9</button>
                    </div>
                </div>
                <div class="field">
                    <label>Output size</label>
                    <span class="value" id="output-size">—</span>
                </div>
            </div>
        </div>
        <div class="footer">
            <button class="btn-cancel" id="btn-cancel">Cancel</button>
            <button class="btn-apply" id="btn-apply">Apply crop</button>
        </div>
    </div>
</div>
`;

  // src/components/media/CropSystem/style.css
  var style_default23 = `:host {
    --modal-bg: var(--bg-surface, #fff);
    --modal-border: var(--border-default, #e2e8f0);
    --modal-radius: 16px;
    --modal-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
    --backdrop-bg: rgba(0, 0, 0, 0.55);
    --header-color: var(--text-main, #1e293b);
    --close-color: var(--text-muted, #94a3b8);
    --label-color: var(--text-muted, #94a3b8);
    --value-color: var(--text-body, #475569);
    --primary: var(--primary-base, #4361ee);
    --primary-hover: var(--primary-contrasted, #3451c7);
    --canvas-bg: #1a1a1a;

    display: none;
}

:host([open]) {
    display: block;
}

.backdrop {
    position: fixed;
    inset: 0;
    z-index: 700;
    background: var(--backdrop-bg);
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal {
    background: var(--modal-bg);
    border-radius: var(--modal-radius);
    box-shadow: var(--modal-shadow);
    width: 800px;
    max-width: 94vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--modal-border);
}

.header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--header-color);
}

.close-btn {
    background: none;
    border: none;
    padding: 6px;
    cursor: pointer;
    color: var(--close-color);
    border-radius: 8px;
    transition: background 0.15s, color 0.15s;
}

.close-btn:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--header-color);
}

.body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.canvas-area {
    flex: 1;
    background: var(--canvas-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    position: relative;
}

::slotted([slot="image"]) {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
}

.sidebar {
    width: 200px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    border-left: 1px solid var(--modal-border);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.field label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--label-color);
}

.value {
    font-size: 13px;
    color: var(--value-color);
}

.ratio-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.ratio-btn {
    padding: 4px 10px;
    border: 1px solid var(--modal-border);
    border-radius: 6px;
    background: none;
    font-size: 11px;
    font-weight: 500;
    color: var(--value-color);
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, background 0.15s;
}

.ratio-btn:hover {
    border-color: var(--primary);
}

.ratio-btn.active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
}

.footer {
    padding: 16px 24px;
    border-top: 1px solid var(--modal-border);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.btn-cancel {
    padding: 8px 16px;
    background: none;
    border: 1px solid var(--modal-border);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--close-color);
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s, border-color 0.15s;
}

.btn-cancel:hover {
    color: var(--header-color);
    border-color: var(--header-color);
}

.btn-apply {
    padding: 8px 16px;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
}

.btn-apply:hover {
    background: var(--primary-hover);
}
`;

  // src/components/media/CropSystem/CropSystem.ts
  class CropSystem extends A2 {
    constructor() {
      super({
        css: style_default23,
        template: template_default24
      });
    }
    connectedCallback() {
      const backdrop = this.shadowRoot.getElementById("backdrop");
      const closeBtn = this.shadowRoot.getElementById("close-btn");
      const cancelBtn = this.shadowRoot.getElementById("btn-cancel");
      const applyBtn = this.shadowRoot.getElementById("btn-apply");
      closeBtn.addEventListener("click", () => this.close());
      cancelBtn.addEventListener("click", () => this.close());
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop)
          this.close();
      });
      applyBtn.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("crop", { detail: {} }));
        this.close();
      });
      const ratioButtons = this.shadowRoot.querySelectorAll(".ratio-btn");
      ratioButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          ratioButtons.forEach((b2) => b2.classList.remove("active"));
          btn.classList.add("active");
        });
      });
    }
    open() {
      this.setAttribute("open", "");
    }
    close() {
      this.removeAttribute("open");
      this.dispatchEvent(new CustomEvent("close"));
    }
  }
  customElements.define("p9r-crop-system", CropSystem);

  // src/components/media/DetailMedia/template.html
  var template_default25 = `<div class="backdrop" id="backdrop">
    <div class="modal">
        <div class="header">
            <h3 id="title">File details</h3>
            <button class="close-btn" id="close-btn" title="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="body">
            <div class="left">
                <div class="preview">
                    <slot name="preview"></slot>
                </div>
                <div class="tools">
                    <button class="tool" disabled title="Coming soon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download
                    </button>
                    <button class="tool" disabled title="Coming soon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
                        Replace
                        <span class="tag">Soon</span>
                    </button>
                    <button class="tool" disabled title="Coming soon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                        Crop
                        <span class="tag">Soon</span>
                    </button>
                </div>
            </div>
            <div class="right">
                <slot name="fields"></slot>
                <slot name="actions"></slot>
            </div>
        </div>
    </div>
</div>
`;

  // src/components/media/DetailMedia/style.css
  var style_default24 = `:host {
    --modal-bg: var(--bg-surface, #fff);
    --modal-border: var(--border-default, #e2e8f0);
    --modal-radius: 16px;
    --modal-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
    --modal-width: 680px;
    --backdrop-bg: rgba(0, 0, 0, 0.45);
    --header-color: var(--text-main, #1e293b);
    --close-color: var(--text-muted, #94a3b8);
    --tool-bg: var(--bg-base, #f8fafc);
    --tool-border: var(--border-default, #e2e8f0);
    --tool-color: var(--text-muted, #94a3b8);
    --tag-bg: var(--bg-surface, #fff);

    display: none;
}

:host([open]) {
    display: block;
}

/* ── Backdrop ── */
.backdrop {
    position: fixed;
    inset: 0;
    z-index: 600;
    background: var(--backdrop-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Modal ── */
.modal {
    background: var(--modal-bg);
    border-radius: var(--modal-radius);
    box-shadow: var(--modal-shadow);
    width: var(--modal-width);
    max-width: 92vw;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.2s ease;
}

/* ── Header ── */
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--modal-border);
    flex-shrink: 0;
}

.header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--header-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}

.close-btn {
    background: none;
    border: none;
    padding: 6px;
    cursor: pointer;
    color: var(--close-color);
    border-radius: 8px;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0;
}

.close-btn:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--header-color);
}

/* ── Body ── */
.body {
    display: flex;
    gap: 24px;
    padding: 24px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
}

/* ── Left column ── */
.left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}

.preview {
    aspect-ratio: 4/3;
    display: flex;
    align-items: center;
    justify-content: center;
    background-image:
        linear-gradient(45deg, #eee 25%, transparent 25%),
        linear-gradient(-45deg, #eee 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #eee 75%),
        linear-gradient(-45deg, transparent 75%, #eee 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--modal-border);
}

::slotted([slot="preview"]) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}

/* ── Tools ── */
.tools {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.tool {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border: 1px solid var(--tool-border);
    border-radius: 8px;
    background: var(--tool-bg);
    font-size: 11px;
    font-weight: 500;
    color: var(--tool-color);
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, color 0.15s;
}

.tool:disabled {
    cursor: default;
    opacity: 0.5;
}

.tool:not(:disabled):hover {
    border-color: var(--header-color);
    color: var(--header-color);
}

.tool svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

.tag {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--tag-bg);
    border: 1px solid var(--tool-border);
    border-radius: 4px;
    padding: 1px 4px;
    color: var(--tool-color);
}

/* ── Right column ── */
.right {
    width: 260px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
}

::slotted([slot="fields"]) {
    display: block;
}

::slotted([slot="actions"]) {
    display: block;
    margin-top: auto;
    padding-top: 16px;
}
`;

  // src/components/media/DetailMedia/DetailMedia.ts
  class DetailMedia extends A2 {
    constructor() {
      super({
        css: style_default24,
        template: template_default25
      });
    }
    connectedCallback() {
      const backdrop = this.shadowRoot.getElementById("backdrop");
      const closeBtn = this.shadowRoot.getElementById("close-btn");
      closeBtn.addEventListener("click", () => this.close());
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop)
          this.close();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.hasAttribute("open"))
          this.close();
      });
    }
    open(label) {
      if (label) {
        this.shadowRoot.getElementById("title").textContent = label;
      }
      this.setAttribute("open", "");
    }
    close() {
      this.removeAttribute("open");
      this.dispatchEvent(new CustomEvent("close"));
    }
  }
  if (!customElements.get("p9r-detail-media")) {
    customElements.define("p9r-detail-media", DetailMedia);
  }

  // src/components/media/GridMedia/view/template.html
  var template_default26 = `<div class="toolbar">
    <div class="breadcrumb" id="breadcrumb">
        <span class="bc-current">Root</span>
    </div>
</div>

<div class="grid" id="grid"></div>

<div class="empty" id="empty">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/>
    </svg>
    <p>This folder is empty</p>
</div>

<div class="drop-overlay" id="drop-overlay">
    <span>Drop files to upload</span>
</div>

<!-- New folder popover -->
<div class="nf-backdrop" id="nf-backdrop">
    <div class="nf-popover">
        <label class="nf-label">New folder</label>
        <input type="text" class="nf-input" id="nf-input" placeholder="Folder name…" autocomplete="off">
        <div class="nf-actions">
            <button class="nf-cancel" id="nf-cancel">Cancel</button>
            <button class="nf-confirm" id="nf-confirm">Create</button>
        </div>
    </div>
</div>

<!-- Context menu -->
<div class="ctx-menu" id="ctx-menu">
    <button class="ctx-item" data-action="rename">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        Rename
    </button>
    <button class="ctx-item ctx-danger" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        Delete
    </button>
</div>

<!-- Rename popover -->
<div class="nf-backdrop" id="rename-backdrop">
    <div class="nf-popover">
        <label class="nf-label">Rename</label>
        <input type="text" class="nf-input" id="rename-input" placeholder="New name…" autocomplete="off">
        <div class="nf-actions">
            <button class="nf-cancel" id="rename-cancel">Cancel</button>
            <button class="nf-confirm" id="rename-confirm">Rename</button>
        </div>
    </div>
</div>

<input type="file" id="file-input" hidden multiple accept="image/*,video/*,audio/*,.pdf,.zip,.svg">

<p9r-detail-media id="detail"></p9r-detail-media>
<p9r-crop-system id="crop"></p9r-crop-system>
`;

  // src/components/media/GridMedia/view/style.css
  var style_default25 = `:host {
    --grid-gap: 16px;
    --grid-min-col: 180px;
    --empty-color: var(--text-muted, #94a3b8);
    --border: var(--border-default, #e2e8f0);
    --bg: var(--bg-base, #f8fafc);
    --bg-surface: var(--bg-surface, #fff);
    --text: var(--text-main, #1e293b);
    --text-muted: var(--text-muted, #94a3b8);
    --primary: var(--primary-base, #4361ee);
    --primary-hover: var(--primary-contrasted, #3451c7);
    --danger: var(--danger-base, #ef4444);

    display: block;
    position: relative;
}

/* ── Toolbar ── */
.toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
}

.breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    font-size: 13px;
    color: var(--text-muted);
    min-width: 0;
}

.bc-item {
    cursor: pointer;
    color: var(--primary);
    font-weight: 500;
    white-space: nowrap;
}

.bc-item:hover {
    text-decoration: underline;
}

.bc-sep {
    color: var(--text-muted);
}

.bc-current {
    color: var(--text);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ── New folder popover ── */
.nf-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 500;
    background: rgba(0, 0, 0, 0.25);
    align-items: center;
    justify-content: center;
    animation: nfFadeIn 0.12s ease;
}

.nf-backdrop.visible {
    display: flex;
}

@keyframes nfFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes nfPop {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
}

.nf-popover {
    background: var(--bg-surface);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.14);
    padding: 20px;
    width: 320px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: nfPop 0.15s ease;
}

.nf-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
}

.nf-input {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    background: var(--bg);
    outline: none;
    transition: border-color 0.15s;
}

.nf-input:focus {
    border-color: var(--primary);
}

.nf-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

.nf-cancel {
    padding: 7px 14px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s, border-color 0.15s;
}

.nf-cancel:hover {
    color: var(--text);
    border-color: var(--text);
}

.nf-confirm {
    padding: 7px 14px;
    background: var(--primary);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
}

.nf-confirm:hover {
    background: var(--primary-hover);
}

/* ── Context menu ── */
.ctx-menu {
    display: none;
    position: fixed;
    z-index: 800;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    padding: 4px;
    min-width: 140px;
    flex-direction: column;
}

.ctx-menu.visible {
    display: flex;
}

.ctx-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: none;
    border-radius: 7px;
    background: none;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    font-family: inherit;
    transition: background 0.1s;
}

.ctx-item:hover {
    background: var(--bg);
}

.ctx-item.ctx-danger:hover {
    background: rgba(239, 68, 68, 0.06);
    color: var(--danger);
}

.ctx-item svg {
    flex-shrink: 0;
}

/* ── Grid ── */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--grid-min-col), 1fr));
    gap: var(--grid-gap);
}

.grid:empty + .empty {
    display: flex;
}

/* ── Empty state ── */
.empty {
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 64px 24px;
    color: var(--empty-color);
    text-align: center;
}

.empty svg {
    width: 48px;
    height: 48px;
    opacity: 0.4;
}

.empty p {
    margin: 0;
    font-size: 14px;
}

/* ── Drop overlay ── */
.drop-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(67, 97, 238, 0.08);
    border: 3px dashed var(--primary);
    border-radius: 16px;
    margin: 16px;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}

.drop-overlay.visible {
    display: flex;
}

.drop-overlay span {
    font-size: 18px;
    font-weight: 600;
    color: var(--primary);
}

/* ── Detail fields (injected into detail-media slot) ── */
.detail-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
}

.detail-field:last-child {
    margin-bottom: 0;
}

.detail-field label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
}

.detail-field input,
.detail-field textarea {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    background: var(--bg);
    outline: none;
    transition: border-color 0.15s;
    resize: vertical;
}

.detail-field input:focus,
.detail-field textarea:focus {
    border-color: var(--primary);
}

.detail-value {
    font-size: 13px;
    color: var(--text-body, #475569);
    word-break: break-all;
}

.detail-value.mono {
    font-family: monospace;
    font-size: 12px;
    background: var(--bg);
    padding: 6px 8px;
    border-radius: 6px;
    user-select: all;
}

.detail-meta-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

/* ── URL row with copy ── */
.url-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.url-row .detail-value {
    flex: 1;
    min-width: 0;
}

.btn-copy {
    flex-shrink: 0;
    padding: 4px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, border-color 0.15s;
}

.btn-copy:hover {
    color: var(--primary);
    border-color: var(--primary);
}

/* ── Detail actions ── */
.detail-actions {
    display: flex;
    gap: 8px;
}
`;

  // ../../features/cms-files/src/core/fileUrls.ts
  var CMS_FILES_ROUTE = "/.cms/files";
  var CMS_FILES_BY_ID_SEGMENT = "by-id";
  var CMS_FILES_BY_ID_ROUTE = `${CMS_FILES_ROUTE}/${CMS_FILES_BY_ID_SEGMENT}`;
  var CMS_FILES_BY_ID_MARKER = `${CMS_FILES_BY_ID_ROUTE}/`;
  function joinBase(base, path) {
    const b2 = base === "/" ? "" : base.replace(/\/$/, "");
    return `${b2}${path}`;
  }
  function cmsFilesByIdPath(id) {
    return `${CMS_FILES_BY_ID_ROUTE}/${encodeURIComponent(id)}`;
  }
  function cmsFilesByIdUrl(base, id) {
    return joinBase(base, cmsFilesByIdPath(id));
  }
  function withFileVersion(url, hash) {
    return url.includes("?") ? `${url}&v=${hash}` : `${url}?v=${hash}`;
  }
  // src/components/media/GridMedia/api/client.ts
  function filesBase() {
    return `${getMetaBasePath()}/api/files`;
  }
  function cmsFilesIdUrl(id) {
    return cmsFilesByIdUrl(getMetaBasePath(), id);
  }
  function toLocal(item) {
    const isImage = item.type === "file" && (item.mimeType?.startsWith("image/") ?? false);
    const local = {
      id: item.id,
      type: item.type === "folder" ? "folder" : isImage ? "image" : "other",
      label: item.name
    };
    if (item.type === "file") {
      local.mimetype = item.mimeType;
      local.size = item.size;
      local.contentHash = item.contentHash;
      local.absoluteURL = cmsFilesIdUrl(item.id);
    }
    return local;
  }

  // src/components/media/GridMedia/api/read.ts
  async function fetchItems(folder, types) {
    const url = new URL(filesBase(), window.location.origin);
    if (folder)
      url.searchParams.set("parentId", folder);
    const accept = expandAccept(types);
    if (accept)
      url.searchParams.set("accept", accept);
    url.searchParams.set("sortBy", "name");
    url.searchParams.set("limit", "10000");
    const res = await fetch(url.toString());
    if (!res.ok)
      return [];
    const page = await res.json();
    let items = page.items.map(toLocal);
    if (types && types.length > 0) {
      items = items.filter((i) => types.includes(i.type));
    }
    items.sort((a, b2) => {
      if (a.type === "folder" && b2.type !== "folder")
        return -1;
      if (a.type !== "folder" && b2.type === "folder")
        return 1;
      return a.label.localeCompare(b2.label);
    });
    return items;
  }
  function expandAccept(types) {
    if (!types || types.length === 0)
      return;
    const accept = new Set;
    if (types.includes("folder"))
      accept.add("folder");
    if (types.includes("image") || types.includes("other"))
      accept.add("file");
    return accept.size > 0 ? [...accept].join(",") : undefined;
  }
  async function resolveBreadcrumbTrail(id) {
    const trail = [];
    let currentId = id;
    while (currentId) {
      const url = new URL(`${filesBase()}/item`, window.location.origin);
      url.searchParams.set("id", currentId);
      const res = await fetch(url.toString());
      if (!res.ok)
        break;
      const item = await res.json();
      trail.unshift({ id: item.id, label: item.name });
      currentId = item.parentId;
    }
    return trail;
  }
  // src/components/media/GridMedia/api/write.ts
  async function renameItem(id, label) {
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id);
    const res = await fetch(url.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label })
    });
    return res.ok;
  }
  async function deleteItem(id) {
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id);
    url.searchParams.set("recursive", "true");
    const res = await fetch(url.toString(), { method: "DELETE" });
    return res.ok;
  }
  async function createFolder(label, parent) {
    const res = await fetch(`${filesBase()}/folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label, parentId: parent })
    });
    return res.ok;
  }
  var _localPreview = new Map;
  function localPreview(id) {
    return _localPreview.get(id);
  }
  async function uploadFiles(files, folder) {
    for (let i = 0;i < files.length; i++) {
      const file = files.item(i);
      if (!file)
        continue;
      const form = new FormData;
      form.append("file", file);
      if (folder)
        form.append("parentId", folder);
      const res = await fetch(`${filesBase()}/upload`, { method: "POST", body: form });
      if (res.ok) {
        const item = await res.json();
        _localPreview.set(item.id, URL.createObjectURL(file));
      }
    }
  }
  async function replaceFileContent(id, file) {
    const form = new FormData;
    form.append("file", file);
    form.append("id", id);
    const res = await fetch(`${filesBase()}/content`, { method: "PUT", body: form });
    if (res.ok)
      _localPreview.set(id, URL.createObjectURL(file));
    return res.ok;
  }
  async function saveItemMetadata(id, data) {
    const patch = {};
    if (typeof data["label"] === "string")
      patch.name = data["label"];
    if (typeof data["parent"] === "string")
      patch.parentId = data["parent"];
    if (Object.keys(patch).length === 0)
      return true;
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id);
    const res = await fetch(url.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    return res.ok;
  }
  // src/components/media/GridMedia/types.ts
  function formatSize(bytes) {
    if (bytes < 1024)
      return bytes + " B";
    if (bytes < 1024 * 1024)
      return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
  function variantUrl(item, _width, _height) {
    const url = item.absoluteURL ?? "";
    if (!url || !item.contentHash)
      return url;
    return withFileVersion(url, item.contentHash);
  }

  // src/components/media/GridMedia/view/render.ts
  function renderGrid(grid, items) {
    grid.innerHTML = "";
    for (const item of items) {
      const card = document.createElement("p9r-card-media");
      card.setAttribute("data-id", item.id);
      card.setAttribute("data-type", item.type);
      if (item.type === "folder") {
        card.setAttribute("type", "folder");
      } else {
        appendMediaPreview(card, item);
      }
      const label = document.createElement("span");
      label.slot = "label";
      label.textContent = item.label;
      card.appendChild(label);
      grid.appendChild(card);
    }
  }
  function appendMediaPreview(card, item) {
    const isImage = item.type === "image";
    const isSvg = item.mimetype === "image/svg+xml";
    if (isImage || isSvg) {
      const img = document.createElement("img");
      img.slot = "image";
      img.src = localPreview(item.id) ?? variantUrl(item, 400, 300);
      img.alt = item.alt || item.label;
      img.loading = "lazy";
      card.appendChild(img);
    } else {
      const ext = item.label.split(".").pop()?.toUpperCase() || "FILE";
      const icon = document.createElement("span");
      icon.slot = "image";
      icon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${ext}</span>
        `;
      icon.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;height:100%;color:var(--text-muted,#94a3b8);";
      card.appendChild(icon);
    }
  }
  function renderBreadcrumb(container, folder, breadcrumb) {
    if (!folder) {
      container.innerHTML = `<span class="bc-current">Root</span>`;
      return;
    }
    let html = `<span class="bc-item" data-folder="" data-index="-1">Root</span>`;
    for (let i = 0;i < breadcrumb.length; i++) {
      const crumb = breadcrumb[i];
      const isLast = i === breadcrumb.length - 1;
      html += `<span class="bc-sep">/</span>`;
      if (isLast) {
        html += `<span class="bc-current">${escapeHtml(crumb.label)}</span>`;
      } else {
        html += `<span class="bc-item" data-folder="${escapeAttr(crumb.id)}" data-index="${i}">${escapeHtml(crumb.label)}</span>`;
      }
    }
    container.innerHTML = html;
  }

  // src/components/media/GridMedia/features/context-menu.ts
  function setupContextMenu(s2, callbacks) {
    const menu = s2.getElementById("ctx-menu");
    let activeItem = null;
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || !activeItem)
        return;
      const action = btn.dataset.action;
      if (action === "rename")
        callbacks.onRename(activeItem);
      else if (action === "delete")
        callbacks.onDelete(activeItem.id);
      menu.classList.remove("visible");
    });
    document.addEventListener("click", () => menu.classList.remove("visible"));
    return {
      show(e, item) {
        activeItem = item;
        menu.style.left = e.clientX + "px";
        menu.style.top = e.clientY + "px";
        menu.classList.add("visible");
      }
    };
  }

  // src/components/media/GridMedia/features/rename.ts
  function setupRename(s2, callbacks) {
    const backdrop = s2.getElementById("rename-backdrop");
    const input = s2.getElementById("rename-input");
    const confirmBtn = s2.getElementById("rename-confirm");
    const cancelBtn = s2.getElementById("rename-cancel");
    let currentItem = null;
    const hide = () => {
      backdrop.classList.remove("visible");
      currentItem = null;
    };
    const apply = () => {
      const name = input.value.trim();
      if (!name || !currentItem)
        return;
      const id = currentItem.id;
      hide();
      callbacks.onApply(id, name);
    };
    confirmBtn.addEventListener("click", apply);
    cancelBtn.addEventListener("click", hide);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop)
        hide();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        apply();
      if (e.key === "Escape")
        hide();
    });
    return {
      open(item) {
        currentItem = item;
        input.value = item.label;
        backdrop.classList.add("visible");
        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });
      }
    };
  }

  // src/components/media/GridMedia/features/new-folder.ts
  function setupNewFolder(host, s2, callbacks) {
    const backdrop = s2.getElementById("nf-backdrop");
    const input = s2.getElementById("nf-input");
    const confirmBtn = s2.getElementById("nf-confirm");
    const cancelBtn = s2.getElementById("nf-cancel");
    const hide = () => backdrop.classList.remove("visible");
    const show = () => {
      input.value = "";
      backdrop.classList.add("visible");
      requestAnimationFrame(() => input.focus());
    };
    const create = () => {
      const name = input.value.trim();
      if (!name)
        return;
      hide();
      callbacks.onCreate(name);
    };
    host.addEventListener("new-folder", show);
    confirmBtn.addEventListener("click", create);
    cancelBtn.addEventListener("click", hide);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop)
        hide();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        create();
      if (e.key === "Escape")
        hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && backdrop.classList.contains("visible")) {
        hide();
      }
    });
  }

  // src/components/media/GridMedia/features/drag-drop.ts
  function setupDragDrop(s2, callbacks) {
    const fileInput = s2.getElementById("file-input");
    const dropOverlay = s2.getElementById("drop-overlay");
    let dragCounter = 0;
    let internalDrag = false;
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.length)
        callbacks.onFiles(fileInput.files);
    });
    s2.getElementById("grid").addEventListener("dragstart", () => {
      internalDrag = true;
    });
    document.addEventListener("dragend", () => {
      internalDrag = false;
    });
    document.addEventListener("dragenter", (e) => {
      e.preventDefault();
      if (internalDrag)
        return;
      dragCounter++;
      if (dragCounter === 1)
        dropOverlay.classList.add("visible");
    });
    document.addEventListener("dragleave", (e) => {
      e.preventDefault();
      if (internalDrag)
        return;
      dragCounter--;
      if (dragCounter === 0)
        dropOverlay.classList.remove("visible");
    });
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropOverlay.classList.remove("visible");
      if (internalDrag) {
        internalDrag = false;
        return;
      }
      if (e.dataTransfer?.files.length)
        callbacks.onFiles(e.dataTransfer.files);
    });
    return {
      trigger() {
        fileInput.click();
      }
    };
  }

  // src/components/media/GridMedia/features/detail/builders.ts
  var ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  var ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  function buildPreview(item) {
    const isImage = item.type === "image" || item.mimetype === "image/svg+xml";
    if (!isImage)
      return null;
    const img = document.createElement("img");
    img.slot = "preview";
    img.src = variantUrl(item, 800, 600);
    img.alt = item.alt || item.label;
    return img;
  }
  function buildFields(item) {
    const isImage = item.type === "image" || item.mimetype === "image/svg+xml";
    const size = item.size ? formatSize(item.size) : "";
    const dims = item.width && item.height ? `${item.width}×${item.height}` : "";
    const mediaUrl = item.absoluteURL ?? "";
    const el2 = document.createElement("div");
    el2.slot = "fields";
    el2.innerHTML = `
        <div class="detail-field">
            <label>Name</label>
            <input type="text" id="detail-label" value="${escapeAttr(item.label)}">
        </div>
        ${isImage ? `
        <div class="detail-field">
            <label>Alt text</label>
            <textarea id="detail-alt" rows="2">${escapeHtml(item.alt || "")}</textarea>
        </div>` : ""}
        <div class="detail-meta-row">
            <div class="detail-field">
                <label>Type</label>
                <span class="detail-value">${escapeHtml(item.mimetype || item.type)}</span>
            </div>
            <div class="detail-field">
                <label>Size</label>
                <span class="detail-value">${size || "—"}</span>
            </div>
        </div>
        ${dims ? `
        <div class="detail-field">
            <label>Dimensions</label>
            <span class="detail-value">${escapeHtml(dims)}</span>
        </div>` : ""}
        <div class="detail-field">
            <label>URL</label>
            <div class="url-row">
                <span class="detail-value mono">${escapeHtml(mediaUrl)}</span>
                <button class="btn-copy" id="btn-copy" title="Copy URL">${ICON_COPY}</button>
            </div>
        </div>
    `;
    const copyBtn = el2.querySelector("#btn-copy");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(mediaUrl);
      copyBtn.innerHTML = ICON_CHECK;
      setTimeout(() => {
        copyBtn.innerHTML = ICON_COPY;
      }, 1500);
    });
    return el2;
  }
  function buildActions(item) {
    const canReplace = item.type !== "folder";
    const el2 = document.createElement("div");
    el2.slot = "actions";
    el2.innerHTML = `
        <div class="detail-actions">
            <p9r-button id="btn-save" variant="filled" color="primary">Save</p9r-button>
            ${canReplace ? `<p9r-button id="btn-replace" variant="outlined">Replace</p9r-button>` : ""}
            <p9r-button id="btn-delete" variant="ghost" color="danger">Delete</p9r-button>
        </div>
    `;
    return el2;
  }

  // src/components/media/GridMedia/features/detail/setup.ts
  function setupDetail(detail, callbacks) {
    detail.addEventListener("close", () => callbacks.onClose());
    return {
      open(item) {
        detail.innerHTML = "";
        const preview = buildPreview(item);
        if (preview)
          detail.appendChild(preview);
        const fields = buildFields(item);
        detail.appendChild(fields);
        const actions = buildActions(item);
        detail.appendChild(actions);
        actions.querySelector("#btn-save").addEventListener("click", () => {
          callbacks.onSave(item.id, readFields(detail));
        });
        actions.querySelector("#btn-replace")?.addEventListener("click", async () => {
          const file = await pickFile(item.type === "image" ? "image/*" : "");
          if (file)
            callbacks.onReplace(item.id, file);
        });
        actions.querySelector("#btn-delete").addEventListener("click", () => {
          callbacks.onDelete(item.id);
        });
        fields.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            callbacks.onSave(item.id, readFields(detail));
          }
        });
        detail.open(item.label);
      }
    };
  }
  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept)
        input.accept = accept;
      input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
      input.click();
    });
  }
  function readFields(detail) {
    const labelInput = detail.querySelector("#detail-label");
    const altInput = detail.querySelector("#detail-alt");
    const data = { label: labelInput.value };
    if (altInput)
      data.alt = altInput.value;
    return data;
  }

  // src/components/media/GridMedia/features/setup.ts
  function setupFeatures(host, s2) {
    const refresh = () => host._refresh();
    const ctxMenu = setupContextMenu(s2, {
      onRename: (item) => rename.open(item),
      onDelete: (id) => host._confirmDelete(id)
    });
    const rename = setupRename(s2, {
      onApply: async (id, name) => {
        await renameItem(id, name);
        refresh();
      }
    });
    setupNewFolder(host, s2, {
      onCreate: async (name) => {
        await createFolder(name, host._folder);
        refresh();
      }
    });
    const dragDrop = setupDragDrop(s2, {
      onFiles: async (files) => {
        await uploadFiles(files, host._folder);
        refresh();
      }
    });
    const detail = setupDetail(host.detail, {
      onSave: async (id, data) => {
        if (await saveItemMetadata(id, data))
          host.detail.close();
      },
      onReplace: async (id, file) => {
        if (await replaceFileContent(id, file)) {
          host.detail.close();
          refresh();
        }
      },
      onDelete: async (id) => {
        if (!confirm("Delete this file?"))
          return;
        if (await deleteItem(id)) {
          host.detail.close();
          refresh();
        }
      },
      onClose: refresh
    });
    return { ctxMenu, dragDrop, detail };
  }

  // src/components/media/GridMedia/events/grid.ts
  function wireGrid(host, s2, ctxMenu, detail) {
    const grid = s2.getElementById("grid");
    grid.addEventListener("click", (e) => {
      const card = e.target.closest("p9r-card-media");
      if (!card)
        return;
      const id = card.dataset.id;
      if (card.dataset.type === "folder") {
        const folder = host._items.find((i) => i.id === id);
        host._navigateTo(id, folder?.label);
      } else {
        const item = host._items.find((i) => i.id === id);
        if (item)
          detail.open(item);
      }
    });
    grid.addEventListener("contextmenu", (e) => {
      const card = e.target.closest("p9r-card-media");
      if (!card)
        return;
      const item = host._items.find((i) => i.id === card.dataset.id);
      if (!item)
        return;
      e.preventDefault();
      ctxMenu.show(e, item);
    });
  }

  // src/components/media/GridMedia/events/breadcrumb.ts
  function wireBreadcrumb(host, s2) {
    s2.getElementById("breadcrumb").addEventListener("click", (e) => {
      const target = e.target;
      if (!target.classList.contains("bc-item"))
        return;
      const folder = target.dataset.folder || null;
      const index = parseInt(target.dataset.index || "-1");
      host._breadcrumb = host._breadcrumb.slice(0, index + 1);
      host._navigateTo(folder);
    });
  }

  // src/components/media/GridMedia/GridMedia.ts
  class GridMedia extends A2 {
    _folder = null;
    _breadcrumb = [];
    _items = [];
    constructor() {
      super({
        css: style_default25,
        template: template_default26
      });
    }
    get detail() {
      return this.shadowRoot.getElementById("detail");
    }
    get crop() {
      return this.shadowRoot.getElementById("crop");
    }
    connectedCallback() {
      const s2 = this.shadowRoot;
      this._folder = new URL(window.location.href).searchParams.get("folder");
      const f2 = setupFeatures(this, s2);
      wireGrid(this, s2, f2.ctxMenu, f2.detail);
      wireBreadcrumb(this, s2);
      this.upload = () => f2.dragDrop.trigger();
      if (this._folder) {
        resolveBreadcrumbTrail(this._folder).then((trail) => {
          this._breadcrumb = trail;
          this._render();
        });
      }
      this._refresh();
    }
    upload() {}
    refresh() {
      this._refresh();
    }
    async _refresh() {
      this._items = await fetchItems(this._folder);
      this._render();
    }
    _render() {
      renderGrid(this.shadowRoot.getElementById("grid"), this._items);
      renderBreadcrumb(this.shadowRoot.getElementById("breadcrumb"), this._folder, this._breadcrumb);
    }
    _navigateTo(folderId, label) {
      const url = new URL(window.location.href);
      if (folderId)
        url.searchParams.set("folder", folderId);
      else
        url.searchParams.delete("folder");
      window.history.pushState({}, "", url.toString());
      this._folder = folderId;
      if (!folderId)
        this._breadcrumb = [];
      else if (label)
        this._breadcrumb.push({ id: folderId, label });
      this._refresh();
    }
    async _confirmDelete(id) {
      if (!confirm("Delete this item?"))
        return;
      if (await deleteItem(id))
        this._refresh();
    }
  }
  if (!customElements.get("p9r-grid-media")) {
    customElements.define("p9r-grid-media", GridMedia);
  }

  // src/components/media/MediaAdmin/MediaAdmin.html
  var MediaAdmin_default = `<w13c-fixed-admin-layout>
    <span slot="title">Files</span>
    <p9r-open-modal slot="action" modal-target="cms-media-new-folder">
        <p9r-button>+ New folder</p9r-button>
    </p9r-open-modal>
    <p9r-button slot="action" color="primary" data-action="upload">Upload files</p9r-button>
    <p9r-grid-media></p9r-grid-media>
    <input type="file" multiple data-role="file-input" hidden>
</w13c-fixed-admin-layout>

<p9r-modal id="cms-media-new-folder" aria-label="Create folder">
    <span slot="title">New folder</span>
    <p9r-stack gap="m">
        <p9r-input data-role="folder-name" label="Name" placeholder="My folder"></p9r-input>
        <p9r-button color="primary" fullWidth data-action="create-folder">Create</p9r-button>
    </p9r-stack>
</p9r-modal>
`;

  // src/components/media/MediaAdmin/MediaAdmin.ts
  class MediaAdmin extends HTMLElement {
    _grid = null;
    _fileInput = null;
    _wired = false;
    connectedCallback() {
      if (!this.firstElementChild)
        this._render();
      if (!this._wired) {
        this._wire();
        this._wired = true;
      }
    }
    _render() {
      this.innerHTML = MediaAdmin_default;
    }
    _wire() {
      this._grid = this.querySelector("p9r-grid-media");
      this._fileInput = this.querySelector('[data-role="file-input"]');
      this.querySelector('[data-action="upload"]')?.addEventListener("click", () => this._fileInput?.click());
      this._fileInput?.addEventListener("change", () => this._handleUpload());
      this.querySelector('[data-action="create-folder"]')?.addEventListener("click", () => this._handleCreateFolder());
      this.querySelector('[data-role="folder-name"]')?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._handleCreateFolder();
        }
      });
    }
    async _handleUpload() {
      const files = this._fileInput?.files;
      if (!files || files.length === 0)
        return;
      await uploadFiles(files, this._currentFolder());
      if (this._fileInput)
        this._fileInput.value = "";
      this._grid?.refresh();
    }
    async _handleCreateFolder() {
      const button = this.querySelector('[data-action="create-folder"]');
      const input = this.querySelector('[data-role="folder-name"]');
      const name = input?.value?.trim();
      if (!name)
        return;
      const ok = await createFolder(name, this._currentFolder());
      if (!ok)
        return;
      if (input)
        input.value = "";
      button?.dispatchEvent(new BubblesEvent("form:success"));
      this._grid?.refresh();
    }
    _currentFolder() {
      return new URL(window.location.href).searchParams.get("folder");
    }
  }
  if (!customElements.get("cms-media-admin"))
    customElements.define("cms-media-admin", MediaAdmin);

  // src/components/media/MediaCenter/template.html
  var template_default27 = `<dialog>
    <div class="modal-container">
        <header class="modal-header">
            <h2>Media Center</h2>
            <div class="toolbar">
                <button class="btn-tool" id="btnCreateFolder" title="New folder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"/>
                    </svg>
                    New folder
                </button>
                <button class="btn-tool btn-tool-primary" id="btnUpload" title="Upload">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload
                </button>
            </div>
            <button class="btn-close" id="btnClose">&times;</button>
        </header>

        <div class="breadcrumb-bar">
            <div class="breadcrumb" id="breadcrumb">
                <span class="bc-current">Root</span>
            </div>
        </div>

        <div class="media-grid" id="grid"></div>

        <div class="empty-state" id="empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"/>
            </svg>
            <p>This folder is empty</p>
        </div>

        <div class="drop-overlay" id="drop-overlay">
            <span>Drop files to upload</span>
        </div>

        <footer class="modal-footer">
            <span class="path-info" id="pathDisplay"></span>
            <div class="footer-actions">
                <button class="btn btn-secondary" id="btnCancel">Cancel</button>
                <button class="btn btn-primary" id="btnSelect" disabled>Select</button>
            </div>
        </footer>

        <!-- New folder popover -->
        <div class="nf-backdrop" id="nf-backdrop">
            <div class="nf-popover">
                <label class="nf-label">New folder</label>
                <input type="text" class="nf-input" id="nf-input" placeholder="Folder name…" autocomplete="off">
                <div class="nf-actions">
                    <button class="nf-cancel" id="nf-cancel">Cancel</button>
                    <button class="nf-confirm" id="nf-confirm">Create</button>
                </div>
            </div>
        </div>

        <input type="file" id="file-input" hidden multiple accept="image/*,video/*,audio/*,.pdf,.zip,.svg">
    </div>
</dialog>
`;

  // src/components/media/MediaCenter/style.css
  var style_default26 = `:host {
    --mc-bg: #ffffff;
    --mc-border: #e2e8f0;
    --mc-text: #1e293b;
    --mc-text-muted: #64748b;
    --mc-primary: #2563eb;
    --mc-primary-hover: #1d4ed8;
    --mc-radius: 16px;
    --mc-selected-border: var(--mc-primary);
    --mc-selected-bg: #eff6ff;

    font-family: system-ui, -apple-system, sans-serif;
    display: block;
}

/* ── Dialog ── */

dialog {
    border: none;
    border-radius: var(--mc-radius);
    padding: 0;
    width: 90vw;
    max-width: 900px;
    height: 80vh;
    box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
}

dialog::backdrop {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.modal-container {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--mc-bg);
}

/* ── Header ── */

.modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--mc-border);
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
}

.modal-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--mc-text);
    white-space: nowrap;
}

.toolbar {
    display: flex;
    gap: 6px;
    margin-left: auto;
}

.btn-tool {
    all: unset;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--mc-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid var(--mc-border);
}

.btn-tool svg {
    width: 16px;
    height: 16px;
}

.btn-tool:hover {
    background: #f1f5f9;
    color: var(--mc-text);
}

.btn-tool-primary {
    background: var(--mc-primary);
    border-color: var(--mc-primary);
    color: #ffffff;
}

.btn-tool-primary:hover {
    background: var(--mc-primary-hover);
    color: #ffffff;
}

.btn-close {
    all: unset;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    cursor: pointer;
    color: var(--mc-text-muted);
    font-size: 1.4rem;
    transition: all 0.15s;
    flex-shrink: 0;
}

.btn-close:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
}

/* ── Breadcrumb ── */

.breadcrumb-bar {
    padding: 10px 20px;
    background: #f8fafc;
    border-bottom: 1px solid var(--mc-border);
    flex-shrink: 0;
}

.breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    min-height: 24px;
}

.bc-item {
    color: var(--mc-primary);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background 0.15s;
}

.bc-item:hover {
    background: rgba(37, 99, 235, 0.08);
}

.bc-sep {
    color: var(--mc-text-muted);
    opacity: 0.4;
    user-select: none;
}

.bc-current {
    color: var(--mc-text);
    font-weight: 600;
    padding: 2px 6px;
}

/* ── Grid ── */

.media-grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    padding: 20px;
    align-content: start;
}

.media-grid:empty {
    display: none;
}

.media-grid:empty ~ .empty-state {
    display: flex;
}

/* ── Selected state on cards ── */

.media-grid p9r-card-media.selected {
    outline: 2px solid var(--mc-selected-border);
    outline-offset: -2px;
    border-radius: 12px;
    background: var(--mc-selected-bg);
}

/* ── Empty state ── */

.empty-state {
    display: none;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--mc-text-muted);
}

.empty-state svg {
    width: 48px;
    height: 48px;
    opacity: 0.3;
}

.empty-state p {
    margin: 0;
    font-size: 14px;
}

/* ── Drop overlay ── */

.drop-overlay {
    display: none;
    position: absolute;
    inset: 0;
    background: rgba(37, 99, 235, 0.08);
    border: 3px dashed var(--mc-primary);
    border-radius: var(--mc-radius);
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
}

.drop-overlay span {
    background: var(--mc-primary);
    color: white;
    padding: 10px 24px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 14px;
}

.drop-overlay.active {
    display: flex;
}

/* ── Footer ── */

.modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--mc-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
}

.path-info {
    font-size: 12px;
    color: var(--mc-text-muted);
}

.footer-actions {
    display: flex;
    gap: 8px;
}

.btn {
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    font-size: 13px;
    border: none;
    transition: all 0.15s;
}

.btn-primary {
    background: var(--mc-primary);
    color: white;
}

.btn-primary:hover:not(:disabled) {
    background: var(--mc-primary-hover);
}

.btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.btn-secondary {
    background: #f1f5f9;
    color: var(--mc-text);
}

.btn-secondary:hover {
    background: #e2e8f0;
}

/* ── New folder popover ── */

.nf-backdrop {
    display: none;
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    border-radius: var(--mc-radius);
    z-index: 100;
    align-items: center;
    justify-content: center;
}

.nf-backdrop.open {
    display: flex;
}

.nf-popover {
    background: white;
    border-radius: 12px;
    padding: 20px;
    width: 320px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
    animation: nf-pop 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes nf-pop {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
}

.nf-label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--mc-text);
}

.nf-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--mc-border);
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
}

.nf-input:focus {
    border-color: var(--mc-primary);
}

.nf-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
}

.nf-cancel, .nf-confirm {
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}

.nf-cancel {
    background: #f1f5f9;
    color: var(--mc-text);
}

.nf-cancel:hover {
    background: #e2e8f0;
}

.nf-confirm {
    background: var(--mc-primary);
    color: white;
}

.nf-confirm:hover {
    background: var(--mc-primary-hover);
}
`;

  // src/components/media/MediaCenter/MediaCenter.ts
  class MediaCenter extends A2 {
    _dialog = null;
    _grid = null;
    _btnSelect = null;
    _folder = null;
    _breadcrumb = [];
    _items = [];
    _selectedItem = null;
    _types = [];
    _dragCounter = 0;
    constructor() {
      super({
        css: style_default26,
        template: template_default27
      });
    }
    connectedCallback() {
      const s2 = this.shadowRoot;
      this._dialog = s2.querySelector("dialog");
      this._grid = s2.getElementById("grid");
      this._btnSelect = s2.getElementById("btnSelect");
      s2.getElementById("btnClose").addEventListener("click", () => this._dialog?.close());
      s2.getElementById("btnCancel").addEventListener("click", () => this._dialog?.close());
      this._dialog.addEventListener("click", (e) => {
        if (e.target === this._dialog)
          this._dialog?.close();
      });
      s2.getElementById("btnCreateFolder").addEventListener("click", () => this._openNewFolder());
      const nfBackdrop = s2.getElementById("nf-backdrop");
      const nfInput = s2.getElementById("nf-input");
      s2.getElementById("nf-cancel").addEventListener("click", () => nfBackdrop.classList.remove("open"));
      s2.getElementById("nf-confirm").addEventListener("click", () => this._createFolder(nfInput, nfBackdrop));
      nfInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          this._createFolder(nfInput, nfBackdrop);
        if (e.key === "Escape")
          nfBackdrop.classList.remove("open");
      });
      const fileInput = s2.getElementById("file-input");
      s2.getElementById("btnUpload").addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        if (!fileInput.files?.length)
          return;
        await uploadFiles(fileInput.files, this._folder);
        fileInput.value = "";
        this._refresh();
      });
      this._btnSelect.addEventListener("click", () => this._confirmSelection());
      this._grid.addEventListener("click", (e) => {
        const card = e.target.closest("p9r-card-media");
        if (!card)
          return;
        const id = card.dataset.id;
        const type = card.dataset.type;
        if (type === "folder") {
          const folder = this._items.find((i) => i.id === id);
          this._navigateTo(id, folder?.label);
        } else {
          this._select(card, id);
        }
      });
      this._grid.addEventListener("dblclick", (e) => {
        const card = e.target.closest("p9r-card-media");
        if (!card || card.dataset.type === "folder")
          return;
        this._confirmSelection();
      });
      s2.getElementById("breadcrumb").addEventListener("click", (e) => {
        const target = e.target;
        if (!target.classList.contains("bc-item"))
          return;
        const folder = target.dataset.folder || null;
        const index = parseInt(target.dataset.index || "-1");
        this._breadcrumb = this._breadcrumb.slice(0, index + 1);
        this._navigateTo(folder);
      });
      const container = s2.querySelector(".modal-container");
      const overlay = s2.getElementById("drop-overlay");
      container.addEventListener("dragenter", (e) => {
        if (e.dataTransfer?.types.includes("Files")) {
          e.preventDefault();
          this._dragCounter++;
          overlay.classList.add("active");
        }
      });
      container.addEventListener("dragleave", () => {
        this._dragCounter--;
        if (this._dragCounter <= 0) {
          this._dragCounter = 0;
          overlay.classList.remove("active");
        }
      });
      container.addEventListener("dragover", (e) => e.preventDefault());
      container.addEventListener("drop", async (e) => {
        e.preventDefault();
        this._dragCounter = 0;
        overlay.classList.remove("active");
        if (e.dataTransfer?.files.length) {
          await uploadFiles(e.dataTransfer.files, this._folder);
          this._refresh();
        }
      });
    }
    show(types) {
      this._types = types ?? ["folder", "image", "other"];
      this._folder = null;
      this._breadcrumb = [];
      this._selectedItem = null;
      this._updateSelectButton();
      this._dialog?.showModal();
      this._refresh();
    }
    async _refresh() {
      this._items = await this._fetchItems();
      this._selectedItem = null;
      this._updateSelectButton();
      this._render();
    }
    async _fetchItems() {
      return fetchItems(this._folder, this._types);
    }
    _render() {
      renderGrid(this._grid, this._items);
      renderBreadcrumb(this.shadowRoot.getElementById("breadcrumb"), this._folder, this._breadcrumb);
      const empty = this.shadowRoot.getElementById("empty");
      empty.style.display = this._items.length === 0 ? "flex" : "none";
      const pathDisplay = this.shadowRoot.getElementById("pathDisplay");
      if (this._breadcrumb.length > 0) {
        pathDisplay.textContent = this._breadcrumb.map((b2) => b2.label).join(" / ");
      } else {
        pathDisplay.textContent = "Root";
      }
    }
    _select(card, id) {
      this._grid.querySelectorAll("p9r-card-media.selected").forEach((el2) => el2.classList.remove("selected"));
      card.classList.add("selected");
      this._selectedItem = this._items.find((i) => i.id === id) || null;
      this._updateSelectButton();
    }
    _updateSelectButton() {
      if (this._btnSelect) {
        this._btnSelect.disabled = !this._selectedItem;
      }
    }
    _confirmSelection() {
      if (!this._selectedItem)
        return;
      const src = this._selectedItem.absoluteURL ?? "";
      this.dispatchEvent(new CustomEvent("select-item", {
        detail: { src, alt: this._selectedItem.label, mimetype: this._selectedItem.mimetype },
        bubbles: true,
        composed: true
      }));
      this._dialog?.close();
    }
    _navigateTo(folderId, label) {
      this._folder = folderId;
      if (!folderId) {
        this._breadcrumb = [];
      } else if (label) {
        this._breadcrumb.push({ id: folderId, label });
      }
      this._refresh();
    }
    _openNewFolder() {
      const s2 = this.shadowRoot;
      const backdrop = s2.getElementById("nf-backdrop");
      const input = s2.getElementById("nf-input");
      input.value = "";
      backdrop.classList.add("open");
      setTimeout(() => input.focus(), 50);
    }
    async _createFolder(input, backdrop) {
      const name = input.value.trim();
      if (!name)
        return;
      await createFolder(name, this._folder);
      backdrop.classList.remove("open");
      this._refresh();
    }
  }
  customElements.define("cms-media-center", MediaCenter);

  // src/components/CustomHTMLElement.ts
  class CustomHTMLElement extends HTMLElement {
    constructor(html, css, shadow) {
      super();
      if (shadow) {
        const ele = this.attachShadow({ mode: "open" });
        ele.innerHTML = `<style>${css ?? ""}</style>${html ?? ""}`;
      }
    }
    static get observedAttributes() {
      return [];
    }
  }

  // src/components/form/Form/events/onKeyboardEvent.ts
  function onKeyboardEvent(e, nativeForm) {
    if (e.key !== "Enter")
      return;
    const target = e.target;
    if (target.tagName === "TEXTAREA")
      return;
    e.preventDefault();
    nativeForm.requestSubmit();
  }

  // src/core/dom/buildRequestUrl.ts
  function buildRequestUrl(target) {
    const u = new URL(target, window.location.href);
    for (const [k, v2] of new URLSearchParams(window.location.search))
      u.searchParams.append(k, v2);
    return u;
  }

  // src/components/form/Form/events/onSubmit.ts
  function onSubmit(e, me) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    fetch(buildRequestUrl(me.target), {
      method: me.method || "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }).then(async (res) => {
      if (res.ok) {
        form.reset();
        me.dispatchEvent(new BubblesEvent("form:success"));
        if (me.emit) {
          document.dispatchEvent(new BubblesEvent(me.emit));
        }
      } else {
        dd(await readErrorMessage(res), { type: "error" });
        me.dispatchEvent(new BubblesEvent("form:failed"));
      }
    }).catch(() => {
      dd("Network error — please try again.", { type: "error" });
      me.dispatchEvent(new BubblesEvent("form:failed"));
    });
  }
  async function readErrorMessage(res) {
    try {
      const body = await res.json();
      if (body && typeof body.error === "string" && body.error)
        return body.error;
    } catch {}
    return res.statusText || `Request failed (${res.status})`;
  }

  // src/components/form/Form/Form.ts
  class CmsForm extends CustomHTMLElement {
    _nativeForm = null;
    _handleInternalSubmit = (e) => {
      onSubmit(e, this);
    };
    _handleKeydown = (e) => {
      onKeyboardEvent(e, this._nativeForm);
    };
    connectedCallback() {
      requestAnimationFrame(() => {
        if (this._nativeForm)
          return;
        this._nativeForm = document.createElement("form");
        const id = this.getAttribute("id");
        if (id) {
          this._nativeForm.id = id;
          this.removeAttribute("id");
        }
        while (this.firstChild) {
          this._nativeForm.appendChild(this.firstChild);
        }
        this.appendChild(this._nativeForm);
        this._nativeForm.addEventListener("submit", this._handleInternalSubmit);
        this.addEventListener("keydown", this._handleKeydown);
      });
    }
    disconnectedCallback() {
      this._nativeForm?.removeEventListener("submit", this._handleInternalSubmit);
      this.removeEventListener("keydown", this._handleKeydown);
    }
    attributeChangedCallback() {}
    get redirect() {
      return this.getAttribute("redirect");
    }
    get target() {
      const val = this.getAttribute("target");
      if (!val)
        throw new Error("CmsForm target attribute should be set");
      return val;
    }
    get method() {
      return this.getAttribute("method");
    }
    get emit() {
      return this.getAttribute("emit");
    }
  }
  if (!customElements.get("cms-form")) {
    customElements.define("cms-form", CmsForm);
  }

  // src/components/form/MediaInput/MediaInput.css
  var MediaInput_default = `:host { display: block; }

.field { display: inline-flex; flex-direction: column; gap: 6px; }

.label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #94a3b8);
}

.tile {
    position: relative;
    width: var(--tile-size, 64px);
    height: var(--tile-size, 64px);
    padding: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--border-default, #cbd5e1);
    border-radius: 10px;
    background: var(--bg-base, #f8fafc);
    cursor: pointer; outline: none; overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.tile:hover         { border-color: var(--primary-base, #4361ee); }
.tile:focus-visible { border-color: var(--primary-base, #4361ee); box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15)); }
.tile.has-value     { border-style: solid; border-color: var(--border-default, #e2e8f0); background: var(--bg-surface, #fff); }

.preview {
    display: none;
    width: 100%; height: 100%;
    object-fit: contain;
    padding: 6px;
    box-sizing: border-box;
}
.tile.has-value .preview { display: block; }

.placeholder {
    color: var(--text-muted, #94a3b8);
}
.placeholder svg { width: 40%; height: 40%; min-width: 20px; min-height: 20px; }
.tile.has-value .placeholder { display: none; }

.clear {
    display: none;
    position: absolute;
    top: 3px; right: 3px;
    width: 18px; height: 18px;
    align-items: center; justify-content: center;
    border-radius: 50%;
    background: var(--bg-surface, #fff);
    color: var(--text-muted, #94a3b8);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
    transition: color 0.15s, background 0.15s;
}
.clear svg { width: 11px; height: 11px; }
.clear:hover {
    color: #fff;
    background: var(--danger-base, #ef4444);
}
`;

  // src/components/form/MediaInput/MediaInput.ts
  class MediaInput extends HTMLElement {
    static formAssociated = true;
    _internals;
    _value = "";
    _tile;
    _preview;
    _clearBtn;
    constructor() {
      super();
      this._internals = this.attachInternals();
    }
    connectedCallback() {
      if (!this.shadowRoot) {
        this._build(this.getAttribute("label"));
        this._wire();
      }
      this.value = this._value || this.getAttribute("value") || "";
    }
    get name() {
      return this.getAttribute("name");
    }
    get value() {
      return this._value;
    }
    set value(v2) {
      this._value = v2;
      this._internals.setFormValue(v2);
      this._preview.src = v2;
      this._tile.classList.toggle("has-value", !!v2);
      this._clearBtn.style.display = v2 ? "flex" : "none";
    }
    get _types() {
      const raw = this.getAttribute("types") || "image";
      return ["folder", ...raw.split(",").map((t) => t.trim()).filter(Boolean)];
    }
    _build(label) {
      const shadow = this.attachShadow({ mode: "open" });
      const size = this.getAttribute("size") || "64";
      shadow.innerHTML = `
            <style>${MediaInput_default}</style>
            <div class="field" style="--tile-size:${size}px">
                ${label ? `<span class="label">${label}</span>` : ""}
                <button class="tile" type="button" title="Choose a file">
                    <img class="preview" alt="" />
                    <span class="placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="9" cy="9" r="1.6"/>
                            <path d="m21 15-4.5-4.5L5 21"/>
                        </svg>
                    </span>
                    <span class="clear" title="Remove" role="button" aria-label="Remove">
                        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </span>
                </button>
            </div>`;
      this._tile = shadow.querySelector(".tile");
      this._preview = shadow.querySelector(".preview");
      this._clearBtn = shadow.querySelector(".clear");
    }
    _wire() {
      this._tile.addEventListener("click", () => this._openPicker());
      this._clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.value = "";
        this.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    _openPicker() {
      const center = document.createElement("cms-media-center");
      document.body.appendChild(center);
      const handler = (e) => {
        center.removeEventListener("select-item", handler);
        const src = e.detail?.src;
        if (src) {
          this.value = src;
          this.dispatchEvent(new Event("change", { bubbles: true }));
        }
        center.remove();
      };
      center.addEventListener("select-item", handler);
      center.show(this._types);
    }
  }
  if (!customElements.get("cms-media-input")) {
    customElements.define("cms-media-input", MediaInput);
  }

  // src/components/index.ts
  function define(tag, constructor) {
    if (!customElements.get(tag))
      customElements.define(tag, constructor);
  }
  define("cms-binding-core", un);
  define("p9r-accordion", Yt);
  define("p9r-accordion-item", Wt);
  define("p9r-alert", ie);
  define("p9r-avatar", ne);
  define("p9r-badge", de);
  define("p9r-button", We);
  define("p9r-card", fe);
  define("w13c-checkbox", sr);
  define("p9r-container", Ni);
  define("w13c-form", Xo);
  define("p9r-grid", Xi);
  define("p9r-icon-button", mr);
  define("w13c-lateral-dialog", Fe);
  define("w13c-lateral-menu", oa);
  define("w13c-lateral-menu-item", ca);
  define("w13c-left-menu-layout", Qi);
  define("p9r-modal", Re);
  define("p9r-open-modal", Ze);
  define("p9r-input", Tr);
  define("p9r-select", Qr);
  define("p9r-photo-album", ta);
  define("p9r-segmented-switch", di);
  define("p9r-stack", Ji);
  define("p9r-tab-panel", ho);
  define("p9r-table", Fa);
  define("p9r-cell", ja);
  define("p9r-header-cell", Ya);
  define("p9r-row", eo);
  define("p9r-tabs", co);
  define("p9r-tag", vo);
  define("p9r-tag-suggest", Ti);
  define("p9r-textarea", Bi);
  define("p9r-toast", yo);
  define("p9r-toast-stack", Eo);
  define("p9r-stat", qo);
  define("p9r-line-chart", Fo);
  define("p9r-bar-list", jo);
  define("p9r-range-tabs", Ro);
})();
