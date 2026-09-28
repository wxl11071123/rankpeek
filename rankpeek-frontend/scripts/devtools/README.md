# Devtools helpers

Small scripts for driving the running Electron dev shell from a terminal or an agent.

## Start the loop

| Terminal | Command | What it does |
| --- | --- | --- |
| 1 | `scripts\dev-backend.bat` | Spring Boot backend on `127.0.0.1:8080` (data root `%LOCALAPPDATA%\RankPeek-dev`) |
| 2 | `npm run dev` | Vite dev server with HMR on `localhost:5173` |
| 3 | `npm run electron:cdp` | Electron window against the dev server, with the DevTools protocol on port 9222 |

`npm run electron:dev` still works for normal development; `electron:cdp` is the same thing plus
`--remote-debugging-port`, which lets tooling screenshot and click the real window.

Flags for `electron:cdp`:

- `--build` rebuilds `dist/main` and `dist/preload` before launching.
- `--software` adds `--disable-gpu --no-sandbox ...`, needed on hosts where the GPU process cannot start.
- `--port <n>` uses a different debugging port (pass the same value to `npm run cdp`).

## Drive the window

```bash
npm run cdp -- targets                       # list windows (main window, OP.GG window)
npm run cdp -- info                          # title, route, viewport size, bridge presence
npm run cdp -- screenshot shot.png           # write a PNG of the current viewport
npm run cdp -- screenshot shot.png --full    # full-page capture
npm run cdp -- eval "document.title"         # run JS in the renderer
npm run cdp -- text ".coach-title"           # innerText of a selector
npm run cdp -- click --selector ".refresh"   # click an element by CSS selector
npm run cdp -- click 120 340                 # click viewport coordinates
npm run cdp -- type "召唤师名"                # insert text into the focused input
npm run cdp -- key Enter                     # Enter/Tab/Escape/Backspace/Arrows
npm run cdp -- nav "#/settings"              # switch route
npm run cdp -- wait ".match-card" 8000       # wait for a selector
npm run cdp -- logs 5000 --reload            # collect console + exception logs during a reload
npm run cdp -- size 1440 900                 # emulate a larger viewport
npm run cdp -- restore                       # un-minimize the app window (see below)
```

A minimized window never produces compositor frames, so `Page.captureScreenshot` would hang forever.
`screenshot` therefore times out after 12s, restores the window through `user32.ShowWindowAsync`,
and retries once; `restore` does that explicitly. This is the reason Electron cannot be driven with
pure CDP window commands: `Browser.getWindowForTarget` / `Browser.setWindowBounds` are not implemented
in Electron.

Options: `--port 9222`, `--window <substring>` (needed for the standalone OP.GG window), `--timeout <ms>`.

Screenshots land wherever you point them; `--full` uses `Page.getLayoutMetrics`, so long pages are captured whole.

## Notes

- The renderer needs `window.electronAPI` (preload bridge); a plain browser tab cannot run the app.
- Main-process code (`src/main/**`) is not hot-reloaded - rebuild with `npm run build:main` and restart.
- Renderer code (`src/renderer/**`) hot-reloads through Vite; `npm run cdp -- screenshot` shows the result.
