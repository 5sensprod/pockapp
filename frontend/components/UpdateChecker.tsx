// frontend/components/UpdateChecker.tsx
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
import { isWails, tryWails, tryWailsSub } from '@/lib/wails-bridge'
import {
	CheckForUpdates,
	DownloadAndInstallUpdate,
	GetAppVersion,
} from '@/wailsjs/go/main/App'
import { EventsOn } from '@/wailsjs/runtime/runtime'
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState } from 'react'

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

type DialogMode = 'update' | 'uptodate' | 'error'

export function UpdateChecker() {
	const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
	const [showDialog, setShowDialog] = useState(false)
	const [dialogMode, setDialogMode] = useState<DialogMode>('update')
	const [isUpdating, setIsUpdating] = useState(false)
	const [progress, setProgress] = useState<UpdateProgress | null>(null)
	const [currentVersion, setCurrentVersion] = useState<string>('')
	const [error, setError] = useState<string | null>(null)

	const lastNotifiedVersionRef = useRef<string>('')

	useEffect(() => {
		if (!isWails()) return

		GetAppVersion().then(setCurrentVersion)

		const unsubscribe = tryWailsSub(() =>
			EventsOn('update:available', (info: unknown) => {
				const data = info as UpdateInfo

				if (data?.version && data.version === lastNotifiedVersionRef.current)
					return
				if (data?.version) lastNotifiedVersionRef.current = data.version

				setUpdateInfo(data)
				setDialogMode('update')
				setShowDialog(true)
			}),
		)

		const unsubscribeProgress = tryWailsSub(() =>
			EventsOn('update:progress', (prog: unknown) => {
				const progressData = prog as UpdateProgress
				setProgress(progressData)
			}),
		)

		return () => {
			unsubscribe()
			unsubscribeProgress()
		}
	}, [])

	useEffect(() => {
		const onNotif = (ev: Event) => {
			const detail = (ev as CustomEvent).detail as Partial<UpdateInfo>
			setUpdateInfo(detail as UpdateInfo)
			setDialogMode('update')
			setError(null)
			setProgress(null)
			setIsUpdating(false)
			setShowDialog(true)
		}

		window.addEventListener('app:updateAvailable', onNotif)
		return () => window.removeEventListener('app:updateAvailable', onNotif)
	}, [])

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
				title: 'Erreur',
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
					title: 'Téléchargement en cours...',
					message: progress.message,
					color: 'text-blue-600',
					bgColor: 'bg-blue-50 dark:bg-blue-900/20',
					borderColor: 'border-blue-500',
				}
			case 'ready':
				return {
					title: 'Prêt à installer',
					message: progress.message,
					color: 'text-green-600',
					bgColor: 'bg-green-50 dark:bg-green-900/20',
					borderColor: 'border-green-500',
				}
			case 'completed':
				return {
					title: 'Installation lancée',
					message:
						"L'installateur a été lancé. L'application va se fermer dans quelques secondes.",
					color: 'text-green-600',
					bgColor: 'bg-green-50 dark:bg-green-900/20',
					borderColor: 'border-green-500',
				}
			case 'error':
				return {
					title: 'Erreur',
					message: progress.message,
					color: 'text-red-600',
					bgColor: 'bg-red-50 dark:bg-red-900/20',
					borderColor: 'border-red-500',
				}
			default:
				return {
					title: 'En cours...',
					message: progress.message,
					color: 'text-gray-600',
					bgColor: 'bg-gray-50 dark:bg-gray-800',
					borderColor: 'border-gray-500',
				}
		}
	}

	const progressInfo = getProgressMessage()

	const handleCheckUpdates = async () => {
		setError(null)
		setProgress(null)
		setIsUpdating(false)

		const info = await tryWails<UpdateInfo>(
			async () => (await CheckForUpdates()) as UpdateInfo,
			{
				available: false,
				version: '',
				downloadUrl: '',
				releaseNotes: '',
				publishedAt: '',
				currentVersion: currentVersion || '',
			},
		)

		setUpdateInfo(info)
		setDialogMode(info.available ? 'update' : 'uptodate')
		setShowDialog(true)
	}

	const handleInstallUpdate = async () => {
		if (!isWails()) return

		if (!updateInfo?.downloadUrl) {
			setError('URL de téléchargement manquante')
			setDialogMode('error')
			setShowDialog(true)
			return
		}

		setIsUpdating(true)
		setError(null)
		setProgress({
			status: 'downloading',
			message: 'Préparation du téléchargement...',
		})

		try {
			await DownloadAndInstallUpdate(updateInfo.downloadUrl)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setError(msg)
			setProgress({ status: 'error', message: msg })
			setIsUpdating(false)
			setDialogMode('error')
			setShowDialog(true)
		}
	}

	const handleRetry = () => {
		setError(null)
		setProgress(null)
		handleInstallUpdate()
	}

	const handleClose = () => {
		if (isUpdating && !error) return
		setShowDialog(false)
		setError(null)
		setProgress(null)
		setIsUpdating(false)
	}

	const dialogTitle = useMemo(() => {
		if (dialogMode === 'update') return 'Mise à jour disponible'
		if (dialogMode === 'uptodate') return 'Logiciel à jour'
		return 'Erreur de vérification'
	}, [dialogMode])

	const footerAction =
		dialogMode !== 'update' ? null : error ? (
			<AlertDialogAction asChild>
				<Button
					onClick={(e) => {
						e.preventDefault()
						handleRetry()
					}}
					className='bg-orange-600 hover:bg-orange-700'
				>
					Réessayer
				</Button>
			</AlertDialogAction>
		) : (
			<AlertDialogAction asChild>
				<Button
					onClick={(e) => {
						e.preventDefault()
						handleInstallUpdate()
					}}
					disabled={
						isUpdating || progress?.status === 'completed' || !isWails()
					}
					className='bg-green-600 hover:bg-green-700'
				>
					{isUpdating
						? progress?.status === 'downloading'
							? 'Téléchargement...'
							: 'Préparation...'
						: 'Télécharger et installer'}
				</Button>
			</AlertDialogAction>
		)

	if (!isWails()) return null

	return (
		<>
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

			<AlertDialog open={showDialog} onOpenChange={handleClose}>
				<AlertDialogContent className='max-w-2xl'>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center justify-between'>
							<span>{dialogTitle}</span>
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
							{dialogMode === 'uptodate' && (
								<div className='space-y-2'>
									<p className='text-sm text-gray-700 dark:text-gray-300'>
										Vous utilisez déjà la dernière version.
									</p>
									{currentVersion && (
										<p className='text-sm'>
											Version actuelle : <strong>v{currentVersion}</strong>
										</p>
									)}
								</div>
							)}

							{dialogMode === 'error' && (
								<div className='space-y-2'>
									<p className='text-sm text-red-600'>
										{error || 'Une erreur est survenue.'}
									</p>
								</div>
							)}

							{dialogMode === 'update' && updateInfo && (
								<>
									<div>
										<p className='text-sm'>
											Version actuelle :{' '}
											<strong>
												{updateInfo.currentVersion || currentVersion}
											</strong>
										</p>
										<p className='text-sm'>
											Nouvelle version :{' '}
											<strong className='text-green-600'>
												{updateInfo.version}
											</strong>
										</p>
										{updateInfo.publishedAt && (
											<p className='text-xs text-gray-500 mt-1'>
												Publiée le {formatDate(updateInfo.publishedAt)}
											</p>
										)}
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
														Suivez les instructions de l'installateur pour
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
							Fermer
						</AlertDialogCancel>

						{footerAction}
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
