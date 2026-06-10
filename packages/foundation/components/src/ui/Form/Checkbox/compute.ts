export { upgradeProperty } from "@bernouy/components/base";

export const syncFormValue = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    internals: ElementInternals,
) => {
    const checked = input?.checked ?? host.hasAttribute('checked');
    internals.setFormValue(checked ? (host.getAttribute('value') ?? 'on') : null);
};

export const initInput = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) return;
    input.checked = host.hasAttribute('checked');
    input.disabled = host.hasAttribute('disabled');
    input.indeterminate = host.hasAttribute('indeterminate');
    if (host.hasAttribute('name')) input.name = host.getAttribute('name') ?? '';
    if (host.hasAttribute('value')) input.value = host.getAttribute('value') ?? '';
};

export const applyAttribute = (
    host: HTMLElement, input: HTMLInputElement | null, internals: ElementInternals,
    name: string, newVal: string | null,
) => {
    if (!input) return;
    if (name === 'checked') { input.checked = newVal !== null; syncFormValue(host, input, internals); }
    else if (name === 'disabled') input.disabled = newVal !== null;
    else if (name === 'indeterminate') input.indeterminate = newVal !== null;
    else if (name === 'name') input.name = newVal ?? '';
    else if (name === 'value') { input.value = newVal ?? ''; syncFormValue(host, input, internals); }
};
