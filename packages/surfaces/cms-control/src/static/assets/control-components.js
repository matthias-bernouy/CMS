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

  class Jt extends s {
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
  var Wt = `<div class="item" part="item">
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
  var Yt = `:host {
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

  class Ot extends s {
    _toggles;
    _titleToggle;
    static get observedAttributes() {
      return ["open", "disabled"];
    }
    constructor() {
      super({ css: Yt, template: Wt });
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
  color: white;
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
  color: white;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

:host([icon]) .icon:has(slot[name="icon"]:not(:has(*)))::before,
:host(:not([type])) .icon:has(slot[name="icon"]:not(:has(*)))::before,
:host([type="info"]) .icon:has(slot[name="icon"]:not(:has(*)))::before {
  content: "i";
  color: white;
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
  var ma = ee + re;

  class ie extends s {
    _close;
    _message;
    _messageSlot;
    static get observedAttributes() {
      return ["dismissible"];
    }
    constructor() {
      super({ css: ma, template: te });
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
  var oe = `<div class="avatar" part="avatar">
    <img class="image" part="image" alt="" hidden />
    <span class="initials" part="initials" aria-hidden="true"></span>
    <span class="fallback" part="fallback"><slot></slot></span>
</div>
`;
  var ne = `:host {
  display: inline-block;

  --_size: 2.5rem;
  --_radius: 50%;
  --_bg: var(--secondary-muted, #e5e7eb);
  --_color: var(--text-main, #1f2937);
  --_border: 0px solid transparent;
  --_font-size: calc(var(--_size) * 0.4);
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

  class ae extends s {
    _img;
    _initials;
    static get observedAttributes() {
      return ["src", "alt", "name", "initials"];
    }
    constructor() {
      super({ css: ne, template: oe });
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
}

:host([color="primary"]) { --_bg: var(--primary-muted); --_text: var(--primary-contrasted); --_dot-color: var(--primary-base); }
:host([color="danger"])  { --_bg: var(--danger-muted);  --_text: var(--danger-contrasted);  --_dot-color: var(--danger-base); }
:host([color="success"]) { --_bg: var(--success-muted); --_text: var(--success-contrasted); --_dot-color: var(--success-base); }
:host([color="info"])    { --_bg: var(--info-muted);    --_text: var(--info-contrasted);    --_dot-color: var(--info-base); }
:host([color="warning"]) { --_bg: var(--warning-muted); --_text: var(--warning-contrasted); --_dot-color: var(--warning-base); }

:host([variant="filled"][color="primary"]) { --_bg: var(--primary-base); --_text: white; }
:host([variant="filled"][color="danger"])  { --_bg: var(--danger-base);  --_text: white; }
:host([variant="filled"][color="success"]) { --_bg: var(--success-base); --_text: white; }
:host([variant="filled"][color="info"])    { --_bg: var(--info-base);    --_text: white; }
:host([variant="filled"][color="warning"]) { --_bg: var(--warning-base); --_text: white; }

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
  var ce = `<nav class="breadcrumb" part="breadcrumb" aria-label="Breadcrumb">
    <ol class="list" part="list">
        <slot></slot>
    </ol>
</nav>
`;
  var pe = `:host {
  display: block;

  --_separator: "/";
  --_color: var(--text-muted, #6b7280);
  --_color-current: var(--text-main, #1f2937);
  --_size: 13px;
  --_gap: 0.4rem;
}

.breadcrumb {
  font-size: var(--_size);
  color: var(--_color);
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--_gap);
}

::slotted(p9r-breadcrumb-item:not(:last-child))::after {
  content: var(--_separator);
  color: var(--_color);
  margin-left: var(--_gap);
  display: inline;
}
`;

  class ue extends s {
    static get observedAttributes() {
      return ["separator"];
    }
    constructor() {
      super({ css: pe, template: ce });
    }
    connectedCallback() {
      this._syncSeparator(), this._markCurrent();
    }
    attributeChangedCallback(t, e, r) {
      if (t === "separator")
        this._syncSeparator();
    }
    _syncSeparator() {
      let t = this.getAttribute("separator") ?? "/";
      this.style.setProperty("--_separator", `"${t.replace(/"/g, "\\\"")}"`);
    }
    _markCurrent() {
      let t = Array.from(this.querySelectorAll("p9r-breadcrumb-item")), e = t[t.length - 1];
      if (e && !e.hasAttribute("current"))
        e.setAttribute("current", "");
    }
  }
  var he = `<li class="item" part="item">
    <a class="link" part="link"><slot></slot></a>
</li>
`;
  var be = `:host {
  display: inline-flex;
  align-items: center;

  --_color: var(--text-muted, #6b7280);
  --_color-current: var(--text-main, #1f2937);
}

.item {
  display: inline-flex;
  align-items: center;
  list-style: none;
}

.link {
  color: var(--_color);
  text-decoration: none;
  font: inherit;
  cursor: pointer;
}

.link:hover {
  text-decoration: underline;
  color: var(--_color-current);
}

:host([current]) .link {
  color: var(--_color-current);
  font-weight: 600;
  cursor: default;
  pointer-events: none;
}
`;

  class me extends s {
    _link;
    static get observedAttributes() {
      return ["href", "current"];
    }
    constructor() {
      super({ css: be, template: he });
      this._link = this.shadowRoot?.querySelector(".link") ?? null;
    }
    connectedCallback() {
      this._syncHref(), this._syncCurrent();
    }
    attributeChangedCallback(t, e, r) {
      if (t === "href")
        this._syncHref();
      if (t === "current")
        this._syncCurrent();
    }
    _syncHref() {
      if (!this._link)
        return;
      let t = this.getAttribute("href");
      if (t)
        this._link.setAttribute("href", t);
      else
        this._link.removeAttribute("href");
    }
    _syncCurrent() {
      if (!this._link)
        return;
      if (this.hasAttribute("current"))
        this._link.setAttribute("aria-current", "page");
      else
        this._link.removeAttribute("aria-current");
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
  var fe = `:host {
  display: block;

  --_bg: var(--bg-surface, #ffffff);
  --_border-color: var(--border-default, #e5e7eb);
  --_border-width: 1px;
  --_radius: 12px;
  --_shadow: none;
  --_padding: 1.25rem;
  --_gap: 0.75rem;
  --_text: var(--text-main, #1f2937);
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

  class ve extends s {
    constructor() {
      super({ css: fe, template: ge });
    }
  }
  var xe = `<dialog part="dialog" aria-modal="true">
    <div class="modal-wrapper" part="wrapper">
        <form method="dialog" id="close-form"></form>

        <form id="form-validation" method="get" part="form">
            <header part="header">
                <div class="title-area" part="title">
                    <slot name="title">New window</slot>
                </div>
                <button class="close-icon" part="close" form="close-form" type="submit" aria-label="Close">&times;</button>
            </header>

            <section class="body" part="body">
                <slot></slot>
            </section>

            <footer class="actions" part="footer">
                <slot name="footer">
                    <p9r-button form="close-form" type="submit" variant="ghost">Cancel</p9r-button>
                    <p9r-button form="form-validation" type="submit" variant="filled" color="primary">Confirm</p9r-button>
                </slot>
            </footer>
        </form>
    </div>
</dialog>
`;
  var _e = `:host {
    --_modal-width: 500px;
    --_modal-radius: 12px;
    --_modal-bg: var(--bg-surface);
    --_modal-border: var(--border-default);
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
  var we = (t) => {
    t.dispatchEvent(new CustomEvent("open", { bubbles: true, composed: true }));
  };
  var ke = (t) => {
    t.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };
  var Ee = (t, e) => {
    let r = t.shadowRoot?.querySelector("dialog");
    if (!r)
      return;
    if (e.target !== r)
      return;
    let i = r.getBoundingClientRect();
    if (!(i.top <= e.clientY && e.clientY <= i.top + i.height && i.left <= e.clientX && e.clientX <= i.left + i.width))
      t.close();
  };
  var Ae = (t, e) => {
    t.querySelectorAll("[name]").forEach((i) => {
      let o = i.getAttribute("name"), n = i.value;
      if (o && n !== undefined && n !== null && n !== "")
        e.formData.append(o, String(n));
    });
  };
  var Ha = _e + ye;

  class Le extends s {
    _dialog;
    _form;
    _previouslyFocused = null;
    static get observedAttributes() {
      return ["action", "method", "enctype"];
    }
    constructor() {
      super({ css: Ha, template: xe });
      this._dialog = this.shadowRoot?.querySelector("dialog") ?? null, this._form = this.shadowRoot?.querySelector("#form-validation") ?? null;
    }
    connectedCallback() {
      for (let t of ["action", "method", "enctype"])
        d(this, t);
      this._dialog?.addEventListener("click", this._onBackdrop), this._dialog?.addEventListener("close", this._onClose), this._form?.addEventListener("formdata", this._onFormData);
    }
    disconnectedCallback() {
      this._dialog?.removeEventListener("click", this._onBackdrop), this._dialog?.removeEventListener("close", this._onClose), this._form?.removeEventListener("formdata", this._onFormData);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._form)
        return;
      if (t === "action")
        this._form.action = r ?? "";
      if (t === "method")
        this._form.method = r ?? "get";
      if (t === "enctype")
        this._form.enctype = r ?? "application/x-www-form-urlencoded";
    }
    _onBackdrop = (t) => Ee(this, t);
    _onFormData = (t) => Ae(this, t);
    _onClose = () => {
      if (this._previouslyFocused instanceof HTMLElement)
        this._previouslyFocused.focus();
      this._previouslyFocused = null, ke(this);
    };
    showModal() {
      if (!this._dialog)
        return;
      this._previouslyFocused = document.activeElement, this._dialog.showModal(), we(this);
    }
    close() {
      this._dialog?.close();
    }
    get action() {
      return this.getAttribute("action") ?? "";
    }
    set action(t) {
      t ? this.setAttribute("action", t) : this.removeAttribute("action");
    }
    get method() {
      return this.getAttribute("method") ?? "get";
    }
    set method(t) {
      t ? this.setAttribute("method", t) : this.removeAttribute("method");
    }
    get enctype() {
      return this.getAttribute("enctype") ?? "application/x-www-form-urlencoded";
    }
    set enctype(t) {
      t ? this.setAttribute("enctype", t) : this.removeAttribute("enctype");
    }
  }
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
    --drawer-bg: #ffffff;
    --transition-speed: 0.4s;
    --transition-curve: cubic-bezier(0.4, 0, 0.2, 1);

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
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    position: sticky;
    top: 0;
    z-index: 1;
}

header slot[name="title"]::slotted(*) {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1a1a1a;
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
    color: #666;
    cursor: pointer;
    line-height: 0;
}

#close-btn:hover {
    background-color: #f3f4f6;
    color: #000;
}

#close-btn:focus-visible {
    outline: 2px solid #1a1a1a;
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
    background-color: #f9fafb;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
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
    border: 1px solid #d1d5db;
    background: white;
}

footer slot[name="footer"]::slotted(button[primary]) {
    background: #000;
    color: white;
    border-color: #000;
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
  var Se = (t) => {
    t.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  };
  var Ie = (t, e) => {
    let r = t.shadowRoot?.querySelector("dialog");
    if (e.target === r)
      t.close();
  };
  var qe = (t, e) => {
    e.preventDefault(), t.close();
  };
  var Fe = (t, e) => {
    e.preventDefault(), t.close();
  };
  var Pe = (t) => {
    if (t.hasAttribute("open"))
      t.removeAttribute("open");
    Se(t);
  };
  var qa = Me + He + Te;

  class Be extends s {
    _dialog;
    _closeBtn;
    static get observedAttributes() {
      return ["open"];
    }
    constructor() {
      super({ css: qa, template: Ce });
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
    _onBackdrop = (t) => Ie(this, t);
    _onCloseClick = (t) => qe(this, t);
    _onCancel = (t) => Fe(this, t);
    _onClose = () => Pe(this);
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
.close:hover { background: rgba(0,0,0,0.06); }
:host([no-close]) .close { display: none; }

.body { padding: var(--modal-pad); overflow: auto; }
`;

  class $e extends s {
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
  var Re = `<slot></slot>
`;
  var Xe = `:host {
    display: contents;
    cursor: pointer;
}
`;

  class Ze extends s {
    constructor() {
      super({ css: Xe, template: Re });
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
  var Ue = `<div class="divider" part="divider" role="separator">
    <span class="line line-start" part="line"></span>
    <span class="label" part="label"><slot></slot></span>
    <span class="line line-end" part="line"></span>
</div>
`;
  var Qe = `:host {
  display: block;

  --_color: var(--border-default, #e5e7eb);
  --_thickness: 1px;
  --_gap: 0.75rem;
  --_label-color: var(--text-muted, #6b7280);
  --_label-size: 12px;
}

.divider {
  display: flex;
  align-items: center;
  gap: var(--_gap);
  width: 100%;
}

.line {
  flex: 1;
  background: var(--_color);
  height: var(--_thickness);
  min-width: 0;
}

.label {
  font-size: var(--_label-size);
  color: var(--_label-color);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.label.is-empty {
  display: none;
}

:host(:not([align="start"]):not([align="end"])) .line-start,
:host(:not([align="start"]):not([align="end"])) .line-end {
  flex: 1;
}

:host([align="start"]) .line-start { flex: 0 0 1.5rem; }
:host([align="start"]) .line-end   { flex: 1; }
:host([align="end"]) .line-start   { flex: 1; }
:host([align="end"]) .line-end     { flex: 0 0 1.5rem; }

:host([orientation="vertical"]) {
  display: inline-block;
  height: 100%;
}

:host([orientation="vertical"]) .divider {
  flex-direction: column;
  height: 100%;
  width: var(--_thickness);
}

:host([orientation="vertical"]) .line {
  width: var(--_thickness);
  height: auto;
  flex: 1;
}

:host([orientation="vertical"]) .label {
  writing-mode: vertical-rl;
}

:host([variant="dashed"]) .line {
  background: transparent;
  border-top: var(--_thickness) dashed var(--_color);
  height: 0;
}

:host([variant="dotted"]) .line {
  background: transparent;
  border-top: var(--_thickness) dotted var(--_color);
  height: 0;
}
`;

  class Ge extends s {
    _label;
    _labelSlot;
    static get observedAttributes() {
      return ["orientation"];
    }
    constructor() {
      super({ css: Qe, template: Ue });
      this._label = this.shadowRoot?.querySelector(".label") ?? null, this._labelSlot = this.shadowRoot?.querySelector(".label slot") ?? null;
    }
    connectedCallback() {
      this._syncAria(), this._labelSlot?.addEventListener("slotchange", this._syncLabel), this._syncLabel();
    }
    disconnectedCallback() {
      this._labelSlot?.removeEventListener("slotchange", this._syncLabel);
    }
    attributeChangedCallback(t, e, r) {
      if (t === "orientation")
        this._syncAria();
    }
    _syncLabel = () => {
      if (!this._label || !this._labelSlot)
        return;
      let t = this._labelSlot.assignedNodes({ flatten: true }).some((e) => e.nodeType === Node.ELEMENT_NODE || (e.textContent ?? "").trim() !== "");
      this._label.classList.toggle("is-empty", !t);
    };
    _syncAria() {
      let t = this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
      this.setAttribute("aria-orientation", t);
    }
  }
  var Je = `<button id="btn" class="button" part="button">
    <slot name="icon-left"></slot>
    <span class="label">
        <slot>Button</slot>
    </span>
    <slot name="icon-right"></slot>
</button>
`;
  var We = `:host {
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
  --_accent-contrast: oklch(100% 0 0);

  --_btn-radius: 8px;
  --_btn-font: inherit;
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
  var Ye = `:host([color="primary"]) {
  --_accent-base: var(--primary-base);
  --_accent-muted: var(--primary-muted);
  --_accent-contrast: oklch(100% 0 0);
}

:host([color="danger"]) {
  --_accent-base: var(--danger-base);
  --_accent-muted: var(--danger-muted);
}

:host([color="success"]) {
  --_accent-base: var(--success-base);
  --_accent-muted: var(--success-muted);
}

:host([color="info"]) {
  --_accent-base: var(--info-base);
  --_accent-muted: var(--info-muted);
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
  var Ra = We + Ye;

  class Oe extends s {
    static formAssociated = true;
    _internals;
    _btn;
    constructor() {
      super({ css: Ra, template: Je });
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

  class B extends s {
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
  stroke: var(--cb-check-color, #ffffff);
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
  background-color: var(--cb-check-color, #ffffff);
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
  var A = (t, e, r) => {
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
  var or = (t, e, r, i, o) => {
    if (!e)
      return;
    if (i === "checked")
      e.checked = o !== null, A(t, e, r);
    else if (i === "disabled")
      e.disabled = o !== null;
    else if (i === "indeterminate")
      e.indeterminate = o !== null;
    else if (i === "name")
      e.name = o ?? "";
    else if (i === "value")
      e.value = o ?? "", A(t, e, r);
  };
  var nr = (t, e, r) => {
    if (e?.checked ?? false)
      t.setAttribute("checked", "");
    else
      t.removeAttribute("checked");
    if (e && e.indeterminate === false && t.hasAttribute("indeterminate"))
      t.removeAttribute("indeterminate");
    A(t, e, r), t.dispatchEvent(new Event("change", { bubbles: true }));
  };
  var ar = (t, e) => {
    if (t.hasAttribute("disabled"))
      e.preventDefault(), e.stopImmediatePropagation();
  };
  var Qa = er + rr;

  class sr extends B {
    _input;
    _labelText;
    _labelSlot;
    _defaultIndeterminate = false;
    static get observedAttributes() {
      return ["checked", "disabled", "name", "value", "indeterminate"];
    }
    constructor() {
      super({ css: Qa, template: tr });
      this._input = this.shadowRoot?.querySelector("input") ?? null, this._labelText = this.shadowRoot?.querySelector(".label-text") ?? null, this._labelSlot = this.shadowRoot?.querySelector(".label-text slot:not([name])") ?? null;
    }
    connectedCallback() {
      this._captureDefaults(), ["checked", "disabled", "name", "value", "indeterminate"].forEach((t) => d(this, t)), ir(this, this._input), this._input?.addEventListener("change", this._onChange), this._input?.addEventListener("click", this._onClick), this._labelSlot?.addEventListener("slotchange", this._syncLabel), this._syncLabel(), A(this, this._input, this._internals);
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
      or(this, this._input, this._internals, t, r);
    }
    _onChange = () => nr(this, this._input, this._internals);
    _onClick = (t) => ar(this, t);
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
  var lr = `<section class="section-container" part="container">
    <header id="toggle" part="header" role="button" tabindex="0" aria-expanded="true">
        <div class="accent-bar" part="accent"></div>
        <div class="title-wrapper" part="title"></div>
        <svg class="chevron" part="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    </header>
    <main class="content" id="content" part="content">
        <slot></slot>
    </main>
</section>
`;
  var dr = `:host {
    display: block;
    margin-bottom: 8px;
}

.section-container {
    border-radius: 10px;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e5e7eb);
}

header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    cursor: pointer;
    user-select: none;
    outline: none;
}

header:hover {
    background: var(--bg-base, #f9fafb);
}

header:focus-visible {
    box-shadow: inset 0 0 0 2px var(--primary-base, #6366f1);
    border-radius: 10px;
}

@media (prefers-reduced-motion: no-preference) {
    header { transition: background 0.15s; }
    .chevron { transition: transform 0.2s ease; }
}

.accent-bar {
    width: 3px;
    height: 14px;
    background: var(--primary-base, #6366f1);
    border-radius: 4px;
    flex-shrink: 0;
}

.title-wrapper {
    flex: 1;
    color: var(--text-main, #111827);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.chevron {
    width: 16px;
    height: 16px;
    color: var(--text-muted, #9ca3af);
    flex-shrink: 0;
}

:host([collapsed]) .chevron {
    transform: rotate(-90deg);
}

.content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-top: 1px solid var(--border-default, #e5e7eb);
    padding: 1rem;
}

:host([collapsed]) .content {
    display: none;
}

.content ::slotted(*) {
    width: 100%;
}
`;
  var nt = (t, e) => {
    if (e)
      e.textContent = t.getAttribute("data-title") ?? "";
  };
  var at = (t, e, r) => {
    if (!e)
      return;
    let i = t.hasAttribute("collapsed");
    if (e.setAttribute("aria-expanded", String(!i)), r)
      r.hidden = i;
  };
  var cr = (t, e) => {
    t.dispatchEvent(new CustomEvent("toggle", { detail: { collapsed: e }, bubbles: true, composed: true }));
  };
  var st = (t) => {
    t.collapsed = !t.collapsed, cr(t, t.collapsed);
  };
  var pr = (t, e) => {
    if (e.key !== "Enter" && e.key !== " ")
      return;
    e.preventDefault(), st(t);
  };

  class ur extends s {
    static get observedAttributes() {
      return ["collapsed", "data-title"];
    }
    _toggle;
    _title;
    _content;
    constructor() {
      super({ css: dr, template: lr });
      this._toggle = this.shadowRoot?.getElementById("toggle") ?? null, this._title = this.shadowRoot?.querySelector(".title-wrapper") ?? null, this._content = this.shadowRoot?.getElementById("content") ?? null;
    }
    connectedCallback() {
      if (d(this, "collapsed"), this.hasAttribute("data-collapsed") && !this.hasAttribute("collapsed"))
        this.setAttribute("collapsed", "");
      nt(this, this._title), at(this, this._toggle, this._content), this._toggle?.addEventListener("click", this._onClick), this._toggle?.addEventListener("keydown", this._onKey);
    }
    disconnectedCallback() {
      this._toggle?.removeEventListener("click", this._onClick), this._toggle?.removeEventListener("keydown", this._onKey);
    }
    attributeChangedCallback(t) {
      if (t === "collapsed")
        at(this, this._toggle, this._content);
      if (t === "data-title")
        nt(this, this._title);
    }
    get collapsed() {
      return this.hasAttribute("collapsed");
    }
    set collapsed(t) {
      t ? this.setAttribute("collapsed", "") : this.removeAttribute("collapsed");
    }
    _onClick = () => st(this);
    _onKey = (t) => pr(this, t);
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
}

:host([size="sm"]) { --_size: 1.75rem; --_radius: 6px; }
:host([size="md"]) { --_size: 2.25rem; --_radius: 8px; }
:host([size="lg"]) { --_size: 2.75rem; --_radius: 10px; }

:host([color="primary"]) { --_accent: var(--primary-base); }
:host([color="danger"])  { --_accent: var(--danger-base); }
:host([color="success"]) { --_accent: var(--success-base); }
:host([color="info"])    { --_accent: var(--info-base); }
:host([color="warning"]) { --_accent: var(--warning-base); }

:host([variant="filled"]) {
  --_bg: var(--_accent);
  --_color: white;
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
  var gr = `<div class="field-header" part="header">
    <slot name="label"></slot>
</div>

<div class="drop-zone" part="drop-zone">
    <input type="file" id="file-native" part="input">
    <label for="file-native" part="trigger">
        <span class="icon" part="icon">
            <slot name="icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                </svg>
            </slot>
        </span>
        <span class="text" part="text">
            <slot name="text"><strong>Click to upload</strong> or drag a file</slot>
        </span>
        <span class="file-info" part="file-info">No file selected</span>
    </label>
</div>

<div class="sr-live" role="status" aria-live="polite" aria-atomic="true"></div>
`;
  var fr = `:host {
    display: block;
    width: 100%;
    margin: 1.25rem 0;
}

:host([disabled]) {
    opacity: 0.5;
    pointer-events: none;
}

.drop-zone {
    border: 2px dashed var(--border-default);
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    background: var(--bg-surface);
    cursor: pointer;
    position: relative;
}

:host([dragging]) .drop-zone {
    border-color: var(--color-primary);
    background: color-mix(in oklch, var(--color-primary), transparent 90%);
}

label {
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
}

.icon {
    color: var(--text-muted);
    margin-bottom: 0.5rem;
    display: inline-flex;
}

.text {
    font-size: 14px;
    color: var(--text-body);
}

.text strong {
    color: var(--color-primary);
}

.file-info {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 0.5rem;
    font-family: monospace;
}

input[type="file"] {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}

input[type="file"]:focus-visible + label {
    outline: 2px solid var(--color-primary, currentColor);
    outline-offset: 2px;
    border-radius: 8px;
}

.field-header {
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-label, #4b5563);
}

.sr-live {
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

@media (prefers-reduced-motion: no-preference) {
    .drop-zone {
        transition: border-color 0.2s ease, background-color 0.2s ease;
    }
}
`;
  var vr = (t) => {
    if (t < 1024)
      return `${t} B`;
    if (t < 1048576)
      return `${(t / 1024).toFixed(1)} KB`;
    return `${(t / 1048576).toFixed(1)} MB`;
  };
  var lt = (t, e) => {
    if (t)
      t.textContent = e;
  };
  var dt = (t, e) => {
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { files: e } }));
  };
  var X = (t, e, r, i, o) => {
    let n = e?.files;
    if (!n || n.length === 0) {
      if (r)
        r.textContent = "No file selected";
      o.setFormValue(null), lt(i, "No file selected"), dt(t, null);
      return;
    }
    let a = n.length === 1 && n[0] ? `${n[0].name} (${vr(n[0].size)})` : `${n.length} files selected`;
    if (r)
      r.textContent = a;
    if (n.length === 1 && n[0])
      o.setFormValue(n[0]);
    else {
      let l = new FormData, c = t.getAttribute("name") ?? "";
      for (let p = 0;p < n.length; p++) {
        let u = n.item(p);
        if (u)
          l.append(c, u);
      }
      o.setFormValue(l);
    }
    lt(i, `Selected: ${a}`), dt(t, n);
  };
  var xr = (t, e) => {
    if (e.preventDefault(), t.hasAttribute("disabled"))
      return;
    t.toggleAttribute("dragging", true);
  };
  var _r = (t, e) => {
    e.preventDefault(), t.toggleAttribute("dragging", false);
  };
  var yr = (t, e, r, i, o, n) => {
    let a = n;
    if (a.preventDefault(), t.removeAttribute("dragging"), t.hasAttribute("disabled"))
      return;
    if (a.dataTransfer?.files && e)
      e.files = a.dataTransfer.files, X(t, e, r, i, o);
  };

  class wr extends s {
    static formAssociated = true;
    _internals;
    _input;
    _preview;
    _dropZone;
    _liveRegion;
    constructor() {
      super({ css: fr, template: gr });
      this._internals = this.attachInternals(), this._input = this.shadowRoot?.querySelector('input[type="file"]') ?? null, this._preview = this.shadowRoot?.querySelector(".file-info") ?? null, this._dropZone = this.shadowRoot?.querySelector(".drop-zone") ?? null, this._liveRegion = this.shadowRoot?.querySelector(".sr-live") ?? null;
    }
    static get observedAttributes() {
      return ["accept", "multiple", "name", "disabled", "required"];
    }
    connectedCallback() {
      for (let t of ["accept", "multiple", "name", "disabled", "required"])
        d(this, t);
      this._input?.addEventListener("change", this._onChange), this._dropZone?.addEventListener("dragover", this._onDragOver), this._dropZone?.addEventListener("dragleave", this._onDragLeave), this._dropZone?.addEventListener("drop", this._onDrop);
    }
    disconnectedCallback() {
      this._input?.removeEventListener("change", this._onChange), this._dropZone?.removeEventListener("dragover", this._onDragOver), this._dropZone?.removeEventListener("dragleave", this._onDragLeave), this._dropZone?.removeEventListener("drop", this._onDrop);
    }
    formResetCallback() {
      if (this._input)
        this._input.value = "";
      if (this._internals.setFormValue(null), this._preview)
        this._preview.textContent = "No file selected";
      this.removeAttribute("dragging");
    }
    attributeChangedCallback(t, e, r) {
      if (!this._input)
        return;
      switch (t) {
        case "accept":
          if (r === null)
            this._input.removeAttribute("accept");
          else
            this._input.setAttribute("accept", r);
          break;
        case "multiple":
          this._input.multiple = this.hasAttribute("multiple");
          break;
        case "name":
          if (r === null)
            this._input.removeAttribute("name");
          else
            this._input.setAttribute("name", r);
          break;
        case "disabled":
          this._input.disabled = this.hasAttribute("disabled");
          break;
        case "required":
          this._input.required = this.hasAttribute("required");
          break;
      }
    }
    _onChange = () => X(this, this._input, this._preview, this._liveRegion, this._internals);
    _onDragOver = (t) => xr(this, t);
    _onDragLeave = (t) => _r(this, t);
    _onDrop = (t) => yr(this, this._input, this._preview, this._liveRegion, this._internals, t);
    get name() {
      return this.getAttribute("name") ?? "";
    }
    set name(t) {
      this.setAttribute("name", t);
    }
    get accept() {
      return this.getAttribute("accept") ?? "";
    }
    set accept(t) {
      t ? this.setAttribute("accept", t) : this.removeAttribute("accept");
    }
    get multiple() {
      return this.hasAttribute("multiple");
    }
    set multiple(t) {
      t ? this.setAttribute("multiple", "") : this.removeAttribute("multiple");
    }
    get disabled() {
      return this.hasAttribute("disabled");
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
    get files() {
      return this._input?.files ?? null;
    }
    get value() {
      return this._input?.files?.[0] ?? null;
    }
    get form() {
      return this._internals.form;
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
  var Ar = `.input:hover:not(:disabled) {
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
  var Lr = `@media (prefers-reduced-motion: no-preference) {
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
  var L = (t, e, r, i) => {
    if (!e || !r || !i)
      return;
    let o = ct(t);
    if (o === null)
      return;
    let n = e.value.length;
    i.textContent = String(n), r.dataset.over = String(n > o);
  };
  var pt = (t, e, r) => {
    if (!t || !e || !r)
      return;
    let i = (t.textContent ?? "").length > 0, o = !e.hidden;
    r.hidden = !i && !o;
  };
  var ns = 0;
  var Cr = () => `p9r-input-label-${++ns}`;
  var ut = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("label") ?? "";
    e.textContent = r, e.hidden = r === "";
  };
  var as = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("placeholder");
    if (r === null)
      e.removeAttribute("placeholder");
    else
      e.setAttribute("placeholder", r);
  };
  var ss = (t, e) => {
    if (!e)
      return;
    e.setAttribute("type", t.getAttribute("type") ?? "text");
  };
  var ls = (t, e) => {
    if (e)
      e.disabled = t.hasAttribute("disabled");
  };
  var ds = (t, e) => {
    if (!e)
      return;
    let r = t.hasAttribute("required");
    if (e.required = r, r)
      e.setAttribute("aria-required", "true");
    else
      e.removeAttribute("aria-required");
  };
  var cs = (t, e, r, i) => {
    if (!e)
      return;
    e.textContent = t.getAttribute("hint") ?? "", pt(e, r, i);
  };
  var ps = (t, e) => {
    if (!e)
      return;
    e.dataset.level = t.getAttribute("hint-level") ?? "info";
  };
  var us = (t, e) => {
    if (!e)
      return;
    if (t.hasAttribute("invalid"))
      e.setAttribute("aria-invalid", "true");
    else
      e.removeAttribute("aria-invalid");
  };
  var ht = (t, e, r, i, o) => {
    if (!e || !r)
      return;
    let n = ct(t);
    if (n === null)
      e.hidden = true;
    else
      e.hidden = false, r.textContent = String(n);
    pt(i, e, o);
  };
  var bt = (t, e, r, i, o, n, a) => {
    ut(t, r), as(t, e), ss(t, e), ls(t, e), ds(t, e), cs(t, i, n, o), ps(t, i), us(t, e), ht(t, n, a, i, o);
  };
  var Mr = (t, e, r, i, o) => {
    if (!e)
      return;
    r.setFormValue(e.value), L(t, e, i, o);
  };
  var Hr = (t, e) => {
    if (!t)
      return;
    e.setFormValue(t.value);
  };
  var hs = Er + Ar + Lr;

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
      super({ css: hs, template: kr });
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
        L(this, this._input, this._counterEl, this._countEl);
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
        ht(this, this._counterEl, this._maxEl, this._hintEl, this._metaEl), L(this, this._input, this._counterEl, this._countEl);
      else
        bt(this, this._input, this._labelEl, this._hintEl, this._metaEl, this._counterEl, this._maxEl);
    }
    get value() {
      return this._input?.value ?? "";
    }
    set value(t) {
      if (!this._input)
        return;
      this._input.value = t, this._internals.setFormValue(t), L(this, this._input, this._counterEl, this._countEl);
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
  var zr = `<div class="field" part="field">
    <div class="header" part="header">
        <span class="label" part="label"></span>
        <div class="input-wrap" part="input-wrap">
            <input class="number" part="number-input" type="number">
            <span class="unit" part="unit" hidden></span>
        </div>
    </div>
    <div class="track-container" part="track-container">
        <div class="track" part="track">
            <div class="fill" part="fill"></div>
        </div>
        <input class="slider" part="slider" type="range">
    </div>
    <div class="bounds" part="bounds">
        <span class="min-bound"></span>
        <span class="max-bound"></span>
    </div>
</div>
`;
  var Sr = `:host {
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
  var Ir = `:host([disabled]) {
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
  var K = (t, e) => {
    if (!t)
      return e;
    let r = Number(t.min), i = Number(t.max);
    if (!Number.isFinite(e))
      return r;
    if (e < r)
      return r;
    if (e > i)
      return i;
    return e;
  };
  var C = (t, e) => {
    if (!t || !e)
      return;
    let r = Number(t.min), i = Number(t.max), o = Number(t.value), n = i === r ? 0 : (o - r) / (i - r) * 100;
    e.style.width = `${n}%`;
  };
  var mt = (t, e, r, i, o) => {
    if (!e || !r || !i || !o)
      return;
    let n = t.getAttribute("min") ?? "0", a = t.getAttribute("max") ?? "100", l = t.getAttribute("step") ?? "1";
    e.min = n, e.max = a, e.step = l, r.min = n, r.max = a, r.step = l, i.textContent = n, o.textContent = a;
  };
  var gt = (t, e, r, i) => {
    if (!e || !r || !i)
      return;
    let o = t.getAttribute("label") ?? t.getAttribute("name") ?? "";
    if (e.textContent = o, e.hidden = o === "", o)
      r.setAttribute("aria-label", o), i.setAttribute("aria-label", o);
  };
  var ft = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("unit") ?? "";
    e.textContent = r, e.hidden = r === "";
  };
  var vt = (t, e, r) => {
    if (!e || !r)
      return;
    let i = t.hasAttribute("disabled");
    e.disabled = i, r.disabled = i;
  };
  var D = (t, e, r, i, o) => {
    if (!t || !e)
      return;
    let n = K(t, Number(o));
    t.value = String(n), e.value = String(n), i.setFormValue(t.value), C(t, r);
  };
  var Fr = (t, e, r, i, o) => {
    if (!e || !r)
      return;
    r.value = e.value, o.setFormValue(e.value), C(e, i), t.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  };
  var Pr = (t, e, r) => {
    if (!e)
      return;
    r.setFormValue(e.value), t.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  };
  var Br = (t, e, r, i, o) => {
    if (!e || !r)
      return;
    if (r.value === "")
      return;
    let n = K(e, Number(r.value));
    e.value = String(n), o.setFormValue(e.value), C(e, i), t.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  };
  var Kr = (t, e, r, i, o) => {
    if (!e || !r)
      return;
    let n = K(e, Number(r.value));
    e.value = String(n), r.value = String(n), o.setFormValue(e.value), C(e, i), t.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  };
  var Dr = (t, e) => {
    if (!t || !e)
      return;
    e.value = t.value;
  };
  var vs = Sr + Ir + qr;

  class jr extends s {
    static formAssociated = true;
    static get observedAttributes() {
      return ["value", "label", "min", "max", "step", "unit", "disabled"];
    }
    _internals;
    _slider;
    _input;
    _fill;
    _labelEl;
    _unitEl;
    _minEl;
    _maxEl;
    _defaultValue = "";
    _defaultsCaptured = false;
    constructor() {
      super({ css: vs, template: zr });
      this._internals = this.attachInternals();
      let t = this.shadowRoot;
      this._slider = t.querySelector(".slider"), this._input = t.querySelector(".number"), this._fill = t.querySelector(".fill"), this._labelEl = t.querySelector(".label"), this._unitEl = t.querySelector(".unit"), this._minEl = t.querySelector(".min-bound"), this._maxEl = t.querySelector(".max-bound");
    }
    connectedCallback() {
      ["value", "disabled"].forEach((e) => d(this, e)), gt(this, this._labelEl, this._slider, this._input), mt(this, this._slider, this._input, this._minEl, this._maxEl), ft(this, this._unitEl), vt(this, this._slider, this._input);
      let t = this.getAttribute("value") ?? this.getAttribute("min") ?? "0";
      if (!this._defaultsCaptured)
        this._defaultValue = t, this._defaultsCaptured = true;
      D(this._slider, this._input, this._fill, this._internals, t), this._wire("addEventListener");
    }
    disconnectedCallback() {
      this._wire("removeEventListener");
    }
    formResetCallback() {
      D(this._slider, this._input, this._fill, this._internals, this._defaultValue);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._slider || !this._input)
        return;
      if (t === "value" && r !== null)
        D(this._slider, this._input, this._fill, this._internals, r);
      else if (t === "label")
        gt(this, this._labelEl, this._slider, this._input);
      else if (t === "min" || t === "max" || t === "step")
        mt(this, this._slider, this._input, this._minEl, this._maxEl);
      else if (t === "unit")
        ft(this, this._unitEl);
      else if (t === "disabled")
        vt(this, this._slider, this._input);
    }
    get value() {
      return this._slider?.value ?? "";
    }
    set value(t) {
      D(this._slider, this._input, this._fill, this._internals, String(t));
    }
    get name() {
      return this.getAttribute("name") ?? "";
    }
    get disabled() {
      return this.hasAttribute("disabled");
    }
    set disabled(t) {
      t ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
    }
    focus() {
      this._slider?.focus();
    }
    _wire(t) {
      this._slider?.[t]("input", this._onSliderInput), this._slider?.[t]("change", this._onSliderChange), this._input?.[t]("input", this._onNumberInput), this._input?.[t]("change", this._onNumberChange), this._input?.[t]("blur", this._onNumberBlur);
    }
    _onSliderInput = () => Fr(this, this._slider, this._input, this._fill, this._internals);
    _onSliderChange = () => Pr(this, this._slider, this._internals);
    _onNumberInput = () => Br(this, this._slider, this._input, this._fill, this._internals);
    _onNumberChange = () => Kr(this, this._slider, this._input, this._fill, this._internals);
    _onNumberBlur = () => Dr(this._slider, this._input);
  }
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
  var $r = `.trigger:hover {
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
  var Rr = (t, e) => {
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
    let o = [], n = "", a = "";
    if (i.forEach((l) => {
      let c = document.createElement("li");
      if (c.className = "option", c.textContent = l.textContent, c.dataset.value = l.value, c.addEventListener("click", () => r(l.value, l.textContent ?? "")), e?.appendChild(c), o.push(c), l.hasAttribute("selected") && !n)
        n = l.value, a = l.textContent ?? "";
    }), !n && i.length > 0)
      n = i[0].value, a = i[0].textContent ?? "";
    return { options: o, initialValue: n, initialLabel: a };
  };
  var Ur = (t, e, r, i) => {
    if (e)
      e.textContent = i;
    Rr(t, r);
  };
  var ws = Nr + $r;

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
      super({ css: ws, template: Vr });
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
      let { options: t, initialValue: e, initialLabel: r } = Zr(this, this._list, (o, n) => this._select(o, n));
      this._options = t;
      let i = this.getAttribute("value");
      if (i !== null) {
        let o = t.find((n) => n.dataset.value === i);
        if (o) {
          this._setValue(i, o.textContent ?? "");
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

  class Gr extends HTMLElement {
    _bufferedValue = "";
    connectedCallback() {
      let t = this.getAttribute("label") || "Size", e = this.getAttribute("name") || "size", r = document.createElement("p9r-select");
      if (r.setAttribute("label", t), r.setAttribute("name", e), [{ value: "none", label: "NONE" }, { value: "xs", label: "XS" }, { value: "sm", label: "S" }, { value: "md", label: "M", selected: true }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }].forEach((o) => {
        let n = document.createElement("option");
        if (n.value = o.value, n.textContent = o.label, o.selected)
          n.setAttribute("selected", "");
        r.appendChild(n);
      }), this._bufferedValue)
        r.value = this._bufferedValue;
      this.replaceWith(r);
    }
    get name() {
      return this.getAttribute("name");
    }
    get value() {
      return this._bufferedValue;
    }
    set value(t) {
      this._bufferedValue = t;
    }
  }
  var Jr = `<label class="radio" part="container">
    <input type="radio" id="native-input" part="input" />
    <span class="custom" part="circle" aria-hidden="true">
        <span class="dot" part="dot"></span>
    </span>
    <span class="label" part="label"><slot></slot></span>
</label>
`;
  var Wr = `:host {
  display: inline-block;

  --_size: 18px;
  --_border: var(--border-default, #d1d5db);
  --_active: var(--primary-base, #4361ee);
  --_bg: var(--bg-surface, #fff);
  --_text: var(--text-main, #1f2937);
  --_focus-ring: color-mix(in oklab, var(--_active) 20%, transparent);
}

.radio {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
}

input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
}

.custom {
  position: relative;
  width: var(--_size);
  height: var(--_size);
  border-radius: 50%;
  border: 2px solid var(--_border);
  background: var(--_bg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
}

.dot {
  width: 50%;
  height: 50%;
  background: var(--_active);
  border-radius: 50%;
  transform: scale(0);
}

@media (prefers-reduced-motion: no-preference) {
  .custom { transition: border-color 0.15s, box-shadow 0.15s; }
  .dot    { transition: transform 0.15s; }
}

input:checked ~ .custom {
  border-color: var(--_active);
}

input:checked ~ .custom .dot {
  transform: scale(1);
}

input:focus-visible ~ .custom {
  box-shadow: 0 0 0 3px var(--_focus-ring);
}

.label {
  font-size: 14px;
  color: var(--_text);
}

.label:has(slot:not(:has(*))) { display: none; }

:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}
`;

  class Yr extends s {
    _input;
    static get observedAttributes() {
      return ["checked", "disabled", "value", "name"];
    }
    constructor() {
      super({ css: Wr, template: Jr });
      this._input = this.shadowRoot?.querySelector("input") ?? null;
    }
    connectedCallback() {
      for (let t of ["checked", "disabled", "value"])
        d(this, t);
      if (this._input) {
        if (this._input.checked = this.hasAttribute("checked"), this._input.disabled = this.hasAttribute("disabled"), this._input.value = this.getAttribute("value") ?? "", this.hasAttribute("name"))
          this._input.name = this.getAttribute("name") ?? "";
        this._input.addEventListener("change", this._onChange), this._input.addEventListener("click", this._onClick);
      }
      if (this.setAttribute("role", "radio"), this.setAttribute("aria-checked", String(this.hasAttribute("checked"))), !this.hasAttribute("tabindex"))
        this.setAttribute("tabindex", this.hasAttribute("checked") ? "0" : "-1");
    }
    disconnectedCallback() {
      this._input?.removeEventListener("change", this._onChange), this._input?.removeEventListener("click", this._onClick);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._input)
        return;
      if (t === "checked")
        this._input.checked = r !== null, this.setAttribute("aria-checked", String(r !== null));
      else if (t === "disabled")
        this._input.disabled = r !== null;
      else if (t === "value")
        this._input.value = r ?? "";
      else if (t === "name")
        this._input.name = r ?? "";
    }
    _onChange = () => {
      if (this._input?.checked ?? false)
        this.setAttribute("checked", "");
      else
        this.removeAttribute("checked");
      this.dispatchEvent(new Event("change", { bubbles: true }));
    };
    _onClick = (t) => {
      if (this.hasAttribute("disabled"))
        t.preventDefault(), t.stopImmediatePropagation();
    };
    get checked() {
      return this.hasAttribute("checked");
    }
    set checked(t) {
      if (t)
        this.setAttribute("checked", "");
      else
        this.removeAttribute("checked");
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
    get value() {
      return this.getAttribute("value") ?? "";
    }
    set value(t) {
      this.setAttribute("value", t);
    }
  }
  var Or = `<fieldset class="group" part="group">
    <legend class="label" part="label"></legend>
    <div class="options" part="options">
        <slot></slot>
    </div>
</fieldset>
`;
  var ti = `:host {
  display: block;
}

.group {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #94a3b8);
  padding: 0;
  margin-bottom: 0.4rem;
}

.label:empty { display: none; }

.options {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

:host([orientation="horizontal"]) .options {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1rem;
}

:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}
`;
  var M = (t) => {
    if (!t)
      return [];
    return t.assignedElements({ flatten: true }).filter((e) => e.tagName === "P9R-RADIO");
  };
  var Cs = 0;
  var ei = () => `radiogroup-${Cs++}`;
  var ri = (t, e, r) => {
    t.forEach((i) => {
      let o = e !== null && i.getAttribute("value") === e;
      if (o)
        i.setAttribute("checked", "");
      else
        i.removeAttribute("checked");
      i.setAttribute("tabindex", o ? "0" : "-1");
    }), r.setFormValue(e ?? null);
  };
  var xt = (t, e) => {
    if (t)
      t.textContent = e ?? "";
  };
  var Z = (t, e) => {
    if (!e)
      return;
    t.forEach((r) => r.setAttribute("disabled", ""));
  };
  var _t = (t, e) => {
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { value: e } }));
  };
  var yt = (t, e, r) => {
    let i = M(e), o = t.getAttribute("name") ?? ei(), n = t.getAttribute("value");
    if (i.forEach((a) => {
      a.setAttribute("name", o);
      let l = n !== null && a.getAttribute("value") === n;
      if (l)
        a.setAttribute("checked", "");
      else
        a.removeAttribute("checked");
      a.setAttribute("tabindex", l ? "0" : "-1");
    }), n === null && i.length > 0)
      i[0]?.setAttribute("tabindex", "0");
    Z(i, t.hasAttribute("disabled")), r.setFormValue(n ?? null);
  };
  var ii = (t, e) => {
    let r = e.target;
    if (r.tagName !== "P9R-RADIO")
      return;
    let i = r.getAttribute("value") ?? "";
    if (i !== t.getAttribute("value"))
      t.setAttribute("value", i), _t(t, i);
  };
  var oi = (t, e, r) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(r.key))
      return;
    let o = M(e).filter((u) => !u.hasAttribute("disabled"));
    if (o.length === 0)
      return;
    let n = o.findIndex((u) => u === document.activeElement), a = n === -1 ? 0 : n, l = a;
    switch (r.key) {
      case "ArrowLeft":
      case "ArrowUp":
        l = (a - 1 + o.length) % o.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        l = (a + 1) % o.length;
        break;
      case "Home":
        l = 0;
        break;
      case "End":
        l = o.length - 1;
        break;
    }
    r.preventDefault();
    let c = o[l];
    if (!c)
      return;
    let p = c.getAttribute("value") ?? "";
    t.setAttribute("value", p), c.focus(), _t(t, p);
  };

  class ni extends s {
    static formAssociated = true;
    _internals;
    _label;
    _slot;
    _defaultValue = null;
    _defaultsCaptured = false;
    static get observedAttributes() {
      return ["value", "label", "name", "disabled"];
    }
    constructor() {
      super({ css: ti, template: Or });
      this._internals = this.attachInternals(), this._label = this.shadowRoot?.querySelector(".label") ?? null, this._slot = this.shadowRoot?.querySelector("slot") ?? null;
    }
    connectedCallback() {
      if (!this._defaultsCaptured)
        this._defaultValue = this.getAttribute("value"), this._defaultsCaptured = true;
      for (let t of ["value", "name", "disabled"])
        d(this, t);
      this.setAttribute("role", "radiogroup"), xt(this._label, this.getAttribute("label")), this._slot?.addEventListener("slotchange", this._onSlotChange), this.addEventListener("change", this._onChange), this.addEventListener("keydown", this._onKey), yt(this, this._slot, this._internals);
    }
    disconnectedCallback() {
      this._slot?.removeEventListener("slotchange", this._onSlotChange), this.removeEventListener("change", this._onChange), this.removeEventListener("keydown", this._onKey);
    }
    formResetCallback() {
      if (this._defaultValue === null)
        this.removeAttribute("value");
      else
        this.setAttribute("value", this._defaultValue);
    }
    attributeChangedCallback(t, e, r) {
      if (t === "value")
        ri(M(this._slot), r, this._internals);
      else if (t === "label")
        xt(this._label, r);
      else if (t === "disabled")
        Z(M(this._slot), this.hasAttribute("disabled"));
    }
    get value() {
      return this.getAttribute("value") ?? "";
    }
    set value(t) {
      this.setAttribute("value", t);
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
    _onSlotChange = () => yt(this, this._slot, this._internals);
    _onChange = (t) => ii(this, t);
    _onKey = (t) => oi(this, this._slot, t);
  }
  var ai = `<div class="switch-container" part="container">
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
    let i = e.findIndex((o) => o.getAttribute("value") === r);
    if (i === -1)
      return;
    t.style.setProperty("--active-index", i.toString()), e.forEach((o, n) => {
      let a = n === i;
      o.setAttribute("aria-checked", a.toString()), o.setAttribute("tabindex", a ? "0" : "-1");
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
    t.style.setProperty("--total-options", r.length.toString()), r.forEach((i, o) => {
      if (i.setAttribute("role", "radio"), i.setAttribute("part", "segment"), !i.hasAttribute("tabindex"))
        i.setAttribute("tabindex", o === 0 ? "0" : "-1");
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
    let o = j(e);
    if (o.length === 0)
      return;
    let n = o.findIndex((p) => p.getAttribute("value") === t.value), a = n === -1 ? 0 : n, l = a;
    switch (r.key) {
      case "ArrowLeft":
      case "ArrowUp":
        l = (a - 1 + o.length) % o.length;
        break;
      case "ArrowRight":
      case "ArrowDown":
        l = (a + 1) % o.length;
        break;
      case "Home":
        l = 0;
        break;
      case "End":
        l = o.length - 1;
        break;
    }
    r.preventDefault();
    let c = o[l];
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
      super({ css: si, template: ai });
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
  var ci = `<label class="switch" part="container">
    <input type="checkbox" id="native-input" part="input" />
    <span class="track" part="track">
        <span class="thumb" part="thumb"></span>
    </span>
    <span class="label" part="label"><slot></slot></span>
</label>
`;
  var pi = `:host {
  display: inline-block;

  --_track-w: 36px;
  --_track-h: 20px;
  --_thumb: 14px;
  --_gap: 3px;
  --_off-bg: var(--border-default, #d1d5db);
  --_on-bg: var(--primary-base, #4361ee);
  --_thumb-bg: var(--bg-surface, #fff);
  --_text: var(--text-main, #1f2937);
  --_focus-ring: color-mix(in oklab, var(--_on-bg) 20%, transparent);
}

:host([size="sm"]) {
  --_track-w: 28px;
  --_track-h: 16px;
  --_thumb: 11px;
}

:host([size="lg"]) {
  --_track-w: 48px;
  --_track-h: 26px;
  --_thumb: 20px;
}

:host([color="danger"])  { --_on-bg: var(--danger-base); }
:host([color="success"]) { --_on-bg: var(--success-base); }
:host([color="info"])    { --_on-bg: var(--info-base); }
:host([color="warning"]) { --_on-bg: var(--warning-base); }

.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
}

input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  pointer-events: none;
}

.track {
  position: relative;
  width: var(--_track-w);
  height: var(--_track-h);
  background: var(--_off-bg);
  border-radius: 999px;
  flex-shrink: 0;
}

.thumb {
  position: absolute;
  top: var(--_gap);
  left: var(--_gap);
  width: var(--_thumb);
  height: var(--_thumb);
  background: var(--_thumb-bg);
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

input:checked ~ .track {
  background: var(--_on-bg);
}

input:checked ~ .track .thumb {
  left: calc(100% - var(--_thumb) - var(--_gap));
}

input:focus-visible ~ .track {
  box-shadow: 0 0 0 3px var(--_focus-ring);
}

.label {
  font-size: 14px;
  color: var(--_text);
}

.label:has(slot:not(:has(*))) { display: none; }

:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .track, .thumb {
    transition: background-color 0.18s ease, left 0.18s ease, box-shadow 0.18s ease;
  }
}
`;
  var H = (t, e, r) => {
    let i = e?.checked ?? t.hasAttribute("checked");
    r.setFormValue(i ? t.getAttribute("value") ?? "on" : null);
  };
  var ui = (t, e, r) => {
    if (e?.checked ?? false)
      t.setAttribute("checked", "");
    else
      t.removeAttribute("checked");
    H(t, e, r), t.dispatchEvent(new Event("change", { bubbles: true }));
  };
  var hi = (t, e) => {
    if (t.hasAttribute("disabled"))
      e.preventDefault(), e.stopImmediatePropagation();
  };

  class bi extends B {
    _input;
    static get observedAttributes() {
      return ["checked", "disabled", "name", "value"];
    }
    constructor() {
      super({ css: pi, template: ci });
      this._input = this.shadowRoot?.querySelector("input") ?? null;
    }
    connectedCallback() {
      this._captureDefaults();
      for (let t of ["checked", "disabled", "name", "value"])
        d(this, t);
      if (this._input) {
        if (this._input.checked = this.hasAttribute("checked"), this._input.disabled = this.hasAttribute("disabled"), this.hasAttribute("name"))
          this._input.name = this.getAttribute("name") ?? "";
        if (this.hasAttribute("value"))
          this._input.value = this.getAttribute("value") ?? "";
        this._input.addEventListener("change", this._onChange), this._input.addEventListener("click", this._onClick);
      }
      this.setAttribute("role", "switch"), this.setAttribute("aria-checked", String(this.hasAttribute("checked"))), H(this, this._input, this._internals);
    }
    disconnectedCallback() {
      this._input?.removeEventListener("change", this._onChange), this._input?.removeEventListener("click", this._onClick);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._input)
        return;
      if (t === "checked")
        this._input.checked = r !== null, this.setAttribute("aria-checked", String(r !== null)), H(this, this._input, this._internals);
      else if (t === "disabled")
        this._input.disabled = r !== null;
      else if (t === "name")
        this._input.name = r ?? "";
      else if (t === "value")
        this._input.value = r ?? "", H(this, this._input, this._internals);
    }
    _onChange = () => ui(this, this._input, this._internals);
    _onClick = (t) => hi(this, t);
    click() {
      this._input?.click();
    }
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
  var fi = `input:hover:not(:disabled) {
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
      let o = await fetch(i);
      if (!o.ok)
        return null;
      return await o.json();
    } catch {
      return null;
    }
  };
  var vi = (t, e, r, i) => {
    if (!t)
      return;
    if (t.innerHTML = "", e !== "multiple")
      return;
    r.forEach((o, n) => {
      let a = document.createElement("p9r-tag");
      a.setAttribute("color", "primary"), a.setAttribute("part", "chip"), a.setAttribute("role", "listitem"), a.textContent = o, a.title = `Remove ${o}`, a.setAttribute("aria-label", `Remove ${o}`), a.addEventListener("click", () => i(n)), t.appendChild(a);
    });
  };
  var xi = (t, e, r, i, o, n) => {
    if (!t || !e)
      return;
    if (r.length === 0) {
      At(t, e);
      return;
    }
    if (t.innerHTML = "", r.forEach((a, l) => {
      let c = document.createElement("div");
      c.className = "suggestion", c.id = `${o}-opt-${l}`, c.setAttribute("role", "option"), c.setAttribute("part", "option");
      let p = l === i;
      c.dataset.active = String(p), c.setAttribute("aria-selected", String(p));
      let u = document.createElement("span");
      u.className = "name", u.textContent = a.value, c.appendChild(u);
      let m = document.createElement("p9r-tag");
      m.setAttribute("color", "secondary"), m.setAttribute("part", "count"), m.textContent = String(a.count), c.appendChild(m), c.addEventListener("mousedown", (h) => {
        h.preventDefault(), n(a.value);
      }), t.appendChild(c);
    }), t.hidden = false, e.setAttribute("aria-expanded", "true"), i >= 0)
      e.setAttribute("aria-activedescendant", `${o}-opt-${i}`);
    else
      e.removeAttribute("aria-activedescendant");
  };
  var At = (t, e) => {
    if (t)
      t.hidden = true;
    if (e)
      e.setAttribute("aria-expanded", "false"), e.removeAttribute("aria-activedescendant");
  };
  var _i = (t, e, r) => {
    let i = t.filter((o) => !e.includes(o.value));
    if (r === "")
      return i.slice(0, 8);
    return i.filter((o) => o.value.toLowerCase().includes(r)).slice(0, 8);
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
  var f = (t) => t;
  var V = (t, e) => {
    let r = f(t), i = t.getAttribute("mode") || "multiple", o = e.trim();
    if (!o || !r._input)
      return;
    if (i === "multiple") {
      if (!r._tags.includes(o))
        r._tags.push(o), G(r._liveRegion, `${o} added`);
      r._input.value = "";
    } else
      r._tags = [o], r._input.value = o, G(r._liveRegion, `${o} selected`);
    r._activeIndex = -1, J(t), Y(t);
  };
  var ki = (t, e) => {
    let r = f(t), i = e.trim();
    if (r._tags = i ? [i] : [], r._internals.setFormValue(r.value), r._silent)
      return;
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: r.value, tags: [...r._tags] } }));
  };
  var Ei = (t, e) => {
    let r = f(t), i = r._tags[e];
    if (i === undefined)
      return;
    r._tags.splice(e, 1), G(r._liveRegion, `${i} removed`), J(t), r._input?.focus();
  };
  var Ai = (t) => {
    let e = f(t);
    if (e._tags.length === 0)
      return;
    Ei(t, e._tags.length - 1);
  };
  var J = (t) => {
    let e = f(t);
    if (Lt(t), e._internals.setFormValue(e.value), e._silent)
      return;
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true, detail: { value: e.value, tags: [...e._tags] } }));
  };
  var Lt = (t) => {
    let e = f(t);
    vi(e._display, t.getAttribute("mode") || "multiple", e._tags, (r) => Ei(t, r));
  };
  var Ct = (t, e) => {
    let r = f(t), o = (t.getAttribute("mode") || "multiple") === "multiple" ? r._tags : [];
    r._suggestions = _i(r._allSuggestions, o, e), r._activeIndex = -1, W(t);
  };
  var W = (t) => {
    let e = f(t);
    xi(e._suggestionsEl, e._input, e._suggestions, e._activeIndex, e._uid, (r) => V(t, r));
  };
  var Y = (t) => {
    let e = f(t);
    At(e._suggestionsEl, e._input), e._activeIndex = -1;
  };
  var Li = (t, e) => {
    if (!e)
      return;
    Ct(t, e.value.trim().toLowerCase());
  };
  var Ci = (t) => {
    setTimeout(() => Y(t), 150);
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
    let i = t.getAttribute("mode") || "multiple", o = t;
    if (r.key === "ArrowDown") {
      if (r.preventDefault(), o._suggestions.length === 0)
        return;
      o._activeIndex = Math.min(o._activeIndex + 1, o._suggestions.length - 1), W(t);
    } else if (r.key === "ArrowUp") {
      if (r.preventDefault(), o._suggestions.length === 0)
        return;
      o._activeIndex = Math.max(o._activeIndex - 1, -1), W(t);
    } else if (r.key === "Enter") {
      r.preventDefault();
      let n = o._activeIndex >= 0 ? o._suggestions[o._activeIndex] : undefined;
      if (n)
        V(t, n.value);
      else {
        let a = e.value.trim();
        if (a)
          V(t, a);
      }
    } else if (r.key === "Escape")
      r.preventDefault(), Y(t);
    else if (r.key === "Backspace" && e.value === "" && i === "multiple")
      Ai(t);
    else if (r.key === "," && i === "multiple") {
      r.preventDefault();
      let n = e.value.trim();
      if (n)
        V(t, n);
    }
  };
  var Fs = gi + fi;

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
      super({ css: Fs, template: mi });
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
        Lt(this);
      else if (t === "value")
        this.value = r ?? "";
    }
    _onFocus = () => Li(this, this._input);
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
      J(this);
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
  var Si = `:host {
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
  var Ii = `:host([resize="none"]) .textarea       { resize: none; }
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
    let o = Mt(t);
    if (o === null)
      return;
    let n = e.value.length;
    i.textContent = String(n), r.dataset.over = String(n > o);
  };
  var Ht = (t, e, r) => {
    if (!t || !e || !r)
      return;
    let i = (t.textContent ?? "").length > 0, o = !e.hidden;
    r.hidden = !i && !o;
  };
  var N = (t, e) => {
    if (!e || !t.hasAttribute("autosize"))
      return;
    e.style.height = "auto", e.style.height = `${e.scrollHeight}px`;
  };
  var Ds = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("label") ?? "";
    e.textContent = r, e.hidden = r === "";
  };
  var js = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("placeholder");
    if (r === null)
      e.removeAttribute("placeholder");
    else
      e.setAttribute("placeholder", r);
  };
  var Vs = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("rows");
    if (r)
      e.rows = Number(r) || 3;
  };
  var Ns = (t, e) => {
    if (!e)
      return;
    let r = t.getAttribute("maxlength");
    if (r === null)
      e.removeAttribute("maxlength");
    else
      e.setAttribute("maxlength", r);
  };
  var $s = (t, e) => {
    if (e)
      e.disabled = t.hasAttribute("disabled");
  };
  var Rs = (t, e) => {
    if (!e)
      return;
    let r = t.hasAttribute("required");
    if (e.required = r, r)
      e.setAttribute("aria-required", "true");
    else
      e.removeAttribute("aria-required");
  };
  var Xs = (t, e, r, i) => {
    if (!e)
      return;
    e.textContent = t.getAttribute("hint") ?? "", Ht(e, r, i);
  };
  var Zs = (t, e) => {
    if (!e)
      return;
    e.dataset.level = t.getAttribute("hint-level") ?? "info";
  };
  var Us = (t, e) => {
    if (!e)
      return;
    if (t.hasAttribute("invalid"))
      e.setAttribute("aria-invalid", "true");
    else
      e.removeAttribute("aria-invalid");
  };
  var Tt = (t, e, r, i, o) => {
    if (!e || !r)
      return;
    let n = Mt(t);
    if (n === null)
      e.hidden = true;
    else
      e.hidden = false, r.textContent = String(n);
    Ht(i, e, o);
  };
  var zt = (t, e, r, i, o, n, a) => {
    Ds(t, r), js(t, e), Vs(t, e), Ns(t, e), $s(t, e), Rs(t, e), Xs(t, i, n, o), Zs(t, i), Us(t, e), Tt(t, n, a, i, o);
  };
  var qi = (t, e, r, i, o) => {
    if (!e)
      return;
    r.setFormValue(e.value), T(t, e, i, o), N(t, e);
  };
  var Fi = (t, e) => {
    if (!t)
      return;
    e.setFormValue(t.value);
  };
  var Qs = Si + Ii;

  class Pi extends s {
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
      super({ css: Qs, template: zi });
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
    _onChange = () => Fi(this._textarea, this._internals);
  }
  var Bi = `<div class="actions" role="toolbar" part="toolbar">
    <slot></slot>
</div>
`;
  var Ki = `:host {
  display: inline-block;

  --_toolbar-bg: var(--bg-overlay, #ffffff);
  --_toolbar-border: var(--border-default, #e5e7eb);
  --_toolbar-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --_toolbar-radius: 12px;
  --_toolbar-padding: 6px;
  --_toolbar-gap: 4px;

  --_color: var(--info-contrasted, #3b82f6);
  --_hover-color: var(--primary-contrasted, #3b82f6);

  --_bg-color: var(--bg-overlay, white);
  --_bg-hover-color: var(--primary-muted, #3b82f6);

  --_border-color: var(--border-default, #e5e7eb);

  touch-action: none;
}

.actions {
  display: flex;
  align-items: center;
  background: var(--_toolbar-bg);
  border: 1px solid var(--_toolbar-border);
  border-radius: var(--_toolbar-radius);
  box-shadow: var(--_toolbar-shadow);
  overflow: hidden;
  width: fit-content;
  padding: var(--_toolbar-padding);
  gap: var(--_toolbar-gap);
}

:host([align="start"]) .actions { justify-content: flex-start; }
:host([align="center"]) .actions { justify-content: center; }
:host([align="end"]) .actions { justify-content: flex-end; }

:host([fullwidth]),
:host([fullwidth]) .actions {
  width: 100%;
}

::slotted([hidden]) {
  display: none !important;
}

::slotted([data-action]) {
  display: flex;
  align-items: center;
  padding: 10px;
  background: var(--_bg-color);
  border: none;
  border-radius: 8px;
  color: var(--_color);
  cursor: pointer;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  white-space: nowrap;
}

::slotted([data-action]:hover) {
  background-color: var(--_bg-hover-color);
  color: var(--_hover-color);
}

::slotted([data-action]:focus-visible) {
  outline: 2px solid var(--_color);
  outline-offset: 2px;
}

::slotted([data-action][disabled]),
::slotted([data-action][aria-disabled="true"]) {
  opacity: 0.4;
  pointer-events: none;
}

::slotted(.separator) {
  width: 1px;
  height: 1.7rem;
  background-color: var(--_border-color);
  margin: 0 4px;
  align-self: center;
}

@media (prefers-reduced-motion: no-preference) {
  ::slotted([data-action]) {
    transition: background-color 0.2s ease, color 0.2s ease;
  }
}
`;

  class Di extends s {
    static _event = "action-click";
    _toolbar;
    constructor() {
      super({ css: Ki, template: Bi });
      this._toolbar = this.shadowRoot?.querySelector(".actions") ?? null;
    }
    static get observedAttributes() {
      return ["label"];
    }
    connectedCallback() {
      for (let t of ["label"])
        d(this, t);
      if (this._toolbar && !this._toolbar.hasAttribute("aria-label")) {
        let t = this.getAttribute("label");
        if (t)
          this._toolbar.setAttribute("aria-label", t);
      }
      this.addEventListener("click", this._handleClick);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._handleClick);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._toolbar)
        return;
      if (t === "label")
        if (r === null)
          this._toolbar.removeAttribute("aria-label");
        else
          this._toolbar.setAttribute("aria-label", r);
    }
    _handleClick = (t) => {
      let r = t.composedPath().find((o) => o instanceof Element && o.hasAttribute("data-action"));
      if (!r)
        return;
      t.stopPropagation();
      let i = r.getAttribute("data-action");
      this._dispatchAction(i, r, t);
    };
    _dispatchAction(t, e, r) {
      this.dispatchEvent(new CustomEvent("action-click", { detail: { action: t, originalEvent: r, target: e }, bubbles: true, composed: true }));
    }
    get label() {
      return this.getAttribute("label");
    }
    set label(t) {
      if (t === null)
        this.removeAttribute("label");
      else
        this.setAttribute("label", t);
    }
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
  var $i = `<div class="app-container" part="container">
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
  var Ri = `:host {
    display: block;
    height: 100vh;
    width: 100vw;
    overflow: hidden;

    --_sidebar-width: 260px;
    --_sidebar-collapsed-width: 0px;
    --_sidebar-bg: #f4f4f4;
    --_sidebar-border: #ddd;
    --_content-bg: #ffffff;
    --_content-padding: 2rem;
    --_focus-ring: var(--primary-base, #2563eb);
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

  class Xi extends s {
    _sidebar;
    _content;
    constructor() {
      super({ css: Ri, template: $i });
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
  var Zi = `<slot></slot>
`;
  var Ui = `:host {
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

  class Qi extends s {
    constructor() {
      super({ css: Ui, template: Zi });
    }
  }
  var Gi = `<aside class="sidebar" part="sidebar">
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
  var Ji = `:host {
    display: flex;
    flex-direction: column;
    width: 260px;
    height: 100vh;
    background-color: #ffffff;
    border-right: 1px solid var(--secondary-muted);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    box-sizing: border-box;
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
  var Wi = (t) => {
    if (!t)
      return [];
    return t.assignedElements({ flatten: true }).filter((e) => e instanceof HTMLElement && e.tagName.toLowerCase() === "w13c-lateral-menu-item" && !e.hasAttribute("disabled"));
  };
  var Yi = (t, e) => {
    let r = t.shadowRoot?.querySelector("slot:not([name])"), i = Wi(r);
    if (i.length === 0)
      return;
    let o = document.activeElement, n = i.findIndex((c) => c === o || c.contains(o)), a = -1;
    switch (e.key) {
      case "ArrowDown":
        a = n < 0 ? 0 : (n + 1) % i.length;
        break;
      case "ArrowUp":
        a = n < 0 ? i.length - 1 : (n - 1 + i.length) % i.length;
        break;
      case "Home":
        a = 0;
        break;
      case "End":
        a = i.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    let l = i[a];
    if (l)
      l.focus();
  };

  class Oi extends s {
    _sidebar;
    constructor() {
      super({ css: Ji, template: Gi });
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
    _onKey = (t) => Yi(this, t);
  }
  var to = `<a class="menu-item" part="item" tabindex="-1">
    <span class="icon-wrapper" part="icon">
        <slot name="icon"></slot>
    </span>
    <span class="label" part="label">
        <slot></slot>
    </span>
    <span class="badge" part="badge" id="badge-element"></span>
</a>
`;
  var eo = `:host {
    display: block;
    width: 100%;
    outline: none;
    --item-color: var(--secondary-base, oklch(50% 0.02 260));
    --item-color-active: var(--primary-base, oklch(60% 0.15 265));
    --item-bg-active: var(--primary-muted, oklch(95% 0.02 265));
    --item-contrasted: var(--primary-contrasted, oklch(98% 0.01 260));
    --icon-size: 20px;
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
  var ro = `.menu-item:hover {
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
  var St = (t, e) => {
    if (!t)
      return;
    if (e)
      t.setAttribute("href", e);
    else
      t.removeAttribute("href");
  };
  var It = (t, e) => {
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
      let i = new URL(r, window.location.href), n = new URL(window.location.href).pathname, a = i.pathname;
      if (a === "/" ? n === "/" : n === a || n.startsWith(a + "/"))
        t.setAttribute("active", ""), t.setAttribute("aria-current", "page"), e.classList.add("active");
      else
        t.removeAttribute("active"), t.removeAttribute("aria-current"), e.classList.remove("active");
    } catch {
      console.warn("Invalid href in LateralMenuItem:", r);
    }
  };
  var io = (t, e, r) => {
    if (t.hasAttribute("disabled"))
      return;
    if (r.key !== "Enter" && r.key !== " ")
      return;
    if (r.target !== t)
      return;
    r.preventDefault(), e?.click();
  };
  var ll = eo + ro;

  class oo extends s {
    _anchor;
    _badgeEl;
    constructor() {
      super({ css: ll, template: to });
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
      St(this._anchor, this.getAttribute("href")), It(this._badgeEl, this.getAttribute("badge")), qt(this, this._anchor), window.addEventListener("popstate", this._onPopstate), this.addEventListener("keydown", this._onKey);
    }
    disconnectedCallback() {
      window.removeEventListener("popstate", this._onPopstate), this.removeEventListener("keydown", this._onKey);
    }
    attributeChangedCallback(t, e, r) {
      if (!this._anchor)
        return;
      if (t === "href")
        St(this._anchor, r);
      if (t === "badge")
        It(this._badgeEl, r);
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
    _onKey = (t) => io(this, this._anchor, t);
  }
  var no = `<nav class="pagination" part="pagination" aria-label="Pagination">
    <button class="prev" part="prev" type="button" aria-label="Previous page">
        <slot name="prev">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
        </slot>
    </button>
    <ul class="pages" part="pages"></ul>
    <button class="next" part="next" type="button" aria-label="Next page">
        <slot name="next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        </slot>
    </button>
</nav>
`;
  var ao = `:host {
  display: inline-block;

  --_size: 32px;
  --_radius: 6px;
  --_color: var(--text-body, #4b5563);
  --_active-bg: var(--primary-base, #4361ee);
  --_active-color: white;
  --_hover-bg: var(--bg-base, #f1f5f9);
  --_border: var(--border-default, #e5e7eb);
  --_font-size: 13px;
}

.pagination {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.pages {
  display: inline-flex;
  list-style: none;
  padding: 0;
  margin: 0;
  gap: 0.25rem;
}

.page,
.prev,
.next {
  appearance: none;
  background: transparent;
  border: 1px solid var(--_border);
  color: var(--_color);
  cursor: pointer;
  min-width: var(--_size);
  height: var(--_size);
  padding: 0 0.5rem;
  border-radius: var(--_radius);
  font: inherit;
  font-size: var(--_font-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
}

.page:hover:not([aria-current="page"]):not(:disabled),
.prev:hover:not(:disabled),
.next:hover:not(:disabled) {
  background: var(--_hover-bg);
}

.page[aria-current="page"] {
  background: var(--_active-bg);
  color: var(--_active-color);
  border-color: var(--_active-bg);
  font-weight: 600;
}

.page:disabled,
.prev:disabled,
.next:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--_size);
  height: var(--_size);
  color: var(--text-muted, #9ca3af);
  user-select: none;
}

.prev svg,
.next svg {
  width: 14px;
  height: 14px;
}

.prev:focus-visible,
.next:focus-visible,
.page:focus-visible {
  outline: 2px solid var(--_active-bg);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: no-preference) {
  .page, .prev, .next { transition: background-color 0.15s, color 0.15s; }
}
`;
  var y = (t, e, r) => {
    let i = parseInt(t.getAttribute(e) ?? "", 10);
    return Number.isFinite(i) && i > 0 ? i : r;
  };
  var so = (t, e, r, i) => {
    let o = [], n = Math.max(1, t - r), a = Math.min(e, t + r), l = Array.from({ length: Math.min(i, e) }, (h, _) => _ + 1), c = Array.from({ length: Math.min(i, e) }, (h, _) => e - _).reverse(), p = [];
    for (let h = n;h <= a; h++)
      p.push(h);
    let u = Array.from(new Set([...l, ...p, ...c])).sort((h, _) => h - _), m = 0;
    for (let h of u) {
      if (m > 0 && h - m > 1)
        o.push("…");
      o.push(h), m = h;
    }
    return o;
  };
  var lo = (t, e, r, i) => {
    if (!e)
      return;
    let o = y(t, "page", 1), n = y(t, "total", 1), a = y(t, "siblings", 1), l = y(t, "boundary", 1);
    e.innerHTML = "";
    for (let c of so(o, n, a, l))
      if (c === "…") {
        let p = document.createElement("span");
        p.className = "ellipsis", p.setAttribute("part", "ellipsis"), p.textContent = "…", e.appendChild(p);
      } else {
        let p = document.createElement("li"), u = document.createElement("button");
        if (u.type = "button", u.className = "page", u.setAttribute("part", "page"), u.dataset.page = String(c), u.textContent = String(c), c === o)
          u.setAttribute("aria-current", "page");
        p.appendChild(u), e.appendChild(p);
      }
    if (r)
      r.disabled = o <= 1;
    if (i)
      i.disabled = o >= n;
  };
  var O = (t, e, r) => {
    if (r === e)
      return;
    if (!t.dispatchEvent(new CustomEvent("page-change", { bubbles: true, cancelable: true, detail: { page: r } })))
      return;
    t.setAttribute("page", String(r));
  };
  var co = (t, e) => {
    if (e <= 1)
      return;
    O(t, e, e - 1);
  };
  var po = (t, e, r) => {
    if (e >= r)
      return;
    O(t, e, e + 1);
  };
  var uo = (t, e, r) => {
    let i = r.target.closest(".page");
    if (!i)
      return;
    let o = Number(i.dataset.page);
    if (Number.isFinite(o))
      O(t, e, o);
  };

  class ho extends s {
    _pages;
    _prev;
    _next;
    static get observedAttributes() {
      return ["page", "total", "siblings", "boundary"];
    }
    constructor() {
      super({ css: ao, template: no });
      this._pages = this.shadowRoot?.querySelector(".pages") ?? null, this._prev = this.shadowRoot?.querySelector(".prev") ?? null, this._next = this.shadowRoot?.querySelector(".next") ?? null;
    }
    connectedCallback() {
      this._prev?.addEventListener("click", this._onPrev), this._next?.addEventListener("click", this._onNext), this._pages?.addEventListener("click", this._onPageClick), this._render();
    }
    disconnectedCallback() {
      this._prev?.removeEventListener("click", this._onPrev), this._next?.removeEventListener("click", this._onNext), this._pages?.removeEventListener("click", this._onPageClick);
    }
    attributeChangedCallback() {
      this._render();
    }
    get page() {
      return y(this, "page", 1);
    }
    set page(t) {
      this.setAttribute("page", String(t));
    }
    get total() {
      return y(this, "total", 1);
    }
    set total(t) {
      this.setAttribute("total", String(t));
    }
    _render() {
      lo(this, this._pages, this._prev, this._next);
    }
    _onPrev = () => co(this, this.page);
    _onNext = () => po(this, this.page, this.total);
    _onPageClick = (t) => uo(this, this.page, t);
  }
  var bo = `<div class="progress" part="progress" role="progressbar">
    <div class="track" part="track">
        <div class="bar" part="bar"></div>
    </div>
    <span class="label" part="label"><slot></slot></span>
</div>
`;
  var mo = `:host {
  display: block;

  --_height: 8px;
  --_radius: 999px;
  --_track: var(--bg-base, #f1f5f9);
  --_color: var(--primary-base, #4361ee);
  --_value: 0%;
  --_label-size: 12px;
}

:host([size="sm"]) { --_height: 4px; }
:host([size="md"]) { --_height: 8px; }
:host([size="lg"]) { --_height: 12px; }

:host([color="danger"])  { --_color: var(--danger-base); }
:host([color="success"]) { --_color: var(--success-base); }
:host([color="info"])    { --_color: var(--info-base); }
:host([color="warning"]) { --_color: var(--warning-base); }

.progress {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.track {
  flex: 1;
  height: var(--_height);
  background: var(--_track);
  border-radius: var(--_radius);
  overflow: hidden;
  position: relative;
}

.bar {
  height: 100%;
  width: var(--_value);
  background: var(--_color);
  border-radius: inherit;
}

@media (prefers-reduced-motion: no-preference) {
  .bar { transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
}

:host([indeterminate]) .bar {
  width: 40%;
  position: absolute;
  inset-block: 0;
  animation: progress-indeterminate 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes progress-indeterminate {
  0%   { left: -40%; }
  100% { left: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  :host([indeterminate]) .bar {
    animation-duration: 3s;
  }
}

.label {
  font-size: var(--_label-size);
  color: var(--text-muted, #6b7280);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.label:has(slot:not(:has(*))) {
  display: none;
}

:host([show-value]) .label::before {
  content: attr(data-value-text);
  display: inline;
}
`;

  class go extends s {
    _bar;
    _label;
    _root;
    static get observedAttributes() {
      return ["value", "max", "indeterminate"];
    }
    constructor() {
      super({ css: mo, template: bo });
      this._bar = this.shadowRoot?.querySelector(".bar") ?? null, this._label = this.shadowRoot?.querySelector(".label") ?? null, this._root = this.shadowRoot?.querySelector(".progress") ?? null;
    }
    connectedCallback() {
      for (let t of ["value", "max"])
        d(this, t);
      this._sync();
    }
    attributeChangedCallback(t, e, r) {
      this._sync();
    }
    _sync() {
      let t = this.hasAttribute("indeterminate"), e = this._parseNumber(this.getAttribute("max"), 100), r = this._parseNumber(this.getAttribute("value"), 0), i = Math.max(0, Math.min(r, e)), o = e > 0 ? i / e * 100 : 0;
      if (t)
        this._root?.removeAttribute("aria-valuenow"), this._root?.setAttribute("aria-valuemin", "0"), this._root?.setAttribute("aria-valuemax", "100");
      else
        this._root?.setAttribute("aria-valuenow", String(i)), this._root?.setAttribute("aria-valuemin", "0"), this._root?.setAttribute("aria-valuemax", String(e)), this.style.setProperty("--_value", `${o}%`);
      if (this._label)
        this._label.dataset.valueText = `${Math.round(o)}%`;
    }
    _parseNumber(t, e) {
      if (t === null)
        return e;
      let r = Number(t);
      return Number.isFinite(r) ? r : e;
    }
    get value() {
      return this._parseNumber(this.getAttribute("value"), 0);
    }
    set value(t) {
      this.setAttribute("value", String(t));
    }
    get max() {
      return this._parseNumber(this.getAttribute("max"), 100);
    }
    set max(t) {
      this.setAttribute("max", String(t));
    }
    get indeterminate() {
      return this.hasAttribute("indeterminate");
    }
    set indeterminate(t) {
      if (t)
        this.setAttribute("indeterminate", "");
      else
        this.removeAttribute("indeterminate");
    }
  }
  var fo = `<div class="skeleton" part="skeleton" aria-hidden="true"></div>
`;
  var vo = `:host {
  display: block;

  --_bg: var(--bg-base, #f1f5f9);
  --_highlight: var(--border-light, #e5e7eb);
  --_radius: 6px;
  --_height: 1em;
  --_width: 100%;
}

:host([shape="circle"]) {
  --_radius: 50%;
  --_height: 2.5rem;
  --_width: 2.5rem;
  display: inline-block;
}

:host([shape="rect"]) {
  --_radius: 8px;
  --_height: 8rem;
}

:host([shape="text"]) {
  --_height: 0.85em;
  --_radius: 4px;
}

.skeleton {
  width: var(--_width);
  height: var(--_height);
  border-radius: var(--_radius);
  background: linear-gradient(90deg, var(--_bg) 0%, var(--_highlight) 50%, var(--_bg) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: var(--_bg);
  }
}
`;

  class xo extends s {
    static get observedAttributes() {
      return ["width", "height"];
    }
    constructor() {
      super({ css: vo, template: fo });
    }
    connectedCallback() {
      this._syncSize();
    }
    attributeChangedCallback(t, e, r) {
      if (t === "width" || t === "height")
        this._syncSize();
    }
    _syncSize() {
      let t = this.getAttribute("width"), e = this.getAttribute("height");
      if (t !== null)
        this.style.setProperty("--_width", this._normalize(t));
      else
        this.style.removeProperty("--_width");
      if (e !== null)
        this.style.setProperty("--_height", this._normalize(e));
      else
        this.style.removeProperty("--_height");
    }
    _normalize(t) {
      return /^\d+(\.\d+)?$/.test(t) ? `${t}px` : t;
    }
  }
  var _o = `<div class="spinner" part="spinner" role="status" aria-live="polite">
    <span class="visually-hidden"><slot>Loading…</slot></span>
</div>
`;
  var yo = `:host {
  display: inline-block;

  --_size: 1.25rem;
  --_thickness: 2px;
  --_track: var(--border-default, #e5e7eb);
  --_color: var(--text-main, currentColor);
  --_speed: 0.8s;
}

:host([size="sm"]) { --_size: 0.875rem; --_thickness: 2px; }
:host([size="md"]) { --_size: 1.25rem;  --_thickness: 2px; }
:host([size="lg"]) { --_size: 1.75rem;  --_thickness: 3px; }
:host([size="xl"]) { --_size: 2.5rem;   --_thickness: 4px; }

:host([color="primary"]) { --_color: var(--primary-base); }
:host([color="danger"])  { --_color: var(--danger-base); }
:host([color="success"]) { --_color: var(--success-base); }
:host([color="info"])    { --_color: var(--info-base); }
:host([color="warning"]) { --_color: var(--warning-base); }

.spinner {
  width: var(--_size);
  height: var(--_size);
  border-radius: 50%;
  border: var(--_thickness) solid var(--_track);
  border-top-color: var(--_color);
  box-sizing: border-box;
  animation: spin var(--_speed) linear infinite;
}

.visually-hidden {
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

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2.4s; }
}
`;

  class wo extends s {
    constructor() {
      super({ css: yo, template: _o });
    }
  }
  var ko = `<ol class="stepper" part="stepper">
    <slot></slot>
</ol>
`;
  var Eo = `:host {
  display: block;

  --_active: var(--primary-base, #4361ee);
  --_completed: var(--success-base, #10b981);
  --_pending: var(--border-default, #d1d5db);
  --_text: var(--text-main, #1f2937);
  --_muted: var(--text-muted, #6b7280);
}

.stepper {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: stretch;
  gap: 0;
}

:host([orientation="vertical"]) .stepper {
  flex-direction: column;
  gap: 0;
}
`;

  class Ao extends s {
    static get observedAttributes() {
      return ["current", "orientation"];
    }
    constructor() {
      super({ css: Eo, template: ko });
    }
    connectedCallback() {
      this._sync();
    }
    attributeChangedCallback(t, e, r) {
      this._sync();
    }
    get current() {
      let t = parseInt(this.getAttribute("current") ?? "", 10);
      return Number.isFinite(t) ? t : 0;
    }
    set current(t) {
      this.setAttribute("current", String(t));
    }
    _steps() {
      return Array.from(this.querySelectorAll("p9r-step"));
    }
    _sync() {
      let t = this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal", e = this.current, r = this._steps();
      r.forEach((i, o) => {
        if (i.setAttribute("data-index", String(o + 1)), i.setAttribute("orientation", t), o === r.length - 1)
          i.setAttribute("last", "");
        else
          i.removeAttribute("last");
        if (i.hasAttribute("state"))
          return;
        if (o < e)
          i.setAttribute("data-state", "completed");
        else if (o === e)
          i.setAttribute("data-state", "active");
        else
          i.setAttribute("data-state", "pending");
      });
    }
  }
  var Lo = `<li class="step" part="step">
    <div class="indicator" part="indicator">
        <span class="bullet" part="bullet">
            <span class="number"></span>
            <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </span>
        <span class="connector" part="connector"></span>
    </div>
    <div class="body" part="body">
        <span class="label" part="label"></span>
        <span class="description" part="description">
            <slot></slot>
        </span>
    </div>
</li>
`;
  var Co = `:host {
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
  var Mo = `:host([data-state="active"], [state="active"]) {
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
  var wl = Co + Mo;

  class Ho extends s {
    _label;
    _number;
    _description;
    _descriptionSlot;
    static get observedAttributes() {
      return ["label", "data-index"];
    }
    constructor() {
      super({ css: wl, template: Lo });
      this._label = this.shadowRoot?.querySelector(".label") ?? null, this._number = this.shadowRoot?.querySelector(".number") ?? null, this._description = this.shadowRoot?.querySelector(".description") ?? null, this._descriptionSlot = this.shadowRoot?.querySelector(".description slot") ?? null;
    }
    connectedCallback() {
      this._sync(), this._descriptionSlot?.addEventListener("slotchange", this._syncDescription), this._syncDescription();
    }
    disconnectedCallback() {
      this._descriptionSlot?.removeEventListener("slotchange", this._syncDescription);
    }
    attributeChangedCallback(t, e, r) {
      this._sync();
    }
    _syncDescription = () => {
      if (!this._description || !this._descriptionSlot)
        return;
      let t = this._descriptionSlot.assignedNodes({ flatten: true }).some((e) => e.nodeType === Node.ELEMENT_NODE || (e.textContent ?? "").trim() !== "");
      this._description.classList.toggle("is-empty", !t);
    };
    _sync() {
      if (this._label)
        this._label.textContent = this.getAttribute("label") ?? "";
      if (this._number)
        this._number.textContent = this.getAttribute("data-index") ?? "";
    }
  }
  var To = `<div class="table-container">
  <div class="p9r-table">
    <slot name="header"></slot>
    <slot></slot>
  </div>
</div>`;
  var zo = `:host {
  display: block;
  width: 100%;
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
}`;

  class So extends s {
    constructor() {
      super({ css: zo, template: To });
    }
  }
  var Io = `<slot></slot>
`;
  var qo = `:host {
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

  class Fo extends s {
    constructor() {
      super({ css: qo, template: Io });
    }
    connectedCallback() {
      if (!this.hasAttribute("role"))
        this.setAttribute("role", "cell");
    }
  }
  var Po = `<div class="header-wrapper" part="wrapper">
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
  var Bo = `:host {
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
  color: #ccc;
}

.filter-popover {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  background: var(--bg-surface, white);
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
  var Ko = `:host([sort]) .label-section {
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
  var Tl = (t) => {
    let e = t.getAttribute("filter-name");
    if (!e)
      return "";
    return new URL(window.location.href).searchParams.get(`f_${e}`) ?? "";
  };
  var Ft = (t, e, r) => {
    let i = t.getAttribute("filter-name");
    if (!e)
      return;
    if (!i) {
      e.setAttribute("hidden", ""), t.removeAttribute("data-has-filter");
      return;
    }
    e.removeAttribute("hidden");
    let o = Tl(t);
    if (r)
      r.value = o;
    if (o)
      t.setAttribute("data-has-filter", "");
    else
      t.removeAttribute("data-has-filter");
  };
  var Do = (t) => {
    let e = t.getAttribute("sort");
    if (!e)
      return;
    let r = new URL(window.location.href), i = r.searchParams.get("sort"), o = r.searchParams.get("direction"), n = i === e && o === "asc" ? "desc" : "asc";
    r.searchParams.set("sort", e), r.searchParams.set("direction", n), window.location.href = r.toString();
  };
  var jo = (t, e) => {
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
  var Vo = (t, e) => {
    if (e.composedPath().some((r) => r instanceof HTMLInputElement))
      return;
    Do(t);
  };
  var No = (t, e, r, i) => {
    if (t.stopPropagation(), !r || !e)
      return;
    if (r.hasAttribute("hidden"))
      r.removeAttribute("hidden"), e.setAttribute("aria-expanded", "true"), i?.focus();
    else
      r.setAttribute("hidden", ""), e.setAttribute("aria-expanded", "false");
  };
  var $o = (t, e, r) => {
    if (r.key !== "Enter" || !e)
      return;
    jo(t, e.value);
  };
  var Ro = (t, e) => {
    e?.setAttribute("hidden", ""), t?.setAttribute("aria-expanded", "false");
  };
  var zl = Bo + Ko;

  class Xo extends s {
    _sortTrigger;
    _filterBtn;
    _filterPopover;
    _filterInput;
    static get observedAttributes() {
      return ["sort", "filter-name"];
    }
    constructor() {
      super({ css: zl, template: Po });
      this._sortTrigger = this.shadowRoot?.querySelector("#sort-trigger") ?? null, this._filterBtn = this.shadowRoot?.querySelector("#filter-btn") ?? null, this._filterPopover = this.shadowRoot?.querySelector("#filter-popover") ?? null, this._filterInput = this.shadowRoot?.querySelector("#filter-input") ?? null;
    }
    connectedCallback() {
      Ft(this, this._filterBtn, this._filterInput), this._sortTrigger?.addEventListener("click", this._onSort), this._filterBtn?.addEventListener("click", this._onFilterToggle), this._filterPopover?.addEventListener("click", this._stopPropagation), this._filterInput?.addEventListener("keydown", this._onFilterKey), window.addEventListener("click", this._onWindowClick);
    }
    disconnectedCallback() {
      this._sortTrigger?.removeEventListener("click", this._onSort), this._filterBtn?.removeEventListener("click", this._onFilterToggle), this._filterPopover?.removeEventListener("click", this._stopPropagation), this._filterInput?.removeEventListener("keydown", this._onFilterKey), window.removeEventListener("click", this._onWindowClick);
    }
    attributeChangedCallback() {
      Ft(this, this._filterBtn, this._filterInput);
    }
    _onSort = (t) => Vo(this, t);
    _onFilterToggle = (t) => No(t, this._filterBtn, this._filterPopover, this._filterInput);
    _onFilterKey = (t) => $o(this, this._filterInput, t);
    _onWindowClick = () => Ro(this._filterBtn, this._filterPopover);
    _stopPropagation = (t) => t.stopPropagation();
  }
  var Zo = `<slot></slot>
`;
  var Uo = `:host {
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
  var Pt = (t) => {
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
  var Qo = (t) => {
    if (!t.hasAttribute("href"))
      return;
    Pt(t);
  };
  var Go = (t, e) => {
    if (!t.hasAttribute("href"))
      return;
    if (e.key === "Enter" || e.key === " ")
      e.preventDefault(), Pt(t);
  };
  var Bt = (t) => {
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

  class Jo extends s {
    static get observedAttributes() {
      return ["href"];
    }
    constructor() {
      super({ css: Uo, template: Zo });
    }
    connectedCallback() {
      for (let t of ["href", "target"])
        d(this, t);
      this.addEventListener("click", this._onClick), this.addEventListener("keydown", this._onKey), Bt(this);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._onClick), this.removeEventListener("keydown", this._onKey);
    }
    attributeChangedCallback(t) {
      if (t === "href")
        Bt(this);
    }
    _onClick = () => Qo(this);
    _onKey = (t) => Go(this, t);
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
  var Wo = `<div class="tabs" part="tabs">
    <div class="tablist" part="tablist" role="tablist"></div>
    <div class="panels" part="panels">
        <slot></slot>
    </div>
</div>
`;
  var Yo = `:host {
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
  var Oo = `:host([variant="pills"]) .tablist {
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
  var Bl = 0;
  var tn = () => `tabpanel-${Bl++}`;
  var en = (t, e) => {
    t.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { active: e } }));
  };
  var Dt = (t, e, r) => {
    if (!e)
      return;
    e.innerHTML = "";
    let i = Kt(r), o = t.getAttribute("active");
    if (!o && i.length > 0)
      o = i[0]?.getAttribute("id") ?? null;
    if (i.forEach((n, a) => {
      let l = n.getAttribute("id") ?? tn();
      if (!n.id)
        n.id = l;
      let c = n.getAttribute("label") ?? `Tab ${a + 1}`, p = document.createElement("button");
      if (p.type = "button", p.className = "tab", p.setAttribute("part", "tab"), p.setAttribute("role", "tab"), p.setAttribute("id", `tab-${l}`), p.setAttribute("aria-controls", l), p.dataset.target = l, p.textContent = c, n.hasAttribute("disabled"))
        p.setAttribute("disabled", "");
      e.appendChild(p), n.setAttribute("role", "tabpanel"), n.setAttribute("aria-labelledby", `tab-${l}`);
    }), o)
      z(t, e, r, o);
  };
  var z = (t, e, r, i) => {
    let o = Kt(r), n = Array.from(e?.querySelectorAll(".tab") ?? []), a = false;
    if (o.forEach((l) => {
      let c = l.id === i;
      if (c)
        a = true;
      l.toggleAttribute("hidden", !c);
    }), n.forEach((l) => {
      let c = l.dataset.target === i;
      l.setAttribute("aria-selected", String(c)), l.setAttribute("tabindex", c ? "0" : "-1");
    }), a && t.getAttribute("active") !== i)
      t.setAttribute("active", i), en(t, i);
  };
  var rn = (t, e, r, i) => {
    let o = i.target.closest(".tab");
    if (!o || o.hasAttribute("disabled"))
      return;
    let n = o.dataset.target;
    if (n)
      z(t, e, r, n);
  };
  var on = (t, e, r, i) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(i.key))
      return;
    let o = Array.from(e?.querySelectorAll(".tab:not([disabled])") ?? []);
    if (o.length === 0)
      return;
    let n = o.findIndex((u) => u === document.activeElement), a = n === -1 ? 0 : n, l = a;
    if (i.key === "ArrowLeft")
      l = (a - 1 + o.length) % o.length;
    if (i.key === "ArrowRight")
      l = (a + 1) % o.length;
    if (i.key === "Home")
      l = 0;
    if (i.key === "End")
      l = o.length - 1;
    i.preventDefault();
    let c = o[l];
    if (!c)
      return;
    let p = c.dataset.target;
    if (p)
      z(t, e, r, p);
    c.focus();
  };
  var Kl = Yo + Oo;

  class nn extends s {
    _tablist;
    _slot;
    static get observedAttributes() {
      return ["active"];
    }
    constructor() {
      super({ css: Kl, template: Wo });
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
    _onClick = (t) => rn(this, this._tablist, this._slot, t);
    _onKey = (t) => on(this, this._tablist, this._slot, t);
  }
  var an = `<div class="panel" part="panel">
    <slot></slot>
</div>
`;
  var sn = `:host {
  display: block;
}

:host([hidden]) { display: none; }

.panel {
  outline: none;
}
`;

  class ln extends s {
    constructor() {
      super({ css: sn, template: an });
    }
  }
  var dn = `<span class="label" part="label"><slot></slot></span>
<button type="button" class="remove" part="remove" aria-label="Remove" hidden>&times;</button>
`;
  var cn = `:host {
    --_tag-font-family: ui-monospace, SFMono-Regular, Menlo, monospace;

    --_tag-bg: var(--info-muted, oklch(95% 0.02 230));
    --_tag-color: var(--text-body, oklch(45% 0.02 265));
    --_tag-border: var(--border-default, oklch(90% 0.02 265));

    --_tag-fs: 12px;
    --_tag-padding: 2px 8px;
    --_tag-radius: 6px;
    --_tag-gap: 4px;

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
  var pn = `:host([color="info"]) {
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
  var Rl = cn + pn;

  class un extends s {
    _removeBtn;
    static get observedAttributes() {
      return ["removable"];
    }
    constructor() {
      super({ css: Rl, template: dn });
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
  var hn = `<div class="icon" part="icon"></div>
<div class="content">
    <span class="message"><slot></slot></span>
</div>
<button class="close" aria-label="Dismiss">&times;</button>
`;
  var bn = `:host {
    --_bg: var(--bg-surface, #ffffff);
    --_color: var(--text-main, #1f2937);
    --_border: var(--border-default, #e5e7eb);
    --_accent: var(--info-base, #3b82f6);

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
    content: "";
    position: absolute;
    inset: 0;
    display: block;
    background: no-repeat center / 12px 12px;
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
  var mn = `:host([leaving]) {
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
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>');
}

:host([type="error"]) .icon::before,
:host([type="warning"]) .icon::before {
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>');
}

:host([type="info"]) .icon::before {
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>');
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
  var Ql = bn + mn;

  class gn extends s {
    _timer = null;
    constructor() {
      super({ css: Ql, template: hn });
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
  var fn = `<slot></slot>
`;
  var vn = `:host {
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

  class xn extends s {
    constructor() {
      super({ css: vn, template: fn });
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
  var v = null;
  function Wl() {
    if (v && v.isConnected)
      return v;
    if (v = document.querySelector("p9r-toast-stack"), v)
      return v;
    return v = document.createElement("p9r-toast-stack"), document.body.appendChild(v), v;
  }
  function Yl(t, e = {}) {
    return Wl().push(t, e);
  }
  var _n = `<div class="trigger" part="trigger">
    <slot></slot>
</div>
<div class="tooltip" part="tooltip" role="tooltip" aria-hidden="true">
    <slot name="content"></slot>
    <span class="text"></span>
</div>
`;
  var yn = `:host {
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
  var wn = `:host([position="bottom"]) .tooltip {
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
  var rd = yn + wn;

  class kn extends s {
    _tooltip;
    _text;
    _showTimer = null;
    _hideTimer = null;
    static get observedAttributes() {
      return ["text"];
    }
    constructor() {
      super({ css: rd, template: _n });
      this._tooltip = this.shadowRoot?.querySelector(".tooltip") ?? null, this._text = this.shadowRoot?.querySelector(".text") ?? null;
    }
    connectedCallback() {
      this._syncText(), this.addEventListener("mouseenter", this._show), this.addEventListener("mouseleave", this._hide), this.addEventListener("focusin", this._show), this.addEventListener("focusout", this._hide);
    }
    disconnectedCallback() {
      if (this.removeEventListener("mouseenter", this._show), this.removeEventListener("mouseleave", this._hide), this.removeEventListener("focusin", this._show), this.removeEventListener("focusout", this._hide), this._showTimer)
        clearTimeout(this._showTimer);
      if (this._hideTimer)
        clearTimeout(this._hideTimer);
    }
    attributeChangedCallback(t, e, r) {
      if (t === "text")
        this._syncText();
    }
    _syncText() {
      if (this._text)
        this._text.textContent = this.getAttribute("text") ?? "";
    }
    _show = () => {
      if (this._hideTimer)
        clearTimeout(this._hideTimer), this._hideTimer = null;
      let t = Number(this.getAttribute("delay") ?? 100);
      this._showTimer = setTimeout(() => {
        this.setAttribute("open", ""), this._tooltip?.setAttribute("aria-hidden", "false");
      }, t);
    };
    _hide = () => {
      if (this._showTimer)
        clearTimeout(this._showTimer), this._showTimer = null;
      this._hideTimer = setTimeout(() => {
        this.removeAttribute("open"), this._tooltip?.setAttribute("aria-hidden", "true");
      }, 80);
    };
  }
  function tt(t) {
    let e = new URL(t, window.location.href);
    for (let [r, i] of new URLSearchParams(window.location.search))
      e.searchParams.append(r, i);
    return e;
  }
  async function S(t) {
    try {
      let e = await fetch(tt(t), { headers: { Accept: "application/json" } });
      return e.ok ? await e.json() : null;
    } catch {
      return null;
    }
  }
  var id = new Intl.NumberFormat("fr-FR");
  var od = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  var x = (t) => t.replace(/[&<>"]/g, (e) => e === "&" ? "&amp;" : e === "<" ? "&lt;" : e === ">" ? "&gt;" : "&quot;");
  var nd = (t) => t >= 1e6 ? `${(t / 1e6).toFixed(1)}M` : t >= 1000 ? `${(t / 1000).toFixed(1)}k` : String(Math.round(t));
  function jt(t, e) {
    if (e === "ms")
      return `${Math.round(t)} ms`;
    if (e === "pct")
      return `${(t * 100).toFixed(1).replace(".", ",")} %`;
    return id.format(Math.round(t));
  }
  var En = (t) => {
    let e = new Date(t);
    return Number.isNaN(e.getTime()) ? t : od.format(e);
  };
  function et(t, e) {
    return `<div class="empty"><svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><p class="empty-title">${x(t)}</p>${e ? `<p class="empty-hint">${x(e)}</p>` : ""}</div>`;
  }
  function An(t) {
    if (t.length === 0)
      return "";
    let e = 320, r = 140, i = 32, o = 8, n = 10, a = 22, l = e - i - o, c = r - n - a, p = n + c, u = Math.max(...t.map((k) => k.value), 1), m = t.length, h = t.map((k, P) => [i + (m === 1 ? l / 2 : P / (m - 1) * l), n + (1 - k.value / u) * c]), _ = h.map(([k, P]) => `${k.toFixed(1)},${P.toFixed(1)}`).join(" "), aa = `${h[0][0].toFixed(1)},${p} ${_} ${h[m - 1][0].toFixed(1)},${p}`, sa = h.map(([k, P]) => `<circle class="dot" cx="${k.toFixed(1)}" cy="${P.toFixed(1)}" r="2.5"/>`).join("");
    return `<svg class="line" viewBox="0 0 ${e} ${r}" role="img"><defs><linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1"><stop class="grad-top" offset="0%"/><stop class="grad-bottom" offset="100%"/></linearGradient></defs><line class="axis" x1="${i}" y1="${n}" x2="${i}" y2="${p}"/><line class="axis" x1="${i}" y1="${p}" x2="${e - o}" y2="${p}"/><text class="tick" x="${i - 4}" y="${n + 3}" text-anchor="end">${nd(u)}</text><text class="tick" x="${i - 4}" y="${p}" text-anchor="end">0</text><polygon class="area" points="${aa}" fill="url(#lc-grad)"/><polyline class="stroke" points="${_}"/>${sa}<text class="tick" x="${i}" y="${r - 6}">${x(t[0].label)}</text><text class="tick" x="${e - o}" y="${r - 6}" text-anchor="end">${x(t[m - 1].label)}</text></svg>`;
  }
  function Ln(t, e) {
    if (t.length === 0)
      return "";
    let r = t.reduce((i, o) => i + o.value, 0) || 1;
    return t.map((i) => {
      let o = i.value / r * 100, n = `${o.toFixed(1).replace(".", ",")} %`;
      return `<div class="bar"><span class="bar-key" title="${x(i.label)}">${x(i.label)}</span><svg class="bar-svg" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect height="8" width="${o.toFixed(1)}"/></svg><span class="bar-val">${e ? `${jt(i.value, "int")} · ${n}` : n}</span></div>`;
    }).join("");
  }
  var Cn = `<div class="stat">
    <span class="label"></span>
    <strong class="value">—</strong>
    <span class="note"></span>
</div>
`;
  var Mn = `:host {
    display: block;
    flex: 1 1 0;
    min-width: 0;
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

  class Hn extends s {
    constructor() {
      super({ css: Mn, template: Cn });
    }
    connectedCallback() {
      let t = this.shadowRoot;
      t.querySelector(".label").textContent = this.getAttribute("label") ?? "", this._load(t);
    }
    async _load(t) {
      let e = t.querySelector(".value"), r = t.querySelector(".note"), i = this.getAttribute("url"), o = i ? await S(i) : null, n = o && typeof o === "object" ? o[this.getAttribute("field") ?? "value"] : undefined;
      if (n === undefined || n === null) {
        e.textContent = "—", e.classList.add("is-empty"), r.textContent = this.getAttribute("empty") ?? "Aucune donnée";
        return;
      }
      e.classList.remove("is-empty"), e.textContent = jt(Number(n), this.getAttribute("format") ?? "int"), r.textContent = "";
    }
  }
  var Tn = `<div class="chart"></div>
`;
  var zn = `:host {
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

  class Sn extends s {
    constructor() {
      super({ css: zn, template: Tn });
    }
    connectedCallback() {
      this._load();
    }
    async _load() {
      let t = this.shadowRoot.querySelector(".chart"), e = this.getAttribute("url"), r = e ? await S(e) : null, i = Array.isArray(r) ? r : [];
      if (i.length === 0) {
        t.innerHTML = et(this.getAttribute("empty-title") ?? "Aucune donnée à afficher", this.getAttribute("empty-hint") ?? undefined);
        return;
      }
      let o = this.getAttribute("value") ?? "value", n = this.getAttribute("x") ?? "", a = i.map((l) => ({ label: n ? En(String(l[n] ?? "")) : "", value: Number(l[o] ?? 0) }));
      t.innerHTML = An(a);
    }
  }
  var In = `<div class="list"></div>
`;
  var qn = `:host {
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

  class Fn extends s {
    constructor() {
      super({ css: qn, template: In });
    }
    connectedCallback() {
      this._load();
    }
    async _load() {
      let t = this.shadowRoot.querySelector(".list"), e = this.getAttribute("url"), r = e ? await S(e) : null, i = Array.isArray(r) ? r : [];
      if (i.length === 0) {
        t.innerHTML = et(this.getAttribute("empty") ?? "Aucune donnée");
        return;
      }
      let o = this.getAttribute("label-field") ?? "key", n = this.getAttribute("value-field") ?? "value", a = i.map((l) => ({ label: String(l[o] ?? ""), value: Number(l[n] ?? 0) }));
      t.innerHTML = Ln(a, this.hasAttribute("show-count"));
    }
  }
  var Pn = `<div class="tabs" role="group" aria-label="Période"></div>
`;
  var Bn = `:host {
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
    color: #fff;
}
`;

  class Kn extends s {
    constructor() {
      super({ css: Bn, template: Pn });
    }
    connectedCallback() {
      let t = this.getAttribute("param") ?? "range", e = new URLSearchParams(window.location.search).get(t) ?? this.getAttribute("default") ?? "", r = (this.getAttribute("tabs") ?? "").split(",").map((o) => o.split(":")).filter((o) => o[0]), i = this.shadowRoot.querySelector(".tabs");
      i.innerHTML = r.map(([o, n]) => `<button type="button" data-v="${x(o)}"${o === e ? ' class="active"' : ""}>${x(n ?? o)}</button>`).join(""), i.addEventListener("click", (o) => {
        let n = o.target.closest("button")?.dataset.v;
        if (!n)
          return;
        let a = new URL(window.location.href);
        a.searchParams.set(t, n), window.location.assign(a.toString());
      });
    }
  }
  function Dn(t, e) {
    if (t.key !== "Enter")
      return;
    if (t.target.tagName === "TEXTAREA")
      return;
    t.preventDefault(), e.requestSubmit();
  }
  async function Vt(t, e) {
    t.preventDefault();
    let r = t.target, i = new FormData(r), o = Object.fromEntries(i.entries()), n = await fetch(tt(e.target), { method: e.method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }), a = await n.json().catch(() => null), l = { status: n.status, body: a };
    if (n.ok) {
      if (r.reset(), e.dispatchEvent(new CustomEvent("form:success", { bubbles: true, composed: true, detail: l })), e.emit)
        document.dispatchEvent(new CustomEvent(e.emit, { bubbles: true, composed: true, detail: l }));
      if (e.redirect)
        window.location.href = e.redirect;
    } else
      e.dispatchEvent(new CustomEvent("form:failed", { bubbles: true, composed: true, detail: l }));
  }

  class jn extends HTMLElement {
    _nativeForm = null;
    static get observedAttributes() {
      return ["redirect", "target", "method", "emit"];
    }
    _handleInternalSubmit = (t) => {
      Vt(t, this);
    };
    _handleKeydown = (t) => {
      Dn(t, this._nativeForm);
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
    attributeChangedCallback(t, e, r) {}
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
  async function $n(t, e) {
    let r;
    try {
      r = await fetch(t, { headers: { Accept: "application/json" }, signal: e });
    } catch (o) {
      return Vn(o) ? { kind: "aborted" } : { kind: "error", status: null, message: Nn(o) };
    }
    if (!r.ok)
      return { kind: "error", status: r.status, message: `HTTP ${r.status}` };
    let i;
    try {
      i = await r.text();
    } catch (o) {
      return Vn(o) ? { kind: "aborted" } : { kind: "error", status: r.status, message: Nn(o) };
    }
    if (i.trim() === "")
      return { kind: "success", data: null };
    try {
      return { kind: "success", data: JSON.parse(i) };
    } catch {
      return { kind: "error", status: r.status, message: "Invalid JSON response" };
    }
  }
  function Vn(t) {
    return t?.name === "AbortError";
  }
  function Nn(t) {
    return t instanceof Error ? t.message : String(t);
  }
  var bd = { found: false, value: undefined };
  function $(t, e) {
    if (e === ".")
      return { found: true, value: t.value };
    if (e === "value")
      return { found: true, value: md(t) };
    let r = e.indexOf("."), i = r === -1 ? e : e.slice(0, r), o = r === -1 ? "" : e.slice(r + 1);
    for (let n = t;n; n = n.parent) {
      if (n.vars && i in n.vars)
        return { found: true, value: Rn(n.vars[i], o) };
      let a = n.value;
      if (Xn(a) && i in a)
        return { found: true, value: Rn(a[i], o) };
    }
    return bd;
  }
  function md(t) {
    let e = t.value;
    if (Xn(e) && "value" in e)
      return e.value;
    return e;
  }
  function Rn(t, e) {
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
  function Xn(t) {
    return t !== null && typeof t === "object";
  }
  var gd = /\{\{\s*([\w.]+)(?:\s*\|\s*(\w+))?\s*\}\}/g;
  function Nt(t, e, r = {}) {
    return t.replace(gd, (i, o, n) => {
      let a = $(e, o);
      if (!a.found)
        return "";
      let l = n ? r[n] : undefined, c = l ? l(a.value) : a.value;
      return c == null ? "" : String(c);
    });
  }
  var rt = "cms-repeat";
  var fd = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
  function Zn(t) {
    let e = t.match(fd);
    if (e)
      return { path: e[1], name: e[2] };
    return { path: t.trim() };
  }
  var g = "cms-source";
  function $t(t, e, r = {}) {
    if (t.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      Qn(t, e, r);
      return;
    }
    Un(t, e, r, true);
  }
  function Un(t, e, r, i) {
    if (t.nodeType === Node.TEXT_NODE) {
      let n = t.nodeValue ?? "", a = Nt(n, e, r);
      if (a !== n)
        t.nodeValue = a;
      return;
    }
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let o = t;
    for (let n of Array.from(o.attributes)) {
      let a = Nt(n.value, e, r);
      if (a !== n.value)
        o.setAttribute(n.name, a);
    }
    if (!i && (o.hasAttribute(g) || o.localName === "cms-binding-core"))
      return;
    if (xd(o, e))
      return;
    Qn(o, e, r);
  }
  var vd = /^\{\{\s*([\w.]+)\s*\|\s*innerHTML\s*\}\}$/;
  function xd(t, e) {
    if (t.childNodes.length !== 1)
      return false;
    let r = t.firstChild;
    if (r.nodeType !== Node.TEXT_NODE)
      return false;
    let i = (r.nodeValue ?? "").trim().match(vd);
    if (!i)
      return false;
    let o = $(e, i[1]), n = (t.ownerDocument ?? document).createElement("template");
    return n.innerHTML = o.found && o.value != null ? String(o.value) : "", t.replaceWith(n.content), true;
  }
  function Qn(t, e, r) {
    for (let i of Array.from(t.childNodes))
      if (i.nodeType === Node.ELEMENT_NODE && i.hasAttribute(rt))
        _d(i, e, r);
      else
        Un(i, e, r, false);
  }
  function _d(t, e, r) {
    let i = t.parentNode;
    if (!i)
      return;
    let o = Zn(t.getAttribute(rt) ?? ""), n = $(e, o.path), a = document.createComment(`cms-repeat ${o.path}`);
    if (i.replaceChild(a, t), !Array.isArray(n.value)) {
      if (n.found && n.value != null)
        console.warn(`cms-repeat="${o.path}" expected an array, got`, n.value);
      return;
    }
    for (let l of n.value) {
      let c = t.cloneNode(true);
      c.removeAttribute(rt);
      let p = o.name ? { vars: { [o.name]: l }, parent: e } : { value: l, parent: e };
      $t(c, p, r), i.insertBefore(c, a);
    }
  }
  var Gn = "cms-slot";
  var yd = ["loading", "error", "empty"];
  function Jn(t) {
    let e = {}, r = document.createDocumentFragment(), i = document.createDocumentFragment();
    for (let o of Array.from(t.childNodes)) {
      i.appendChild(kd(o));
      let n = wd(o);
      if (!n) {
        if (o.nodeType === Node.ELEMENT_NODE && o.tagName === "TEMPLATE")
          r.appendChild(o.content), o.remove();
        else
          r.appendChild(o);
        continue;
      }
      if (o.removeAttribute(Gn), e[n])
        o.parentNode?.removeChild(o);
      else {
        let a = document.createDocumentFragment();
        a.appendChild(o), e[n] = a;
      }
    }
    return { template: i, body: r, slots: e };
  }
  function I(t, e, r, i = {}) {
    let o = e.cloneNode(true);
    if (r)
      $t(o, r, i);
    t.replaceChildren(o);
  }
  function Wn(t) {
    if (t == null)
      return true;
    if (Array.isArray(t))
      return t.length === 0;
    if (typeof t === "object")
      return Object.keys(t).length === 0;
    return false;
  }
  function wd(t) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return null;
    let e = t.getAttribute(Gn);
    return e && yd.includes(e) ? e : null;
  }
  function kd(t) {
    return t.cloneNode(true);
  }
  var E = "cms-params:change";
  var Ed = /#\{\s*(\w+)\s*\}/g;
  function Yn(t) {
    return /#\{\s*\w+\s*\}/.test(t);
  }
  function it() {
    return new URLSearchParams(typeof location > "u" ? "" : location.search);
  }
  function On(t, e = it()) {
    return t.replace(Ed, (r, i) => encodeURIComponent(e.get(i) ?? ""));
  }
  function Rt(t, e) {
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
  var Ad = "cms-reload-on";
  var Ld = "cms-source:reload";

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
      this.captured = Jn(t);
    }
    start() {
      this.listen(), this.run(), this.el.setAttribute(b, "");
    }
    dispose() {
      this.abort?.abort(), this.abort = null, this.unlisten();
    }
    renderTemplate() {
      this.abort?.abort(), this.abort = null, I(this.el, this.captured.template, null, this.filters);
    }
    listen() {
      let t = (this.el.getAttribute(Ad) ?? "").split(/\s+/).filter(Boolean);
      this.reloadEvents = [Ld, ...t];
      for (let e of this.reloadEvents)
        document.addEventListener(e, this.onReload);
      if (Yn(this.el.getAttribute(g) ?? ""))
        this.paramReactive = true, document.addEventListener(E, this.onParamsChange), window.addEventListener("popstate", this.onParamsChange);
    }
    unlisten() {
      for (let t of this.reloadEvents)
        document.removeEventListener(t, this.onReload);
      if (this.reloadEvents = [], this.paramReactive)
        document.removeEventListener(E, this.onParamsChange), window.removeEventListener("popstate", this.onParamsChange), this.paramReactive = false;
    }
    async run(t) {
      let e = this.el.getAttribute(g)?.trim();
      if (!e)
        return;
      let r = On(e);
      if (t?.onlyIfUrlChanged && r === this.lastUrl)
        return;
      this.lastUrl = r;
      let { slots: i, body: o } = this.captured;
      if (i.loading)
        I(this.el, i.loading, null, this.filters);
      this.abort?.abort();
      let n = new AbortController;
      this.abort = n;
      let a = await $n(r, n.signal);
      if (n.signal.aborted)
        return;
      if (a.kind === "aborted")
        return;
      if (a.kind === "error") {
        if (i.error) {
          let c = { value: { status: a.status, message: a.message } };
          I(this.el, i.error, c, this.filters);
        } else
          this.el.replaceChildren(), console.warn(`cms-source "${r}": ${a.message}`);
        return;
      }
      let l = a.data;
      if (Wn(l) && i.empty)
        I(this.el, i.empty, { value: l }, this.filters);
      else
        I(this.el, o, { value: l }, this.filters);
    }
  }
  function ta(t) {
    if (t.hasAttribute(b))
      t.removeAttribute(b);
    t.querySelectorAll(`[${b}]`).forEach((e) => e.removeAttribute(b));
  }
  var F = "cms-param-sync";
  var Cd = 300;

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
      this.key = (t.getAttribute(F) || "").trim() || t.name || "";
    }
    start() {
      if (!this.key) {
        console.warn(`${F}: no key — set ${F}="<param>" or a name attribute`, this.el);
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
      this.timer = setTimeout(() => this.write(), Cd);
    }
    write() {
      if (this.reflecting)
        return;
      if (this.timer)
        clearTimeout(this.timer), this.timer = null;
      let t = this.currentValue();
      if (t === this.last)
        return;
      this.last = t, Rt(this.key, t);
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
      ra(this.root), this.registerWithin(this.root), this.observer = new MutationObserver((t) => {
        for (let e of t)
          e.removedNodes.forEach((r) => this.unregisterWithin(r)), e.addedNodes.forEach((r) => {
            ra(r), this.registerWithin(r);
          });
      }), this.observer.observe(this.root, { childList: true, subtree: true });
    }
    stop() {
      this.teardown();
    }
    deactivate() {
      this.teardown({ beforeSourceDispose: (t) => t.renderTemplate(), afterDispose: () => R(this.root) });
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
      ot(t, g, this.root, (e) => {
        if (!e.isConnected || this.sources.has(e))
          return;
        let r = new Xt(e, this.filters);
        this.sources.set(e, r), r.start();
      }), ot(t, F, this.root, (e) => {
        if (!e.isConnected || this.paramSyncs.has(e))
          return;
        let r = new Zt(e);
        this.paramSyncs.set(e, r), r.start();
      });
    }
    unregisterWithin(t) {
      ot(t, g, this.root, (e) => {
        let r = this.sources.get(e);
        if (!r)
          return;
        r.dispose(), this.sources.delete(e);
      }), ot(t, F, this.root, (e) => {
        let r = this.paramSyncs.get(e);
        if (!r)
          return;
        r.dispose(), this.paramSyncs.delete(e);
      });
    }
  }
  function ot(t, e, r, i) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let o = t;
    if (o !== r && ea(o, r))
      return;
    if (o.hasAttribute(e))
      i(o);
    o.querySelectorAll(`[${e}]`).forEach((n) => {
      if (!ea(n, r))
        i(n);
    });
  }
  function ea(t, e) {
    for (let r = t.parentElement;r && r !== e; r = r.parentElement)
      if (r.localName === q || r.hasAttribute(w))
        return true;
    return false;
  }
  function R(t) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let e = t;
    if (e.hasAttribute(g))
      e.setAttribute(b, "");
    e.querySelectorAll(`[${g}]:not([${b}])`).forEach((r) => r.setAttribute(b, ""));
  }
  function ra(t) {
    if (t.nodeType !== Node.ELEMENT_NODE)
      return;
    let e = t;
    if (e.hasAttribute(w)) {
      R(e);
      return;
    }
    e.querySelectorAll(`[${w}]`).forEach(R);
  }
  var ia = "cms-binding-cloak";
  var Md = `${q}{display:contents}[${g}]:not([${b}]){visibility:hidden}`;
  var oa = {};
  class na extends HTMLElement {
    _runtime = null;
    connectedCallback() {
      if (Td(this.ownerDocument ?? document), this.closest(`[${w}]`)) {
        R(this);
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
      this._runtime = new Ut(this, oa), this._runtime.start();
    }
  }
  function Td(t) {
    if (t.getElementById(ia))
      return;
    let e = t.createElement("style");
    e.id = ia, e.textContent = Md, (t.head ?? t.documentElement).appendChild(e);
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

  // src/errors/NearestElementRequire.ts
  class NearestElementRequire extends Error {
    constructor(ele, target) {
      super("The element " + ele.tagName + " should be placed under <" + target + ">");
    }
  }

  // src/core/dom/editor/getClosestEditorSystem.ts
  function getClosestEditorSystem(ele) {
    let current = ele;
    while (current) {
      if (current instanceof Element) {
        const editorManager = current.closest("cms-editor-system");
        if (editorManager)
          return editorManager;
      }
      if (current instanceof ShadowRoot) {
        current = current.host;
      } else {
        current = current.parentNode;
      }
    }
    throw new NearestElementRequire(ele, "cms-editor-system");
  }

  // src/components/icons.ts
  var ICON_SNIPPET = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w13c-icon-svg" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m18 16 4-4-4-4"/>
    <path d="m6 8-4 4 4 4"/>
    <path d="m14.5 4-5 16"/>
</svg>
`;
  var ICON_SNIPPET_MUTED = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m18 16 4-4-4-4"/>
    <path d="m6 8-4 4 4 4"/>
    <path d="m14.5 4-5 16"/>
</svg>
`;
  var ICON_TEMPLATE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w13c-icon-svg" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M3 9h18" stroke="currentColor" stroke-width="1.5" fill="none"/>
    <path d="M9 21V9" stroke="currentColor" stroke-width="1.5" fill="none"/>
</svg>
`;
  var ICON_TEMPLATE_MUTED = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18"/>
    <path d="M9 21V9"/>
</svg>
`;
  var ICON_COMPONENT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w13c-icon-svg" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
    <rect x="6" y="6" width="12" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
    <rect x="6" y="14" width="5" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <rect x="13" y="14" width="5" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
</svg>
`;
  var ICON_UPLOAD = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <path d="m21 15-5-5L5 21"/>
</svg>
`;
  var ICON_PARENT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15"></polyline>
</svg>
`;
  var ICON_BRACES = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1"/>
    <path d="M16 21h1a2 2 0 0 0 2-2v-4a2 2 0 0 1 2-2 2 2 0 0 1-2-2V7a2 2 0 0 0-2-2h-1"/>
</svg>
`;
  var ICON_DATABASE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
    <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>
</svg>
`;
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
  var ICON_TRASH = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
</svg>
`;
  var ICON_PIN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 17v5"/>
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
</svg>
`;

  // src/core/editorSystem/Editor/PinMode.ts
  class PinMode {
    _getAnchor;
    _stateSyncs;
    _onUnpinAll;
    _parent;
    static _stylesInjectedFor = new WeakSet;
    _btn = null;
    _resizeObs = null;
    _reflow = () => this._position();
    _rafId = 0;
    _lastRect = null;
    constructor(_getAnchor, _stateSyncs, _onUnpinAll, _parent = document.body) {
      this._getAnchor = _getAnchor;
      this._stateSyncs = _stateSyncs;
      this._onUnpinAll = _onUnpinAll;
      this._parent = _parent;
    }
    get active() {
      return this._btn !== null;
    }
    enter() {
      PinMode._injectStyles(this._parent);
      if (this._btn) {
        this._position();
        return;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "p9r-unpin-btn";
      btn.title = "Unpin state";
      btn.innerHTML = `${ICON_PIN}<span>Unpin</span>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._onUnpinAll();
      });
      this._btn = btn;
      this._parent.appendChild(btn);
      window.addEventListener("scroll", this._reflow, { passive: true, capture: true });
      window.addEventListener("resize", this._reflow);
      this._resizeObs = new ResizeObserver(this._reflow);
      this._resizeObs.observe(this._getAnchor());
      this._resizeObs.observe(document.body);
      this._startRectWatch();
      this._position();
    }
    exit() {
      if (!this._btn)
        return;
      this._btn.remove();
      this._btn = null;
      window.removeEventListener("scroll", this._reflow, { capture: true });
      window.removeEventListener("resize", this._reflow);
      this._resizeObs?.disconnect();
      this._resizeObs = null;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = 0;
      }
      this._lastRect = null;
    }
    _startRectWatch() {
      const tick = () => {
        if (!this._btn)
          return;
        const r = this._getAnchor().getBoundingClientRect();
        const last = this._lastRect;
        if (!last || last.x !== r.left || last.y !== r.top || last.w !== r.width || last.h !== r.height) {
          this._lastRect = { x: r.left, y: r.top, w: r.width, h: r.height };
          this._position();
        }
        this._rafId = requestAnimationFrame(tick);
      };
      this._rafId = requestAnimationFrame(tick);
    }
    _position() {
      if (!this._btn)
        return;
      const rect = this._getAnchor().getBoundingClientRect();
      const placement = this._stateSyncs.find((s2) => s2.isPinned)?.placement ?? "left";
      const gap = 8;
      const bw = this._btn.offsetWidth;
      const bh = this._btn.offsetHeight;
      let x2 = 0, y2 = 0;
      switch (placement) {
        case "right":
          x2 = rect.right + gap;
          y2 = rect.top + rect.height / 2 - bh / 2;
          break;
        case "top":
          x2 = rect.left + rect.width / 2 - bw / 2;
          y2 = rect.top - bh - gap;
          break;
        case "bottom":
          x2 = rect.left + rect.width / 2 - bw / 2;
          y2 = rect.bottom + gap;
          break;
        default:
          x2 = rect.left - bw - gap;
          y2 = rect.top + rect.height / 2 - bh / 2;
      }
      x2 = Math.max(4, Math.min(x2, window.innerWidth - bw - 4));
      y2 = Math.max(4, Math.min(y2, window.innerHeight - bh - 4));
      this._btn.style.left = `${x2}px`;
      this._btn.style.top = `${y2}px`;
    }
    static _injectStyles(parent) {
      const root = parent.getRootNode();
      const styleHost = root instanceof ShadowRoot ? root : document.head;
      if (PinMode._stylesInjectedFor.has(styleHost))
        return;
      const style = document.createElement("style");
      style.textContent = `
.p9r-unpin-btn {
    position: fixed;
    z-index: 10002;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--primary-base, #4361ee);
    background: var(--bg-surface, #fff);
    color: var(--primary-base, #4361ee);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}
.p9r-unpin-btn svg { width: 14px; height: 14px; }
.p9r-unpin-btn:hover { background: var(--primary-base, #4361ee); color: #fff; }
`;
      styleHost.appendChild(style);
      PinMode._stylesInjectedFor.add(styleHost);
    }
  }

  // src/core/editorSystem/Editor/panel.ts
  var SYNC_SELECTORS = "p9r-comp-sync, p9r-image-sync, p9r-svg-sync, p9r-attr-sync, p9r-state-sync";

  class PanelConfig {
    editor;
    _config = null;
    _fragment = null;
    _syncs = [];
    constructor(editor, html) {
      this.editor = editor;
      if (html)
        this._initFromHTML(html);
    }
    get hasPanel() {
      return this._config != null || this._fragment != null;
    }
    get configPanel() {
      return this._config;
    }
    queryChildren(selector) {
      if (this._config)
        return Array.from(this._config.querySelectorAll(selector));
      if (this._fragment)
        return Array.from(this._fragment.querySelectorAll(selector));
      return [];
    }
    propagateIdentifier(identifier) {
      if (!this._config)
        return;
      this._config.querySelectorAll("*").forEach((el) => el.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, identifier));
    }
    notifySyncs(opts) {
      if (this._config) {
        this._config.init(opts);
        return;
      }
      for (const sync of this._syncs)
        sync.init?.(opts);
    }
    show() {
      this._ensureBuilt();
      this._config?.show();
    }
    dispose() {
      this._config?.remove();
      this._config = null;
      this._fragment = null;
      this._syncs = [];
    }
    _ensureBuilt() {
      if (this._config || !this._fragment)
        return;
      this._config = document.createElement("p9r-config-panel");
      this._config.appendChild(this._fragment);
      this._fragment = null;
      getClosestEditorSystem(this.editor.target).editorDOM.append(this._config);
    }
    _initFromHTML(html) {
      this._fragment = document.createRange().createContextualFragment(html);
      try {
        customElements.upgrade(this._fragment);
      } catch {}
      const id2 = this.editor.identifier;
      this._fragment.querySelectorAll("*").forEach((el) => el.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, id2));
      this._syncs = Array.from(this._fragment.querySelectorAll(SYNC_SELECTORS));
      for (const sync of this._syncs) {
        sync.prepare?.(this.editor.target, this.editor);
      }
    }
  }

  // src/core/dom/isVisuallyInvisible.ts
  function isVisuallyInvisible(el) {
    if (typeof el.checkVisibility === "function") {
      const visible = el.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        checkOpacity: true,
        checkVisibilityCSS: true
      });
      if (!visible)
        return true;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0)
      return true;
    if (r.bottom <= 0 || r.right <= 0 || r.left >= innerWidth || r.top >= innerHeight)
      return true;
    return false;
  }

  // src/core/editorSystem/Editor/hoverBinding.ts
  class HoverBinding {
    editor;
    _hoverElement = null;
    _handler = (e) => this._onHover(e);
    constructor(editor) {
      this.editor = editor;
    }
    bind() {
      this.unbind();
      let resolved = this.editor.getActionBarAnchor() ?? this.editor.target;
      const resolvedId = resolved.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
      const myId = this.editor.target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
      if (resolvedId && resolvedId !== myId) {
        const inner = document.compIdentifierToEditor?.get(resolvedId);
        if (inner?.isInteractive)
          resolved = this.editor.target;
      }
      this._hoverElement = resolved;
      this._hoverElement.addEventListener("mouseenter", this._handler);
    }
    unbind() {
      if (!this._hoverElement)
        return;
      this._hoverElement.removeEventListener("mouseenter", this._handler);
      this._hoverElement = null;
    }
    _onHover(e) {
      const elAtCursor = document.elementFromPoint(e.clientX, e.clientY);
      if (elAtCursor && isVisuallyInvisible(elAtCursor))
        return;
      const editorSystem = getClosestEditorSystem(this.editor.target);
      editorSystem.blocActions.setEditor(this.editor);
      editorSystem.blocActions.open(e.clientX, e.clientY);
    }
  }

  // src/core/editorSystem/Editor/modeBinding.ts
  var EVENT_NAME = "editor-system-switch-mode";

  class ModeBinding {
    _root;
    _handler;
    constructor(target, callbacks) {
      this._root = getClosestEditorSystem(target);
      this._handler = (e) => {
        const mode = e.detail;
        if (mode === "editor")
          callbacks.onEditorMode();
        else if (mode === "view")
          callbacks.onViewMode();
        callbacks.afterSwitch?.(mode);
      };
      this._root.addEventListener(EVENT_NAME, this._handler);
    }
    dispose() {
      this._root.removeEventListener(EVENT_NAME, this._handler);
    }
  }

  // src/core/editorSystem/Editor/bodyStyle.ts
  var registry = new Map;
  function acquireBodyStyle(tag, el) {
    let entry = registry.get(tag);
    if (!entry) {
      document.body.append(el);
      entry = { el, count: 0 };
      registry.set(tag, entry);
    }
    entry.count++;
  }
  function releaseBodyStyle(tag) {
    const entry = registry.get(tag);
    if (!entry)
      return;
    entry.count--;
    if (entry.count <= 0) {
      entry.el.remove();
      registry.delete(tag);
    }
  }

  // src/core/editorSystem/Editor/actionBarFeatures.ts
  function defaultActionBarFeatures() {
    return new Map([
      ["delete", true],
      ["duplicate", true],
      ["addBefore", false],
      ["addAfter", false],
      ["changeComponent", false],
      ["saveAsTemplate", false]
    ]);
  }
  function syncActionBarFeaturesFromAttrs(target, features) {
    features.set("delete", target.getAttribute(p9r.attr.ACTION.DISABLE_DELETE) !== "true");
    features.set("duplicate", target.getAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE) !== "true");
    features.set("addBefore", target.getAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE) !== "true");
    features.set("addAfter", target.getAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER) !== "true");
    features.set("changeComponent", target.getAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT) !== "true");
    features.set("saveAsTemplate", target.getAttribute(p9r.attr.ACTION.DISABLE_SAVE_AS_TEMPLATE) !== "true");
  }

  // src/core/editorSystem/extensions/registry.ts
  class ExtensionRegistry {
    _byScope = new Map;
    add(surface, ext) {
      let list = this._byScope.get(surface);
      if (!list) {
        list = [];
        this._byScope.set(surface, list);
      }
      list.push(ext);
      return () => {
        const i = list.indexOf(ext);
        if (i >= 0)
          list.splice(i, 1);
      };
    }
    list(surface) {
      const list = this._byScope.get(surface);
      return list ? list.slice() : [];
    }
    clear() {
      this._byScope.clear();
    }
  }

  // src/core/editorSystem/Editor/Editor.ts
  var _pinnedEditors = new Set;

  class Editor {
    target;
    variant = "default";
    customActions = [];
    stateSyncs = [];
    _identifier;
    _styleElement;
    _holdsBodyStyle = false;
    _panel;
    _hover;
    _mode;
    _pinMode;
    _extensions = new ExtensionRegistry;
    _actionBarFeatures = defaultActionBarFeatures();
    constructor(target, styles, editor) {
      this.target = target;
      this._styleElement = document.createElement("style");
      this._styleElement.innerHTML = styles;
      this._identifier = crypto.randomUUID();
      this.target.setAttribute(p9r.attr.EDITOR.IDENTIFIER, this._identifier);
      if (!document.compIdentifierToEditor)
        document.compIdentifierToEditor = new Map;
      document.compIdentifierToEditor.set(this._identifier, this);
      this._panel = new PanelConfig(this, editor);
      this._hover = new HoverBinding(this);
      const pinParent = getClosestEditorSystem(this.target).shadowRoot?.querySelector("#editorSystem") ?? document.body;
      this._pinMode = new PinMode(() => this.getActionBarAnchor() ?? this.target, this.stateSyncs, () => {
        this.stateSyncs.forEach((s2) => s2.unpin());
        this.notifyPinStateChanged();
      }, pinParent);
      this._mode = new ModeBinding(this.target, {
        onEditorMode: () => this.viewEditor(),
        onViewMode: () => this.viewClient(),
        afterSwitch: (mode) => this.onSwitchMode(mode)
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.target.removeAttribute(p9r.attr.EDITOR.IS_CREATING);
        });
      });
      getClosestEditorSystem(this.target).blocActions.close();
    }
    viewEditor() {
      this._panel.propagateIdentifier(this._identifier);
      this._panel.notifySyncs();
      this._extensions.clear();
      this.init();
      if (!this.target.shadowRoot) {
        this._acquireBodyStyle();
      } else {
        this.target.shadowRoot.append(this._styleElement);
      }
      this.target.setAttribute(p9r.attr.ACTION.DISABLE_SAVE_AS_TEMPLATE, "true");
      this.target.setAttribute(p9r.attr.EDITOR.IDENTIFIER, this._identifier);
      this.target.classList.add("editor-block");
      this.target.setAttribute(p9r.attr.EDITOR.IS_EDITOR, "true");
      if (this.target.hasAttribute(p9r.attr.ACTION.DISABLE_DRAGGING)) {
        this.target.setAttribute("draggable", "false");
      } else {
        this.target.draggable = true;
      }
      this.target.style.setProperty("pointer-events", "auto", "important");
      this.refreshActionBarFeatures();
      this._hover.unbind();
      if (this.isInteractive)
        this._hover.bind();
    }
    viewClient() {
      this.stateSyncs.forEach((s2) => s2.unpin());
      this._pinMode.exit();
      this.restore();
      this._extensions.clear();
      this._hover.unbind();
      this.target.style.removeProperty("pointer-events");
      if (this.target.getAttribute("style") === "") {
        this.target.removeAttribute("style");
      }
      this._releaseBodyStyle();
      if (this.target.shadowRoot)
        this._styleElement.remove();
      this.target.removeAttribute(p9r.attr.EDITOR.IS_EDITOR);
      this.target.classList.remove("editor-block");
      this.target.removeAttribute("draggable");
      if (this.target.getAttribute("class") === "") {
        this.target.removeAttribute("class");
      }
      this.target.removeAttribute(p9r.attr.ACTION.DISABLE_DELETE);
      this.target.removeAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE);
      this.target.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE);
      this.target.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER);
      this.target.removeAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT);
      this.target.removeAttribute(p9r.attr.ACTION.DISABLE_SAVE_AS_TEMPLATE);
      this.target.removeAttribute(p9r.attr.ACTION.INLINE_ADDING);
      this.target.removeAttribute(p9r.attr.ACTION.DISABLE_DRAGGING);
      this.target.removeAttribute(p9r.attr.TEXT.BLOC_MANAGEMENT);
      this.target.removeAttribute(p9r.attr.EDITOR.IDENTIFIER);
      this.target.removeAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    }
    onSwitchMode(_mode) {}
    dispose() {
      document.compIdentifierToEditor?.delete(this._identifier);
      _pinnedEditors.delete(this);
      this._extensions.clear();
      this._hover.unbind();
      this._mode.dispose();
      this._pinMode.exit();
      this._panel.dispose();
      this._releaseBodyStyle();
      this._styleElement.remove();
    }
    registerStateSync(sync) {
      if (!this.stateSyncs.includes(sync))
        this.stateSyncs.push(sync);
    }
    unregisterStateSync(sync) {
      const i = this.stateSyncs.indexOf(sync);
      if (i >= 0)
        this.stateSyncs.splice(i, 1);
    }
    claimChild(el) {
      el.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, this._identifier);
    }
    extendRichTextBar(ext) {
      return this._extensions.add("richtextbar", ext);
    }
    extendBlocActions(ext) {
      return this._extensions.add("blocActions", ext);
    }
    extendData(ext) {
      return this._extensions.add("data", ext);
    }
    listExtensions(surface) {
      return this._extensions.list(surface);
    }
    getActionBarAnchor() {
      return null;
    }
    notifyPinStateChanged(stateSync) {
      const anyPinned = this.stateSyncs.some((s2) => s2.isPinned);
      if (anyPinned) {
        _pinnedEditors.add(this);
        getClosestEditorSystem(this.target).blocActions.close();
        this._pinMode.enter();
      } else {
        _pinnedEditors.delete(this);
        this._pinMode.exit();
      }
      this._refreshHoverBinding();
      let p = this.target.parentElement;
      while (p) {
        const id2 = p.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        if (id2)
          document.compIdentifierToEditor?.get(id2)?._refreshHoverBinding();
        p = p.parentElement;
      }
      this.onEditorPinState?.(anyPinned, stateSync);
    }
    _refreshHoverBinding() {
      if (this._shouldSuppressHover()) {
        this._hover.unbind();
        return;
      }
      if (this.isInteractive)
        this._hover.bind();
    }
    _shouldSuppressHover() {
      if (this.stateSyncs.some((s2) => s2.isPinned))
        return true;
      for (const e of _pinnedEditors) {
        if (e === this)
          continue;
        if (this.target.contains(e.target))
          return true;
      }
      return false;
    }
    refreshActionBarFeatures() {
      syncActionBarFeaturesFromAttrs(this.target, this._actionBarFeatures);
    }
    get actionBarConfiguration() {
      return this._actionBarFeatures;
    }
    addCustomAction(action) {
      this.customActions.push(action);
    }
    get isInteractive() {
      return this._actionBarFeatures.values().some((v2) => v2 === true) || this.stateSyncs.length > 0 || this.customActions.length > 0 || this.hasConfigPanel;
    }
    get hasConfigPanel() {
      return this._panel.hasPanel;
    }
    queryPanelChildren(selector) {
      return this._panel.queryChildren(selector);
    }
    showConfigPanel() {
      this._panel.show();
    }
    get _panelConfig() {
      return this._panel.configPanel;
    }
    onChildrenRemoved(removedNode) {
      this._panel.notifySyncs({ removed: removedNode });
    }
    onChildrenAdded(addedNode) {
      this._panel.notifySyncs({ added: addedNode });
    }
    get identifier() {
      return this._identifier;
    }
    get ensurePersistentIdentifier() {
      if (!this.target.hasAttribute(p9r.attr.EDITOR.PERSISTENT_IDENTIFIER)) {
        const generatedId = "ID-" + crypto.randomUUID();
        this.target.setAttribute(p9r.attr.EDITOR.PERSISTENT_IDENTIFIER, generatedId);
      }
      return this.target.getAttribute(p9r.attr.EDITOR.PERSISTENT_IDENTIFIER);
    }
    get persistentIdentifierAttrName() {
      return p9r.attr.EDITOR.PERSISTENT_IDENTIFIER;
    }
    _acquireBodyStyle() {
      if (this._holdsBodyStyle)
        return;
      acquireBodyStyle(this.target.tagName, this._styleElement);
      this._holdsBodyStyle = true;
    }
    _releaseBodyStyle() {
      if (!this._holdsBodyStyle)
        return;
      this._holdsBodyStyle = false;
      releaseBodyStyle(this.target.tagName);
    }
  }
  // src/core/editorSystem/registerEditor.ts
  class EmptyEditor extends Editor {
    constructor(target) {
      super(target, "");
    }
    init() {}
    restore() {}
  }
  function registerEditor(props) {
    if (!document.editors)
      document.editors = [];
    document.editors.push({
      tag: props.tag + (props.suffix || ""),
      cl: props.cl || EmptyEditor,
      label: props.label + (props.suffix || ""),
      group: props.group
    });
  }
  function registerEditor_opaque(props) {
    if (!document.editors)
      document.editors = [];
    document.editors.push({
      tag: props.tag,
      cl: EmptyEditor,
      label: props.label,
      group: props.group
    });
  }
  // ../../features/cms-content/src/core/constants/editorAttributes.ts
  var P9R_ATTR = {
    ACTION: {
      DISABLE_DELETE: "p9r-action-disable-delete",
      DISABLE_ADD_BEFORE: "p9r-action-disable-add-before",
      DISABLE_ADD_AFTER: "p9r-action-disable-add-after",
      DISABLE_DRAGGING: "p9r-action-disable-dragging",
      DISABLE_DUPLICATE: "p9r-action-disable-duplicate",
      DISABLE_SAVE_AS_TEMPLATE: "p9r-action-disable-save-as-template",
      DISABLE_CHANGE_COMPONENT: "p9r-action-disable-change-component",
      INLINE_ADDING: "inline-adding"
    },
    TEXT: {
      DISABLE_TYPE: "p9r-text-disable-type",
      DISABLE_EDITING: "p9r-text-disable-editing",
      DISABLE_BOLD: "p9r-text-disable-bold",
      DISABLE_ITALIC: "p9r-text-disable-italic",
      DISABLE_UNDERLINE: "p9r-text-disable-underline",
      DISABLE_OVERLINE: "p9r-text-disable-overline",
      DISABLE_LINE_THROUGH: "p9r-text-disable-line-through",
      EDITABLE: "p9r-text-editable",
      BLOC_MANAGEMENT: "p9r-text-bloc-management",
      PLACEHOLDER: "p9r-text-placeholder"
    },
    EDITOR: {
      IDENTIFIER: "p9r-identifier",
      PARENT_IDENTIFIER: "p9r-parent-identifier",
      IS_EDITOR: "p9r-is-editor",
      OPAQUE: "p9r-opaque",
      IS_CREATING: "p9r-is-creating",
      PERSISTENT_IDENTIFIER: "p9r-persistent-identifier"
    }
  };
  // src/components/globals.ts
  window.p9r = {
    attr: P9R_ATTR,
    Component: A2,
    Editor,
    registerEditor,
    registerEditor_opaque
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
        Yl("cms-confirm-form: missing target", { type: "error" });
        return;
      }
      const url = force ? withForce(target) : target;
      let res;
      try {
        res = await fetch(url, { method });
      } catch (e) {
        Yl(`Request failed: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
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
      Yl(message || `HTTP ${res.status}`, { type: "error" });
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

  // src/components/admin/CredentialSelect/flows.ts
  var SAVED_EVENT = "secret:saved";
  async function fetchKeys(api) {
    const res = await fetch(`${api}/keys`, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      Yl("Failed to load credentials", { type: "error" });
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
  var REF_PATTERN = /^\$\{([A-Z][A-Z0-9_]*)\}$/;
  function refToDisplay(ref) {
    return ref.match(REF_PATTERN)?.[1] ?? "";
  }
  function keyToRef(key) {
    return `\${${key}}`;
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
  var KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
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
    if (!KEY_PATTERN.test(key)) {
      keyInput.setAttribute("invalid", "");
      keyInput.setAttribute("hint", "Must match /^[A-Z][A-Z0-9_]*$/");
      keyInput.setAttribute("hint-level", "error");
      Yl("Invalid key: must match /^[A-Z][A-Z0-9_]*$/", { type: "error" });
      return;
    }
    if (host._keys.includes(key)) {
      Yl(`Credential ${key} already exists`, { type: "warning" });
      return;
    }
    const r = await createCredential(host._api, key, value);
    if (!r.ok) {
      Yl(`Create failed: ${r.error}`, { type: "error" });
      return;
    }
    Yl(`Credential ${key} created`, { type: "success" });
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
      const el = document.createElement("cms-empty-state");
      el.setAttribute("fluid", "");
      if (opts.icon) {
        const fragment = document.createRange().createContextualFragment(opts.icon);
        const iconRoot = fragment.firstElementChild;
        if (iconRoot) {
          iconRoot.setAttribute("slot", "icon");
          el.appendChild(iconRoot);
        }
      }
      const title = document.createElement("p");
      title.slot = "title";
      title.textContent = opts.title;
      el.appendChild(title);
      if (opts.hint) {
        const hint = document.createElement("p");
        hint.slot = "hint";
        hint.textContent = opts.hint;
        el.appendChild(hint);
      }
      return el;
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
  // ../../features/cms-gateway/src/default-implementation/InMemoryGatewayRepository.ts
  class InMemoryGatewayRepository {
    _providers = new Map;
    async createProvider(provider) {
      if (this._providers.has(provider.urn)) {
        throw new Error(`Provider with urn "${provider.urn}" already exists`);
      }
      this._providers.set(provider.urn, structuredClone(provider));
      return structuredClone(provider);
    }
    async updateProvider(provider) {
      if (!this._providers.has(provider.urn))
        return null;
      this._providers.set(provider.urn, structuredClone(provider));
      return structuredClone(provider);
    }
    async deleteProvider(urn) {
      return this._providers.delete(urn);
    }
    async getProvider(urn) {
      const found = this._providers.get(urn);
      return found ? structuredClone(found) : null;
    }
    async getAllProviders() {
      return Array.from(this._providers.values(), (p) => structuredClone(p));
    }
    async getEndpoint(urn) {
      for (const provider of this._providers.values()) {
        const endpoint = provider.endpoints.find((e) => e.urn === urn);
        if (endpoint)
          return structuredClone(endpoint);
      }
      return null;
    }
  }
  // src/components/admin/EndpointsInput/controls.ts
  var ICON_SVG = (paths, size = 16) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  var ICON_PLUS = ICON_SVG('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 18);
  var ICON_X = ICON_SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
  var ICON_TRASH2 = ICON_SVG('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
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
  var makeDeleteButton = () => makeIconButton(ICON_TRASH2, { ariaLabel: "Delete endpoint", slot: "header-actions", action: "remove-endpoint" });
  function makeAddButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ep-add";
    btn.dataset.action = "add-endpoint";
    btn.innerHTML = `${ICON_PLUS} Add endpoint`;
    return btn;
  }

  // src/components/admin/EndpointsInput/pathParams.ts
  function extractPathNames(targetUrl) {
    const names = [];
    const seen = new Set;
    for (const m of targetUrl.matchAll(/\{(\w+)\}/g)) {
      const name = m[1];
      if (seen.has(name))
        continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  }
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
  var readControl = (el) => {
    const live = el.value;
    return typeof live === "string" ? live : el.getAttribute("value") ?? "";
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
  function makeBodySection(ei2, seedBody) {
    const container = document.createElement("div");
    container.dataset.role = "body";
    const field = jsonField(`endpoints.${ei2}.body`);
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
  var VALID = /^[1-5][0-9][0-9]$/;
  var isValid = (v2) => VALID.test(v2) || v2 === "default";
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
      if (readControl(select) === CUSTOM && v2 && !isValid(v2)) {
        input.setAttribute("invalid", "");
        input.setAttribute("hint", "Code 100–599 ou « default »");
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
        name.setAttribute("hint", "Nom de header invalide ou réservé");
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
    for (const el of [idInput, methodSelect, urlInput]) {
      el.addEventListener("input", update);
      el.addEventListener("change", update);
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
        Yl(message, { type });
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
      return this._kind === "local";
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
        Yl(next ? "Provider enabled" : "Provider disabled", { type: "success" });
        this._fire();
      }
    }
    async _remove() {
      if (!confirm(`Remove provider "${this._id}"?`))
        return;
      if (await this._send("DELETE", { id: this._id })) {
        Yl("Provider removed", { type: "success" });
        this._fire();
      }
    }
    async _send(method, body) {
      try {
        const res = await fetch(this._base, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) {
          Yl("Action failed", { type: "error" });
          return false;
        }
        return true;
      } catch {
        Yl("Network error", { type: "error" });
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
          Yl("Role updated", { type: "success" });
          if (this._emit)
            document.dispatchEvent(new Event(this._emit, { bubbles: true }));
        } else {
          Yl("Failed to update role", { type: "error" });
        }
      } catch {
        Yl("Network error", { type: "error" });
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
      const id2 = this._id;
      if (!id2) {
        location.href = this._back;
        return;
      }
      try {
        const res = await fetch(`${this._api}/editor?id=${encodeURIComponent(id2)}`, { headers: { Accept: "application/json" } });
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
      const cb = (id2, label) => `<w13c-checkbox value="${escapeHtml(id2)}"${checked.has(id2) ? " checked" : ""}>${escapeHtml(label)}</w13c-checkbox>`;
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
      const grants = Array.from(this.shadowRoot.querySelectorAll("w13c-checkbox")).filter((el) => el.hasAttribute("checked")).map((el) => ({ permission: el.getAttribute("value") }));
      try {
        const res = await fetch(this._api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: this.data.role.id, label: this.data.role.label, grants })
        });
        if (res.ok) {
          Yl("Role permissions saved", { type: "success" });
          location.href = this._back;
        } else {
          Yl("Failed to save permissions", { type: "error" });
        }
      } catch {
        Yl("Network error", { type: "error" });
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
          Yl("Could not create token", { type: "error" });
          return;
        }
        const { token } = await res.json();
        this._token = token;
        this._q('[data-role="token"]').value = token;
        this._q('[data-role="form"]').hidden = true;
        this._q('[data-role="reveal"]').hidden = false;
        document.dispatchEvent(new Event(this._emit, { bubbles: true }));
      } catch {
        Yl("Network error", { type: "error" });
      } finally {
        btn.removeAttribute("disabled");
      }
    }
    _copy() {
      navigator.clipboard?.writeText(this._token);
      Yl("Token copied", { type: "success" });
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

  // src/components/admin/Secrets/icons.ts
  var ICONS = { eye: ICON_EYE, save: ICON_SAVE, trash: ICON_TRASH };
  function injectIcons(root) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      const name = el.dataset.icon;
      if (ICONS[name])
        el.innerHTML = ICONS[name];
    });
  }

  // src/components/admin/Secrets/ops.ts
  var KEY_PATTERN2 = /^[A-Z][A-Z0-9_]*$/;
  async function opSaveRow(api, key, value) {
    const r = await postSecret(api, key, value);
    if (r.ok)
      Yl(`Secret ${key} updated`, { type: "success" });
    else
      Yl(`Update failed: ${r.error}`, { type: "error" });
  }
  async function opAddSecret(api, keyEl, valueEl, knownKeys) {
    const key = keyEl.value.trim();
    const value = valueEl.value;
    if (!key) {
      Yl("Key is required", { type: "error" });
      return;
    }
    if (!KEY_PATTERN2.test(key)) {
      Yl(`Invalid key: must match /^[A-Z][A-Z0-9_]*$/`, { type: "error" });
      return;
    }
    if (knownKeys.has(key)) {
      Yl(`Secret ${key} already exists — edit it inline below`, { type: "warning" });
      return;
    }
    const r = await postSecret(api, key, value);
    if (r.ok) {
      keyEl.value = "";
      valueEl.value = "";
      Yl(`Secret ${key} created`, { type: "success" });
    } else {
      Yl(`Create failed: ${r.error}`, { type: "error" });
    }
  }
  async function opDeleteSecret(api, key) {
    if (!confirm(`Delete secret "${key}"?`))
      return;
    const r = await deleteSecret(api, key);
    if (r.ok)
      Yl(`Secret ${key} deleted`, { type: "success" });
    else
      Yl(`Delete failed: ${r.error}`, { type: "error" });
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

  // src/components/editor/componentSync/PageLink/PageLink.css
  var PageLink_default = `:host {
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

.input-row {
    display: flex;
    gap: 4px;
}

/* ── Trigger ── */

.trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
    outline: none;
}

.trigger:hover {
    border-color: var(--text-muted, #94a3b8);
}

.trigger:focus-visible {
    border-color: var(--primary-base, #4361ee);
    box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
}

.trigger.open {
    border-color: var(--primary-base, #4361ee);
}

.trigger.has-value {
    border-color: var(--primary-base, #4361ee);
    background: var(--primary-muted, rgb(67 97 238 / 0.06));
}

.link-icon {
    flex-shrink: 0;
    color: var(--text-muted, #94a3b8);
}

.trigger.has-value .link-icon {
    color: var(--primary-base, #4361ee);
}

.value {
    flex: 1;
    min-width: 0;
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

.trigger.open .chevron {
    transform: rotate(180deg);
    color: var(--primary-base, #4361ee);
}

/* ── Clear button ── */

.clear-btn {
    display: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    background: var(--bg-surface, #fff);
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    flex-shrink: 0;
}

.clear-btn:hover {
    color: var(--danger-base, #ef4444);
    border-color: var(--danger-base, #ef4444);
    background: color-mix(in srgb, var(--danger-base, #ef4444) 6%, transparent);
}

/* ── Panel ── */

.panel {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgb(0 0 0 / 0.08);
    z-index: 50;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: opacity 0.15s, visibility 0.15s, transform 0.15s;
    overflow: hidden;
}

.panel.open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

/* ── Tabs ── */

.tabs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    border-bottom: 1px solid var(--border-default, #e2e8f0);
    background: var(--bg-base, #f8fafc);
}

.tab {
    padding: 8px 10px;
    border: none;
    background: transparent;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s, background 0.15s;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
}

.tab:hover {
    color: var(--text-main, #1e293b);
}

.tab.active {
    color: var(--primary-base, #4361ee);
    border-bottom-color: var(--primary-base, #4361ee);
    background: var(--bg-surface, #fff);
}

/* ── External input ── */

.external-section {
    padding: 8px;
}

.external-input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 6px;
    background: var(--bg-base, #f8fafc);
    font-size: 12px;
    font-family: inherit;
    color: var(--text-main, #1e293b);
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
}

.external-input:focus {
    border-color: var(--primary-base, #4361ee);
}

.external-input::placeholder {
    color: var(--text-muted, #94a3b8);
}

/* ── Media section ── */

.media-section {
    padding: 8px;
}

.media-pick-btn {
    width: 100%;
    padding: 8px 10px;
    border: 1px dashed var(--border-default, #e2e8f0);
    border-radius: 6px;
    background: var(--bg-base, #f8fafc);
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    color: var(--text-main, #1e293b);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.media-pick-btn:hover {
    border-color: var(--primary-base, #4361ee);
    color: var(--primary-base, #4361ee);
    background: var(--primary-muted, rgb(67 97 238 / 0.06));
}

.media-current {
    display: none;
    margin-top: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--primary-muted, rgb(67 97 238 / 0.08));
    font-size: 11px;
    color: var(--text-main, #1e293b);
    word-break: break-all;
    font-family: monospace;
}

.media-current.has-value {
    display: block;
}

/* ── Search ── */

.search-wrap {
    padding: 6px 6px 2px;
}

.search {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 6px;
    background: var(--bg-base, #f8fafc);
    font-size: 11px;
    font-family: inherit;
    color: var(--text-main, #1e293b);
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
}

.search:focus {
    border-color: var(--primary-base, #4361ee);
}

.search::placeholder {
    color: var(--text-muted, #94a3b8);
}

/* ── List ── */

.list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 200px;
    overflow-y: auto;
}

.empty {
    display: none;
    padding: 12px;
    text-align: center;
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
}

/* ── Option ── */

.option {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.1s;
}

.option:hover {
    background: var(--bg-base, #f1f5f9);
}

.option.selected {
    background: var(--primary-muted, rgb(67 97 238 / 0.1));
}

.option-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-main, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.option.selected .option-title {
    color: var(--primary-base, #4361ee);
}

.option-path {
    font-size: 10px;
    color: var(--text-muted, #94a3b8);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
`;

  // src/components/editor/componentSync/PageLink/template.ts
  function buildShadow2(host, label) {
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>${PageLink_default}</style>
        <div class="field">
            ${label ? `<span class="label">${label}</span>` : ""}
            <div class="input-row">
                <button class="trigger" type="button" tabindex="0">
                    <svg class="link-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    <span class="value">No link</span>
                    <svg class="chevron" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <path d="m6 9 6 6 6-6"/>
                    </svg>
                </button>
                <button class="clear-btn" type="button" title="Remove link">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="panel">
                <div class="tabs">
                    <button type="button" class="tab tab-page" data-mode="page">Page</button>
                    <button type="button" class="tab tab-external" data-mode="external">External URL</button>
                    <button type="button" class="tab tab-media" data-mode="media">Media</button>
                </div>
                <div class="page-section">
                    <div class="search-wrap"><input class="search" type="text" placeholder="Search for a page..."></div>
                    <ul class="list"></ul>
                    <div class="empty">No pages found</div>
                </div>
                <div class="external-section"><input class="external-input" type="url" placeholder="https://example.com" spellcheck="false"></div>
                <div class="media-section">
                    <button type="button" class="media-pick-btn">Choose a media file…</button>
                    <div class="media-current"></div>
                </div>
            </div>
        </div>
        <div hidden><slot></slot></div>
    `;
    return {
      trigger: shadow.querySelector(".trigger"),
      display: shadow.querySelector(".value"),
      list: shadow.querySelector(".list"),
      panel: shadow.querySelector(".panel"),
      empty: shadow.querySelector(".empty"),
      clearBtn: shadow.querySelector(".clear-btn"),
      pageSection: shadow.querySelector(".page-section"),
      externalSection: shadow.querySelector(".external-section"),
      mediaSection: shadow.querySelector(".media-section"),
      externalInput: shadow.querySelector(".external-input"),
      mediaPickBtn: shadow.querySelector(".media-pick-btn"),
      mediaCurrent: shadow.querySelector(".media-current"),
      tabPage: shadow.querySelector(".tab-page"),
      tabExternal: shadow.querySelector(".tab-external"),
      tabMedia: shadow.querySelector(".tab-media"),
      search: shadow.querySelector(".search")
    };
  }

  // src/components/editor/componentSync/PageLink/detect.ts
  function isExternal(v2) {
    return /^(https?:|mailto:|tel:|\/\/)/i.test(v2);
  }
  function isMedia(v2) {
    return /(^|\/)media\?id=/.test(v2);
  }
  function mediaLabel(src) {
    const m = src.match(/id=([^&]+)/);
    return m ? `Media ${m[1]}` : src;
  }

  // src/core/dom/meta/getMetaBasePath.ts
  function getMetaBasePath() {
    const meta = document.querySelector('meta[name="basePath"]');
    const content = meta?.getAttribute("content") ?? "";
    if (!content || content === "/")
      return "";
    return content.replace(/\/+$/, "");
  }

  // src/core/dom/meta/getMetaApiPath.ts
  function getMetaApiPath() {
    return `${getMetaBasePath()}/api`;
  }

  // src/core/dom/meta/resolveApiUrl.ts
  function resolveApiUrl(path) {
    const apiPath = getMetaApiPath();
    const base = /^https?:\/\//.test(apiPath) ? apiPath : new URL(apiPath, window.location.origin).href;
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    return new URL(cleanBase + cleanPath);
  }

  // src/components/editor/componentSync/PageLink/parts/flows.ts
  async function fetchPages() {
    try {
      const res = await fetch(resolveApiUrl("page/links"));
      return await res.json();
    } catch (e) {
      console.warn("P9rLink: failed to fetch pages", e);
      return [];
    }
  }
  function openMediaCenter(host, onPick) {
    const mediaCenter = document.createElement("cms-media-center");
    const editorSystem = getClosestEditorSystem(host);
    editorSystem.editorDOM.append(mediaCenter);
    requestAnimationFrame(() => {
      const handler = (e) => {
        mediaCenter.removeEventListener("select-item", handler);
        const src = e.detail?.src;
        if (!src)
          return;
        onPick(src);
        mediaCenter.remove();
      };
      mediaCenter.addEventListener("select-item", handler);
      mediaCenter.show(["folder", "image", "other"]);
    });
  }

  // src/components/editor/componentSync/PageLink/PageLink.picker.ts
  function filterPages(pages, query) {
    const q2 = query.toLowerCase();
    return pages.filter((p) => p.title.toLowerCase().includes(q2) || p.path.toLowerCase().includes(q2));
  }
  function buildOptionList(listEl, emptyEl, pages, onSelect) {
    listEl.innerHTML = "";
    if (pages.length === 0) {
      emptyEl.style.display = "block";
      return [];
    }
    emptyEl.style.display = "none";
    const options = [];
    for (const page of pages) {
      const li2 = document.createElement("li");
      li2.className = "option";
      li2.dataset.value = page.path;
      const title = document.createElement("span");
      title.className = "option-title";
      title.textContent = page.title;
      const path = document.createElement("span");
      path.className = "option-path";
      path.textContent = page.path;
      li2.append(title, path);
      li2.addEventListener("click", () => onSelect(page));
      listEl.appendChild(li2);
      options.push(li2);
    }
    return options;
  }

  // src/components/editor/componentSync/PageLink/parts/controller.ts
  function applyMode(host) {
    const { _refs: r, _mode: m } = host;
    r.pageSection.style.display = m === "page" ? "" : "none";
    r.externalSection.style.display = m === "external" ? "" : "none";
    r.mediaSection.style.display = m === "media" ? "" : "none";
    r.tabPage.classList.toggle("active", m === "page");
    r.tabExternal.classList.toggle("active", m === "external");
    r.tabMedia.classList.toggle("active", m === "media");
  }
  function setMode(host, m) {
    host._mode = m;
    applyMode(host);
    if (m === "external")
      requestAnimationFrame(() => host._refs.externalInput.focus());
  }
  function refresh(host, pages) {
    host._options = buildOptionList(host._refs.list, host._refs.empty, pages, (p) => select(host, p.path, p.title));
    host._options.forEach((li2) => li2.classList.toggle("selected", li2.dataset.value === host._value));
  }
  function select(host, v2, label) {
    setValue2(host, v2, label);
    closePanel2(host);
    host.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function setValue2(host, v2, label) {
    host._value = v2;
    const r = host._refs;
    r.display.textContent = v2 ? label : "No link";
    r.trigger.classList.toggle("has-value", !!v2);
    r.clearBtn.style.display = v2 ? "flex" : "none";
    host._options.forEach((li2) => li2.classList.toggle("selected", li2.dataset.value === v2));
    const m = isMedia(v2);
    r.mediaCurrent.textContent = m ? v2 : "";
    r.mediaCurrent.classList.toggle("has-value", m);
  }
  function openPanel2(host) {
    document.querySelectorAll("p9r-link, p9r-select").forEach((el) => {
      if (el !== host && "_close" in el)
        el._close();
    });
    host._isOpen = true;
    host._refs.panel.classList.add("open");
    host._refs.trigger.classList.add("open");
    host._refs.search.value = "";
    refresh(host, host._pages);
    requestAnimationFrame(() => {
      if (host._mode === "page")
        host._refs.search.focus();
      else if (host._mode === "external")
        host._refs.externalInput.focus();
    });
  }
  function closePanel2(host) {
    host._isOpen = false;
    host._refs.panel.classList.remove("open");
    host._refs.trigger.classList.remove("open");
  }

  // src/components/editor/componentSync/PageLink/parts/wiring.ts
  function wire(host) {
    const r = host._refs;
    const fire = () => host.dispatchEvent(new Event("change", { bubbles: true }));
    r.search.addEventListener("input", () => refresh(host, filterPages(host._pages, r.search.value)));
    r.clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      select(host, "", "No link");
    });
    r.tabPage.addEventListener("click", (e) => {
      e.stopPropagation();
      setMode(host, "page");
    });
    r.tabExternal.addEventListener("click", (e) => {
      e.stopPropagation();
      setMode(host, "external");
    });
    r.tabMedia.addEventListener("click", (e) => {
      e.stopPropagation();
      setMode(host, "media");
    });
    r.externalInput.addEventListener("input", () => {
      const url = r.externalInput.value.trim();
      setValue2(host, url, url || "No link");
      fire();
    });
    r.externalInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        closePanel2(host);
      } else if (e.key === "Escape")
        closePanel2(host);
    });
    r.mediaPickBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMediaCenter(host, (src) => {
        setValue2(host, src, mediaLabel(src));
        fire();
      });
    });
    applyMode(host);
  }

  // src/components/editor/componentSync/PageLink/PageLink.ts
  class PageLink extends HTMLElement {
    _refs;
    _options = [];
    _pages = [];
    _isOpen = false;
    _value = "";
    _mode = "page";
    _pagesFetched = false;
    _onWindowClick = (e) => {
      if (this._isOpen && !this.contains(e.target))
        this._close();
    };
    _onTriggerClick = (e) => {
      e.stopPropagation();
      this._isOpen ? this._close() : this._open();
    };
    _onKey = (e) => {
      if (e.key === "Escape")
        this._close();
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._isOpen ? this._close() : this._open();
      }
    };
    constructor() {
      super();
      this._refs = buildShadow2(this, this.getAttribute("label"));
      wire(this);
    }
    connectedCallback() {
      if (!this._pagesFetched) {
        this._pagesFetched = true;
        this._loadPages();
      }
      this._refs.trigger.addEventListener("click", this._onTriggerClick);
      this._refs.trigger.addEventListener("keydown", this._onKey);
      window.addEventListener("click", this._onWindowClick);
    }
    disconnectedCallback() {
      this._refs.trigger.removeEventListener("click", this._onTriggerClick);
      this._refs.trigger.removeEventListener("keydown", this._onKey);
      window.removeEventListener("click", this._onWindowClick);
    }
    _open() {
      openPanel2(this);
    }
    _close() {
      closePanel2(this);
    }
    async _loadPages() {
      this._pages = await fetchPages();
      refresh(this, this._pages);
      const v2 = this.getAttribute("value") || "";
      if (v2)
        this.value = v2;
    }
    get value() {
      return this._value;
    }
    set value(v2) {
      if (isMedia(v2)) {
        this._mode = "media";
        setValue2(this, v2, mediaLabel(v2));
      } else if (isExternal(v2)) {
        this._mode = "external";
        this._refs.externalInput.value = v2;
        setValue2(this, v2, v2);
      } else {
        this._mode = "page";
        const m = this._pages.find((p) => p.path === v2);
        setValue2(this, v2, m ? m.title : v2 || "No link");
      }
      applyMode(this);
    }
    get name() {
      return this.getAttribute("name");
    }
  }
  if (!customElements.get("p9r-link"))
    customElements.define("p9r-link", PageLink);

  // src/components/editor/componentSync/sync/AttrSync.ts
  class AttrSync extends HTMLElement {
    _component = null;
    _prepared = false;
    connectedCallback() {
      const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (componentIdentifier && !this._component) {
        this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`);
      }
      requestAnimationFrame(() => {
        if (!this._prepared)
          this._sync();
        this.addEventListener("input", (e) => this.onChange(e));
        this.addEventListener("change", (e) => this.onChange(e));
      });
    }
    prepare(component) {
      this._component = component;
      this._sync();
      this._prepared = true;
    }
    onChange(event) {
      const target = event.target;
      if (target && target.name) {
        if (target.value === "" || target.value == null) {
          this._component?.removeAttribute(target.name);
        } else {
          this._component?.setAttribute(target.name, target.value);
        }
      }
    }
    _sync() {
      const inputs2 = Array.from(this.querySelectorAll("[name]"));
      inputs2.forEach((input) => {
        const val = this._component?.getAttribute(input.name);
        if (val) {
          input.value = val;
        } else {
          if (input.value) {
            this._component?.setAttribute(input.name, input.value);
          }
        }
      });
    }
  }
  if (!customElements.get("p9r-attr-sync")) {
    customElements.define("p9r-attr-sync", AttrSync);
  }

  // src/components/editor/componentSync/sync/CompSync.ts
  class CompSync extends HTMLElement {
    _component = null;
    _root;
    _listEl;
    _titleEl;
    _countEl;
    _addBtn;
    _prepared = false;
    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      this._root.innerHTML = `
            <style>${CompSync._css}</style>
            <div class="panel">
                <div class="header">
                    <span class="title"></span>
                    <span class="count"></span>
                </div>
                <ul class="items"></ul>
                <button class="add" type="button" hidden>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span>Add</span>
                </button>
            </div>
        `;
      this._listEl = this._root.querySelector(".items");
      this._titleEl = this._root.querySelector(".title");
      this._countEl = this._root.querySelector(".count");
      this._addBtn = this._root.querySelector(".add");
      this._addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._add();
      });
    }
    connectedCallback() {
      const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (componentIdentifier && !this._component) {
        this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`);
      }
      requestAnimationFrame(() => {
        if (!this._prepared) {
          this._sync();
          console.debug(this._component);
          this._component?.connectedCallback();
        }
        this.init();
      });
    }
    prepare(component) {
      this._component = component;
      this._sync();
      this._component?.connectedCallback();
      this.init();
      this._prepared = true;
    }
    _sync() {
      const child = this.firstElementChild;
      if (!child) {
        throw new Error("p9r-comp-sync require a child");
      }
      const slotName = child.getAttribute("slot");
      const selector = slotName ? `[slot="${slotName}"]` : ":not([slot])";
      if (!this._component?.querySelector(selector)) {
        if (!this.isCreating && this.optionnal)
          return;
        const toAppend = child.cloneNode(true);
        toAppend.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
        this._component?.append(toAppend);
      }
    }
    init(opts) {
      const child = this.firstElementChild;
      const slotName = child?.getAttribute("slot");
      if (!child) {
        throw new Error("p9r-comp-sync require a child with attribute 'slot'");
      }
      const selector = slotName ? `:scope > [slot="${slotName}"]` : `:scope > :not([slot])`;
      let slots = Array.from(this._component?.querySelectorAll(selector));
      if (opts?.removed) {
        if (this.isConnected) {
          this._removePanelItem(opts.removed);
          this._updatePanelCount(slots.length);
          this._refreshAddBtn(slots.length);
        }
        if (this.isMultiple && slots.length === this.min) {
          slots.forEach((slot) => {
            if (!this.optionnal) {
              slot.setAttribute(p9r.attr.ACTION.DISABLE_DELETE, "true");
            }
            slot.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
            const id2 = slot.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
            if (id2)
              document.compIdentifierToEditor.get(id2)?.viewEditor();
          });
        }
        return;
      }
      const addedNode = opts?.added;
      const toProcess = addedNode && slots.includes(addedNode) ? [addedNode] : slots;
      toProcess.forEach((slot) => {
        const slotEditor = document.compIdentifierToEditor.get(slot.getAttribute(p9r.attr.EDITOR.IDENTIFIER));
        slot.setAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE, "true");
        slot.setAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER, "true");
        slot.setAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE, "true");
        slot.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
        if (this.disableOthersComponents) {
          slot.setAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT, "true");
        } else {
          slot.removeAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT);
        }
        if (this.optionnal) {
          slot.removeAttribute(p9r.attr.ACTION.DISABLE_DELETE);
        } else {
          slot.setAttribute(p9r.attr.ACTION.DISABLE_DELETE, "true");
        }
        slot.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER));
        if (this.isMultiple) {
          if (this.inlineAdding) {
            slot.setAttribute(p9r.attr.ACTION.INLINE_ADDING, "true");
          } else {
            slot.removeAttribute(p9r.attr.ACTION.INLINE_ADDING);
          }
          slot.removeAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE);
          slot.removeAttribute(p9r.attr.ACTION.DISABLE_DELETE);
          slot.removeAttribute(p9r.attr.ACTION.DISABLE_DRAGGING);
          slot.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER);
          slot.removeAttribute(p9r.attr.ACTION.DISABLE_ADD_BEFORE);
          if (slots.length == this.min) {
            if (!this.optionnal) {
              slot.setAttribute(p9r.attr.ACTION.DISABLE_DELETE, "true");
            }
            slot.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
          }
        } else {}
        slotEditor?.viewEditor();
      });
      if (!this.isConnected)
        return;
      if (addedNode && slots.includes(addedNode)) {
        this._appendPanelItem(addedNode, slots.length - 1);
        this._updatePanelCount(slots.length);
        this._refreshAddBtn(slots.length);
      } else {
        this._renderPanel(slots);
      }
    }
    _renderPanel(slots) {
      this._titleEl.textContent = this._titleLabel();
      this._updatePanelCount(slots.length);
      this._listEl.innerHTML = "";
      slots.forEach((slot, index) => this._appendPanelItem(slot, index));
      this._refreshAddBtn(slots.length);
    }
    _refreshAddBtn(count) {
      const optionalEmptySingle = this.optionnal && !this.isMultiple && count === 0;
      const canAddMultiple = this.isMultiple && count < this.max;
      this._addBtn.hidden = !(this.isMultiple || optionalEmptySingle);
      this._addBtn.disabled = !(canAddMultiple || optionalEmptySingle);
    }
    _updatePanelCount(total) {
      if (this.isMultiple) {
        const max = this.max === Infinity ? "∞" : String(this.max);
        this._countEl.textContent = `${total} / ${max}`;
        this._countEl.hidden = false;
      } else {
        this._countEl.textContent = "";
        this._countEl.hidden = true;
      }
    }
    _appendPanelItem(slot, index) {
      const li2 = document.createElement("li");
      li2._slot = slot;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item";
      btn.innerHTML = `
            <span class="item-index">#${index + 1}</span>
            <span class="item-label"></span>
        `;
      btn.querySelector(".item-label").textContent = this._slotLabel(slot);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._focus(slot);
      });
      li2.append(btn);
      this._listEl.append(li2);
    }
    _removePanelItem(removed) {
      const lis = Array.from(this._listEl.children);
      for (const li2 of lis) {
        if (li2._slot === removed) {
          li2.remove();
          break;
        }
      }
      Array.from(this._listEl.children).forEach((li2, i) => {
        const idx = li2.querySelector(".item-index");
        if (idx)
          idx.textContent = `#${i + 1}`;
      });
    }
    _titleLabel() {
      const custom = this.getAttribute("label");
      if (custom)
        return custom;
      const child = this.firstElementChild;
      const slotName = child?.getAttribute("slot");
      return slotName || "Default slot";
    }
    _slotLabel(slot) {
      const text = (slot.textContent || "").trim().replace(/\s+/g, " ");
      if (text.length > 0) {
        return text.length > 40 ? text.slice(0, 40) + "…" : text;
      }
      return `<${slot.tagName.toLowerCase()}>`;
    }
    _focus(slot) {
      this.closest("p9r-config-panel")?.close?.();
      slot.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!slot.hasAttribute("tabindex"))
        slot.setAttribute("tabindex", "-1");
      try {
        slot.focus({ preventScroll: true });
      } catch {}
    }
    _add() {
      if (!this._component)
        return;
      const template = this.firstElementChild;
      if (!template)
        return;
      const current = this._countSlots();
      if (this.isMultiple) {
        if (current >= this.max)
          return;
      } else {
        if (!this.optionnal || current > 0)
          return;
      }
      const clone = template.cloneNode(true);
      clone.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
      this._component.append(clone);
    }
    _countSlots() {
      if (!this._component)
        return 0;
      const child = this.firstElementChild;
      const slotName = child?.getAttribute("slot");
      const selector = slotName ? `:scope > [slot="${slotName}"]` : `:scope > :not([slot])`;
      return this._component.querySelectorAll(selector).length;
    }
    get isMultiple() {
      return this.hasAttribute("allow-multiple");
    }
    get optionnal() {
      return this.hasAttribute("optionnal");
    }
    get min() {
      const raw = this.getAttribute("data-min") ?? this.getAttribute("min");
      const n = raw != null ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : 1;
    }
    get max() {
      const raw = this.getAttribute("data-max") ?? this.getAttribute("max");
      const n = raw != null ? parseInt(raw, 10) : NaN;
      return Number.isFinite(n) && n >= 1 ? n : Infinity;
    }
    get inlineAdding() {
      return this.hasAttribute(p9r.attr.ACTION.INLINE_ADDING);
    }
    get disableOthersComponents() {
      return this.hasAttribute("disable-others-components");
    }
    get isCreating() {
      return this._component?.getAttribute(p9r.attr.EDITOR.IS_CREATING) === "true";
    }
    static _css = `
        :host {
            display: block;
            margin: 8px 0;
        }

        .panel {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 10px;
            background: var(--bg-surface, #fff);
        }

        .header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 8px;
        }

        .title {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-muted, #94a3b8);
        }

        .count {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-muted, #94a3b8);
            font-variant-numeric: tabular-nums;
        }

        .items {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .items:empty {
            display: none;
        }

        .item {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 7px 10px;
            border: 1px solid var(--border-default, #e2e8f0);
            border-radius: 8px;
            background: var(--bg-surface, #fff);
            color: var(--text-main, #1e293b);
            font-size: 12px;
            font-weight: 500;
            text-align: left;
            cursor: pointer;
            transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
            outline: none;
        }

        .item:hover {
            border-color: var(--primary-base, #4361ee);
            background: var(--primary-muted, rgb(67 97 238 / 0.08));
        }

        .item:focus-visible {
            border-color: var(--primary-base, #4361ee);
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
        }

        .item-index {
            flex-shrink: 0;
            font-size: 10px;
            font-weight: 700;
            color: var(--text-muted, #94a3b8);
            font-variant-numeric: tabular-nums;
        }

        .item-label {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .add {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            padding: 7px 10px;
            margin-top: 2px;
            border: 1px dashed var(--border-default, #e2e8f0);
            border-radius: 8px;
            background: transparent;
            color: var(--text-muted, #94a3b8);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
            outline: none;
        }

        .add:hover:not(:disabled) {
            border-color: var(--primary-base, #4361ee);
            color: var(--primary-base, #4361ee);
            background: var(--primary-muted, rgb(67 97 238 / 0.08));
        }

        .add:focus-visible {
            border-color: var(--primary-base, #4361ee);
            box-shadow: 0 0 0 3px var(--primary-muted, rgb(67 97 238 / 0.15));
        }

        .add:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    `;
  }
  if (!customElements.get("p9r-comp-sync")) {
    customElements.define("p9r-comp-sync", CompSync);
  }

  // src/components/editor/componentSync/sync/ImageSync/ImageSync.style.css
  var ImageSync_style_default = `:host {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.image-sync-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted, #94a3b8);
}

.image-sync-card {
    position: relative;
    border: 1px dashed var(--border-default, #e2e8f0);
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.15s;
    background: var(--bg-base, #f8fafc);
}

.image-sync-card:hover {
    border-color: var(--primary-base, #4361ee);
}

.image-sync-card.has-image {
    border-style: solid;
    padding: 1rem;
}

/* ── Preview image ── */

.image-sync-card img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: contain;
    object-position: center;
}

/* ── Empty state ── */

.image-sync-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 20px;
    aspect-ratio: 16 / 9;
}

.image-sync-empty svg {
    color: var(--text-muted, #94a3b8);
    opacity: 0.5;
}

.image-sync-empty span {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted, #94a3b8);
}

/* ── Overlay actions ── */

.image-sync-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgb(0 0 0 / 0);
    transition: background 0.15s;
    opacity: 0;
}

.image-sync-card:hover .image-sync-overlay {
    opacity: 1;
    background: rgb(0 0 0 / 0.4);
}

.image-sync-overlay button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 12px;
    border: none;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.1s, opacity 0.1s;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}

.image-sync-overlay button:active {
    transform: scale(0.95);
}

.image-sync-overlay .btn-change {
    background: rgb(255 255 255 / 0.9);
    color: var(--text-main, #1e293b);
}

.image-sync-overlay .btn-remove {
    background: rgb(255 255 255 / 0.15);
    color: #fff;
}

.image-sync-overlay .btn-remove:hover {
    background: var(--danger-base, #ef4444);
}
`;

  // src/components/editor/componentSync/sync/ImageSync/lock.ts
  var LOCKED_ACTIONS = [
    "DISABLE_DELETE",
    "DISABLE_DUPLICATE",
    "DISABLE_ADD_BEFORE",
    "DISABLE_ADD_AFTER",
    "DISABLE_CHANGE_COMPONENT",
    "DISABLE_DRAGGING",
    "DISABLE_SAVE_AS_TEMPLATE"
  ];
  function lockActions(target) {
    if (!target)
      return;
    let changed = false;
    for (const key of LOCKED_ACTIONS) {
      const attr = p9r.attr.ACTION[key];
      if (target.getAttribute(attr) !== "true") {
        target.setAttribute(attr, "true");
        changed = true;
      }
    }
    if (!changed)
      return;
    const id2 = target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
    if (id2) {
      const editor = document.compIdentifierToEditor?.get(id2);
      editor?.viewEditor();
    }
  }

  // src/components/editor/componentSync/sync/ImageSync/target.ts
  function resolveTarget(host) {
    const component = host._component;
    if (!component)
      return null;
    const slot = host.slotName;
    if (!slot)
      return component.querySelector("img");
    return component.querySelector(`img[slot="${slot}"]`);
  }
  function ensureTarget(host) {
    let target = resolveTarget(host);
    if (target)
      return target;
    target = document.createElement("img");
    const slot = host.slotName;
    if (slot)
      target.setAttribute("slot", slot);
    lockActions(target);
    host._component.appendChild(target);
    return target;
  }
  function syncDefault(host) {
    const defaultSrc = host.getAttribute("default");
    if (!defaultSrc)
      return;
    if (resolveTarget(host))
      return;
    if (host.optionnal && !host.isCreating)
      return;
    const img = document.createElement("img");
    const slot = host.slotName;
    if (slot)
      img.setAttribute("slot", slot);
    img.setAttribute("src", defaultSrc);
    lockActions(img);
    host._component?.appendChild(img);
  }

  // src/components/editor/componentSync/sync/ImageSync/view.ts
  function render(host) {
    host._target = resolveTarget(host);
    lockActions(host._target);
    watchTarget(host);
    const label = host.getAttribute("label") || "Image";
    const currentValue = host._target?.getAttribute("src") || "";
    const shadow = host.shadowRoot;
    Array.from(shadow.children).forEach((c) => {
      if (c.tagName !== "STYLE")
        c.remove();
    });
    const labelEl = document.createElement("span");
    labelEl.className = "image-sync-label";
    labelEl.textContent = label;
    const card = document.createElement("div");
    card.className = "image-sync-card";
    host._previewImg = document.createElement("img");
    host._emptyState = document.createElement("div");
    host._emptyState.className = "image-sync-empty";
    host._emptyState.innerHTML = `${ICON_UPLOAD}<span>Click to choose an image</span>`;
    host._overlay = document.createElement("div");
    host._overlay.className = "image-sync-overlay";
    const btnChange = document.createElement("button");
    btnChange.className = "btn-change";
    btnChange.textContent = "Change";
    btnChange.addEventListener("click", (e) => {
      e.stopPropagation();
      host.openMediaCenter();
    });
    const btnRemove = document.createElement("button");
    btnRemove.className = "btn-remove";
    btnRemove.textContent = "Remove";
    btnRemove.addEventListener("click", (e) => {
      e.stopPropagation();
      host.clearTarget();
    });
    host._overlay.appendChild(btnChange);
    host._overlay.appendChild(btnRemove);
    card.appendChild(host._previewImg);
    card.appendChild(host._emptyState);
    card.appendChild(host._overlay);
    card.addEventListener("click", () => host.openMediaCenter());
    shadow.appendChild(labelEl);
    shadow.appendChild(card);
    updatePreview(host, currentValue);
  }
  function updatePreview(host, src) {
    if (!host._previewImg || !host._emptyState || !host._overlay)
      return;
    const card = host._previewImg.parentElement;
    if (src) {
      host._previewImg.src = src;
      host._previewImg.style.display = "block";
      host._emptyState.style.display = "none";
      host._overlay.style.display = "flex";
      card.classList.add("has-image");
    } else {
      host._previewImg.style.display = "none";
      host._emptyState.style.display = "flex";
      host._overlay.style.display = "none";
      card.classList.remove("has-image");
    }
  }
  function watchTarget(host) {
    host._targetObserver?.disconnect();
    host._targetObserver = null;
    const target = host._target;
    if (!target)
      return;
    host._targetObserver = new MutationObserver(() => {
      updatePreview(host, target.getAttribute("src") || "");
    });
    host._targetObserver.observe(target, { attributes: true, attributeFilter: ["src"] });
  }

  // src/components/editor/componentSync/sync/ImageSync/mediaCenter.ts
  function openMediaCenter2(host) {
    const acceptRaw = host.getAttribute("accept") || "image";
    const types = ["folder", ...acceptRaw.split(",").map((t) => t.trim())];
    const mediaCenter = document.createElement("cms-media-center");
    document.body.appendChild(mediaCenter);
    requestAnimationFrame(() => {
      const handler = (e) => {
        mediaCenter.removeEventListener("select-item", handler);
        const src = e.detail?.src;
        if (src) {
          host._target = ensureTarget(host);
          lockActions(host._target);
          watchTarget(host);
          host._target.setAttribute("src", src);
          updatePreview(host, src);
        }
        mediaCenter.remove();
      };
      mediaCenter.addEventListener("select-item", handler);
      mediaCenter.show(types);
    });
  }
  function clearTarget(host) {
    if (host._target) {
      host._target.remove();
      host._target = null;
    }
    watchTarget(host);
    updatePreview(host, "");
  }

  // src/components/editor/componentSync/sync/ImageSync/ImageSync.ts
  class ImageSync extends HTMLElement {
    _component = null;
    _target = null;
    _previewImg = null;
    _emptyState = null;
    _overlay = null;
    _targetObserver = null;
    _prepared = false;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML = `<style>${ImageSync_style_default}</style>`;
    }
    connectedCallback() {
      const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (componentIdentifier && !this._component) {
        this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`);
      }
      requestAnimationFrame(() => {
        if (!this._prepared)
          syncDefault(this);
        render(this);
      });
    }
    disconnectedCallback() {
      this._targetObserver?.disconnect();
      this._targetObserver = null;
    }
    prepare(component) {
      this._component = component;
      syncDefault(this);
      this._target = resolveTarget(this);
      lockActions(this._target);
      watchTarget(this);
      this._prepared = true;
    }
    init(opts) {
      const target = resolveTarget(this);
      if (opts?.added && opts.added !== target)
        return;
      if (opts?.removed && opts.removed !== this._target && opts.removed !== target)
        return;
      this._target = target;
      lockActions(this._target);
      watchTarget(this);
      updatePreview(this, this._target?.getAttribute("src") || "");
    }
    openMediaCenter() {
      openMediaCenter2(this);
    }
    clearTarget() {
      clearTarget(this);
    }
    get slotName() {
      return this.getAttribute("slotTarget") || "";
    }
    get isMultiSelect() {
      return this.hasAttribute("multi-select");
    }
    get optionnal() {
      return this.hasAttribute("optionnal");
    }
    get isCreating() {
      return this._component?.getAttribute(p9r.attr.EDITOR.IS_CREATING) === "true";
    }
  }
  if (!customElements.get("p9r-image-sync")) {
    customElements.define("p9r-image-sync", ImageSync);
  }

  // src/components/editor/componentSync/sync/StateSync/parseAttrs.ts
  function parseValues(el) {
    const raw = el.getAttribute("values");
    if (raw)
      return raw.split(",").map((s2) => s2.trim()).filter(Boolean);
    const v2 = el.getAttribute("value") || "";
    return v2 ? [v2] : [];
  }
  function parseLabels(el, values) {
    const raw = el.getAttribute("labels");
    if (raw)
      return raw.split(",").map((s2) => s2.trim());
    return values;
  }
  function parsePlacement(el) {
    const v2 = el.getAttribute("placement");
    return v2 === "right" || v2 === "top" || v2 === "bottom" ? v2 : "left";
  }

  // src/components/editor/componentSync/sync/StateSync/applyTargets.ts
  function makeStateAttrOps(attrName) {
    if (attrName === "class")
      return {
        apply: (el, v2) => el.classList.add(v2),
        clear: (el, v2) => el.classList.remove(v2),
        isApplied: (el, v2) => el.classList.contains(v2)
      };
    return {
      apply: (el, v2) => el.setAttribute(attrName, v2),
      clear: (el) => el.removeAttribute(attrName),
      isApplied: (el, v2) => el.getAttribute(attrName) === v2
    };
  }

  // src/components/editor/componentSync/sync/StateSync/StateSync.ts
  class StateSync extends HTMLElement {
    _component = null;
    _editor = null;
    _activeValue = null;
    _observer = null;
    _ops = null;
    _prepared = false;
    get targetSelector() {
      return this.getAttribute("target") || "";
    }
    get attrName() {
      return this.getAttribute("attr") || "";
    }
    get isMulti() {
      return this.getAttribute("values") !== null;
    }
    get values() {
      return parseValues(this);
    }
    get labels() {
      return parseLabels(this, this.values);
    }
    get label() {
      return this.getAttribute("label") || this.labels[0] || this.attrName;
    }
    get placement() {
      return parsePlacement(this);
    }
    get activeValue() {
      return this._activeValue;
    }
    get isPinned() {
      return this._activeValue !== null;
    }
    setActiveValue(value) {
      if (value !== null && !this.values.includes(value))
        return;
      if (value === this._activeValue)
        return;
      const targets = this._targets();
      if (value !== null && targets.length === 0)
        return;
      this._ops ??= makeStateAttrOps(this.attrName);
      if (this._activeValue !== null)
        targets.forEach((el) => this._ops.clear(el, this._activeValue));
      if (value !== null)
        targets.forEach((el) => this._ops.apply(el, value));
      if (value !== null && this._observer === null)
        this._startObserver(targets);
      if (value === null)
        this._stopObserver();
      this._activeValue = value;
    }
    toggle() {
      this.setActiveValue(this._activeValue === null ? this.values[0] ?? null : null);
    }
    unpin() {
      this.setActiveValue(null);
    }
    connectedCallback() {
      if (this._prepared)
        return;
      const id2 = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (!id2)
        return;
      this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${id2}"]`);
      this._editor = document.compIdentifierToEditor?.get(id2) ?? null;
      this._editor?.registerStateSync(this);
    }
    prepare(component, editor) {
      this._component = component;
      this._editor = editor;
      editor.registerStateSync(this);
      this._prepared = true;
    }
    disconnectedCallback() {
      this.setActiveValue(null);
      this._editor?.unregisterStateSync(this);
    }
    _targets() {
      const root = this._component?.shadowRoot;
      if (!root || !this.targetSelector)
        return [];
      return Array.from(root.querySelectorAll(this.targetSelector));
    }
    _startObserver(targets) {
      const filter = this.attrName === "class" ? ["class"] : [this.attrName];
      this._observer = new MutationObserver(() => {
        const v2 = this._activeValue;
        if (v2 === null)
          return;
        targets.forEach((el) => {
          if (!this._ops.isApplied(el, v2))
            this._ops.apply(el, v2);
        });
      });
      targets.forEach((el) => this._observer.observe(el, { attributes: true, attributeFilter: filter }));
    }
    _stopObserver() {
      this._observer?.disconnect();
      this._observer = null;
    }
  }
  if (!customElements.get("p9r-state-sync")) {
    customElements.define("p9r-state-sync", StateSync);
  }

  // src/components/editor/componentSync/SyncPanel.ts
  class SyncPanel extends A2 {
    dialog = null;
    constructor() {
      super({
        css: "",
        template: `
            <w13c-lateral-dialog>
                <slot></slot>
                <span slot="title">Element Configuration</span>
            </w13c-lateral-dialog>
            `
      });
    }
    connectedCallback() {
      this.dialog = this.shadowRoot?.querySelector("w13c-lateral-dialog");
    }
    show() {
      this.dialog?.show();
    }
    close() {
      this.dialog?.close();
    }
    init(opts) {
      const elements = Array.from(this.querySelectorAll("*"));
      for (const element of elements) {
        if (element.init)
          element.init(opts);
      }
    }
  }
  if (!customElements.get("p9r-config-panel")) {
    customElements.define("p9r-config-panel", SyncPanel);
  }

  // src/components/editor/componentSync/sync/SvgSync/SvgSync.style.css
  var SvgSync_style_default = `:host {
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

.card {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px dashed var(--border-default, #e2e8f0);
    border-radius: 10px;
    background: var(--bg-base, #f8fafc);
    padding: 8px 12px;
    cursor: pointer;
    transition: border-color 0.15s;
}
.card:hover { border-color: var(--primary-base, #4361ee); }

.preview {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    color: var(--text-main, #0f172a);
}
.preview svg { width: 100%; height: 100%; display: block; }

.empty {
    width: 32px;
    height: 32px;
    border: 1px dashed var(--border-default, #cbd5e1);
    border-radius: 6px;
    flex-shrink: 0;
}

.action {
    flex: 1;
    font-size: 12px;
    color: var(--text-body, #334155);
}

.error {
    font-size: 11px;
    color: var(--danger-base, #ef4444);
    margin-top: 2px;
}
`;

  // src/components/editor/componentSync/sync/SvgSync/lock.ts
  var LOCKED_ACTIONS2 = [
    "DISABLE_DELETE",
    "DISABLE_DUPLICATE",
    "DISABLE_ADD_BEFORE",
    "DISABLE_ADD_AFTER",
    "DISABLE_CHANGE_COMPONENT",
    "DISABLE_DRAGGING",
    "DISABLE_SAVE_AS_TEMPLATE"
  ];
  function lockActions2(target) {
    if (!target)
      return;
    let changed = false;
    for (const key of LOCKED_ACTIONS2) {
      const attr = p9r.attr.ACTION[key];
      if (target.getAttribute(attr) !== "true") {
        target.setAttribute(attr, "true");
        changed = true;
      }
    }
    if (!changed)
      return;
    const id2 = target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
    if (id2) {
      const editor = document.compIdentifierToEditor?.get(id2);
      editor?.viewEditor();
    }
  }

  // src/components/editor/componentSync/sync/SvgSync/target.ts
  function resolveTarget2(host) {
    const component = host._component;
    if (!component)
      return null;
    const slot = host.slotName;
    if (!slot)
      return component.querySelector("svg");
    return component.querySelector(`svg[slot="${slot}"]`);
  }
  function syncDefault2(host) {
    if (resolveTarget2(host))
      return;
    const template = host.querySelector("svg");
    if (!template)
      return;
    const fresh = template.cloneNode(true);
    if (host.slotName)
      fresh.setAttribute("slot", host.slotName);
    lockActions2(fresh);
    host._component?.appendChild(fresh);
  }

  // src/components/editor/componentSync/sync/SvgSync/view.ts
  function render2(host) {
    const shadow = host.shadowRoot;
    Array.from(shadow.children).forEach((c) => {
      if (c.tagName !== "STYLE")
        c.remove();
    });
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = host.getAttribute("label") || "Icon";
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("part", "card");
    host._preview = document.createElement("div");
    host._preview.className = "preview";
    host._preview.setAttribute("part", "preview");
    const action = document.createElement("span");
    action.className = "action";
    action.textContent = "Click to swap…";
    card.appendChild(host._preview);
    card.appendChild(action);
    card.addEventListener("click", () => host.openMediaCenter());
    host._error = document.createElement("div");
    host._error.className = "error";
    host._error.setAttribute("part", "error");
    host._error.hidden = true;
    shadow.appendChild(label);
    shadow.appendChild(card);
    shadow.appendChild(host._error);
    updatePreview2(host);
  }
  function updatePreview2(host) {
    if (!host._preview)
      return;
    host._preview.innerHTML = "";
    const live = resolveTarget2(host);
    const source = live ?? host.querySelector("svg");
    if (source) {
      host._preview.appendChild(source.cloneNode(true));
    } else {
      const empty = document.createElement("div");
      empty.className = "empty";
      host._preview.appendChild(empty);
    }
  }

  // src/components/editor/componentSync/sync/SvgSync/sanitize.ts
  var ALLOWED_TAGS = new Set([
    "svg",
    "g",
    "defs",
    "symbol",
    "use",
    "title",
    "desc",
    "path",
    "circle",
    "rect",
    "line",
    "polyline",
    "polygon",
    "ellipse",
    "clippath",
    "mask",
    "marker",
    "lineargradient",
    "radialgradient",
    "stop",
    "pattern",
    "text",
    "tspan",
    "filter",
    "feblend",
    "fecolormatrix",
    "fecomponenttransfer",
    "fecomposite",
    "feconvolvematrix",
    "fediffuselighting",
    "fedisplacementmap",
    "fedistantlight",
    "feflood",
    "fefunca",
    "fefuncb",
    "fefuncg",
    "fefuncr",
    "fegaussianblur",
    "feimage",
    "femerge",
    "femergenode",
    "femorphology",
    "feoffset",
    "fepointlight",
    "fespecularlighting",
    "fespotlight",
    "fetile",
    "feturbulence"
  ]);
  function sanitizeSvg(raw) {
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (doc.querySelector("parsererror")) {
      throw new Error("Invalid SVG: failed to parse.");
    }
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") {
      throw new Error(`Expected <svg> root element, got <${root?.tagName ?? "null"}>.`);
    }
    walk(root);
    return new XMLSerializer().serializeToString(root);
  }
  function walk(el) {
    if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
      el.remove();
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" || name === "xlink:href") {
        const v2 = attr.value.trim().toLowerCase();
        const safe = v2.startsWith("#") || v2.startsWith("/") || v2.startsWith("./") || v2.startsWith("../") || v2.startsWith("http:") || v2.startsWith("https:");
        if (!safe)
          el.removeAttribute(attr.name);
      }
    }
    for (const child of Array.from(el.children))
      walk(child);
  }

  // src/components/editor/componentSync/sync/SvgSync/mediaCenter.ts
  function openPicker(host) {
    host._clearError();
    const mc = document.createElement("cms-media-center");
    document.body.appendChild(mc);
    const handler = async (e) => {
      mc.removeEventListener("select-item", handler);
      const src = e.detail?.src;
      const mimetype = e.detail?.mimetype;
      mc.remove();
      if (!src)
        return;
      if (mimetype !== "image/svg+xml") {
        host._showError("Please pick an SVG file.");
        return;
      }
      try {
        const raw = await fetch(src).then((r) => r.text());
        const cleaned = sanitizeSvg(raw);
        swapInto(host, cleaned);
      } catch (err) {
        host._showError(err instanceof Error ? err.message : String(err));
      }
    };
    mc.addEventListener("select-item", handler);
    requestAnimationFrame(() => mc.show(["folder", "image"]));
  }
  function swapInto(host, svgMarkup) {
    const target = resolveTarget2(host);
    if (!target) {
      host._showError("Target SVG not found in bloc.");
      return;
    }
    const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
    const fresh = parsed.documentElement;
    if (!(fresh instanceof SVGElement)) {
      host._showError("Sanitized markup is not a valid SVG.");
      return;
    }
    const slot = target.getAttribute("slot");
    if (slot)
      fresh.setAttribute("slot", slot);
    const cls = target.getAttribute("class");
    if (cls)
      fresh.setAttribute("class", cls);
    lockActions2(fresh);
    target.replaceWith(fresh);
    updatePreview2(host);
  }

  // src/components/editor/componentSync/sync/SvgSync/SvgSync.ts
  class SvgSync extends HTMLElement {
    _component = null;
    _target = null;
    _preview = null;
    _error = null;
    _prepared = false;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML = `<style>${SvgSync_style_default}</style>`;
    }
    connectedCallback() {
      const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (componentIdentifier && !this._component) {
        this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`);
      }
      requestAnimationFrame(() => {
        if (!this._prepared)
          syncDefault2(this);
        render2(this);
      });
    }
    prepare(component) {
      this._component = component;
      syncDefault2(this);
      this._target = resolveTarget2(this);
      lockActions2(this._target);
      this._prepared = true;
    }
    init(opts) {
      const target = resolveTarget2(this);
      const added = opts?.added;
      const removed = opts?.removed;
      if (added && added !== target)
        return;
      if (removed && removed !== this._target && removed !== target)
        return;
      this._target = target;
      lockActions2(this._target);
      updatePreview2(this);
    }
    openMediaCenter() {
      openPicker(this);
    }
    _showError(msg) {
      if (!this._error)
        return;
      this._error.textContent = msg;
      this._error.hidden = false;
    }
    _clearError() {
      if (!this._error)
        return;
      this._error.textContent = "";
      this._error.hidden = true;
    }
    get slotName() {
      return this.getAttribute("slotTarget") || "";
    }
  }
  if (!customElements.get("p9r-svg-sync")) {
    customElements.define("p9r-svg-sync", SvgSync);
  }

  // ../../foundation/components/dist/blocs/horizontal-action-group.mjs
  var l = `<div class="actions" role="toolbar" part="toolbar">
    <slot></slot>
</div>
`;
  var n = `:host {
  display: inline-block;

  --_toolbar-bg: var(--bg-overlay, #ffffff);
  --_toolbar-border: var(--border-default, #e5e7eb);
  --_toolbar-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --_toolbar-radius: 12px;
  --_toolbar-padding: 6px;
  --_toolbar-gap: 4px;

  --_color: var(--info-contrasted, #3b82f6);
  --_hover-color: var(--primary-contrasted, #3b82f6);

  --_bg-color: var(--bg-overlay, white);
  --_bg-hover-color: var(--primary-muted, #3b82f6);

  --_border-color: var(--border-default, #e5e7eb);

  touch-action: none;
}

.actions {
  display: flex;
  align-items: center;
  background: var(--_toolbar-bg);
  border: 1px solid var(--_toolbar-border);
  border-radius: var(--_toolbar-radius);
  box-shadow: var(--_toolbar-shadow);
  overflow: hidden;
  width: fit-content;
  padding: var(--_toolbar-padding);
  gap: var(--_toolbar-gap);
}

:host([align="start"]) .actions { justify-content: flex-start; }
:host([align="center"]) .actions { justify-content: center; }
:host([align="end"]) .actions { justify-content: flex-end; }

:host([fullwidth]),
:host([fullwidth]) .actions {
  width: 100%;
}

::slotted([hidden]) {
  display: none !important;
}

::slotted([data-action]) {
  display: flex;
  align-items: center;
  padding: 10px;
  background: var(--_bg-color);
  border: none;
  border-radius: 8px;
  color: var(--_color);
  cursor: pointer;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  white-space: nowrap;
}

::slotted([data-action]:hover) {
  background-color: var(--_bg-hover-color);
  color: var(--_hover-color);
}

::slotted([data-action]:focus-visible) {
  outline: 2px solid var(--_color);
  outline-offset: 2px;
}

::slotted([data-action][disabled]),
::slotted([data-action][aria-disabled="true"]) {
  opacity: 0.4;
  pointer-events: none;
}

::slotted(.separator) {
  width: 1px;
  height: 1.7rem;
  background-color: var(--_border-color);
  margin: 0 4px;
  align-self: center;
}

@media (prefers-reduced-motion: no-preference) {
  ::slotted([data-action]) {
    transition: background-color 0.2s ease, color 0.2s ease;
  }
}
`;

  class e extends HTMLElement {
    _rawStyles = "";
    _styles = null;
    constructor(t) {
      super();
      let o = this.attachShadow({ mode: "open" });
      if (t) {
        this._rawStyles = t.css, this._styles = document.createElement("style"), this._styles.innerHTML = t.css, o.appendChild(this._styles);
        let r = document.createElement("template");
        r.innerHTML = t.template, o.appendChild(r.content.cloneNode(true));
      }
    }
    registerCSSVariables(t) {
      if (!this._styles)
        return;
      let o = this._rawStyles;
      Object.entries(t).forEach(([r, a]) => {
        o = o.replaceAll("var(--" + r + ")", a);
      }), this._styles.innerHTML = o;
    }
    connectedCallback() {}
  }
  function s2(t, o) {
    if (Object.prototype.hasOwnProperty.call(t, o)) {
      let r = t[o];
      delete t[o], t[o] = r;
    }
  }

  class d2 extends e {
    static _event = "action-click";
    _toolbar;
    constructor() {
      super({ css: n, template: l });
      this._toolbar = this.shadowRoot?.querySelector(".actions") ?? null;
    }
    static get observedAttributes() {
      return ["label"];
    }
    connectedCallback() {
      for (let t of ["label"])
        s2(this, t);
      if (this._toolbar && !this._toolbar.hasAttribute("aria-label")) {
        let t = this.getAttribute("label");
        if (t)
          this._toolbar.setAttribute("aria-label", t);
      }
      this.addEventListener("click", this._handleClick);
    }
    disconnectedCallback() {
      this.removeEventListener("click", this._handleClick);
    }
    attributeChangedCallback(t, o, r) {
      if (!this._toolbar)
        return;
      if (t === "label")
        if (r === null)
          this._toolbar.removeAttribute("aria-label");
        else
          this._toolbar.setAttribute("aria-label", r);
    }
    _handleClick = (t) => {
      let r = t.composedPath().find((i) => i instanceof Element && i.hasAttribute("data-action"));
      if (!r)
        return;
      t.stopPropagation();
      let a = r.getAttribute("data-action");
      this._dispatchAction(a, r, t);
    };
    _dispatchAction(t, o, r) {
      this.dispatchEvent(new CustomEvent("action-click", { detail: { action: t, originalEvent: r, target: o }, bubbles: true, composed: true }));
    }
    get label() {
      return this.getAttribute("label");
    }
    set label(t) {
      if (t === null)
        this.removeAttribute("label");
      else
        this.setAttribute("label", t);
    }
  }

  // src/components/editor/EditorSystem/BlocActions/view/style.css
  var style_default3 = `:host {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    padding: 8px 32px 8px 16px;
    z-index: 10000;
    will-change: transform, opacity;
    transition: opacity 0.1s ease-out;
}

::slotted([data-action="pin-state"][data-active]) {
    background: var(--primary-muted, #eef2ff) !important;
    color: var(--primary-base, #4361ee) !important;
}

:host([data-variant="snippet"]) {
    --_color: #007aff;
    --_hover-color: #005bb5;
    --_bg-color: #f0f7ff;
    --_bg-hover-color: rgba(0, 122, 255, 0.15);
    --_border-color: rgba(0, 122, 255, 0.3);
    --toolbar-bg: #f0f7ff;
    --toolbar-border: rgba(0, 122, 255, 0.3);
}

/* ── Breadcrumb host position (relative to BAG) ─────────────────────
   The pill internals + hover-bridge live in cms-bag-breadcrumb's own
   stylesheet — here we only place the host element relative to BAG. */

cms-bag-breadcrumb {
    position: absolute;
    bottom: calc(100% + 2px);
    left: 16px;
}

:host([data-v-anchor="bottom"]) cms-bag-breadcrumb {
    bottom: auto;
    top: calc(100% + 2px);
}

cms-bag-breadcrumb[data-inline="left"] {
    top: 50% !important;
    bottom: auto !important;
    left: auto !important;
    right: calc(100% + 4px);
    transform: translate(16px, -50%);
}

cms-bag-breadcrumb[data-inline="right"] {
    top: 50% !important;
    bottom: auto !important;
    left: calc(100% + 4px) !important;
    right: auto;
    transform: translate(-32px, -50%);
}

/* The link section's styles live inside the section element itself
   (mountLinkSection.ts) — slotted light-DOM children can't be reached
   from this shadow stylesheet beyond the wrapper itself. */
`;

  // src/components/editor/EditorSystem/BlocActions/compute/ancestorChain.ts
  function findParentEditor(target) {
    const parentId = target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (!parentId)
      return null;
    return document.compIdentifierToEditor?.get(parentId) ?? null;
  }
  function ancestorChain(editor) {
    const chain = [editor];
    let el = editor.target;
    for (let i = 0;i < 20; i++) {
      const pid = el.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (!pid)
        break;
      const pEd = document.compIdentifierToEditor?.get(pid);
      if (!pEd)
        break;
      chain.unshift(pEd);
      el = pEd.target;
    }
    return chain;
  }
  function collapseChain(items) {
    if (items.length <= 5)
      return items;
    return [items[0], null, items[items.length - 3], items[items.length - 2], items[items.length - 1]];
  }

  // src/components/editor/EditorSystem/BlocActions/view/template.html
  var template_default4 = `<button data-action="edit" title="Edit">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
</button>

<button data-action="duplicate" title="Duplicate">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
</button>

<button data-action="changeComponent" title="Change component">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
</button>

<div class="separator" data-group="delete"></div>

<button data-action="delete" class="danger" title="Delete">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
</button>
`;

  // src/components/editor/EditorSystem/BlocActions/compute/isLastRootBloc.ts
  function isLastRootBloc(target) {
    if (target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER))
      return false;
    const parent = target.parentElement;
    if (!parent)
      return true;
    let count = 0;
    for (let i = 0;i < parent.children.length; i++) {
      const child = parent.children[i];
      if (!(child instanceof HTMLElement))
        continue;
      if (!child.hasAttribute(p9r.attr.EDITOR.IDENTIFIER))
        continue;
      if (child.hasAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER))
        continue;
      if (++count > 1)
        return false;
    }
    return count === 1;
  }

  // src/components/editor/EditorSystem/BlocActions/domain/actionBarButtons.ts
  function buildSelectParentButton() {
    const btn = document.createElement("button");
    btn.setAttribute("data-action", "select-parent");
    btn.setAttribute("title", "Select parent");
    btn.innerHTML = ICON_PARENT;
    return btn;
  }
  function buildCustomActionButton(action) {
    const btn = document.createElement("button");
    btn.setAttribute("data-action", action.action);
    btn.setAttribute("title", action.title);
    btn.innerHTML = action.icon;
    return btn;
  }
  function buildPinButton(stateSyncCount, firstLabel) {
    const btn = document.createElement("button");
    btn.setAttribute("data-action", "pin-state");
    btn.setAttribute("title", stateSyncCount === 1 && firstLabel ? `Pin: ${firstLabel}` : "Pin state");
    btn.innerHTML = ICON_PIN;
    return btn;
  }
  function toggleActionButton(host, action, show) {
    host.querySelector(`[data-action="${action}"]`)?.toggleAttribute("hidden", !show);
  }

  // src/core/editorSystem/extensions/collectAncestors.ts
  function collectAncestorExtensions(fromEl, surface) {
    const out = [];
    const idAttr = p9r.attr.EDITOR.IDENTIFIER;
    const pidAttr = p9r.attr.EDITOR.PARENT_IDENTIFIER;
    const selector = `[${idAttr}]`;
    const map = document.compIdentifierToEditor;
    let entry = fromEl;
    if (!entry.closest(selector)) {
      const pidEl = entry.closest(`[${pidAttr}]`);
      const pid = pidEl?.getAttribute(pidAttr);
      const owner = pid ? map?.get(pid) : undefined;
      if (owner)
        entry = owner.target;
    }
    const seed = entry.matches(selector) ? entry : entry.closest(selector);
    if (!seed)
      return out;
    const visited = new Set;
    const queue = [seed];
    while (queue.length > 0) {
      const el = queue.shift();
      if (visited.has(el))
        continue;
      visited.add(el);
      const id2 = el.getAttribute(idAttr);
      const editor = id2 ? map?.get(id2) : undefined;
      if (editor)
        out.push(...editor.listExtensions(surface));
      const parent = el.parentElement?.closest(selector);
      if (parent && !visited.has(parent))
        queue.push(parent);
      const pid = el.getAttribute(pidAttr);
      const pidOwner = pid ? map?.get(pid) : undefined;
      if (pidOwner && pidOwner.target !== el && !visited.has(pidOwner.target)) {
        queue.push(pidOwner.target);
      }
    }
    return out;
  }

  // src/components/editor/EditorSystem/BlocActions/sub/Extensions/ExtensionsButton.ts
  function hasBlocActionExtensions(target) {
    return collectExtensions(target).length > 0;
  }
  function collectExtensions(target) {
    const myId = target.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
    const myEditor = myId ? document.compIdentifierToEditor?.get(myId) : undefined;
    const ownExts = myEditor ? new Set(myEditor.listExtensions("blocActions")) : new Set;
    const all = collectAncestorExtensions(target, "blocActions").filter((e2) => e2.enabled?.({ target }) !== false).filter((e2) => !ownExts.has(e2));
    return Array.from(new Set(all));
  }
  function buildExtensionsButton() {
    const btn = document.createElement("button");
    btn.setAttribute("data-action", "extensions");
    btn.setAttribute("title", "Extensions");
    btn.innerHTML = ICON_BRACES;
    return btn;
  }

  // src/components/editor/EditorSystem/BlocActions/domain/renderActionBar.ts
  function renderActionBar(host, editor, parentEditor, target, previousConfigKey) {
    const config = editor.actionBarConfiguration;
    const hasConfig = editor.hasConfigPanel;
    const customActions = editor.customActions;
    const stateSyncCount = editor.stateSyncs.length;
    const variant = editor.variant;
    const canDelete = !!config.get("delete") && !isLastRootBloc(target);
    const hasExtensions = hasBlocActionExtensions(target);
    const hasAnyButton = hasConfig || !!config.get("duplicate") || canDelete || !!config.get("changeComponent") || customActions.length > 0 || stateSyncCount > 0 || hasExtensions;
    const showSelectParent = !!parentEditor && hasAnyButton;
    const configKey = JSON.stringify(Array.from(config.entries())) + hasConfig + variant + customActions.map((a) => a.action).join(",") + "|s=" + stateSyncCount + "|p=" + showSelectParent + "|d=" + canDelete + "|x=" + hasExtensions;
    if (previousConfigKey === configKey)
      return null;
    host.setAttribute("data-variant", variant);
    host.innerHTML = template_default4;
    const separator = host.querySelector('[data-group="delete"]');
    if (showSelectParent)
      host.insertBefore(buildSelectParentButton(), host.firstChild);
    toggleActionButton(host, "edit", hasConfig);
    toggleActionButton(host, "duplicate", !!config.get("duplicate"));
    toggleActionButton(host, "changeComponent", !!config.get("changeComponent"));
    toggleActionButton(host, "delete", canDelete);
    for (const action of customActions) {
      host.insertBefore(buildCustomActionButton(action), separator);
    }
    if (stateSyncCount > 0) {
      host.insertBefore(buildPinButton(stateSyncCount, editor.stateSyncs[0]?.label), separator);
    }
    if (hasExtensions) {
      const sep = document.createElement("div");
      sep.className = "separator";
      sep.setAttribute("data-group", "extensions");
      host.insertBefore(sep, separator);
      host.insertBefore(buildExtensionsButton(), separator);
    }
    const hasLeftButtons = hasConfig || !!config.get("duplicate") || !!config.get("changeComponent") || customActions.length > 0 || stateSyncCount > 0 || hasExtensions;
    separator?.toggleAttribute("hidden", !canDelete || !hasLeftButtons);
    return { configKey, hasAnyButton };
  }

  // src/core/editorSystem/classifyLink.ts
  var SPECIAL_SCHEMES = ["mailto:", "tel:", "sms:"];
  var ASSET_PREFIXES = ["/uploads/", "/assets/", "/api/", "/.cms/", "/_storage/"];
  function classifyLink(href, currentOrigin, knownPagePaths) {
    const trimmed = href.trim();
    if (!trimmed || trimmed === "#" || /^javascript:/i.test(trimmed)) {
      return { kind: "empty", target: trimmed };
    }
    if (trimmed.startsWith("#")) {
      return { kind: "anchor", target: trimmed.slice(1) };
    }
    if (SPECIAL_SCHEMES.some((s3) => trimmed.toLowerCase().startsWith(s3))) {
      return { kind: "mailto", target: trimmed };
    }
    let url;
    try {
      url = new URL(trimmed, currentOrigin);
    } catch {
      return { kind: "empty", target: trimmed };
    }
    const sameOrigin = url.origin === currentOrigin;
    if (!sameOrigin) {
      return { kind: "external", target: url.href };
    }
    const path = url.pathname;
    if (knownPagePaths.has(path)) {
      return { kind: "page", target: path };
    }
    if (ASSET_PREFIXES.some((p) => path.startsWith(p))) {
      return { kind: "asset", target: url.href };
    }
    return { kind: "page", target: path };
  }

  // src/core/editorSystem/editorContext.ts
  var noop = () => {};
  var _ctx = {
    knownPagePaths: new Set,
    pageIdByPath: new Map,
    isDirty: () => false,
    requestNavigation: noop,
    mode: "editor"
  };
  function setEditorContext(patch) {
    Object.assign(_ctx, patch);
  }
  function getEditorContext() {
    return _ctx;
  }
  var _activeLink = null;
  var _linkListeners = new Set;
  function getActiveLink() {
    return _activeLink;
  }
  function setActiveLink(link) {
    if (_activeLink === link)
      return;
    _activeLink = link;
    for (const fn2 of _linkListeners)
      try {
        fn2(link);
      } catch {}
  }
  function onActiveLinkChange(fn2) {
    _linkListeners.add(fn2);
    return () => {
      _linkListeners.delete(fn2);
    };
  }
  function clearEditorContext() {
    _ctx.knownPagePaths = new Set;
    _ctx.pageIdByPath = new Map;
    _ctx.isDirty = () => false;
    _ctx.requestNavigation = noop;
    _ctx.mode = "editor";
    setActiveLink(null);
  }

  // src/components/editor/EditorSystem/BlocActions/domain/mountLinkSection.ts
  var SECTION_CLASS = "bag-link-section";
  function mountLinkSection(host) {
    const link = getActiveLink();
    const existing = host.querySelector(`.${SECTION_CLASS}`);
    if (!link) {
      existing?.remove();
      return;
    }
    const href = link.getAttribute("href") || "";
    if (existing?.dataset["href"] === href)
      return;
    const cls = classifyLink(href, location.origin, getEditorContext().knownPagePaths);
    const node = renderSection(href, cls);
    if (existing)
      existing.replaceWith(node);
    else
      host.appendChild(node);
  }
  function renderSection(href, cls) {
    const root = document.createElement("div");
    root.className = SECTION_CLASS;
    root.dataset["href"] = href;
    const styleEl = document.createElement("style");
    styleEl.textContent = SECTION_CSS;
    root.appendChild(styleEl);
    const { label, icon } = primaryActionLabel(cls);
    const iconEl = document.createElement("span");
    iconEl.className = "icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = "\uD83D\uDD17";
    const hrefEl = document.createElement("span");
    hrefEl.className = "href";
    hrefEl.textContent = href || "(empty)";
    hrefEl.title = href;
    const action = document.createElement("button");
    action.type = "button";
    action.textContent = `${icon} ${label}`;
    action.dataset["kind"] = cls.kind;
    action.addEventListener("click", (e2) => {
      e2.preventDefault();
      e2.stopPropagation();
      const ctx = getEditorContext();
      const c = classifyLink(href, location.origin, ctx.knownPagePaths);
      ctx.requestNavigation({ href, classification: c, via: "popover-action" });
    });
    root.append(iconEl, hrefEl, action);
    return root;
  }
  var SECTION_CSS = `
.${SECTION_CLASS} {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
    padding-left: 10px;
    border-left: 1px solid var(--border-default, #e2e8f0);
    font-size: 12px;
    vertical-align: middle;
}
.${SECTION_CLASS} > .icon {
    color: var(--primary-base, #4361ee);
    font-size: 13px;
    line-height: 1;
}
.${SECTION_CLASS} > .href {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-body, #334155);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
}
.${SECTION_CLASS} > button {
    cursor: pointer;
    border: 1px solid transparent;
    background: var(--primary-muted, #eef2ff);
    color: var(--primary-base, #4361ee);
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    line-height: 1.2;
}
.${SECTION_CLASS} > button:hover {
    border-color: var(--primary-base, #4361ee);
}
`;
  function primaryActionLabel(cls) {
    switch (cls.kind) {
      case "page":
        return { label: "Edit page", icon: "↗" };
      case "anchor":
        return { label: "Scroll", icon: "↓" };
      case "asset":
        return { label: "Open in new tab", icon: "↗" };
      case "external":
        return { label: "Open in new tab", icon: "↗" };
      case "mailto":
        return { label: "Open", icon: "↗" };
      case "empty":
        return { label: "—", icon: "" };
    }
  }

  // src/components/editor/EditorSystem/BlocActions/sub/PinMenu/refreshPinButton.ts
  function refreshPinButton(host, editor) {
    const btn = host.querySelector('[data-action="pin-state"]');
    if (!btn)
      return;
    const anyPinned = editor?.stateSyncs.some((s3) => s3.isPinned) ?? false;
    btn.toggleAttribute("data-active", anyPinned);
  }

  // src/components/editor/EditorSystem/BlocActions/sub/Breadcrumb/template.html
  var template_default5 = `<div class="pill" id="pill"></div>
<div class="bridge"></div>
`;

  // src/components/editor/EditorSystem/BlocActions/sub/Breadcrumb/style.css
  var style_default4 = `:host {
    display: block;
    width: max-content;
    /* Cap at 640px AND keep within the viewport — long labels at 5 items would
     * otherwise spill off-screen. The min() handles narrow viewports. */
    max-width: min(640px, calc(100vw - 16px));
    font-family: system-ui, sans-serif;
    font-size: 11px;
    line-height: 1.4;
}

:host(:not([data-has-items])) { display: none; }

.pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: var(--toolbar-bg, #fff);
    border: 1px solid var(--toolbar-border, #e5e7eb);
    border-radius: 999px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    white-space: nowrap;
    /* Clip overflowing labels — items inside use text-overflow: ellipsis. */
    overflow: hidden;
    position: relative;
    /* The bridge sits outside .pill (top: 100% / bottom: 100%) — it must stay
     * visible even though the pill clips its inner labels. The bridge is
     * appended as a sibling of .pill in the host, not inside it. */
}

.parent {
    color: var(--text-muted, #94a3b8);
    font: inherit;
    padding: 1px 6px;
    border-radius: 999px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    /* Allow flex shrinking + truncation. Without min-width:0 the button keeps
     * its content width and the whole pill grows past max-width. Parents are
     * the shrink-absorbers — \`.current\` opts out (flex-shrink: 0) so the
     * active bloc's label always stays fully readable. */
    min-width: 0;
    max-width: 200px;
    flex-shrink: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.parent:hover, .parent:focus-visible {
    color: var(--text-main, #1e293b);
    background: var(--bg-base, #f1f5f9);
    outline: none;
}

.ellipsis { color: var(--text-muted, #94a3b8); padding: 0 2px; cursor: default; }
.sep { color: var(--border-default, #cbd5e1); }

.current {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--primary-muted, rgba(67, 97, 238, 0.1));
    color: var(--primary-base, #4361ee);
    font-weight: 700;
    letter-spacing: 0.01em;
    /* Never shrunk — parents truncate first. The active bloc's label is the
     * most useful piece of context; we'd rather overflow the pill on the
     * left (parents become "…") than abbreviate the current. */
    flex-shrink: 0;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Hover bridge — covers the gap between BAG and the breadcrumb. */
.bridge {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    height: 6px;
}

:host-context([data-v-anchor="bottom"]) .bridge { top: auto; bottom: 100%; }

:host([data-inline]) .bridge {
    top: 0 !important;
    bottom: 0;
    width: 8px;
    height: auto !important;
}

:host([data-inline="left"]) .bridge { left: 100% !important; right: auto !important; }
:host([data-inline="right"]) .bridge { right: 100% !important; left: auto !important; }
`;

  // src/components/editor/EditorSystem/BlocActions/sub/Breadcrumb/items.ts
  function renderBreadcrumbItem(item, cb) {
    if (item.type === "ellipsis") {
      const span = document.createElement("span");
      span.className = "ellipsis";
      span.textContent = "…";
      return span;
    }
    if (item.type === "current") {
      const span = document.createElement("span");
      span.className = "current";
      span.textContent = item.label;
      return span;
    }
    return renderParentButton(item.key, item.label, cb);
  }
  function renderParentButton(key, label, cb) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "parent";
    btn.textContent = label;
    btn.addEventListener("click", (e2) => {
      e2.stopPropagation();
      e2.preventDefault();
      cb.onPick(key);
    });
    btn.addEventListener("mouseenter", () => cb.onHover(key, true));
    btn.addEventListener("mouseleave", () => cb.onHover(key, false));
    return btn;
  }
  function renderSeparator() {
    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "›";
    return sep;
  }

  // src/components/editor/EditorSystem/BlocActions/sub/Breadcrumb/Breadcrumb.ts
  var Metadata = { css: style_default4, template: template_default5 };

  class Breadcrumb extends A2 {
    _pill;
    constructor() {
      super(Metadata);
      this._pill = this.shadowRoot.getElementById("pill");
    }
    static create() {
      return document.createElement("cms-bag-breadcrumb");
    }
    setItems(items, cb) {
      this._pill.innerHTML = "";
      if (items.length === 0) {
        this.removeAttribute("data-has-items");
        return;
      }
      this.setAttribute("data-has-items", "");
      items.forEach((item, idx) => {
        this._pill.appendChild(renderBreadcrumbItem(item, cb));
        if (idx < items.length - 1)
          this._pill.appendChild(renderSeparator());
      });
    }
    clear() {
      this._pill.innerHTML = "";
      this.removeAttribute("data-has-items");
      this.removeAttribute("data-inline");
    }
    refinePosition(barRect) {
      this.removeAttribute("data-inline");
      if (!this._pill.children.length)
        return;
      const margin = 4;
      const ownRect = this.getBoundingClientRect();
      if (ownRect.width === 0 && ownRect.height === 0)
        return;
      const fitsVertically = ownRect.top >= margin && ownRect.bottom <= window.innerHeight - margin;
      if (fitsVertically)
        return;
      const leftSpace = barRect.left - margin;
      const rightSpace = window.innerWidth - barRect.right - margin;
      const side = leftSpace >= ownRect.width || leftSpace >= rightSpace ? "left" : "right";
      this.setAttribute("data-inline", side);
    }
  }
  if (!customElements.get("cms-bag-breadcrumb")) {
    customElements.define("cms-bag-breadcrumb", Breadcrumb);
  }

  // src/components/editor/EditorSystem/BlocActions/compute/breadcrumbBuilder.ts
  function buildBreadcrumb(editor, editorSystem) {
    const observer = editorSystem.observer;
    const labelled = ancestorChain(editor).map((ed) => {
      const label = observer?.getLabel(ed.target.tagName.toLowerCase());
      return label ? { editor: ed, label } : null;
    }).filter((it2) => it2 !== null);
    if (labelled.length === 0)
      return { items: [], editorByKey: new Map };
    const collapsed = collapseChain(labelled);
    const editorByKey = new Map;
    const items = collapsed.map((it2, idx) => {
      const isLast = idx === collapsed.length - 1;
      if (it2 === null)
        return { type: "ellipsis" };
      if (isLast)
        return { type: "current", label: it2.label };
      const key = it2.editor.identifier;
      editorByKey.set(key, it2.editor);
      return { type: "parent", key, label: it2.label };
    });
    return { items, editorByKey };
  }

  // src/components/editor/EditorSystem/BlocActions/sub/Breadcrumb/BreadcrumbController.ts
  class BreadcrumbController {
    _host;
    _onSwitch;
    _el;
    constructor(_host, _onSwitch) {
      this._host = _host;
      this._onSwitch = _onSwitch;
      this._el = Breadcrumb.create();
      const sr2 = this._host.shadowRoot;
      sr2.insertBefore(this._el, sr2.querySelector("nav"));
    }
    update(editor) {
      const editorSystem = getClosestEditorSystem(this._host);
      const { items, editorByKey } = buildBreadcrumb(editor, editorSystem);
      if (items.length === 0) {
        this._el.clear();
        return;
      }
      this._el.setItems(items, {
        onPick: (key) => {
          const ed = editorByKey.get(key);
          if (ed)
            this._onSwitch(ed);
        },
        onHover: (key, hovered) => {
          editorByKey.get(key)?.target.classList.toggle("p9r-breadcrumb-hover", hovered);
        }
      });
    }
    refinePosition(barRect) {
      this._el.refinePosition(barRect);
    }
    clear() {
      this._el.clear();
    }
  }

  // src/components/editor/EditorSystem/BlocActions/sub/InsertButton/template.html
  var template_default6 = `<button class="btn" type="button">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
</button>
`;

  // src/components/editor/EditorSystem/BlocActions/sub/InsertButton/style.css
  var style_default5 = `:host {
    position: absolute;
    z-index: 10001;
    display: none;
    width: 24px;
    height: 24px;
}

:host([data-visible]) {
    display: block;
}

.btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 2px solid var(--primary-base, #4361ee);
    background: var(--bg-surface, #fff);
    color: var(--primary-base, #4361ee);
    cursor: pointer;
    padding: 0;
    transition: transform 0.15s ease, background-color 0.15s ease;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.btn::before {
    content: '';
    position: absolute;
    inset: -10px;
    pointer-events: auto;
}

:host([data-position="before"]) .btn::before {
    bottom: 0;
}

:host([data-position="after"]) .btn::before {
    top: 0;
}

:host([data-position="before"][data-inline]) .btn::before {
    bottom: -10px;
    right: 0;
}

:host([data-position="after"][data-inline]) .btn::before {
    top: -10px;
    left: 0;
}

.btn:hover {
    background: var(--primary-base, #4361ee);
    color: #fff;
    transform: scale(1.15);
}
`;

  // src/components/editor/EditorSystem/BlocActions/sub/InsertButton/InsertButton.ts
  var Metadata2 = {
    css: style_default5,
    template: template_default6
  };

  class InsertButton extends A2 {
    constructor() {
      super(Metadata2);
      this.shadowRoot.querySelector(".btn").addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("insert-pick", { bubbles: true, composed: true }));
      });
    }
    static create(position, onPick) {
      const btn = document.createElement("cms-bag-insert-button");
      btn.dataset.position = position;
      btn.addEventListener("insert-pick", onPick);
      return btn;
    }
    setVisible(visible) {
      this.toggleAttribute("data-visible", visible);
    }
    setInline(inline) {
      this.toggleAttribute("data-inline", inline);
    }
    setLocation(left, top) {
      this.style.left = `${left}px`;
      this.style.top = `${top}px`;
    }
  }
  if (!customElements.get("cms-bag-insert-button")) {
    customElements.define("cms-bag-insert-button", InsertButton);
  }

  // src/components/editor/EditorSystem/BlocActions/compute/insertButtonPosition.ts
  function positionInsertButtons(btnBefore, btnAfter, rect, inline, show) {
    btnBefore.setInline(inline);
    btnAfter.setInline(inline);
    if (!show.before && !show.after)
      return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    if (inline) {
      const cy = rect.top + sy + rect.height / 2 - 12;
      if (show.before) {
        btnBefore.setLocation(rect.left + sx - 12, cy);
        btnBefore.setVisible(true);
      }
      if (show.after) {
        btnAfter.setLocation(rect.right + sx - 12, cy);
        btnAfter.setVisible(true);
      }
    } else {
      const cx = rect.left + sx + rect.width / 2 - 12;
      if (show.before) {
        btnBefore.setLocation(cx, rect.top + sy - 12);
        btnBefore.setVisible(true);
      }
      if (show.after) {
        btnAfter.setLocation(cx, rect.bottom + sy - 12);
        btnAfter.setVisible(true);
      }
    }
  }

  // src/components/editor/EditorSystem/BlocActions/compute/anchor.ts
  function resolveActionBarAnchor(target, editor) {
    const element = editor?.getActionBarAnchor?.() ?? target;
    return { rect: element.getBoundingClientRect(), element };
  }

  // src/components/editor/EditorSystem/BlocActions/domain/insertBlankSibling.ts
  function resolveSiblingTemplate(target) {
    const parentId = target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (!parentId)
      return null;
    const parentEditor = document.compIdentifierToEditor?.get(parentId);
    if (!parentEditor)
      return null;
    const slotName = target.getAttribute("slot");
    const compSyncs = parentEditor.queryPanelChildren("p9r-comp-sync");
    for (const cs2 of compSyncs) {
      const template = cs2.firstElementChild;
      if (!template)
        continue;
      const tSlot = template.getAttribute("slot");
      if ((slotName ?? null) === (tSlot ?? null)) {
        return template;
      }
    }
    return null;
  }
  function insertBlankSibling(target, position) {
    const template = resolveSiblingTemplate(target);
    const fresh = template ? template.cloneNode(true) : document.createElement("p");
    const parentId = target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (parentId)
      fresh.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
    const slot = target.getAttribute("slot");
    if (slot)
      fresh.setAttribute("slot", slot);
    fresh.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
    if (position === "before")
      target.before(fresh);
    else
      target.after(fresh);
  }

  // src/components/editor/EditorSystem/BlocActions/sub/InsertButton/InsertButtonsController.ts
  class InsertButtonsController {
    _btnBefore;
    _btnAfter;
    _target = null;
    _editor = null;
    _show = { before: false, after: false };
    constructor(onPick) {
      this._btnBefore = InsertButton.create("before", () => onPick("before"));
      this._btnAfter = InsertButton.create("after", () => onPick("after"));
    }
    get elements() {
      return [this._btnBefore, this._btnAfter];
    }
    attachTo(parent) {
      parent?.appendChild(this._btnBefore);
      parent?.appendChild(this._btnAfter);
    }
    resolveTarget(editor) {
      let ed = editor;
      let target = editor.target;
      while (ed && target) {
        const cfg = ed.actionBarConfiguration;
        if (cfg.get("addBefore") || cfg.get("addAfter")) {
          this._target = target;
          this._editor = ed;
          this._show = { before: !!cfg.get("addBefore"), after: !!cfg.get("addAfter") };
          return;
        }
        const parentEd = findParentEditor(target);
        if (!parentEd)
          break;
        ed = parentEd;
        target = parentEd.target;
      }
      this._target = editor.target;
      this._editor = editor;
      this._show = { before: false, after: false };
    }
    position() {
      if (!this._target)
        return;
      const { rect } = resolveActionBarAnchor(this._target, this._editor);
      const isInline = this._target.hasAttribute(p9r.attr.ACTION.INLINE_ADDING);
      positionInsertButtons(this._btnBefore, this._btnAfter, rect, isInline, this._show);
    }
    hide() {
      this._btnBefore.setVisible(false);
      this._btnAfter.setVisible(false);
    }
    insertBlank(position) {
      if (!this._target)
        return;
      insertBlankSibling(this._target, position);
    }
  }

  // src/components/editor/EditorSystem/BlocActions/sub/PinMenu/render.ts
  function renderRow(row) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    btn.innerHTML = `<span class="icon">${ICON_PIN}</span><span class="label"></span>`;
    btn.querySelector(".label").textContent = row.label;
    if (row.isActive)
      btn.setAttribute("data-active", "");
    btn.addEventListener("click", (e2) => {
      e2.stopPropagation();
      row.onClick();
    });
    return btn;
  }

  // src/components/editor/EditorSystem/BlocActions/sub/PinMenu/template.html
  var template_default7 = `<div class="menu" id="menu">
    <div class="items" id="items"></div>
</div>
`;

  // src/components/editor/EditorSystem/BlocActions/sub/PinMenu/style.css
  var style_default6 = `:host {
    position: absolute;
    z-index: 10001;
    display: block;
}

.menu {
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 10px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    min-width: 180px;
    font: inherit;
    color: var(--text-main, #1e293b);
}

.items {
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    font: inherit;
    color: inherit;
    text-align: left;
    width: 100%;
    transition: background 80ms ease, color 80ms ease;
}
.row:hover            { background: var(--primary-muted, #eef2ff); }
.row[data-active]     { background: var(--primary-muted, #eef2ff); color: var(--primary-base, #4361ee); font-weight: 600; }

.icon {
    display: inline-flex;
    width: 16px;
    height: 16px;
    opacity: 0.45;
    flex-shrink: 0;
}
.icon svg { width: 100%; height: 100%; }
.row[data-active] .icon { opacity: 1; }

.label { flex: 1; }
`;

  // src/components/editor/EditorSystem/BlocActions/sub/PinMenu/PinMenu.ts
  var Metadata3 = { css: style_default6, template: template_default7 };

  class PinMenu extends A2 {
    _items;
    constructor() {
      super(Metadata3);
      this._items = this.shadowRoot.getElementById("items");
    }
    static create(rows) {
      const menu = document.createElement("cms-bag-pin-menu");
      menu.setRows(rows);
      return menu;
    }
    setRows(rows) {
      this._items.innerHTML = "";
      for (const row of rows)
        this._items.appendChild(renderRow(row));
    }
    setPosition(left, top) {
      this.style.left = `${left}px`;
      this.style.top = `${top}px`;
    }
  }
  if (!customElements.get("cms-bag-pin-menu")) {
    customElements.define("cms-bag-pin-menu", PinMenu);
  }

  // src/components/editor/EditorSystem/BlocActions/sub/PinMenu/PinController.ts
  class PinController {
    _host;
    _getEditor;
    _menu = null;
    constructor(_host, _getEditor) {
      this._host = _host;
      this._getEditor = _getEditor;
    }
    get menu() {
      return this._menu;
    }
    handleClick() {
      const editor = this._getEditor();
      const syncs = editor?.stateSyncs ?? [];
      if (syncs.length === 0)
        return;
      if (syncs.length === 1 && !syncs[0].isMulti) {
        this._commit(syncs[0], () => syncs[0].toggle());
        return;
      }
      this._toggleMenu(syncs);
    }
    close() {
      this._menu?.remove();
      this._menu = null;
    }
    _commit(sync, change) {
      const editor = this._getEditor();
      if (editor) {
        for (const s3 of editor.stateSyncs)
          if (s3 !== sync && s3.isPinned)
            s3.unpin();
      }
      change();
      editor?.notifyPinStateChanged(sync);
      refreshPinButton(this._host, editor);
    }
    _toggleMenu(syncs) {
      if (this._menu) {
        this.close();
        return;
      }
      const btn = this._host.querySelector('[data-action="pin-state"]');
      if (!btn)
        return;
      const menu = PinMenu.create(this._buildRows(syncs));
      const rect = btn.getBoundingClientRect();
      menu.setPosition(rect.left, rect.bottom);
      document.body.appendChild(menu);
      this._menu = menu;
    }
    _buildRows(syncs) {
      const rows = [];
      for (const sync of syncs) {
        if (sync.isMulti) {
          sync.values.forEach((value, i) => rows.push({
            label: sync.labels[i] ?? value,
            isActive: value === sync.activeValue,
            onClick: () => this._commit(sync, () => sync.setActiveValue(value === sync.activeValue ? null : value))
          }));
        } else {
          rows.push({
            label: sync.label,
            isActive: sync.isPinned,
            onClick: () => this._commit(sync, () => sync.toggle())
          });
        }
      }
      return rows;
    }
  }

  // src/components/editor/EditorSystem/BlocActions/events/actionDispatcher.ts
  function createActionDispatcher(deps) {
    return (e2) => {
      switch (e2.detail.action) {
        case "delete":
          return deps.onDelete();
        case "edit":
          return deps.onEdit();
        case "duplicate":
          return deps.onDuplicate();
        case "changeComponent":
          return deps.onChangeComponent();
        case "pin-state":
          return deps.onPinClick();
        case "select-parent":
          return deps.onSelectParent();
        case "extensions":
          return deps.onExtensions(e2);
        default: {
          const custom = deps.editor()?.customActions.find((a) => a.action === e2.detail.action);
          custom?.handler();
        }
      }
    };
  }

  // src/components/editor/EditorSystem/BlocActions/events/keyboardHandler.ts
  function createKeyDownHandler(deps) {
    return (e2) => {
      if (e2.key === "Escape") {
        deps.onClose();
        return;
      }
      if (e2.key !== "Delete" && e2.key !== "Backspace")
        return;
      const target = deps.target();
      if (!target)
        return;
      const active = document.activeElement;
      if (active && active.isContentEditable)
        return;
      if (!deps.canDelete())
        return;
      e2.preventDefault();
      target.remove();
      deps.onClose();
    };
  }

  // src/components/editor/EditorSystem/BlocActions/events/pointerHandlers.ts
  function createPointerHandlers(deps) {
    let lastX = 0;
    let lastY = 0;
    let raf = null;
    const onMouseMove = (e2) => {
      lastX = e2.clientX;
      lastY = e2.clientY;
      if (raf !== null)
        return;
      raf = requestAnimationFrame(() => {
        raf = null;
        deps.onReflow();
      });
    };
    const onClickOutside = (e2) => {
      const t = e2.target;
      if (deps.host.contains(t))
        return;
      if (deps.pinMenu()?.contains(t))
        return;
      if (deps.insertButtons().includes(t))
        return;
      if (deps.target()?.contains(t))
        return;
      deps.onClose();
    };
    const onLeave = (e2) => {
      const to2 = e2.relatedTarget;
      if (deps.host.contains(to2))
        return;
      if (deps.pinMenu()?.contains(to2))
        return;
      if (deps.insertButtons().includes(to2))
        return;
      if (deps.host.matches(":hover"))
        return;
      if (deps.pinMenu()?.matches(":hover"))
        return;
      if (deps.insertButtons().some((b2) => b2.matches(":hover")))
        return;
      const parentEditor = to2?.closest?.(`[${p9r.attr.EDITOR.IS_EDITOR}]`);
      const tgt = deps.target();
      if (parentEditor && tgt && parentEditor.contains(tgt)) {
        parentEditor.dispatchEvent(new MouseEvent("mouseenter", {
          clientX: e2.clientX,
          clientY: e2.clientY,
          bubbles: false
        }));
        return;
      }
      deps.onClose();
    };
    return {
      onLeave,
      onMouseMove,
      onClickOutside,
      lastMouse: () => ({ x: lastX, y: lastY }),
      cancelPendingReflow: () => {
        if (raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      }
    };
  }

  // src/components/editor/EditorSystem/BlocActions/events/EventManager.ts
  class EventManager {
    deps;
    _attached = false;
    _onKeyDown;
    _onActionClick;
    _pointer;
    constructor(deps) {
      this.deps = deps;
      this._onKeyDown = createKeyDownHandler(deps);
      this._onActionClick = createActionDispatcher(deps);
      this._pointer = createPointerHandlers(deps);
    }
    attach() {
      if (this._attached)
        return;
      this.deps.host.addEventListener("action-click", this._onActionClick);
      this.deps.host.addEventListener("mouseleave", this._pointer.onLeave);
      this.deps.hoverEl()?.addEventListener("mouseleave", this._pointer.onLeave);
      this.deps.hoverEl()?.addEventListener("mousemove", this._pointer.onMouseMove);
      window.addEventListener("keydown", this._onKeyDown);
      window.addEventListener("click", this._pointer.onClickOutside);
      this._attached = true;
    }
    detach() {
      if (!this._attached)
        return;
      this.deps.host.removeEventListener("action-click", this._onActionClick);
      this.deps.host.removeEventListener("mouseleave", this._pointer.onLeave);
      this.deps.hoverEl()?.removeEventListener("mouseleave", this._pointer.onLeave);
      this.deps.hoverEl()?.removeEventListener("mousemove", this._pointer.onMouseMove);
      window.removeEventListener("keydown", this._onKeyDown);
      window.removeEventListener("click", this._pointer.onClickOutside);
      this._pointer.cancelPendingReflow();
      this._attached = false;
    }
    lastMouse() {
      return this._pointer.lastMouse();
    }
    rebindHover(prev) {
      if (!this._attached)
        return;
      prev?.removeEventListener("mouseleave", this._pointer.onLeave);
      prev?.removeEventListener("mousemove", this._pointer.onMouseMove);
      const next = this.deps.hoverEl();
      next?.addEventListener("mouseleave", this._pointer.onLeave);
      next?.addEventListener("mousemove", this._pointer.onMouseMove);
    }
  }

  // src/components/editor/EditorSystem/BlocActions/domain/duplicateSibling.ts
  function duplicateSibling(target, position) {
    const clone = target.cloneNode(true);
    clone.removeAttribute(p9r.attr.EDITOR.IS_EDITOR);
    clone.classList.remove("p9r-active");
    clone.querySelectorAll(`[${p9r.attr.EDITOR.IS_EDITOR}]`).forEach((el) => {
      el.removeAttribute(p9r.attr.EDITOR.IS_EDITOR);
      el.classList.remove("p9r-active");
    });
    if (position === "before")
      target.before(clone);
    else
      target.after(clone);
  }

  // src/components/editor/EditorSystem/BlocActions/domain/openChangeComponentPicker.ts
  function inherit(source, dest) {
    const parentId = source.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
    if (parentId)
      dest.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
    const slot = source.getAttribute("slot");
    if (slot)
      dest.setAttribute("slot", slot);
  }
  function openChangeComponentPicker(target, onDone) {
    const library = getClosestEditorSystem(target).blocLibrary;
    library.open((detail) => {
      if (detail.type === "template") {
        const fragment = document.createRange().createContextualFragment(detail.html);
        Array.from(fragment.children).forEach((el) => {
          el.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
        });
        target.replaceWith(fragment);
      } else if (detail.type === "snippet") {
        const newEl = document.createElement("w13c-snippet");
        newEl.setAttribute("identifier", detail.identifier);
        inherit(target, newEl);
        newEl.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
        target.replaceWith(newEl);
      } else {
        const newEl = document.createElement(detail.id);
        inherit(target, newEl);
        newEl.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
        target.replaceWith(newEl);
      }
      onDone();
    });
  }

  // src/components/editor/EditorSystem/BlocActions/sub/Extensions/style.css
  var style_default7 = `:host {
    font-family: system-ui, sans-serif;
    font-size: 12px;
    color: var(--text-main, #1e293b);
}

#wrap {
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    padding: 4px;
    min-width: 240px;
    max-width: 360px;
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.group { display: flex; flex-direction: column; padding: 2px 0; }
.group + .group {
    border-top: 1px solid var(--border-light, #f1f5f9);
    margin-top: 2px;
    padding-top: 4px;
}

.header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 2px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, color-mix(in srgb, currentColor 55%, transparent));
}
.icon { display: inline-flex; align-items: center; width: 14px; height: 14px; }
.icon svg { width: 100%; height: 100%; }
.label { flex: 1; }

.row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px 10px;
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: 5px;
    text-align: left;
    width: 100%;
    font: inherit;
}
.row:hover { background: var(--primary-muted, #eef2ff); }
.row-label { font-size: 13px; color: var(--text-main, #1e293b); font-weight: 500; }
.row-path {
    font-size: 11px;
    color: color-mix(in srgb, currentColor 55%, transparent);
    font-family: ui-monospace, monospace;
    flex: 1;
    text-align: right;
}

.empty {
    padding: 8px 10px;
    font-size: 12px;
    color: color-mix(in srgb, currentColor 55%, transparent);
    text-align: center;
}
`;

  // src/components/editor/EditorSystem/BlocActions/sub/Extensions/render.ts
  function buildGroup(ext, target, onPick) {
    const group = document.createElement("div");
    group.className = "group";
    const header = document.createElement("div");
    header.className = "header";
    if (ext.icon)
      header.insertAdjacentHTML("afterbegin", `<span class="icon">${ext.icon}</span>`);
    const lbl = document.createElement("span");
    lbl.className = "label";
    lbl.textContent = ext.label();
    header.appendChild(lbl);
    group.appendChild(header);
    const opts = ext.getOptions({ target });
    if (opts.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No options";
      group.appendChild(empty);
    } else {
      for (const o of opts)
        group.appendChild(buildRow(o, onPick));
    }
    return group;
  }
  function buildRow(opt, onPick) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "row";
    row.innerHTML = `<span class="row-label"></span><span class="row-path"></span>`;
    row.querySelector(".row-label").textContent = opt.label;
    row.querySelector(".row-path").textContent = opt.path;
    row.addEventListener("mousedown", (e2) => e2.preventDefault());
    row.addEventListener("click", (e2) => {
      e2.stopPropagation();
      onPick(opt);
    });
    return row;
  }

  // src/components/editor/EditorSystem/BlocActions/sub/Extensions/popover.ts
  var POPOVER_TAG = "cms-bag-extensions-popover";

  class ExtensionsPopover extends HTMLElement {
    constructor() {
      super();
      const sr2 = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = style_default7;
      sr2.appendChild(style);
      const wrap = document.createElement("div");
      wrap.id = "wrap";
      sr2.appendChild(wrap);
    }
  }
  if (!customElements.get(POPOVER_TAG))
    customElements.define(POPOVER_TAG, ExtensionsPopover);
  function openExtensionsPopover(anchor, exts, target, onAfterPick) {
    closeExtensionsPopover();
    const popover = document.createElement(POPOVER_TAG);
    const wrap = popover.shadowRoot.getElementById("wrap");
    for (const ext of exts)
      wrap.appendChild(buildGroup(ext, target, (opt) => {
        closeExtensionsPopover();
        onAfterPick();
        ext.onPick(opt, { target });
      }));
    document.body.appendChild(popover);
    positionUnder(popover, anchor);
    queueMicrotask(() => document.addEventListener("mousedown", dismissOnOutside, { capture: true }));
  }
  function closeExtensionsPopover() {
    document.querySelectorAll(POPOVER_TAG).forEach((p) => p.remove());
    document.removeEventListener("mousedown", dismissOnOutside, { capture: true });
  }
  function dismissOnOutside(e2) {
    const path = e2.composedPath();
    if (path.some((n2) => n2?.tagName?.toLowerCase?.() === POPOVER_TAG))
      return;
    closeExtensionsPopover();
  }
  function positionUnder(popover, anchor) {
    const r = anchor.getBoundingClientRect();
    popover.style.cssText = `position:fixed;top:${r.bottom + 6}px;left:${r.left}px;z-index:10010;`;
    const own = popover.getBoundingClientRect();
    const overflowRight = own.right - (window.innerWidth - 8);
    if (overflowRight > 0)
      popover.style.left = `${r.left - overflowRight}px`;
    if (popover.getBoundingClientRect().left < 8)
      popover.style.left = `8px`;
  }

  // src/components/editor/EditorSystem/BlocActions/events/buildEventManager.ts
  function buildEventManager(host, accessors, pin, insertBtns, cb) {
    return new EventManager({
      host,
      target: accessors.target,
      editor: accessors.editor,
      hoverEl: accessors.hoverEl,
      pinMenu: () => pin.menu,
      insertButtons: () => insertBtns.elements,
      canDelete: () => {
        if (!accessors.editor()?.actionBarConfiguration.get("delete"))
          return false;
        const t = accessors.target();
        return !!t && !isLastRootBloc(t);
      },
      onClose: cb.onClose,
      onReflow: cb.onReflow,
      onDelete: () => {
        const t = accessors.target();
        if (!t || isLastRootBloc(t)) {
          cb.onClose();
          return;
        }
        t.remove();
        cb.onClose();
      },
      onEdit: () => accessors.editor()?.showConfigPanel(),
      onDuplicate: () => {
        const t = accessors.target();
        if (t)
          cb.withCooldown(() => duplicateSibling(t, "after"));
      },
      onChangeComponent: () => {
        const t = accessors.target();
        if (t)
          openChangeComponentPicker(t, cb.onClose);
      },
      onPinClick: () => pin.handleClick(),
      onSelectParent: cb.onSelectParent,
      onExtensions: (sourceEvent) => {
        const t = accessors.target();
        if (!t)
          return;
        const anchor = sourceEvent.detail?.target;
        const exts = collectExtensions(t);
        if (!anchor || exts.length === 0)
          return;
        openExtensionsPopover(anchor, exts, t, cb.onClose);
      }
    });
  }

  // src/components/editor/EditorSystem/BlocActions/domain/lifecycle/navigate.ts
  function switchToEditor(c, target) {
    const t = c.host.style.transform;
    const va = c.host.getAttribute("data-v-anchor");
    c.positionLocked = true;
    c.setEditor(target);
    c.open();
    c.host.style.transform = t;
    if (va !== null) {
      c.host.setAttribute("data-v-anchor", va);
      c.lastVAnchor = va;
      c.breadcrumb.refinePosition(c.host.getBoundingClientRect());
    }
  }
  function selectParent(c) {
    if (!c.target)
      return;
    const p = findParentEditor(c.target);
    if (p)
      switchToEditor(c, p);
  }

  // src/components/editor/EditorSystem/BlocActions/compute/groupPosition.ts
  function computeGroupPosition(input) {
    const { rect, barWidth, barHeight, mouseX, mouseY } = input;
    const margin = 8;
    const centerY = rect.top + rect.height / 2;
    let vAnchor = mouseY < centerY ? "top" : "bottom";
    if (vAnchor === "top" && rect.top - barHeight < margin && rect.bottom + barHeight <= window.innerHeight - margin) {
      vAnchor = "bottom";
    } else if (vAnchor === "bottom" && rect.bottom + barHeight > window.innerHeight - margin && rect.top - barHeight >= margin) {
      vAnchor = "top";
    }
    const halfWidth = barWidth / 2;
    let x2 = mouseX + window.scrollX - halfWidth;
    const minRectX = rect.left + window.scrollX;
    const maxRectX = rect.right + window.scrollX - barWidth;
    x2 = Math.max(minRectX, Math.min(maxRectX, x2));
    const minViewX = window.scrollX + margin;
    const maxViewX = window.scrollX + window.innerWidth - barWidth - margin;
    x2 = Math.max(minViewX, Math.min(maxViewX, x2));
    let y2 = vAnchor === "top" ? rect.top + window.scrollY - barHeight : rect.bottom + window.scrollY;
    const minViewY = window.scrollY + margin;
    const maxViewY = window.scrollY + window.innerHeight - barHeight - margin;
    y2 = Math.max(minViewY, Math.min(maxViewY, y2));
    return { x: x2, y: y2, vAnchor };
  }

  // src/components/editor/EditorSystem/BlocActions/compute/applyBagPosition.ts
  function applyBagPosition(bag, target, editor, mouseX, mouseY, lastVAnchor) {
    const { rect, element } = resolveActionBarAnchor(target, editor);
    const my = mouseY ?? (lastVAnchor === "top" ? rect.top : rect.bottom);
    const { x: x2, y: y2, vAnchor } = computeGroupPosition({
      rect,
      barWidth: bag.offsetWidth,
      barHeight: bag.offsetHeight,
      mouseX,
      mouseY: my
    });
    bag.setAttribute("data-v-anchor", vAnchor);
    bag.style.transform = `translate3d(${x2}px, ${y2}px, 0)`;
    bag.style.visibility = "visible";
    bag.style.opacity = "1";
    bag.style.pointerEvents = "auto";
    return { vAnchor, anchorEl: element };
  }

  // src/components/editor/EditorSystem/BlocActions/domain/lifecycle/reflow.ts
  function reflow(c) {
    if (!c.target)
      return;
    if (!c.positionLocked) {
      const m = c.events.lastMouse();
      const r = applyBagPosition(c.host, c.target, c.editor, m.x, m.y, c.lastVAnchor);
      c.lastVAnchor = r.vAnchor;
      c.hoverEl = r.anchorEl;
    }
    c.insertBtns.hide();
    c.insertBtns.position();
    c.breadcrumb.refinePosition(c.host.getBoundingClientRect());
  }

  // src/components/editor/EditorSystem/BlocActions/domain/lifecycle/open.ts
  function open(c, mouseX, mouseY) {
    if (!c.editor || !c.target || c.cooldown)
      return;
    c.renderBar();
    c.breadcrumb.update(c.editor);
    const r = applyBagPosition(c.host, c.target, c.editor, mouseX ?? c.events.lastMouse().x, mouseY ?? null, c.lastVAnchor);
    c.lastVAnchor = r.vAnchor;
    c.hoverEl = r.anchorEl;
    c.insertBtns.position();
    c.ro.disconnect();
    c.ro.observe(c.target);
    if (r.anchorEl !== c.target)
      c.ro.observe(r.anchorEl);
    c.target.classList.add("p9r-active");
    c.events.attach();
    c.breadcrumb.refinePosition(c.host.getBoundingClientRect());
  }

  // src/components/editor/EditorSystem/Highlight.ts
  var ROOT_ID = "p9r-editor-highlight-root";
  var rootByParent = new WeakMap;
  var active = new Set;
  var onScrollOrResize = null;
  function ensureRoot(parent) {
    const cached = rootByParent.get(parent);
    if (cached)
      return cached;
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.style.cssText = "position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999;";
    parent.appendChild(root);
    rootByParent.set(parent, root);
    return root;
  }
  function attachGlobal() {
    if (onScrollOrResize)
      return;
    onScrollOrResize = () => active.forEach((h) => h.update());
    window.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
    window.addEventListener("resize", onScrollOrResize);
  }
  function detachGlobal() {
    if (!onScrollOrResize)
      return;
    window.removeEventListener("scroll", onScrollOrResize, { capture: true });
    window.removeEventListener("resize", onScrollOrResize);
    onScrollOrResize = null;
  }

  class Highlight {
    _target;
    _box;
    _ro;
    constructor(target, options = {}) {
      this._target = target;
      const r = ensureRoot(options.parent ?? document.body);
      this._box = document.createElement("div");
      const color = options.color ?? "#3b82f6";
      const thickness = options.thickness ?? 2;
      const radius = options.radius ?? 0;
      this._box.style.cssText = `position:absolute;left:0;top:0;border:${thickness}px solid ${color};` + `border-radius:${radius}px;box-sizing:border-box;pointer-events:none;`;
      r.appendChild(this._box);
      this._ro = new ResizeObserver(() => this.update());
      this._ro.observe(target);
      active.add(this);
      attachGlobal();
      this.update();
    }
    update() {
      const rect = this._target.getBoundingClientRect();
      const s3 = this._box.style;
      s3.transform = `translate(${rect.left}px, ${rect.top}px)`;
      s3.width = `${rect.width}px`;
      s3.height = `${rect.height}px`;
      s3.display = rect.width === 0 && rect.height === 0 ? "none" : "block";
    }
    setColor(color) {
      this._box.style.borderColor = color;
    }
    dispose() {
      this._ro.disconnect();
      this._box.remove();
      active.delete(this);
      if (active.size === 0)
        detachGlobal();
    }
  }

  // src/components/editor/EditorSystem/BlocActions/domain/lifecycle/BagController.ts
  class BagController {
    host;
    target = null;
    editor = null;
    hoverEl = null;
    cooldown = false;
    positionLocked = false;
    lastVAnchor = "bottom";
    lastConfigKey = "";
    breadcrumb;
    insertBtns;
    pin;
    events;
    ro;
    highlight = null;
    _unsubLink = null;
    constructor(host) {
      this.host = host;
      const s3 = document.createElement("style");
      s3.textContent = style_default3;
      host.shadowRoot.appendChild(s3);
      this.breadcrumb = new BreadcrumbController(host, (ed) => switchToEditor(this, ed));
      this.insertBtns = new InsertButtonsController((pos) => this.withCooldown(() => this.insertBtns.insertBlank(pos)));
      this.pin = new PinController(host, () => this.editor);
      this.ro = new ResizeObserver(() => reflow(this));
      this.events = buildEventManager(host, { target: () => this.target, editor: () => this.editor, hoverEl: () => this.hoverEl }, this.pin, this.insertBtns, {
        onClose: () => this.close(),
        onReflow: () => reflow(this),
        withCooldown: (fn2) => this.withCooldown(fn2),
        onSelectParent: () => selectParent(this)
      });
      this._unsubLink = onActiveLinkChange((link) => this._onActiveLinkChange(link));
    }
    _onActiveLinkChange(link) {
      if (link && this.editor) {
        mountLinkSection(this.host);
        return;
      }
      if (link && !this.editor) {
        this._openForLink(link);
        return;
      }
      mountLinkSection(this.host);
      if (!this.editor)
        this.close();
    }
    _openForLink(anchor) {
      this.host.innerHTML = "";
      this.lastConfigKey = "";
      mountLinkSection(this.host);
      const r = anchor.getBoundingClientRect();
      const above = r.top - 50;
      const below = r.bottom + 6;
      const raw = above >= 8 ? above : below;
      const top = Math.max(8, Math.min(window.innerHeight - 60, raw));
      const left = Math.max(8, Math.min(window.innerWidth - 320, r.left));
      this.host.style.cssText = `position:fixed;top:${top}px;left:${left}px;` + `visibility:visible;opacity:1;pointer-events:auto;`;
    }
    setEditor(editor) {
      if (!editor.isInteractive) {
        this.close();
        this.editor = null;
        this.target = null;
        return;
      }
      const prev = this.hoverEl;
      this.target?.classList.remove("p9r-active");
      this.editor = editor;
      this.target = editor.target;
      this.hoverEl = editor.getActionBarAnchor?.() ?? editor.target;
      this.highlight?.dispose();
      const overlayParent = getClosestEditorSystem(this.host).shadowRoot.querySelector("#editorSystem");
      this.highlight = new Highlight(this.hoverEl, { color: "var(--primary-base, #3b82f6)", parent: overlayParent });
      this.events.rebindHover(prev);
      this.insertBtns.resolveTarget(editor);
    }
    open(mouseX, mouseY) {
      open(this, mouseX, mouseY);
    }
    close() {
      this.pin.close();
      this.highlight?.dispose();
      this.highlight = null;
      this.target?.classList.remove("p9r-active");
      document.querySelectorAll(".p9r-breadcrumb-hover").forEach((el) => el.classList.remove("p9r-breadcrumb-hover"));
      this.host.style.cssText = "visibility:hidden;opacity:0;pointer-events:none;";
      this.insertBtns.hide();
      this.ro.disconnect();
      this.events.detach();
      this.positionLocked = false;
    }
    renderBar() {
      if (!this.editor)
        return;
      const r = renderActionBar(this.host, this.editor, findParentEditor(this.target), this.target, this.lastConfigKey);
      if (r) {
        this.lastConfigKey = r.configKey;
        refreshPinButton(this.host, this.editor);
      }
      mountLinkSection(this.host);
    }
    withCooldown(fn2) {
      fn2();
      this.close();
      this.cooldown = true;
      requestAnimationFrame(() => {
        this.cooldown = false;
      });
    }
  }

  // src/components/editor/EditorSystem/BlocActions/BlocActions.ts
  class BlocActions extends d2 {
    _ctrl;
    constructor() {
      super();
      this._ctrl = new BagController(this);
    }
    connectedCallback() {
      super.connectedCallback();
      this._ctrl.insertBtns.attachTo(this.parentElement);
    }
    setEditor(editor) {
      this._ctrl.setEditor(editor);
    }
    open(mouseX, mouseY) {
      this._ctrl.open(mouseX, mouseY);
    }
    close() {
      this._ctrl.close();
    }
  }
  if (!customElements.get("cms-bloc-actions"))
    customElements.define("cms-bloc-actions", BlocActions);

  // src/components/editor/EditorSystem/BlocLibrary/template.html
  var template_default8 = `<dialog id="dialog">
    <div class="container">
        <header class="header">
            <nav class="tabs" id="tabs">
                <button class="tab active" data-section="blocs">Blocs</button>
                <button class="tab" data-section="templates">Templates</button>
                <button class="tab" data-section="snippets">Snippets</button>
            </nav>
            <div class="search-wrap">
                <input id="search" class="search-input" type="search" placeholder="Search blocs, templates, snippets…" autocomplete="off" />
            </div>
            <form method="dialog">
                <button class="default-close">&times;</button>
            </form>
        </header>
        <div class="content">
            <nav class="groups-sidebar" id="sidebar"></nav>
            <main class="blocs-grid" id="grid"></main>
        </div>
    </div>
</dialog>
`;

  // src/components/editor/EditorSystem/BlocLibrary/style.css
  var style_default8 = `:host {
    --bg-main: rgba(255, 255, 255, 0.95);
    --bg-card: #ffffff;

    --text-primary: #1a1a1a;
    --text-secondary: #666;

    --accent: #007aff;
    --border: rgba(0, 0, 0, 0.06);
    --shadow: 0 20px 60px rgba(0, 0, 0, 0.15);

    --sidebar-width: 200px;

    display: block;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

#dialog {
    padding: 0;
    border: none;
    background: transparent;
    overflow: visible;
    animation: dialogFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes dialogFadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
}

#dialog::backdrop {
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
}

.container {
    width: 90vw;
    max-width: 1000px;
    height: 70vh;
    background: var(--bg-main);
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
}

.header {
    padding: 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--border);
    height: 54px;
    flex-shrink: 0;
}

.search-wrap {
    flex: 1;
    display: flex;
    justify-content: center;
}

.search-input {
    all: unset;
    width: 100%;
    max-width: 360px;
    box-sizing: border-box;
    padding: 7px 12px;
    font-size: 13px;
    color: var(--text-primary);
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid transparent;
    border-radius: 8px;
    transition: all 0.15s;
}

.search-input:focus {
    background: #fff;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15);
}

.search-input::placeholder {
    color: var(--text-secondary);
}

.tabs {
    display: flex;
    gap: 4px;
}

.tab {
    all: unset;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.15s;
}

.tab:hover:not(.active) {
    background: rgba(0, 0, 0, 0.04);
    color: var(--text-primary);
}

.tab.active {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
}

form[method="dialog"] {
    display: flex;
    align-items: center;
}

.default-close {
    all: unset;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    cursor: pointer;
    background: rgba(0, 0, 0, 0.03);
    color: var(--text-secondary);
    font-size: 1.4rem;
    transition: all 0.2s;
}

.default-close:hover {
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
    transform: rotate(90deg);
}

.content {
    display: flex;
    flex: 1;
    overflow: hidden;
}

.groups-sidebar {
    width: var(--sidebar-width);
    padding: 16px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    flex-shrink: 0;
}

.sidebar-item {
    all: unset;
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary);
    transition: all 0.15s;
}

.sidebar-item:hover:not(.active) {
    background: rgba(0, 0, 0, 0.03);
    color: var(--text-primary);
}

.sidebar-item.active {
    background: rgba(0, 122, 255, 0.08);
    color: var(--accent);
    font-weight: 600;
}

.blocs-grid {
    flex: 1;
    padding: 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    overflow-y: auto;
    align-content: start;
}

.blocs-grid cms-empty-state {
    grid-column: 1 / -1;
}

.section-header {
    grid-column: 1 / -1;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-secondary);
    padding: 6px 4px 2px;
    margin-top: 4px;
}

.section-header:first-child {
    margin-top: 0;
}
`;

  // src/components/editor/EditorSystem/BlocLibrary/api.ts
  async function fetchJson(path, fallback) {
    try {
      const res = await fetch(resolveApiUrl(path));
      if (!res.ok)
        return fallback;
      return await res.json();
    } catch (e2) {
      console.log(e2);
      return fallback;
    }
  }
  var fetchTemplates = () => fetchJson("template/list", []);
  var fetchSnippets = () => fetchJson("snippet/list", []);
  var fetchTemplateContent = async (id2) => {
    try {
      const res = await fetch(resolveApiUrl(`template?id=${encodeURIComponent(id2)}`));
      if (!res.ok)
        return "";
      const tpl = await res.json();
      return tpl.content ?? "";
    } catch (e2) {
      console.log(e2);
      return "";
    }
  };
  async function fetchBlocMeta() {
    const list = await fetchJson("bloc/list", []);
    return new Map(list.map((b2) => [b2.id, { description: b2.description }]));
  }

  // src/components/editor/EditorSystem/BlocLibrary/components/Card/template.html
  var template_default9 = `<button type="button" class="card">
    <span class="icon"><slot name="icon"></slot></span>
    <span class="text">
        <span class="title"><slot name="title"></slot></span>
        <span class="description"><slot name="description"></slot></span>
    </span>
</button>
`;

  // src/components/editor/EditorSystem/BlocLibrary/components/Card/style.css
  var style_default9 = `:host {
    display: contents;
}

.card {
    all: unset;
    background: var(--bg-card, #ffffff);
    border: 1px solid #eee;
    border-radius: 12px;
    padding: 12px 14px;
    min-height: 72px;
    display: grid;
    grid-template-columns: 32px 1fr;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: 0.15s;
    box-sizing: border-box;
    overflow: hidden;
}

.icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent, #007aff);
}

::slotted(svg) {
    width: 28px;
    height: 28px;
}

.card:hover {
    border-color: var(--accent, #007aff);
    background: #f8fbff;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
}

.text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #1a1a1a);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.description {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-secondary, #666);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.description:not(:has(::slotted(*))) {
    display: none;
}
`;

  // src/components/editor/EditorSystem/BlocLibrary/components/Card/Card.ts
  var Metadata4 = {
    css: style_default9,
    template: template_default9
  };

  class Card extends A2 {
    constructor() {
      super(Metadata4);
    }
    static create(opts) {
      const card = document.createElement("cms-bloc-library-card");
      const iconFragment = document.createRange().createContextualFragment(opts.icon);
      const iconRoot = iconFragment.firstElementChild;
      if (iconRoot) {
        iconRoot.setAttribute("slot", "icon");
        card.appendChild(iconRoot);
      }
      const titleSpan = document.createElement("span");
      titleSpan.slot = "title";
      titleSpan.textContent = opts.title;
      card.appendChild(titleSpan);
      if (opts.description) {
        const descSpan = document.createElement("span");
        descSpan.slot = "description";
        descSpan.textContent = opts.description;
        card.appendChild(descSpan);
      }
      return card;
    }
  }
  if (!customElements.get("cms-bloc-library-card")) {
    customElements.define("cms-bloc-library-card", Card);
  }

  // src/components/editor/EditorSystem/BlocLibrary/sections/renderBlocs.ts
  function renderBlocs({ grid, items, blocMeta, onPick }) {
    for (const item of items) {
      const card = Card.create({
        icon: ICON_COMPONENT,
        title: item.label,
        description: blocMeta.get(item.tag)?.description
      });
      card.addEventListener("click", () => onPick({ type: "bloc", id: item.tag }));
      grid.appendChild(card);
    }
  }

  // src/components/editor/EditorSystem/BlocLibrary/sections/renderTemplates.ts
  function renderTemplates({ grid, templates, category, onPick }) {
    const filtered = templates.filter((t) => (t.category || "Default") === category);
    if (filtered.length === 0) {
      grid.appendChild(EmptyState.create({
        icon: ICON_TEMPLATE_MUTED,
        title: "No templates in this category"
      }));
      return;
    }
    for (const tpl of filtered) {
      const card = Card.create({
        icon: ICON_TEMPLATE,
        title: tpl.name,
        description: tpl.description
      });
      card.addEventListener("click", async () => {
        const html = await fetchTemplateContent(tpl.id);
        onPick({ type: "template", html });
      });
      grid.appendChild(card);
    }
  }

  // src/components/editor/EditorSystem/BlocLibrary/sections/renderSnippets.ts
  function renderSnippets({ grid, snippets, category, onPick }) {
    const filtered = snippets.filter((s3) => (s3.category || "Default") === category);
    if (filtered.length === 0) {
      grid.appendChild(EmptyState.create({
        icon: ICON_SNIPPET_MUTED,
        title: "No snippets in this category"
      }));
      return;
    }
    for (const snippet of filtered) {
      const card = Card.create({
        icon: ICON_SNIPPET,
        title: snippet.name,
        description: snippet.description
      });
      card.addEventListener("click", () => onPick({ type: "snippet", identifier: snippet.identifier }));
      grid.appendChild(card);
    }
  }

  // src/components/editor/EditorSystem/BlocLibrary/sections/renderSearch.ts
  function renderSearch({ grid, query, blocs, blocMeta, templates, snippets, onPick }) {
    const q2 = query.trim().toLowerCase();
    const matchingBlocs = blocs.filter((b2) => {
      const desc = blocMeta.get(b2.tag)?.description ?? "";
      return b2.label.toLowerCase().includes(q2) || b2.tag.toLowerCase().includes(q2) || desc.toLowerCase().includes(q2);
    });
    const matchingTemplates = templates.filter((t) => t.name.toLowerCase().includes(q2) || (t.description ?? "").toLowerCase().includes(q2) || (t.category ?? "").toLowerCase().includes(q2));
    const matchingSnippets = snippets.filter((s3) => s3.name.toLowerCase().includes(q2) || (s3.description ?? "").toLowerCase().includes(q2) || s3.identifier.toLowerCase().includes(q2) || (s3.category ?? "").toLowerCase().includes(q2));
    const total = matchingBlocs.length + matchingTemplates.length + matchingSnippets.length;
    if (total === 0) {
      grid.appendChild(EmptyState.create({
        icon: ICON_COMPONENT,
        title: `No results for "${query}"`
      }));
      return;
    }
    if (matchingBlocs.length > 0) {
      appendSectionHeader(grid, "Blocs");
      for (const item of matchingBlocs) {
        const card = Card.create({
          icon: ICON_COMPONENT,
          title: item.label,
          description: blocMeta.get(item.tag)?.description
        });
        card.addEventListener("click", () => onPick({ type: "bloc", id: item.tag }));
        grid.appendChild(card);
      }
    }
    if (matchingTemplates.length > 0) {
      appendSectionHeader(grid, "Templates");
      for (const tpl of matchingTemplates) {
        const card = Card.create({
          icon: ICON_TEMPLATE,
          title: tpl.name,
          description: tpl.description
        });
        card.addEventListener("click", async () => {
          const html = await fetchTemplateContent(tpl.id);
          onPick({ type: "template", html });
        });
        grid.appendChild(card);
      }
    }
    if (matchingSnippets.length > 0) {
      appendSectionHeader(grid, "Snippets");
      for (const snippet of matchingSnippets) {
        const card = Card.create({
          icon: ICON_SNIPPET,
          title: snippet.name,
          description: snippet.description
        });
        card.addEventListener("click", () => onPick({ type: "snippet", identifier: snippet.identifier }));
        grid.appendChild(card);
      }
    }
  }
  function appendSectionHeader(grid, label) {
    const header = document.createElement("div");
    header.className = "section-header";
    header.textContent = label;
    grid.appendChild(header);
  }

  // src/components/editor/EditorSystem/BlocLibrary/BlocLibrary.ts
  var Metadata5 = {
    css: style_default8,
    template: template_default8
  };

  class BlocLibrary extends A2 {
    _dialog;
    _section = "blocs";
    _activeGroup = null;
    _query = "";
    _templates = [];
    _snippets = [];
    _blocMeta = new Map;
    _dataLoaded = false;
    _onInsert = null;
    constructor() {
      super(Metadata5);
    }
    connectedCallback() {
      const s3 = this.shadowRoot;
      this._dialog = s3.querySelector("#dialog");
      this._dialog.addEventListener("click", (e2) => {
        if (e2.target === this._dialog)
          this.close();
      });
      this._dialog.addEventListener("close", () => {
        this._onInsert = null;
      });
      s3.getElementById("tabs").addEventListener("click", (e2) => this._onTabClick(e2));
      s3.getElementById("sidebar").addEventListener("click", (e2) => this._onSidebarClick(e2));
      s3.getElementById("search").addEventListener("input", (e2) => this._onSearchInput(e2));
    }
    open(onInsert) {
      this._onInsert = onInsert ?? null;
      this._dialog.showModal();
      this._refresh();
    }
    close() {
      this._onInsert = null;
      this._dialog.close();
    }
    async _refresh() {
      if (!this._dataLoaded) {
        const [templates, snippets, blocMeta] = await Promise.all([
          fetchTemplates(),
          fetchSnippets(),
          fetchBlocMeta()
        ]);
        this._templates = templates;
        this._snippets = snippets;
        this._blocMeta = blocMeta;
        this._dataLoaded = true;
      }
      if (!this._activeGroup && this._section === "blocs") {
        const groups = Array.from(getClosestEditorSystem(this).observer.getGroups());
        if (groups.length > 0)
          this._activeGroup = groups[0];
      }
      this._render();
      this.shadowRoot.getElementById("search").focus();
    }
    _onTabClick(e2) {
      const tab = e2.target.closest(".tab");
      if (!tab || !tab.dataset.section)
        return;
      this._section = tab.dataset.section;
      this._activeGroup = null;
      this._render();
    }
    _onSidebarClick(e2) {
      const item = e2.target.closest(".sidebar-item");
      if (!item)
        return;
      this._activeGroup = item.dataset.group ?? null;
      this._render();
    }
    _onSearchInput(e2) {
      this._query = e2.target.value;
      this._render();
    }
    _render() {
      const searching = this._query.trim().length > 0;
      this._renderTabs(searching);
      this._renderSidebar(searching);
      this._renderGrid(searching);
    }
    _renderTabs(searching) {
      this.shadowRoot.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("active", !searching && tab.dataset.section === this._section);
      });
    }
    _renderSidebar(searching) {
      const sidebar = this.shadowRoot.getElementById("sidebar");
      sidebar.innerHTML = "";
      sidebar.style.display = searching ? "none" : "";
      if (searching)
        return;
      const groups = this._getGroups();
      if (this._activeGroup === null && groups.length > 0) {
        this._activeGroup = groups[0];
      }
      for (const group of groups) {
        const btn = document.createElement("button");
        btn.className = `sidebar-item ${group === this._activeGroup ? "active" : ""}`;
        btn.dataset.group = group;
        btn.textContent = group;
        sidebar.appendChild(btn);
      }
    }
    _renderGrid(searching) {
      const editorSystem = getClosestEditorSystem(this);
      const grid = this.shadowRoot.getElementById("grid");
      grid.innerHTML = "";
      const onPick = (detail) => this._emitInsert(detail);
      if (searching) {
        renderSearch({
          grid,
          query: this._query,
          blocs: Array.from(editorSystem.observer.getItems()),
          blocMeta: this._blocMeta,
          templates: this._templates,
          snippets: this._snippets,
          onPick
        });
        return;
      }
      if (this._section === "blocs") {
        if (!this._activeGroup)
          return;
        renderBlocs({
          grid,
          items: Array.from(editorSystem.observer.getItemsByGroup(this._activeGroup)),
          blocMeta: this._blocMeta,
          onPick
        });
      } else if (this._section === "templates") {
        renderTemplates({ grid, templates: this._templates, category: this._activeGroup, onPick });
      } else {
        renderSnippets({ grid, snippets: this._snippets, category: this._activeGroup, onPick });
      }
    }
    _getGroups() {
      const editorSystem = getClosestEditorSystem(this);
      if (this._section === "blocs")
        return Array.from(editorSystem.observer.getGroups());
      if (this._section === "templates")
        return Array.from(new Set(this._templates.map((t) => t.category || "Default")));
      return Array.from(new Set(this._snippets.map((s3) => s3.category || "Default")));
    }
    _emitInsert(detail) {
      const onInsert = this._onInsert;
      this.close();
      onInsert?.(detail);
    }
  }
  if (!customElements.get("cms-bloc-library")) {
    customElements.define("cms-bloc-library", BlocLibrary);
  }

  // src/components/editor/EditorSystem/DragManager.ts
  var DRAG_PILL_WIDTH = 180;
  var DRAG_PILL_HEIGHT = 32;

  class DragManager {
    draggedElement = null;
    _originalDisplay = "";
    _ghost = null;
    _indicator = null;
    _dropTarget = null;
    _dropPosition = null;
    _onDragStart = (e2) => this.handleDragStart(e2);
    _onDragOver = (e2) => this.handleDragOver(e2);
    _onDrop = (e2) => this.handleDrop(e2);
    _onDragEnd = () => this.handleDragEnd();
    _container;
    constructor(container) {
      this._container = container;
      container.addEventListener("dragstart", this._onDragStart);
      container.addEventListener("dragover", this._onDragOver);
      container.addEventListener("drop", this._onDrop);
      container.addEventListener("dragend", this._onDragEnd);
    }
    dispose() {
      this._container.removeEventListener("dragstart", this._onDragStart);
      this._container.removeEventListener("dragover", this._onDragOver);
      this._container.removeEventListener("drop", this._onDrop);
      this._container.removeEventListener("dragend", this._onDragEnd);
      this._finalize();
    }
    handleDragStart(e2) {
      this.draggedElement = e2.target.closest(".editor-block");
      if (!this.draggedElement)
        return;
      e2.dataTransfer?.setData("text/plain", "");
      this._setGhostImage(e2);
      this.draggedElement.classList.add("dragging");
      const root = this._container.getRootNode();
      root.querySelector("cms-bloc-actions")?.close();
      root.querySelector("cms-richtextbar")?.hide();
      this._originalDisplay = this.draggedElement.style.display;
      const toHide = this.draggedElement;
      setTimeout(() => {
        if (this.draggedElement === toHide)
          toHide.style.display = "none";
      }, 0);
      this._createIndicator();
    }
    handleDragOver(e2) {
      e2.preventDefault();
      if (!this.draggedElement)
        return;
      const target = this._pickTarget(e2);
      if (!target) {
        this._hideIndicator();
        return;
      }
      const rect = target.getBoundingClientRect();
      const horizontal = this._isHorizontalFlow(target);
      const after = horizontal ? (e2.clientX - rect.left) / (rect.right - rect.left) > 0.5 : (e2.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      this._dropTarget = target;
      this._dropPosition = after ? "after" : "before";
      this._showIndicator(target, after, horizontal);
    }
    _isHorizontalFlow(target) {
      const parent = target.parentElement;
      if (!parent)
        return false;
      const cs2 = getComputedStyle(parent);
      const display = cs2.display;
      if (display.includes("inline"))
        return true;
      if (display.endsWith("flex")) {
        return cs2.flexDirection.startsWith("row");
      }
      if (display.endsWith("grid")) {
        return true;
      }
      return false;
    }
    _pickTarget(e2) {
      const el = e2.target?.closest?.(".editor-block");
      if (!el)
        return null;
      if (el === this.draggedElement)
        return null;
      if (this.draggedElement && el.contains(this.draggedElement))
        return null;
      if (el.getAttribute(p9r.attr.ACTION.DISABLE_DRAGGING) === "true")
        return null;
      return el;
    }
    handleDrop(e2) {
      e2.preventDefault();
      this._commitDrop();
      this._finalize();
    }
    handleDragEnd() {
      this._finalize();
    }
    _commitDrop() {
      if (!this.draggedElement || !this._dropTarget || !this._dropPosition)
        return;
      this._matchSlot(this._dropTarget.getAttribute("slot"));
      const parent = this._dropTarget.parentElement;
      if (!parent)
        return;
      if (this._dropPosition === "after") {
        parent.insertBefore(this.draggedElement, this._dropTarget.nextSibling);
      } else {
        parent.insertBefore(this.draggedElement, this._dropTarget);
      }
    }
    _matchSlot(slotName) {
      if (!this.draggedElement)
        return;
      const current = this.draggedElement.getAttribute("slot");
      if (slotName === current)
        return;
      if (slotName) {
        this.draggedElement.setAttribute("slot", slotName);
      } else {
        this.draggedElement.removeAttribute("slot");
      }
    }
    _setGhostImage(e2) {
      if (!e2.dataTransfer || !this.draggedElement)
        return;
      const ghost = document.createElement("div");
      ghost.className = "p9r-drag-ghost";
      Object.assign(ghost.style, {
        position: "fixed",
        top: "-9999px",
        left: "-9999px",
        width: `${DRAG_PILL_WIDTH}px`,
        height: `${DRAG_PILL_HEIGHT}px`,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 12px",
        boxSizing: "border-box",
        background: "rgba(30, 41, 59, 0.95)",
        color: "#fff",
        border: "1px solid rgba(67, 97, 238, 0.8)",
        borderRadius: "999px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "12px",
        fontWeight: "600",
        lineHeight: "1",
        pointerEvents: "none",
        overflow: "hidden",
        whiteSpace: "nowrap"
      });
      ghost.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round"
                 style="flex-shrink:0;opacity:0.8">
                <circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/>
                <circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>
            </svg>
            <span style="overflow:hidden;text-overflow:ellipsis"></span>
        `;
      ghost.querySelector("span").textContent = `<${this.draggedElement.tagName.toLowerCase()}>`;
      document.body.appendChild(ghost);
      e2.dataTransfer.setDragImage(ghost, 16, DRAG_PILL_HEIGHT / 2);
      this._ghost = ghost;
    }
    _createIndicator() {
      const ind = document.createElement("div");
      ind.className = "p9r-drop-indicator";
      Object.assign(ind.style, {
        position: "fixed",
        height: "3px",
        background: "rgba(67, 97, 238, 1)",
        borderRadius: "2px",
        boxShadow: "0 0 8px rgba(67, 97, 238, 0.6)",
        pointerEvents: "none",
        zIndex: "999999",
        opacity: "0",
        left: "0",
        top: "0",
        width: "0"
      });
      document.body.appendChild(ind);
      this._indicator = ind;
    }
    _showIndicator(target, after, horizontal) {
      if (!this._indicator)
        return;
      const r = target.getBoundingClientRect();
      if (horizontal) {
        const x2 = (after ? r.right : r.left) - 1.5;
        this._indicator.style.left = `${x2}px`;
        this._indicator.style.top = `${r.top}px`;
        this._indicator.style.width = "3px";
        this._indicator.style.height = `${r.height}px`;
      } else {
        const y2 = (after ? r.bottom : r.top) - 1.5;
        this._indicator.style.left = `${r.left}px`;
        this._indicator.style.top = `${y2}px`;
        this._indicator.style.width = `${r.width}px`;
        this._indicator.style.height = "3px";
      }
      this._indicator.style.opacity = "1";
    }
    _hideIndicator() {
      if (this._indicator)
        this._indicator.style.opacity = "0";
      this._dropTarget = null;
      this._dropPosition = null;
    }
    _finalize() {
      if (this.draggedElement) {
        this.draggedElement.style.display = this._originalDisplay;
        this.draggedElement.classList.remove("dragging");
      }
      this._ghost?.remove();
      this._ghost = null;
      this._indicator?.remove();
      this._indicator = null;
      this._dropTarget = null;
      this._dropPosition = null;
      this.draggedElement = null;
    }
  }

  // src/components/editor/EditorSystem/EditorRoot/template.html
  var template_default10 = `<div>
    <slot name="style"></slot>
    <slot name="script"></slot>
    <div id="workingElement">
        <slot>
            <p></p>
        </slot>
    </div>
    <div id="editorSystem">
        <cms-floating-toolbar></cms-floating-toolbar>
        <cms-richtextbar></cms-richtextbar>
        <cms-bloc-actions></cms-bloc-actions>
        <cms-bloc-library></cms-bloc-library>

        <slot name="configuration"></slot>
    </div>
</div>`;

  // src/components/editor/EditorSystem/EditorRoot/EditorRoot.style.css
  var EditorRoot_style_default = `/*
 * Admin design tokens + typography, scoped to #editorSystem.
 *
 * The chrome elements inside the editor shadow (cms-bloc-actions,
 * cms-bloc-library, cms-floating-toolbar, cms-richtextbar, …) inherit
 * these tokens via the cascade. #workingElement is intentionally left
 * out so the user's preview content sees only the theme.css that the
 * editor template loads at document scope — no admin pollution.
 *
 * Mirrors \`static/assets/control-styles.css\` for parity with the admin
 * pages; keep the two in sync when adding new tokens.
 */

/*
 * Layout transparency. The host element, its shadow wrapper, and the
 * working element use \`display: contents\` so the slotted page content
 * participates directly in the document's flex layout. This lets pages
 * with \`body { display: flex; flex-direction: column }\` stretch a
 * footer to the bottom via \`margin-top: auto\`.
 */
:host { display: contents; }
:host > div { display: contents; }
#workingElement { display: contents; }

#editorSystem {
    /* Surfaces */
    --bg-base:    oklch(98% 0.004 265);
    --bg-surface: oklch(100% 0 0);
    --bg-overlay: oklch(100% 0 0);

    /* Text */
    --text-main:  oklch(22% 0.02 265);
    --text-body:  oklch(38% 0.02 265);
    --text-muted: oklch(60% 0.01 265);
    --text-label: oklch(45% 0.02 265);

    /* Borders */
    --border-default: oklch(92% 0.006 265);
    --border-light:   oklch(96% 0.004 265);

    /* Accents — base / muted / contrasted */
    --primary-base:       oklch(60% 0.18 265);
    --primary-muted:      oklch(96% 0.03 265);
    --primary-contrasted: oklch(30% 0.12 265);

    --secondary-base:       oklch(50% 0.02 265);
    --secondary-muted:      oklch(94% 0.008 265);
    --secondary-contrasted: oklch(25% 0.03 265);

    --danger-base:        oklch(60% 0.20 25);
    --danger-muted:       oklch(96% 0.03 25);
    --danger-contrasted:  oklch(30% 0.12 25);

    --success-base:       oklch(62% 0.15 150);
    --success-muted:      oklch(96% 0.03 150);
    --success-contrasted: oklch(30% 0.10 150);

    --info-base:          oklch(65% 0.12 225);
    --info-muted:         oklch(96% 0.02 225);
    --info-contrasted:    oklch(30% 0.08 225);

    --warning-base:       oklch(72% 0.15 70);
    --warning-muted:      oklch(96% 0.03 70);
    --warning-contrasted: oklch(35% 0.10 70);

    --color-primary: var(--primary-base);

    font-family:
        "Inter",
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        system-ui,
        sans-serif;
    color: var(--text-main);
    font-size: 14px;
    line-height: 1.5;
}
`;

  // src/core/isToggable.ts
  function isToggable(el) {
    return "open" in el && typeof el.open === "function";
  }

  // src/core/editorSystem/navigationGuard.ts
  var _origPushState = null;
  var _origReplaceState = null;
  function rawReplaceState(state, _unused, url) {
    if (_origReplaceState)
      _origReplaceState.call(history, state, _unused, url);
    else
      history.replaceState(state, _unused, url);
  }
  function installNavigationGuard() {
    const origPushState = history.pushState.bind(history);
    const origReplaceState = history.replaceState.bind(history);
    _origPushState = origPushState;
    _origReplaceState = origReplaceState;
    const intercept = (raw) => {
      if (raw === null || raw === undefined || raw === "")
        return false;
      const href = String(raw);
      try {
        const next = new URL(href, location.href);
        if (next.origin === location.origin && next.pathname === location.pathname) {
          return false;
        }
      } catch {}
      const ctx = getEditorContext();
      const cls = classifyLink(href, location.origin, ctx.knownPagePaths);
      ctx.requestNavigation({ href, classification: cls, via: "programmatic" });
      return true;
    };
    history.pushState = (state, _unused, url) => {
      if (url == null || !intercept(url))
        origPushState(state, _unused, url);
    };
    history.replaceState = (state, _unused, url) => {
      if (url == null || !intercept(url))
        origReplaceState(state, _unused, url);
    };
    return () => {
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
      _origPushState = null;
      _origReplaceState = null;
    };
  }

  // src/core/editorSystem/installLinkInterceptor.ts
  function installLinkInterceptor() {
    const ensureLinkBar = () => {
      if (document.querySelector("cms-link-bar"))
        return;
      const bar = document.createElement("cms-link-bar");
      document.body.appendChild(bar);
    };
    const findAnchor = (e2) => {
      for (const n2 of e2.composedPath()) {
        if (n2 instanceof HTMLAnchorElement)
          return n2;
      }
      return null;
    };
    const onClick = (e2) => {
      const anchor = findAnchor(e2);
      if (!anchor) {
        setActiveLink(null);
        return;
      }
      const href = anchor.getAttribute("href") || "";
      const ctx = getEditorContext();
      if (ctx.mode === "view") {
        e2.preventDefault();
        e2.stopPropagation();
        const cls = classifyLink(href, location.origin, ctx.knownPagePaths);
        ctx.requestNavigation({ href, classification: cls, via: "link-click" });
        return;
      }
      if (e2.ctrlKey || e2.metaKey || e2.shiftKey) {
        e2.preventDefault();
        e2.stopPropagation();
        const cls = classifyLink(href, location.origin, ctx.knownPagePaths);
        ctx.requestNavigation({ href, classification: cls, via: "modifier-click" });
        return;
      }
      e2.preventDefault();
      ensureLinkBar();
      setActiveLink(anchor);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.querySelector("cms-link-bar")?.remove();
      setActiveLink(null);
    };
  }

  // src/core/editorSystem/dirtyState.ts
  var _getContent = null;
  var _baseline = null;
  function isDirty() {
    return _baseline !== null && _getContent !== null && _getContent() !== _baseline;
  }
  function clearDirty() {
    if (_getContent)
      _baseline = _getContent();
  }
  var FIRST_INTERACTION = ["pointerdown", "keydown", "paste", "drop"];
  function armDirty(host, getContent) {
    _getContent = getContent;
    _baseline = null;
    const capture = () => {
      if (_baseline === null && _getContent)
        _baseline = _getContent();
    };
    for (const ev of FIRST_INTERACTION)
      host.addEventListener(ev, capture, true);
    return () => {
      for (const ev of FIRST_INTERACTION)
        host.removeEventListener(ev, capture, true);
      _getContent = null;
      _baseline = null;
    };
  }

  // src/components/editor/EditorSystem/EditorRoot/linkNavigation.ts
  function resolveTargetForLink(req) {
    const { classification: cls, href } = req;
    switch (cls.kind) {
      case "page": {
        const ctx = getEditorContext();
        const id2 = ctx.pageIdByPath.get(cls.target) ?? cls.target;
        const params = new URLSearchParams({ id: id2 });
        if (ctx.mode === "view")
          params.set("mode", "view");
        try {
          const original = new URL(href, location.origin);
          for (const [k, v2] of original.searchParams) {
            params.append(k, v2);
          }
        } catch {}
        const dest = `${getMetaBasePath()}/editor/page?${params.toString()}`;
        window.location.href = dest;
        return;
      }
      case "anchor": {
        const id2 = cls.target;
        if (!id2)
          return;
        const candidate = document.getElementById(id2) ?? document.querySelector(`[name="${CSS.escape(id2)}"]`);
        candidate?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      case "asset":
      case "external":
      case "mailto":
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      case "empty":
        return;
    }
  }

  // src/components/editor/EditorSystem/EditorRoot/stripResidualChrome.ts
  function stripResidualChrome(root) {
    walk2(root);
  }
  function walk2(el) {
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith("p9r-"))
        el.removeAttribute(a.name);
    }
    el.removeAttribute("contenteditable");
    el.removeAttribute("tabindex");
    el.removeAttribute("draggable");
    if (el.classList.contains("editor-block")) {
      el.classList.remove("editor-block");
      if (!el.getAttribute("class"))
        el.removeAttribute("class");
    }
    const style = el.style;
    if (style?.getPropertyValue("pointer-events")) {
      style.removeProperty("pointer-events");
      if (style.length === 0)
        el.removeAttribute("style");
    }
    for (const c of Array.from(el.children))
      walk2(c);
    if (el.tagName === "TEMPLATE") {
      for (const c of Array.from(el.content.children))
        walk2(c);
    }
  }

  // src/core/editorSystem/contentRegionAttrs.ts
  var CONTENT_REGION_ATTR = "data-cms-content";

  // src/components/editor/EditorSystem/EditorRoot/contentRegion.ts
  var CONTENT_REGION_SELECTOR = `[${CONTENT_REGION_ATTR}]`;
  function findContentRegion(assigned) {
    const stop = assigned.find((el) => el.hasAttribute(w));
    return stop?.querySelector(CONTENT_REGION_SELECTOR) ?? stop ?? null;
  }
  function isRegionEmpty(region) {
    if (!region)
      return true;
    const nodes = Array.from(region.childNodes).filter((n2) => n2.nodeType === Node.ELEMENT_NODE || n2.nodeType === Node.TEXT_NODE && (n2.textContent ?? "").trim() !== "");
    if (nodes.length === 0)
      return true;
    if (nodes.length !== 1 || nodes[0].nodeType !== Node.ELEMENT_NODE)
      return false;
    const el = nodes[0];
    if (el.tagName !== "P")
      return false;
    if ((el.textContent ?? "").trim() !== "")
      return false;
    const onlyBr = el.children.length === 1 && el.children[0].tagName === "BR";
    return el.children.length === 0 || onlyBr;
  }
  function applyPickedTemplate(host, region, html) {
    if (region) {
      region.innerHTML = html;
      return;
    }
    Array.from(host.children).forEach((c) => {
      if (!c.hasAttribute("slot"))
        c.remove();
    });
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    while (tmp.firstChild)
      host.appendChild(tmp.firstChild);
  }

  // src/core/editorSystem/defaultEditors/ImageEditor/ImageEditor.ts
  var cssStyle = `
    img:hover {
        opacity: 0.5;
        cursor: pointer;
    }
`;

  class ImageEditor extends Editor {
    _mediaCenter = null;
    onClick = (e2) => this.handleClick(e2);
    onSelectMedia = (e2) => this.handleSelectMedia(e2);
    constructor(target) {
      super(target, cssStyle);
      if (!this.target.getAttribute("src"))
        this.target.setAttribute("src", "https://picsum.photos/200");
    }
    init() {
      this.target.removeEventListener("click", this.onClick);
      this.target.addEventListener("click", this.onClick);
    }
    handleSelectMedia(e2) {
      this.target.setAttribute("src", e2.detail.src);
      this.target.setAttribute("alt", e2.detail.alt);
      this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia);
      this._mediaCenter?.remove();
    }
    handleClick(e2) {
      e2.preventDefault();
      e2.stopImmediatePropagation();
      const mediaCenter = document.createElement("cms-media-center");
      document.body.append(mediaCenter);
      requestAnimationFrame(() => {
        this._mediaCenter = mediaCenter;
        mediaCenter.removeEventListener("select-item", this.onSelectMedia);
        mediaCenter.addEventListener("select-item", this.onSelectMedia);
        mediaCenter.show(["folder", "image"]);
      });
    }
    restore() {
      this.target.removeEventListener("click", this.onClick);
      this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia);
      this._mediaCenter?.remove();
    }
  }

  // src/core/editorSystem/defaultEditors/SvgEditor.ts
  var cssStyle2 = `
    svg:hover {
        opacity: 0.5;
        cursor: pointer;
    }
`;

  class SvgEditor extends Editor {
    _mediaCenter = null;
    onClick = (e2) => this.handleClick(e2);
    onSelectMedia = (e2) => this.handleSelectMedia(e2);
    constructor(target) {
      super(target, cssStyle2);
    }
    init() {
      this.target.removeEventListener("click", this.onClick);
      this.target.addEventListener("click", this.onClick);
    }
    restore() {
      this.target.removeEventListener("click", this.onClick);
      this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia);
      this._mediaCenter?.remove();
      this._mediaCenter = null;
    }
    handleClick(e2) {
      e2.preventDefault();
      e2.stopImmediatePropagation();
      const mediaCenter = document.createElement("cms-media-center");
      document.body.append(mediaCenter);
      requestAnimationFrame(() => {
        this._mediaCenter = mediaCenter;
        mediaCenter.removeEventListener("select-item", this.onSelectMedia);
        mediaCenter.addEventListener("select-item", this.onSelectMedia);
        mediaCenter.show(["folder", "image"]);
      });
    }
    async handleSelectMedia(e2) {
      const src = e2.detail?.src;
      const mimetype = e2.detail?.mimetype;
      this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia);
      this._mediaCenter?.remove();
      this._mediaCenter = null;
      if (!src || mimetype !== "image/svg+xml")
        return;
      try {
        const svgText = await fetch(src).then((r) => r.text());
        const cleaned = sanitizeSvg(svgText);
        const parsed = new DOMParser().parseFromString(cleaned, "image/svg+xml");
        const fresh = parsed.documentElement;
        if (!(fresh instanceof SVGElement))
          return;
        const cls = this.target.getAttribute("class");
        if (cls)
          fresh.setAttribute("class", cls);
        this.target.replaceWith(fresh);
        this.target = fresh;
      } catch {}
    }
  }

  // src/components/editor/RichTextBar/commands.ts
  function focusElement() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0)
      return null;
    const node = sel.focusNode;
    if (!node)
      return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }
  function wrapWithElement(wrapper) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0)
      return;
    const range = sel.getRangeAt(0);
    if (range.collapsed)
      return;
    try {
      const contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(wrapper);
      sel.addRange(newRange);
    } catch (e2) {
      console.warn("Selection spans complex markup", e2);
    }
  }
  function toggleFormat(tag) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0)
      return;
    const el = focusElement();
    const existingTag = el?.closest(tag);
    if (existingTag) {
      const parent = existingTag.parentNode;
      const frag = document.createDocumentFragment();
      while (existingTag.firstChild) {
        frag.appendChild(existingTag.firstChild);
      }
      const firstNode = frag.firstChild;
      const lastNode = frag.lastChild;
      parent?.replaceChild(frag, existingTag);
      if (firstNode && lastNode) {
        const newRange = document.createRange();
        newRange.setStartBefore(firstNode);
        newRange.setEndAfter(lastNode);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    } else {
      wrapWithElement(document.createElement(tag));
    }
  }
  function applyBlockAlignment(align) {
    const el = focusElement();
    const block = el?.closest("p, div, h1, h2, h3, h4, h5, h6, li");
    if (block)
      block.style.textAlign = align;
  }
  function applyInlineStyle(prop, value) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed)
      return;
    const el = focusElement();
    if (el && el.tagName === "SPAN" && el.textContent === sel.toString()) {
      el.style[prop] = value;
      return;
    }
    const span = document.createElement("span");
    span.style[prop] = value;
    wrapWithElement(span);
  }
  function removeInlineStyle(prop) {
    const el = focusElement();
    const span = el?.closest("span");
    if (!span)
      return;
    span.style[prop] = "";
    if (span.style.length === 0) {
      const parent = span.parentNode;
      while (span.firstChild)
        parent?.insertBefore(span.firstChild, span);
      parent?.removeChild(span);
    }
  }
  function queryCommandState(cmd) {
    const el = focusElement();
    if (!el)
      return false;
    const style = window.getComputedStyle(el);
    switch (cmd) {
      case "bold":
        return style.fontWeight === "bold" || parseInt(style.fontWeight) >= 700 || !!el.closest("b, strong");
      case "italic":
        return style.fontStyle === "italic" || !!el.closest("i, em");
      case "underline":
        return style.textDecorationLine.includes("underline") || !!el.closest("u");
      case "strikeThrough":
        return style.textDecorationLine.includes("line-through") || !!el.closest("s, strike");
      case "justifyLeft":
        return style.textAlign === "left" || style.textAlign === "start";
      case "justifyCenter":
        return style.textAlign === "center";
      case "justifyRight":
        return style.textAlign === "right";
      default:
        return false;
    }
  }
  function getCurrentFontSize() {
    const el = focusElement();
    if (!el)
      return 16;
    return Math.round(parseFloat(window.getComputedStyle(el).fontSize));
  }
  function getCurrentColor() {
    const el = focusElement();
    if (!el)
      return null;
    return window.getComputedStyle(el).color;
  }
  function insertList(tag) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0)
      return;
    const el = focusElement();
    if (!el)
      return;
    const editable = el.closest("[contenteditable]");
    if (!editable)
      return;
    const list = document.createElement(tag);
    const li2 = document.createElement("li");
    list.appendChild(li2);
    editable.replaceWith(list);
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(li2);
    selection.addRange(newRange);
  }
  function isSafeLinkUrl(raw) {
    const stripped = raw.trim().replace(/[\u0000-\u001F\u007F]/g, "");
    const scheme = stripped.match(/^([a-z][a-z0-9+.-]*):/i);
    if (!scheme)
      return true;
    return ["http", "https", "mailto", "tel", "sms"].includes(scheme[1].toLowerCase());
  }
  function applyLinkUrl(url) {
    if (!url || !isSafeLinkUrl(url))
      return;
    const a = document.createElement("a");
    a.href = url;
    wrapWithElement(a);
  }
  function removeLinkAtSelection() {
    const el = focusElement();
    const a = el?.closest("a");
    if (!a)
      return;
    const parent = a.parentNode;
    while (a.firstChild)
      parent?.insertBefore(a.firstChild, a);
    parent?.removeChild(a);
  }
  function getExistingLink(range) {
    const r = range || window.getSelection()?.getRangeAt(0);
    if (!r)
      return null;
    const node = r.startContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el?.closest("a")?.getAttribute("href") || null;
  }

  // src/components/editor/RichTextBar/sanitizePastedHtml.ts
  var KEEP_TAGS = new Set([
    "p",
    "br",
    "span",
    "b",
    "i",
    "u",
    "s",
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "ul",
    "ol",
    "li"
  ]);
  var RENAME_TAGS = {
    strong: "b",
    em: "i",
    strike: "s",
    del: "s",
    ins: "u"
  };
  var DROP_TAGS = new Set([
    "script",
    "style",
    "noscript",
    "template",
    "head",
    "title",
    "meta",
    "link",
    "base",
    "iframe",
    "object",
    "embed",
    "img",
    "svg",
    "math",
    "canvas",
    "picture",
    "video",
    "audio",
    "source",
    "track",
    "form",
    "input",
    "button",
    "select",
    "option",
    "optgroup",
    "textarea",
    "fieldset",
    "legend"
  ]);
  var BLOCK_TAGS = new Set([
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "ul",
    "ol",
    "li"
  ]);
  var ALIGN_VALUES = new Set(["left", "right", "center", "justify", "start", "end"]);
  var TEXT_NODE = 3;
  var ELEMENT_NODE = 1;
  function sanitizePastedHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const container = document.createElement("div");
    for (const node of cleanChildren(doc.body))
      container.appendChild(node);
    return container.innerHTML;
  }
  function cleanChildren(parent) {
    const out = [];
    for (const child of Array.from(parent.childNodes))
      out.push(...cleanNode(child));
    return out;
  }
  function cleanNode(node) {
    if (node.nodeType === TEXT_NODE)
      return [document.createTextNode(node.nodeValue ?? "")];
    if (node.nodeType !== ELEMENT_NODE)
      return [];
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag))
      return [];
    const children = cleanChildren(el);
    const mapped = RENAME_TAGS[tag] ?? tag;
    if (!KEEP_TAGS.has(mapped))
      return children;
    const out = document.createElement(mapped);
    copyAllowedAttributes(el, out, mapped);
    if ((mapped === "span" || mapped === "a") && out.attributes.length === 0)
      return children;
    for (const child of children)
      out.appendChild(child);
    return [out];
  }
  function copyAllowedAttributes(src, dst, tag) {
    if (tag === "a") {
      const href = src.getAttribute("href");
      if (href && isSafeLinkUrl(href))
        dst.setAttribute("href", href);
      return;
    }
    if (tag === "span") {
      copyStyle(src, dst, ["font-size", "color"]);
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      const align = src.style.getPropertyValue("text-align").trim().toLowerCase();
      if (ALIGN_VALUES.has(align))
        dst.style.setProperty("text-align", align);
    }
  }
  function copyStyle(src, dst, props) {
    for (const prop of props) {
      const value = src.style.getPropertyValue(prop).trim();
      if (value && isSafeCssValue(value))
        dst.style.setProperty(prop, value);
    }
  }
  function isSafeCssValue(value) {
    const lower = value.toLowerCase();
    return !lower.includes("url(") && !lower.includes("expression(") && !lower.includes("javascript:") && !lower.includes("</");
  }

  // src/core/editorSystem/defaultEditors/TextEditor.ts
  var cssStyle3 = `
:is(h1, h2, h3, h4, h5, h6, p, span, blockquote, a):empty::before {
    content: attr(p9r-text-placeholder);
    color: var(--text-muted, #aaa);
    pointer-events: none;
    display: block;
    font-style: italic;
    font-weight: 300;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
    :is(h1, h2, h3, h4, h5, h6, p, span, blockquote):empty {
        display: flex
    }
`;
  var textTags = new Set(["p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "a", "b", "i", "u"]);

  class TextEditor extends Editor {
    onKeyDown = (e2) => this.handleKeyDown(e2);
    onInput = (e2) => this.handleInput(e2);
    onPaste = (e2) => this.handlePaste(e2);
    isInitializing = false;
    constructor(target) {
      super(target, cssStyle3);
      this.observeAttributes();
    }
    attrObserver;
    observeAttributes() {
      this.attrObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName?.startsWith("p9r-")) {
            if (getClosestEditorSystem(this.target).mode === "editor") {
              if (!this.isInitializing) {
                this.isInitializing = true;
                this.init();
              }
            }
          }
        }
      });
    }
    onSwitchMode(mode) {
      super.onSwitchMode(mode);
      if (!this.attrObserver)
        return;
      if (mode === "editor") {
        this.attrObserver.observe(this.target, {
          attributes: true,
          attributeFilter: [p9r.attr.TEXT.BLOC_MANAGEMENT, p9r.attr.TEXT.EDITABLE]
        });
      } else {
        this.isInitializing = false;
        this.attrObserver.disconnect();
      }
    }
    handlePaste(e2) {
      e2.preventDefault();
      e2.stopImmediatePropagation();
      const clipboard = e2.clipboardData;
      if (!clipboard)
        return;
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount)
        return;
      const html = clipboard.getData("text/html");
      const node = html ? document.createRange().createContextualFragment(sanitizePastedHtml(html)) : document.createTextNode(clipboard.getData("text/plain") || "");
      const tail = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node.lastChild : node;
      selection.deleteFromDocument();
      const range = selection.getRangeAt(0);
      range.insertNode(node);
      if (!tail)
        return;
      range.setStartAfter(tail);
      range.setEndAfter(tail);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    static _editorAttrs = new Set([
      "contenteditable",
      "tabindex",
      "draggable"
    ]);
    createElement(tag) {
      const element = document.createElement(tag);
      Array.from(this.target.attributes).forEach((attr) => {
        if (attr.name.startsWith("p9r-"))
          return;
        if (attr.name === "class")
          return;
        if (TextEditor._editorAttrs.has(attr.name))
          return;
        element.setAttribute(attr.name, attr.value);
      });
      const parentId = this.target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (parentId)
        element.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
      element.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
      return element;
    }
    handleKeyDown(e2) {
      if (e2.key === "Enter") {
        if (e2.shiftKey)
          return;
        e2.preventDefault();
        e2.stopImmediatePropagation();
        if (this.isAddAfterDisabled)
          return;
        const nextEl = this.createElement("p");
        nextEl.contentEditable = "true";
        nextEl.tabIndex = 0;
        const sel = window.getSelection();
        if (sel && sel.rangeCount && sel.anchorNode && this.target.contains(sel.anchorNode) && this.target.lastChild) {
          const range = sel.getRangeAt(0);
          if (!range.collapsed)
            range.deleteContents();
          const tail = range.cloneRange();
          tail.setEndAfter(this.target.lastChild);
          const fragment = tail.extractContents();
          nextEl.appendChild(fragment);
        }
        this.target.after(nextEl);
        const observer = getClosestEditorSystem(this.target).observer;
        if (observer) {
          observer.make_it_editor(nextEl);
        } else {
          const e3 = new TextEditor(nextEl);
          e3.viewEditor();
        }
        this._focusWithCaret(nextEl, "start");
      }
      if (e2.key === "Backspace" && this.target.innerHTML === "" && !this.isDeleteDisabled) {
        e2.preventDefault();
        e2.stopImmediatePropagation();
        this.restore();
        const previous = this.target.previousElementSibling;
        const next = this.target.nextElementSibling;
        if (previous)
          previous.focus();
        if (!previous && next)
          next.focus();
        this.target.remove();
      }
      if ((e2.key === "ArrowUp" || e2.key === "ArrowDown") && !e2.shiftKey && !e2.ctrlKey && !e2.metaKey && !e2.altKey) {
        const isUp = e2.key === "ArrowUp";
        const onEdge = isUp ? this._isCaretOnFirstLine() : this._isCaretOnLastLine();
        if (!onEdge)
          return;
        const adjacent = this._findAdjacentTextEditor(isUp ? "prev" : "next");
        if (!adjacent)
          return;
        e2.preventDefault();
        e2.stopImmediatePropagation();
        this._focusWithCaret(adjacent, isUp ? "end" : "start");
      }
    }
    _isCaretOnFirstLine() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount)
        return false;
      if (this.target.innerHTML === "")
        return true;
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      const targetTop = this.target.getBoundingClientRect().top;
      const first = rects[0];
      if (!first) {
        return true;
      }
      return Math.abs(first.top - targetTop) < 5;
    }
    _isCaretOnLastLine() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount)
        return false;
      if (this.target.innerHTML === "")
        return true;
      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      const targetBottom = this.target.getBoundingClientRect().bottom;
      const last = rects[rects.length - 1];
      if (!last)
        return true;
      return Math.abs(last.bottom - targetBottom) < 5;
    }
    _findAdjacentTextEditor(direction) {
      const selector = Array.from(textTags).map((t) => `${t}[contenteditable="true"]`).join(",");
      const all = Array.from(document.querySelectorAll(selector));
      const idx = all.indexOf(this.target);
      if (idx === -1)
        return null;
      return direction === "prev" ? all[idx - 1] ?? null : all[idx + 1] ?? null;
    }
    _focusWithCaret(el, position) {
      el.focus();
      const sel = window.getSelection();
      if (!sel)
        return;
      const range = document.createRange();
      if (el.innerHTML === "") {
        range.setStart(el, 0);
        range.collapse(true);
      } else if (position === "start") {
        range.selectNodeContents(el);
        range.collapse(true);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }
    handleInput(e2) {
      const editorRoot = getClosestEditorSystem(this.target);
      if (this.target.innerHTML === "<br>") {
        this.target.innerHTML = "";
      }
      if (this.target.innerText === "/" && this.isBlocManagementEnabled && !this.isChangeComponentDisabled) {
        e2.stopPropagation();
        e2.stopImmediatePropagation();
        editorRoot.blocLibrary.open((detail) => {
          if (detail.type === "template") {
            const fragment = document.createRange().createContextualFragment(detail.html);
            this.target.replaceWith(fragment);
          } else if (detail.type === "snippet") {
            const new_node = document.createElement("w13c-snippet");
            new_node.setAttribute("identifier", detail.identifier);
            this.target.replaceWith(new_node);
          } else {
            const new_node = this.createElement(detail.id);
            this.target.replaceWith(new_node);
          }
        });
      }
    }
    init() {
      this.target.removeEventListener("keydown", this.onKeyDown);
      this.target.removeEventListener("input", this.onInput);
      this.target.removeEventListener("paste", this.onPaste);
      this.target.addEventListener("keydown", this.onKeyDown);
      this.target.addEventListener("input", this.onInput);
      this.target.addEventListener("paste", this.onPaste);
      if (this.isTextEditable) {
        this.target.tabIndex = 0;
        this.target.contentEditable = "true";
        if (this.isBlocManagementEnabled && !this.isChangeComponentDisabled) {
          this.target.setAttribute(p9r.attr.TEXT.PLACEHOLDER, "Type / or write text");
        } else {
          this.target.setAttribute(p9r.attr.TEXT.PLACEHOLDER, "Type text");
        }
        if (this.target.hasAttribute(p9r.attr.EDITOR.IS_CREATING)) {
          requestAnimationFrame(() => {
            if (this.target.isConnected) {
              this.target.focus();
            }
          });
        }
      }
    }
    get isDeleteDisabled() {
      const deleteAttr = this.target.getAttribute(p9r.attr.ACTION.DISABLE_DELETE);
      return deleteAttr ? deleteAttr === "true" : false;
    }
    refreshActionBarFeatures() {
      super.refreshActionBarFeatures();
      this._actionBarFeatures.set("addBefore", false);
      this._actionBarFeatures.set("addAfter", false);
      this._actionBarFeatures.set("changeComponent", false);
      this._actionBarFeatures.set("delete", false);
      this._actionBarFeatures.set("duplicate", false);
    }
    get isAddAfterDisabled() {
      return this.target.getAttribute(p9r.attr.ACTION.DISABLE_ADD_AFTER) === "true";
    }
    get isChangeComponentDisabled() {
      return this.target.getAttribute(p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT) === "true";
    }
    get isBlocManagementEnabled() {
      const blocManagementAttr = this.target.getAttribute(p9r.attr.TEXT.BLOC_MANAGEMENT);
      return blocManagementAttr ? blocManagementAttr === "true" : true;
    }
    get isTextEditable() {
      const textEditableAttr = this.target.getAttribute(p9r.attr.TEXT.EDITABLE);
      return textEditableAttr ? textEditableAttr === "true" : true;
    }
    restore() {
      this.target.removeAttribute("tabIndex");
      this.target.removeAttribute("contentEditable");
      this.target.removeAttribute(p9r.attr.TEXT.PLACEHOLDER);
      this.target.removeAttribute(p9r.attr.TEXT.BLOC_MANAGEMENT);
      this.target.removeAttribute(p9r.attr.TEXT.EDITABLE);
      this.target.removeEventListener("keydown", this.onKeyDown);
      this.target.removeEventListener("input", this.onInput);
      this.target.removeEventListener("paste", this.onPaste);
    }
    dispose() {
      this.attrObserver?.disconnect();
      this.attrObserver = undefined;
      this.target.removeEventListener("keydown", this.onKeyDown);
      this.target.removeEventListener("input", this.onInput);
      this.target.removeEventListener("paste", this.onPaste);
      super.dispose();
    }
  }

  // src/core/editorSystem/defaultEditors/ListEditor.ts
  var cssStyle4 = `
    li:empty::before{
        content: attr(p9r-text-placeholder);
        color: #aaa;
        pointer-events: none;
        display: block;
        font-style: italic;
        font-weight: 300;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
`;

  class ListEditor extends Editor {
    onKeyDown = (e2) => this.handleKeyDown(e2);
    onInput = (e2) => this.handleInput(e2);
    constructor(target) {
      super(target, cssStyle4);
      let li2 = this.target.querySelector("li");
      if (!li2) {
        li2 = document.createElement("li");
        this.target.append(li2);
      }
      if (this.target.hasAttribute(p9r.attr.EDITOR.IS_CREATING)) {
        const firstLi = li2;
        requestAnimationFrame(() => {
          if (firstLi.isConnected)
            firstLi.focus();
        });
      }
    }
    handleKeyDown(e2) {
      const item = e2.target;
      if (e2.key === "Enter" && !e2.shiftKey) {
        e2.preventDefault();
        e2.stopImmediatePropagation();
        if (item.innerHTML === "")
          this.exitListWithParagraph(item);
        else
          this.splitItem(item);
        return;
      }
      if (e2.key === "Backspace" && item.innerHTML === "") {
        e2.preventDefault();
        e2.stopImmediatePropagation();
        this.removeEmptyItem(item);
      }
    }
    exitListWithParagraph(emptyItem) {
      const p = document.createElement("p");
      const parentId = this.target.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (parentId)
        p.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
      p.setAttribute(p9r.attr.EDITOR.IS_CREATING, "true");
      this.target.after(p);
      emptyItem.remove();
      if (!this.target.querySelector("li"))
        this.target.remove();
      const observer = getClosestEditorSystem(p).observer;
      if (observer)
        observer.make_it_editor(p);
      this.focusAtStart(p);
    }
    splitItem(item) {
      const newItem = document.createElement("li");
      const sel = window.getSelection();
      if (sel && sel.rangeCount && sel.anchorNode && item.contains(sel.anchorNode) && item.lastChild) {
        const range = sel.getRangeAt(0);
        if (!range.collapsed)
          range.deleteContents();
        const tail = range.cloneRange();
        tail.setEndAfter(item.lastChild);
        const fragment = tail.extractContents();
        newItem.appendChild(fragment);
      }
      item.after(newItem);
      this.editorifyItem(newItem);
      this.focusAtStart(newItem);
    }
    removeEmptyItem(item) {
      const previousItem = item.previousElementSibling;
      const nextItem = item.nextElementSibling;
      const listPrev = this.target.previousElementSibling;
      const listNext = this.target.nextElementSibling;
      item.removeEventListener("keydown", this.onKeyDown);
      item.removeEventListener("input", this.onInput);
      item.remove();
      if (!this.target.querySelector("li")) {
        this.target.remove();
        (listPrev ?? listNext)?.focus();
        return;
      }
      (previousItem ?? nextItem)?.focus();
    }
    editorifyItem(item) {
      item.removeEventListener("keydown", this.onKeyDown);
      item.removeEventListener("input", this.onInput);
      item.contentEditable = "true";
      item.setAttribute(p9r.attr.TEXT.PLACEHOLDER, "Type text");
      item.addEventListener("keydown", this.onKeyDown);
      item.addEventListener("input", this.onInput);
    }
    focusAtStart(el) {
      requestAnimationFrame(() => {
        if (!el.isConnected)
          return;
        el.focus();
        const sel = window.getSelection();
        if (!sel)
          return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      });
    }
    handleInput(e2) {
      const item = e2.target;
      if (item.innerHTML === "<br>")
        item.innerHTML = "";
    }
    init() {
      const items = this.target.querySelectorAll("li");
      items.forEach((item) => this.editorifyItem(item));
    }
    restore() {
      const items = this.target.querySelectorAll("li");
      items.forEach((item) => {
        item.contentEditable = "false";
        item.removeEventListener("keydown", this.onKeyDown);
        item.removeEventListener("input", this.onInput);
      });
    }
  }

  // src/core/editorSystem/defaultEditors/SnippetEditor.ts
  var EDIT_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

  class SnippetEditor extends Editor {
    constructor(target) {
      super(target, "");
      target.setAttribute(p9r.attr.ACTION.DISABLE_DUPLICATE, "true");
      this.variant = "snippet";
      this.addCustomAction({
        action: "editSnippet",
        title: "Edit snippet",
        icon: EDIT_ICON,
        handler: async () => {
          const identifier = target.getAttribute("identifier");
          if (!identifier)
            return;
          try {
            const apiUrl = resolveApiUrl("snippet");
            apiUrl.searchParams.set("identifier", identifier);
            const res = await fetch(apiUrl);
            if (!res.ok)
              return;
            const snippet = await res.json();
            window.open(`${getMetaBasePath()}/editor/snippet?id=${encodeURIComponent(snippet.id)}`, "_blank");
          } catch {}
        }
      });
    }
    init() {}
    restore() {}
  }

  // src/core/editorSystem/defaultEditors/BindingCoreEditor.ts
  class BindingCoreEditor extends Editor {
    constructor(target) {
      super(target, "");
      if (getEditorContext().mode === "view")
        this.core.startRuntime();
      else
        this.core.runtime?.deactivate();
    }
    get isInteractive() {
      return false;
    }
    onSwitchMode(mode) {
      if (mode === "view")
        this.core.startRuntime();
      else
        this.core.runtime?.deactivate();
    }
    viewEditor() {
      this.target.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
      super.viewEditor();
    }
    get core() {
      return this.target;
    }
    init() {}
    restore() {}
  }

  // src/components/editor/EditorSystem/ObserverManager.ts
  class ObserverManager {
    workingElement;
    observer;
    editors = new Map;
    groups = new Set(["default"]);
    opaqueTags = new Set;
    constructor(slot) {
      const root = slot.getRootNode();
      if (!(root instanceof ShadowRoot)) {
        throw new Error("ObserverManager: slot must live in a ShadowRoot");
      }
      const host = root.host;
      this.workingElement = host;
      this._registerEditors();
      const initialAssigned = slot.assignedElements({ flatten: true });
      initialAssigned.forEach((el) => {
        this.make_it_editor(el);
        el.querySelectorAll("*").forEach((child) => this.make_it_editor(child));
      });
      const callback = (mutationsList) => {
        const allAdded = new Set;
        for (const mutation of mutationsList) {
          for (const node of Array.from(mutation.addedNodes)) {
            allAdded.add(node);
          }
        }
        for (const mutation of mutationsList) {
          for (const removeNode of Array.from(mutation.removedNodes)) {
            const node = removeNode;
            if (!node.getAttribute)
              continue;
            const identifier = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
            if (!identifier)
              continue;
            const componentParent = node.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
            if (allAdded.has(node)) {
              document.compIdentifierToEditor.get(componentParent)?.onChildrenRemoved(node);
              continue;
            }
            document.compIdentifierToEditor.get(componentParent)?.onChildrenRemoved(node);
            this._disposeSubtree(node);
            document.compIdentifierToEditor.get(identifier)?.dispose();
          }
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
              if (!(node instanceof HTMLElement))
                return;
              if (node.getAttribute(p9r.attr.EDITOR.IS_EDITOR)) {
                const newParentId = node.parentElement?.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
                if (newParentId) {
                  document.compIdentifierToEditor.get(newParentId)?.onChildrenAdded(node);
                }
                return;
              }
              this.make_it_editor(node);
              node.querySelectorAll("*").forEach((child) => this.make_it_editor(child));
            });
          }
        }
      };
      this.observer = new MutationObserver(callback);
      this.observer.observe(host, {
        childList: true,
        subtree: true
      });
      slot.addEventListener("slotchange", () => {
        const current = slot.assignedElements({ flatten: true });
        current.forEach((el) => {
          if (el.getAttribute(p9r.attr.EDITOR.IS_EDITOR))
            return;
          this.make_it_editor(el);
          el.querySelectorAll("*").forEach((child) => this.make_it_editor(child));
        });
      });
    }
    _registerEditors() {
      textTags.forEach((tag) => {
        if (["span", "a"].includes(tag)) {
          this.register_editor({
            tag,
            cl: TextEditor,
            visible: false,
            label: tag
          });
        } else {
          this.register_editor({
            tag,
            label: tag,
            cl: TextEditor
          });
        }
      });
      this.register_editor({
        tag: "img",
        label: "image",
        cl: ImageEditor
      });
      this.register_editor({
        tag: "svg",
        label: "svg",
        cl: SvgEditor
      });
      this.register_editor({
        tag: "ul",
        cl: ListEditor,
        label: "ul"
      });
      this.register_editor({
        tag: "ol",
        cl: ListEditor,
        label: "ol"
      });
      this.register_editor({
        tag: "w13c-snippet",
        cl: SnippetEditor,
        label: "snippet",
        visible: false
      });
      this.register_editor({
        tag: "cms-binding-core",
        cl: BindingCoreEditor,
        label: "",
        visible: false
      });
      if (document.editors) {
        for (const editor of document.editors) {
          if (editor.cl instanceof EmptyEditor) {
            this.register_editor_opaque(editor);
          } else {
            this.register_editor(editor);
          }
        }
      }
    }
    dispose() {
      this.observer?.disconnect();
      this.observer = undefined;
      const map = document.compIdentifierToEditor;
      if (!map)
        return;
      const descendants = this.workingElement.querySelectorAll(`[${p9r.attr.EDITOR.IDENTIFIER}]`);
      descendants.forEach((node) => {
        const id2 = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        if (id2)
          map.get(id2)?.dispose();
      });
    }
    _disposeSubtree(root) {
      if (!root.querySelectorAll)
        return;
      const descendants = root.querySelectorAll(`[${p9r.attr.EDITOR.IDENTIFIER}]`);
      descendants.forEach((node) => {
        const id2 = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        if (id2)
          document.compIdentifierToEditor?.get(id2)?.dispose();
      });
    }
    getGroups() {
      return this.groups;
    }
    getItemsByGroup(group) {
      return this.editors.values().filter((v2) => v2.visible && v2.group === group);
    }
    getItems() {
      return this.editors.values().filter((v2) => v2.visible);
    }
    getLabel(tag) {
      return this.editors.get(tag)?.label;
    }
    register_editor(element) {
      this.editors.set(element.tag, {
        ...element,
        group: element.group || "default",
        visible: element.visible ?? true
      });
      this.groups.add(element.group || "default");
      const existingElements = this.workingElement.querySelectorAll(element.tag);
      existingElements.forEach((el) => this.make_it_editor(el));
    }
    register_editor_opaque(element) {
      this.opaqueTags.add(element.tag);
      this.register_editor(element);
      const roots = this.workingElement.querySelectorAll(element.tag);
      roots.forEach((root) => this._sealOpaqueSubtree(root));
    }
    _sealOpaqueSubtree(root) {
      const descendants = root.querySelectorAll(`[${p9r.attr.EDITOR.IDENTIFIER}]`);
      descendants.forEach((node) => {
        const id2 = node.getAttribute(p9r.attr.EDITOR.IDENTIFIER);
        if (!id2)
          return;
        const editor = document.compIdentifierToEditor?.get(id2);
        if (editor) {
          editor.viewClient();
          editor.dispose();
        }
      });
    }
    register_sub_components(tag) {
      tag.forEach((t) => {
        this.editors.set(t, {
          cl: EmptyEditor,
          tag: t,
          label: t,
          visible: false
        });
        const existingElements = this.workingElement.querySelectorAll(t);
        existingElements.forEach((el) => this.make_it_editor(el));
      });
    }
    make_it_editor(node) {
      if (node.getAttribute(p9r.attr.EDITOR.IS_EDITOR))
        return;
      if (node.parentElement?.closest(`[${p9r.attr.EDITOR.OPAQUE}]`))
        return;
      if (!node.closest("cms-editor-system"))
        return;
      const tag = node.tagName.toLowerCase();
      if (!this.editors.has(tag))
        return;
      const cl = this.editors.get(tag)?.cl;
      if (cl) {
        try {
          const editor = new cl(node);
          editor.viewEditor();
          if (getEditorContext().mode === "view")
            editor.viewClient();
        } catch (err) {
          if (!(err instanceof NearestElementRequire))
            throw err;
          document.compIdentifierToEditor?.forEach((ed, id2) => {
            if (ed.target === node) {
              ed.dispose?.();
              document.compIdentifierToEditor.delete(id2);
            }
          });
          return;
        }
      }
      if (this.opaqueTags.has(tag)) {
        node.setAttribute(p9r.attr.EDITOR.OPAQUE, "true");
      }
      const parentComponent = node.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
      if (parentComponent) {
        document.compIdentifierToEditor.get(parentComponent)?.onChildrenAdded(node);
      }
    }
  }

  // src/components/editor/EditorSystem/EditorRoot/waitForScripts.ts
  async function waitForScripts(ele) {
    const scriptSlot = ele.shadowRoot?.querySelector('slot[name="script"]');
    const scripts = scriptSlot.assignedElements();
    const loaders = scripts.map((s3) => {
      if (!s3.src || s3.dataset.loaded)
        return Promise.resolve(true);
      return new Promise((resolve) => {
        const done = () => {
          s3.dataset.loaded = "true";
          resolve(true);
        };
        s3.addEventListener("load", done, { once: true });
        s3.addEventListener("error", () => resolve(false), { once: true });
        if (performance.getEntriesByName(s3.src).length > 0)
          done();
      });
    });
    await Promise.all(loaders);
  }

  // src/components/editor/EditorSystem/EditorRoot/EditorRoot.ts
  class EditorRoot extends HTMLElement {
    _mode = "editor";
    _observer = null;
    _dragmanager = null;
    _blocActions = null;
    _blocLibrary = null;
    _navGuardOff = null;
    _dirtyWatchOff = null;
    _linkIntercptOff = null;
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = EditorRoot_style_default;
      this.shadowRoot?.append(style);
      const template = document.createElement("template");
      template.innerHTML = template_default10;
      this.shadowRoot?.append(template.content.cloneNode(true));
    }
    connectedCallback() {
      requestAnimationFrame(() => {
        const workingElement = this.shadowRoot?.querySelector("#workingElement");
        workingElement.style.visibility = "hidden";
        this._blocActions = this.shadowRoot?.querySelector("cms-bloc-actions");
        const slot = this.shadowRoot.querySelector("#workingElement slot");
        if (!slot)
          throw new Error("Working slot not found in shadow DOM");
        this._installEditorContext(workingElement);
        waitForScripts(this).then(async () => {
          this._observer = new ObserverManager(slot);
          this._dragmanager = new DragManager(workingElement);
          this._blocLibrary = this.shadowRoot?.querySelector("cms-bloc-library");
          if (this._isWorkingEmpty())
            await this._maybePickTemplate();
          if (new URLSearchParams(location.search).get("mode") === "view") {
            this.switchMode("view");
          }
          workingElement.style.visibility = "visible";
        });
      });
    }
    disconnectedCallback() {
      this._navGuardOff?.();
      this._dirtyWatchOff?.();
      this._linkIntercptOff?.();
      clearEditorContext();
    }
    _installEditorContext(workingElement) {
      setEditorContext({
        isDirty,
        requestNavigation: resolveTargetForLink
      });
      this._navGuardOff = installNavigationGuard();
      this._dirtyWatchOff = armDirty(this, () => this.pageContent);
      this._linkIntercptOff = installLinkInterceptor();
      fetch(`${getMetaBasePath()}/api/page/list`).then((r) => r.ok ? r.json() : []).then((list) => {
        if (!Array.isArray(list))
          return;
        const paths = new Set;
        const ids = new Map;
        for (const item of list) {
          const p = item.path;
          const id2 = item.id;
          if (typeof p === "string")
            paths.add(p);
          if (typeof p === "string" && typeof id2 === "string")
            ids.set(p, id2);
        }
        setEditorContext({ knownPagePaths: paths, pageIdByPath: ids });
      }).catch(() => {});
    }
    _contentRegion() {
      const slot = this.shadowRoot.querySelector("#workingElement slot");
      return findContentRegion(slot.assignedElements({ flatten: true }));
    }
    _contentWrapper() {
      const slot = this.shadowRoot.querySelector("#workingElement slot");
      return slot.assignedElements({ flatten: true }).find((el) => el.hasAttribute(w)) ?? null;
    }
    _bindingCoresInContent() {
      const wrapper = this._contentWrapper();
      if (!wrapper)
        return [];
      const cores = [];
      if (wrapper.localName === q)
        cores.push(wrapper);
      wrapper.querySelectorAll(q).forEach((el) => cores.push(el));
      return cores;
    }
    _isWorkingEmpty() {
      return isRegionEmpty(this._contentRegion());
    }
    async _maybePickTemplate() {
      const picker = document.createElement("cms-template-picker");
      this.shadowRoot.appendChild(picker);
      const html = await picker.open();
      picker.remove();
      if (!html)
        return;
      applyPickedTemplate(this, this._contentRegion(), html);
    }
    openConfig() {
      const slot = this.shadowRoot?.querySelector('slot[name="configuration"]');
      const ele = slot?.assignedElements()[0];
      if (!ele || !isToggable(ele)) {
        throw new Error("Configuration element must implement open()");
      }
      ele.open();
    }
    switchMode(mode) {
      const newMode = this._mode === "editor" ? "view" : "editor";
      this.dispatchEvent(new CustomEvent("editor-system-switch-mode", {
        bubbles: true,
        detail: mode ?? newMode
      }));
      this._mode = mode ?? newMode;
      setEditorContext({ mode: this._mode });
      this._syncModeQueryParam();
    }
    toggleMode() {
      if (isDirty() && !confirm("You have unsaved changes — switching mode will discard them. Continue?"))
        return;
      const next = this._mode === "editor" ? "view" : "editor";
      const url = new URL(location.href);
      if (next === "view")
        url.searchParams.set("mode", "view");
      else
        url.searchParams.delete("mode");
      location.replace(url.toString());
    }
    _syncModeQueryParam() {
      const url = new URL(location.href);
      if (this._mode === "view")
        url.searchParams.set("mode", "view");
      else
        url.searchParams.delete("mode");
      if (url.href !== location.href)
        rawReplaceState(history.state, "", url.toString());
    }
    get observer() {
      if (!this._observer)
        throw new Error("You try to get observer before his initialization");
      return this._observer;
    }
    get dragManager() {
      if (!this._dragmanager)
        throw new Error("You try to get dragManager before his initialization");
      return this._dragmanager;
    }
    get blocActions() {
      if (!this._blocActions)
        throw new Error("You try to get blocActions before his initialization");
      return this._blocActions;
    }
    get editorDOM() {
      const ele = this.shadowRoot?.querySelector("#editorSystem");
      if (!ele)
        throw new Error("You try to get editorSystem before his initialization");
      return ele;
    }
    get blocLibrary() {
      if (!this._blocLibrary)
        throw new Error("You try to get _blocLibrary before his initialization");
      return this._blocLibrary;
    }
    get mode() {
      return this._mode;
    }
    get pageContent() {
      const wasView = this._mode === "view";
      const cores = wasView ? this._bindingCoresInContent() : [];
      if (wasView)
        cores.forEach((core) => core.runtime?.deactivate());
      try {
        const region = this._contentRegion();
        if (!region)
          return "";
        const clone = region.cloneNode(true);
        stripResidualChrome(clone);
        ta(clone);
        return clone.innerHTML;
      } finally {
        if (wasView)
          cores.forEach((core) => core.startRuntime());
      }
    }
  }
  if (!customElements.get("cms-editor-system")) {
    customElements.define("cms-editor-system", EditorRoot);
  }

  // src/components/editor/EditorSystem/EditorRoot/TemplatePicker/TemplatePicker.style.css
  var TemplatePicker_style_default = `:host { display: contents; }

dialog {
    width: clamp(400px, 50vw, 640px);
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 64px);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 16px;
    padding: 0;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.18);
    background: var(--bg-surface, #fff);
    color: var(--text-main, #1e293b);
    overflow: hidden;
}
dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
    backdrop-filter: blur(2px);
}

.head {
    padding: 24px 24px 12px;
    text-align: center;
}
.title { font-size: 1.125rem; font-weight: 600; }
.subtitle { font-size: 0.875rem; color: var(--text-muted, #94a3b8); margin-top: 4px; }

.list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    max-height: 60vh;
    overflow-y: auto;
}
.card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 12px;
    background: var(--bg-surface, #fff);
    cursor: pointer;
    text-align: left;
    transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.card:hover {
    background: var(--bg-base, #f8fafc);
    border-color: var(--primary-base, #4361ee);
}
.card:active { transform: scale(0.99); }

.icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 10px;
    background: var(--primary-muted, rgb(67 97 238 / 0.12));
    color: var(--primary-base, #4361ee);
    display: flex;
    align-items: center;
    justify-content: center;
}
.icon svg { width: 22px; height: 22px; }
.name { font-size: 0.9375rem; font-weight: 500; }

.foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-default, #e2e8f0);
}
.skip {
    background: transparent;
    border: 0;
    padding: 8px 14px;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    border-radius: 8px;
}
.skip:hover { color: var(--text-main, #1e293b); background: var(--bg-base, #f8fafc); }
`;

  // src/components/editor/EditorSystem/EditorRoot/TemplatePicker/TemplatePicker.ts
  var ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`;

  class TemplatePicker extends HTMLElement {
    _dialog = null;
    _resolve = null;
    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML = `<style>${TemplatePicker_style_default}</style>`;
    }
    async open() {
      const category = await this._fetchLayoutCategory();
      if (!category)
        return null;
      const templates = await this._fetchTemplates(category);
      if (templates.length === 0)
        return null;
      this._render(templates);
      return new Promise((resolve) => {
        this._resolve = resolve;
      });
    }
    async _fetchLayoutCategory() {
      try {
        const res = await fetch(resolveApiUrl("system/settings"));
        if (!res.ok)
          return null;
        const data = await res.json();
        return data?.editor?.layoutCategory || null;
      } catch {
        return null;
      }
    }
    async _fetchTemplates(category) {
      try {
        const res = await fetch(resolveApiUrl("template/list"));
        if (!res.ok)
          return [];
        const all = await res.json();
        return all.filter((t) => t.category === category);
      } catch {
        return [];
      }
    }
    async _fetchContent(id2) {
      try {
        const res = await fetch(resolveApiUrl(`template?id=${encodeURIComponent(id2)}`));
        if (!res.ok)
          return null;
        const tpl = await res.json();
        return tpl.content ?? null;
      } catch {
        return null;
      }
    }
    _render(items) {
      const dialog = document.createElement("dialog");
      dialog.innerHTML = `
            <div class="head">
                <div class="title">Pick a starting template</div>
                <div class="subtitle">Choose a layout for your new page, or start from scratch.</div>
            </div>
            <div class="list">
                ${items.map((t) => `
                    <button type="button" class="card" data-id="${t.id}">
                        <span class="icon">${ICON}</span>
                        <span class="name">${escapeHtml(t.name)}</span>
                    </button>
                `).join("")}
            </div>
            <div class="foot">
                <button type="button" class="skip">Start from scratch</button>
            </div>
        `;
      dialog.querySelectorAll(".card").forEach((btn) => {
        btn.addEventListener("click", () => this._pick(btn.dataset.id));
      });
      dialog.querySelector(".skip").addEventListener("click", () => this._close(null));
      dialog.addEventListener("cancel", () => this._close(null));
      dialog.addEventListener("click", (e2) => {
        if (e2.target === dialog)
          this._close(null);
      });
      this.shadowRoot.appendChild(dialog);
      this._dialog = dialog;
      dialog.showModal();
    }
    async _pick(id2) {
      const html = await this._fetchContent(id2);
      this._close(html);
    }
    _close(html) {
      this._dialog?.close();
      this._dialog?.remove();
      this._dialog = null;
      const r = this._resolve;
      this._resolve = null;
      r?.(html);
    }
  }
  if (!customElements.get("cms-template-picker")) {
    customElements.define("cms-template-picker", TemplatePicker);
  }

  // src/components/editor/EditorSystem/FloatingToolbar/template.html
  var template_default11 = `<div id="toolbar-container">
    <div id="drag-handle" title="Move">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path
                d="M8.5 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm-10 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
        </svg>
    </div>
    <nav class="actions">
        <button data-action="dashboard" title="Dashboard">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="20" height="20"
                stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
        </button>
        <button data-action="switch-mode" title="Toggle view/edit">
            <svg class="icon-view" xmlns="http://www.w3.org/2000/svg" fill="none" width="20" height="20" viewBox="0 0 24 24"
                stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            <svg class="icon-edit" xmlns="http://www.w3.org/2000/svg" fill="none" width="20" height="20" viewBox="0 0 24 24"
                stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
        </button>
        <button data-action="configuration" title="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24"
                stroke-width="1.5" stroke="currentColor" class="size-6">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
        </button>
    </nav>
</div>`;

  // src/components/editor/EditorSystem/FloatingToolbar/style.css
  var style_default10 = `:host {
  --toolbar-bg: #ffffff;
  --toolbar-border: #e5e7eb;
  --toolbar-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --accent-color: #3b82f6;

  position: fixed;
  top: 100px;
  right: 20px;
  z-index: 9999;
  touch-action: none; /* Prevent scrolling during drag on mobile */
}

#toolbar-container {
  display: flex;
  flex-direction: column;
  background: var(--toolbar-bg);
  border: 1px solid var(--toolbar-border);
  border-radius: 12px;
  box-shadow: var(--toolbar-shadow);
  overflow: hidden;
  min-width: 48px;
}

#drag-handle {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px 0;
  background: #f9fafb;
  cursor: grab;
  color: #9ca3af;
  border-bottom: 1px solid var(--toolbar-border);
}

#drag-handle:active {
  cursor: grabbing;
}

.actions {
  display: flex;
  flex-direction: column;
  padding: 6px;
  gap: 4px;
}

/* Buttons injected via slot */
button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  white-space: nowrap;
}

button:hover {
  background-color: #eff6ff;
  color: var(--accent-color);
}

button span {
  display: inline-block;
}

/* Mode-toggle button: show eye in editor mode (action = preview),
   pencil in view mode (action = return to editing). Default to editor
   mode when the host carries no \`data-mode\` attribute yet. */
[data-action="switch-mode"] .icon-edit { display: none; }
[data-action="switch-mode"] .icon-view { display: block; }

:host([data-mode="view"]) [data-action="switch-mode"] .icon-edit { display: block; }
:host([data-mode="view"]) [data-action="switch-mode"] .icon-view { display: none; }`;

  // src/components/editor/EditorSystem/FloatingToolbar/FloatingToolbar.ts
  class FloatingToolbar extends A2 {
    _startX = 0;
    _startY = 0;
    constructor() {
      super({
        css: style_default10,
        template: template_default11
      });
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
    }
    connectedCallback() {
      const EditorSystem = getClosestEditorSystem(this);
      const handle = this.shadowRoot?.getElementById("drag-handle");
      handle?.addEventListener("pointerdown", this._onPointerDown.bind(this));
      this.shadowRoot?.querySelector(".actions")?.addEventListener("click", (e2) => {
        const btn = e2.target.closest("[data-action]");
        if (!btn)
          return;
        switch (btn.dataset.action) {
          case "dashboard":
            window.location.href = getMetaBasePath() + "/admin/pages";
            break;
          case "switch-mode":
            EditorSystem.toggleMode();
            break;
          case "configuration":
            EditorSystem.openConfig();
            break;
        }
      });
      this.setAttribute("data-mode", EditorSystem.mode);
      EditorSystem.addEventListener("editor-system-switch-mode", (e2) => {
        this.setAttribute("data-mode", e2.detail);
      });
    }
    _onPointerDown(e2) {
      this._startX = e2.clientX - this.offsetLeft;
      this._startY = e2.clientY - this.offsetTop;
      e2.target.setPointerCapture(e2.pointerId);
      window.addEventListener("pointermove", this._onPointerMove);
      window.addEventListener("pointerup", this._onPointerUp);
    }
    _onPointerMove(e2) {
      let newX = e2.clientX - this._startX;
      let newY = e2.clientY - this._startY;
      newX = Math.max(0, Math.min(newX, window.innerWidth - this.offsetWidth));
      newY = Math.max(0, Math.min(newY, window.innerHeight - this.offsetHeight));
      this.style.left = `${newX}px`;
      this.style.top = `${newY}px`;
      this.style.right = "auto";
    }
    _onPointerUp(e2) {
      window.removeEventListener("pointermove", this._onPointerMove);
      window.removeEventListener("pointerup", this._onPointerUp);
    }
  }
  if (!customElements.get("cms-floating-toolbar")) {
    customElements.define("cms-floating-toolbar", FloatingToolbar);
  }

  // src/components/editor/MediaCenter/template.html
  var template_default12 = `<dialog>
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

  // src/components/editor/MediaCenter/style.css
  var style_default11 = `:host {
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

  // src/components/media/CardMedia/template.html
  var template_default13 = `<div class="card">
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
  var style_default12 = `:host {
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
        css: style_default12,
        template: template_default13
      });
    }
  }
  if (!customElements.get("p9r-card-media")) {
    customElements.define("p9r-card-media", CardMedia);
  }

  // src/components/media/GridMedia/api/client.ts
  function filesBase() {
    return `${getMetaBasePath()}/api/files`;
  }
  function cmsFilesIdUrl(id2) {
    return `${getMetaBasePath()}/.cms/files/by-id/${encodeURIComponent(id2)}`;
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
  async function resolveBreadcrumbTrail(id2) {
    const trail = [];
    let currentId = id2;
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
  async function renameItem(id2, label) {
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id2);
    const res = await fetch(url.toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: label })
    });
    return res.ok;
  }
  async function deleteItem(id2) {
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id2);
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
  function localPreview(id2) {
    return _localPreview.get(id2);
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
  async function replaceFileContent(id2, file) {
    const form = new FormData;
    form.append("file", file);
    form.append("id", id2);
    const res = await fetch(`${filesBase()}/content`, { method: "PUT", body: form });
    if (res.ok)
      _localPreview.set(id2, URL.createObjectURL(file));
    return res.ok;
  }
  async function saveItemMetadata(id2, data) {
    const patch = {};
    if (typeof data["label"] === "string")
      patch.name = data["label"];
    if (typeof data["parent"] === "string")
      patch.parentId = data["parent"];
    if (Object.keys(patch).length === 0)
      return true;
    const url = new URL(filesBase(), window.location.origin);
    url.searchParams.set("id", id2);
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
    return url.includes("?") ? `${url}&v=${item.contentHash}` : `${url}?v=${item.contentHash}`;
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

  // src/components/editor/MediaCenter/MediaCenter.ts
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
        css: style_default11,
        template: template_default12
      });
    }
    connectedCallback() {
      const s3 = this.shadowRoot;
      this._dialog = s3.querySelector("dialog");
      this._grid = s3.getElementById("grid");
      this._btnSelect = s3.getElementById("btnSelect");
      s3.getElementById("btnClose").addEventListener("click", () => this._dialog?.close());
      s3.getElementById("btnCancel").addEventListener("click", () => this._dialog?.close());
      this._dialog.addEventListener("click", (e2) => {
        if (e2.target === this._dialog)
          this._dialog?.close();
      });
      s3.getElementById("btnCreateFolder").addEventListener("click", () => this._openNewFolder());
      const nfBackdrop = s3.getElementById("nf-backdrop");
      const nfInput = s3.getElementById("nf-input");
      s3.getElementById("nf-cancel").addEventListener("click", () => nfBackdrop.classList.remove("open"));
      s3.getElementById("nf-confirm").addEventListener("click", () => this._createFolder(nfInput, nfBackdrop));
      nfInput.addEventListener("keydown", (e2) => {
        if (e2.key === "Enter")
          this._createFolder(nfInput, nfBackdrop);
        if (e2.key === "Escape")
          nfBackdrop.classList.remove("open");
      });
      const fileInput = s3.getElementById("file-input");
      s3.getElementById("btnUpload").addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        if (!fileInput.files?.length)
          return;
        await uploadFiles(fileInput.files, this._folder);
        fileInput.value = "";
        this._refresh();
      });
      this._btnSelect.addEventListener("click", () => this._confirmSelection());
      this._grid.addEventListener("click", (e2) => {
        const card = e2.target.closest("p9r-card-media");
        if (!card)
          return;
        const id2 = card.dataset.id;
        const type = card.dataset.type;
        if (type === "folder") {
          const folder = this._items.find((i) => i.id === id2);
          this._navigateTo(id2, folder?.label);
        } else {
          this._select(card, id2);
        }
      });
      this._grid.addEventListener("dblclick", (e2) => {
        const card = e2.target.closest("p9r-card-media");
        if (!card || card.dataset.type === "folder")
          return;
        this._confirmSelection();
      });
      s3.getElementById("breadcrumb").addEventListener("click", (e2) => {
        const target = e2.target;
        if (!target.classList.contains("bc-item"))
          return;
        const folder = target.dataset.folder || null;
        const index = parseInt(target.dataset.index || "-1");
        this._breadcrumb = this._breadcrumb.slice(0, index + 1);
        this._navigateTo(folder);
      });
      const container = s3.querySelector(".modal-container");
      const overlay = s3.getElementById("drop-overlay");
      container.addEventListener("dragenter", (e2) => {
        if (e2.dataTransfer?.types.includes("Files")) {
          e2.preventDefault();
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
      container.addEventListener("dragover", (e2) => e2.preventDefault());
      container.addEventListener("drop", async (e2) => {
        e2.preventDefault();
        this._dragCounter = 0;
        overlay.classList.remove("active");
        if (e2.dataTransfer?.files.length) {
          await uploadFiles(e2.dataTransfer.files, this._folder);
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
    _select(card, id2) {
      this._grid.querySelectorAll("p9r-card-media.selected").forEach((el) => el.classList.remove("selected"));
      card.classList.add("selected");
      this._selectedItem = this._items.find((i) => i.id === id2) || null;
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
      const s3 = this.shadowRoot;
      const backdrop = s3.getElementById("nf-backdrop");
      const input = s3.getElementById("nf-input");
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

  // src/components/editor/RichTextBar/template.html
  var template_default14 = `<div class="toolbar">
    <!-- Format -->
    <button data-command="bold" title="Bold">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
            <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
        </svg>
    </button>

    <button data-command="italic" title="Italic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="4" x2="10" y2="4"></line>
            <line x1="14" y1="20" x2="5" y2="20"></line>
            <line x1="15" y1="4" x2="9" y2="20"></line>
        </svg>
    </button>

    <button data-command="underline" title="Underline">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path>
            <line x1="4" y1="21" x2="20" y2="21"></line>
        </svg>
    </button>

    <button data-command="strikeThrough" title="Overline">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 4H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8"></path>
            <line x1="4" y1="12" x2="20" y2="12"></line>
        </svg>
    </button>

    <div class="separator"></div>

    <!-- Size -->
    <div class="size-group">
        <button data-action="size-down" title="Decrease Font Size">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        </button>
        <span class="size-display">16</span>
        <button data-action="size-up" title="Increase Font Size">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        </button>
    </div>

    <div class="separator"></div>

    <!-- Color -->
    <div class="color-group">
        <button data-action="color" class="color-trigger" title="Text Color">
            <span class="color-swatch-current"></span>
        </button>
        <div class="color-panel">
            <!-- Tools: reset + custom on a single row. -->
            <div class="color-tools">
                <button data-color="inherit" class="color-swatch swatch-reset" title="Default color"></button>
                <label class="color-custom" title="Custom color">
                    <input class="color-custom-input" type="color" value="#000000">
                    <span class="color-custom-label">Custom</span>
                </label>
            </div>

            <!-- Text — raw neutral text tokens. Use these when a specific
                 shade is needed and the bloc is known to live on a neutral
                 surface (they don't adapt to coloured variant providers). -->
            <div class="color-section">
                <div class="color-section-title">Text</div>
                <div class="swatch-row">
                    <div class="swatch-cell">
                        <button data-color="var(--text-main)" class="color-swatch" title="Text main" style="--swatch:var(--swatch-text-main)"></button>
                        <span class="swatch-cell-label">Main</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--text-body)" class="color-swatch" title="Text body" style="--swatch:var(--swatch-text-body)"></button>
                        <span class="swatch-cell-label">Body</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--text-muted)" class="color-swatch" title="Text muted" style="--swatch:var(--swatch-text-muted)"></button>
                        <span class="swatch-cell-label">Muted</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--text-label)" class="color-swatch" title="Text label" style="--swatch:var(--swatch-text-label)"></button>
                        <span class="swatch-cell-label">Label</span>
                    </div>
                </div>
            </div>

            <!-- Contextual — context-adaptive foreground. Resolves to the
                 parent's foreground: text-main / text-muted on a neutral
                 surface, *-contrasted / *-contrasted-muted inside a coloured
                 variant provider. Recommended default when the bloc may be
                 placed in any context. -->
            <div class="color-section">
                <div class="color-section-title">Contextual</div>
                <div class="swatch-row">
                    <div class="swatch-cell">
                        <button data-color="var(--ctx-fg)" class="color-swatch" title="Default foreground — adapts to parent variant" style="--swatch:var(--swatch-ctx-fg)"></button>
                        <span class="swatch-cell-label">Default</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--ctx-fg-muted)" class="color-swatch" title="Muted foreground — adapts to parent variant" style="--swatch:var(--swatch-ctx-fg-muted)"></button>
                        <span class="swatch-cell-label">Muted</span>
                    </div>
                </div>
            </div>

            <!-- Accent — one swatch per role, the *-strong token (text-sized
                 accent legible on a neutral surface). Only valid on a neutral
                 parent: applying *-strong inside a same-role variant provider
                 produces a same-on-same illegible match. -->
            <div class="color-section">
                <div class="color-section-title">Accent (on neutral background)</div>
                <div class="swatch-row">
                    <div class="swatch-cell">
                        <button data-color="var(--primary-strong)" class="color-swatch" title="Primary accent" style="--swatch:var(--swatch-primary-strong)"></button>
                        <span class="swatch-cell-label">Primary</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--secondary-strong)" class="color-swatch" title="Secondary accent" style="--swatch:var(--swatch-secondary-strong)"></button>
                        <span class="swatch-cell-label">Secondary</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--danger-strong)" class="color-swatch" title="Danger accent" style="--swatch:var(--swatch-danger-strong)"></button>
                        <span class="swatch-cell-label">Danger</span>
                    </div>
                </div>
                <div class="swatch-row">
                    <div class="swatch-cell">
                        <button data-color="var(--success-strong)" class="color-swatch" title="Success accent" style="--swatch:var(--swatch-success-strong)"></button>
                        <span class="swatch-cell-label">Success</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--info-strong)" class="color-swatch" title="Info accent" style="--swatch:var(--swatch-info-strong)"></button>
                        <span class="swatch-cell-label">Info</span>
                    </div>
                    <div class="swatch-cell">
                        <button data-color="var(--warning-strong)" class="color-swatch" title="Warning accent" style="--swatch:var(--swatch-warning-strong)"></button>
                        <span class="swatch-cell-label">Warning</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="separator"></div>

    <!-- Align -->
    <button data-command="justifyLeft" title="Left align">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="17" y1="10" x2="3" y2="10"></line>
            <line x1="21" y1="6" x2="3" y2="6"></line>
            <line x1="21" y1="14" x2="3" y2="14"></line>
            <line x1="17" y1="18" x2="3" y2="18"></line>
        </svg>
    </button>

    <button data-command="justifyCenter" title="Center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="10" x2="6" y2="10"></line>
            <line x1="21" y1="6" x2="3" y2="6"></line>
            <line x1="21" y1="14" x2="3" y2="14"></line>
            <line x1="18" y1="18" x2="6" y2="18"></line>
        </svg>
    </button>

    <button data-command="justifyRight" title="Right align">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="21" y1="10" x2="7" y2="10"></line>
            <line x1="21" y1="6" x2="3" y2="6"></line>
            <line x1="21" y1="14" x2="3" y2="14"></line>
            <line x1="21" y1="18" x2="7" y2="18"></line>
        </svg>
    </button>

    <div class="separator"></div>

    <!-- Lists -->
    <button data-action="list-ul" title="Bulleted list">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <circle cx="4" cy="6" r="1" fill="currentColor"></circle>
            <circle cx="4" cy="12" r="1" fill="currentColor"></circle>
            <circle cx="4" cy="18" r="1" fill="currentColor"></circle>
        </svg>
    </button>

    <button data-action="list-ol" title="Numbered list">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="10" y1="6" x2="21" y2="6"></line>
            <line x1="10" y1="12" x2="21" y2="12"></line>
            <line x1="10" y1="18" x2="21" y2="18"></line>
            <text x="3" y="7" font-size="6" fill="currentColor" font-weight="bold" font-family="system-ui">1</text>
            <text x="3" y="13" font-size="6" fill="currentColor" font-weight="bold" font-family="system-ui">2</text>
            <text x="3" y="19" font-size="6" fill="currentColor" font-weight="bold" font-family="system-ui">3</text>
        </svg>
    </button>

    <div class="separator"></div>

    <!-- Link -->
    <button data-action="link" title="Link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
    </button>

    <!-- Bloc-published extensions (\`editor.extendRichTextBar(...)\`). Populated
         dynamically when the caret is inside an editor with extensions. -->
    <div class="ext-separator"></div>
    <div class="extensions" id="extensions"></div>
</div>

<!-- Completions popover for the active extension (sibling of toolbar so its
     overflow doesn't get clipped). Toggled via \`hidden\`. -->
<div class="completions" id="completions" hidden></div>

<!-- Link sub-bar -->
<div class="link-bar">
    <div class="link-type-toggle">
        <button class="link-type-btn active" data-link-type="external">Externe</button>
        <button class="link-type-btn" data-link-type="internal">Interne</button>
    </div>
    <div class="link-field" data-link-field="external">
        <input class="link-input" type="url" placeholder="https://...">
    </div>
    <div class="link-field" data-link-field="internal" style="display:none">
        <div class="link-pages-wrap"></div>
    </div>
    <button class="link-apply" title="Apply">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    </button>
    <button class="link-unlink" title="Delete link">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    </button>
</div>
`;

  // src/components/editor/RichTextBar/style.css
  var style_default13 = `:host {
    position: absolute;
    z-index: 9999999999;
    display: none;

    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);

    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);

    transition: opacity 0.15s ease;
    overflow: visible;
}

:host(.visible) {
    display: block;
    opacity: 1;
    pointer-events: auto;
}

/* ── Main toolbar row ── */

.toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
}

/* ── Buttons ── */

button {
    background: transparent;
    border: none;
    padding: 8px;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
    color: #1e293b;
    position: relative;
    font-family: system-ui, sans-serif;
}

button:hover {
    background: rgba(0, 0, 0, 0.06);
}

button:active {
    transform: scale(0.92);
}

button svg {
    width: 16px;
    height: 16px;
    stroke-width: 2;
}

button.active {
    background: #2563eb;
    color: #fff;
}

button.active svg {
    stroke: #fff;
}

/* ── Separator ── */

.separator {
    width: 1px;
    height: 20px;
    background: rgba(0, 0, 0, 0.08);
    margin: 0 2px;
    flex-shrink: 0;
}

/* ── Size group ── */

.size-group {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 10px;
    padding: 2px;
}

.size-group button {
    padding: 6px;
    border-radius: 8px;
}

.size-group button svg {
    width: 14px;
    height: 14px;
}

.size-display {
    font-size: 11px;
    font-weight: 600;
    color: #334155;
    min-width: 24px;
    text-align: center;
    font-family: system-ui, sans-serif;
    user-select: none;
}

/* ── Color group ── */

.color-group {
    position: relative;
}

.color-trigger {
    padding: 6px;
}

.color-swatch-current {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #1e293b;
    border: 2px solid rgba(0, 0, 0, 0.12);
    transition: background 0.15s ease;
}

.color-panel {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
    flex-direction: column;
    gap: 10px;
    width: 244px;
}

.color-panel.open {
    display: flex;
}

.color-panel.below {
    bottom: auto;
    top: 100%;
    margin-bottom: 0;
    margin-top: 8px;
}

/* ── Color tools row (reset + custom) ── */

.color-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.color-custom {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-family: system-ui, sans-serif;
    color: #64748b;
    cursor: pointer;
    user-select: none;
}

/* ── Sections (Text, Accent) ── */

.color-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.color-section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
    font-family: system-ui, sans-serif;
}

/* ── Swatch cells (all sections) — swatch on top, label below ── */

.swatch-row {
    display: flex;
    gap: 4px;
}

.swatch-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1 1 0;
    min-width: 0;
}

.swatch-cell-label {
    font-size: 9px;
    font-weight: 500;
    color: #64748b;
    font-family: system-ui, sans-serif;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}

/* ── Swatch ── */

.color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--swatch);
    border: 2px solid rgba(0, 0, 0, 0.06);
    padding: 0;
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease;
    flex-shrink: 0;
    justify-self: center;
}

.color-swatch:hover {
    transform: scale(1.15);
    border-color: rgba(0, 0, 0, 0.2);
    background: var(--swatch);
}

.color-swatch.active {
    border-color: #2563eb;
    background: var(--swatch);
}

.swatch-reset {
    background: linear-gradient(135deg, #fff 40%, #e2e8f0 40%, #e2e8f0 60%, #fff 60%);
    border: 2px solid #e2e8f0;
}

.swatch-reset:hover {
    background: linear-gradient(135deg, #fff 40%, #e2e8f0 40%, #e2e8f0 60%, #fff 60%);
}

.color-custom-input {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
}

.color-custom-input::-webkit-color-swatch-wrapper {
    padding: 0;
    border-radius: 50%;
}

.color-custom-input::-webkit-color-swatch {
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 50%;
}

.color-custom-input::-moz-color-swatch {
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 50%;
}

/* ── Link bar ── */

.link-bar {
    display: none;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.link-bar.open {
    display: flex;
}

.link-type-toggle {
    display: flex;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 8px;
    padding: 2px;
    flex-shrink: 0;
}

.link-type-btn {
    padding: 4px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.15s ease;
}

.link-type-btn.active {
    background: #fff;
    color: #1e293b;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.link-type-btn:hover:not(.active) {
    color: #64748b;
}

.link-field {
    flex: 1;
    min-width: 0;
}

.link-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    outline: none;
    background: #fff;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
    color: #1e293b;
}

.link-input:focus {
    border-color: #2563eb;
}

.link-pages-wrap {
    min-width: 180px;
}

.link-apply,
.link-unlink {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 8px;
}

.link-apply {
    background: #2563eb;
    color: #fff;
}

.link-apply:hover {
    background: #1d4ed8;
}

.link-apply svg {
    stroke: #fff;
}

.link-unlink {
    background: rgba(0, 0, 0, 0.04);
    color: #94a3b8;
}

.link-unlink:hover {
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
}

/* ── Bloc-published extensions ───────────────────────────────────────── */

.ext-separator {
    width: 1px;
    height: 16px;
    background: #e2e8f0;
    margin: 0 4px;
}
.ext-separator[style*="none"] { display: none; }

.extensions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.ext-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    height: auto;
    width: auto;
    border-radius: 5px;
    font: inherit;
    font-size: 12px;
    color: var(--text-main, #1e293b);
}
.ext-btn .ext-label {
    font-weight: 500;
}
.ext-btn:hover {
    background: rgba(0, 0, 0, 0.05);
}

.completions {
    position: absolute;
    top: 100%;
    margin-top: 6px;
    background: var(--bg-surface, #fff);
    border: 1px solid var(--border-default, #e2e8f0);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    padding: 4px;
    min-width: 220px;
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
    z-index: 10001;
}
.completions[hidden] { display: none; }

.ext-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 6px 10px;
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: 5px;
    text-align: left;
    width: 100%;
    height: auto;
    font: inherit;
}
.ext-row:hover {
    background: var(--primary-muted, #eef2ff);
}

.ext-row-label {
    font-size: 13px;
    color: var(--text-main, #1e293b);
    font-weight: 500;
}
.ext-row-path {
    font-size: 11px;
    color: color-mix(in srgb, currentColor 55%, transparent);
    font-family: ui-monospace, monospace;
    flex: 1;
    text-align: right;
}

.ext-empty {
    padding: 8px 10px;
    font-size: 12px;
    color: color-mix(in srgb, currentColor 55%, transparent);
    text-align: center;
}

.ext-group {
    display: flex;
    flex-direction: column;
    padding: 2px 0;
}
.ext-group + .ext-group {
    border-top: 1px solid var(--border-light, #f1f5f9);
    margin-top: 2px;
    padding-top: 4px;
}

.ext-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 2px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, color-mix(in srgb, currentColor 55%, transparent));
}
.ext-group-icon {
    display: inline-flex;
    align-items: center;
    width: 12px;
    height: 12px;
}
.ext-group-icon svg { width: 100%; height: 100%; }
.ext-group-label { flex: 1; }
`;

  // src/components/editor/RichTextBar/selection.ts
  class SelectionTracker {
    savedRange = null;
    save() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        this.savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    restore() {
      if (!this.savedRange)
        return;
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(this.savedRange);
      }
    }
    get range() {
      return this.savedRange;
    }
  }

  // src/components/editor/RichTextBar/state.ts
  var FORMAT_COMMANDS = ["bold", "italic", "underline", "strikeThrough"];
  var ALIGN_COMMANDS = ["justifyLeft", "justifyCenter", "justifyRight"];
  var ACTIVE_COMMANDS = [...FORMAT_COMMANDS, ...ALIGN_COMMANDS];
  function updateState(self) {
    for (const cmd of ACTIVE_COMMANDS) {
      const btn = self.shadowRoot.querySelector(`button[data-command="${cmd}"]`);
      if (btn)
        btn.classList.toggle("active", queryCommandState(cmd));
    }
    const linkBtn = self.shadowRoot.querySelector('[data-action="link"]');
    if (linkBtn)
      linkBtn.classList.toggle("active", !!getExistingLink(self.selection.range));
    updateSizeDisplay(self);
    updateColorState(self);
  }
  function updateSizeDisplay(self, size) {
    const display = self.shadowRoot.querySelector(".size-display");
    if (display)
      display.textContent = String(size ?? getCurrentFontSize());
  }
  function updateColorState(self) {
    const trigger = self.shadowRoot.querySelector(".color-swatch-current");
    if (!trigger)
      return;
    const color = getCurrentColor();
    if (color)
      trigger.style.background = color;
  }

  // src/components/editor/RichTextBar/actions.ts
  function runCommand(cmd) {
    switch (cmd) {
      case "bold":
        return toggleFormat("b");
      case "italic":
        return toggleFormat("i");
      case "underline":
        return toggleFormat("u");
      case "strikeThrough":
        return toggleFormat("s");
      case "justifyLeft":
        return applyBlockAlignment("left");
      case "justifyCenter":
        return applyBlockAlignment("center");
      case "justifyRight":
        return applyBlockAlignment("right");
    }
  }
  function changeSize(self, delta) {
    self.selection.restore();
    const next = Math.max(8, Math.min(96, getCurrentFontSize() + delta));
    applyInlineStyle("fontSize", `${next}px`);
    self.selection.save();
    updateSizeDisplay(self, next);
  }
  function toggleColorPanel(self) {
    const panel = self.shadowRoot.querySelector(".color-panel");
    const isOpen = panel.classList.toggle("open");
    closeLinkBar(self);
    if (isOpen)
      placeColorPanel(self, panel);
  }
  function placeColorPanel(self, panel) {
    const trigger = self.shadowRoot.querySelector(".color-trigger");
    if (!trigger)
      return;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const panelHeight = panel.offsetHeight;
    panel.classList.toggle("below", triggerRect.top < panelHeight + gap);
  }
  function applyColor(self, color) {
    self.selection.restore();
    if (color === "inherit") {
      removeInlineStyle("color");
    } else {
      applyInlineStyle("color", color);
    }
    self.selection.save();
    self.shadowRoot.querySelector(".color-panel").classList.remove("open");
    updateColorState(self);
  }
  function toggleLinkBar(self) {
    const bar = self.shadowRoot.querySelector(".link-bar");
    const isOpen = bar.classList.contains("open");
    self.shadowRoot.querySelector(".color-panel")?.classList.remove("open");
    if (isOpen) {
      closeLinkBar(self);
      return;
    }
    const existing = getExistingLink(self.selection.range);
    const input = self.shadowRoot.querySelector(".link-input");
    input.value = existing || "";
    if (self.pageLink && existing) {
      self.pageLink.value = existing;
    }
    bar.classList.add("open");
  }
  function closeLinkBar(self) {
    self.shadowRoot.querySelector(".link-bar")?.classList.remove("open");
  }
  function switchLinkType(self, type) {
    const root = self.shadowRoot;
    root.querySelectorAll(".link-type-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.linkType === type));
    root.querySelectorAll(".link-field").forEach((f2) => {
      f2.style.display = f2.dataset.linkField === type ? "" : "none";
    });
  }
  function applyLink(self) {
    self.selection.restore();
    const activeType = self.shadowRoot.querySelector(".link-type-btn.active");
    const type = activeType?.dataset.linkType || "external";
    let url = "";
    if (type === "external") {
      url = self.shadowRoot.querySelector(".link-input").value.trim();
    } else if (type === "internal" && self.pageLink) {
      url = self.pageLink.value || "";
    }
    applyLinkUrl(url);
    self.selection.save();
    closeLinkBar(self);
    updateState(self);
  }
  function removeLink(self) {
    self.selection.restore();
    removeLinkAtSelection();
    self.selection.save();
    closeLinkBar(self);
    updateState(self);
  }
  function insertListAction(self, tag) {
    self.selection.restore();
    insertList(tag);
    self.hide();
  }

  // src/components/editor/RichTextBar/extensions/render.ts
  function buildBraceButton(onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ext-btn";
    btn.title = "Insert dynamic content";
    btn.innerHTML = ICON_BRACES;
    btn.addEventListener("mousedown", (e2) => {
      e2.preventDefault();
    });
    btn.addEventListener("click", (e2) => {
      e2.stopPropagation();
      onClick(btn);
    });
    return btn;
  }
  function buildGroup2(ext, onPickField) {
    const group = document.createElement("div");
    group.className = "ext-group";
    const header = document.createElement("div");
    header.className = "ext-group-header";
    if (ext.icon)
      header.insertAdjacentHTML("afterbegin", `<span class="ext-group-icon">${ext.icon}</span>`);
    const lbl = document.createElement("span");
    lbl.className = "ext-group-label";
    lbl.textContent = ext.label();
    header.appendChild(lbl);
    group.appendChild(header);
    const fields = ext.getCompletions();
    if (fields.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ext-empty";
      empty.textContent = "No fields";
      group.appendChild(empty);
    } else {
      for (const f2 of fields)
        group.appendChild(buildRow2(f2, onPickField));
    }
    return group;
  }
  function buildRow2(field, onPick) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ext-row";
    row.innerHTML = `<span class="ext-row-label"></span><span class="ext-row-path"></span>`;
    row.querySelector(".ext-row-label").textContent = field.label;
    row.querySelector(".ext-row-path").textContent = field.path;
    row.addEventListener("mousedown", (e2) => {
      e2.preventDefault();
    });
    row.addEventListener("click", (e2) => {
      e2.stopPropagation();
      onPick(field);
    });
    return row;
  }

  // src/components/editor/RichTextBar/extensions/pick.ts
  function pickField(self, ext, field) {
    self.selection.restore();
    const range = self.selection.range;
    if (!range)
      return null;
    const ctx = {
      selection: window.getSelection(),
      range,
      editableEl: range.startContainer.parentElement ?? range.startContainer
    };
    const text = ext.onPick(field, ctx);
    document.execCommand("insertText", false, text);
    self.selection.save();
    return text;
  }
  // src/core/editorSystem/extensions/schemaScalars.ts
  function flattenScalars(schema, prefix = "") {
    const s3 = unwrap(schema);
    if (!s3)
      return [];
    if (Array.isArray(s3.enum) && s3.enum.length > 0) {
      return [{ path: prefix, label: leafLabel(prefix), type: enumTypeOf(s3) }];
    }
    switch (s3.type) {
      case "object": {
        const out = [];
        for (const [k, v2] of Object.entries(s3.properties ?? {})) {
          out.push(...flattenScalars(v2, prefix ? `${prefix}.${k}` : k));
        }
        return out;
      }
      case "array":
        return [{
          path: prefix ? `${prefix}.length` : "length",
          label: "length",
          type: "integer"
        }];
      case "string":
      case "integer":
      case "number":
      case "boolean":
      case "null":
        return [{ path: prefix, label: leafLabel(prefix), type: s3.type }];
      default:
        return [];
    }
  }
  function unwrap(schema) {
    if (!schema)
      return null;
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      const merged = { type: "object", properties: {} };
      for (const part of schema.allOf) {
        if (part.type)
          merged.type = part.type;
        if (part.properties)
          merged.properties = { ...merged.properties, ...part.properties };
      }
      return merged;
    }
    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0)
      return schema.oneOf[0] ?? null;
    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0)
      return schema.anyOf[0] ?? null;
    return schema;
  }
  function leafLabel(path) {
    if (!path)
      return "value";
    const dot = path.lastIndexOf(".");
    return dot >= 0 ? path.slice(dot + 1) : path;
  }
  function enumTypeOf(s3) {
    if (s3.type)
      return s3.type;
    const first = s3.enum?.[0];
    return typeof first === "string" ? "string" : typeof first === "number" ? "number" : typeof first === "boolean" ? "boolean" : "string";
  }

  // src/core/editorSystem/extensions/collectDataFields.ts
  function collectDataFields(fromEl) {
    const out = [];
    for (const ext of collectAncestorExtensions(fromEl, "data")) {
      if (ext.enabled && !ext.enabled())
        continue;
      const schema = ext.getSchema();
      if (!schema)
        continue;
      const sourceLabel = ext.label();
      for (const f2 of flattenScalars(schema)) {
        out.push({
          sourceId: ext.id,
          sourceLabel,
          path: f2.path,
          label: f2.label,
          type: f2.type
        });
      }
    }
    return out;
  }
  function tokenOf(f2) {
    return f2.path ? `${f2.sourceId}.${f2.path}` : f2.sourceId;
  }
  // src/components/editor/RichTextBar/extensions/dataAdapter.ts
  function adaptDataExtensions(fromEl) {
    const bySource = new Map;
    for (const f2 of collectDataFields(fromEl)) {
      const group = bySource.get(f2.sourceId) ?? { label: f2.sourceLabel, fields: [] };
      group.fields.push({ path: tokenOf(f2), label: f2.label, type: f2.type });
      bySource.set(f2.sourceId, group);
    }
    return [...bySource.values()].map((group) => ({
      label: () => group.label,
      icon: ICON_DATABASE,
      getCompletions: () => group.fields,
      onPick: (field) => `{{ ${field.path} }}`
    }));
  }

  // src/components/editor/RichTextBar/extensions/index.ts
  function refreshExtensions(self) {
    const range = self.selection.range ?? window.getSelection()?.getRangeAt(0) ?? null;
    if (!range)
      return clear(self);
    const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    if (!startEl)
      return clear(self);
    if (self._lastEditable === startEl)
      return;
    self._lastEditable = startEl;
    const richExts = collectAncestorExtensions(startEl, "richtextbar").filter((e2) => e2.enabled?.() !== false);
    const dataExts = adaptDataExtensions(startEl);
    const exts = [...richExts, ...dataExts];
    self._currentExtensions = exts;
    render3(self, exts);
  }
  function closeCompletions(self) {
    const popover = self.shadowRoot?.getElementById("completions");
    if (popover)
      popover.hidden = true;
  }
  function clear(self) {
    self._lastEditable = null;
    self._currentExtensions = [];
    self.shadowRoot.getElementById("extensions").replaceChildren();
    self.shadowRoot.querySelector(".ext-separator").style.display = "none";
    closeCompletions(self);
  }
  function render3(self, exts) {
    const slot = self.shadowRoot.getElementById("extensions");
    const sep = self.shadowRoot.querySelector(".ext-separator");
    if (exts.length === 0) {
      slot.replaceChildren();
      sep.style.display = "none";
      return;
    }
    sep.style.display = "";
    slot.replaceChildren(buildBraceButton((anchor) => toggle(self, anchor)));
  }
  function toggle(self, anchor) {
    const popover = self.shadowRoot.getElementById("completions");
    if (!popover.hidden) {
      closeCompletions(self);
      return;
    }
    popover.replaceChildren();
    const exts = self._currentExtensions;
    if (exts.length === 0) {
      popover.innerHTML = `<div class="ext-empty">No completions available.</div>`;
    } else {
      for (const ext of exts)
        popover.appendChild(buildGroup2(ext, (f2) => {
          pickField(self, ext, f2);
          closeCompletions(self);
        }));
    }
    popover.style.left = `${anchor.offsetLeft}px`;
    popover.hidden = false;
    clampPopoverToViewport(self, popover);
  }
  var VIEWPORT_MARGIN = 8;
  function clampPopoverToViewport(self, popover) {
    const rect = popover.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - VIEWPORT_MARGIN);
    if (overflowRight > 0) {
      const current = parseFloat(popover.style.left) || 0;
      popover.style.left = `${current - overflowRight}px`;
    }
    const after = popover.getBoundingClientRect();
    const barRect = self.getBoundingClientRect();
    const minLeftWithinBar = VIEWPORT_MARGIN - barRect.left;
    if (after.left < VIEWPORT_MARGIN) {
      popover.style.left = `${minLeftWithinBar}px`;
    }
  }

  // src/components/editor/RichTextBar/listener.ts
  function handleCustomColorInput(self, e2) {
    const input = e2.target;
    if (!input.classList.contains("color-custom-input"))
      return;
    applyColor(self, input.value);
  }
  function handleClick(self, e2) {
    const target = e2.target;
    const btn = target.closest("button");
    if (!btn)
      return;
    const command = btn.dataset.command;
    if (command) {
      self.selection.restore();
      runCommand(command);
      self.selection.save();
      updateState(self);
      return;
    }
    const action = btn.dataset.action;
    if (action === "size-up")
      return changeSize(self, 2);
    if (action === "size-down")
      return changeSize(self, -2);
    if (action === "color")
      return toggleColorPanel(self);
    if (action === "link")
      return toggleLinkBar(self);
    if (action === "list-ul")
      return insertListAction(self, "ul");
    if (action === "list-ol")
      return insertListAction(self, "ol");
    const color = btn.dataset.color;
    if (color !== undefined)
      return applyColor(self, color);
    const linkType = btn.dataset.linkType;
    if (linkType)
      return switchLinkType(self, linkType);
    if (btn.classList.contains("link-apply"))
      return applyLink(self);
    if (btn.classList.contains("link-unlink"))
      return removeLink(self);
  }
  function handleSelection(self) {
    if (self.interacting)
      return;
    if (getEditorContext().mode === "view") {
      self.hide();
      closeCompletions(self);
      return;
    }
    const activeEl = self.shadowRoot.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName.includes("-"))) {
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === "") {
      self.hide();
      closeCompletions(self);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    self.selection.save();
    self.show(rect);
    updateState(self);
    refreshExtensions(self);
  }
  function handleRootMousedown(self, e2) {
    const target = e2.target;
    self.interacting = true;
    if (target.tagName === "INPUT" || target.tagName.includes("-") || target.closest("p9r-link")) {
      return;
    }
    e2.preventDefault();
  }
  function handleRootMouseup(self) {
    setTimeout(() => {
      self.interacting = false;
    }, 50);
  }
  function handleOutsideMouseDown(self, e2) {
    if (!self.classList.contains("visible"))
      return;
    const path = e2.composedPath();
    if (path.includes(self) || path.includes(self.shadowRoot))
      return;
    const range = self.selection.range;
    if (range) {
      const anchor = range.commonAncestorContainer;
      const el = anchor.nodeType === 1 ? anchor : anchor.parentElement;
      const editable = el?.closest?.('[contenteditable="true"]');
      if (editable && path.includes(editable))
        return;
    }
    self.hide();
  }

  // src/components/editor/RichTextBar/RichTextBar.ts
  var USER_THEME_TOKENS = [
    "text-main",
    "text-body",
    "text-muted",
    "text-label",
    "ctx-fg",
    "ctx-fg-muted",
    "primary-strong",
    "secondary-strong",
    "danger-strong",
    "success-strong",
    "info-strong",
    "warning-strong"
  ];

  class RichTextBar extends A2 {
    selection = new SelectionTracker;
    interacting = false;
    pageLink = null;
    _lastEditable = null;
    _currentExtensions = [];
    _onRootMousedown = (e2) => handleRootMousedown(this, e2);
    _onRootMouseup = () => handleRootMouseup(this);
    _onRootClick = (e2) => handleClick(this, e2);
    _onRootChange = (e2) => handleCustomColorInput(this, e2);
    _onSelectionChange = () => handleSelection(this);
    _onOutsideMousedown = (e2) => handleOutsideMouseDown(this, e2);
    _onExtensionsInvalidated = () => {
      this._lastEditable = null;
    };
    _rootListenersAttached = false;
    constructor() {
      super({
        css: style_default13,
        template: template_default14
      });
    }
    connectedCallback() {
      const root = this.shadowRoot;
      if (!this._rootListenersAttached) {
        root.addEventListener("mousedown", this._onRootMousedown);
        root.addEventListener("mouseup", this._onRootMouseup);
        root.addEventListener("click", this._onRootClick);
        root.addEventListener("change", this._onRootChange);
        this._rootListenersAttached = true;
      }
      document.addEventListener("selectionchange", this._onSelectionChange);
      document.addEventListener("mousedown", this._onOutsideMousedown);
      document.addEventListener("richtextbar:invalidate", this._onExtensionsInvalidated);
      if (!this.pageLink) {
        this.pageLink = document.createElement("p9r-link");
        this.pageLink.setAttribute("label", "");
        this.pageLink.setAttribute("name", "href");
        root.querySelector(".link-pages-wrap").appendChild(this.pageLink);
      }
      this._syncSwatchVariables();
    }
    _syncSwatchVariables() {
      let workingElement = null;
      try {
        const editorSystem = getClosestEditorSystem(this);
        workingElement = editorSystem.shadowRoot?.querySelector("#workingElement") ?? null;
      } catch {
        return;
      }
      if (!workingElement)
        return;
      const computed = getComputedStyle(workingElement);
      for (const token of USER_THEME_TOKENS) {
        const value = computed.getPropertyValue(`--${token}`).trim();
        if (value)
          this.style.setProperty(`--swatch-${token}`, value);
      }
    }
    disconnectedCallback() {
      document.removeEventListener("selectionchange", this._onSelectionChange);
      document.removeEventListener("mousedown", this._onOutsideMousedown);
      document.removeEventListener("richtextbar:invalidate", this._onExtensionsInvalidated);
    }
    show(rect) {
      this.classList.add("visible");
      this.shadowRoot.querySelector(".color-panel")?.classList.remove("open");
      closeLinkBar(this);
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const gap = 10;
      const barWidth = this.offsetWidth;
      const barHeight = this.offsetHeight;
      let top;
      if (rect.top < barHeight + gap) {
        top = rect.bottom + scrollY + gap;
      } else {
        top = rect.top + scrollY - barHeight - gap;
      }
      let left = rect.left + scrollX + (rect.width - barWidth) / 2;
      const minLeft = scrollX + gap;
      const maxLeft = scrollX + window.innerWidth - barWidth - gap;
      left = Math.max(minLeft, Math.min(maxLeft, left));
      this.style.top = `${top}px`;
      this.style.left = `${left}px`;
    }
    hide() {
      this.classList.remove("visible");
      this.shadowRoot.querySelector(".color-panel")?.classList.remove("open");
      closeLinkBar(this);
      closeCompletions(this);
    }
  }
  customElements.define("cms-richtextbar", RichTextBar);

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

  // src/components/editor/configurations/Configuration/template.html
  var template_default15 = `<w13c-lateral-dialog>

    <h3 slot="title"><slot name="title"></slot></h3>

    <form>

        <slot></slot>


        <p9r-button id="save-btn" fullwidth type="submit" variant="filled" color="primary">Save</p9r-button>

    </form>

    <!-- Opt-in: enabled only when the host carries \`delete-redirect\` (set by
         the page/template/snippet editors). Target + redirect are wired at
         runtime in EditorConfiguration since the resource id lives in the URL. -->
    <cms-confirm-form id="delete-form" hidden>
        <p9r-button id="delete-btn" fullwidth type="button" variant="ghost" color="danger">Delete</p9r-button>
    </cms-confirm-form>

</w13c-lateral-dialog>`;

  // src/components/editor/configurations/Configuration/style.css
  var style_default14 = `form{
    display: flex;
    flex-direction: column;
}`;

  // src/core/dom/getFormData.ts
  function getFormData(formEle, slotTarget) {
    const formData = new FormData(formEle);
    const elements = slotTarget?.assignedElements();
    if (!elements)
      return formData;
    for (const element of elements) {
      const name = element.getAttribute("name");
      const value = element.value;
      if (name && value !== undefined && value !== "") {
        formData.append(name, value);
      }
      const nestedInputs = element.querySelectorAll("[name]");
      for (const input of nestedInputs) {
        if (!input.name || !input.value)
          continue;
        formData.set(input.name, input.value);
      }
    }
    return formData;
  }

  // src/components/editor/configurations/Configuration/EditorConfiguration.ts
  class EditorConfiguration extends CustomHTMLElement {
    static get observedAttributes() {
      return ["url", "method", "delete-redirect", "delete-label"];
    }
    constructor() {
      super(template_default15, style_default14, true);
    }
    _handleSubmit = (e2) => {
      e2.preventDefault();
      const editorSystem = getClosestEditorSystem(this);
      const content = editorSystem.pageContent;
      const id2 = new URL(window.location.href).searchParams.get("id");
      if (!id2)
        throw new Error("Id is missing");
      const formData = getFormData(e2.target, this.shadowRoot?.querySelector("form slot"));
      const data = Object.fromEntries(formData.entries());
      fetch(this.url, {
        method: this.method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ...data, content, id: id2 })
      }).then((res) => {
        if (res.ok)
          clearDirty();
      }).catch(() => {});
    };
    connectedCallback() {
      requestAnimationFrame(() => {
        const form = this.shadowRoot?.querySelector("form");
        form.addEventListener("submit", this._handleSubmit);
        this._setupDelete();
      });
    }
    _setupDelete() {
      const redirect2 = this.getAttribute("delete-redirect");
      const confirmForm = this.shadowRoot?.querySelector("#delete-form");
      if (!confirmForm || !redirect2)
        return;
      const id2 = new URL(window.location.href).searchParams.get("id");
      if (!id2)
        return;
      confirmForm.setAttribute("target", `${this.url}?id=${encodeURIComponent(id2)}`);
      confirmForm.setAttribute("method", "DELETE");
      confirmForm.setAttribute("redirect", redirect2);
      confirmForm.setAttribute("message", this.getAttribute("delete-message") || "Delete this permanently? This cannot be undone.");
      const label = this.getAttribute("delete-label");
      if (label)
        this.shadowRoot.querySelector("#delete-btn").textContent = label;
      confirmForm.removeAttribute("hidden");
    }
    disconnectedCallback() {
      this.shadowRoot?.querySelector("form")?.removeEventListener("submit", this._handleSubmit);
    }
    attributeChangedCallback(name, oldValue, newValue) {}
    open() {
      const dialog = this.shadowRoot?.querySelector("w13c-lateral-dialog");
      dialog.showModal();
    }
    get url() {
      const url = this.getAttribute("url");
      if (!url)
        throw new Error("url should be set");
      return url;
    }
    get method() {
      return this.getAttribute("method") || "PUT";
    }
  }
  if (!customElements.get("cms-editor-configuration")) {
    customElements.define("cms-editor-configuration", EditorConfiguration);
  }

  // src/components/editor/snippet/Snippet/template.html
  var template_default16 = `<div class="snippet-root"></div>
`;

  // src/components/editor/snippet/Snippet/style.css
  var style_default15 = `:host {
    display: block;
    position: relative;
    min-height: 40px;
}

.snippet-content {
    position: relative;
}

.snippet-label {
    position: absolute;
    top: -10px;
    left: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #ffffff;
    border: 1px solid rgba(0, 122, 255, 0.25);
    color: #007aff;
    padding: 2px 8px 2px 6px;
    border-radius: 999px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.6;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 2;
}

.snippet-label svg {
    width: 10px;
    height: 10px;
}

.snippet-label code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    text-transform: none;
    letter-spacing: 0;
}

:host {
    outline: 1px dashed rgba(0, 122, 255, 0.0);
    outline-offset: 2px;
    transition: outline-color 0.15s;
}

:host(:hover) {
    outline-color: rgba(0, 122, 255, 0.5);
}

:host(:hover) .snippet-label {
    opacity: 1;
}

.snippet-loading,
.snippet-error {
    padding: 16px;
    border: 1px dashed rgba(100, 116, 139, 0.4);
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #64748b;
    text-align: center;
}

.snippet-error {
    border-color: rgba(239, 68, 68, 0.5);
    color: #ef4444;
}
`;

  // src/components/editor/snippet/Snippet/Snippet.ts
  var SnippetMetadata = {
    css: style_default15,
    template: template_default16
  };

  class Snippet extends A2 {
    _root;
    constructor() {
      super(SnippetMetadata);
    }
    connectedCallback() {
      this._root = this.shadowRoot.querySelector(".snippet-root");
      const identifier = this.getAttribute("identifier");
      if (!identifier) {
        this._renderError("Missing identifier attribute");
        return;
      }
      const preExpanded = this.innerHTML.trim();
      if (preExpanded) {
        this._render(preExpanded, identifier);
        this.innerHTML = "";
        return;
      }
      this._renderLoading();
      this._fetch(identifier);
    }
    async _fetch(identifier) {
      try {
        const url = resolveApiUrl("snippet");
        url.searchParams.set("identifier", identifier);
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(res.status === 404 ? `Snippet "${identifier}" not found` : await res.text());
        }
        const snippet = await res.json();
        this._render(snippet.content, identifier);
      } catch (e2) {
        this._renderError(e2?.message || "Failed to load snippet");
      }
    }
    _render(content, identifier) {
      this._root.innerHTML = `
            <div class="snippet-label">
                ${ICON_SNIPPET}
                <code>${identifier}</code>
            </div>
            <div class="snippet-content">${content}</div>
        `;
    }
    _renderLoading() {
      this._root.innerHTML = `<div class="snippet-loading">Loading snippet…</div>`;
    }
    _renderError(msg) {
      this._root.innerHTML = `<div class="snippet-error">⚠ ${msg}</div>`;
    }
  }
  if (!customElements.get("w13c-snippet")) {
    customElements.define("w13c-snippet", Snippet);
  }

  // src/components/media/CropSystem/template.html
  var template_default17 = `<div class="backdrop" id="backdrop">
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
  var style_default16 = `:host {
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
        css: style_default16,
        template: template_default17
      });
    }
    connectedCallback() {
      const backdrop = this.shadowRoot.getElementById("backdrop");
      const closeBtn = this.shadowRoot.getElementById("close-btn");
      const cancelBtn = this.shadowRoot.getElementById("btn-cancel");
      const applyBtn = this.shadowRoot.getElementById("btn-apply");
      closeBtn.addEventListener("click", () => this.close());
      cancelBtn.addEventListener("click", () => this.close());
      backdrop.addEventListener("click", (e2) => {
        if (e2.target === backdrop)
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
  var template_default18 = `<div class="backdrop" id="backdrop">
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
  var style_default17 = `:host {
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
        css: style_default17,
        template: template_default18
      });
    }
    connectedCallback() {
      const backdrop = this.shadowRoot.getElementById("backdrop");
      const closeBtn = this.shadowRoot.getElementById("close-btn");
      closeBtn.addEventListener("click", () => this.close());
      backdrop.addEventListener("click", (e2) => {
        if (e2.target === backdrop)
          this.close();
      });
      document.addEventListener("keydown", (e2) => {
        if (e2.key === "Escape" && this.hasAttribute("open"))
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
  var template_default19 = `<div class="toolbar">
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
  var style_default18 = `:host {
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

  // src/components/media/GridMedia/features/context-menu.ts
  function setupContextMenu(s3, callbacks) {
    const menu = s3.getElementById("ctx-menu");
    let activeItem = null;
    menu.addEventListener("click", (e2) => {
      const btn = e2.target.closest("[data-action]");
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
      show(e2, item) {
        activeItem = item;
        menu.style.left = e2.clientX + "px";
        menu.style.top = e2.clientY + "px";
        menu.classList.add("visible");
      }
    };
  }

  // src/components/media/GridMedia/features/rename.ts
  function setupRename(s3, callbacks) {
    const backdrop = s3.getElementById("rename-backdrop");
    const input = s3.getElementById("rename-input");
    const confirmBtn = s3.getElementById("rename-confirm");
    const cancelBtn = s3.getElementById("rename-cancel");
    let currentItem = null;
    const hide = () => {
      backdrop.classList.remove("visible");
      currentItem = null;
    };
    const apply = () => {
      const name = input.value.trim();
      if (!name || !currentItem)
        return;
      const id2 = currentItem.id;
      hide();
      callbacks.onApply(id2, name);
    };
    confirmBtn.addEventListener("click", apply);
    cancelBtn.addEventListener("click", hide);
    backdrop.addEventListener("click", (e2) => {
      if (e2.target === backdrop)
        hide();
    });
    input.addEventListener("keydown", (e2) => {
      if (e2.key === "Enter")
        apply();
      if (e2.key === "Escape")
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
  function setupNewFolder(host, s3, callbacks) {
    const backdrop = s3.getElementById("nf-backdrop");
    const input = s3.getElementById("nf-input");
    const confirmBtn = s3.getElementById("nf-confirm");
    const cancelBtn = s3.getElementById("nf-cancel");
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
    backdrop.addEventListener("click", (e2) => {
      if (e2.target === backdrop)
        hide();
    });
    input.addEventListener("keydown", (e2) => {
      if (e2.key === "Enter")
        create();
      if (e2.key === "Escape")
        hide();
    });
    document.addEventListener("keydown", (e2) => {
      if (e2.key === "Escape" && backdrop.classList.contains("visible")) {
        hide();
      }
    });
  }

  // src/components/media/GridMedia/features/drag-drop.ts
  function setupDragDrop(s3, callbacks) {
    const fileInput = s3.getElementById("file-input");
    const dropOverlay = s3.getElementById("drop-overlay");
    let dragCounter = 0;
    let internalDrag = false;
    fileInput.addEventListener("change", () => {
      if (fileInput.files?.length)
        callbacks.onFiles(fileInput.files);
    });
    s3.getElementById("grid").addEventListener("dragstart", () => {
      internalDrag = true;
    });
    document.addEventListener("dragend", () => {
      internalDrag = false;
    });
    document.addEventListener("dragenter", (e2) => {
      e2.preventDefault();
      if (internalDrag)
        return;
      dragCounter++;
      if (dragCounter === 1)
        dropOverlay.classList.add("visible");
    });
    document.addEventListener("dragleave", (e2) => {
      e2.preventDefault();
      if (internalDrag)
        return;
      dragCounter--;
      if (dragCounter === 0)
        dropOverlay.classList.remove("visible");
    });
    document.addEventListener("dragover", (e2) => e2.preventDefault());
    document.addEventListener("drop", (e2) => {
      e2.preventDefault();
      dragCounter = 0;
      dropOverlay.classList.remove("visible");
      if (internalDrag) {
        internalDrag = false;
        return;
      }
      if (e2.dataTransfer?.files.length)
        callbacks.onFiles(e2.dataTransfer.files);
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
    const el = document.createElement("div");
    el.slot = "fields";
    el.innerHTML = `
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
    const copyBtn = el.querySelector("#btn-copy");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(mediaUrl);
      copyBtn.innerHTML = ICON_CHECK;
      setTimeout(() => {
        copyBtn.innerHTML = ICON_COPY;
      }, 1500);
    });
    return el;
  }
  function buildActions(item) {
    const canReplace = item.type !== "folder";
    const el = document.createElement("div");
    el.slot = "actions";
    el.innerHTML = `
        <div class="detail-actions">
            <p9r-button id="btn-save" variant="filled" color="primary">Save</p9r-button>
            ${canReplace ? `<p9r-button id="btn-replace" variant="outlined">Replace</p9r-button>` : ""}
            <p9r-button id="btn-delete" variant="ghost" color="danger">Delete</p9r-button>
        </div>
    `;
    return el;
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
        fields.addEventListener("keydown", (e2) => {
          if (e2.key === "Enter") {
            e2.preventDefault();
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
  function setupFeatures(host, s3) {
    const refresh2 = () => host._refresh();
    const ctxMenu = setupContextMenu(s3, {
      onRename: (item) => rename.open(item),
      onDelete: (id2) => host._confirmDelete(id2)
    });
    const rename = setupRename(s3, {
      onApply: async (id2, name) => {
        await renameItem(id2, name);
        refresh2();
      }
    });
    setupNewFolder(host, s3, {
      onCreate: async (name) => {
        await createFolder(name, host._folder);
        refresh2();
      }
    });
    const dragDrop = setupDragDrop(s3, {
      onFiles: async (files) => {
        await uploadFiles(files, host._folder);
        refresh2();
      }
    });
    const detail = setupDetail(host.detail, {
      onSave: async (id2, data) => {
        if (await saveItemMetadata(id2, data))
          host.detail.close();
      },
      onReplace: async (id2, file) => {
        if (await replaceFileContent(id2, file)) {
          host.detail.close();
          refresh2();
        }
      },
      onDelete: async (id2) => {
        if (!confirm("Delete this file?"))
          return;
        if (await deleteItem(id2)) {
          host.detail.close();
          refresh2();
        }
      },
      onClose: refresh2
    });
    return { ctxMenu, dragDrop, detail };
  }

  // src/components/media/GridMedia/events/grid.ts
  function wireGrid(host, s3, ctxMenu, detail) {
    const grid = s3.getElementById("grid");
    grid.addEventListener("click", (e2) => {
      const card = e2.target.closest("p9r-card-media");
      if (!card)
        return;
      const id2 = card.dataset.id;
      if (card.dataset.type === "folder") {
        const folder = host._items.find((i) => i.id === id2);
        host._navigateTo(id2, folder?.label);
      } else {
        const item = host._items.find((i) => i.id === id2);
        if (item)
          detail.open(item);
      }
    });
    grid.addEventListener("contextmenu", (e2) => {
      const card = e2.target.closest("p9r-card-media");
      if (!card)
        return;
      const item = host._items.find((i) => i.id === card.dataset.id);
      if (!item)
        return;
      e2.preventDefault();
      ctxMenu.show(e2, item);
    });
  }

  // src/components/media/GridMedia/events/breadcrumb.ts
  function wireBreadcrumb(host, s3) {
    s3.getElementById("breadcrumb").addEventListener("click", (e2) => {
      const target = e2.target;
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
        css: style_default18,
        template: template_default19
      });
    }
    get detail() {
      return this.shadowRoot.getElementById("detail");
    }
    get crop() {
      return this.shadowRoot.getElementById("crop");
    }
    connectedCallback() {
      const s3 = this.shadowRoot;
      this._folder = new URL(window.location.href).searchParams.get("folder");
      const f2 = setupFeatures(this, s3);
      wireGrid(this, s3, f2.ctxMenu, f2.detail);
      wireBreadcrumb(this, s3);
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
    async _confirmDelete(id2) {
      if (!confirm("Delete this item?"))
        return;
      if (await deleteItem(id2))
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
      this.querySelector('[data-role="folder-name"]')?.addEventListener("keydown", (e2) => {
        if (e2.key === "Enter") {
          e2.preventDefault();
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

  // src/components/form/Form/events/onKeyboardEvent.ts
  function onKeyboardEvent(e2, nativeForm) {
    if (e2.key !== "Enter")
      return;
    const target = e2.target;
    if (target.tagName === "TEXTAREA")
      return;
    e2.preventDefault();
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
  function onSubmit(e2, me2) {
    e2.preventDefault();
    const form = e2.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    fetch(buildRequestUrl(me2.target), {
      method: me2.method || "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    }).then(async (res) => {
      if (res.ok) {
        form.reset();
        me2.dispatchEvent(new BubblesEvent("form:success"));
        if (me2.emit) {
          document.dispatchEvent(new BubblesEvent(me2.emit));
        }
      } else {
        Yl(await readErrorMessage(res), { type: "error" });
        me2.dispatchEvent(new BubblesEvent("form:failed"));
      }
    }).catch(() => {
      Yl("Network error — please try again.", { type: "error" });
      me2.dispatchEvent(new BubblesEvent("form:failed"));
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
    static get observedAttributes() {
      return ["redirect", "target", "method", "emit"];
    }
    _handleInternalSubmit = (e2) => {
      onSubmit(e2, this);
    };
    _handleKeydown = (e2) => {
      onKeyboardEvent(e2, this._nativeForm);
    };
    connectedCallback() {
      requestAnimationFrame(() => {
        if (this._nativeForm)
          return;
        this._nativeForm = document.createElement("form");
        const id2 = this.getAttribute("id");
        if (id2) {
          this._nativeForm.id = id2;
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
    attributeChangedCallback(name, oldValue, newValue) {}
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
      this._clearBtn.addEventListener("click", (e2) => {
        e2.stopPropagation();
        this.value = "";
        this.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    _openPicker() {
      const center = document.createElement("cms-media-center");
      document.body.appendChild(center);
      const handler = (e2) => {
        center.removeEventListener("select-item", handler);
        const src = e2.detail?.src;
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
  define("cms-binding-core", na);
  define("p9r-accordion", Jt);
  define("p9r-accordion-item", Ot);
  define("p9r-alert", ie);
  define("p9r-avatar", ae);
  define("p9r-badge", de);
  define("p9r-breadcrumb", ue);
  define("p9r-breadcrumb-item", me);
  define("p9r-button", Oe);
  define("p9r-card", ve);
  define("w13c-checkbox", sr);
  define("p9r-container", Ni);
  define("p9r-divider", Ge);
  define("w13c-form", jn);
  define("p9r-form-dialog", Le);
  define("p9r-section", ur);
  define("p9r-horizontal-action-group", Di);
  define("p9r-icon-button", mr);
  define("w13c-input-file", wr);
  define("w13c-lateral-dialog", Be);
  define("w13c-lateral-menu", Oi);
  define("w13c-lateral-menu-item", oo);
  define("w13c-left-menu-layout", Xi);
  define("p9r-modal", $e);
  define("p9r-open-modal", Ze);
  define("p9r-input", Tr);
  define("p9r-range", jr);
  define("p9r-select", Qr);
  define("p9r-sizes-select", Gr);
  define("p9r-pagination", ho);
  define("p9r-progress", go);
  define("p9r-radio", Yr);
  define("p9r-radio-group", ni);
  define("p9r-segmented-switch", di);
  define("p9r-skeleton", xo);
  define("p9r-spinner", wo);
  define("p9r-stack", Qi);
  define("p9r-step", Ho);
  define("p9r-stepper", Ao);
  define("p9r-switch", bi);
  define("p9r-tab-panel", ln);
  define("p9r-table", So);
  define("p9r-cell", Fo);
  define("p9r-header-cell", Xo);
  define("p9r-row", Jo);
  define("p9r-tabs", nn);
  define("p9r-tag", un);
  define("p9r-tag-suggest", Ti);
  define("p9r-textarea", Pi);
  define("p9r-toast", gn);
  define("p9r-toast-stack", xn);
  define("p9r-tooltip", kn);
  define("p9r-stat", Hn);
  define("p9r-line-chart", Sn);
  define("p9r-bar-list", Fn);
  define("p9r-range-tabs", Kn);
})();
