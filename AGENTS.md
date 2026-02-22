# AGENTS.md

Guidance for coding agents working on `midiclock`.

## Project intent

- `midiclock` is a lightweight Web MIDI app that displays BPM per connected MIDI input.
- Keep the runtime stack simple: plain HTML + CSS + TypeScript-compiled JS.
- Avoid adding runtime third-party dependencies.

## Source vs deploy workflow

- Edit source files:
  - `index.html`
  - `src/main.ts`
  - `src/style.css`
- Do not manually edit files in `deploy/`; it is generated output.
- Build with:
  - `npm run build`
- Build output for upload must be flat (no subdirectories):
  - `deploy/index.html`
  - `deploy/style.css`
  - `deploy/main.js`

## Important HTML conventions

- Keep the Waveformer placeholder comments in `index.html`:
  - `For www.waveformer.net` comments in document top/head/body/end.
- Header content requirements:
  - App title: `MIDI Clock by Waveformer`
  - Upper-right source link text: `Source code on github`
  - Source link URL: `https://github.com/thammer/midiclock`

## CSS / embedding constraints

- Styles are intentionally scoped under `#midiclock-app` to avoid leaking into host pages.
- Keep a minimal `body` style for dark background (`margin: 0`, dark `background`) so uncovered page area is not white.
- Do not reintroduce global `line-height` on `body` (it interfered with embedding host pages).
- Do not force `min-height: 100vh` on app root unless explicitly requested (it caused unwanted vertical scrollbars).

## Web MIDI behavior notes

- Device list should update on connect and disconnect.
- Only treat ports with `input.state === "connected"` as active.
- Reattach `onmidimessage` handlers during input refresh (input objects may be replaced while IDs remain stable).
- BPM updates depend on receiving MIDI clock status byte `0xF8`.

## Troubleshooting notes

- If devices are listed but BPM does not update, verify clock messages are arriving and handlers are attached.
- Chrome Web MIDI can occasionally get into a stale state; tab/browser restart may be required.

## Documentation conventions

- Keep `docs/plan-transcript.md` updated by appending each new user prompt in sequence.
- Keep project plan in `docs/midiclock.plan.md` if it is updated.
