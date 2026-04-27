import { emitToggle } from './emit';

interface SectionHost extends HTMLElement {
    collapsed: boolean;
}

export const handleToggleClick = (host: SectionHost) => {
    host.collapsed = !host.collapsed;
    emitToggle(host, host.collapsed);
};

export const handleToggleKey = (host: SectionHost, e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    handleToggleClick(host);
};
