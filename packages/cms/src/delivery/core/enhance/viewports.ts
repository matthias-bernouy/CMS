// Viewport widths probed during the post-render Playwright pass. Resizing
// (vs reloading) makes adding viewports almost free, so the list is
// deliberately broad — covers iPhone SE (320) up to 4K (3840) with all the
// usual desktop densities in between. Height is fixed to 1080 because we
// only measure horizontal layout; vertical scroll position never changes
// the rendered width of an `<img>`.
export const VIEWPORT_WIDTHS: readonly number[] = [
    320, 360, 414, 480, 600, 768, 834, 1024, 1280, 1440, 1680, 1920, 2560, 3840,
];

export const VIEWPORT_HEIGHT = 1080;

// Three DPR multipliers cover everything from desktop CRTs (1x) through
// retina laptops/most phones (2x) to high-end mobiles (3x). The browser
// picks from `srcset` based on `displayed CSS px × current DPR`, so we
// pre-compute every (CSS width × DPR) tuple and snap each to the nearest
// ladder rung.
export const DPR_MULTIPLIERS: readonly number[] = [1, 2, 3];
