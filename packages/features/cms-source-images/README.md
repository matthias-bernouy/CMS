# CMS Source images

`@bernouy/cms-source-images` creates bounded, on-demand WebP derivatives for
authorized CMS Source image responses. Originals remain owned by the upstream
connector. The browser can request only the finite widths exported as
`SOURCE_IMAGE_WIDTHS`; arbitrary transform parameters never trigger work.

## Browser rollout contract

The host supplies two independent markup switches to
`createResponsiveSourceImageBrowserApi`:

- `public` enables explicitly public consumers;
- `private` enables every other consumer.

Public classification is opt-in. An image joins the public cohort only when it
has `data-source-image-access="public"`. A missing, misspelled, or unknown value
is classified as private.

Both intrinsic dimensions must resolve to positive integers before responsive
markup is emitted. A pair rendered as empty strings by the binding runtime is a
historical row with unknown dimensions and receives the immutable original.
Partial, invalid, or still-unresolved bindings remain network-dark.

The official runtime enables the server-side transformer and both markup
cohorts when their configuration is omitted. Only an explicit `false` disables
a capability. The transformer remains the prerequisite: disabling it also
forces both markup cohorts off. During rollback, disable private markup, then
public markup, and finally the transformer after previously loaded bundles have
drained.
