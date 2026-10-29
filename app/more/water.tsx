/**
 * Rute Water — M08 wave 2.
 *
 * Air tidak diberi layar sendiri: di desktop pun ia tab kedua di dalam
 * HealthFoodView, dan backend mengirimnya bersama paket makanan
 * (`/api/healthfood/day`). Jadi rute ini membuka layar Food, dengan kartu air
 * di bagian atas. Rutenya dipertahankan agar deep link lama tidak putus.
 */

import React from "react";

import FoodScreen from "../../src/screens/FoodScreen";

export default function WaterRoute() {
  return <FoodScreen />;
}
