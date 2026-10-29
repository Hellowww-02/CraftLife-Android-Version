/**
 * Rute Health — M08 wave 2.
 *
 * Health juga bisa dibuka dari tab Tracker (`craftlife://tracker?tab=health`).
 * Rute ini sengaja tidak dihapus: deep link lama masih menunjuk ke sini, dan
 * menghapus rute berarti memutus tautan yang sudah pernah dibagikan.
 */

import React from "react";

import HealthScreen from "../../src/screens/HealthScreen";

export default function HealthRoute() {
  return <HealthScreen />;
}
