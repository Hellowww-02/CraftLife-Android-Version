/**
 * M09c — tes model RPG (Pets / Shop / Crafting / Achievements).
 *
 * Serangan yang dicegah di sini adalah "ponsel mengambil alih keputusan
 * game": model tidak boleh mengarang nama pet dari id yang tidak dikenal,
 * tidak boleh menandai resep sebagai bisa dibuat kalau satu bahan kurang,
 * dan tidak boleh menampilkan tombol klaim untuk achievement yang menurut
 * server belum terbuka. Angka pity dan odds datang dari payload server;
 * model hanya menyusunnya dalam urutan peringkat.
 */

import { describe, expect, it } from "vitest";

import {
  mergePets,
  parseAchievements,
  parseInventory,
  parseRecipes,
  parseShopItems,
  parseSpinInfo,
  parseSpinResult,
} from "../src/features/rpg/model";

describe("pets", () => {
  it("membawa nama/ikon katalog; id tak dikenal tampil apa adanya, tidak dikarang", () => {
    const rows = mergePets(
      {
        userPets: [
          {
            petId: "cat",
            rank: "common",
            level: 3,
            xp: 10,
            hunger: 40,
            isEquipped: true,
          },
          { petId: "unknown_pet", rank: "epic" },
        ],
      },
      { pets: [{ id: "cat", name: "Kucing", icon: "🐱" }] },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Kucing",
      icon: "🐱",
      isEquipped: true,
    });
    expect(rows[1]).toMatchObject({ name: "unknown_pet", hunger: 100 });
  });

  it("pet yang terpasang tampil duluan, lalu level tertinggi", () => {
    const rows = mergePets(
      {
        userPets: [
          { petId: "a", rank: "legendary", level: 9 },
          { petId: "b", rank: "common", level: 1, isEquipped: true },
        ],
      },
      null,
    );
    expect(rows[0]?.petId).toBe("b");
    expect(rows[1]?.petId).toBe("a");
  });

  it("spin info membaca odds map server dalam urutan peringkat + pity", () => {
    const info = parseSpinInfo({
      cost: 120,
      odds: { legendary: 2.0, common: 34.0 },
      pity: { epic: 10, legendary: 30 },
      state: { spins_total: 7, since_epic: 4, since_legendary: 12 },
    });
    expect(info?.odds.map((o) => o.rank)).toEqual([
      "common",
      "rare",
      "epic",
      "legendary",
      "mythic",
      "secret",
    ]);
    expect(info?.odds.find((o) => o.rank === "legendary")?.pct).toBe(2.0);
    expect(info?.sinceEpic).toBe(4);
    expect(info?.sinceLegendary).toBe(12);
    expect(info?.pityLegendary).toBe(30);
    expect(info?.training).toEqual({});
    expect(parseSpinInfo(null)).toBeNull();
  });

  it("hasil spin dibaca mentah dari server, tanpa undian lokal", () => {
    const result = parseSpinResult({
      ok: true,
      pet_id: "cat",
      rank: "rare",
      is_new: false,
      dupe_exp: 60,
    });
    expect(result).toEqual({
      ok: true,
      petId: "cat",
      rank: "rare",
      isNew: false,
      dupeExp: 60,
      message: "",
    });
    expect(parseSpinResult({}).petId).toBe("");
    expect(parseSpinResult(null).ok).toBe(false);
  });
});

describe("shop & inventory", () => {
  it("persediaan qty 0 tetap 0; baris aktif menyatu ke katalog", () => {
    const inv = parseInventory({
      inventory: [
        { itemId: "potion", quantity: 0 },
        { itemId: "sword", quantity: 1, equipped: true, enchantLevel: 2 },
      ],
    });
    expect(inv.get("potion")?.quantity).toBe(0);
    const shop = parseShopItems(
      {
        items: [
          {
            id: "potion",
            name: "Ramu",
            icon: "🧪",
            type: "consumable",
            cost: 10,
          },
          { id: "sword", name: "Pedang", icon: "⚔️", type: "weapon", cost: 50 },
          { id: "hidden", name: "Rahasia", visible: false },
        ],
      },
      inv,
    );
    expect(shop).toHaveLength(2);
    expect(shop[0]).toMatchObject({ ownedQty: 0, equipped: false });
    expect(shop[1]).toMatchObject({
      ownedQty: 1,
      equipped: true,
      enchantLevel: 2,
    });
  });
});

describe("crafting", () => {
  it("resep hanya craftable bila SETIAP bahan terpenuhi menurut inventaris", () => {
    const inv = parseInventory({
      inventory: [{ itemId: "water", quantity: 1 }],
    });
    const recipes = parseRecipes(
      {
        recipes: [
          {
            id: "r1",
            resultItemId: "potion",
            requiredItems: [
              { itemId: "water", quantity: 1 },
              { itemId: "herb", quantity: 1 },
            ],
            goldCost: 10,
          },
          {
            id: "r2",
            resultItemId: "potion",
            requiredItems: [{ itemId: "water", quantity: 1 }],
            goldCost: 10,
          },
        ],
      },
      { items: [{ id: "potion", name: "Ramu", icon: "🧪" }] },
      inv,
    );
    expect(recipes[0]?.craftable).toBe(false);
    expect(recipes[0]?.needs.find((n) => n.itemId === "herb")?.have).toBe(0);
    expect(recipes[1]?.craftable).toBe(true);
  });
});

describe("achievements", () => {
  it("claimable hanya untuk yang terbuka dan belum diklaim; progres dijepit", () => {
    const rows = parseAchievements({
      achievements: [
        {
          id: "a",
          title: "Satu",
          currentProgress: 25,
          targetProgress: 10,
          isUnlocked: true,
          isClaimed: false,
          xpReward: 10,
          goldReward: 5,
        },
        {
          id: "b",
          title: "Dua",
          currentProgress: 3,
          targetProgress: 10,
          isUnlocked: false,
          isClaimed: false,
        },
        {
          id: "c",
          title: "Tiga",
          currentProgress: 10,
          targetProgress: 10,
          isUnlocked: true,
          isClaimed: true,
        },
      ],
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("a")?.claimable).toBe(true);
    expect(byId.get("a")?.progressPct).toBe(100);
    expect(byId.get("b")?.claimable).toBe(false);
    expect(byId.get("c")?.claimable).toBe(false);
    expect(rows[0]?.id).toBe("a");
  });
});
