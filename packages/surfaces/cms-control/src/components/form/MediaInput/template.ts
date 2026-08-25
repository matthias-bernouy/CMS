export const mediaInputTemplate = `
    <div class="field">
        <label class="label" for="media-tile"></label>
        <div class="tile-wrap">
            <button id="media-tile" class="tile" type="button" title="Choose a file">
                <img class="preview" alt="" />
                <span class="placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="9" cy="9" r="1.6"/>
                        <path d="m21 15-4.5-4.5L5 21"/>
                    </svg>
                </span>
            </button>
            <button class="clear" type="button" title="Remove" aria-label="Remove selected file">
                <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                    stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    </div>
`;
