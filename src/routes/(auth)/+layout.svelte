<script lang="ts">
	import Brand from '#lib/components/Brand.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<header class="container">
	<Brand />
</header>

<main class="container">
	<div class="auth">
		{@render children()}
	</div>
</main>

<style>
	header {
		padding-block: var(--space-4);
	}
	.auth {
		max-width: 28rem;
		padding-block: var(--space-7) var(--space-8);
	}
</style>
