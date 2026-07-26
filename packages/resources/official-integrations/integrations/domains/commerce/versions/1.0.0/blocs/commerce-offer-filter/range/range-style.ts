export const numericRangeStyle = `
    commerce-offer-filter[data-numeric-range] {
        display: grid;
        color: var(--text-main, inherit);
    }

    commerce-offer-filter[data-numeric-range] [data-range-fieldset] {
        display: grid;
        min-inline-size: 0;
        margin: 0;
        padding: 0;
        border: 0;
        gap: .55rem;
    }

    commerce-offer-filter[data-numeric-range] [data-range-legend] {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    commerce-offer-filter[data-numeric-range] [data-range-heading] {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: .75rem;
    }

    commerce-offer-filter[data-numeric-range] [data-range-label] {
        font-size: .925rem;
        font-weight: 700;
    }

    commerce-offer-filter[data-numeric-range] [data-range-output] {
        color: var(--text-muted, color-mix(in srgb, currentColor 68%, transparent));
        font-size: .78rem;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        white-space: nowrap;
    }

    commerce-offer-filter[data-numeric-range] [data-range-track] {
        position: relative;
        height: 2rem;
        margin-block: .05rem;
        --range-start: 0%;
        --range-end: 100%;
    }

    commerce-offer-filter[data-numeric-range] [data-range-rail],
    commerce-offer-filter[data-numeric-range] [data-range-fill] {
        position: absolute;
        top: 50%;
        height: .25rem;
        border-radius: 999px;
        pointer-events: none;
        transform: translateY(-50%);
    }

    commerce-offer-filter[data-numeric-range] [data-range-rail] {
        inset-inline: 0;
        background: var(--border-default, color-mix(in srgb, currentColor 22%, transparent));
    }

    commerce-offer-filter[data-numeric-range] [data-range-fill] {
        inset-inline: var(--range-start) calc(100% - var(--range-end));
        background: var(--secondary-base, currentColor);
    }

    commerce-offer-filter[data-numeric-range] input[type="range"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        appearance: none;
        background: transparent;
        pointer-events: none;
    }

    commerce-offer-filter[data-numeric-range] input[type="range"]::-webkit-slider-runnable-track {
        height: .25rem;
        background: transparent;
    }

    commerce-offer-filter[data-numeric-range] input[type="range"]::-webkit-slider-thumb {
        width: 1.5rem;
        height: 1.5rem;
        margin-top: -.625rem;
        appearance: none;
        border: 2px solid var(--bg-surface, Canvas);
        border-radius: 50%;
        background: var(--secondary-base, currentColor);
        box-shadow: var(--shadow-sm, 0 1px 3px color-mix(in srgb, currentColor 22%, transparent));
        cursor: grab;
        pointer-events: auto;
    }

    commerce-offer-filter[data-numeric-range] input[type="range"]::-moz-range-track {
        height: .25rem;
        background: transparent;
    }

    commerce-offer-filter[data-numeric-range] input[type="range"]::-moz-range-thumb {
        width: 1.5rem;
        height: 1.5rem;
        border: 2px solid var(--bg-surface, Canvas);
        border-radius: 50%;
        background: var(--secondary-base, currentColor);
        box-shadow: var(--shadow-sm, 0 1px 3px color-mix(in srgb, currentColor 22%, transparent));
        cursor: grab;
        pointer-events: auto;
    }

    commerce-offer-filter[data-numeric-range] input[type="range"]:focus-visible {
        outline: 2px solid var(--secondary-base, currentColor);
        outline-offset: 3px;
    }

    commerce-offer-filter[data-numeric-range] [data-range-manual] {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: .5rem;
    }

    commerce-offer-filter[data-numeric-range] [data-range-bound] {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: .35rem;
        color: var(--text-muted, color-mix(in srgb, currentColor 68%, transparent));
        font-size: .72rem;
        font-weight: 600;
    }

    commerce-offer-filter[data-numeric-range] [data-range-bound] input {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 2rem;
        padding: .3rem .45rem;
        border: 1px solid var(--border-default, color-mix(in srgb, currentColor 18%, transparent));
        border-radius: var(--radius-control, .375rem);
        color: var(--text-main, inherit);
        background: var(--bg-surface, Canvas);
        font: inherit;
        font-size: .82rem;
        font-variant-numeric: tabular-nums;
        font-weight: 400;
    }

    commerce-offer-filter[data-numeric-range] [data-range-bound] input:focus-visible {
        outline: 2px solid var(--secondary-base, currentColor);
        outline-offset: 2px;
    }
`;
