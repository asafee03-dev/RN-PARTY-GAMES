# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"משחקי הכיף" (Party Games): a Hebrew-language, real-time multiplayer party-games app built with Expo SDK 54 / React Native 0.81 (new architecture, React Compiler enabled). It ships to iOS, Android, and web from one codebase. Five games: **Alias**, **Codenames**, **Draw**, **Frequency**, **Spy**. Players share a room code (or deep link). Firestore holds all multiplayer state, and there is no custom backend.

## Commands

```bash
npm start              # expo start (dev server)
npm run web            # run in browser
npm run android        # expo run:android (native build; /android is gitignored/generated)
npm run ios            # runs scripts/fix-podfile.js, then expo run:ios
npm run lint           # expo lint (eslint-config-expo, flat config)
npm run build:web      # export web bundle to dist/
npm run deploy         # build:web + firebase deploy --only hosting
```

There is no test suite. Pushing to `main` triggers `.github/workflows/firebase-hosting-merge.yml`, which builds the web bundle and deploys it to Firebase Hosting (project `party-games-c1025`). PRs get preview channels. Native builds go through EAS (`eas.json`; app version comes from `appVersionSource: remote`).

`npm run lint` still reports 8 old errors (undefined `copyRoomCode`/`copyRoomLink`/`setCopied` in dead helper functions of `AliasSetupScreen`, `CodenamesSetupScreen`, `CodenamesGameScreen`, and `__dirname` in `scripts/fix-podfile.js`). Nothing calls those helpers; don't treat them as new failures.

## Architecture

**Entry point:** `index.js` → `App.js` → `src/nav/AppNavigator.js`. `index.js` calls `setupRTL()` before anything renders; `App.js` loads the Rubik fonts (splash stays up until they are ready) and wraps the app in `RTLRoot`. The project was scaffolded from create-expo-app, but it does **not** use expo-router file-based routing: there is no `app/` directory, even though `expo-router` still appears in `app.json` plugins. The README is the untouched Expo template. The root-level `components/`, `hooks/`, `constants/theme.ts` are mostly leftover template code. The real app lives in `src/`, except `constants/adsConfig.ts`, which is live.

**Navigation:** React Navigation native stacks, all with `headerShown: false`. `AppNavigator` holds a root stack with `Home`, `Alias`, `Frequency`, `Codenames`, `Spy`, `Draw`. Each of those is a nested per-game navigator in `src/nav/<Game>Navigator.js`, wrapped in `<GameThemeProvider game="...">` so every screen gets that game's accent. Screens are named `<Game>Home`, `<Game>Room`/`<Game>Setup`, `<Game>Game`. To navigate into a game, use `navigate('<Game>', { screen: '<Game>Room', params: { roomCode } })`. Alias and Codenames enter through `<Game>Setup` rather than `<Game>Room`.

**Deep linking** (`AppNavigator.js` + `src/utils/deepLinking.js`):
- Native: `partygames://join?...` and universal links on `party-games-app.com`.
- Web: URL paths `/game/<game>/room/<code>` or `/join/<game>/<code>`.
- If a `playerName` is already saved in storage, the user goes straight into the room. Otherwise they land on `<Game>Home` with `prefillRoomCode`.
- On web, `onStateChange` rewrites the URL to match the current route.
- Saved navigation state is cleared on every cold start, so the app always opens at Home.

**Game state / Firestore:**
- `src/firebase.js` exports `db`. It uses the named database `"default"` via `initializeFirestore(app, settings, "default")`, so keep that argument. Native forces long polling (the streaming transport stalled for ~10s per request on phones); web uses the default transport.
- Room collections, with the room code as document ID: `GameRoom` (Alias), `CodenamesRoom`, `DrawRoom`, `FrequencyRoom`, `SpyRoom`.
- Read-only content collections: `WordCard`, `DrawWord`, `SpyLocation`, `FrequencyTopic`.
- Field names are snake_case. `FIRESTORE_VERIFICATION.md` documents the per-collection schema, and `FIRESTORE_RULES.txt` is the reference copy of the security rules (deployed manually; not wired into `firebase.json`).
- Screens subscribe with `onSnapshot`. The large `<Game>RoomScreen.js` / `<Game>GameScreen.js` files (1–3k lines) contain most of the actual game flow.
- `src/logic/<game>.js` are pure game-logic modules (camelCase state, no React/Firestore), but screens barely use them: the Alias screens (online and single-phone) use `dealTurnDeck`/`deckWordAt` from `alias.js`, and single-phone Alias/Spy use `aliasLocal.js`/`spyLocal.js`. Check the screen before assuming logic lives in `src/logic`.
- No repeats: Draw and Frequency keep `used_words` / `used_topics` in the room (cleared on a new game) and pick with `pickForGame` from `src/utils/random.js` inside the turn transaction (`arrayUnion` for the new key; when the pool runs out the list restarts without the item just played). Alias deals each team turn a deck of different words, so a word never repeats within a turn.

**Multiplayer write rules (important):** several phones write to the same room at once. Every write that moves the game forward must be a `runTransaction` that re-reads the room and checks it is still in the state the player saw (turn index + round id, `game_start_time`, `turn_start_time`, `round_start_time`, `current_round_id`, or the used-card count), so duplicate presses are no-ops and nothing is overwritten from a stale local copy. Prefer field-path updates (`'red_team.revealed_words'`) or `arrayUnion`/`arrayRemove` over rewriting a whole map/array where Firestore allows it. Round transitions (next round, time-up, random word/topic picks) run only on the "acting host" (`getActingHostName` in `src/utils/gameSync.js`: the host, or the first active player if the host left); other players see a "waiting for X" message. Never start a new game by overwriting state without checking the previous status (see the double-start guards in each `startGame`).

