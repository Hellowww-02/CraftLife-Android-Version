# CraftLife Android — Quick Steps: from Emulator to Your Physical Phone

Written 23 October 2026 for v2.0.0. Read top to bottom; each step is one
action. Do Section 2 (emulator) first — Section 3 (physical phone) whenever
you are ready.

**30-second picture:** the Android app is just a "face". The brain and the
data stay in the desktop app you already know how to use. If the desktop is
not running, the Android app still opens but data is empty/pending.

---

## Section 0 — Copy the files (once, ~5 minutes)

Two archives are prepared in the workspace:

| Archive | Contents | Destination |
|---|---|---|
| `CraftLife-Android-v2.0.0.zip` | the whole Android project (no node_modules) | `D:\CL\CraftLife-Android` |
| `craftlife-desktop-sync.zip` | 4 version + theme files (optional) | `D:\CL\CraftLife` |

1. Open `D:\CL\CraftLife-Android` in Explorer.
2. Extract the **contents** of `CraftLife-Android-v2.0.0.zip` into that folder
   (overwrite the old files when asked). The structure must stay
   `D:\CL\CraftLife-Android\package.json` etc. — do not end up with
   `D:\CL\CraftLife-Android\CraftLife-Android\package.json`.
3. (Optional, 1 minute — for the new theme colors + green version tests)
   Extract `craftlife-desktop-sync.zip` into `D:\CL\CraftLife` (overwrite),
   then in PowerShell:

   ```powershell
   cd D:\CL\CraftLife\packages\craftlife-core
   npm run build
   ```

4. Make sure a `.env` file exists in `D:\CL\CraftLife-Android`. If not, copy
   `.env.example` to `.env` (the emulator values are already correct).

---

## Section 1 — Check the tools (once)

1. Run `node --version` → must be **v22.13** or newer.
2. Run `java -version` → must be **17**.
3. Android Studio is open and the **Pixel 8** emulator exists in Device
   Manager.

> If `java -version` is wrong: reset it **in every PowerShell window** you use
> (the value does not carry across windows). The proven one-liner finds the
> JDK 17 that Gradle auto-downloaded:
>
> ```powershell
> $env:JAVA_HOME = (Get-ChildItem "$env:USERPROFILE\.gradle\jdks" -Directory | Where-Object { $_.Name -match "17" -and (Test-Path "$($_.FullName)\bin\java.exe") } | Select-Object -First 1).FullName
> ```
>
> Verify: `& "$env:JAVA_HOME\bin\java.exe" -version` → must be 17.

---

## Section 2 — Run on the emulator (today)

0. **New PowerShell window?** Run the `JAVA_HOME` one-liner from Section 1
   first (one line).
1. Open the **desktop CraftLife** app as usual, then log in. (The data server
   starts with it — no extra terminal needed.)
2. In PowerShell:

   ```powershell
   cd D:\CL\CraftLife-Android
   npm install
   ```

   (Once is enough; repeat if `node_modules` disappears.)
3. Start Metro:

   ```powershell
   npx expo start
   ```
4. Open the **Pixel 8** emulator from Android Studio and wait for it to boot.
5. In the Metro window, press **`a`** (Android).
6. Wait for the first build (5–15 minutes; later runs are much faster). The
   **CraftLife** icon appears and opens to the Dashboard.

**Quick check (5 steps):**

1. Dashboard shows your real data (not empty placeholders).
2. Toggle one habit → see it change on the desktop too.
3. Settings → switch theme → colors change everywhere.
4. Pets → spin once.
5. Social → Chat/Guild tabs load.

> The `.env` for the emulator is correct when it contains
> `EXPO_PUBLIC_API_BASE=http://10.0.2.2:8765`. Don't change it yet.

---

## Section 3 — Move to a physical phone

### 3a. Prepare the phone (once)

1. Settings → About phone → tap **Build number** 7× (enables Developer
   options).
2. Developer options → **USB debugging** ON.
3. Plug the phone into the PC with a USB cable → accept the debugging prompt
   on the phone.

### 3b. Run over USB (easiest — recommended)

The USB cable becomes a "bridge": no IP addresses, no firewall rules, and the
desktop app can just run as usual.

1. Turn the emulator off (so there is no device ambiguity).
2. Change one line in `.env`:

   ```
   EXPO_PUBLIC_API_BASE=http://127.0.0.1:8765
   ```

