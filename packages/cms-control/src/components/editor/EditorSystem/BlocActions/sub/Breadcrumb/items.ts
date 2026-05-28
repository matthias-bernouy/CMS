import type { BreadcrumbItem, BreadcrumbCallbacks } from './Breadcrumb';

export function renderBreadcrumbItem(item: BreadcrumbItem, cb: BreadcrumbCallbacks): HTMLElement {
    if (item.type === 'ellipsis') {
        const span = document.createElement('span');
        span.className = 'ellipsis';
        span.textContent = '…';
        return span;
    }
    if (item.type === 'current') {
        const span = document.createElement('span');
        span.className = 'current';
        span.textContent = item.label;
        return span;
    }
    return renderParentButton(item.key, item.label, cb);
}

function renderParentButton(key: string, label: string, cb: BreadcrumbCallbacks): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'parent';
    btn.textContent = label;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        cb.onPick(key);
    });
    btn.addEventListener('mouseenter', () => cb.onHover(key, true));
    btn.addEventListener('mouseleave', () => cb.onHover(key, false));
    return btn;
}

export function renderSeparator(): HTMLElement {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '›';
    return sep;
}
