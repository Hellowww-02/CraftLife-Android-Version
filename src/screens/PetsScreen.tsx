/**
 * M09c — layar Pets: koleksi + spin gacha.
 *
 * Spin adalah perintah Kanal C: sejak M09a server yang mengundi untuk
 * pengguna cloud-linked (dan server lokal untuk local-only), jadi layar ini
 * TIDAK mengantre spin ke outbox dan tidak mengarang hasil saat offline —
 * koneksi putus berarti perintah gagal terlihat, bukan disimpan. Itu memang
 * arti server-authoritative: tidak ada spin yang sah tanpa wasit.
 */

import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  InlineNote,
  ProgressBar,
  SectionHeader,
} from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { errorMessage, isNetworkFailure } from "../data/httpApi";
import { useRemote } from "../data/useRemote";
import {
  mergePets,
  parseSpinInfo,
  parseSpinResult,
  type PetRow,
  type SpinResult,
} from "../features/rpg/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function PetsScreen() {
  const { theme } = useTheme();
  const petsRemote = useRemote("/api/pets", (raw) => raw);
  const catalogRemote = useRemote("/api/catalog/pets", (raw) => raw);
  const oddsRemote = useRemote("/api/pets/odds", parseSpinInfo);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SpinResult | null>(null);

  const pets = useMemo(
    () => mergePets(petsRemote.data, catalogRemote.data),
    [petsRemote.data, catalogRemote.data],
  );
  const spin = oddsRemote.data;
  const api = petsRemote.app?.api;

  const reloadAll = useCallback(async () => {
    await Promise.all([
      petsRemote.reload(),
      catalogRemote.reload(),
      oddsRemote.reload(),
    ]);
  }, [petsRemote, catalogRemote, oddsRemote]);

  const runCommand = useCallback(
    async (path: string, body: unknown) => {
      if (!api || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        await api.post(path, body);
        await reloadAll();
      } catch (error) {
        setNotice(
          isNetworkFailure(error)
            ? t("mobile_rpg_needs_server")
            : errorMessage(error),
        );
      } finally {
        setBusy(false);
      }
    },
    [api, busy, reloadAll],
  );

  const doSpin = useCallback(async () => {
    if (!api || busy) return;
    setBusy(true);
    setNotice(null);
    setResult(null);
    try {
      const raw = await api.post("/api/pets/spin", {});
      const parsed = parseSpinResult(raw);
      if (parsed.petId) {
        setResult(parsed);
      } else if (parsed.message) {
        setNotice(parsed.message);
      }
      await reloadAll();
    } catch (error) {
      setNotice(
        isNetworkFailure(error)
          ? t("mobile_rpg_needs_server")
          : errorMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }, [api, busy, reloadAll]);

  if (petsRemote.loading && !petsRemote.data) {
    return (
      <LoadingState theme={theme} title={t("nav_pets")} message={t("loading")} />
    );
  }
  if (petsRemote.error && !petsRemote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("nav_pets")}
        message={petsRemote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void reloadAll()}
      />
    );
  }

  const resultPet = result
    ? pets.find((p) => p.petId === result.petId)
    : undefined;

  return (
    <ScreenShell
      theme={theme}
      title={t("nav_pets")}
      onRefresh={() => void reloadAll()}
      refreshing={petsRemote.refreshing}
      offlineNotice={petsRemote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {spin ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={t("pets_tab_spin")} />
            <ChipRow>
              {spin.odds.map((o) => (
                <Chip
                  key={o.rank}
                  theme={theme}
                  label={`${o.rank} ${o.pct}%`}
                  selected={false}
                  onPress={() => undefined}
                />
              ))}
            </ChipRow>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>
              {t("pets_pity_epic")}: {spin.sinceEpic}/{spin.pityEpic} ·{" "}
              {t("pets_pity_legendary")}: {spin.sinceLegendary}/
              {spin.pityLegendary}
            </Text>
            <Button
              theme={theme}
              label={t("pets_spin_btn", { cost: spin.cost })}
              onPress={() => void doSpin()}
              disabled={busy}
            />
            <Text style={[styles.note, { color: theme.colors.muted }]}>
              {t("pets_odds_note")}
            </Text>
          </Card>
        ) : null}

        {result ? (
          <InlineNote theme={theme}>
            {result.isNew ? t("pets_result_new") : t("pets_result_dupe")}{" "}
            {resultPet ? `${resultPet.icon} ${resultPet.name}` : result.petId} ·{" "}
            {result.rank}
            {!result.isNew && result.dupeExp > 0
              ? ` · +${result.dupeExp} EXP`
              : ""}
          </InlineNote>
        ) : null}
        {notice ? <InlineNote theme={theme}>{notice}</InlineNote> : null}

        <SectionHeader theme={theme} title={t("nav_pets")} />
        {pets.length === 0 ? (
          <EmptyState
            theme={theme}
            title={t("nav_pets")}
            message={t("pets_empty")}
          />
        ) : (
          pets.map((pet) => (
            <PetCard
              key={pet.petId}
              pet={pet}
              trainCost={spin?.training[pet.rank] ?? 0}
              busy={busy}
              onAction={(path) => void runCommand(path, { petId: pet.petId })}
            />
          ))
        )}
      </Stack>
    </ScreenShell>
  );
}

function PetCard({
  pet,
  trainCost,
  busy,
  onAction,
}: {
  pet: PetRow;
  trainCost: number;
  busy: boolean;
  onAction: (path: string) => void;
}) {
  const { theme } = useTheme();
  return (
    <Card theme={theme}>
      <View style={styles.head}>
        <Text style={styles.icon}>{pet.icon}</Text>
        <View style={styles.headText}>
          <Text style={[styles.name, { color: theme.colors.text }]}>
            {pet.name}
            {pet.isEquipped ? ` · ${t("pets_equipped")}` : ""}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.muted }]}>
            {pet.rank} · {t("pets_level_label")} {pet.level} · EXP {pet.xp}
          </Text>
        </View>
      </View>
      <Text style={[styles.meta, { color: theme.colors.muted }]}>
        {t("pets_hunger")}
      </Text>
      <ProgressBar theme={theme} percent={pet.hunger} />
      <View style={styles.actions}>
        <Button
          theme={theme}
          variant="ghost"
          label={t("pets_feed")}
          disabled={busy}
          onPress={() => onAction("/api/pets/feed")}
        />
        <Button
          theme={theme}
          variant="ghost"
          label={t("pets_train", { cost: trainCost })}
          disabled={busy}
          onPress={() => onAction("/api/pets/train")}
        />
        <Button
          theme={theme}
          variant="ghost"
          label={pet.isEquipped ? t("pets_unequip") : t("pets_equip")}
          disabled={busy}
          onPress={() =>
            onAction(pet.isEquipped ? "/api/pets/unequip" : "/api/pets/equip")
          }
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, gap: 2 },
  icon: { fontSize: 34 },
  name: { fontSize: 16, fontWeight: "700" },
  meta: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
