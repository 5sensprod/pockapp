// frontend/modules/cash/components/terminal/utils/imageUtils.ts
const APPPOS_BASE_URL = 'http://localhost:3000'

export const getImageUrl = (imagePath: string | undefined): string | null => {
	if (!imagePath) return null
	if (imagePath.startsWith('http')) return imagePath
	return `${APPPOS_BASE_URL}${imagePath}`
}
