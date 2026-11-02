/**
 * M14 produk — "satu APK untuk semua orang": alamat server divalidasi dengan
 * fungsi murni (tanpa SecureStore), supaya format yang masuk ke penyimpanan
 * selalu sah.
 */

import { describe, expect, it, vi } from "vitest";

// Modul asli mengimpor expo-secure-store (native) — di Node/vitest tidak ada,
// jadi mock dulu supaya fungsi murninya bisa diuji tanpa perangkat.
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (): Promise<string | null> => null,
  setItemAsync: async (): Promise<void> => {},
  deleteItemAsync: async (): Promise<void> => {},
}));

import { normalizeServerAddress } from "../src/api/serverAddress";

describe("normalizeServerAddress", () => {
  it("menerima alamat http/https yang sah dan memangkas trailing slash", () => {
    expect(normalizeServerAddress("http://192.168.1.20:8765")).toBe("http://192.168.1.20:8765");
    expect(normalizeServerAddress("http://10.0.2.2:8765/")).toBe("http://10.0.2.2:8765");
    expect(normalizeServerAddress("  https://api.example.com  ")).toBe("https://api.example.com");
  });

  it("menolak format yang tidak sah", () => {
    expect(normalizeServerAddress("")).toBeNull();
    expect(normalizeServerAddress("192.168.1.20:8765")).toBeNull(); // tanpa skema
    expect(normalizeServerAddress("ftp://x")).toBeNull();
    expect(normalizeServerAddress("http://")).toBeNull(); // tanpa host
    expect(normalizeServerAddress("http://host with space")).toBeNull();
    expect(normalizeServerAddress("javascript:alert(1)")).toBeNull();
  });

  it("port opsional boleh hilang", () => {
    expect(normalizeServerAddress("http://192.168.1.20")).toBe("http://192.168.1.20");
  });
});
