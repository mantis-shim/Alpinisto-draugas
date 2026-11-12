// Demo data for development and the course demo. Run: docker compose exec app npm run db:seed
// Safe to re-run: it deletes and recreates only the demo user and their data.
import mongoose from 'mongoose';
import { PRIVACY_POLICY_VERSION } from '#lib/domain.ts';
import { Hike, Item, Session, User } from '#lib/server/models.ts';
import { hashPassword } from '#lib/server/password.ts';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Demo1234'; // demo-only account, documented in CLAUDE.md

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set (see .env.example)');
await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([User.init(), Item.init(), Hike.init(), Session.init()]); // build indexes before writing

const old = await User.findOne({ email: DEMO_EMAIL });
if (old) {
	const mine = { userId: old._id };
	await Promise.all([Item.deleteMany(mine), Hike.deleteMany(mine), Session.deleteMany(mine)]);
	await old.deleteOne();
}

const user = await User.create({
	email: DEMO_EMAIL,
	passwordHash: await hashPassword(DEMO_PASSWORD),
	fitnessAssessment: {
		averageDailySteps: 7500,
		hikesLast3Years: 2,
		level: 'MEDIUM',
		completedDate: new Date('2026-08-01')
	},
	consents: [{ version: PRIVACY_POLICY_VERSION, givenAt: new Date() }]
});

// No first-aid kit and no gloves on purpose: the demo recommendations show them as missing.
const items = await Item.insertMany(
	[
		{
			name: 'Žygio batai',
			category: 'FOOTWEAR',
			suitability: ['COLD', 'WARM'],
			attributes: [{ name: 'neperšlampami' }, { name: 'spalva', value: 'ruda' }]
		},
		{
			name: 'Neperšlampama striukė',
			category: 'CLOTHING',
			suitability: ['COLD', 'WARM'],
			attributes: [{ name: 'neperšlampama' }, { name: 'spalva', value: 'mėlyna' }]
		},
		{ name: 'Flisinis džemperis', category: 'CLOTHING', suitability: ['COLD'] },
		{
			name: 'Kuprinė 30 l',
			category: 'OTHER',
			suitability: ['COLD', 'WARM', 'HOT'],
			attributes: [{ name: 'talpa', value: '30 l' }]
		},
		{ name: 'Gertuvė 1 l', category: 'OTHER', suitability: ['COLD', 'WARM', 'HOT'] },
		{ name: 'Galvos žibintuvėlis', category: 'TOOLS', suitability: ['COLD', 'WARM', 'HOT'] },
		{ name: 'Tatrų žemėlapis', category: 'NAVIGATION', suitability: ['COLD', 'WARM', 'HOT'] },
		{ name: 'Saulės akiniai', category: 'OTHER', suitability: ['WARM', 'HOT'] },
		{
			name: 'Miegmaišis',
			category: 'SLEEP',
			suitability: ['COLD'],
			attributes: [{ name: 'komforto temperatūra', value: '5 °C' }]
		}
	].map((item) => ({ ...item, userId: user._id }))
);
const owned = (name: string, explanation: string) => {
	const item = items.find((i) => i.name === name)!;
	return { name, category: item.category, explanation, owned: true, inventoryItemId: item._id };
};

await Hike.create({
	userId: user._id,
	location: 'Rysy, Tatrai',
	departureDate: new Date('2026-08-14'),
	returnDate: new Date('2026-08-14'),
	season: 'SUMMER',
	plan: {
		request: {
			createdAt: new Date('2026-08-10T18:00:00Z'),
			sentContent: JSON.stringify({
				location: 'Rysy, Tatrai',
				departureDate: '2026-08-14',
				returnDate: '2026-08-14',
				fitnessLevel: 'MEDIUM',
				inventory: items.map((i) => i.name)
			}),
			usedItemIds: items.map((i) => i._id)
		},
		recommendations: {
			difficulty: 'HARD',
			feasibility:
				'Maršrutas nuo Palenica Białczańska iki Rysy viršūnės ir atgal yra apie 26 km su 1500 m aukščio. Jis užtrunka 10–12 valandų, todėl per vieną dieną įveikiamas tik išėjus anksti ryte.',
			fitnessComparison:
				'Tavo pasirengimo lygis vidutinis, o maršrutas sunkus: viršutinėje dalyje yra uolų ruožų su grandinėmis. Pirmam kartui verta rinktis lengvesnį maršrutą, pavyzdžiui, iki Morskie Oko ežero.',
			weather:
				'Rugpjūčio viduryje Tatruose dieną slėnyje būna apie 15–20 °C, viršūnėje 5–10 °C. Po pietų dažnai kyla perkūnija, todėl į viršūnę reikėtų užlipti iki vidurdienio. Tai įvertinimas, o ne orų prognozė.',
			clothing:
				'Rengtis sluoksniais: sintetiniai marškinėliai, šiltas flisas ir neperšlampama striukė. Viršūnėje pravers kepurė ir plonos pirštinės.',
			locationDescription:
				'Rysy yra aukščiausia Lenkijos viršūnė (2499 m) Aukštuosiuose Tatruose, ant Lenkijos ir Slovakijos sienos. Takas veda pro Morskie Oko ir Czarny Staw ežerus.',
			generatedAt: new Date('2026-08-10T18:00:30Z'),
			items: [
				owned('Žygio batai', 'Uolėtam ir šlapiam takui reikia tvirtų, neperšlampamų batų.'),
				owned('Neperšlampama striukė', 'Apsaugos nuo lietaus ir vėjo viršūnėje.'),
				owned('Flisinis džemperis', 'Viršūnėje gali būti tik 5 °C.'),
				owned('Kuprinė 30 l', 'Užtenka vienos dienos žygiui.'),
				owned('Gertuvė 1 l', 'Vandeniui, bet vienos neužteks (žr. žemiau).'),
				owned('Galvos žibintuvėlis', 'Jei grįžimas užsitęs iki sutemų.'),
				owned('Tatrų žemėlapis', 'Kalnuose mobilusis ryšys gali dingti.'),
				owned('Saulės akiniai', 'Aukštai kalnuose saulė stipresnė.'),
				{
					name: 'Vaistinėlė',
					category: 'MEDICINE',
					explanation: 'Pirmajai pagalbai susižeidus trasoje.',
					owned: false,
					priority: 'REQUIRED'
				},
				{
					name: 'Papildoma gertuvė 1 l',
					category: 'OTHER',
					explanation: 'Visai dienai reikia bent 2 l vandens, o aukščiau ežerų jo papildyti negalėsi.',
					owned: false,
					priority: 'REQUIRED'
				},
				{
					name: 'Pirštinės',
					category: 'CLOTHING',
					explanation: 'Laikytis už grandinių ir apsisaugoti nuo šalčio viršūnėje.',
					owned: false,
					priority: 'RECOMMENDED'
				},
				{
					name: 'Šalmas',
					category: 'TOOLS',
					explanation: 'Viršutinėje dalyje nuo šlaito gali kristi akmenys.',
					owned: false,
					priority: 'RECOMMENDED'
				}
			]
		}
	}
});

console.log(`Demo user ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (${items.length} items, 1 hike)`);
await mongoose.disconnect();
