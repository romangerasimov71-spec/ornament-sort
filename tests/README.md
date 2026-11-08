# Tests (Playwright, Chromium)

Serve the repo root as static files, then run:

    python3 -m http.server 8765 --bind 127.0.0.1 &
    node tools/verify-levels.js   # every level can be solved
    node tests/flow.js            # main flow: tutorial hand, keyboard, undo/restart, saves, settings, level select, pause, ads
    node tests/shots.js           # screenshots + overlap/fit checks at 5 screen sizes (RU and EN) -> tests/out/
    node tests/play-all.js        # plays all 85 levels in the browser
    node tests/review.js          # review rounds 1-3 regressions (incl. a silent platform, touch zones); rewarded ads via tests/fakeads.js (a realistic fake platform)
    node tests/gap.js             # the hint / dead-end line keeps 6 px above the buttons at every size
    node tests/perf.js            # fps and main-thread load at 390x844@2, 1366x768@1, 1920x1080@2

Ads test kit (rewarded: watched / closed / failed / silent / late; interstitial: shown / failed / silent):

    node kits/ads-test/run.js --url http://127.0.0.1:8765/index.html --adapter tests/ads-adapter.js

`kits/ads-test/` is reusable for any game on Playgama Bridge (README in Russian there); `tests/ads-adapter.js`
says how to press "+1 box" in this game and how to count the reward.

Release package check: `node tools/build-release.js`, then serve `dist/ornament-sort/` and run
`GAME_URL=http://127.0.0.1:8766/index.html node tests/flow.js`.

`GAME_URL` changes the address. Requires `playwright` with Chromium.
