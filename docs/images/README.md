# Files And Responsive Images

Files are provided through the standard `ulvia.cms.files` contract. The Kernel,
browsers and other providers use the same binding-derived gateway
routes under `/.cms/call/ulvia.cms.files`.

The selected Files provider owns namespaces, credentials, upload sessions,
metadata, immutable generations, visibility, access signatures, quotas and
image representations. The gateway only authenticates the caller, checks the
effective grant and streams the declared binary capability.

Public immutable files use URLs such as:

```text
/.cms/call/ulvia.cms.files/files/file_123/sha256-abcd
```

Private reads use the same URL with an opaque `access` query minted by
`files.sign`. Application and reverse-proxy access logs must omit query strings.

The official provider offers `thumbnail` and `responsive` WebP profiles. It
keeps originals, never enlarges images, skips SVG and animated inputs, creates
at most ten content-addressed representations, and serves the original while
background representations are unavailable. Representation discovery and reads
are ordinary contract capabilities.

`ulvia-official-image` wraps a native `<img>`. Its `src`, `srcset`, `sizes`,
`alt` and loading attributes follow the ordinary Page markup and binding rules;
the Kernel does not interpret `FileReference` values or perform image-specific
projection. Image processing never runs in the gateway or the Bloc.
