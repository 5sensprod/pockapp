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
	status: 'downloading' | 'extracting' | 'installing' | 'completed'
	message: string
}

export function UpdateChecker() {
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
	const [showDialog, setShowDialog] = useState(false)
	const [isUpdating, setIsUpdating] = useState(false)
	const [progress, setProgress] = useState<UpdateProgress | null>(null)

	useEffect(() => {
		// Écoute l'événement de mise à jour disponible
		const unsubscribe = EventsOn('update:available', (info: any) => {
			setUpdateInfo(info as UpdateInfo)
			setShowDialog(true)
		})

		// Écoute la progression de la mise à jour
		const unsubscribeProgress = EventsOn('update:progress', (prog: any) => {
			setProgress(prog as UpdateProgress)
			if (prog.status === 'completed') {
				setTimeout(() => {
					// Affiche un message de redémarrage
					alert("Mise à jour installée ! Veuillez redémarrer l'application.")
				}, 1000)
			}
		})

		return () => {
			unsubscribe()
			unsubscribeProgress()
		}
	}, [])

	const handleCheckUpdates = async () => {
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
		} catch (error) {
			console.error('Erreur lors de la vérification des mises à jour:', error)
			alert('Erreur lors de la vérification des mises à jour.')
		}
	}

	const handleInstallUpdate = async () => {
		if (!updateInfo?.downloadUrl) return

		setIsUpdating(true)
		try {
			await DownloadAndInstallUpdate(updateInfo.downloadUrl)
		} catch (error) {
			console.error("Erreur lors de l'installation:", error)
			alert("Erreur lors de l'installation de la mise à jour.")
			setIsUpdating(false)
		}
	}

	const formatDate = (dateString: string) => {
		const date = new Date(dateString)
		return date.toLocaleDateString('fr-FR', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
		})
	}

	return (
		<>
			{/* Bouton pour vérifier manuellement les mises à jour */}
			<Button
				onClick={handleCheckUpdates}
				variant='outline'
				size='sm'
				className='gap-2'
			>
				<ArrowDownTrayIcon className='h-4 w-4' />
				Vérifier les mises à jour
			</Button>

			{/* Dialog de mise à jour disponible */}
			<AlertDialog open={showDialog} onOpenChange={setShowDialog}>
				<AlertDialogContent className='max-w-2xl'>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center justify-between'>
							<span>Mise à jour disponible 🎉</span>
							<Button
								variant='ghost'
								size='sm'
								onClick={() => setShowDialog(false)}
								disabled={isUpdating}
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

									{progress && (
										<div className='bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg'>
											<div className='flex items-center gap-2'>
												<div className='animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600' />
												<p className='text-sm font-medium'>
													{progress.message}
												</p>
											</div>
										</div>
									)}
								</>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isUpdating}>
							Plus tard
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleInstallUpdate}
							disabled={isUpdating}
							className='bg-green-600 hover:bg-green-700'
						>
							{isUpdating ? 'Installation en cours...' : 'Installer maintenant'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
