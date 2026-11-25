<script lang="ts">
	import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { CATEGORY_LABELS, type HikeDifficulty, type ItemPriority } from '#lib/domain.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const DIFFICULTY_LABELS: Record<HikeDifficulty, string> = {
		EASY: 'Lengvas',
		MEDIUM: 'Vidutinis',
		HARD: 'Sudėtingas'
	};

	const PRIORITY_LABELS: Record<ItemPriority, string> = {
		REQUIRED: 'Būtinas',
		RECOMMENDED: 'Rekomenduojamas'
	};

	const formatDateTime = (iso: string) => new Date(iso).toLocaleString('lt-LT');

	let isGeneratingPdf = $state(false);
	let pdfStatus = $state<'idle' | 'success' | 'error'>('idle');
	let pdfMessage = $state('');

	function toPdfSafeText(input: string): string {
		const map: Record<string, string> = {
			ą: 'a',
			č: 'c',
			ę: 'e',
			ė: 'e',
			į: 'i',
			š: 's',
			ų: 'u',
			ū: 'u',
			ž: 'z',
			Ą: 'A',
			Č: 'C',
			Ę: 'E',
			Ė: 'E',
			Į: 'I',
			Š: 'S',
			Ų: 'U',
			Ū: 'U',
			Ž: 'Z',
			'–': '-',
			'—': '-',
			'„': '"',
			'“': '"',
			'…': '...'
		};
		return input
			.replace(/[ąčęėįšųūžĄČĘĖĮŠŲŪŽ–—„“…]/g, (ch) => map[ch] ?? ch)
			.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
	}

	function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
		const paragraphs = toPdfSafeText(text).split(/\r?\n/);
		const lines: string[] = [];

		for (const paragraph of paragraphs) {
			const trimmed = paragraph.trim();
			if (!trimmed) {
				lines.push('');
				continue;
			}
			const words = trimmed.split(/\s+/);
			let current = '';

			for (const word of words) {
				const candidate = current ? `${current} ${word}` : word;
				const width = font.widthOfTextAtSize(candidate, fontSize);
				if (width <= maxWidth) {
					current = candidate;
				} else {
					if (current) lines.push(current);
					current = word;
				}
			}
			if (current) lines.push(current);
		}

		return lines;
	}

	async function handleDownloadPdf() {
		if (!data.trip.hasPlan || !data.trip.recommendations) return;

		isGeneratingPdf = true;
		pdfStatus = 'idle';
		pdfMessage = '';

		try {
			const recs = data.trip.recommendations;
			const pdfDoc = await PDFDocument.create();
			const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
			const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

			const pageWidth = 595.28;
			const pageHeight = 841.89;
			const margin = 48;
			const maxWidth = pageWidth - margin * 2;

			let page = pdfDoc.addPage([pageWidth, pageHeight]);
			let y = pageHeight - margin;

			const ensureSpace = (needed: number) => {
				if (y - needed < margin) {
					page = pdfDoc.addPage([pageWidth, pageHeight]);
					y = pageHeight - margin;
				}
			};

			const drawLines = (
				text: string,
				options: {
					size?: number;
					bold?: boolean;
					color?: ReturnType<typeof rgb>;
					spaceAfter?: number;
				} = {}
			) => {
				const size = options.size ?? 10.5;
				const font = options.bold ? boldFont : regularFont;
				const color = options.color ?? rgb(0.12, 0.14, 0.18);
				const lineHeight = size * 1.38;
				const lines = wrapText(text, font, size, maxWidth);

				for (const line of lines) {
					ensureSpace(lineHeight);
					if (line) {
						page.drawText(line, { x: margin, y, size, font, color });
					}
					y -= lineHeight;
				}
				y -= options.spaceAfter ?? 6;
			};

			const drawHeading = (title: string) => {
				ensureSpace(26);
				y -= 4;
				drawLines(title, {
					size: 12.5,
					bold: true,
					color: rgb(0.08, 0.24, 0.42),
					spaceAfter: 4
				});
			};

			const exportedAtLabel = new Date().toLocaleString('lt-LT');
			const generatedAtLabel = formatDateTime(recs.generatedAt);

			drawLines(`Rekomendacijos: ${data.trip.location}`, {
				size: 17,
				bold: true,
				spaceAfter: 4
			});
			drawLines(`Zygio datos: ${data.trip.departureDate} - ${data.trip.returnDate}`, {
				size: 10.5,
				color: rgb(0.32, 0.36, 0.42),
				spaceAfter: 2
			});
			drawLines(`Rekomendacijos sugeneruotos: ${generatedAtLabel}`, {
				size: 10,
				color: rgb(0.32, 0.36, 0.42),
				spaceAfter: 2
			});
			drawLines(`PDF failo generavimo data: ${exportedAtLabel}`, {
				size: 10,
				bold: true,
				color: rgb(0.2, 0.24, 0.3),
				spaceAfter: 8
			});

			drawLines(
				'ISPEJIMAS: Oro prognoze nuo rekomendaciju sugeneravimo ar sios PDF ataskaitos sudarymo laiko galejo pasikeisti. Pries zygi butinai patikrinkite naujausia oro prognoze ir saugumo salygas.',
				{
					size: 10,
					bold: true,
					color: rgb(0.55, 0.25, 0.04),
					spaceAfter: 10
				}
			);

			if (recs.locationDescription) {
				drawHeading('Vietoves aprasymas');
				drawLines(recs.locationDescription);
			}

			drawHeading('Oro salygos');
			drawLines(recs.weather);

			drawHeading('Marsruto iveikiamumas ir sudetingumas');
			drawLines(`Sudetingumas: ${DIFFICULTY_LABELS[recs.difficulty]}`, {
				bold: true,
				spaceAfter: 4
			});
			drawLines(`Iveikiamumas: ${recs.feasibility}`, { spaceAfter: 4 });
			drawLines(`Fizinis pasirengimas: ${recs.fitnessComparison}`);

			drawHeading('Aprangos rekomendacijos');
			drawLines(recs.clothing);

			drawHeading('Pasiimti is inventoriaus');
			if (recs.takeFromInventory.length === 0) {
				drawLines('Daiktu nenurodyta.', { color: rgb(0.4, 0.44, 0.5) });
			} else {
				for (const item of recs.takeFromInventory) {
					drawLines(`- ${item.name} [${CATEGORY_LABELS[item.category]}]`, {
						bold: true,
						spaceAfter: 2
					});
					if (item.explanation) {
						drawLines(`  ${item.explanation}`, {
							size: 9.5,
							color: rgb(0.28, 0.32, 0.38),
							spaceAfter: 4
						});
					}
				}
			}

			const pendingToBuy = recs.toBuy.filter((item) => !item.purchased);
			const boughtItems = recs.toBuy.filter((item) => item.purchased);

			drawHeading('Reikia isigyti');
			if (pendingToBuy.length === 0) {
				drawLines('Nera neisigytu rekomenduotu daiktu.', { color: rgb(0.4, 0.44, 0.5) });
			} else {
				for (const item of pendingToBuy) {
					const prio = item.priority ? ` (${PRIORITY_LABELS[item.priority]})` : '';
					drawLines(`- ${item.name} [${CATEGORY_LABELS[item.category]}]${prio}`, {
						bold: true,
						spaceAfter: 2
					});
					if (item.explanation) {
						drawLines(`  ${item.explanation}`, {
							size: 9.5,
							color: rgb(0.28, 0.32, 0.38),
							spaceAfter: 4
						});
					}
				}
			}

			if (boughtItems.length > 0) {
				drawHeading('Jau isigyta');
				for (const item of boughtItems) {
					drawLines(`- ${item.name} [${CATEGORY_LABELS[item.category]}]`, { spaceAfter: 3 });
				}
			}

			const bytes = await pdfDoc.save();
			const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
			const url = URL.createObjectURL(blob);

			const safeSlug = toPdfSafeText(data.trip.location)
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
			const fileName = `rekomendacijos-${safeSlug || 'zygis'}-${data.trip.departureDate}.pdf`;

			const link = document.createElement('a');
			link.href = url;
			link.download = fileName;
			document.body.appendChild(link);
			link.click();
			link.remove();

			setTimeout(() => URL.revokeObjectURL(url), 1000);

			pdfStatus = 'success';
			pdfMessage = `PDF failas „${fileName}“ sėkmingai sugeneruotas ir atsisiųstas į įrenginį.`;
		} catch {
			pdfStatus = 'error';
			pdfMessage = 'Nepavyko sugeneruoti arba išsaugoti PDF failo. Bandyk dar kartą.';
		} finally {
			isGeneratingPdf = false;
		}
	}
