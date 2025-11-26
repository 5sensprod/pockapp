import PocketBase from 'pocketbase'
import type { TypedPocketBase } from './pocketbase-types'

const pb = new PocketBase(document.location.origin) as TypedPocketBase

export function usePocketBase() {
	return pb
}
