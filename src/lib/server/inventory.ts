// Inventory CRUD (UC-2, UC-4). Every query is scoped by userId, so a user can only reach their own items.
// Returns plain objects with a string id, ready to hand to a page (Mongoose documents are not serialisable).
import { isObjectIdOrHexString } from 'mongoose';
import type { InventoryItem, ItemInput } from '#lib/domain.ts';
import { Item } from '#lib/server/models.ts';

// Lithuanian alphabetical order (Ą next to A, not after Z); strength 2 also makes comparisons case-insensitive
const lt = { locale: 'lt', strength: 2 };

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
	const items = await Item.find({ userId }).collation(lt).sort({ name: 1 }).lean<ItemRecord[]>();
	return items.map(toItem);
}

export async function getItem(userId: string, itemId: string) {
	const filter = mine(userId, itemId);
	const item = filter && (await Item.findOne(filter).lean<ItemRecord>());
	return item ? toItem(item) : null;
}

/** Throws mongoose.Error.ValidationError on an empty name or an unknown category / suitability. */
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

/** Duplicate-name warning for FR-13 (case-insensitive). Pass exceptId when editing, so the item doesn't match itself. */
export async function hasItemNamed(userId: string, name: string, exceptId?: string) {
	const filter = { userId, name: name.trim() };
	if (exceptId && isObjectIdOrHexString(exceptId)) Object.assign(filter, { _id: { $ne: exceptId } });
	return !!(await Item.exists(filter).collation(lt));
}
