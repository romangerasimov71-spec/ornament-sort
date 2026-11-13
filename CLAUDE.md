# Новогодняя сортировка (Ornament Sort) — правила игры для Claude

Это правила самой игры. Они главнее общих правил студии во всём, что касается
игры (механика, вид, звук, уровни). Решения Романа — в `docs/decisions.md`,
их **не переделывать обратно** без его прямой просьбы.

## Что за игра
Спокойная головоломка-сортировка. Ёлочные шары лежат в подарочных коробках
вперемешку. Нажми на коробку — берёшь верхний шар (или верхнюю группу шаров
одного цвета), нажми на другую — кладёшь туда. Класть можно только на шар
того же цвета или в пустую коробку. Цель — в каждой коробке один цвет.
85 уровней, сложность растёт (больше цветов, меньше свободного места).

## Где что лежит
- `index.html` (корень) — полная игра. Запускается как обычные статичные
  файлы (GitHub Pages, любой веб-сервер).
- `js/game.js` — игра, `js/rules.js` — правила и решатель, `js/levels-data.js`
  — уровни (генерирует `tools/generate-levels.js`, проверяет
  `tools/verify-levels.js` — все уровни должны быть проходимыми).
- `js/audio.js` — звук, `js/i18n.js` — тексты RU/EN, `css/style.css` — вид.
- `js/analytics.js` — отметки статистики через Bridge (список событий — `docs/analytics.md`,
  проверка — `tests/analytics.js`). `GAME_VERSION` в начале `js/game.js` поднимать к каждой
  новой сборке для площадок.
- `release/<площадка>/` — пакет к выкладке (Playgama, ВК, ОК, Яндекс); архивы собирает
  `node tools/build-platform.js`.
- `audio/` — звуки CC0, список авторов в `CREDITS.md`.
- `prototype/index.html` — одобренный прототип (5 уровней, один файл).
  Оставлен как образец, не менять и не пересобирать: `tools/build-prototype.js`
  берёт код из текущего `js/game.js`, и прототип изменится.
- `docs/screenshots/` — скриншоты для витрины.
- `tests/` — автопроверки в браузере (как запускать — `tests/README.md`).
- `kits/ads-test/` — набор проверки рекламы (многоразовый, для любой игры на Playgama Bridge);
  адаптер этой игры — `tests/ads-adapter.js`. Запуск — в `kits/ads-test/README.md`.

## Технические правила
- HTML5 без движка: чистый JS, CSS, canvas. Всё лежит в репозитории, никаких
  внешних ссылок, шрифтов, аналитики.
- Playgama Bridge SDK (`playgama-bridge.js` из npm, `playgama-bridge-config.json`).
  Bridge грузится первым и инициализируется до игры.
- Сохранение — только через `bridge.storage` (никакого localStorage в игре):
  одно чтение при старте, запись только при прохождении уровня, смене настроек
  и выборе уровня в окне «Уровни» (чтобы после перезагрузки открыть его же).
- Язык — сначала параметр запуска ВК/ОК `vk_language` (или `language`) из адреса, иначе `bridge.platform.language`:
  `ru`/`uk`/`be`/`kk` → русский, иначе английский; в ВК/ОК без параметра — русский (12 ноя, проверка ВК: Bridge 2.4.1 не читает `vk_language`).
- Строка «Поддержка и новинки: …» в Настройках — только в ВК/ОК (`SUPPORT` в `game.js`): в ОК — ok.ru/group/70000061487179, во ВК — vk.com/club243202759 (правило студии 13 ноя: в ОК ни vk.com, ни «ВКонтакте»).
- ВК: при `VKWebAppViewHide` звук и музыка глохнут, при `VKWebAppViewRestore` возвращаются (подписка на VK Bridge в `game.js`).
- Запуск: если Bridge не ответил за 8 с (unpkg.com недоступен), игра стартует без него.
- Графика рисуется кодом. Никаких эмодзи вместо иконок.
- Higgsfield (ИИ-картинки) — только если Роман согласится на конкретную генерацию.
- Звук — только настоящие файлы CC0 (не синтез в коде), каждый записан в `CREDITS.md`.
- Клавиша Esc в игре не используется.
- Перед выкладкой: `node tools/verify-levels.js` и проверка по
  `get_game_checklist` Playgama.

