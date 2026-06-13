import { getRadios, syncDisabled, nextRadioGroupName } from './compute';
import { emitChange } from './emit';

export const syncRadios = (
    host: HTMLElement, slot: HTMLSlotElement | null, internals: ElementInternals,
) => {
    const radios = getRadios(slot);
    const groupName = host.getAttribute('name') ?? nextRadioGroupName();
    const value = host.getAttribute('value');

    radios.forEach(r => {
        r.setAttribute('name', groupName);
        const isSelected = value !== null && r.getAttribute('value') === value;
        if (isSelected) r.setAttribute('checked', '');
        else r.removeAttribute('checked');
        r.setAttribute('tabindex', isSelected ? '0' : '-1');
    });

    if (value === null && radios.length > 0) {
        radios[0]?.setAttribute('tabindex', '0');
    }

    syncDisabled(radios, host.hasAttribute('disabled'));
    internals.setFormValue(value ?? null);
};

export const handleRadioChange = (host: HTMLElement, e: Event) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'P9R-RADIO') return;
    const newValue = target.getAttribute('value') ?? '';
    if (newValue !== host.getAttribute('value')) {
        host.setAttribute('value', newValue);
        emitChange(host, newValue);
    }
};

export const handleKeydown = (host: HTMLElement, slot: HTMLSlotElement | null, e: KeyboardEvent) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const radios = getRadios(slot).filter(r => !r.hasAttribute('disabled'));
    if (radios.length === 0) return;

    const current = radios.findIndex(r => r === document.activeElement);
    const fallback = current === -1 ? 0 : current;
    let nextIdx = fallback;

    switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':   nextIdx = (fallback - 1 + radios.length) % radios.length; break;
        case 'ArrowRight':
        case 'ArrowDown': nextIdx = (fallback + 1) % radios.length; break;
        case 'Home':      nextIdx = 0; break;
        case 'End':       nextIdx = radios.length - 1; break;
    }

    e.preventDefault();
    const next = radios[nextIdx];
    if (!next) return;
    const value = next.getAttribute('value') ?? '';
    host.setAttribute('value', value);
    next.focus();
    emitChange(host, value);
};
