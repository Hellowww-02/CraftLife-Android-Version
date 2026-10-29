/**
 * M12 — layar Cloud (menggantikan kerangka rute M07 yang masih kosong).
 *
 * Status akun cloud dibaca dari `/api/cloud/status`: tertaut atau tidak,
 * antrean sinkron per status, jumlah konflik, dan aktivitas terakhir.
 * Tindakan sinkron sekarang tetap di Pengaturan (satu tempat untuk memicu,
 * layar ini untuk membaca) — memisahkannya menghindari dua tombol yang
 * melakukan hal sama dengan status berbeda.
 */

import React from "react";

import { Card, InlineNote, KeyValueRow, SectionHeader } from "../components/ui/primitives";
import { ScreenShell, Stack } from "../components/ui/ScreenShell";
import { ErrorState, LoadingState } from "../components/states";
import { useRemote } from "../data/useRemote";
import { parseCloudStatus } from "../features/studio/model";
import { t } from "../i18n";
import { useTheme } from "../theme/ThemeProvider";

export default function CloudScreen() {
  const { theme } = useTheme();
  const remote = useRemote("/api/cloud/status", parseCloudStatus);

  if (remote.loading && !remote.data) {
    return <LoadingState theme={theme} title={t("cloud_account_title")} message={t("loading")} />;
  }
  if (remote.error && !remote.data) {
    return (
      <ErrorState
        theme={theme}
        title={t("cloud_account_title")}
        message={remote.error}
        retryLabel={t("web_retry")}
        onRetry={() => void remote.reload()}
      />
    );
  }

  const status = remote.data;
  return (
    <ScreenShell
      theme={theme}
      title={t("cloud_account_title")}
      onRefresh={() => void remote.reload()}
      refreshing={remote.refreshing}
      offlineNotice={remote.online ? null : t("mobile_offline_banner")}
    >
      <Stack>
        {status ? (
          <Card theme={theme}>
            <SectionHeader theme={theme} title={t("cloud_account_title")} />
            <KeyValueRow
              theme={theme}
              label={t("mobile_cloud_account")}
              value={
                status.linked
                  ? status.email || "✓"
                  : t("mobile_cloud_unlinked")
              }
            />
            <KeyValueRow
              theme={theme}
              label={t("mobile_cloud_queue")}
              value={Object.entries(status.queueCounts)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            />
            <KeyValueRow
              theme={theme}
              label={t("mobile_cloud_conflicts")}
              value={String(status.conflictCount)}
            />
            <KeyValueRow
              theme={theme}
              label={t("mobile_cloud_last")}
              value={
                status.lastAt
                  ? `${status.lastDirection} · ${status.lastAt}`
                  : t("cloud_never")
              }
            />
          </Card>
        ) : null}
        {status && !status.linked ? (
          <InlineNote theme={theme}>{t("mobile_social_need_cloud")}</InlineNote>
        ) : null}
      </Stack>
    </ScreenShell>
  );
}
