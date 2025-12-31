import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/modules/auth/AuthProvider'
// frontend/routes/login.tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useEffect } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/login')({
	component: LoginPage,
})

function LoginPage() {
	const { login, loading } = useAuth()
	const navigate = useNavigate()
	const [identity, setIdentity] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault()
		setError(null)
		try {
			await login(identity, password)
			navigate({ to: '/' })
		} catch (err: any) {
			console.error(err)
			setError(err?.message ?? 'Impossible de se connecter')
		}
	}

	useEffect(() => {
		if (sessionStorage.getItem('setupComplete')) {
			sessionStorage.removeItem('setupComplete')
			toast.success('Compte administrateur créé avec succès !')
		}
	}, [])

	return (
		<div className='min-h-screen flex items-center justify-center bg-background'>
			<Card className='w-full max-w-md'>
				<CardHeader>
					<CardTitle className='text-2xl font-bold text-center'>
						Connexion
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form className='space-y-4' onSubmit={handleSubmit}>
						<div className='space-y-2'>
							<label htmlFor='identity' className='text-sm font-medium'>
								Email ou identifiant
							</label>
							<Input
								id='identity'
								type='text' // ← Change 'text' en 'email'
								value={identity}
								onChange={(e) => setIdentity(e.target.value)}
								required
								autoComplete='email'
								autoCapitalize='none' // ← Ajoute ça
								autoCorrect='off' // ← Et ça
								spellCheck={false} // ← Et ça
							/>
						</div>

						<div className='space-y-2'>
							<label htmlFor='password' className='text-sm font-medium'>
								Mot de passe
							</label>
							<Input
								id='password'
								type='password'
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								autoComplete='current-password'
							/>
						</div>

						{error && <p className='text-sm text-red-600'>{error}</p>}

						<Button type='submit' className='w-full' disabled={loading}>
							{loading ? 'Connexion…' : 'Se connecter'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
