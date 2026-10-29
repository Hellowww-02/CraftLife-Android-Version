/**
 * M09c — model murni untuk layar RPG (Pets, Shop, Crafting, Achievements).
 *
 * Layar-layar ini BUKAN daftar entitas yang bisa di-outbox: mereka adalah
 * perintah Kanal C. Server yang memutuskan hasil (spin sejak M09a diputuskan
 * RPC; beli/craft/enchant/claim lewat jalur server yang sudah ada), jadi
 * model di sini hanya membentuk ulang payload server menjadi baris tampilan
 * — tidak ada aturan permainan yang dihitung ulang di ponsel. Menghitung
 * ulang peluang atau harga di sini akan menciptakan sumber kebenaran kedua
 * yang bisa berbeda dari server (P2).
 */

export const RANK_ORDER = [
  "common",
  "rare",
  "epic",
  "legendary",
  "mythic",
  "secret",
] as const;

export interface PetRow {
  petId: string;
  name: string;
  icon: string;
  rank: string;
  level: number;
  xp: number;
  hunger: number;
  isEquipped: boolean;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function asList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> => !!v && typeof v === "object",
  );
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value ? value : fallback;
}

/** Gabung koleksi milik pengguna (`/api/pets`) dengan katalog (`/api/catalog/pets`). */
export function mergePets(userPetsRaw: unknown, catalogRaw: unknown): PetRow[] {
  const catalog = new Map<string, Record<string, unknown>>();
  for (const pet of asList(asRecord(catalogRaw).pets)) {
    const id = str(pet.id);
    if (id) catalog.set(id, pet);
  }
  const rows: PetRow[] = [];
  for (const owned of asList(asRecord(userPetsRaw).userPets)) {
    const petId = str(owned.petId);
    if (!petId) continue;
    const meta = catalog.get(petId) ?? {};
    rows.push({
      petId,
      name: str(meta.name, petId),
      icon: str(meta.icon, "🐾"),
      rank: str(owned.rank, str(meta.rank, "common")),
      level: num(owned.level, 1),
      xp: num(owned.xp),
      hunger: num(owned.hunger, 100),
      isEquipped: owned.isEquipped === true,
    });
  }
  // Pet aktif di depan, lalu level tertinggi — sama pentingnya untuk arena.
  rows.sort((a, b) =>
    a.isEquipped === b.isEquipped ? b.level - a.level : a.isEquipped ? -1 : 1,
  );
  return rows;
}

export interface SpinInfo {
  cost: number;
  odds: Array<{ rank: string; pct: number }>;
  spinsTotal: number;
  sinceEpic: number;
  sinceLegendary: number;
  pityEpic: number;
  pityLegendary: number;
  /** Biaya latih per peringkat, untuk label tombol — tidak dihitung lokal. */
  training: Record<string, number>;
}

export function parseSpinInfo(raw: unknown): SpinInfo | null {
  const data = asRecord(raw);
  if (!data.odds || typeof data.odds !== "object") return null;
  const oddsMap = data.odds as Record<string, unknown>;
  const state = asRecord(data.state);
  const pity = asRecord(data.pity);
  return {
    cost: num(data.cost),
    odds: RANK_ORDER.map((rank) => ({ rank, pct: num(oddsMap[rank]) })),
    spinsTotal: num(state.spins_total),
    sinceEpic: num(state.since_epic),
    sinceLegendary: num(state.since_legendary),
    pityEpic: num(pity.epic, 10),
    pityLegendary: num(pity.legendary, 30),
    training: Object.fromEntries(
      Object.entries(asRecord(data.training)).map(([k, v]) => [k, num(v)]),
    ),
  };
}

export interface SpinResult {
  ok: boolean;
  petId: string;
  rank: string;
  isNew: boolean;
  dupeExp: number;
  message: string;
}

export function parseSpinResult(raw: unknown): SpinResult {
  const data = asRecord(raw);
  return {
    ok: data.ok === true,
    petId: str(data.pet_id, str(data.petId)),
    rank: str(data.rank, "common"),
    isNew: data.is_new === true || data.isNew === true,
    dupeExp: num(data.dupe_exp, num(data.dupeExp)),
    message: str(data.msg, str(data.message)),
  };
}

export interface InventoryRow {
  itemId: string;
  quantity: number;
  equipped: boolean;
  enchantLevel: number;
}

