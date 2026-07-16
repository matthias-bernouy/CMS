export const DASHBOARD_ICONS = {
    database: svg(`
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
        <path d="M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
    `),
    "map-pin": svg(`
        <path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
    `),
    layout: svg(`
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
    `),
    search: svg(`
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
    `),
    user: svg(`
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
    `),
    users: svg(`
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M16 4.5a4 4 0 0 1 0 7M17.5 15a6 6 0 0 1 4.5 6" />
    `),
    mail: svg(`
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
    `),
    send: svg(`
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
    `),
    "shopping-bag": svg(`
        <path d="M6 8V6a6 6 0 0 1 12 0v2" />
        <path d="M4 8h16l1 13H3Z" />
    `),
    package: svg(`
        <path d="m12 3 9 5-9 5-9-5Z" />
        <path d="m3 8 9 5 9-5v8l-9 5-9-5ZM12 13v8" />
    `),
    tag: svg(`
        <path d="M20 13 13 20 3 10V3h7Z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
    `),
    receipt: svg(`
        <path d="M5 3v18l3-2 4 2 4-2 3 2V3l-3 2-4-2-4 2Z" />
        <path d="M9 9h6M9 13h6" />
    `),
    settings: svg(`
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1h-4v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1h-.1v-4H3a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.25.62.86 1 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    `),
    store: svg(`
        <path d="M3 9h18l-2-6H5ZM5 13v8h14v-8" />
        <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-6h6v6" />
    `),
    "credit-card": svg(`
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h2" />
    `),
    truck: svg(`
        <path d="M3 6h11v11H3ZM14 10h4l3 3v4h-7Z" />
        <circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" />
    `),
} as const;

export type DashboardIconName = keyof typeof DASHBOARD_ICONS;

function svg(content: string): string {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}
