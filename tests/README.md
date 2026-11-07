# Tests (Playwright, Chromium)

Serve the repo root as static files, then run:

    python3 -m http.server 8765 --bind 127.0.0.1 &
    node tools/verify-levels.js   # every level can be solved
    node tests/flow.js            # main flow: tutorial hand, keyboard, undo/restart, saves, settings, level select, pause, ads
    node tests/shots.js           # screenshots + overlap/fit checks at 5 screen sizes (RU and EN) -> tests/out/
    node tests/play-all.js        # plays all 85 levels in the browser
    node tests/review.js          # review round 1 regressions; rewarded ads via tests/fakeads.js (a realistic fake platform)
    node tests/perf.js            # fps and main-thread load at 390x844@2, 1366x768@1, 1920x1080@2

Release package check: `node tools/build-release.js`, then serve `dist/ornament-sort/` and run
`GAME_URL=http://127.0.0.1:8766/index.html node tests/flow.js`.

`GAME_URL` changes the address. Requires `playwright` with Chromium.