## Сборка к выкладке
`node tools/build-release.js` — кладёт в `dist/ornament-sort/` только файлы игры
(index.html, css/, js/, нужные звуки из audio/, playgama-bridge.js,
playgama-bridge-config.json) и делает архив `dist/ornament-sort.zip`
(index.html в корне архива). Скрипт сам проверяет: нет localStorage в коде игры,
нет тестов/документов/прототипа, только латинские имена, все файлы на месте.
Папка `dist/` в git не попадает. Этот архив и загружается на площадку.

## Android / RuStore
- `android/` — приложение-обёртка: одна Activity с WebView на весь экран (портрет и альбом), игра из assets по
  `https://appassets.androidplatform.net/assets/www/index.html` (WebViewAssetLoader, не file://), без разрешений
  (даже INTERNET). Пакет `ru.german71.ornamentsort`, minSdk 24, targetSdk 35, versionName берётся из `GAME_VERSION`
  в `js/game.js`; versionCode — 1 (для каждой новой загрузки в RuStore поднимать: `-PversionCode=N` или в `app/build.gradle`).
- Признак приложения — `OrnamentSortAndroid/<версия>` в user agent WebView (`ANDROID` в `js/game.js`): нет рекламы
  (ни «+1 коробка», ни межуровневой), нет строки «Поддержка: vk.com». «Назад» — `OSGame.back()` (закрывает окно
  настроек / уровней; если открытого окна нет — выход); свернули приложение — `OSGame.appPause(true)` (пауза и тишина).
  Проверка — `tests/android.js`. В ВК/ОК/Playgama/Яндекс признака нет, там всё как было.
- APK собирает GitHub Actions (`.github/workflows/android.yml`) при пуше в `main` (android/, js/, css/, audio/,
  index.html, Bridge) или вручную (Run workflow): `tools/build-release.js` → копия `dist/ornament-sort/` в
  `android/app/src/main/assets/www/` (в git её нет) → Gradle. Готовый APK кладётся в ветку **`rustore-build`**:
  `apk/ornament-sort-<версия>-<release|debug>.apk`, рядом `build-info.txt` (разрешения, подпись) и `apk/SHA256.txt`.
  Забрать: `git fetch origin rustore-build && git show origin/rustore-build:apk/<файл> > <файл>`. Упала сборка —
  хвост лога в `build-log.txt` той же ветки. APK в `main` не коммитить.
- Подпись: секреты репозитория `KEYSTORE_BASE64` (файл .jks в base64), `KEYSTORE_PASSWORD`, `KEY_ALIAS`
  (пароль ключа = пароль хранилища). Есть все три — собирается release, нет — debug (только проверить сборку,
  в RuStore debug не загружают). Ключ хранить у Романа: тем же ключом подписываются все обновления.
- Локально (нужен Android SDK): скопировать игру в assets как в workflow, затем `cd android && ./gradlew assembleDebug`.
- Иконки: `python3 android/tools/make_icons.py` (из `release/vk/assets/icon-576x576.png`). Карточка RuStore —
  `release/rustore/` (тексты, иконка 512, скриншоты — `release/_src/capture-rustore.js`).

## Уровни
- `node tools/generate-levels.js` — первичная сборка уровней 5–85 по плану в начале
  файла (уровни 1–4 не трогает). Внимание: он затрёт подбор `tune-levels`, поэтому
  после него всегда запускать `tune-levels.js` снова.
- `node tools/tune-levels.js` (около 20 минут) — подбирает уровни по РЕАЛЬНОЙ
  трудности: модель живого игрока `tools/human-model.js` (взята у проверяющего)
  играет каждым уровнем 30 раз. Передышки (8, 12, 20, 30, 37, 44, 52, 61, 65, 72,
  решение 7) — лёгкие, в тупик ведёт не больше половины первых ходов. 50–75 —
  трудность растёт, наборы коробок чередуются. Финал 76–85 — по возрастанию
  трудности, 85-й самый трудный, но проходимый.
- После любой правки уровней: `node tools/verify-levels.js` и `node tests/play-all.js`.
