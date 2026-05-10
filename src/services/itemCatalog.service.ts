import { ITEM_KEYS, OFFCHAIN_ITEM_SELL_GOLD, SPECIES, EGG_ITEM_BY_SPECIES } from "@fantastic-farm/shared";
import { Item } from "../models";

const catalogRows: Array<{
    itemKey: string;
    name: string;
    description: string;
    kind: "off" | "on" | "egg" | "feed";
    sellGold: number;
    fcValue: number;
    tierId: string | null;
}> = [
    {
        itemKey: ITEM_KEYS.wheat,
        name: "Wheat",
        description: "Feed for chickens",
        kind: "feed",
        sellGold: 0,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: ITEM_KEYS.grass,
        name: "Grass",
        description: "Feed for goat, sheep, cow",
        kind: "feed",
        sellGold: 0,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: ITEM_KEYS.goldenWheat,
        name: "Golden wheat",
        description: "Premium feed (+on-chain spawn)",
        kind: "feed",
        sellGold: 0,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: ITEM_KEYS.goldenGrass,
        name: "Golden grass",
        description: "Premium feed (+on-chain spawn)",
        kind: "feed",
        sellGold: 0,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: ITEM_KEYS.starterEgg,
        name: "Starter egg",
        description: "Hatch your first chicken",
        kind: "egg",
        sellGold: 0,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: "egg",
        name: "Chicken egg",
        description: "Sell for gold",
        kind: "off",
        sellGold: OFFCHAIN_ITEM_SELL_GOLD.egg,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: "goat_milk",
        name: "Goat milk",
        description: "Sell for gold",
        kind: "off",
        sellGold: OFFCHAIN_ITEM_SELL_GOLD.goat_milk,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: "wool",
        name: "Wool",
        description: "Sell for gold",
        kind: "off",
        sellGold: OFFCHAIN_ITEM_SELL_GOLD.wool,
        fcValue: 0,
        tierId: null,
    },
    {
        itemKey: "cow_milk",
        name: "Cow milk",
        description: "Sell for gold",
        kind: "off",
        sellGold: OFFCHAIN_ITEM_SELL_GOLD.cow_milk,
        fcValue: 0,
        tierId: null,
    },
    ...Object.entries(EGG_ITEM_BY_SPECIES).map(([species, itemKey]) => ({
        itemKey,
        name: `${SPECIES[species as keyof typeof SPECIES].displayName} NFT egg`,
        description: "Hatch or list on market",
        kind: "egg" as const,
        sellGold: 0,
        fcValue: 0,
        tierId: null,
    })),
];

let catalogEnsured = false;

export async function ensureItemCatalog(): Promise<void> {
    if (catalogEnsured) return;
    for (const row of catalogRows) {
        await Item.findOneAndUpdate(
            { itemKey: row.itemKey },
            { $setOnInsert: row },
            { upsert: true, new: true }
        );
    }
    catalogEnsured = true;
}
