// frontend/lib/apppos/index.ts
// Point d'entrée unique pour le module AppPOS

// API
export { appPosApi, default as api } from './apppos-api'
export {
	clearAppPosToken,
	getAppPosToken,
	loginToAppPos,
	setAppPosToken,
	createAppPosProduct,
	updateAppPosProductStock, // 🆕
	decrementAppPosProductsStock, // 🆕
	incrementAppPosProductsStock,
} from './apppos-api'

// Types
export type {
	AppPosApiResponse,
	AppPosBrand,
	AppPosCategory,
	AppPosCategoryRef,
	AppPosListResponse,
	AppPosLoginResponse,
	AppPosProduct,
	AppPosProductImage,
	AppPosSupplier,
	CreateAppPosProductInput,
} from './apppos-types'

export type {
	StockReturnDestination,
	StockReturnItem,
} from './apppos-api'

// Transformers
export {
	appPosTransformers,
	default as transformers,
} from './apppos-transformers'
export {
	transformAppPosBrand,
	transformAppPosBrands,
	transformAppPosCategories,
	transformAppPosCategory,
	transformAppPosProduct,
	transformAppPosProducts,
	transformAppPosSupplier,
	transformAppPosSuppliers,
} from './apppos-transformers'

// Hooks
export { appPosHooks, default as hooks } from './apppos-hooks'
export {
	buildAppPosCategoryTree,
	useAppPosBrands,
	useAppPosCategories,
	useAppPosCategory,
	useAppPosProduct,
	useAppPosProducts,
	useAppPosSuppliers,
	useCreateAppPosProduct, // 🆕
} from './apppos-hooks'
export type {
	CategoryNode,
	UseAppPosBrandsOptions,
	UseAppPosCategoriesOptions,
	UseAppPosProductsOptions,
	UseAppPosSuppliersOptions,
	UseCreateAppPosProductOptions, // 🆕
} from './apppos-hooks'

// WebSocket
export { appPosWebSocket } from './apppos-websocket'
export type {
	AppPosWebSocketEvent,
	AppPosWebSocketCallback,
} from './apppos-websocket'
export {
	useAppPosStockUpdates,
	useAppPosProductUpdates,
} from './apppos-hooks-websocket'
export type { UseAppPosProductUpdatesOptions } from './apppos-hooks-websocket'
