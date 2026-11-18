# Audio Toolkit

**Audio Toolkit v1.0.0 — Initial Public Release**

A local-first, self-hosted audio conversion and editing toolkit powered by Python, FastAPI, Uvicorn, and FFmpeg.

Audio Toolkit runs on your own computer or server. The same FastAPI application and Uvicorn entry point serve development and normal local operation; development can add `--reload`, while normal operation does not need it. A local PC needs no separate Nginx or Apache server, Docker, cloud conversion service, or external database. A reverse proxy is optional for an intentionally remote deployment.

The source code and release archives are publicly available from GitHub. The release tag is `v1.0.0`; the two published archive filenames retain their original `v0.1.0` names and are linked exactly as published below.

## Project links

- [Repository](https://github.com/glitter-node/audio-toolkit)
- [Official v1.0.0 release](https://github.com/glitter-node/audio-toolkit/releases/tag/v1.0.0)
- [TAR.GZ download](https://github.com/glitter-node/audio-toolkit/releases/download/v1.0.0/audio-toolkit-v0.1.0.tar.gz)
- [ZIP download](https://github.com/glitter-node/audio-toolkit/releases/download/v1.0.0/audio-toolkit-v0.1.0.zip)
- [README](README.md)
- [Windows Auto-Start](docs/WINDOWS_AUTOSTART.md)
- [Agent instructions](AGENTS.md)
- [MIT License](LICENSE)

## Choose a workflow

- Upload one audio file to inspect it, then play, navigate, zoom, and select on the browser waveform.
- Trim or remove the selection, optionally applying a short crossfade at a removal boundary. Convert the full audio, adjust volume and fades, or merge the active file with additional files.
- Follow an FFmpeg job through status updates, cancel it, preview or download the output, and load an available result back into the editor.

The waveform is decoded in the browser for editing and navigation. **FFmpeg on the host produces the downloaded audio**; a waveform preview alone does not verify output timing or sound quality.

## Features

Upload and inspect audio with FFprobe; view a waveform with a time ruler and playhead; zoom, seek, auto-scroll and select with draggable boundaries; play and loop a selection; trim or remove a selection; convert, merge, adjust volume and apply fades. Removal offers 0, 10, 20, 50 and 100 ms crossfade choices, with 20 ms selected by default. The FFmpeg filter caps the actual overlap near short selections or file edges, so output duration should be checked with FFprobe rather than assumed from the selected times alone.

Input extensions accepted by the API are MP3, WAV, M4A, AAC, FLAC, OGG, Opus and WebM; FFprobe must detect a usable audio stream. Output choices are MP3, WAV, FLAC, OGG, Opus and M4A. Actual decoding and encoding depend on the installed FFmpeg build. The application does not expose explicit bitrate or sample-rate controls; FFmpeg chooses codec defaults. Processing re-encodes output, so repeated lossy edits can reduce quality.

Jobs provide progress through Server-Sent Events (SSE), cancellation and a configurable timeout. Preview, download and edit an available processed result. Browser Undo/Redo tracks editor state, while recent result references are stored in the current browser tab. The interface has Korean, English, Japanese and Simplified Chinese translations, Light/Dark/System themes, keyboard shortcuts and a responsive layout.

## Technology stack and requirements

| Part | Current implementation |
| --- | --- |
| Backend | Python, FastAPI, Pydantic settings, Uvicorn |
| Audio processing | Installed `ffmpeg` and `ffprobe` executables |
| Frontend | HTML, external CSS, vanilla JavaScript and JSON translations served by FastAPI |
| Job state | Process-local memory; temporary audio files on disk under `DATA_DIR` |
| Database | None required by the current implementation |

Use **Python 3.11 or newer as the project's documented baseline**. The repository does not declare `requires-python` or an enforced minimum in its dependency file, and compatibility with every later interpreter or operating-system build is unverified. Use an interpreter with `venv` and `pip`, a current browser, and a writable data directory. Install `ffmpeg` **and** `ffprobe` on `PATH`; verify both separately with `ffmpeg -version` and `ffprobe -version`. Node.js is not required to run the application.

| Operating system | FFmpeg installation guidance | Verification status for this documentation work |
| --- | --- | --- |
| Linux | Use the distribution's FFmpeg package and ensure it includes `ffprobe`. | Source-reviewed; a fresh native installation was not run. |
| Windows 10/11 | Install a trusted FFmpeg build and add its `bin` directory to the user's `PATH`. | Source-reviewed; Windows installation was not run. |
| macOS Intel | Install FFmpeg with the architecture-matched Homebrew (`brew install ffmpeg`) or another trusted package source. | Source-reviewed; macOS installation was not run. |
| macOS Apple Silicon | Use native Apple Silicon Python and FFmpeg where available; check both tools in that shell. | Source-reviewed; macOS installation was not run. |

## Install and run

For a new installation, either clone the [public repository](https://github.com/glitter-node/audio-toolkit) or download one of the published archives from the [v1.0.0 release](https://github.com/glitter-node/audio-toolkit/releases/tag/v1.0.0). The archive filenames are `audio-toolkit-v0.1.0.tar.gz` and `audio-toolkit-v0.1.0.zip` because the published assets retain their original names; do not infer a different download URL. After extraction, locate the directory containing `app/main.py`, `requirements.txt`, and `.env.example`, then use that directory as the project root. Preserve an existing `.env`, `data/`, and virtual environment when updating an installation. The commands below create `.venv` for a **new** installation. Port **8012** is the current setting and a consistent example in these commands, not an automatically applied Uvicorn port. Pick another free port if needed and use it consistently.

### Linux

```bash
cd /path/to/audio-toolkit
python3 --version
ffmpeg -version
ffprobe -version
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8012
```

Some Linux distributions package `venv` separately. Install it using that distribution's package manager if environment creation fails.

### Windows 10/11 — PowerShell

```powershell
Set-Location (Read-Host "Enter the full path to the Audio Toolkit project")
py --list
ffmpeg -version
ffprobe -version
py -3.11 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8012
```

If Python 3.11 is not installed, use an installed 3.11+ interpreter instead. Calling `.venv\Scripts\python.exe` directly avoids activation and any machine-wide PowerShell execution-policy change. See [Windows Auto-Start](docs/WINDOWS_AUTOSTART.md) for an optional current-user logon task.

### macOS Intel

```bash
cd /path/to/audio-toolkit
uname -m
python3 --version
brew install ffmpeg
ffmpeg -version
ffprobe -version
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8012
```

On an Intel Mac, `uname -m` normally reports `x86_64`. Use a Python 3.11+ interpreter and an Intel-compatible FFmpeg build. `brew install ffmpeg` is an example for an existing Homebrew installation; Homebrew itself is optional.

### macOS Apple Silicon

```bash
cd /path/to/audio-toolkit
uname -m
python3 --version
brew install ffmpeg
ffmpeg -version
ffprobe -version
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8012
```

On Apple Silicon, `uname -m` normally reports `arm64`. Prefer native Apple Silicon Python 3.11+ and FFmpeg; check that the commands resolve to the intended architecture. Codec and Python package availability can differ between Intel and Apple Silicon; no macOS codec matrix has been verified for this document.

Open `http://127.0.0.1:8012/` on the same host. Press Ctrl+C to stop a foreground process. For development, add `--reload` to the same Uvicorn command. Normal local operation omits `--reload` and needs no separate web server. Run from the project root because `.env` and the default `./data` path are relative to the working directory. Use **one Uvicorn worker**: queue state and processing limits are process-local.

## Configuration

Settings come from environment variables and an optional `.env` in the working directory. The application starts without `.env`. Use [`.env.example`](.env.example) as a reference; copy it only for a new installation and never overwrite an existing `.env`. `APP_HOST` and `APP_PORT` are settings values, but the documented Uvicorn CLI does **not** read them automatically: pass `--host` and `--port` explicitly.

| Variable | Default in source | Purpose |
| --- | --- | --- |
| `APP_NAME` | `Audio Toolkit` | FastAPI application title |
| `APP_HOST` / `APP_PORT` | `127.0.0.1` / `8012` | Reference host/port settings; specify CLI bind options explicitly |
| `APP_DEBUG` | `false` | Reserved setting; current entry point does not pass it to FastAPI |
| `DATA_DIR` | `./data` | Runtime uploads and outputs, relative to the working directory |
| `MAX_UPLOAD_MB` | `200` | Maximum bytes read for one upload |
| `MAX_PENDING_JOBS` | `8` | Maximum active queued/running jobs in this process |
| `JOB_TIMEOUT_SECONDS` | `300` | FFmpeg processing timeout |
| `PROBE_TIMEOUT_SECONDS` | `30` | FFprobe inspection timeout |
| `FILE_RETENTION_HOURS` | `24` | File and terminal-job retention threshold |
| `PUBLIC_SITE_URL` | empty | Optional root origin for public canonical metadata, robots and sitemap |
| `SECURITY_HEADERS_ENABLED` | `true` | Application-generated security headers |
| `CSP_MODE` | `report-only` | `off`, `report-only`, or `enforce` |
| `CSP_REPORT_URI` | empty | Optional same-origin reporting path; no receiver is bundled |
| `STT_BASE_URL` / `STT_API_KEY` | empty | Reserved settings; no speech-to-text feature is wired into the current routes |

## Application routes and processing workflow

The UI is served at `/`, assets at `/static/`, and API routes under `/api/`. `GET /api/health` reports application status and whether FFmpeg/FFprobe are on `PATH`; it does not prove editing works. `POST /api/upload` stores a validated audio upload and returns a file ID; `GET /api/probe/{file_id}` returns FFprobe metadata. The UI uses `POST /api/jobs` for conversion, trim, removal, effects and merge, then `GET /api/jobs/{job_id}`, `GET /api/jobs/{job_id}/events` and `POST /api/jobs/{job_id}/cancel` for status, SSE and cancellation. `GET /api/download/{output_id}/{extension}` serves an available result; `POST /api/reuse` copies one back to uploads for more editing. Synchronous `/api/convert`, `/api/trim`, `/api/effects` and `/api/merge` routes also remain available.

The merge request accepts **2–10 distinct files** including the current audio. One FFmpeg worker runs jobs at a time; a full queue rejects new work. Queued jobs may be cancelled, running FFmpeg processes receive termination, and incomplete output is removed. Job snapshots live in process memory: restarting the app loses job status, although retained files remain until cleanup. SSE sends snapshots until a terminal state. On Windows, subprocess termination uses the process handle; child-process behavior still needs platform-specific verification.

## Operations and security

Uploads are limited by bytes and checked with FFprobe for an audio stream. The browser limits waveform decoding to 64 MB to avoid excessive memory use; the API can process larger files within the upload limit. The application stores uploads in `DATA_DIR/uploads` and results in `DATA_DIR/outputs`. Multipart handling may also use the host's temporary directory while a request is being received. A cleanup task runs every five minutes and deletes stored files older than the configured retention period, except paths used by active jobs. Cleanup is periodic rather than immediate, and files can remain after a server restart until it runs again. Job status is lost on restart. Expired files return 404. Local use avoids sending audio to a third-party conversion service, but the local app temporarily persists uploaded and processed files. Processing re-encodes audio, including lossy output formats, so repeated MP3/AAC edits can reduce quality. Choose WAV or FLAC for intermediate edits. Encoder availability depends on the installed FFmpeg build.

The default server binds to localhost. APIs have no user authentication or per-user isolation. For external access, place an authenticating reverse proxy or VPN in front, enforce body-size and rate limits there, and disable proxy buffering for `/api/jobs/*/events`. Use TLS. Restrict access to the data directory and provision disk space for uploads and generated results. CORS is not enabled by default. Do not expose this API directly to the public internet.

### Security headers and CSP rollout

FastAPI adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` to HTTP responses. The same response boundary covers the root page, static assets, JSON, uploads, downloads, SSE, 404 and generated 500 responses without changing their bodies, content types or streaming behavior. It does not add HSTS, COEP, COOP or CORP; coordinate those existing public headers with the reverse proxy.

`SECURITY_HEADERS_ENABLED=true` enables the application headers. `CSP_MODE` accepts only `off`, `report-only`, or `enforce`; an invalid value prevents settings from loading. The default remains `report-only` for a staged rollout. `off` emits no application CSP while keeping the other four headers. `report-only` emits only `Content-Security-Policy-Report-Only` and does not block resources. `enforce` emits only `Content-Security-Policy` and blocks violations. Report-Only may not satisfy MDN HTTP Observatory's CSP scoring requirement. `SECURITY_HEADERS_ENABLED=false` disables all application-generated security headers, for deployments where the reverse proxy owns them. Do not edit the production `.env` or restart the service until the rollout is approved.

`CSP_REPORT_URI` is optional and accepts only a same-origin absolute path such as `/csp-reports`. The application does not implement that endpoint. Configure an independently reviewed receiver with request-size and rate limits before setting it; otherwise leave it empty. A report URI is not needed to inspect browser console violations.

`MAIN_CSP` starts with `default-src 'none'` and permits only same-origin scripts, styles, images, fonts, fetch and SSE; `data:` images; `blob:` audio playback; and the same-origin web manifest. It sets `base-uri 'none'`, `worker-src 'none'`, and both script and style attribute sources to `'none'`. The editor uses neither a base element nor workers. It forbids object embeds and framing. The main policy contains no `unsafe-inline`, `unsafe-eval`, wildcard origin or third-party host. The browser theme initializer remains an external same-origin script, and waveform pointer cursor changes use a CSS class. All application scripts are fixed, external and locally hosted; there are no inline executable scripts or runtime-generated scripts. Hashes or per-response nonces could restrict the script set further, but would add asset-hash maintenance or dynamic HTML handling without solving a current inline-script requirement. No reusable static nonce or `strict-dynamic` is used.

FastAPI's enabled `/docs`, `/redoc` and OAuth redirect page use a separate `DOCS_CSP`. FastAPI generates inline documentation initialization code and loads its UI assets from jsDelivr, so that policy permits those sources only on those documentation paths. It does not apply to the editor or API paths. If documentation routes are disabled, the separate policy is unused. Review the generated documentation and its CDN dependencies during manual enforcement verification; the application itself requires no external resources.

When using Nginx, choose one authority for each header. FastAPI generates CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy when enabled. The application's middleware leaves HSTS, COOP, COEP and CORP untouched; these may be managed by the reverse proxy. The reverse proxy can add, replace or suppress headers, so inspect the final public response instead of inferring it from FastAPI configuration. Multiple enforced CSP policies combine and can unexpectedly block resources. If Nginx already sends CSP, coordinate or remove its policy before enabling application enforcement. If Nginx owns all security headers, set `SECURITY_HEADERS_ENABLED=false` and configure the equivalent headers there. Do not emit duplicate HSTS or conflicting frame policies. Inspect root, redirects, errors, static assets, API, downloads and SSE separately.

To move from Report-Only to enforcement, first review public console violations and proxy header ownership. Then set `CSP_MODE=enforce` in the intended environment during a scheduled change and manually reload the application. Confirm one enforced CSP and no conflicting proxy CSP, repeat the feature checks below, and rescan with MDN HTTP Observatory if publicly deployed. If a feature breaks, record the exact blocked URL and directive, restore `CSP_MODE=report-only`, manually reload, and make the narrowest source or policy correction. Do not add `unsafe-inline` or wildcard sources to mask violations. The deployed value of `CSP_MODE` cannot be established from this source review; no live response was inspected for this document.

For a manual rollout, inspect the final response headers and confirm the CSP header matches the **configured** mode along with the four other application headers when enabled. Open browser developer tools and review CSP violations while checking Light, Dark and System themes; all four languages; upload, inspection, waveform, playback, dragging, trim, removal with 20 ms crossfade, effects, merge, SSE, cancellation, processed playback, recent results, favicon, robots and sitemap. Check static resources and error responses for headers. Switch to enforce only after resolving report-only violations, repeat the browser checks, then rescan with MDN HTTP Observatory if publicly deployed. The application and proxy responses were not exercised for this documentation task.

Manual CSP checklist:

1. Inspect final public headers on the root page, static files, API responses and errors.
2. Confirm the intended `Content-Security-Policy-Report-Only` or `Content-Security-Policy` header for the configured mode.
3. Check for duplicate CSP or HSTS headers and conflicting frame policies.
4. Open browser developer tools and inspect the console and network panel.
5. Review CSP violation reports and resolve unexpected resource loads.
6. Check Light, Dark and System themes.
7. Check Korean, English, Japanese and Simplified Chinese translations.
8. Upload and inspect audio.
9. Confirm waveform rendering and selection visibility.
10. Confirm playback, including a processed result and blob-based preview.
11. Drag the selection boundaries.
12. Trim and remove a selection.
13. Repeat removal with a 20 ms crossfade.
14. Apply effects and merge files.
15. Confirm SSE job progress updates.
16. Cancel a running job.
17. Play and download a processed result.
18. Preview and edit recent results.
19. Check favicon, manifest, robots and sitemap resources.
20. If moving from report-only, set `CSP_MODE=enforce` during an approved deployment change, manually reload the application, inspect the final policy and repeat the checks. If blocked, record the violated directive and return to `report-only` before a narrow fix.
21. For a public deployment, rescan with MDN HTTP Observatory and compare with its prior deployment results.

## Site assets and public URL

The root page is served at `/`, while JavaScript, CSS and translation files remain under `/static/`. Favicons are available at `/favicon.svg` and `/favicon.ico`; the 180×180 touch icon is `/apple-touch-icon.png`. `/site.webmanifest` describes the standalone display, colors and icon files. There is no service worker or offline mode.

`/robots.txt` permits the main page and static assets and asks crawlers to avoid `/api/`, `/docs`, `/redoc` and `/openapi.json`. This is advisory and does not control access. `/sitemap.xml` lists only the root page. It does not list API calls, uploads, results or language variants because there are no separate indexable pages for those.

Set `PUBLIC_SITE_URL=https://audio-toolkit.glitter.kr` in `.env` for the public deployment. This adds a Sitemap line to robots.txt and canonical and Open Graph URL tags to the root HTML. It also makes the sitemap root URL follow that configured origin. Leave the setting blank for a local-only deployment: robots.txt will not advertise the public domain, and the HTML will omit canonical and OG URL tags. The source sitemap file uses `https://audio-toolkit.glitter.kr/` as its canonical URL; a local server still serves that file if `/sitemap.xml` is requested directly. The setting accepts a root HTTP or HTTPS origin without a path, query or fragment.

To verify manually, open the root page and inspect the favicon in a browser tab, the touch icon on a mobile device, and the manifest in developer tools. Request `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/site.webmanifest`, `/robots.txt` and `/sitemap.xml` and confirm their content types and content. Repeat with `PUBLIC_SITE_URL` unset and set; verify that only the configured deployment advertises the Sitemap line and canonical/OG URL. This checklist has not been run by browser automation.

## Keyboard controls

Outside editable controls: Space plays/pauses; P plays selection; L toggles looping; arrows seek one second (Shift: 0.1 second); brackets move the start boundary (Shift: end boundary); plus/minus zoom; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes; `?` shows help. Undo/Redo changes editor state only, not server files.

## Themes and languages

The header offers Light, Dark and System themes. System follows `prefers-color-scheme` and responds to operating-system appearance changes. The preference is saved as `audioToolkit.theme` in localStorage; the default is System. If storage is unavailable, the current page keeps the preference in memory. CSS uses semantic color tokens, and the waveform Canvas reads the same tokens when redrawn.

The interface supports Korean (`ko`), English (`en`), Japanese (`ja`) and Simplified Chinese (`zh-CN`). The saved `audioToolkit.locale` preference takes priority over browser languages; otherwise the first supported browser language is selected, then English. `ko-*`, `en-*` and `ja-*` normalize to their base locale. `zh-CN`, `zh-SG` and `zh-Hans*` use Simplified Chinese. Other Chinese variants, including `zh-TW` and `zh-HK`, fall back to English unless another supported browser language follows. This avoids presenting Simplified Chinese as Traditional Chinese. Changing language updates text and history timestamps without reloading the editor.

Translations live in `app/static/i18n/{en,ko,ja,zh-CN}.json`. Add a semantic key with the same path to all four files, then reference it with `data-i18n` in HTML or `t("section.key")` in JavaScript. English is the fallback when a locale key is missing; an unknown key displays `[section.key]` for diagnosis. To add a locale, create its JSON file, add it to the supported list and normalization logic in `app/static/i18n.js`, and add it to the language selector. API error detail strings and job messages remain compatible English values and are mapped to localized UI messages. Unknown backend errors display a localized generic message.

### Manual browser verification

1. Switch Light → Dark → System; change OS appearance and confirm System follows it.
2. Reload and confirm the selected theme remains selected.
3. Switch Korean → English → Japanese → Simplified Chinese; reload and confirm language persistence.
4. Inspect labels, buttons, accessibility names, errors and queued/running/completed/cancelled job messages in each language.
5. Inspect narrow mobile layouts with long Korean, Japanese and Chinese labels.
6. Confirm waveform background, bars, selection boundaries and playhead change color immediately.
7. Start playback with a selection and zoom, switch theme and language, then confirm playback position, selection, zoom, loop and auto-scroll remain intact.
8. Confirm keyboard shortcuts and Undo/Redo still work.
9. Remove a selection with Crossfade 20 ms, then use **Edit this result** and confirm editing continues.
10. Confirm recent history dates use the selected locale and the browser console has no new errors.

Older history entries saved before localized timestamps may retain their original date text if the browser cannot parse it. The theme and locale behavior described here still requires manual browser verification for a new installation.

## Workspace design

The interface uses a centered application shell with separate upload, metadata, editor, effects, merge, result and history panels. The waveform workspace has a distinct inset surface while related toolbar controls wrap together on smaller screens. Theme-specific elevation tokens (`--shadow-xs` through `--shadow-lg`, `--shadow-hover` and `--shadow-inset`) define the depth of panels and controls. Primary, secondary, ghost and danger buttons share consistent focus and active states. Pointer hover moves supported controls by one pixel; `prefers-reduced-motion: reduce` removes motion while keeping focus visible. Layout rules adapt the toolbars, metadata grid and result actions for tablet and narrow mobile widths.

The metadata panel summarizes format, duration, bitrate, sample rate, channels and file size. A native expandable section retains the FFprobe JSON with the server-side filename removed. Unavailable fields display a localized placeholder. The summary is restored with editor Undo/Redo and updates when the locale changes.

### Workspace manual verification

1. Inspect upload, editor, effects, merge, result and history panels in Light and Dark themes, then switch System with the OS appearance.
2. On a pointer device, check button hover elevation, pressed feedback and disabled controls. Tab through controls to check focus rings.
3. Enable reduced motion in the OS and confirm hover translation stops.
4. Upload audio; check the metadata summary, expanded JSON, waveform rendering and selection handles.
5. Check zoom, auto-scroll, native playback, selection trim and removal with 20 ms crossfade.
6. Apply volume/fade effects, merge files, edit a processed result and use Undo/Redo.
7. Check recent result Preview and Edit actions and confirm timestamps remain readable.
8. Repeat the layout check in Korean, English, Japanese and Simplified Chinese at laptop, tablet, mobile and very narrow widths.
9. Check the browser console for new errors.

This checklist is for the project owner; runtime browser verification was not run for this documentation task.

## Development, verification and troubleshooting

Keep changes small and inspect [AGENTS.md](AGENTS.md) for repository conventions and the current agent verification restrictions. The existing `tests/` directory contains backend and synthetic-audio tests; the following are **commands for a separately authorized verification session**, not checks run during this documentation task:

```bash
python -m compileall -q app
python -m pytest -q
node --check app/static/app.js
```

Integration tests need FFmpeg and FFprobe and generate synthetic WAV audio. These commands were **not executed** for this documentation work. If upload fails, check file format and `ffprobe -version`. If a job fails, check encoder support (`ffmpeg -encoders`) and the timeout setting. If the waveform is unavailable, check browser codec support and the 64 MB browser limit. If a result disappears, check retention and whether the server restarted. The existing integration tests use a 20 ms tolerance for WAV; compressed formats can have encoder delay and padding. Automated boundary measurements cannot establish perceptual click-free output.

The public repository is available for source browsing, issue tracking, pull requests and release downloads. When contributing, describe changes and manual verification clearly, preserve local data, keep all four translations and three themes aligned, and follow the repository's [agent and maintenance guidance](AGENTS.md). The v1.0.0 release assets remain immutable unless an authorized release-maintenance task changes them.

## Known limitations and verification status

- Browser waveform generation rejects files over 64 MB, although the API upload default is 200 MB. Browser codec support and memory use vary by platform.
- FFmpeg encoder availability and compressed-audio timing vary by build and codec; output quality, especially repeated lossy edits, needs listening and FFprobe checks for the actual file.
- Jobs and Undo/Redo are process or page state, not durable server-side history. Browser recent results store references in `sessionStorage`; an expired server result cannot be recovered from that reference.
- The API has no authentication or per-user isolation. Security headers do not by themselves make public hosting safe. Normal local use binds to localhost; remote hosting requires a separate access-control plan.
- Windows Task Scheduler, fresh Linux/macOS installation, browser interactions and public-response headers were **not verified** in this documentation task. The owner should perform the manual browser and OS checks above before public distribution.

## License

[MIT](LICENSE).
