# Changelog

## v1.0.0

- Add an accessible transparent Back-to-Top control with reduced-motion and mobile safe-area support.
- Group Theme and Language controls with compact independent widths, balanced label spacing and a quieter keyboard focus ring.
- Align Theme and Language dropdown chevrons with shared control spacing and theme-aware local SVG assets.
- Refactor security headers into one ASGI middleware, add a default-deny editor CSP and a separate policy for enabled FastAPI documentation routes.
- Add validated CSP `off` mode, tighten `base-uri` and worker permissions, and make enforce/report-only selection explicit without a silent fallback.
- Add configurable same-origin CSP in Report-Only or enforce mode and four standard security headers across HTTP responses.
- Replace the waveform's inline cursor style with a CSS class for strict `style-src-attr` compatibility.
- Add original waveform favicon assets, a web manifest, robots policy and a root-only sitemap.
- Add fixed FastAPI routes for root-level site assets and configurable public canonical metadata.
- Add layered workspace panels, theme-aware elevation tokens and restrained button and history-row interactions.
- Group waveform controls and improve responsive layouts, keyboard focus and reduced-motion behavior.
- Add localized metadata summary and expandable sanitized FFprobe JSON.
- Add Light, Dark and System preferences with semantic CSS colors and Canvas theme redraw.
- Add Korean, English, Japanese and Simplified Chinese translations with browser detection, persistence and English fallback.
- Localize static controls, dynamic status messages, known API errors, accessibility labels and recent history timestamps.
- Validate uploaded media with FFprobe and reject missing audio streams.
- Use configurable probe and processing timeouts on synchronous API paths.
- Terminate FFmpeg process groups on cancellation and timeout on POSIX systems.
- Keep bounded FFmpeg error capture and provide a specific missing-encoder job message.
- Limit browser waveform decoding to 64 MB and improve narrow-screen controls and editable-field shortcuts.
- Add synthetic-audio integration coverage for trim, removal crossfades, effects, merge, reuse and invalid uploads.
- Document installation, operations, security, retention, limitations and testing.
