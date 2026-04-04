/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
		'./frontend/**/*.{ts,tsx}',
	],
	prefix: '',
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: { '2xl': '1400px' },
		},
		extend: {
			// ─────────────────────────────────────────────────────────────────────
			// STITCH LAYOUT TOKENS
			// ─────────────────────────────────────────────────────────────────────
			spacing: {
				header: 'var(--header-h)', // 56px — header global
				subheader: 'var(--subheader-h)', // 72px — ModulePageShell
				'bottom-nav': 'var(--bottom-nav-h)', // 56px — BottomNav mobile
				rail: 'var(--rail-w)', // 3.5rem — rail icônes
				panel: 'var(--panel-w)', // 16rem  — panneau sidebar
				'sidebar-open': 'var(--sidebar-open-w)', // rail + panel = 312px
			},

			inset: {
				header: 'var(--header-h)',
				subheader: 'var(--subheader-h)',
				'page-shell': 'var(--header-h)',
			},

			// ─────────────────────────────────────────────────────────────────────
			// BREAKPOINTS STITCH (alias sémantiques)
			//   mobile  <768px  → BottomNav, sidebar cachée
			//   tablet  768px   → rail + panel overlay
			//   desktop 1024px  → rail + panel push
			// ─────────────────────────────────────────────────────────────────────
			screens: {
				mobile: '375px',
				tablet: '768px',
				desktop: '1024px',
			},

			// ─────────────────────────────────────────────────────────────────────
			// COULEURS
			// ─────────────────────────────────────────────────────────────────────
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},

				// Couleurs structurelles Stitch — remplacent tous les hex hardcodés
				rail: {
					DEFAULT: '#283044',
					active: 'rgba(255,255,255,0.10)',
					hover: 'rgba(255,255,255,0.05)',
					icon: 'rgba(255,255,255,0.40)',
					'icon-active': '#ffffff',
					separator: 'rgba(255,255,255,0.10)',
					indicator: 'rgba(255,255,255,0.60)',
				},
				panel: {
					DEFAULT: '#ffffff',
					header: '#f2f3ff',
					'item-active': '#eaedff',
					'item-text': '#575e70',
					'item-icon': '#7e7576',
					'item-divider': '#cfc4c5',
					'header-text': '#131b2e',
					'close-btn': '#7e7576',
				},
			},

			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},

			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
}