3. In the Metro window: `Ctrl+C`, then:

   ```powershell
   npx expo start -c
   ```

   (`-c` is REQUIRED whenever `.env` changes — the old value sticks without
   it.)
4. Check the phone is detected:

   ```powershell
   adb devices
   ```

   (Your phone's name must appear, not `unauthorized` — if so, accept the
   prompt on the phone.)
5. Set up the "bridge" (2 commands):

   ```powershell
   adb reverse tcp:8081 tcp:8081
   adb reverse tcp:8765 tcp:8765
   ```

6. Build + install + open on the phone:

   ```powershell
   cd D:\CL\CraftLife-Android
   npm run android
   ```

7. Repeat the **5-step quick check** from Section 2 on your phone.

> **Remember:** `adb reverse` is lost when the phone is unplugged or
> restarted. Re-run step 5 (just 2 commands).
>
> **Tip for switching emulator ↔ phone:** if you use
> `http://127.0.0.1:8765` AND always run `adb reverse tcp:8765 tcp:8765`,
> the same `.env` works for both the emulator and the phone — no more
> switching.

### 3c. Alternative without a cable (same WiFi)

1. Make sure the phone and PC are on the **same WiFi**.
2. On the PC run `ipconfig` → note the **IPv4** address (e.g.
   `192.168.1.20`).
3. Start the server from a terminal (not the desktop app), in the real
   desktop folder that contains `api_server.py`:

   ```powershell
   $env:CRAFTLIFE_API_HOST = "0.0.0.0"
   python api_server.py
   ```

4. Change `.env` → `EXPO_PUBLIC_API_BASE=http://192.168.1.20:8765` (your IP),
   then `npx expo start -c`.
5. `npm run android` as usual.
6. If Windows shows a firewall dialog, allow **Private** for Python/Node.

> The desktop app is NOT enough for this method — its built-in server only
> listens on `127.0.0.1`; that is why step 3 exists.

### 3d. Remember where the data lives

The data "lives" on the PC. Without the PC running, the phone app still opens
and shows the **last copy** (offline mode); changes wait safely in the queue
and are sent as soon as the connection returns.

---

## Section 4 — Physical-phone verification (the M12 + M13 package, one pass)

These proofs were deliberately deferred to a physical phone (decision of
2026-10-23). Check them off at your own pace:

1. Login + initial data loads.
2. Chat/guild/PvP between **2 devices** (phone + emulator/PC).
3. Pet spin with the **cloud** (not local mode) → gold/EXP correct
   immediately.
4. Toggle airplane mode **mid-sync** → no crash, the queue continues
   automatically.
5. Force-stop the app **mid-sync** → reopen; no data lost or duplicated (the
   Recovery feature in Settings).
6. Push notification with the app closed (honest note: needs the operator's
   Firebase credentials — without them the feature is a truthful no-op, not a
   fake).
7. TalkBack: open the app with TalkBack ON; basic navigation works.
8. Rough notes: app cold-start time and one day of battery use.

Technical detail per item: `VERIFIKASI_M12.md` and `QA_M13.md` in the desktop
repository.

---

## Section 5 — If something gets stuck (5 most common problems)

| Symptom | Cause | Fix |
|---|---|---|
| "requires JVM 17" / wrong Java version | `JAVA_HOME` resets every window | Re-run the **mandatory** `JAVA_HOME` one-liner from Section 1 (finds JDK 17 in `.gradle\jdks`) |
| Metro `transformFile` error / HTTP 500 | `babel.config.js` (not `.cjs`) | The file must be named `babel.config.cjs`, then `npx expo start -c` |
| Empty data / `Network request failed` | Server/address not connected | ① Desktop open + logged in? ② `curl http://127.0.0.1:8765/api/me` on the PC → 200? ③ `.env` right (emulator `10.0.2.2` / phone `127.0.0.1`+adb reverse / WiFi IP)? ④ Metro restarted with `-c`? ⑤ Phone: `adb reverse` run? |
| `'node' is not recognized` during build | Node missing from Android Studio's PATH | Open Android Studio from a terminal that has Node, or restart Android Studio after installing Node |
| Weird build failure after files changed | Stale build leftovers | Delete the **folder** `android\app\build` (never the file `build.gradle`!), then build again |

Deeper problems (MAX_PATH, Gradle, etc.) are covered in the Troubleshooting
section of `RUN_ANDROID.md`.
