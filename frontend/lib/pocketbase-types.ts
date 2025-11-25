/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export enum Collections {
	Brands = "brands",
	Categories = "categories",
	Customers = "customers",
	Notes = "notes",
	Products = "products",
	Suppliers = "suppliers",
	Users = "users",
}

// Alias types for improved usability
export type IsoDateString = string
export type RecordIdString = string
export type HTMLString = string

// System fields
export type BaseSystemFields<T = never> = {
	id: RecordIdString
	created: IsoDateString
	updated: IsoDateString
	collectionId: string
	collectionName: Collections
	expand?: T
}

export type AuthSystemFields<T = never> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type BrandsRecord = {
	description?: string
	logo?: string
	name: string
	website?: string
}

export type CategoriesRecord = {
	color?: string
	icon?: string
	name: string
	order?: number
	parent?: RecordIdString
}

export enum CustomersTagsOptions {
	"vip" = "vip",
	"prospect" = "prospect",
	"actif" = "actif",
	"inactif" = "inactif",
}
export type CustomersRecord = {
	address?: string
	avatar?: string
	company?: string
	email?: string
	name: string
	notes?: string
	phone?: string
	tags?: CustomersTagsOptions[]
}

export type NotesRecord = {
	content?: string
	title?: string
}

export type ProductsRecord = {
	active?: boolean
	barcode?: string
	brand?: RecordIdString
	categories?: RecordIdString[]
	cost?: number
	image?: string
	name: string
	price: number
	stock?: number
	supplier?: RecordIdString
}

export type SuppliersRecord = {
	active?: boolean
	address?: string
	brands?: RecordIdString[]
	contact?: string
	email?: string
	name: string
	notes?: string
	phone?: string
}

export type UsersRecord = {
	avatar?: string
	name?: string
}

// Response types include system fields and match responses from the PocketBase API
export type BrandsResponse<Texpand = unknown> = Required<BrandsRecord> & BaseSystemFields<Texpand>
export type CategoriesResponse<Texpand = unknown> = Required<CategoriesRecord> & BaseSystemFields<Texpand>
export type CustomersResponse<Texpand = unknown> = Required<CustomersRecord> & BaseSystemFields<Texpand>
export type NotesResponse<Texpand = unknown> = Required<NotesRecord> & BaseSystemFields<Texpand>
export type ProductsResponse<Texpand = unknown> = Required<ProductsRecord> & BaseSystemFields<Texpand>
export type SuppliersResponse<Texpand = unknown> = Required<SuppliersRecord> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	brands: BrandsRecord
	categories: CategoriesRecord
	customers: CustomersRecord
	notes: NotesRecord
	products: ProductsRecord
	suppliers: SuppliersRecord
	users: UsersRecord
}

export type CollectionResponses = {
	brands: BrandsResponse
	categories: CategoriesResponse
	customers: CustomersResponse
	notes: NotesResponse
	products: ProductsResponse
	suppliers: SuppliersResponse
	users: UsersResponse
}

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = PocketBase & {
	collection(idOrName: 'brands'): RecordService<BrandsResponse>
	collection(idOrName: 'categories'): RecordService<CategoriesResponse>
	collection(idOrName: 'customers'): RecordService<CustomersResponse>
	collection(idOrName: 'notes'): RecordService<NotesResponse>
	collection(idOrName: 'products'): RecordService<ProductsResponse>
	collection(idOrName: 'suppliers'): RecordService<SuppliersResponse>
	collection(idOrName: 'users'): RecordService<UsersResponse>
}
