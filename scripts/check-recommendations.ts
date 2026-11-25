// Self-check for UC-7 without the API or the DB: what is sent, and how the answer is checked and mapped.
// Run: npm run check:recommendations
import assert from 'node:assert/strict';
import type { InventoryItem } from '#lib/domain.ts';
import {
	InvalidAnswer,
	RECOMMENDATION_SCHEMA,
	buildRequest,
	mockAnswer,
	parseRecommendations
} from '#lib/server/gemini/recommendation-format.ts';

const boots: InventoryItem = {
	id: '665f00000000000000000001',
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	suitability: ['COLD', 'WARM'],
	attributes: [{ name: 'neperšlampamas', value: '' }]
};
const lamp: InventoryItem = { id: '665f00000000000000000002', name: 'Galvos žibintuvėlis', category: 'TOOLS', suitability: [], attributes: [] };
const trip = { location: 'Triglavas, Slovėnija', departureDate: '2026-12-05', returnDate: '2026-12-07', days: 3, season: 'WINTER' as const };

// What is sent (FR-39): trip, fitness level, inventory; never database ids
const { user, keyed } = buildRequest({ trip, fitnessLevel: 'MEDIUM', inventory: [boots, lamp] });
const sent = JSON.parse(user);
assert.equal(sent.trip.location, 'Triglavas, Slovėnija');
assert.equal(sent.trip.durationDays, 3);
assert.equal(sent.trip.season, 'Žiema');
assert.equal(sent.fitnessLevel, 'vidutinis');
assert.deepEqual(sent.inventory.map((item: { key: string }) => item.key), ['d1', 'd2']);
assert.ok(!user.includes(boots.id) && !user.includes(lamp.id), 'no database ids in the request');
assert.equal(keyed.get('d1'), boots);
assert.equal(JSON.parse(buildRequest({ trip, fitnessLevel: null, inventory: [] }).user).fitnessLevel, null, 'no questionnaire');

// Strict schema: every property required, nothing extra
assert.equal(RECOMMENDATION_SCHEMA.additionalProperties, false);
assert.deepEqual([...RECOMMENDATION_SCHEMA.required].sort(), Object.keys(RECOMMENDATION_SCHEMA.properties).sort());

// A valid answer
const answer = {
	difficulty: 'hard', // enum capitalisation isn't guaranteed
	feasibility: ' Per 3 dienas įveikiama. ',
	fitnessComparison: 'Gali būti sunku.',
	weather: 'Šalta, galimas sniegas.',
	clothing: 'Šilti sluoksniai.',
	locationDescription: '',
	takeFromInventory: [
		{ key: 'd1', explanation: 'Neperšlampami batai.' },
		{ key: 'd1', explanation: 'Dar kartą.' }, // repeated key
		{ key: 'd9', explanation: 'Tokio nėra.' } // unknown key
	],
	toBuy: [
		{ name: 'Raketės', category: 'tools', priority: 'required', explanation: 'Sniegui.' },
		{ name: 'Kepurė', category: 'HATS', priority: 'MAYBE', explanation: 'Šalčiui.' }, // unknown enums
		{ name: '  ', category: 'OTHER', priority: 'RECOMMENDED', explanation: 'Be pavadinimo.' }
	]
};
const parsed = parseRecommendations(JSON.stringify(answer), keyed);
assert.equal(parsed.difficulty, 'HARD');
assert.equal(parsed.feasibility, 'Per 3 dienas įveikiama.', 'trimmed');
assert.equal(parsed.locationDescription, undefined, 'empty description is left out (FR-45)');
assert.deepEqual(parsed.items[0], {
	name: 'Žygio batai',
	category: 'FOOTWEAR',
	explanation: 'Neperšlampami batai.',
	owned: true,
	inventoryItemId: boots.id,
	purchased: false
});
assert.equal(parsed.items.filter((item) => item.owned).length, 1, 'repeated and unknown keys dropped');
const missing = parsed.items.filter((item) => !item.owned);
assert.deepEqual(missing.map((item) => [item.name, item.category, item.priority]), [
	['Raketės', 'TOOLS', 'REQUIRED'],
	['Kepurė', 'OTHER', 'RECOMMENDED']
]);
assert.ok(missing.every((item) => item.purchased === false && item.inventoryItemId === undefined));

// Invalid answers are rejected, not stored
const broken = (change: Record<string, unknown>) => () => parseRecommendations(JSON.stringify({ ...answer, ...change }), keyed);
assert.throws(() => parseRecommendations('ne JSON', keyed), InvalidAnswer);
assert.throws(broken({ difficulty: 'EXTREME' }), InvalidAnswer);
assert.throws(broken({ weather: '' }), InvalidAnswer);
assert.throws(broken({ toBuy: 'nėra' }), InvalidAnswer);

// The mock answer goes through the same checks
const mocked = parseRecommendations(mockAnswer(keyed, null), keyed);
assert.equal(mocked.items.filter((item) => item.owned).length, 2);
assert.match(mocked.fitnessComparison, /neužpildytas/);
assert.ok(parseRecommendations(mockAnswer(new Map(), 'LOW'), new Map()).items.every((item) => !item.owned), 'empty inventory');

console.log('recommendations: ok');
