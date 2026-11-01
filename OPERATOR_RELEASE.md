# Operator: publishing CraftLife for Android v2.0.0

This runbook lives **in the Android repository** and covers publishing the
Android app from here: GitHub Releases on
[Hellowww-02/CraftLife-Android-Version](https://github.com/Hellowww-02/CraftLife-Android-Version)
and the Play Store. The desktop zip, cloud operations, and the master
release checklist live in the main repository's
[`OPERATOR_RELEASE.md`](https://github.com/Hellowww-02/CraftLife/blob/main/OPERATOR_RELEASE.md)
— one release, one master runbook; this file is the Android chapter, kept next
to the code it builds.

Same-release revisions (rev-B, rev-C, …) keep version `2.0.0`: new commit,
**move** the tag, and revise — never duplicate — the release notes.

## 0. Version anchors (K22)

| Anchor | Location | Required value |
|--------|----------|----------------|
| npm | `package.json` → `version` | `"2.0.0"` |
| Expo | `app.json` → `expo.version` | `"2.0.0"` |
| Play | `app.json` → `android.versionCode` | `200` (increase every upload) |
| Desktop | `CraftLife/updater.py` → `APP_VERSION` | `"2.0.0"` |

Pinned by `tests/version.test.ts` (reads the sibling `CraftLife/` checkout).

## 1. Preconditions

- [ ] Sibling `CraftLife/` checkout exists and `npm run build:core` has been
      run there (`packages/craftlife-core/dist` present).
- [ ] `npm run typecheck` → 0 errors.
- [ ] `npm test` → all green (293 tests / 18 files at v2.0.0).
- [ ] `npx expo-doctor` → all checks pass.
- [ ] No `.env`, `*.keystore`, or `keystore.properties` can enter any archive
      (`.gitignore` guards this; re-verify the zip listing anyway).

## 2. Build

### 2a. GitHub Release build (APK)

An APK is the friendliest artifact for a GitHub Release — sideloadable,
no Play account needed:

```powershell
cd D:\CL\CraftLife-Android
npm install
cd android
.\gradlew.bat :app:assembleRelease
```

Output: `android\app\build\outputs\apk\release\app-release.apk`.
Signed with the **upload key** if `android/keystore.properties` exists,
otherwise with the debug key (fine for GitHub sideload; Play will reject it).

### 2b. Play Store build (AAB)

```powershell
.\gradlew.bat :app:bundleRelease
```

Output: `android\app\build\outputs\bundle\release\app-release.aab` — must be
signed with the real upload key.

### Upload key (one time)

```powershell
cd D:\CL\CraftLife-Android\android
keytool -genkeypair -v -storetype PKCS12 -keystore craftlife-upload.keystore -alias craftlife-upload -keyalg RSA -keysize 2048 -validity 10000
copy keystore.properties.example keystore.properties  # fill in real passwords
```

Back up the keystore + passwords in a password manager (losing them means a
Google upload-key reset). Enroll in **Play App Signing** at first upload.

## 3. GitHub Release (this repository)

1. **Tag:** `v2.0.0` exactly (never `v.2.0.0` / `2.0.0`).
2. **Title:** `CraftLife for Android v2.0.0 — First Public Release`.
3. **Body:** `RELEASE_NOTES_v2.0.0.md` plus the SHA-256 of the APK:

   ```powershell
   (Get-FileHash app-release.apk -Algorithm SHA256).Hash.ToLower()
   ```
4. **Attach:** `app-release.apk` (exactly one APK per release).
5. Mark as **Latest** and publish.

## 4. Play Console

- Create the app (`app.craftlife.mobile`), upload the AAB to **Internal
  testing** first; promote after the physical-phone verification pass.
- **Data safety form:** the main repository's `PLAY_DATA_SAFETY_v2.0.0.md`
  maps every answer to what the code actually collects.
- Store listing: icon source is `assets/icon.png` (1024); screenshots come
  from the device pass.

## 5. Verify

- [ ] `/releases/latest` serves the APK; the APK installs and opens.
- [ ] Login + cache + sync smoke on a real device; More menu shows all 28
      entries; version label reads `2.0.0`.
- [ ] Play internal build installs; same smoke passes.

## 6. Rollback

- GitHub: publish a hotfix `2.0.1` with a higher `versionCode`; do not
  re-tag once users downloaded.
- Play: halt the rollout; ship the fixed build with an increased
  `versionCode`.
- Never edit a shipped release asset in place — publish a new one.

## 7. Release file map

At v2.0.0 the release surface is: `package.json` / `app.json` (anchors),
`assets/` (icon, adaptive icon, splash), `android/app/build.gradle` (release
signing), `android/keystore.properties.example`, `src/features/menu.ts`
(More-menu parity), `RELEASE_NOTES_v2.0.0.md`, this runbook. Per-change lists
live in the workspace chat history; parity evidence is in the main repo's
`VERIFIKASI_M12.md`, QA in `QA_M13.md`.
