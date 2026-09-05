import { numericRangeStyle } from "../range/range-style";

export const schemaFilterStyle = `
    mossa-commerce-offer-filter[schema-driven] [data-schema-filters] {
        display: grid;
        gap: 1rem;
    }

    mossa-commerce-offer-filter[schema-driven] [data-schema-field] {
        display: grid;
        gap: .35rem;
        color: var(--ulvia-body-text);
        font-size: .925rem;
        font-weight: 700;
    }

    mossa-commerce-offer-filter[schema-driven] [data-schema-field] input {
        box-sizing: border-box;
        width: 100%;
        min-height: 2.65rem;
        padding: .55rem .7rem;
        border: 1px solid var(--ulvia-surface-border);
        border-radius: var(--ulvia-radius-control);
        color: var(--ulvia-body-text);
        background: var(--ulvia-surface-background);
        font: inherit;
        font-weight: 400;
    }

    mossa-commerce-offer-filter[schema-driven] [data-schema-field] input:focus-visible {
        outline: 2px solid var(--ulvia-secondary-base);
        outline-offset: 2px;
    }
    ${numericRangeStyle}
`;
