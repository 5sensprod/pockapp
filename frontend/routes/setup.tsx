// frontend/routes/setup.tsx
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

export const Route = createFileRoute('/setup')({
	component: SetupPage,
})

function SetupPage() {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault()
		setError(null)

		if (password !== confirmPassword) {
			setError('Les mots de passe ne correspondent pas')
			return
		}

		if (password.length < 8) {
			setError('Le mot de passe doit contenir au moins 8 caractères')
			return
		}

		setLoading(true)

		try {
			const response = await fetch('/api/setup/create-admin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
			})

			const data = await response.json()

			if (!response.ok) {
				throw new Error(data.error || 'Erreur lors de la création')
			}

			// Clear toute session PocketBase existante
			localStorage.removeItem('pocketbase_auth')

			sessionStorage.setItem('setupComplete', 'true')
			window.location.replace('/')
		} catch (err: any) {
			console.error(err)
			setError(err?.message ?? "Impossible de créer l'administrateur")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className='min-h-screen flex items-center justify-center bg-muted px-4'>
			<Card className='w-full max-w-md shadow-sm'>
				<CardHeader className='space-y-2'>
					<CardTitle className='text-xl font-semibold text-center'>
						Configuration initiale
					</CardTitle>
					<CardDescription className='text-center'>
						Créez le compte administrateur de votre application.
					</CardDescription>
				</CardHeader>

				<CardContent>
					<form className='space-y-4' onSubmit={handleSubmit}>
						<div className='space-y-1.5'>
							<label htmlFor='admin-email' className='text-sm font-medium'>
								Email
							</label>
							<Input
								id='admin-email'
								type='email'
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								autoComplete='off'
								placeholder='admin@exemple.com'
							/>
						</div>

						<div className='space-y-1.5'>
							<label htmlFor='admin-password' className='text-sm font-medium'>
								Mot de passe
							</label>
							<Input
								id='admin-password'
								type='password'
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoComplete='new-password'
								placeholder='Minimum 8 caractères'
							/>
						</div>

						<div className='space-y-1.5'>
							<label
								htmlFor='admin-password-confirm'
								className='text-sm font-medium'
							>
								Confirmation du mot de passe
							</label>
							<Input
								id='admin-password-confirm'
								type='password'
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								required
								autoComplete='new-password'
								placeholder='Répétez le mot de passe'
							/>
						</div>

						{error && <p className='text-sm text-red-600'>{error}</p>}

						<Button type='submit' className='w-full' disabled={loading}>
							{loading
								? 'Création du compte…'
								: 'Créer le compte administrateur'}
						</Button>

						<p className='text-xs text-muted-foreground text-center mt-2'>
							Ce compte vous permettra de gérer l’application et les
							utilisateurs.
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