</script>

<svelte:head><title>Rekomendacijos – {data.trip.location} – Alpinisto draugas</title></svelte:head>

<p class="back"><a href={resolve('/(app)/plan')}>← Grįžti į kelionės planavimą</a></p>

<div class="title-row">
	<div>
		<h1>Rekomendacijos: {data.trip.location}</h1>
		<p class="dates">
			Žygio datos: <strong>{data.trip.departureDate}</strong> – <strong>{data.trip.returnDate}</strong>
		</p>
	</div>

	{#if data.trip.hasPlan && data.trip.recommendations}
		<button
			class="button"
			type="button"
			disabled={isGeneratingPdf}
			onclick={handleDownloadPdf}
		>
			{isGeneratingPdf ? 'Generuojamas PDF...' : 'Atsisiųsti PDF'}
		</button>
	{/if}
</div>

<p class="notice notice-warning" role="status">
	Dirbtinio intelekto rekomendacijos yra tik patarimai, o ne garantija: jos gali būti netikslios, o
	galutinį sprendimą dėl saugumo kalnuose priimi tu.
</p>

{#if pdfStatus === 'success'}
	<p class="notice notice-success" role="status">{pdfMessage}</p>
{/if}

{#if pdfStatus === 'error'}
	<div class="notice notice-danger retry-box" role="alert">
		<span>{pdfMessage}</span>
		<button
			class="button-secondary"
			type="button"
			disabled={isGeneratingPdf}
			onclick={handleDownloadPdf}
		>
			Bandyti dar kartą
		</button>
	</div>
{/if}

{#if !data.trip.hasPlan || !data.trip.recommendations}
	<section class="panel" aria-labelledby="no-plan-title">
		<h2 id="no-plan-title">Rekomendacijos dar nesugeneruotos</h2>
		<p>
			Šiai kelionei dar nėra išsaugotų dirbtinio intelekto rekomendacijų. Grįžk į kelionės planavimo
			puslapį ir sugeneruok jas.
		</p>
		<a class="button" href={resolve('/(app)/plan')}>Eiti į kelionės planavimą</a>
	</section>
{:else}
	{@const recs = data.trip.recommendations}
	{@const pendingToBuy = recs.toBuy.filter((item) => !item.purchased)}
	{@const boughtItems = recs.toBuy.filter((item) => item.purchased)}

	<p class="meta">
		Sugeneruota: <time datetime={recs.generatedAt}>{formatDateTime(recs.generatedAt)}</time>
	</p>

	{#if form?.purchasedItemName}
		<p class="notice notice-success" role="status">
			Daiktas „{form.purchasedItemName}“ pažymėtas kaip įsigytas ir pridėtas į tavo inventorių.
		</p>
	{/if}

	{#if form?.purchaseError}
		<p class="notice notice-danger" role="alert">{form.purchaseError}</p>
	{/if}

	{#if recs.locationDescription}
		<section class="panel section" aria-labelledby="location-title">
			<h2 id="location-title">Vietovės aprašymas</h2>
			<p>{recs.locationDescription}</p>
		</section>
	{/if}

	<section class="panel section" aria-labelledby="weather-title">
		<h2 id="weather-title">Oro sąlygos</h2>
		<p class="field-hint">Tai dirbtinio intelekto įvertinimas pagal vietovę ir datas, ne orų prognozė.</p>
		<p>{recs.weather}</p>
	</section>

	<section class="panel section" aria-labelledby="feasibility-title">
		<h2 id="feasibility-title">Maršruto įveikiamumas ir sudėtingumo palyginimas</h2>
		<p>
			Maršruto sudėtingumas: <span class="tag tag-primary">{DIFFICULTY_LABELS[recs.difficulty]}</span>
		</p>
		<h3>Įveikiamumas per numatytą laiką</h3>
		<p>{recs.feasibility}</p>
		<h3>Palyginimas su fiziniu pasirengimu</h3>
		<p>{recs.fitnessComparison}</p>
	</section>

	<section class="panel section" aria-labelledby="clothing-title">
		<h2 id="clothing-title">Aprangos rekomendacijos</h2>
		<p>{recs.clothing}</p>
	</section>

	<section class="section" aria-labelledby="gear-title">
		<h2 id="gear-title">Reikalingų daiktų sąrašas</h2>

		<div class="panel gear-group">
			<h3>Pasiimti iš inventoriaus</h3>
			{#if recs.takeFromInventory.length === 0}
				<p class="field-hint">Šiam žygiui iš inventoriaus nenurodyta jokių daiktų.</p>
			{:else}
				<ul class="item-list">
					{#each recs.takeFromInventory as item (item.id)}
						<li class="item-row">
							<div>
								<strong>{item.name}</strong>
								<span class="tag">{CATEGORY_LABELS[item.category]}</span>
							</div>
							{#if item.explanation}
								<p class="item-explanation">{item.explanation}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="panel gear-group">
			<h3>Reikia įsigyti</h3>
			{#if pendingToBuy.length === 0}
				<p class="field-hint">Visi rekomenduoti trūkstami daiktai jau įsigyti arba jų nereikia.</p>
			{:else}
				<ul class="item-list">
					{#each pendingToBuy as item (item.id)}
						<li class="item-row">
							<div class="item-head">
								<div>
									<strong>{item.name}</strong>
									<span class="tag">{CATEGORY_LABELS[item.category]}</span>
									{#if item.priority}
										<span
											class="tag"
											class:tag-danger={item.priority === 'REQUIRED'}
											class:tag-warning={item.priority === 'RECOMMENDED'}
										>
											{PRIORITY_LABELS[item.priority]}
										</span>
									{/if}
								</div>
								<form method="POST" action="?/purchase" use:enhance>
									<input type="hidden" name="itemId" value={item.id} />
									<button class="button-secondary" type="submit">Įsigyta</button>
								</form>
							</div>
							{#if item.explanation}
								<p class="item-explanation">{item.explanation}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if boughtItems.length > 0}
				<div class="bought-block">
					<h4>Jau pažymėti kaip įsigyti (pridėta į inventorių)</h4>
					<ul class="item-list">
						{#each boughtItems as item (item.id)}
							<li class="item-row">
								<div>
									<strong>{item.name}</strong>
									<span class="tag">{CATEGORY_LABELS[item.category]}</span>
									<span class="tag tag-success">Įsigyta</span>
								</div>
								{#if item.explanation}
									<p class="item-explanation">{item.explanation}</p>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>
{/if}

<style>
	.back {
		margin-bottom: var(--space-4);
	}
	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.retry-box {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.dates,
	.meta {
		font-size: var(--text-s);
		color: var(--c-text-muted);
	}
	.section {
		margin-top: var(--space-5);
	}
	.gear-group {
		margin-top: var(--space-4);
	}
	.item-list {
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}
	.item-row {
		padding-block: var(--space-3);
		border-top: 1px solid var(--c-line);
	}
	.item-row:first-child {
		padding-top: 0;
		border-top: 0;
	}
	.item-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.item-explanation {
		margin: var(--space-2) 0 0;
		font-size: var(--text-s);
	}
	.bought-block {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--c-line);
	}
</style>