// Self-check for inventory CRUD against the dev DB. Run: docker compose exec app npm run check:inventory
// Uses two throwaway user ids (no user documents needed) and deletes their items afterwards.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Item } from '#lib/server/models.ts';
import { createItem, deleteItem, getItem, hasItemNamed, listItems, updateItem } from '#lib/server/inventory.ts';
import { groupAttributes, parseAttributes, readItemForm, typedAttribute } from '#lib/validation.ts';

// "Kiti požymiai" textarea: browsers submit \r\n, values may contain ":"
assert.deepEqual(parseAttributes('spalva: ruda\r\n\r\n neperšlampamas \r\nišvykimas: 10:30\r\n: be pavadinimo'), [
	{ name: 'spalva', value: 'ruda' },
	{ name: 'neperšlampamas', value: '' },
	{ name: 'išvykimas', value: '10:30' }
]);

// Size limits are enforced on the server, not just by the <input maxlength>
const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [key, value] of Object.entries({ category: 'OTHER', ...fields })) data.set(key, value);
	return readItemForm(data);
};
const long = 'a'.repeat(101);
assert.ok(form({ name: 'a'.repeat(100) }).ok, '100 characters is fine');
assert.ok(form({ name: long }).errors.name, 'name too long');
assert.ok(form({ name: 'X', attributes: Array(31).fill('a').join('\n') }).errors.attributes, 'too many attributes');
assert.ok(form({ name: 'X', attributes: `spalva: ${long}` }).errors.attributes, 'attribute value too long');

// Tag chips: one field per tag plus the one being typed, all read together
const tags = new FormData();
tags.set('name', 'X');
tags.set('category', 'OTHER');
for (const tag of ['spalva: ruda', 'neperšlampamas', 'Spalva: juoda']) tags.append('attributes', tag);
assert.equal(readItemForm(tags).input.attributes.length, 3);
// The "Požymis" + "Reikšmė" pair still being typed is saved too
tags.set('attributeName', ' svoris: ');
tags.set('attributeValue', ' 1:2 kg ');
assert.deepEqual(readItemForm(tags).input.attributes.at(-1), { name: 'svoris', value: '1:2 kg' }, '":" only splits once');
assert.deepEqual(typedAttribute('', ' sunkus '), { name: 'sunkus', value: '' }, 'a value alone is a plain tag');
assert.equal(typedAttribute(' ', ' '), null);
tags.delete('attributeName');
tags.delete('attributeValue');
// Same name together in one colour (case and Lithuanian letters ignored), valueless tags last and uncoloured
const grouped = groupAttributes(readItemForm(tags).input.attributes);
assert.deepEqual(
	grouped.map((g) => `${g.attribute.name}:${g.attribute.value}`),
	['spalva:ruda', 'Spalva:juoda', 'neperšlampamas:']
);
assert.equal(grouped[0].hue, grouped[1].hue);
assert.equal(grouped[2].hue, undefined);
assert.notEqual(groupAttributes(parseAttributes('a: 1\nb: 2'))[1].hue, grouped[0].hue, 'another name, another colour');

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
	// the schema repeats the form's size limits, for code paths that skip the form (UC-3, UC-8)
	await assert.rejects(createItem(me, { name: long, category: 'OTHER' }), mongoose.Error.ValidationError);
	const tooMany = Array.from({ length: 31 }, (_, i) => ({ name: `a${i}` }));
	await assert.rejects(updateItem(me, boots.id, { attributes: tooMany }), mongoose.Error.ValidationError);

	// Read + update
	assert.equal((await getItem(me, boots.id))?.name, 'Žygio batai');
	const renamed = await updateItem(me, boots.id, { name: 'Kalnų batai' });
	assert.equal(renamed?.name, 'Kalnų batai');
	assert.deepEqual(renamed?.suitability, ['COLD'], 'fields not passed stay unchanged');

	// Duplicate names (FR-13)
	assert.ok(await hasItemNamed(me, 'kalnų BATAI '), 'case-insensitive');
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