**Shared room utilities:**
- `src/utils/roomManagement.js`: unique room-code generation, plus `setupAllAutoDeletions`, which handles client-side deletion of rooms that are finished, empty, or too old.
- `src/utils/playerJoin.js`: `atomicPlayerJoin`, a transaction-based join/rejoin (safe for several friends joining at once).
- `src/utils/gameSync.js`: acting-host, next-active-player and `markPlayerInactive` helpers.
- `src/utils/serverClock.js`: `serverNow()` is `Date.now()` corrected by this device's offset from the Firestore server clock (measured once per session via `syncServerClock(collection, roomId)`). Use it for every timer and for start timestamps written to Firestore; plain `Date.now()` made phones with a wrong clock show different countdowns. Drive countdowns with `startSecondTicker(startTime, tick)` / `secondsLeft()`, not a plain 1s `setInterval` (each phone's interval ticks at a different point in the second, so displays drifted up to 1s apart).

New room features should go through these utilities rather than reimplementing them.

**Platform splits:** Metro resolves `.native.tsx` / `.web.tsx`. Ads use this pattern: imports of `./Ads` resolve to `Ads.native.tsx` (react-native-google-mobile-ads) or `Ads.web.tsx` (no-op stubs) via Metro's platform extensions; there is no switcher file (a `require()` switcher breaks the dev web bundle). Never import `react-native-google-mobile-ads` outside `Ads.native.tsx`. Ad unit IDs and the `USE_PRODUCTION_ADS` flag live in `constants/adsConfig.ts`. `src/utils/storage.js` wraps localStorage (web) and AsyncStorage (native), with an in-memory fallback. `src/utils/analytics.js` lazily initializes Firebase Analytics (GA4) and is a no-op where unsupported.

**iOS native config:** Firebase needs `use_modular_headers!` in the Podfile. `plugins/with-modular-headers.js` (config plugin, used during prebuild) and `scripts/fix-podfile.js` (run by `npm run ios`) both apply it.

## UI system ("cozy board game night")

Build screens from these; don't hand-style new screens with raw colors, emojis or `GradientButton`-style components (those were removed).

- **Theme** (`src/theme`): `tokens.js` (paper/cardboard/ink palette, spacing, radii, Rubik type scale, tactile depth, shadows), `gameThemes.js` (one accent per game; white text on every `accent` passes WCAG AA), `useGameTheme()` returns the current game's theme. Codenames team colors always come with an icon (`gameThemes.codenames.teams`).
- **UI kit** (`src/ui`, import from `'../../ui'`): `AppText`, `Button`, `IconButton`, `Card`, `Badge`, `PlayerChip`, `ScoreToken`, `TextField`, `Dialog`, `TimerDisplay`, `Screen`, `GameEntryLayout` (shared create/join screen), `TeamPickButton`, `Icon`, plus `feedback` (haptics, no-op on web) and `readableOn(color)` for text on user-chosen colors. `UnifiedTopBar` and `RulesModal` in `src/components/shared` keep their old props but use the kit.
- **Icons:** `Icon` takes semantic names (`'crown'`, `'team-red'`, ...) mapped to MaterialCommunityIcons in `src/ui/Icon.js`. Add new icons there. No emojis as UI icons.
- **Font:** Rubik Regular/Medium/Bold in `assets/fonts` (OFL). Android needs the weight in the family name, so use the type scale (`AppText variant=...`) rather than `fontWeight`.
- **Accessibility:** touch targets >= 48dp, labels on icon-only buttons, never convey meaning by color alone (pair with icon/text/pattern), keep font scaling on (`maxScale` only for dense elements).
- **Motion:** Reanimated, short and never blocking input; respect `useReducedMotion()`.
- **Timers:** `TimerDisplay` is display-only; the screen keeps the timing logic and passes `remaining`.

**RTL / languages:** RTL is real (native `I18nManager.forceRTL` with one reload on first launch; web `<html dir="rtl">` plus `RTLRoot`, because react-native-web resolves `start`/`end` from its own locale context). In new UI use `start`/`end` (`marginStart`, `paddingEnd`, `top`/`end` offsets), `textAlign` via `AppText align`, and never `left`/`right`. For drawings that must NOT mirror (board games, dials), use `physicalLeft(x)` from `src/ui/direction.js` for absolute positions (native RN swaps left/right in RTL; react-native-web does not) and `physicalRow()` for rows, or draw inside an SVG (coordinates are physical). Arrow/back/exit icons flip automatically.

**Strings:** all user-facing text lives in `src/strings/he.js`, read as `S.<area>.<key>` (functions for text with values). Alert texts in handlers use `S` too. There is no translation framework yet; to add a language, add a file with the same shape and choose it in `src/strings/index.js`. Team names stored in Firestore (e.g. "הקבוצה של דנה") are data, not UI strings. Numbers with a sign inside Hebrew text need an LRM (`‎`) in front to avoid "0+" bidi glitches.

## Conventions

- App code in `src/` is plain JavaScript. TypeScript appears only in ads/config and template files.
- Logging uses emoji-prefixed `console.log`/`console.warn` (✅ ⚠️ 🔗 🚀); follow the existing style.
- Files in `src/` use LF line endings (Git on Windows may warn about CRLF; ignore it).
- Codenames "rivals" mode is deliberately left as-is (not maintained); don't build on it.
