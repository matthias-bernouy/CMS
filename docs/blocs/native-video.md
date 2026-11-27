# Native video

Components may own `<video>` in markup. Editable Page players use an explicit
`native-element` slot accepting `video`; native video roots are also supported.
Video is excluded from text-oriented `native-content` profiles.

Keep MP4, poster and WebVTT files in site Files, outside collection assets.
Store stable public file-generation URLs in native attributes or existing string
settings using `media-picker` (`accept: ["video"]` or `["image"]`). Replacing
Page references requires no collection release. An owned player's declared
behavior reads those settings and updates its existing video after checking URLs.

Supported attributes are `src`, `poster`, `controls`, `muted`, `loop`,
`playsinline`, `autoplay`, `preload`, `width` and `height`. Boolean attributes are
empty or omitted; boolean bindings require one complete expression. Preload is
`none`, `metadata` or `auto`; dimensions are positive integers.

Static media URLs must reference the CMS Files route. Dynamic URLs require one
complete `{{ file.url | internalUrl }}` binding. Pending values stay inert and
unsafe resolved URLs are removed. Remote, data, JavaScript and collection-asset
URLs are refused for video/track/source media attributes.

`track` must be a direct video child with a source. Kinds are `subtitles`,
`captions`, `descriptions`, `chapters` and `metadata`. Subtitles require `srclang`;
a present label must be nonempty. `default` is boolean. Serve captions as WebVTT.

Playback policy belongs to the Bloc: muted autoplay, motion/data-saving
preferences, rejected `play()` promises and accessible custom controls. Omit
native autoplay initially when behavior must decide whether to start. The
platform adds no global playback controller. Keep native controls until custom
controls work with keyboard, focus and touch; verify seeking, sound, captions
and fullscreen on the target devices. Admission does not prove media access,
availability or codec support.
