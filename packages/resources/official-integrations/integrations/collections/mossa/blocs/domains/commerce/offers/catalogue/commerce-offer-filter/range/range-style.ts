export const numericRangeStyle = `
    mossa-commerce-offer-filter[data-numeric-range] {
        display: grid;
        color: var(--ulvia-body-text);
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-fieldset] {
        display: grid;
        min-inline-size: 0;
        margin: 0;
        padding: 0;
        border: 0;
        gap: .55rem;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-legend] {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-heading] {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: .75rem;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-label] {
        font-size: .925rem;
        font-weight: 700;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-output] {
        color: var(--ulvia-surface-muted-text);
        font-size: .78rem;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        white-space: nowrap;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-track] {
        position: relative;
        height: 2rem;
        margin-block: .05rem;
        --_mossa-range-start: 0%;
        --_mossa-range-end: 100%;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-rail],
    mossa-commerce-offer-filter[data-numeric-range] [data-range-fill] {
        position: absolute;
        top: 50%;
        height: .25rem;
        border-radius: 999px;
        pointer-events: none;
        transform: translateY(-50%);
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-rail] {
        inset-inline: 0;
        background: var(--ulvia-surface-border);
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-fill] {
        inset-inline: var(--_mossa-range-start) calc(100% - var(--_mossa-range-end));
        background: var(--ulvia-secondary-base);
    }

    mossa-commerce-offer-filter[data-numeric-range] input[type="range"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        appearance: none;
        background: transparent;
        pointer-events: none;
    }

    mossa-commerce-offer-filter[data-numeric-range] input[type="range"]::-webkit-slider-runnable-track {
        height: .25rem;
        background: transparent;
    }

    mossa-commerce-offer-filter[data-numeric-range] input[type="range"]::-webkit-slider-thumb {
        width: 1.5rem;
        height: 1.5rem;
        margin-top: -.625rem;
        appearance: none;
        border: 2px solid var(--ulvia-surface-background);
        border-radius: 50%;
        background: var(--ulvia-secondary-base);
        box-shadow: var(--ulvia-shadow-sm);
        cursor: grab;
        pointer-events: auto;
    }

    mossa-commerce-offer-filter[data-numeric-range] input[type="range"]::-moz-range-track {
        height: .25rem;
        background: transparent;
    }

    mossa-commerce-offer-filter[data-numeric-range] input[type="range"]::-moz-range-thumb {
        width: 1.5rem;
        height: 1.5rem;
        border: 2px solid var(--ulvia-surface-background);
        border-radius: 50%;
        background: var(--ulvia-secondary-base);
        box-shadow: var(--ulvia-shadow-sm);
        cursor: grab;
        pointer-events: auto;
    }

    mossa-commerce-offer-filter[data-numeric-range] input[type="range"]:focus-visible {
        outline: 2px solid var(--ulvia-secondary-base);
        outline-offset: 3px;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-manual] {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: .5rem;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-bound] {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: .35rem;
        color: var(--ulvia-surface-muted-text);
        font-size: .72rem;
        font-weight: 600;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-bound] input {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 2rem;
        padding: .3rem .45rem;
        border: 1px solid var(--ulvia-surface-border);
        border-radius: var(--ulvia-radius-control);
        color: var(--ulvia-body-text);
        background: var(--ulvia-surface-background);
        font: inherit;
        font-size: .82rem;
        font-variant-numeric: tabular-nums;
        font-weight: 400;
    }

    mossa-commerce-offer-filter[data-numeric-range] [data-range-bound] input:focus-visible {
        outline: 2px solid var(--ulvia-secondary-base);
        outline-offset: 2px;
    }
`;
