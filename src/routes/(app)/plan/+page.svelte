<script lang="ts">
	import { enhance } from '$app/forms';
	import { SEASON_LABELS } from '#lib/trip.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// "Keisti" opens the form for the saved trip (UC-6 7a); a successful save closes it again.
	let editing = $state(false);

	const showForm = $derived(!data.trip || editing);
	const errors = $derived(form?.errors ?? {});
	const values = $derived(form?.values ?? data.trip ?? { location: '', departureDate: '', returnDate: '' });
</script>

<svelte:head><title>Kelionės planavimas – Alpinisto draugas</title></svelte:head>

<h1>Kelionės planavimas</h1>

{#if showForm}
	<p>Nurodyk, kur ir kada keliauji. Pagal tai įvertinsime oro sąlygas, žygio trukmę ir reikalingus daiktus.</p>

	{#if form?.errors}
		<p class="notice notice-danger" role="alert">Patikslink pažymėtus kelionės duomenis.</p>
	{/if}

	<!-- novalidate: the server checks everything and answers in Lithuanian -->
	<form
		method="POST"
		action="?/save"
		novalidate
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') editing = false;
			}}
	>
		<p class="field-hint">Visi laukai privalomi.</p>

		<div class="field">
			<label for="location">Žygio vieta</label>
			<input
				id="location"
				name="location"
				type="text"
				autocomplete="off"
				required
				maxlength="200"
				value={values.location}
				aria-invalid={errors.location ? 'true' : undefined}
				aria-describedby="location-hint{errors.location ? ' location-error' : ''}"
			/>
			<p class="field-hint" id="location-hint">
				Kalnas, maršrutas ar vietovė, pvz., Triglavas, Slovėnija.
			</p>
			{#if errors.location}<p class="field-error" id="location-error">{errors.location}</p>{/if}
		</div>

		<div class="dates">
			<div class="field">
				<label for="departureDate">Išvykimo data</label>
				<input
					id="departureDate"
					name="departureDate"
					type="date"
					required
					min={data.today}
					value={values.departureDate}
					aria-invalid={errors.departureDate ? 'true' : undefined}
					aria-describedby={errors.departureDate ? 'departure-error' : undefined}
				/>
				{#if errors.departureDate}
					<p class="field-error" id="departure-error">{errors.departureDate}</p>
				{/if}
			</div>

			<div class="field">
				<label for="returnDate">Grįžimo data</label>
				<input
					id="returnDate"
					name="returnDate"
					type="date"
					required
					min={data.today}
					value={values.returnDate}
					aria-invalid={errors.returnDate ? 'true' : undefined}
					aria-describedby={errors.returnDate ? 'return-error' : undefined}
				/>
				{#if errors.returnDate}<p class="field-error" id="return-error">{errors.returnDate}</p>{/if}
			</div>
		</div>

		<div class="actions">
			<button type="submit">Išsaugoti</button>
			{#if data.trip}
				<button class="button-secondary" type="button" onclick={() => (editing = false)}>Atšaukti</button>
			{/if}
		</div>
	</form>
{:else if data.trip}
	{#if form?.saved}
		<p class="notice notice-success" role="status">Kelionės duomenys išsaugoti.</p>
	{/if}

	<section class="panel" aria-labelledby="summary-title">
		<h2 id="summary-title">Kelionės santrauka</h2>
		<dl>
			<dt>Žygio vieta</dt>
			<dd>{data.trip.location}</dd>
			<dt>Išvykimo data</dt>
			<dd>{data.trip.departureDate}</dd>
			<dt>Grįžimo data</dt>
			<dd>{data.trip.returnDate}</dd>
			<dt>Trukmė</dt>
			<dd>{data.trip.days} d.</dd>
			<dt>Sezonas</dt>
			<dd>{SEASON_LABELS[data.trip.season]}</dd>
		</dl>

		{#if data.trip.far}
			<p class="notice notice-warning" role="status">
				Iki išvykimo dar daug laiko, todėl oro sąlygų įvertinimas gali būti netikslus ir keistis. Prieš
				kelionę pasitikrink orų prognozę.
			</p>
		{/if}

		<div class="actions">
			<button class="button-secondary" type="button" onclick={() => (editing = true)}>Keisti</button>
			<!-- ponytail: enabled by UC-7 (recommendations), which isn't built yet -->
			<button type="button" disabled aria-describedby="generate-note">Generuoti rekomendacijas</button>
		</div>
		<p class="field-hint" id="generate-note">Rekomendacijų generavimas dar kuriamas.</p>
	</section>
{/if}

<style>
	/* two equal columns, one under the other on narrow screens; an error message wraps instead of widening its field */
	.dates {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		align-items: start;
		gap: 0 var(--space-5);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}
</style>