export function parseInventory(raw: unknown): Map<string, InventoryRow> {
  const out = new Map<string, InventoryRow>();
  for (const row of asList(asRecord(raw).inventory)) {
    const itemId = str(row.itemId);
    if (!itemId) continue;
    out.set(itemId, {
      itemId,
      quantity: num(row.quantity, 1),
      equipped: row.equipped === true,
      enchantLevel: num(row.enchantLevel),
    });
  }
  return out;
}

export interface ShopRow {
  itemId: string;
  name: string;
  icon: string;
  cost: number;
  type: string;
  ownedQty: number;
  equipped: boolean;
  enchantLevel: number;
}

export function parseShopItems(
  catalogRaw: unknown,
  inventory: Map<string, InventoryRow>,
): ShopRow[] {
  const rows: ShopRow[] = [];
  for (const item of asList(asRecord(catalogRaw).items)) {
    const itemId = str(item.id);
    if (!itemId || item.visible === false) continue;
    const owned = inventory.get(itemId);
    rows.push({
      itemId,
      name: str(item.name, itemId),
      icon: str(item.icon, "📦"),
      cost: num(item.cost),
      type: str(item.type, "item"),
      ownedQty: owned?.quantity ?? 0,
      equipped: owned?.equipped ?? false,
      enchantLevel: owned?.enchantLevel ?? 0,
    });
  }
  return rows;
}

export interface RecipeNeed {
  itemId: string;
  name: string;
  icon: string;
  have: number;
  need: number;
  ok: boolean;
}

export interface RecipeRow {
  recipeId: string;
  resultItemId: string;
  resultName: string;
  resultIcon: string;
  goldCost: number;
  needs: RecipeNeed[];
  craftable: boolean;
}

export function parseRecipes(
  recipesRaw: unknown,
  catalogRaw: unknown,
  inventory: Map<string, InventoryRow>,
): RecipeRow[] {
  const catalog = new Map<string, Record<string, unknown>>();
  for (const item of asList(asRecord(catalogRaw).items)) {
    const id = str(item.id);
    if (id) catalog.set(id, item);
  }
  const rows: RecipeRow[] = [];
  for (const recipe of asList(asRecord(recipesRaw).recipes)) {
    const recipeId = str(recipe.id);
    if (!recipeId) continue;
    const resultItemId = str(recipe.resultItemId, recipeId);
    const resultMeta = catalog.get(resultItemId) ?? {};
    const needs: RecipeNeed[] = asList(recipe.requiredItems).map((req) => {
      const itemId = str(req.itemId);
      const meta = catalog.get(itemId) ?? {};
      const need = num(req.quantity, 1);
      const have = inventory.get(itemId)?.quantity ?? 0;
      return {
        itemId,
        name: str(meta.name, itemId),
        icon: str(meta.icon, "📦"),
        have,
        need,
        ok: have >= need,
      };
    });
    rows.push({
      recipeId,
      resultItemId,
      resultName: str(resultMeta.name, resultItemId),
      resultIcon: str(resultMeta.icon, "🛠️"),
      goldCost: num(recipe.goldCost),
      needs,
      craftable: needs.every((n) => n.ok),
    });
  }
  return rows;
}

export interface AchievementRow {
  id: string;
  title: string;
  desc: string;
  icon: string;
  category: string;
  xpReward: number;
  goldReward: number;
  progressPct: number;
  isUnlocked: boolean;
  isClaimed: boolean;
  claimable: boolean;
}

export function parseAchievements(raw: unknown): AchievementRow[] {
  const rows: AchievementRow[] = [];
  for (const ach of asList(asRecord(raw).achievements)) {
    const id = str(ach.id);
    if (!id) continue;
    const target = Math.max(1, num(ach.targetProgress, 1));
    const current = num(ach.currentProgress);
    const isUnlocked = ach.isUnlocked === true;
    const isClaimed = ach.isClaimed === true;
    rows.push({
      id,
      title: str(ach.title, id),
      desc: str(ach.desc),
      icon: str(ach.icon, "🏆"),
      category: str(ach.category, "level"),
      xpReward: num(ach.xpReward),
      goldReward: num(ach.goldReward),
      progressPct: Math.min(100, Math.round((current / target) * 100)),
      isUnlocked,
      isClaimed,
      claimable: isUnlocked && !isClaimed,
    });
  }
  // Yang bisa diklaim di depan, lalu yang sudah terbuka, lalu sisanya.
  rows.sort((a, b) =>
    a.claimable === b.claimable
      ? a.isUnlocked === b.isUnlocked
        ? b.progressPct - a.progressPct
        : a.isUnlocked
          ? -1
          : 1
      : a.claimable
        ? -1
        : 1,
  );
  return rows;
}
