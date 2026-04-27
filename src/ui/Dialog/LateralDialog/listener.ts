import { emitClose } from './emit';

interface Closable extends HTMLElement {
    close(): void;
}

export const handleBackdropClick = (host: Closable, e: MouseEvent) => {
    const dialog = host.shadowRoot?.querySelector('dialog');
    if (e.target === dialog) host.close();
};

export const handleCloseClick = (host: Closable, e: Event) => {
    e.preventDefault();
    host.close();
};

export const handleCancel = (host: Closable, e: Event) => {
    e.preventDefault();
    host.close();
};

export const handleClose = (host: HTMLElement) => {
    if (host.hasAttribute('open')) host.removeAttribute('open');
    emitClose(host);
};
