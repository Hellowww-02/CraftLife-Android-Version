/**
 * Rute Chat — M10. Percakapan dengan satu teman; parameter friendId/nama
 * datang dari daftar teman (`/more/friends`).
 */

import { useLocalSearchParams } from "expo-router";
import React from "react";

import ChatScreen from "../../src/screens/ChatScreen";

export default function ChatRoute() {
  const params = useLocalSearchParams<{ friendId?: string; name?: string }>();
  return (
    <ChatScreen
      friendId={String(params.friendId ?? "")}
      friendName={String(params.name ?? "")}
    />
  );
}
