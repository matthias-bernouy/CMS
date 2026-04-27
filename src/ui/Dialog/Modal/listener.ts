import type { Modal } from './Modal';

export const handleBackdropClick = (host: Modal, e: MouseEvent) => {
    if (e.target === e.currentTarget) host.hide();
};

export const handleCancel = (host: Modal, e: Event) => {
    e.preventDefault();
    host.hide();
};

export const handleClose = (host: Modal) => {
    if (host.hasAttribute('open')) host.removeAttribute('open');
    host.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
};
