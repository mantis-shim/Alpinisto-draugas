<script lang="ts">
	import { resolve } from '$app/paths';

	// Ridge profile in a 1000×200 box (y grows downwards). The app's steps are waypoints on the trail.
	const ridge: [number, number][] = [
		[0, 200], [30, 194], [62, 183], [95, 186], [130, 170], [168, 160], [205, 150], [250, 138],
		[285, 146], [320, 128], [360, 118], [400, 122], [440, 104], [470, 98], [500, 92], [535, 100],
		[570, 80], [610, 66], [645, 72], [685, 48], [720, 34], [750, 22], [780, 36], [810, 60],
		[835, 56], [870, 92], [905, 120], [940, 150], [970, 178], [1000, 200]
	];
	// The trail runs a few units under the crest so it stays on the dark fill.
	const trailY = (y: number) => Math.min(y + 5, 197);
	const line = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x},${y}`).join(' L');

	const mountain = line(ridge) + ' Z';
	const trail = line(ridge.map(([x, y]) => [x, trailY(y)]));

	// x = waypoint position; it also lines up with the step's column below (4 equal columns).
	const steps = [
		{
			x: 0,
			title: 'Inventorius',
			text: 'Nufotografuok turimus daiktus arba surašyk juos ranka. Dirbtinis intelektas atpažins daiktą, o tu patvirtinsi jo savybes.'
		},
		{
			x: 250,
			title: 'Fizinis pasirengimas',
			text: 'Atsakyk į kelis trumpus klausimus ir sužinok savo pasirengimo lygį.'
		},
		{
			x: 500,
			title: 'Žygis',
			text: 'Nurodyk, kur ir kada keliauji.'
		},
		{
			x: 750,
			title: 'Rekomendacijos',
			text: 'Gauk orų įvertinimą, aprangos patarimus ir daiktų sąrašą: ką pasiimti iš inventoriaus ir ką dar įsigyti.'
		}
	].map((s) => ({ ...s, y: trailY(ridge.find(([x]) => x === s.x)![1]) }));
</script>

<svelte:head>
	<title>Alpinisto draugas – pasiruošk žygiui į kalnus</title>
	<meta
		name="description"
		content="Alpinisto draugas padeda pradedantiesiems žygeiviams pasiruošti žygiui į kalnus: patikrina ekipuotę, įvertina maršrutą ir sudaro daiktų sąrašą."
	/>
</svelte:head>

<div class="page">
<header class="container site-header">
	<a class="brand" href={resolve('/')}>
		<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 25 13 9l5 8.5 3.5-5L28 25z" /></svg>
		Alpinisto draugas
	</a>
</header>

<main>
	<section class="hero">
		<div class="container hero-text">
			<h1>Pasiruošk žygiui į kalnus be spėlionių</h1>
			<p class="lead">
				Alpinisto draugas patikrina tavo ekipuotę, įvertina, ar pasirinktas maršrutas tau per jėgas,
				ir sudaro sąrašą, ką pasiimti ir ką dar reikia įsigyti. Sukurta pradedantiesiems žygeiviams.
			</p>
			<div class="actions">
				<a class="button button-large" href={resolve('/register')}>Registruotis</a>
				<a class="button button-secondary button-large" href={resolve('/login')}>Prisijungti</a>
			</div>
		</div>

		<div class="container ridge" aria-hidden="true">
			<svg class="mountain" viewBox="0 0 1000 200" preserveAspectRatio="none">
				<path d={mountain} />
			</svg>
			<svg class="trail" viewBox="0 0 1000 200" preserveAspectRatio="none">
				<path d={trail} vector-effect="non-scaling-stroke" />
			</svg>
			{#each steps as step, i (step.title)}
				<span
					class="waypoint"
					class:summit={i === steps.length - 1}
					style:left="{step.x / 10}%"
					style:top="{step.y / 2}%"
					style:--delay="{0.3 + (step.x / 1000) * 1.6}s"
				></span>
			{/each}
		</div>
	</section>

	<section class="route" aria-labelledby="route-title">
		<div class="container">
			<h2 id="route-title" class="visually-hidden">Kaip veikia Alpinisto draugas</h2>
			<ol class="steps">
				{#each steps as step (step.title)}
					<li>
						<h3>{step.title}</h3>
						<p>{step.text}</p>
					</li>
				{/each}
			</ol>
			<p class="disclaimer">
				Rekomendacijas sudaro dirbtinis intelektas. Tai patarimai, o ne garantija: galutinį sprendimą
				kalnuose priimi tu.
			</p>
		</div>
	</section>
</main>

<footer class="site-footer">
	<div class="container">
		<small>© 2026 PROgramuotojai, VILNIUS TECH</small>
	</div>
</footer>
</div>

<style>
	/* Forest fills the rest of the screen on tall viewports */
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}
	main {
		display: flex;
		flex: 1;
		flex-direction: column;
	}
	.route {
		flex: 1;
	}

	.site-header {
		padding-block: var(--space-4);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-l);
		font-weight: 780;
		font-stretch: var(--stretch-display);
		color: var(--c-text);
		text-decoration: none;
	}
	.brand svg {
		width: 1.75rem;
		fill: var(--c-primary);
	}

	.hero-text {
		position: relative;
		z-index: 1; /* stays above the mountain where they overlap */
		padding-block: var(--space-7) var(--space-8);
	}
	h1 {
		max-width: 13ch;
		margin-bottom: var(--space-5);
		font-size: clamp(2.75rem, 1.25rem + 6.5vw, 5.25rem);
		font-weight: 820;
		font-stretch: 68%;
		line-height: 0.95;
		letter-spacing: -0.01em;
		color: var(--c-primary);
	}
	.lead {
		max-width: 40ch;
		margin-bottom: var(--space-6);
		font-size: var(--text-xl);
		line-height: 1.5;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	/* Mountain + trail. Both SVGs stretch to the box; waypoints are HTML so they stay round. */
	.ridge {
		--height: clamp(9rem, 32vw, 26rem);
		position: relative;
		height: var(--height);
		margin-bottom: -1px; /* no hairline gap above the forest section */
	}
	/* Wide screens: the low left slopes slide under the text, the summit rises beside it. */
	@media (width >= 48rem) {
		.ridge {
			margin-top: calc(var(--height) * -0.45);
		}
	}
	.ridge svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.mountain path {
		fill: var(--c-forest);
	}
	.trail path {
		fill: none;
		stroke: var(--c-accent);
		stroke-width: 2.5;
		stroke-dasharray: 7 5;
		stroke-linejoin: round;
	}
	.waypoint {
		position: absolute;
		width: 0.875rem;
		height: 0.875rem;
		translate: -50% -50%;
		background: var(--c-forest);
		border: 3px solid var(--c-accent);
		border-radius: 50%;
	}
	.waypoint.summit {
		width: 1.25rem;
		height: 1.25rem;
		background: var(--c-accent);
		box-shadow: 0 0 0 4px var(--c-forest);
	}

	/* The page's one moment of motion: the trail is walked from the valley to the summit. */
	@media (prefers-reduced-motion: no-preference) {
		.trail {
			clip-path: inset(0 100% 0 0);
			animation: walk 1.6s linear 0.3s forwards;
		}
		.waypoint {
			opacity: 0;
			scale: 0.4;
			animation: arrive 0.35s ease-out var(--delay) forwards;
		}
	}
	@keyframes walk {
		to {
			clip-path: inset(0 0 0 0);
		}
	}
	@keyframes arrive {
		to {
			opacity: 1;
			scale: 1;
		}
	}

	.route {
		padding-block: var(--space-6) var(--space-7);
		color: var(--c-on-forest);
		background: var(--c-forest);
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(4, 1fr); /* no gap: column starts must match the waypoints */
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.steps li {
		margin: 0;
		padding-right: var(--space-6);
	}
	.steps h3 {
		margin-bottom: var(--space-2);
		font-size: var(--text-xl);
		color: var(--c-accent);
	}
	.steps p {
		margin: 0;
		color: var(--c-on-forest);
	}
	.disclaimer {
		margin: var(--space-7) 0 0;
		padding-top: var(--space-4);
		font-size: var(--text-s);
		color: var(--c-on-forest-muted);
		border-top: 1px solid rgb(230 236 223 / 0.15);
	}

	.site-footer {
		padding-block: 0 var(--space-6);
		color: var(--c-on-forest-muted);
		background: var(--c-forest);
	}

	/* Narrow screens: steps stack, so the waypoints move from the ridge into the list. */
	@media (width < 48rem) {
		.waypoint {
			display: none;
		}
		.steps {
			grid-template-columns: 1fr;
			gap: var(--space-5);
		}
		.steps li {
			position: relative;
			padding: 0 0 0 var(--space-6);
		}
		.steps li::before {
			content: '';
			position: absolute;
			top: 0.45em;
			left: 0;
			width: 0.875rem;
			height: 0.875rem;
			border: 3px solid var(--c-accent);
			border-radius: 50%;
		}
		.steps li:last-child::before {
			background: var(--c-accent);
		}
	}
</style>
