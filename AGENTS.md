# AGENTS.md — Audio Toolkit

## Purpose and priorities

Audio Toolkit v1.0.0 is the initial public release of a local-first, self-hosted audio conversion and editing application. The public [repository](https://github.com/glitter-node/audio-toolkit) and [v1.0.0 release](https://github.com/glitter-node/audio-toolkit/releases/tag/v1.0.0) are authoritative for publication and release information. The same Python, FastAPI and Uvicorn entry point serves development and normal local use; `--reload` is optional during development. A separate Nginx or Apache server, Docker, cloud conversion service and database are not required for localhost operation. A reverse proxy is optional for intentionally remote access. Prioritize correctness, API compatibility, a small native installation, privacy, and preservation of user audio. Read [README.md](README.md) and the relevant source before documenting or changing behavior. Explicit user instructions take priority over this file.

## Technology stack and repository map

- `app/main.py`: FastAPI entry point `app.main:app`, application lifespan, cleanup task, `/` page, `/static` mount and fixed site-asset routes.
- `app/config.py`: Pydantic settings from environment variables and optional `.env`; default local host and port settings are `127.0.0.1` and `8012`, but Uvicorn CLI binding must be passed explicitly.
- `app/routes.py`: `/api` health, upload, FFprobe metadata, synchronous processing, reuse and download, plus job status, cancellation and SSE routes.
- `app/jobs.py`: process-local single-worker FFmpeg queue, job state, progress, cancellation, timeouts and expired-file cleanup.
- `app/security.py`: application security headers and separate CSP policies for the editor and enabled FastAPI documentation routes.
- `app/static/index.html`, `style.css`, `app.js`, `theme-init.js`, `i18n.js`, and `i18n/*.json`: native browser UI, themes, waveform interactions and four languages.
- `data/uploads` and `data/outputs`: default runtime media paths under `DATA_DIR=./data`; preserve these directories and their contents.
- `tests/`: existing Python tests; see the verification restrictions below before executing any test.
- [Windows Auto-Start](docs/WINDOWS_AUTOSTART.md): optional current-user Task Scheduler guidance; no startup script is bundled.

`requirements.txt` lists Python packages, including test dependencies. FFmpeg and FFprobe are external executables and must be present on `PATH`. No SQLite or other external database is required by the current application. Python 3.11+ is the documented project baseline, but the repository does not declare an enforced `requires-python` minimum or a verified cross-platform compatibility matrix.

## Installation and environment guidance

For an installation or startup request, establish the **target host OS and version**, shell, installation state, and whether access should be localhost-only or remote. Do not infer the user's target OS from the agent's execution environment. Use `.venv/bin/python` on Linux/macOS and `.venv\Scripts\python.exe` in Windows PowerShell. Work from the project root so `.env` and relative `DATA_DIR` resolve consistently. Use `-m uvicorn app.main:app --host 127.0.0.1 --port 8012` as the documented example; `8012` is a chosen port, not an automatically applied `APP_PORT` setting. Run one Uvicorn worker because queue state and limits are process-local. Keep an existing `.env`, virtual environment and runtime files intact. Never register a Windows scheduled task without an explicit user request.

## Development conventions and API compatibility

Prefer small, focused changes; avoid unnecessary frameworks, runtime dependencies and architectural rewrites. Omit source-code comments. Use English for source identifiers, developer-facing messages and logs. Preserve existing API paths, request/response shapes, file identifiers, validation and downloadable result behavior unless a requested change requires a coordinated migration. Keep `<html lang="en">` in source HTML. Keep CSS in external stylesheets, JavaScript in separate files, and event handlers out of markup. Do not add inline styles or scripts.

## Audio processing and FFmpeg

Distinguish browser-side waveform decoding and preview from server-side FFmpeg output; browser appearance is not proof of downloaded audio accuracy. Preserve waveform peaks, timeline, selection, boundary dragging, playback, zoom, loop, auto-scroll, Undo/Redo and processed-result editing. FFprobe validates an audio stream. The API accepts `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.opus` and `.webm` uploads and produces `mp3`, `wav`, `flac`, `ogg`, `opus` or `m4a` output when the local encoder is available. Uploads default to a 200 MB application limit; the browser waveform path rejects files above 64 MB. FFmpeg operations re-encode output, so avoid claiming lossless repeated editing for MP3/AAC. The removal crossfade is 0–100 ms with 20 ms default and may be capped near boundaries. Do not alter timing, filter graphs or file lifecycle logic as part of documentation-only work.

## Background job lifecycle and data preservation

The default queue has one processing worker and accepts up to eight active queued/running jobs. Maintain queued, running, completed, failed and cancelled transitions, SSE termination, timeout behavior, process termination and partial-output cleanup. Preserve input validation and output-path isolation. `JOB_TIMEOUT_SECONDS` defaults to 300, `PROBE_TIMEOUT_SECONDS` to 30, and `FILE_RETENTION_HOURS` to 24. The lifespan cleanup loop runs about every five minutes and protects paths of active jobs. Job snapshots live in process memory and are lost on restart; uploaded and processed files reside under `DATA_DIR` until removed by retention cleanup. Never inspect, delete, reset or overwrite live user audio, `.env`, runtime data, private credentials, or an existing virtual environment without explicit authorization.

## Frontend, internationalization and themes

Keep native controls, keyboard access, visible focus and responsive waveform behavior. Preserve Korean, English, Japanese and Simplified Chinese through `app/static/i18n/{ko,en,ja,zh-CN}.json` and `app/static/i18n.js`. Add matching semantic keys in all four resources when interface text changes; do not hardcode translated UI strings in HTML or JavaScript. Preserve English fallback, locale detection, `audioToolkit.locale` in localStorage and document-language updates. Preserve Light, Dark and System themes, `audioToolkit.theme` in localStorage, OS appearance changes, semantic CSS tokens and Canvas redraw. Browser recent-result references are kept in sessionStorage; Undo/Redo state and server job state are not durable browser storage. Do not rebuild the editor when presentation settings change.

## Security and CSP

The default application bind is localhost. API routes have no user authentication or per-user isolation; review access control, TLS, request limits, privacy and reverse-proxy headers separately before public exposure. Keep upload size and format checks, UUID path validation, FFmpeg argument-list execution, process timeouts and safe file responses. `app/security.py` sends X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy when enabled. `CSP_MODE` accepts `off`, `report-only` and `enforce`, with `report-only` as the source default. The editor policy starts with `default-src 'none'`, allows same-origin scripts/styles/fetch and blob audio, and forbids inline script/style attributes and workers. Do not add `unsafe-inline`, `unsafe-eval` or broad origins to fix UI problems. HSTS and any COOP/COEP/CORP headers are left to the deployment proxy; inspect the final public response before claiming coverage. FastAPI documentation routes use a separate policy when enabled.

## Verification restrictions

**Do not execute Python tests, pytest, unittest, Playwright, Selenium, browser automation or automated audio-processing experiments.** Do not install packages, start a test server, restart Uvicorn/systemd/Nginx, inspect live user audio, or alter production configuration for routine agent work. The owner manually verifies browser behavior. Static source inspection, non-executing syntax review and documentation consistency checks are allowed. Do not claim tests, Windows logon startup or browser behavior passed when they were not run. If the user separately authorizes a specific verification action, report the exact command and outcome, distinguishing static checks from runtime evidence.

## Documentation maintenance and reporting

Keep [README.md](README.md), [Windows Auto-Start](docs/WINDOWS_AUTOSTART.md), `.env.example`, the actual routes and `CHANGELOG.md` consistent. Separate Linux, Windows PowerShell and macOS commands. Confirm every documented config key, endpoint, format, storage path and relative link from current source. Treat the public repository and v1.0.0 release links as existing release references. The published assets currently use the filenames `audio-toolkit-v0.1.0.tar.gz` and `audio-toolkit-v0.1.0.zip` even though the release tag is `v1.0.0`; preserve those URLs unless an authorized release maintenance task changes them. Report files changed, source-backed facts, checks actually performed, unverified behavior and the owner's remaining manual checks. For documentation-only tasks, do not modify application source.

## GitHub and release restrictions

The repository and the v1.0.0 release already exist. AI agents must not automatically create commits, push to GitHub, force-push, rewrite tags, publish releases, modify release assets, or deploy. Each action requires explicit authorization. Do not rename, replace, upload or delete the current v1.0.0 assets merely to correct their `v0.1.0` filenames; future releases should use consistent versioned filenames. Preserve uncommitted user changes. If the working directory is not a Git repository, continue without initializing one. The actual license is [MIT](LICENSE); do not replace or reinterpret it without a specific request.
