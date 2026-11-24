<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { FITNESS_LEVEL_LABELS } from '#lib/fitness.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const errors = $derived(form?.errors ?? {});
	// After a failed submit keep what the user typed, otherwise show the saved answers (FR-34).
	const values = $derived(
		form?.values ?? {
			averageDailySteps: String(data.assessment?.averageDailySteps ?? ''),
			hikesLast3Years: String(data.assessment?.hikesLast3Years ?? '')
		}
	);
</script>

<svelte:head><title>Fizinio pasirengimo klausimynas – Alpinisto draugas</title></svelte:head>

<p class="back"><a href={resolve('/(app)/account')}>← Grįžti į paskyrą</a></p>

<h1>Fizinio pasirengimo klausimynas</h1>
<p>
	Du trumpi klausimai padės objektyviau įvertinti tavo fizinį pasirengimą. Rekomendacijose pagal jį
	įspėsime, jei pasirinktas žygis gali būti per sunkus.
</p>

{#if data.assessment}
	<div class="notice" class:notice-success={form?.saved} role="status">
		<p>
			{#if form?.saved}Atsakymai išsaugoti.{/if}
			Tavo fizinio pasirengimo lygis: <strong>{FITNESS_LEVEL_LABELS[data.assessment.level]}</strong>.
		</p>
		<p class="field-hint">
			Atnaujinta {data.assessment.completedDate}. Atsakymus gali pakeisti bet kada, lygis bus
			perskaičiuotas.
		</p>
	</div>
{/if}

{#if form?.errors}
	<p class="notice notice-danger" role="alert">Atsakyk į visus klausimus ir pataisyk pažymėtus laukus.</p>
{/if}

<!-- novalidate: the server checks everything and answers in Lithuanian -->
<form method="POST" novalidate use:enhance={() => ({ update }) => update({ reset: false })}>
	<p class="field-hint">Į abu klausimus atsakyti privaloma.</p>

	<div class="field">
		<label for="averageDailySteps">Kiek vidutiniškai žingsnių nueini per dieną?</label>
		<input
			id="averageDailySteps"
			name="averageDailySteps"
			type="text"
			inputmode="numeric"
			autocomplete="off"
			required
			value={values.averageDailySteps}
			aria-invalid={errors.averageDailySteps ? 'true' : undefined}
			aria-describedby="steps-hint{errors.averageDailySteps ? ' steps-error' : ''}"
		/>
		<p class="field-hint" id="steps-hint">
			Tikslų skaičių rasi telefono sveikatos programėlėje. Jei jos nenaudoji, įvertink apytiksliai:
			1 km – maždaug 1 300 žingsnių.
		</p>
		{#if errors.averageDailySteps}
			<p class="field-error" id="steps-error">{errors.averageDailySteps}</p>
		{/if}
	</div>

	<div class="field">
		<label for="hikesLast3Years">Kiek žygių kalnuose turėjai per pastaruosius 3 metus?</label>
		<input
			id="hikesLast3Years"
			name="hikesLast3Years"
			type="text"
			inputmode="numeric"
			autocomplete="off"
			required
			value={values.hikesLast3Years}
			aria-invalid={errors.hikesLast3Years ? 'true' : undefined}
			aria-describedby="hikes-hint{errors.hikesLast3Years ? ' hikes-error' : ''}"
		/>
		<p class="field-hint" id="hikes-hint">
			Skaičiuok bent pusę dienos trukusius žygius kalnų takais. Jei nė vieno, įrašyk 0.
		</p>
		{#if errors.hikesLast3Years}
			<p class="field-error" id="hikes-error">{errors.hikesLast3Years}</p>
		{/if}
	</div>

	<button type="submit">Pateikti</button>
</form>

<details>
	<summary>Kaip apskaičiuojamas lygis?</summary>
	<p>Už kiekvieną atsakymą gauni nuo 0 iki 3 balų:</p>
	<ul>
		<li>
			Žingsniai per dieną: iki 4 999 – 0 balų, nuo 5 000 iki 7 999 – 1 balas, nuo 8 000 iki 11 999 – 2 balai, nuo 12 000 – 3
			balai;
		</li>
		<li>Žygiai kalnuose per 3 metus: 0 – 0 balų, 1–2 – 1 balas, 3–5 – 2 balai, 6 ir daugiau – 3 balai.</li>
	</ul>
	<p>Surinkus 0–2 balus lygis žemas, 3–4 balus – vidutinis, 5–6 balus – aukštas.</p>
</details>

<style>
	.back {
		margin-bottom: var(--space-4);
	}
	details {
		margin-top: var(--space-7);
	}
</style>
