const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function trapMenuFocus(host, event, trigger) {
    const focusable = [...host.shadowRoot.querySelectorAll(FOCUSABLE), ...host.querySelectorAll(FOCUSABLE)].filter(
        (element) => element !== trigger && !element.hasAttribute("hidden"),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    const active = host.shadowRoot?.activeElement || host.ownerDocument.activeElement;
    if (!first || !last) {
        event.preventDefault();
    } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}
