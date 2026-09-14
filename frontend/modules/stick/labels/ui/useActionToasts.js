// frontend/modules/stick/labels/ui/useActionToasts.js
//
// Les toasts de l'éditeur, branchés sur `sonner` — celui du dépôt.
//
// Dans AppPos, `useActionToasts` était un gros catalogue d'actions par lot
// (duplication, export, stock…) au-dessus d'un store maison. L'éditeur n'en
// consomme QUE `success` et `error`, avec un second argument décoratif
// (`{ title }`) que sonner n'a pas : il est ignoré, et c'est tout l'écart.

import { toast } from 'sonner'

export const useActionToasts = () => ({
	success: (message) => toast.success(message),
	error: (message) => toast.error(message),
	warning: (message) => toast.warning(message),
	info: (message) => toast(message),
})
