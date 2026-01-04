import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
	CheckForUpdates,
	DownloadAndInstallUpdate,
	GetAppVersion,
} from '@/wailsjs/go/main/App'
import { EventsOn } from '@/wailsjs/runtime/runtime'
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'

interface UpdateInfo {
	available: boolean
	version: string
	downloadUrl: string
	releaseNotes: string
	publishedAt: string
	currentVersion: string
}

interface UpdateProgress {
	status: 'downloading' | 'ready' | 'completed' | 'error'
	message: string
}

export function UpdateChecker() {
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
	const [showDialog, setShowDialog] = useState(false)
	const [isUpdating, setIsUpdating] = useState(false)
	const [progress, setProgress] = useState<UpdateProgress | null>(null)
	const [currentVersion, setCurrentVersion] = useState<string>('')
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		// Charger la version au montage
		GetAppVersion().then(setCurrentVersion)

		// Écoute l'événement de mise à jour disponible
		const unsubscribe = EventsOn('update:available', (info: unknown) => {
			setUpdateInfo(info as UpdateInfo)
			setShowDialog(true)
		})

		// Écoute la progression de la mise à jour
		const unsubscribeProgress = EventsOn('update:progress', (prog: unknown) => {
			const progressData = prog as UpdateProgress
			setProgress(progressData)

			if (progressData.status === 'completed') {
				setTimeout(() => {
					// L'application va se fermer automatiquement
				}, 1000)
			}
		})

		return () => {
			unsubscribe()
			unsubscribeProgress()
		}
	}, [])

	const handleCheckUpdates = async () => {
		setError(null)
		try {
			const info = await CheckForUpdates()
			setUpdateInfo(info as UpdateInfo)
			if (info.available) {
				setShowDialog(true)
			} else {
				alert(
					'Aucune mise à jour disponible. Vous utilisez la dernière version.',
				)
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			console.error(
				'Erreur lors de la vérification des mises à jour:',
				errorMessage,
			)
			setError(`Erreur: ${errorMessage}`)
			alert(`Erreur lors de la vérification: ${errorMessage}`)
		}
	}

	const handleInstallUpdate = async () => {
		if (!updateInfo?.downloadUrl) {
			setError('URL de téléchargement manquante')
			return
		}

		setIsUpdating(true)
		setError(null)
		setProgress({
			status: 'downloading',
			message: 'Préparation du téléchargement...',
		})

		try {
			console.log('🚀 Lancement du téléchargement:', updateInfo.downloadUrl)
			await DownloadAndInstallUpdate(updateInfo.downloadUrl)
			// L'application se fermera automatiquement après le lancement de l'installateur
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			console.error("Erreur lors de l'installation:", errorMessage)
			setError(errorMessage)
			setProgress({ status: 'error', message: errorMessage })
			setIsUpdating(false)
		}
	}

	const handleRetry = () => {
		setError(null)
		setProgress(null)
		handleInstallUpdate()
	}

	const handleClose = () => {
		setShowDialog(false)
		setError(null)
		setProgress(null)
		setIsUpdating(false)
	}

	const formatDate = (dateString: string) => {
		const date = new Date(dateString)
		return date.toLocaleDateString('fr-FR', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		})
	}

	const getProgressMessage = () => {
		if (error) {
			return {
				title: '❌ Erreur',
				message: error,
				color: 'text-red-600',
				bgColor: 'bg-red-50 dark:bg-red-900/20',
				borderColor: 'border-red-500',
			}
		}

		if (!progress) return null

		switch (progress.status) {
			case 'downloading':
				return {
					title: '⬇ Téléchargement en cours...',
					message: progress.message,
					color: 'text-blue-600',
					bgColor: 'bg-blue-50 dark:bg-blue-900/20',
					borderColor: 'border-blue-500',
				}
			case 'ready':
				return {
					title: '🚀 Prêt à installer',
					message: progress.message,
					color: 'text-green-600',
					bgColor: 'bg-green-50 dark:bg-green-900/20',
					borderColor: 'border-green-500',
				}
			case 'completed':
				return {
					title: '✅ Installation lancée',
					message:
						"L'installateur a été lancé. L'application va se fermer dans quelques secondes.",
					color: 'text-green-600',
					bgColor: 'bg-green-50 dark:bg-green-900/20',
					borderColor: 'border-green-500',
				}
			case 'error':
				return {
					title: '❌ Erreur',
					message: progress.message,
					color: 'text-red-600',
					bgColor: 'bg-red-50 dark:bg-red-900/20',
					borderColor: 'border-red-500',
				}
			default:
				return {
					title: '⏳ En cours...',
					message: progress.message,
					color: 'text-gray-600',
					bgColor: 'bg-gray-50 dark:bg-gray-800',
					borderColor: 'border-gray-500',
				}
		}
	}

	const progressInfo = getProgressMessage()

	return (
		<>
			{/* Bouton et version */}
			<div className='flex items-center gap-3'>
				<Button
					onClick={handleCheckUpdates}
					variant='outline'
					size='sm'
					className='gap-2'
					disabled={isUpdating}
				>
					<ArrowDownTrayIcon className='h-4 w-4' />
					Vérifier les mises à jour
				</Button>
				{currentVersion && (
					<span className='text-xs text-gray-500'>v{currentVersion}</span>
				)}
			</div>

			{/* Dialog de mise à jour disponible */}
			<AlertDialog open={showDialog} onOpenChange={handleClose}>
				<AlertDialogContent className='max-w-2xl'>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center justify-between'>
							<span>Mise à jour disponible 🎉</span>
							<Button
								variant='ghost'
								size='sm'
								onClick={handleClose}
								disabled={isUpdating && !error}
							>
								<XMarkIcon className='h-5 w-5' />
							</Button>
						</AlertDialogTitle>
						<AlertDialogDescription className='space-y-4 text-left'>
							{updateInfo && (
								<>
									<div>
										<p className='text-sm'>
											Version actuelle :{' '}
											<strong>{updateInfo.currentVersion}</strong>
										</p>
										<p className='text-sm'>
											Nouvelle version :{' '}
											<strong className='text-green-600'>
												{updateInfo.version}
											</strong>
										</p>
										<p className='text-xs text-gray-500 mt-1'>
											Publiée le {formatDate(updateInfo.publishedAt)}
										</p>
									</div>

									{updateInfo.releaseNotes && (
										<div className='bg-gray-50 dark:bg-gray-800 p-4 rounded-lg'>
											<h4 className='font-semibold text-sm mb-2'>
												Notes de version :
											</h4>
											<div className='text-sm whitespace-pre-wrap max-h-64 overflow-y-auto'>
												{updateInfo.releaseNotes}
											</div>
										</div>
									)}

									{/* Debug info - URL de téléchargement */}
									{updateInfo.downloadUrl && (
										<div className='text-xs text-gray-400 break-all'>
											<details>
												<summary className='cursor-pointer hover:text-gray-600'>
													Infos techniques
												</summary>
												<p className='mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded'>
													URL: {updateInfo.downloadUrl}
												</p>
											</details>
										</div>
									)}

									{/* Affichage de la progression / erreur */}
									{progressInfo && (
										<div
											className={`${progressInfo.bgColor} p-4 rounded-lg border-l-4 ${progressInfo.borderColor}`}
										>
											<div className='space-y-2'>
												<div className='flex items-center gap-2'>
													{progress?.status === 'downloading' && (
														<div className='animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600' />
													)}
													<p
														className={`text-sm font-semibold ${progressInfo.color}`}
													>
														{progressInfo.title}
													</p>
												</div>
												<p className='text-sm text-gray-700 dark:text-gray-300'>
													{progressInfo.message}
												</p>
												{progress?.status === 'completed' && (
													<p className='text-xs text-gray-600 dark:text-gray-400 mt-2'>
														💡 Suivez les instructions de l'installateur pour
														terminer la mise à jour.
													</p>
												)}
											</div>
										</div>
									)}
								</>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							disabled={isUpdating && !error}
							onClick={handleClose}
						>
							{progress?.status === 'completed' ? 'Fermer' : 'Plus tard'}
						</AlertDialogCancel>

						{error ? (
							<Button
								onClick={handleRetry}
								className='bg-orange-600 hover:bg-orange-700'
							>
								Réessayer
							</Button>
						) : (
							<AlertDialogAction
								onClick={handleInstallUpdate}
								disabled={isUpdating || progress?.status === 'completed'}
								className='bg-green-600 hover:bg-green-700'
							>
								{isUpdating
									? progress?.status === 'downloading'
										? 'Téléchargement...'
										: 'Préparation...'
									: 'Télécharger et installer'}
							</AlertDialogAction>
						)}
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
