/** Lucide "key-round" — used in the picker trigger to signal "this field
 *  holds a credential reference". Inline (not via the shared icons.ts
 *  registry) because the trigger SVG is part of the static template. */
export const ICON_KEY = `
<svg class="key-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
    <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/>
    <circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>
</svg>
`;
