import { numericRangeStyle } from "../range/range-style";

export const schemaFilterStyle = `
    commerce-offer-filter[schema-driven] [data-schema-filters] {
        display: grid;
        gap: 1rem;
    }

    commerce-offer-filter[schema-driven] [data-schema-field] {
        display: grid;
        gap: .35rem;
        color: var(--text-main, inherit);
        font-size: .925rem;
        font-weight: 700;
    }

    commerce-offer-filter[schema-driven] [data-schema-field] input {
        box-sizing: border-box;
        width: 100%;
        min-height: 2.65rem;
        padding: .55rem .7rem;
        border: 1px solid var(--border-default, color-mix(in srgb, currentColor 22%, transparent));
        border-radius: var(--radius-control, .375rem);
        color: var(--text-main, inherit);
        background: var(--bg-surface, Canvas);
        font: inherit;
        font-weight: 400;
    }

    commerce-offer-filter[schema-driven] [data-schema-field] input:focus-visible {
        outline: 2px solid var(--secondary-base, currentColor);
        outline-offset: 2px;
    }
    ${numericRangeStyle}
`;
