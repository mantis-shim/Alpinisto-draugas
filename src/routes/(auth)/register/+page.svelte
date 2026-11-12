<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { PRIVACY_POLICY_VERSION } from '#lib/domain.ts';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const errors = $derived(form?.errors ?? {});
</script>

<svelte:head><title>Registracija – Alpinisto draugas</title></svelte:head>

<h1>Registracija</h1>
<p>Paskyroje saugosime tavo inventorių ir kelionių rekomendacijas.</p>

{#if errors.emailTaken}
	<p class="notice notice-danger" role="alert">
		Paskyra su šiuo el. paštu jau yra. <a href={resolve('/(auth)/login')}>Prisijungti</a>
	</p>
{/if}

<!-- novalidate: the server checks everything and answers in Lithuanian -->
<form method="POST" novalidate use:enhance>
	<div class="field">
		<label for="email">El. paštas</label>
		<input
			id="email"
			name="email"
			type="email"
			autocomplete="email"
			required
			value={form?.email ?? ''}
			aria-invalid={errors.email || errors.emailTaken ? 'true' : undefined}
			aria-describedby={errors.email ? 'email-error' : undefined}
		/>
		{#if errors.email}<p class="field-error" id="email-error">{errors.email}</p>{/if}
	</div>

	<div class="field">
		<label for="password">Slaptažodis</label>
		<input
			id="password"
			name="password"
			type="password"
			autocomplete="new-password"
			required
			aria-invalid={errors.password ? 'true' : undefined}
			aria-describedby="password-hint{errors.password ? ' password-error' : ''}"
		/>
		<p class="field-hint" id="password-hint">
			Bent 8 simboliai, bent viena didžioji raidė ir bent vienas skaičius.
		</p>
		{#if errors.password}
			<div id="password-error">
				{#each errors.password as problem (problem)}<p class="field-error">{problem}</p>{/each}
			</div>
		{/if}
	</div>

	<fieldset>
		<legend>Duomenų tvarkymas</legend>
		<ul class="policy">
			<li>
				Saugome tavo el. paštą, inventorių, fizinio pasirengimo klausimyno atsakymus ir kelionių
				istoriją. Slaptažodžio negali perskaityti net mes.
			</li>
			<li>
				Rekomendacijoms sudaryti kelionės vietą ir datas, pasirengimo lygį ir inventoriaus sąrašą
				siunčiame dirbtinio intelekto paslaugos teikėjui Anthropic
				(<a href="https://www.anthropic.com/legal/privacy">jų privatumo politika</a>). El. pašto jam
				nesiunčiame.
			</li>
			<li>Daiktų nuotraukas atpažįstame savo serveryje ir jų nesaugome.</li>
			<li>Paskyrą gali ištrinti bet kada, kartu ištrinsime ir visus tavo duomenis.</li>
		</ul>
		<label>
			<input
				type="checkbox"
				name="consent"
				required
				aria-invalid={errors.consent ? 'true' : undefined}
				aria-describedby={errors.consent ? 'consent-error' : undefined}
			/>
			Sutinku, kad mano duomenys būtų tvarkomi taip, kaip aprašyta.
		</label>
		{#if errors.consent}<p class="field-error" id="consent-error">{errors.consent}</p>{/if}
		<p class="field-hint version">Taisyklių versija: {PRIVACY_POLICY_VERSION}</p>
	</fieldset>

	<button type="submit">Registruotis</button>
</form>

<p class="switch">Jau turi paskyrą? <a href={resolve('/(auth)/login')}>Prisijungti</a></p>

<style>
	.policy {
		font-size: var(--text-s);
		color: var(--c-text-muted);
	}
	.version {
		margin-top: var(--space-3);
	}
	.switch {
		margin-top: var(--space-6);
	}
</style>
