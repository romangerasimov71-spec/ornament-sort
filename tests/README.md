# Tests (Playwright, Chromium)

Serve the repo root as static files, then run:

    python3 -m http.server 8765 --bind 127.0.0.1 &
    node tools/verify-levels.js   # every level can be solved
    node tests/flow.js            # main flow: tutorial hand, keyboard, undo/restart, saves, settings, level select, pause, ads
    node tests/shots.js           # screenshots + overlap/fit checks at 5 screen sizes (RU and EN) -> tests/out/
    node tests/play-all.js        # plays all 85 levels in the browser

`GAME_URL` changes the address. Requires `playwright` with Chromium.
