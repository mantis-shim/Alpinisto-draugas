// Self-check for the fitness questionnaire rules (UC-5). Run: npm run check:fitness
import assert from 'node:assert/strict';
import { fitnessLevel, parseFitnessAnswers } from '#lib/fitness.ts';

const level = (averageDailySteps: number, hikesLast3Years: number) =>
	fitnessLevel({ averageDailySteps, hikesLast3Years });

// Level formula (FR-33): steps 0/1/2 points at 5 000 and 10 000, hikes at 1 and 3; 0–1 LOW, 2–3 MEDIUM, 4 HIGH
assert.equal(level(0, 0), 'LOW');
assert.equal(level(4_999, 0), 'LOW');
assert.equal(level(5_000, 0), 'LOW', '1 point');
assert.equal(level(0, 1), 'LOW', '1 point');
assert.equal(level(10_000, 0), 'MEDIUM', '2 points from steps alone');
assert.equal(level(5_000, 1), 'MEDIUM');
assert.equal(level(0, 3), 'MEDIUM');
assert.equal(level(9_999, 2), 'MEDIUM', 'boundary below both upper thresholds');
assert.equal(level(10_000, 1), 'MEDIUM', '3 points');
assert.equal(level(10_000, 3), 'HIGH');
assert.equal(level(25_000, 40), 'HIGH');

// Validation (FR-32): every question must be answered with a whole number
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
assert.ok(parse('100001', '1').errors?.averageDailySteps, 'typo-sized steps');
assert.ok(parse('6000', '1001').errors?.hikesLast3Years, 'typo-sized hikes');

console.log('fitness: ok');
