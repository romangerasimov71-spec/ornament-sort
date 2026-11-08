# Playgama: поля формы (на английском, консоль принимает форму на EN)

Название в игре и в форме должно совпадать (правило 3.5.1): **Ornament Sort** (по-русски в игре: Новогодняя сортировка).

| Поле формы | Значение |
|---|---|
| title | Ornament Sort |
| category | `matching` (Matching / Sorting / Unblock; в описании категории прямо названа «сортировка по пробиркам») |
| engine | js |
| supportedLanguages | EN, RU |
| supportedDevices | IOS, ANDROID, DESKTOP |
| isVertical / isHorizontal | оба true (портрет и альбом поддерживаются) |
| distributeEverywhere | true (по навыку; решает Роман, см. README) |
| hasInGamePurchases / leaderboards / multiplayer / social | false / false / false / false |

## description
Sort glass ornaments into gift boxes in this calm, cozy winter puzzle. Tap a box to lift the top ornament, tap another box to drop it there. You can only place an ornament on one of the same color or into an empty box. Fill every box with a single color to finish the level.

85 levels grow from a gentle warm-up to a real brain teaser: more colors, less free room, trickier boxes. Every ornament color has its own pattern, so the game is easy to read for everyone. Finished boxes get a bow and sparkles, and you earn up to three stars on every level.

Undo a move, restart a level, or watch an optional ad for one extra empty box when you are stuck. Your progress is saved automatically. Works on phones, tablets and desktop, in portrait and landscape. English and Russian.

## howToPlayText
Tap a box to lift its top ornament (or the top group of ornaments of the same color). Tap another box to put them there. You can place ornaments only on the same color or into an empty box. Make every box hold one color to win. Use Undo to take back a move, Restart to start the level again, and the optional "Watch ad: +1 empty box" button if you get stuck. Works with touch, mouse and keyboard.

## story
A snow-covered village, a pile of glass ornaments and a table of gift boxes. We wanted a sorting game that feels like decorating a tree: slow, tidy and satisfying, not stressful. The first prototype had five levels; the full game has 85, and the last ten are hard on purpose. Every ornament has its own pattern, so players who cannot tell colors apart can still play. How far can you get before the New Year?

## developerComment
All graphics are drawn in code. Music and sound effects are CC0 recordings (credits in the repository). Progress is saved only through Bridge storage. No purchases, no external links.

## Файлы
- `assets/icon-800x800.png` — иконка (`icon`).
- `assets/cover-landscape-1920x1080-en.png` (и `-ru`) — обложка `preview`.
- `assets/cover-portrait-1080x1920-en.png` (и `-ru`) — обложка `preview_vertical`.
- `assets/screenshots/` — 5 сцен, альбом 1920x1080 и портрет 1080x1920, EN и RU. Загружает Роман в консоли (у инструментов нет загрузки скриншотов).
