import { makeInput, makeSelect, makeIconButton, ICON_X } from "./controls";
import { readControl } from "./shared";
import { isValidHeaderName, isForbiddenHeaderName, type EndpointHeader } from "@bernouy/cms-gateway/browser";

/** Handle for one header row: its element + a `read()` assembling the
 *  `EndpointHeader` (or `null` when the name is blank). */
export type HeaderRowHandle = {
    element: HTMLElement;
    read: () => EndpointHeader | null;
};

/** One editable request-header row — UI-only (no form names). A name input
 *  (inline-validated like the status field), a static/secret source toggle, and
 *  the matching value control (a plain input for `static`, a `<cms-credential-select>`
 *  for `secret`). Both value controls are built ONCE; the toggle only flips their
 *  `style.display` — the p9r-select and the credential picker are NEVER reparented
 *  (moving them would reset their live value). The trash button calls `onRemove`,
 *  which the panel uses to drop this row's handle AND its element. */
export function makeHeaderRow(
    seed: Partial<EndpointHeader>,
    onChange: () => void,
    onRemove: () => void,
    opts?: { api?: string },
): HeaderRowHandle {
    const row = document.createElement('p9r-stack');
    row.setAttribute('direction', 'row');
    row.setAttribute('gap', 'sm');
    row.setAttribute('align', 'center');
    row.dataset.role = 'header-row';

    const from = seed.source?.from ?? 'static';

    // ── Name (inline-validated) ──
    const name = makeInput('', '', 'X-Api-Version', seed.name);
    name.className = 'ep-name';
    name.dataset.role = 'header-name';
    const validate = () => {
        const n = readControl(name).trim();
        if (n && (!isValidHeaderName(n) || isForbiddenHeaderName(n))) {
            name.setAttribute('invalid', '');
            name.setAttribute('hint', 'Invalid or reserved header name');
            name.setAttribute('hint-level', 'error');
        } else {
            name.removeAttribute('invalid');
            name.removeAttribute('hint');
            name.removeAttribute('hint-level');
        }
    };
    name.addEventListener('input', () => { validate(); onChange(); });
    if (seed.name) validate();

    // ── Source toggle ──
    const fromSelect = makeSelect(['static', 'secret'], from);
    fromSelect.className = 'ep-status';
    fromSelect.dataset.role = 'header-from';

    // ── Both value controls, built ONCE ──
    const staticInput = makeInput('', '', 'value',
        from === 'static' ? (seed.source as { value?: string } | undefined)?.value : undefined);
    staticInput.className = 'ep-name';
    staticInput.dataset.role = 'header-value-static';
    staticInput.style.display = from === 'static' ? '' : 'none';
    staticInput.addEventListener('input', onChange);

    const credSelect = document.createElement('cms-credential-select');
    credSelect.dataset.role = 'header-value-secret';
    credSelect.className = 'ep-name';   // flex:1 — same slot/width as the static value input
    credSelect.setAttribute('label', '');
    if (opts?.api) credSelect.setAttribute('api', opts.api);
    if (from === 'secret') credSelect.setAttribute('value', (seed.source as { ref?: string }).ref ?? '');
    credSelect.style.display = from === 'secret' ? '' : 'none';
    credSelect.addEventListener('change', onChange);

    fromSelect.addEventListener('change', () => {
        const v = readControl(fromSelect);
        fromSelect.setAttribute('value', v);   // keep attr in sync so a re-slot can't reset it
        staticInput.style.display = v === 'static' ? '' : 'none';
        credSelect.style.display = v === 'secret' ? '' : 'none';
        onChange();
    });

    const remove = makeIconButton(ICON_X, { ariaLabel: 'Remove header', onClick: onRemove });

    row.append(name, fromSelect, staticInput, credSelect, remove);

    const read = (): EndpointHeader | null => {
        const n = readControl(name).trim();
        if (!n) return null;
        if (readControl(fromSelect) === 'secret') {
            const ref = ((credSelect as { value?: string }).value
                || credSelect.getAttribute('value') || '').trim();
            return ref ? { name: n, source: { from: 'secret', ref } } : null;
        }
        return { name: n, source: { from: 'static', value: readControl(staticInput) } };
    };

    return { element: row, read };
}
