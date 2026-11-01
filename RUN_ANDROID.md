# Running CraftLife Android (Android Studio & terminal)

A step-by-step guide, from an empty folder to the app visible on the emulator
screen. Written 14 October 2026 after every step that *could* be run in the
development environment was actually run — see
[Verification evidence](#verification-evidence) at the end for exactly what has
been proven and what has not. Troubleshooting entries carry their own
**PROVEN / CORRECTION** notes from real user-machine logs (18–22 October 2026).

---

## The big picture: what is actually running

The app consists of **two programs that must be alive at the same time**:

```text
┌─────────────────────────┐        HTTP         ┌──────────────────────────┐
│  CraftLife (Python)     │ ◄────────────────── │  CraftLife Android       │
│  api_server.py          │   JSON, port 8765   │  (Expo / React Native)   │
│  = "brain" + database   │                     │  = the face on the phone │
└─────────────────────────┘                     └──────────────────────────┘
```

- **Python** is the source of data. Habits, notes, reminders, sport, money —
  everything is read from here through addresses like `/api/notes`.
- **Android** is only the presentation. It asks Python for data, keeps a copy
  in local SQLite, and has an "outbox" for changes not yet sent.

So: if Python is not running, the Android app still opens but shows empty
content or errors. **Start Python first, then Android.**

> **Good news:** you may not need a terminal at all. The CraftLife desktop app
> **starts this server itself** when opened — see
> [Section 4](#section-4--start-the-python-server) Method A. A terminal is only
> needed for a physical phone, not for the emulator.

---

## Section 0 — Prerequisites

| Requirement | Minimum version | How to check |
|---|---|---|
| **Node.js** | **22.13** or newer | `node --version` |
| **npm** | ships with Node | `npm --version` |
| **JDK** | **17** | `java -version` |
| **Android Studio** | current | — |
| **Python** | 3.10+ | `python --version` |

**Why these numbers?** All of them are read from this project itself, not
guessed:

- Expo SDK 57 (used by `package.json`) runs React Native 0.86 and React
  19.2.3, and requires **Node ≥ 22.13.x**.
- The official React Native 0.86 support table states **JDK 17**, Android
  minimum 7.0 (API 24), Node minimum 22.11.
- `node_modules/react-native/gradle/libs.versions.toml` in this project
  contains `compileSdk = 36`, `targetSdk = 36`, `minSdk = 24`,
  `ndkVersion = 27.1.12297006`, `agp = 8.12.0`, `kotlin = 2.1.20`.
- `android/gradle/wrapper/gradle-wrapper.properties` uses **Gradle 9.3.1**
  (downloaded automatically — no manual install needed).

> **If your Node is still 18 or 20**, Metro will refuse to start. Install Node
> 22 LTS from <https://nodejs.org>. On Windows use the `.msi` installer so Node
> lands in the system PATH (important — see
> [Problem: `node: command not found`](#node-command-not-found-during-a-gradle-build)).

### Components inside Android Studio

Open **Settings → Languages & Frameworks → Android SDK**, check and install:

- **SDK Platforms** → *Android 16.0 (API 36)*
- **SDK Tools** → *Android SDK Build-Tools 36*, *Android SDK Platform-Tools*,
  *Android Emulator*, and **NDK (Side by side) 27.1.12297006**

The NDK is mandatory: React Native 0.86 requests it via `ndkVersion` above.

---

## Section 1 — Build the shared package (`@craftlife/core`)

The Android app has no private copy of the money formatter, translation
catalogue, or domain types. It uses the package from the desktop folder:

```jsonc
// CraftLife-Android/package.json
"@craftlife/core": "file:../CraftLife/packages/craftlife-core"
```

Therefore the package **must be compiled first**. If you skip this step, the
symptom later is not a clear message — it is
`Failed to resolve entry for package "@craftlife/core"`.

```bash
cd CraftLife
npm install
npm run build:core
```

**Confirm it worked** before continuing:

```bash
ls packages/craftlife-core/dist | wc -l
# must print: 10
```

If the number is not 10, do not continue — fix it first. `dist/` is a build
artifact and deliberately gitignored, so it is expected to be absent from a
fresh clone.

> The two folders **must be siblings** (`CraftLife/` and `CraftLife-Android/`
> under the same parent), because the `file:../CraftLife/...` path is relative.

---

## Section 2 — Install the Android dependencies

```bash
cd ../CraftLife-Android
npm install
```

**If you get an `ERESOLVE` about `react-dom`:** do not delete
`package-lock.json` — that does not fix it. This project's `package.json`
already carries the antidote:

```jsonc
"overrides": { "react-dom": "19.2.3" }
```

When adding new packages use `npx expo install <package>`, not
`npm install <package>` — `npx expo install` picks the version matching
SDK 57.

---

## Section 3 — Tell the app where the server is

The app reads the API address from the `EXPO_PUBLIC_API_BASE` variable
(`app/_layout.tsx`). A `.env` file is prepared in this folder:

```bash
# .env
EXPO_PUBLIC_API_BASE=http://10.0.2.2:8765
```

**Why `10.0.2.2` and not `localhost`?** Inside the Android emulator,
`localhost` and `127.0.0.1` point at *the emulator itself*, not your computer.
Android provides the special address `10.0.2.2` meaning "the host machine".
This only applies to the emulator.

**On a physical phone** (not an emulator), `10.0.2.2` is useless. Replace it
with your computer's LAN IP:

```bash
# .env — physical phone, same WiFi
EXPO_PUBLIC_API_BASE=http://192.168.1.20:8765
```

Find your IP with `ipconfig` (Windows) or `ip addr` (Linux/macOS), and the
**server must be bound to `0.0.0.0`** — see Section 4.

See `.env.example` for a full explanation of both options.

> Every time `.env` changes, stop Metro and restart with `npx expo start -c`.
> `EXPO_PUBLIC_*` variables are baked into the bundle, so without `-c` the old
> value stays in use.

---

## Section 4 — Start the Python server

### Method A — Run the desktop app; the server starts itself (easiest)

`MainPyQt6.py` **already starts the API server automatically** — line 25121,
before the login window even appears:

```python
import api_server
api_server.start_server("127.0.0.1", int(os.environ.get("CRAFTLIFE_API_PORT", "8765")))
```

And after you log in, line 25167 adds the crucial piece:

```python
api_server.configure(user["id"], token)
api_server.start_server("127.0.0.1", ...)
```

`configure()` fills in the user identity — **exactly what makes the 401 trap
below disappear.** With this method you solve two problems at once without a
single command.

```text
1. Open the CraftLife desktop app as usual, then log in.
2. Check the server is alive:
      curl http://127.0.0.1:8765/api/me          (must be 200)
3. Run the Android app from Android Studio / `npm run android`.
```

**The limit:** the desktop app binds the server to **`127.0.0.1` hardcoded**,
not `0.0.0.0`. For the **emulator** that is fine — `10.0.2.2` forwards to the
host loopback. For a **physical phone** it is unreachable. If you use a
physical phone, use Method B.

### Method B — Your own terminal

Use this if you do not want the desktop app open, or you use a physical phone.

```bash
cd CraftLife
python api_server.py
```

That is enough for the **emulator**: `10.0.2.2` penetrates `127.0.0.1`.
`CRAFTLIFE_API_HOST=0.0.0.0` is **only** needed for a physical phone.

> ### ⚠️ Windows: the syntax above is Linux/macOS
>
> `VAR=value command` **does not work in PowerShell or cmd.** Use this:
>
> **PowerShell**
> ```powershell
> cd "D:\CL\CraftLife"
> $env:CRAFTLIFE_API_HOST = "0.0.0.0"
> python api_server.py
> ```
> If `python` is unknown, try `py api_server.py`.
>
> **Command Prompt (cmd)**
> ```cmd
> cd /d "D:\CL\CraftLife"
> set CRAFTLIFE_API_HOST=0.0.0.0
> python api_server.py
> ```
> In cmd, `set` and `python` should be on separate lines.

**The dependencies are light.** The server has its own requirements file,
separate from the desktop app — no PyQt6, matplotlib, or PyMuPDF:

```bash
pip install -r requirements-server.txt
```

It contains only: `requests`, `python-dateutil`, `python-docx`, `openpyxl`,
`reportlab`, `supabase`, `tzlocal`. A guard test
(`tests/test_m05_container.py`) scans the server's imports so the list cannot
silently fall behind.

- Default port **8765**. If busy, the server tries **8765–8772** in order and
  **prints the real address**:

  ```text
  CraftLife API http://0.0.0.0:8765
  ```

  Match the number in Android's `.env` to what is printed.

**Leave this terminal window open.** Closing it kills the server.

### ⚠️ Mandatory: there must be one user in the database

This is the trap most likely to confuse you, and it was hit in person while
testing. On a freshly created database the `users` table is **empty**, and as
a result **every** endpoint answers `401 unauthorized`:

```text
GET /api/me  →  HTTP 401  {"ok": false, "error": "unauthorized"}
```

The cause is in `api_server.py`: `_ensure_user()` (line 873) only *reads* the
first user (`SELECT id FROM users ORDER BY id LIMIT 1`). It never creates one.
No user → no identity → 401.

**If you use Method A (desktop app), skip this section** — `configure()`
already fills the identity when you log in, so the 401 never appears. This
section is for Method B, or when testing from a terminal.

**Two ways to fix it:**

**(a) Run the desktop app once.** The desktop registration form
(`MainPyQt6.py:13202`) calls `db.register_user(...)`, and that creates the
first user. The server is then normal — forever, because the row is stored in
`craftlife.db`.

**(b) Register through the API** — this is what was used while testing, and it
works:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"dev","password":"dev12345","displayName":"Dev"}' \
  http://127.0.0.1:8765/api/auth/register
```

The reply is `HTTP 200` with `{"ok": true, "token": "...", "user": {"id": "1"}}`,
and after that every endpoint opens.

> **Windows PowerShell: write `curl.exe`, not `curl`.** In PowerShell, `curl`
> is an alias for `Invoke-WebRequest` with different parameters, and the
> command above fails with a confusing error. Equivalent:
>
> ```powershell
> curl.exe -X POST -H "Content-Type: application/json" `
>   -d '{\"username\":\"dev\",\"password\":\"dev12345\",\"displayName\":\"Dev\"}' `
>   http://127.0.0.1:8765/api/auth/register
> ```
>
> Or cleaner — use `Invoke-RestMethod` directly:
>
> ```powershell
> Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8765/api/auth/register `
>   -ContentType "application/json" `
>   -Body '{"username":"dev","password":"dev12345","displayName":"Dev"}'
> ```

**How to confirm the server is ready** — run this; everything must be
`HTTP 200`:

```bash
for ep in /api/clock /api/me /api/supplies /api/notes /api/reminders \
          /api/calendar /api/pomodoro /api/sport /api/economy; do
  printf "%-14s " "$ep"
  curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8765$ep"
done
```

**Windows PowerShell** equivalent:

```powershell
"/api/clock","/api/me","/api/supplies","/api/notes","/api/reminders",
"/api/calendar","/api/pomodoro","/api/sport","/api/economy" | ForEach-Object {
  $code = try { (Invoke-WebRequest "http://127.0.0.1:8765$_" -UseBasicParsing).StatusCode }
          catch { $_.Exception.Response.StatusCode.value__ }
  "{0,-14} {1}" -f $_, $code
}
```

The result obtained while testing (after the user existed):

```text
/api/clock     200      /api/reminders  200
/api/me        200      /api/calendar   200
/api/supplies  200      /api/pomodoro   200
/api/notes     200      /api/sport      200
                        /api/economy    200
```

---

## Section 5 — Generate the native Android project

The `android/` folder **already exists** in this repository, so this step can
be skipped. But from a clean copy, or after changing `app.json`:

```bash
cd ../CraftLife-Android
npx expo prebuild --platform android
```

This command reads `app.json` and produces a complete Gradle project. It also
turns `npm run android` into `expo run:android` — which is what we want, since
`run:android` builds + installs + runs, not just starts Metro.

The generated project contains no absolute paths (verified: zero occurrences
of `/home/user` inside `android/`), so it is safe to move between machines.

---

## Section 6 — Run from Android Studio

1. **Android Studio → Open** → select the folder
   **`CraftLife-Android/android`** (not `CraftLife-Android` — it is the
   `android` folder that contains `settings.gradle`).
2. **Wait for the Gradle sync — and do not close the process window.**

   Bottom right will say `Importing 'android' Gradle Project`, then a
   **Processes** box runs in two stages:

   | Stage | what is downloaded | roughly |
   |---|---|---|
   | 1 | the **Gradle 9.3.1** distribution (~130 MB) | once per machine |
   | 2 | **JDK 17** from `api.foojay.io` (~190 MB) | see note below |

   The second stage is easily misread because Android Studio labels every
   Gradle task uniformly **"Gradle: Downloading …"**. What is actually being
   downloaded is not Gradle — it is **JDK 17**. Full explanation in
   [Problem: the "Importing 'android' Gradle Project" process runs forever](#the-importing-android-gradle-project-process-runs-forever).

   Total 10–30 minutes on a home connection. **Once only** — after that it is
   stored in `C:\Users\<name>\.gradle\` and later builds go straight through.

   While the sync runs, the top-right toolbar still shows
   **"Add Configuration…"**. That is normal: Android Studio only creates the
   `app` configuration after the sync finishes.

3. **Create an emulator**: *Device Manager → Create Virtual Device* → pick
   e.g. Pixel 8 → **API 36** image → Finish.
4. Wait until the sync truly stops — the "Add Configuration…" placeholder
   becomes a dropdown containing **`app`**. Only then: pick the emulator in
   the toolbar, press **Run ▶** (or `Shift+F10`).
5. The app installs and opens. The first run is also slow (Kotlin + Java
   compilation + APK packaging), about 5–15 minutes.

> **Speeding up emulator builds.** `gradle.properties` sets
> `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64`, i.e. all four
> CPU architectures are compiled. Your emulator is `x86_64`, so you can save
> a lot of time by building one only:
>
> ```bash
> cd CraftLife-Android/android
> ./gradlew assembleDebug -PreactNativeArchitectures=x86_64
> ```
>
> Remember to change it back when building an APK for a physical phone.

**Alternative through the terminal** (same result):

```bash
cd CraftLife-Android
npm run android
```

---

## Section 7 — What you will see

The app opens straight to the **Dashboard tab** — no login wall.

> **Don't look for a login flow.** `app/login.tsx` currently makes **zero
> network calls** (verified: zero `fetch`, zero `api.`, zero `supabase` in the
> file). It is still an M07 UI skeleton. The app does not need it: identity is
> picked up automatically from `GET /api/me`.

What should appear:

- **5 bottom tabs**: Dashboard · Tasks · Tracker · Social · More
- **A sync status bar** at the top, showing the outbox state
- **More** contains the full feature menu (28 entries with emoji, mirroring
  the desktop sidebar 1:1) — every listed screen is real.
- **Deep link** `craftlife://` registered in the manifest.

On a fresh database every screen shows an **empty state** ("no data yet"), not
errors. That is correct. Fill data from the desktop app first, then
pull-to-refresh on Android.

### Trying offline mode

The most interesting thing to test: turn off the emulator network
(*Extended controls → Cellular → Airplane mode*), then open the app.
Previously fetched data still shows from the SQLite cache, and new changes go
to the outbox and send themselves when the network returns.

---

## Troubleshooting

### The "Importing 'android' Gradle Project" process runs forever

**Symptom.** The **Processes** box shows two bars, one of them:

```text
Gradle: Downloading https://api.foojay.io/disco/v3.0/ids/c9869437c...
139.18 MB / 190.82 MB
```

**This is normal. Wait; do not press ✕.** Cancelling leaves the sync half-done
and you start over.

**What is being downloaded?** Not Gradle. Note the URL: `api.foojay.io` is the
**Foojay Disco API**, a service listing OpenJDK distributions. So what is
being downloaded is **one JDK 17 package** (~190 MB, usually Eclipse Temurin),
stored once into `C:\Users\<name>\.gradle\jdks\`.

**Why is it needed?** The chain is:

1. `expo-modules-core` explicitly requests Java toolchain version **17**
   (`kotlin.jvmToolchain(17)`).
2. That is a request for an **exact version**, not "17 or newer". JDK 21
   cannot satisfy it — unlike `sourceCompatibility`, a toolchain demands an
   actual JDK 17.
3. Android Studio ships JBR 21, so Gradle finds no JDK 17 on your machine.
4. `node_modules/@react-native/gradle-plugin/settings.gradle.kts` applies the
   `org.gradle.toolchains.foojay-resolver-convention` plugin, whose job is
   exactly this: **download missing JDKs automatically.**

So this step is not a sign of breakage. It means the project's configuration
chain is working as designed.

**If this download fails** (`Received status code 400` or `404` from
`api.foojay.io` — this has happened when Foojay package IDs expired), there
are three ways out:

**(a) Install JDK 17 yourself** and point Gradle at it:
*Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK*.
JDK 17 can be downloaded via the **Download JDK…** button in the same dialog.

**(b) Disable auto-downloading**, in `android/gradle.properties`:

```properties
org.gradle.java.installations.auto-download=false
```

Gradle then only uses installed JDKs — and reports clearly if JDK 17 is truly
absent.

**(c) Clean half-finished downloads** and sync again:

```bash
rm -rf ~/.gradle/jdks      # Linux / macOS
rmdir /s /q %USERPROFILE%\.gradle\jdks     # Windows
```

### `module is not defined in ES module scope`

```text
Failed to construct transformer: ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because ... "type": "module"
```

Cause: `babel.config.js` written CommonJS-style while `package.json` contains
`"type": "module"`.

**Already fixed in this repository** — the file is now `babel.config.cjs`. If
you see this error, the file is still named `babel.config.js`; rename it to
`babel.config.cjs`.

### `Cannot find module 'babel-preset-expo'`

That package only exists *nested* inside `node_modules/expo/node_modules/`, so
it is invisible from the project root.

**Already fixed in this repository** — `babel-preset-expo` is now an explicit
devDependency. If it still appears:
`npm install babel-preset-expo@~57.0.8 -D`.

### All data empty / `Network request failed`

Check in this order:

1. Is the Python server still alive? Is its terminal still open?
2. Does `curl http://127.0.0.1:8765/api/me` on your computer answer 200, not
   401? If 401 → no user yet, see
   [Section 4](#-mandatory-there-must-be-one-user-in-the-database).
3. Is `.env` right? Emulator → `10.0.2.2`. Physical phone → LAN IP.
4. After changing `.env`, was Metro restarted with `-c`?
5. Physical phone → is the server bound to `0.0.0.0`, and are phone + computer
   on the same WiFi?

<a id="node-command-not-found-during-a-gradle-build"></a>
### `node: command not found` during a Gradle build

`android/settings.gradle` calls **`node`** directly to locate the React Native
and Expo plugins. So Node must be on the PATH of the process running Gradle.

- **Windows:** install Node from the official installer (lands in system
  PATH). With nvm-windows, open Android Studio **from a terminal**, or restart
  Android Studio after installing Node so PATH is refreshed.
- **macOS/Linux with nvm:** run Android Studio from a terminal, or symlink:
  `sudo ln -s "$(which node)" /usr/local/bin/node`.

### `Unsupported class file major version 6x`

The Gradle JDK is wrong. Open **Settings → Build, Execution, Deployment →
Build Tools → Gradle → Gradle JDK** and pick **JDK 17**. Android Studio ships
its own JDK in `.../Android Studio/jbr/` — that is what runs if unset.

> **Do not confuse this with the toolchain.** There are **two** different JDKs
> in play, configured in different places:
>
> | JDK | Purpose | Configured at |
> |---|---|---|
> | **Gradle JDK** | the JVM running Gradle itself | Settings → Gradle → Gradle JDK |
> | **Java toolchain 17** | the JDK compiling Kotlin/Java code | `kotlin.jvmToolchain(17)` in `expo-modules-core`, auto-downloaded via Foojay |
>
> The `Unsupported class file major version` error comes from the first.
> The 190 MB `api.foojay.io` download is the second. Both need JDK 17, but
> they do not replace each other.

### Build fails with strange CMake / NDK errors on Windows

**PROVEN 18 Oct 2026** from user screenshots (previously only suspected). The
error signature is exactly:

```text
:expo-modules-core:generateStubPCH
Stub PCH generation failed: clang++: error: no such file or directory: 'D:\Gusti Py…'
```

The cause is verified from the code visible in the screenshot:
`node_modules/expo-modules-core/android/build.gradle:302` runs
`new ProcessBuilder(cmd.split(" ").toList())` — the compiler command is
**split at every space**. The user's project path contained spaces
(`D:\Gusti Rakai\Python Projects\CraftLife.Main\...`), so the file address was
cut at the first space and clang++ looked for a file that does not exist. Not a
missing clang++, not broken project code, and editing files in `node_modules`
is pointless (overwritten by every `npm install`).

**The cure:** move the **entire parent folder `CraftLife.Main`** to a
space-free path, e.g. directly `D:\CraftLife.Main\...` (dots are fine; spaces
are the problem). Moving the parent folder — not just `CraftLife-Android` —
keeps the relative `@craftlife/core: file:../CraftLife/...` dependency intact.
After moving, delete the old-path build caches (both are regenerated
automatically; safe to delete):

- `CraftLife-Android\android\.gradle`
- `CraftLife-Android\android\build` (**the `build` folder at the `android`
  root** — its `generated/autolinking/autolinking.json` holds absolute
  library paths; easy to miss because `app\build` is the famous one)
- `CraftLife-Android\node_modules\expo-modules-core\android\.cxx`

Then reopen `...\CraftLife-Android\android` in Android Studio and let it sync.
Editing `build.gradle:302` in `node_modules` is **not** a solution.

**If after the rename the error still mentions the OLD spaced path** (seen
18 Oct 2026: `Configuring project ':react-native-safe-area-context' …
'D:\Gusti Rakai\Python Projects\...' does not exist`), Android Studio / the
Gradle daemon still has the project open from the old address — usually
because it was opened via *Recent Projects* or Studio was running during the
rename. Fix: close Android Studio, **restart the computer** (the Gradle daemon
holds the old address in memory), delete the project caches at the NEW address
(`android\.gradle`, `android\.idea`, `android\app\build`, `android\app\.cxx`,
`node_modules\expo-modules-core\android\.cxx`), then open via **Open** into the
`android` folder at the new address — not from Recent. Do not delete
`%USERPROFILE%\.gradle` (that is the global download cache; deleting it means
re-downloading hundreds of MB of JDK/Gradle).

**If the project IS open from the new space-free address but the error still
names the old one** (also seen 18 Oct 2026: project address confirmed
`D:\GustiRakaa\PythonProjects\...` with no spaces, error still pointing at
`D:\Gusti Rakai\Python Projects\...`), the old address is cached inside files
carried over during the rename — the autolinking library list is read from old
output. Escalating fix: (1) the deep-clean above + **File → Invalidate
Caches** in Android Studio (check everything, *Invalidate and Restart*), then
sync again. (2) If the old address still appears, the last source is
`node_modules` itself: close Android Studio, delete `node_modules` at the new
address (only library copies — `src/` and `app/` are safe), run `npm install`
from `CraftLife-Android` at the new address, then open Android Studio again.

**Moving back to a spaced path after a successful sync does NOT work.** The
`generateStubPCH` task is not one-time prep — it runs on every sync
(`prepareKotlinBuildScriptModel` depends on it) and native builds also write
the project path into `compile_commands.json`. Once the project is opened from
a spaced path, the same error returns. A successful sync on a clean path does
not "permanently heal" the project.

**An alternative that keeps the original folder tidy: a junction.** The
original folder is not moved at all; Windows gets one "shortcut door" — a
shadow folder at a short, space-free address:

```cmd
mklink /J D:\CraftLifeMain "D:\Gusti Rakai\Python Projects\CraftLife.Main"
```

Then open the project through that door:
`D:\CraftLifeMain\...\CraftLife-Android\android`. `D:\CraftLifeMain` is **not
a copy** — editing files inside it edits the originals, and deleting the
junction (in Explorer, delete it like a shortcut; do not delete its contents
one by one) does not delete the original folder. Delete the two cache folders
above before opening through the junction, because the old caches still hold
the spaced path. Honest caveat: some tools may resolve to the real address
behind the junction — if the sync still fails naming the spaced path, the
junction is not enough and a real move is the only way.

<a id="the-importing-android-gradle-project-process-runs-forever"></a>
### `[CXX1429]` CMake cannot find `fbjniConfig.cmake` (react-native-worklets)

**🎉 RESOLVED 19 Oct 2026: `BUILD SUCCESSFUL` in Android Studio on the user's
Windows machine** (Pixel 8 API 36, space-free path
`D:\GustiRakaa\PythonProjects\...`). The proven sequence of fixes, in order:
(1) space-free path, (2) clear old-address caches + open the project NOT from
Recent, (3) delete `android\build` (autolinking.json), (4)
`android.defaults.buildfeatures.buildconfig=true` (AGP 8.12), (5) the force +
dependencySubstitution block for react-android/hermes-android in root
`android/build.gradle`. After (5), `fbjni` then `hermes-engine` resolved in
turn and the build completed. The two mandatory project fixes live in
`android/gradle.properties` and root `android/build.gradle` of this copy.

**It happened 18 Oct 2026, AFTER the spaces and autolinking issues were
solved** — a sign of progress: sync passed, NDK 27.1 compiler found, CMake
configuring native libraries one by one. The core error:

```text
CMake Error at CMakeLists.txt:9 (find_package):
  Could not find a package configuration file provided by "fbjni"
```

`fbjni` is a prefab package Gradle should extract into the requesting
library's `.cxx\...\prefab\<abi>\prefab` folder. If that library's `.cxx`
contains leftovers from earlier (spaced-path / failed-sync era), extraction is
incomplete and `find_package` fails. The day before, only `expo-modules-core`'s
`.cxx` had been cleaned — `react-native-worklets`'s had never been touched.

**The cure:** close Android Studio, delete the `.cxx` (and `build`) folders of
the library named in the error — or every folder named exactly `.cxx` inside
`CraftLife-Android` — plus `android\app\.cxx`, then sync/Run again. One
PowerShell command to remove all `.cxx` at once:

```powershell
Get-ChildItem "D:\...\CraftLife-Android" -Directory -Recurse -Force -Filter ".cxx" |
  Remove-Item -Recurse -Force
```

Do not delete `node_modules` again; its content is correct. If after a total
`.cxx` clean the `fbjni` error still appears on a genuinely fresh build, that
is no longer about cache — send the latest log for tracing (worklets ↔ React
Native version compatibility needs checking on the project side).

**Verified follow-up 19 Oct 2026 (two steps, both from user logs):**
(a) After the BuildConfig switch, configuration passed but resolution failed
`Could not find com.facebook.react:react-android:.` — empty version, meaning
RNGP's forced version injection
(`DependencyUtils.configureDependencies`, reading
`ReactAndroid/gradle.properties` `VERSION_NAME=0.86.3`) did not happen on that
machine. (b) After pinning versions manually, `fbjni` resolved but the next
CMake failure was `Could not find ... "hermes-engine"` at
`react-native-worklets` `CMakeLists.txt:11` — because worklets requests the
old coordinate `com.facebook.react:hermes-android` (build.gradle.kts:348, its
own comment: "version substituted by RNGP") which was not pinned. The combined
fix is applied in root `android/build.gradle`: an
`allprojects { configurations.configureEach { resolutionStrategy { force ...;
dependencySubstitution { ... } } } }` block mirroring RNGP for react-native
0.86.3 (react-android 0.86.3 + hermes-android 250829098.0.17, including the
`react-native`→`react-android` substitution and old
`hermes-android`/`hermes-engine` groups → `com.facebook.hermes`). **This block
must be re-aligned whenever the react-native version changes.**

**Also on 18 Oct 2026: worklets' `.cxx` + `build` deleted, same error.** A
hint from the stack trace: the failure happens building the *model* for
Android Studio (`CmakeQueryMetadataGenerator` / `ExternalNativeBuildJsonTask`,
triggered by `GradleModelFetchAction`) — i.e. during **sync/inspection**, not
during a real build. In a real terminal build the task order differs: prefab
packages extract first, then CMake configures. So the next move is to skip the
sync and build straight from PowerShell in the `android` folder:

```powershell
.\gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64
```

`x86_64` because the Pixel 8 emulator uses that architecture — one arch is far
faster than four. Success = `BUILD SUCCESSFUL` and the APK at
`app\build\outputs\apk\debug\app-debug.apk`; once the prefab exists from a
real build, Android Studio sync usually passes too. If this command also fails
with the same `fbjni`, only then is it a genuine project problem (global
Gradle transform cache or version compatibility) and the terminal log — much
shorter — is what to trace with.

### `defaultConfig contains custom BuildConfig fields, but the feature is disabled` (`:expo-log-box`)

**Occurred 19 Oct 2026** on the first terminal build
(`gradlew assembleDebug -PreactNativeArchitectures=x86_64`) — and this is
**a flaw in our project configuration**, not cache and not the user's machine.
The cause chain was verified from official npm tarballs:

- `@expo/log-box@57.0.4/android/build.gradle` writes
  `buildConfigField "boolean", "EXPO_UNSTABLE_LOG_BOX", ...` in
  `defaultConfig` but does **not** enable `buildFeatures.buildConfig`.
- `expo-module-gradle-plugin` (from `expo-modules-core@57.0.22`) does not
  enable it either — zero mentions of `buildConfig` in the plugin sources.
  (`expo-modules-core` itself survives because its `build.gradle` enables
  `buildConfig true` explicitly.)
- So the switch must come from the app project, and our `expo prebuild`
  `gradle.properties` **did not contain it**.

**The fix (applied in `android/gradle.properties`):** one line at the end of
the file —

```properties
android.defaults.buildfeatures.buildconfig=true
```

**Important correction (19 Oct 2026, after the first attempt failed):** this
project's AGP is verified **8.12.0** — pinned by
`@react-native/gradle-plugin@0.86.3` (`gradle/libs.versions.toml`: `agp =
"8.12.0"`). The Gradle wrapper is indeed 9.3.1, but **Gradle 9 ≠ AGP 9**;
never conflate them (that conflation made the first suggestion miss). On
AGP 8.12:

- The new form `android.buildFeatures.buildConfig=true` in
  `gradle.properties` is **not read** (tried on the user's machine: identical
  error, failed in 5 seconds). That form is AGP 9 only.
- The legacy property `android.defaults.buildfeatures.buildconfig=true` is
  indeed *deprecated*, but **still works** on 8.12. It is only removed in
  AGP 9 — and AGP 9 refuses to apply plugins while the property exists. So
  if this project ever moves to AGP 9, this line **must be deleted** and
  replaced with per-module `buildConfig` enablement.

The second error that usually accompanies it, `SoftwareComponent with name
'release' not found` while configuring `:expo`, is a shadow of the first and
disappears with it. If `expo prebuild --clean` is ever re-run, verify this
line still exists; prebuild overwrites `gradle.properties`.

### `Inconsistent JVM-target compatibility detected ... (1.8) and ... (21)`

**Occurred 19 Oct 2026** on the first terminal `installDebug` that reached
Kotlin compilation (305 tasks, 287 executed — only this remained):
`:react-native-safe-area-context` and `:expo-modules-core` failed at
`compileDebugKotlin` because the Kotlin JVM target reads the JVM running
Gradle. Terminal Gradle uses the system Java (21), while RN 0.86 / Expo 57
require Gradle to run on **JDK 17**. In Android Studio this equals the
*Gradle JDK* setting; in a terminal it is `JAVA_HOME` that decides (the CLI
does not read Android Studio settings).

**The fix:** point `JAVA_HOME` at the JDK 17 that Foojay downloaded during the
first sync (`%USERPROFILE%\.gradle\jdks\...-17...\`), in the same PowerShell
window as the build:

```powershell
$jdk = Get-ChildItem "$env:USERPROFILE\.gradle\jdks" -Directory |
  Where-Object { $_.Name -match "17" -and (Test-Path "$($_.FullName)\bin\java.exe") } |
  Select-Object -First 1
$env:JAVA_HOME = $jdk.FullName
.\gradlew.bat --version   # JVM must read 17.x
```

Then retry `installDebug`. Do not commit `org.gradle.java.home` with a
machine-specific absolute path into shared `gradle.properties` — not portable.

**Verified follow-up 19 Oct 2026:** after the daemon ran on 17, the same
error appeared as `(1.8) and (17)` at `:react-native-safe-area-context` — so
switching JDK alone was not enough. Per-library Java targets differ:
safe-area-context pins nothing (defaults to 1.8), while
react-native-worklets pins **17** explicitly in `build.gradle.kts` lines
270–283. Two attempts to align from the root project **failed and were
abandoned — do not retry them**: (a) pinning Kotlin 1.8 for all modules —
overrode worklets until the mismatch flipped to `(17) and (1.8)`; (b)
per-module alignment via `afterEvaluate` — rejected by Gradle 9 with *"Cannot
run Project.afterEvaluate(Closure) when the project is already evaluated"*.
**The final fix used** (applied in `android/gradle.properties`, one line, no
Groovy):

```properties
kotlin.jvm.target.validation.mode=warning
```

The mixed-target validation is downgraded to a warning; Kotlin 17 bytecode is
handled normally by D8, and this is the standard workaround during JDK
migrations.

**Command trap (19 Oct 2026):** unqualified `gradlew installDebug` runs that
task in **every** subproject, including
`:react-native-masked-view_masked-view:installDebugAndroidTest`, and fails
with `DeviceException: No connected devices!` — even though compilation was
done (393 tasks). The correct command always qualifies `:app:`:

```powershell
.\gradlew.bat :app:installDebug -PreactNativeArchitectures=x86_64
```

with the emulator running. Unqualified `assembleDebug` is safe (assemble
everywhere is harmless), `installDebug` is not.

**Also 19 Oct 2026:** `:app:installDebug` was reported missing ("task
'installDebug' not found in project ':app'"). No need to chase it — the APK
from `assembleDebug` is already at
`app\build\outputs\apk\debug\app-debug.apk`; install it directly with adb
(emulator running):

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r .\app\build\outputs\apk\debug\app-debug.apk
```

Expected reply: `Success`. Then the CraftLife icon is in the emulator's app
drawer. Also remember: a new PowerShell window = empty `JAVA_HOME` again
(Gradle protests "requires JVM 17 ... use JVM 8"); run the one-line JDK 17
setter from the JVM-target case before any Gradle command.

**Root of the whole "task not found" + empty Android Studio module saga
(19 Oct 2026):** both `:app:assembleDebug` and `:app:installDebug` were
reported missing, and the Run configuration's Module dropdown showed only
`<no module>` despite a `BUILD SUCCESSFUL` sync. The unifying explanation:
**Configure on Demand** was enabled in the machine's global Gradle settings
(`%USERPROFILE%\.gradle\gradle.properties`), so project `:app` was never
fully configured, whether called from the terminal or when the IDE fetched
models. React Native is not compatible with CoD. Fix:
`org.gradle.configureondemand=false` in the project's
`android/gradle.properties` (applied) and/or the one-off
`--no-configure-on-demand` flag; in Android Studio also uncheck *Configure on
demand* in Settings → Build Tools → Gradle if ticked.

**FINAL CORRECTION (19 Oct 2026, verified from the user's file inspection):**
the Configure-on-Demand theory above was **not** the cause — the
`--no-configure-on-demand` flag changed nothing, and the
`org.gradle.configureondemand=false` property is kept only because React
Native needs it off, not as the cure for this case. The real cause was far
simpler: **`android/app/build.gradle` was MISSING from the user's folder**
(`Get-ChildItem .\app` showed only `src`, `debug.keystore`,
`proguard-rules.pro`). The file almost certainly got deleted during a cleanup
of the `app\build` folder — in Explorer the `build` folder and the
`build.gradle` file sit next to each other. Without that file the `:app`
project exists but is empty: no Android plugin, no assemble/install tasks, no
module for Android Studio, no APK. Fix: restore `app/build.gradle` from this
project's copy (182 lines, output of `expo prebuild` of the same project),
then build as usual. **Cleanup lesson: never delete the file
`app/build.gradle`; what may be deleted is the folder `app\build` (no
`.gradle`).**

### `Filename longer than 260 characters` (ninja/CMake, `:app:buildCMakeDebug`)

**Occurred 19 Oct 2026** after `app/build.gradle` was restored — the `:app`
module came back to life (307 tasks including `:app` tasks), the build ran 50
minutes, then ninja stopped: codegen object filenames for gesture-handler
exceeded the Windows **260-character (MAX_PATH)** limit because the absolute
source path is embedded in the `.o` filename. The project path at the time
was very deep:
`D:\GustiRakaa\PythonProjects\CraftLife.Main\Android\CraftLife-Android\node_modules\...`

**The reliable fix: move the project to a SHORT path**, not merely a
space-free one — e.g. the whole `Android` folder (containing
`CraftLife-Android` + `CraftLife`) moved to `D:\CL\`, making the project
address `D:\CL\CraftLife-Android\android`. That trims ±60 characters from
every filename. After moving: (1) delete old-address caches
(`android\.gradle`, `android\build`, `android\app\.cxx`, `android\app\build`),
(2) run `npm install` in the new location — the `@craftlife/core` junction in
`node_modules` stores the old absolute address and must be rebuilt,
(3) build as usual. Enabling `LongPathsEnabled` in the registry often does not
help because the SDK's bundled ninja does not always honour it; the short
path is the proven route for React Native on Windows.

**The no-move alternative (tried first at the user's request to keep the
folder layout intact):** force CMake to shorten its own object names with the
official `CMAKE_OBJECT_PATH_MAX` switch. Installed in
`android/app/build.gradle`, **inside `defaultConfig`**:

```groovy
externalNativeBuild {
    cmake {
        arguments "-DCMAKE_OBJECT_PATH_MAX=180"
    }
}
```

When an object filename exceeds 180 characters, CMake replaces its directory
part with a short hash. This helps exactly at the failure point
(`:app:buildCMakeDebug`, codegen targets) without touching any folder.
Placement lesson (proven from two user logs): there are TWO blocks named
`externalNativeBuild` — the `android`-level one (`CmakeOptions` type) accepts
only `path`/`version` and rejects `arguments` with *"Could not find method
arguments()"* / *"unknown property 'arguments'"*; the one accepting
`arguments` is inside `defaultConfig` (`ExternalNativeCmakeOptions`, vararg
method).

**Result on the user's machine (19 Oct 2026): not enough.** With the switch,
the build passed gesture-handler but stopped at `react_codegen_rnreanimated`
with the same 260 error — autolinking sub-builds do not all honour the limit,
and the length count showed the `node_modules\react-native-reanimated\...`
depth itself is already enormous: even moving to `D:\CL\...` was estimated to
be at/over 260. So the correct order of fixes now is:

1. **Remove the limit in Windows** (no folder move): set `LongPathsEnabled=1`
   at `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem` (Admin PowerShell:
   `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`),
   then **restart**. Windows 10/11 supports long paths but the switch is off
   by default; the SDK's ninja/CMake are modern enough to use it once on. The
   `CMAKE_OBJECT_PATH_MAX` switch above stays installed as a safety net.
   **Result on the user's machine: STILL FAILING** with the exact same file
   and message — so the SDK-bundled CMake **3.22.1** ninja enforces its own
   >260 rejection internally and ignores the Windows switch.
2. **Upgrade the SDK CMake** (still no move): ninja ≥ 1.12 (shipped with SDK
   CMake 3.30+/3.31+) supports long paths when `LongPathsEnabled` is on.
   Install the newest 3.3x CMake from the SDK Manager (SDK Tools → CMake),
   then pin the version in the `android`-level block of `app/build.gradle` —
   the number must match the folder name under `<SDK>\cmake\` exactly:

   ```groovy
   externalNativeBuild {
       cmake {
           version "3.31.0"
       }
   }
   ```

   (Installed in this project copy.) This block legally coexists with the
   `arguments` block in `defaultConfig` — different DSL objects.
   **Result on the user's machine: STILL FAILING**, same file and message,
   now from `cmake\3.31.0\bin\ninja.exe`. So the SDK-bundled ninja (including
   the newest series) holds its own 260 rejection, period.
3. **The only remaining way: physically shorten the path.** The rejected
   object chain is 286 characters
   (`rnreanimated_autolinked_build/CMakeFiles/.../D_/GustiRaka/PythonProjects/CraftLife.Main/Android/CraftLife-Android/node_modules/...`).
   Ninja rejects on that chain before Windows is involved, so no switch can
   help — the source path itself must be shorter. Move the **`Android`
   folder** (containing `CraftLife-Android` + `CraftLife`, internal structure
   intact) to a short root like `D:\CL\` → project address becomes
   `D:\CL\CraftLife-Android\android` (trims ±46 characters from the chain,
   to about ±240). **THIS PROJECT IS 8 GB+ — do not move/copy it raw in
   Explorer** (millions of small files in `node_modules` + caches stall the
   process). Almost everything is reproducible content: copy ONLY the project
   skeleton, then rebuild the rest at the new address:
   `robocopy <old>\CraftLife-Android D:\CL\CraftLife-Android /E /XD node_modules .gradle build .cxx .expo`
   and
   `robocopy <old>\CraftLife D:\CL\CraftLife /E /XD node_modules .git .gradle build __pycache__ .venv`
   (robocopy handles long paths fine; exit code 1 = copied successfully).
   Then at the new address: `npm install` (rebuilds `node_modules` + the
   `@craftlife/core` junction); in the `CraftLife` folder: `npm install` +
   `npm run build:core` (rebuilds core `dist`); then build as usual. Do not
   delete the old folder — leave it as an archive/backup. Old-address caches
   are not copied because robocopy filters them. **If `npm install` at
   `D:\CL\CraftLife` fails with
   `EMISSINGTARGET ... packages/craftlife-core ... does not exist`:** the
   copy's package-lock points at a workspace folder that did not come along.
   Check `D:\CL\CraftLife\packages` — if `craftlife-core` is missing, copy
   the `packages` folder (plus `package.json`, `package-lock.json`,
   `tsconfig.base.json`) from **the real desktop project root**:
   `D:\GustiRaka\PythonProjects\CraftLife.Main\Desktop\Full Stack Version\PyQt6`
   (verified 2026-10-22 from a user listing: that is where `packages`,
   `package.json`, `supabase`, `MainPyQt6.py` live — that address even
   contains spaces). The `Android\CraftLife` copy turned out to be a partial
   copy without `packages`; do not use it as the core source. Once the folder
   exists, `npm install` runs normally (deleting `package-lock.json` is not
   needed if the lock was copied fresh; only the copy in `D:\CL` changes, the
   original repo stays intact). Continue with `npm run build:core` afterwards.
   The enabled `LongPathsEnabled` remains useful for filesystem writes.
   **PROVEN on the user's machine (2026-10-22): after moving the skeleton to
   `D:\CL`, the build passed, the APK installed, and the app opened on the
   emulator (Pixel 8 API 36). The screens rendered fully after the
   `babel.config.cjs` fix — user-confirmed 2026-10-22.** The 260 wall is done.

### Red screen "development server returned response error code: 500"

The app installs and opens, but Metro (the dev server) fails to bundle:
`Cannot read properties of undefined (reading 'transformFile')` in
`metro/src/Bundler.js`. **Not** a version problem: `npx expo export` in the
sandbox with the exact same `package-lock.json` (metro 0.84.5,
@expo/metro-config 57.0.13 nested in `expo/node_modules`) succeeds (3.8 MB
hbc). Suspect: stale Metro cache from the old-address install. Fix: stop Metro
(Ctrl+C), run `npx expo start --clear`, then RELOAD the app. **Result on the
user's machine: STILL FAILING** — not the cache. The true diagnosis shows in
`npx expo export --platform android` (this surfaces messages buried in the
server log):
`Failed to construct transformer: ReferenceError: module is not defined in
ES module scope … at babel.config.js` — the `babel.config.js` file (with
`module.exports`) clashes with `"type": "module"` in `package.json`; the
correct name for this project is **`babel.config.cjs`** (matching the
workspace copy). In the user's Windows copy the file was still named `.js`
(an October leftover). Fix by renaming it to `babel.config.cjs` (or delete
the `.js` if the `.cjs` already exists), then start Metro again.

### Data exists but notifications do not appear

Android 13+ needs the `POST_NOTIFICATIONS` permission. It **is** declared — in
`node_modules/expo-notifications/android/src/main/AndroidManifest.xml`, merged
automatically by Gradle at build time, which is why it is not visible in
`android/app/src/main/AndroidManifest.xml`. What the user must do is **accept
the permission dialog** the first time a reminder is created.

### `cleartext HTTP traffic not permitted`

Only happens on **release** builds. Android 9+ blocks plain HTTP. The
**debug** build is fine — `android/app/src/debug/AndroidManifest.xml` already
contains `android:usesCleartextTraffic="true"` (checked directly in the
file).

If you ever build a release APK to use against a local server, add this to
`app.json`:

```jsonc
"android": { "package": "app.craftlife.mobile", "versionCode": 200,
             "usesCleartextTraffic": true }
```

Deliberately **not** added now: it relaxes release-build security, and that
decision should be yours.

### `expo-system-ui` warning during prebuild

```text
» android: userInterfaceStyle: Install expo-system-ui in this project to enable this feature.
```

Harmless. `app.json` has `"userInterfaceStyle": "automatic"`, but this app
manages its own theming through `ThemeProvider` (12 user-selectable themes),
so the OS-level setting is genuinely unused. Ignore it.

---

## Quick health checks

Before opening Android Studio, make sure the foundation is green:

```bash
cd CraftLife-Android
npm run typecheck     # tsc --noEmit        → must be 0 errors
npm test              # vitest run          → all green (293 tests / 18 files at v2.0.0)
npx expo-doctor       #                     → all checks pass
```

And the cross-project gate from the desktop side:

```bash
cd ../CraftLife
python scripts/verify_gates.py
```

---

## Verification evidence

To be clear about what is **proven** and what is **not** — these are results
actually run in the development environment on 14 October 2026 (plus the
device milestones of 20–22 October):

**Run and successful:**

| What was tested | Command | Result |
|---|---|---|
| Android JS bundle | `npx expo export --platform android` | **1466 modules, 27.7 s**, `entry-….hbc` 3.8 MB |
| Native project | `npx expo prebuild --platform android` | **success**, `android/` 36 files |
| Expo checks | `npx expo-doctor` | **21/21 passed** |
| TypeScript types | `npx tsc --noEmit` | **0 errors** |
| Unit tests | `npx vitest run` | **293 passed / 18 files** (v2.0.0) |
| Python server | `python api_server.py` | alive on `0.0.0.0:8765` in 1.7 s |
| 9 API endpoints | `curl` one by one | **all HTTP 200** |
| Write data | `POST /api/notes` + `/update` | 200, `isPinned` & `content` intact |
| Device build | `gradlew :app:assembleDebug` (user machine) | **BUILD SUCCESSFUL** 2026-10-22, APK installed, app opened on Pixel 8 API 36 emulator |

Additional facts checked directly from files, not from memory:

- `android/app/src/debug/AndroidManifest.xml` contains
  `android:usesCleartextTraffic="true"` → local HTTP is allowed in debug
  builds.
- `MainPyQt6.py:25121` calls `api_server.start_server("127.0.0.1", …)` before
  the login window appears, and `MainPyQt6.py:25167` calls
  `api_server.configure(user["id"], token)` after login — the desktop app
  starts the server **and** fills the user identity in one go.
  `MainPyQt6.py:13202` calls `db.register_user(...)` from the registration
  form — that is what creates the first user.
- `api_server.py:2850` `start_server()` tries ports `port` through `port+7`
  (8765–8772) and prints the `CraftLife API http://<host>:<port>` actually
  used; it writes `CRAFTLIFE_API_PORT` back through `/api/clock` when shifted.
- `requirements-server.txt` and `requirements.txt` are indeed separate; the
  first has only 7 packages, no PyQt6.
- The main manifest declares the `INTERNET` permission.
- The `craftlife` deep link scheme is registered in `MainActivity`.
- Zero absolute paths inside `android/`.
- `@craftlife/core` symlinks to
  `../../../CraftLife/packages/craftlife-core` and Metro follows it (proven by
  the produced bundle).

**Cannot be tested in the development environment — honest list, not
boilerplate:**

- ❌ **Real Gradle builds in the sandbox.** No Android SDK there; everything
  about Gradle builds is proven on the user's machine instead (October 2026).
- ❌ **Physical-phone passes** (TalkBack, cold start, two-device social).
- ❌ **Notifications on a real device.** Logic is unit-tested; no reminder has
  actually rung on a phone yet (push needs operator Firebase credentials).
- ❌ **Note attachment upload end-to-end.** The path (`/api/upload/file`,
  JSON + base64, 5 MB cap) has never been exercised from Android.
- ❌ **Airplane mode on a real device.** The state machine is unit-tested;
  real emulator behaviour not yet observed.

If any of these fail on your machine, send the error message exactly as-is —
do not edit it. That is the most useful information.

---

## Files related to this guide

| File | Contents |
|---|---|
| `RUN_ANDROID.md` | this guide |
| `LANGKAH_CEPAT_ANDROID.md` | short numbered run guide (emulator → physical phone) |
| `RELEASE_NOTES_v2.0.0.md` | v2.0.0 release notes |
| `OPERATOR_RELEASE.md` | release operator runbook for this repository |
| `.env.example` | explanation of `EXPO_PUBLIC_API_BASE` for emulator vs physical phone |
| `.env` | active value (`http://10.0.2.2:8765`) — gitignored |
| `.gitignore` | excludes `node_modules/`, `.expo/`, build caches, `.env`, keystores |
| `babel.config.cjs` | Babel config (must be `.cjs`, see Troubleshooting) |
| `app.json` | Expo config: package `app.craftlife.mobile`, scheme `craftlife` |
