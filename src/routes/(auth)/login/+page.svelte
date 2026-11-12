<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Prisijungimas – Alpinisto draugas</title></svelte:head>

<h1>Prisijungimas</h1>

{#if form?.invalid}
	<p class="notice notice-danger" role="alert">
		Neteisingas el. paštas arba slaptažodis. Patikrink ir bandyk dar kartą.
	</p>
{/if}

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
		/>
	</div>
	<div class="field">
		<label for="password">Slaptažodis</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required />
	</div>
	<button type="submit">Prisijungti</button>
</form>

<p class="switch">Neturi paskyros? <a href={resolve('/(auth)/register')}>Registruotis</a></p>

<style>
	.switch {
		margin-top: var(--space-6);
	}
</style>
