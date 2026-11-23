// Self-check for inventory CRUD against the dev DB. Run: docker compose exec app npm run check:inventory
// Uses two throwaway user ids (no user documents needed) and deletes their items afterwards.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Item } from '#lib/server/models.ts';
import { createItem, deleteItem, getItem, hasItemNamed, listItems, updateItem } from '#lib/server/inventory.ts';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (see .env.example)');
await mongoose.connect(process.env.MONGODB_URI);

const me = new mongoose.Types.ObjectId().toString();
const other = new mongoose.Types.ObjectId().toString();
try {
	// Create + list
	const boots = await createItem(me, {
		name: '  Žygio batai ',
		category: 'FOOTWEAR',
		suitability: ['COLD'],
		attributes: [{ name: 'neperšlampami' }, { name: 'spalva', value: 'ruda' }]
	});
	assert.equal(boots.name, 'Žygio batai', 'name is trimmed');
	assert.deepEqual(boots.attributes, [
		{ name: 'neperšlampami', value: '' },
		{ name: 'spalva', value: 'ruda' }
	]);
	await createItem(me, { name: 'Gertuvė', category: 'OTHER' });
	await createItem(me, { name: 'Čiužinys', category: 'SLEEP' });
	await createItem(me, { name: 'Ąsotis', category: 'OTHER' });
	await createItem(other, { name: 'Svetimas daiktas', category: 'OTHER' });
	assert.deepEqual(
		(await listItems(me)).map((i) => i.name),
		['Ąsotis', 'Čiužinys', 'Gertuvė', 'Žygio batai'], // binary order would put Gertuvė first
		'only my items, sorted the Lithuanian way'
	);

	// Validation
	await assert.rejects(createItem(me, { name: '   ', category: 'OTHER' }), mongoose.Error.ValidationError);
	// @ts-expect-error unknown category
	await assert.rejects(createItem(me, { name: 'X', category: 'NOPE' }), mongoose.Error.ValidationError);
	await assert.rejects(updateItem(me, boots.id, { name: '' }), mongoose.Error.ValidationError);

	// Read + update
	assert.equal((await getItem(me, boots.id))?.name, 'Žygio batai');
	const renamed = await updateItem(me, boots.id, { name: 'Kalnų batai' });
	assert.equal(renamed?.name, 'Kalnų batai');
	assert.deepEqual(renamed?.suitability, ['COLD'], 'fields not passed stay unchanged');

	// Duplicate names (FR-13)
	assert.ok(await hasItemNamed(me, 'kalnų BATAI '), 'case-insensitive');
	assert.ok(!(await hasItemNamed(me, 'Kalnų batai', boots.id)), 'editing item does not match itself');
	assert.ok(!(await hasItemNamed(me, 'Svetimas daiktas')), "other users' items don't count");

	// Someone else's item or a malformed id is "not found", never touched
	assert.equal(await getItem(other, boots.id), null);
	assert.equal(await updateItem(other, boots.id, { name: 'Pavogta' }), null);
	assert.equal(await deleteItem(other, boots.id), false);
	assert.equal(await getItem(me, 'garbage'), null);
	assert.equal(await deleteItem(me, 'garbage'), false);

	// Delete
	assert.ok(await deleteItem(me, boots.id));
	assert.equal(await getItem(me, boots.id), null);
	assert.ok(!(await deleteItem(me, boots.id)), 'second delete finds nothing');

	console.log('inventory: ok');
} finally {
	await Item.deleteMany({ userId: { $in: [me, other] } });
	await mongoose.disconnect();
}
