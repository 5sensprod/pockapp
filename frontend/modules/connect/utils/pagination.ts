// frontend/modules/connect/utils/pagination.ts

export function getPaginationRange(
	page: number,
	perPage: number,
	totalItems: number,
) {
	const rangeStart = totalItems === 0 ? 0 : (page - 1) * perPage + 1
	const rangeEnd = Math.min(page * perPage, totalItems)

	return { rangeStart, rangeEnd }
}
