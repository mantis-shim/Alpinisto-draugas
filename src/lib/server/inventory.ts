// Inventory CRUD (UC-2, UC-4). Every query is scoped by userId, so a user can only reach their own items.
// Returns plain objects with a string id, ready to hand to a page (Mongoose documents are not serialisable).
import { isObjectIdOrHexString } from 'mongoose';
import type { InventoryItem, ItemInput } from '#lib/domain.ts';
import { Item, LT_COLLATION } from '#lib/server/models.ts';

type ItemRecord = Omit<InventoryItem, 'id'> & { _id: { toString(): string } };
const toItem = ({ _id, name, category, suitability, attributes }: ItemRecord): InventoryItem => ({
	id: _id.toString(),
	name,
	category,
	suitability: [...suitability],
	attributes: attributes.map(({ name, value }) => ({ name, value }))
});

// A malformed id from a URL would make Mongoose throw a CastError; treat it as "not found" instead.
const mine = (userId: string, itemId: string) =>
	isObjectIdOrHexString(itemId) ? { _id: itemId, userId } : null;

/** All of the user's items, sorted by name. */
// ponytail: no DB-side filter/search, the UI filters by category and name in the browser.
// Add filter arguments here if inventories grow large.
export async function listItems(userId: string) {
	const items = await Item.find({ userId }).collation(LT_COLLATION).sort({ name: 1 }).lean<ItemRecord[]>();
	return items.map(toItem);
}

/** Attribute names the user already uses: "Požymis" suggestions on the edit page (the list page has every item anyway). */
export const listAttributeNames = (userId: string) => Item.distinct('attributes.name', { userId }) as Promise<string[]>;

export async function getItem(userId: string, itemId: string) {
	const filter = mine(userId, itemId);
	const item = filter && (await Item.findOne(filter).lean<ItemRecord>());
	return item ? toItem(item) : null;
}

/** Throws mongoose.Error.ValidationError on an empty or too long name, an unknown category / suitability, or too many attributes. */
export async function createItem(userId: string, input: ItemInput) {
	const item = await Item.create({ ...input, userId });
	return toItem(item.toObject<ItemRecord>());
}

/** Changes only the given fields. Returns null if the item doesn't exist or belongs to someone else. */
export async function updateItem(userId: string, itemId: string, input: Partial<ItemInput>) {
	const filter = mine(userId, itemId);
	const options = { runValidators: true, returnDocument: 'after' } as const;
	const item = filter && (await Item.findOneAndUpdate(filter, { $set: input }, options).lean<ItemRecord>());
	return item ? toItem(item) : null;
}

/** Returns false if there was nothing to delete. Recommendation history keeps its own copy, so it stays intact. */
export async function deleteItem(userId: string, itemId: string) {
	const filter = mine(userId, itemId);
	return !!filter && (await Item.deleteOne(filter)).deletedCount === 1;
}

/** Duplicate-name warning when adding an item (FR-13), case-insensitive. */
export async function hasItemNamed(userId: string, name: string) {
	return !!(await Item.exists({ userId, name: name.trim() }).collation(LT_COLLATION));
}
