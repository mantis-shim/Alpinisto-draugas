// Self-check for the fitness questionnaire rules (UC-5). Run: npm run check:fitness
import assert from 'node:assert/strict';
import { fitnessLevel, hikesPoints, parseFitnessAnswers, stepsPoints } from '#lib/fitness.ts';

const level = (averageDailySteps: number, hikesLast3Years: number) =>
	fitnessLevel({ averageDailySteps, hikesLast3Years });

// Points per answer, 0–3 (decision 2026-11-24)
const stepCases: [number, number][] = [[0, 0], [4_999, 0], [5_000, 1], [7_999, 1], [8_000, 2], [11_999, 2], [12_000, 3], [50_000, 3]];
for (const [steps, points] of stepCases) assert.equal(stepsPoints(steps), points, `${steps} steps`);
const hikeCases: [number, number][] = [[0, 0], [1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [150, 3]];
for (const [hikes, points] of hikeCases) assert.equal(hikesPoints(hikes), points, `${hikes} hikes`);

// Level (FR-33): sum 0–2 LOW, 3–4 MEDIUM, 5–6 HIGH
assert.equal(level(0, 0), 'LOW');
assert.equal(level(6_000, 1), 'LOW', '2 points');
assert.equal(level(9_000, 2), 'MEDIUM', '3 points');
assert.equal(level(10_000, 3), 'MEDIUM', '4 points');
assert.equal(level(12_000, 4), 'HIGH', '5 points');
assert.equal(level(50_000, 150), 'HIGH');
// One strong answer doesn't make up for a weak one: at most MEDIUM
assert.equal(level(50_000, 0), 'MEDIUM', 'very fit, no mountain hikes');
assert.equal(level(500, 150), 'MEDIUM', 'experienced but inactive');
assert.equal(level(4_999, 150), 'MEDIUM');

// Validation (FR-32): every question must be answered with a whole number in range
const parse = (averageDailySteps: string, hikesLast3Years: string) =>
	parseFitnessAnswers({ averageDailySteps, hikesLast3Years });

assert.deepEqual(parse('6000', '2').answers, { averageDailySteps: 6000, hikesLast3Years: 2 });
assert.deepEqual(parse(' 10 000 ', '0').answers, { averageDailySteps: 10000, hikesLast3Years: 0 }, 'spaces ok');

const empty = parse('', '  ').errors;
assert.ok(empty?.averageDailySteps && empty.hikesLast3Years, 'both unanswered questions are marked');
assert.ok(parse('6000', '').errors?.hikesLast3Years, 'one unanswered question');
assert.equal(parse('6000', '').errors?.averageDailySteps, undefined, 'answered question has no error');

for (const bad of ['-5', '5.5', '5,5', 'daug', '1e4']) {
	assert.ok(parse(bad, '1').errors?.averageDailySteps, `not a whole number: "${bad}"`);
}
assert.ok(parse('50000', '150').answers, 'the limits themselves are fine');
assert.ok(parse('500', '0').answers, 'lowest allowed answers');
assert.match(parse('499', '1').errors?.averageDailySteps ?? '', /apytikslį/, 'too few steps');
assert.ok(parse('0', '0').errors?.averageDailySteps, '0 steps is rejected');
assert.equal(parse('500', '0').errors, undefined, '0 hikes is fine');
assert.match(parse('50001', '1').errors?.averageDailySteps ?? '', /50 000/, 'too many steps');
assert.match(parse('6000', '151').errors?.hikesLast3Years ?? '', /150/, 'too many hikes');
assert.ok(parse('100000', '1000').errors?.hikesLast3Years, "a teammate's example is rejected");

console.log('fitness: ok');
