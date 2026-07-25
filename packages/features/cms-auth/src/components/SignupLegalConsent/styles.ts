export const SIGNUP_LEGAL_CONSENT_STYLES = `
    :host {
        display: block;
        color: var(--cms-auth-legal-text, inherit);
        font: inherit;
    }

    :host([data-state="empty"]) {
        display: none;
    }

    fieldset {
        min-width: 0;
        margin: 0;
        padding: 0;
        border: 0;
    }

    legend {
        margin: 0 0 .75rem;
        padding: 0;
        color: var(--cms-auth-legal-heading, currentColor);
        font: inherit;
        font-weight: 700;
    }

    .documents {
        display: grid;
        gap: .75rem;
    }

    .requirement {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        gap: .65rem;
    }

    input {
        width: 1.125rem;
        height: 1.125rem;
        margin: .15rem 0 0;
        accent-color: var(--cms-auth-legal-accent, currentColor);
    }

    input:focus-visible,
    a:focus-visible,
    button:focus-visible {
        outline: 2px solid var(--cms-auth-legal-accent, currentColor);
        outline-offset: 2px;
    }

    .copy {
        display: grid;
        gap: .25rem;
    }

    :host([appearance="compact"]) .copy {
        display: block;
    }

    label {
        cursor: pointer;
    }

    a {
        width: fit-content;
        color: var(--cms-auth-legal-link, currentColor);
        text-decoration: underline;
        text-underline-offset: .16em;
    }

    .status {
        margin: 0;
        color: var(--cms-auth-legal-muted, currentColor);
    }

    .status[data-kind="error"] {
        color: var(--cms-auth-legal-error, #b42318);
    }

    button {
        width: fit-content;
        margin-top: .65rem;
        border: 1px solid var(--cms-auth-legal-button-border, currentColor);
        border-radius: var(--cms-auth-legal-button-radius, .4rem);
        background: var(--cms-auth-legal-button-background, transparent);
        color: var(--cms-auth-legal-button-text, currentColor);
        cursor: pointer;
        font: inherit;
        padding: .45rem .7rem;
    }

    input:disabled,
    button:disabled {
        cursor: not-allowed;
        opacity: .6;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
`;
