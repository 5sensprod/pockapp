import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useCategories } from '@/lib/queries/categories'
import type { CategoriesResponse } from '@/lib/pocketbase-types'

// Helper pour construire le chemin complet
function getCategoryPath(
  category: CategoriesResponse,
  allCategories: CategoriesResponse[]
): string {
  const path: string[] = [category.name]
  let current = category

  while (current.parent) {
    const parent = allCategories.find((c) => c.id === current.parent)
    if (parent) {
      path.unshift(parent.name)
      current = parent
    } else {
      break
    }
  }

  return path.join(' › ')
}

// Construire l'arbre des catégories
interface CategoryNode {
  category: CategoriesResponse
  children: CategoryNode[]
  path: string
}

function buildTree(
  categories: CategoriesResponse[],
  excludeIds: string[] = []
): CategoryNode[] {
  const nodes: CategoryNode[] = []

  function addChildren(parentId: string | null): CategoryNode[] {
    return categories
      .filter((c) => {
        const matchParent = parentId ? c.parent === parentId : !c.parent
        const notExcluded = !excludeIds.includes(c.id)
        return matchParent && notExcluded
      })
      .map((c) => ({
        category: c,
        children: addChildren(c.id),
        path: getCategoryPath(c, categories),
      }))
  }

  return addChildren(null)
}

// Vérifier si un nœud ou ses enfants correspondent à la recherche
function nodeMatchesSearch(node: CategoryNode, search: string): boolean {
  const searchLower = search.toLowerCase()
  if (node.category.name.toLowerCase().includes(searchLower)) return true
  return node.children.some((child) => nodeMatchesSearch(child, searchLower))
}

// Vérifier si une catégorie est un descendant d'une autre
function isDescendantOf(
  categoryId: string,
  ancestorId: string,
  categories: CategoriesResponse[]
): boolean {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return false
  if (category.parent === ancestorId) return true
  if (category.parent) return isDescendantOf(category.parent, ancestorId, categories)
  return false
}

interface CategoryPickerProps {
  /** IDs sélectionnés (mode multiple) ou ID unique (mode simple) */
  value: string | string[]
  /** Callback de changement */
  onChange: (value: string | string[]) => void
  /** Mode sélection multiple */
  multiple?: boolean
  /** Afficher l'option "Aucune" */
  showNone?: boolean
  /** Label pour l'option "Aucune" */
  noneLabel?: string
  /** IDs à exclure de la liste */
  excludeIds?: string[]
  /** Placeholder de recherche */
  searchPlaceholder?: string
  /** Hauteur max de la liste */
  maxHeight?: string
}

export function CategoryPicker({
  value,
  onChange,
  multiple = false,
  showNone = true,
  noneLabel = 'Aucune (racine)',
  excludeIds = [],
  searchPlaceholder = 'Rechercher...',
  maxHeight = '200px',
}: CategoryPickerProps) {
  const { data: categories } = useCategories()
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Normaliser la valeur en tableau
  const selectedIds = useMemo(() => {
    if (Array.isArray(value)) return value
    return value ? [value] : []
  }, [value])

  // Construire l'arbre en excluant les IDs spécifiés + descendants
  const tree = useMemo(() => {
    if (!categories) return []

    // Calculer tous les IDs à exclure (incluant les descendants)
    const allExcluded = new Set(excludeIds)
    for (const id of excludeIds) {
      for (const cat of categories) {
        if (isDescendantOf(cat.id, id, categories)) {
          allExcluded.add(cat.id)
        }
      }
    }

    return buildTree(categories, Array.from(allExcluded))
  }, [categories, excludeIds])

  // Filtrer par recherche et auto-expand si recherche active
  const filteredTree = useMemo(() => {
    if (!search) return tree

    function filterNodes(nodes: CategoryNode[]): CategoryNode[] {
      return nodes
        .filter((node) => nodeMatchesSearch(node, search))
        .map((node) => ({
          ...node,
          children: filterNodes(node.children),
        }))
    }

    return filterNodes(tree)
  }, [tree, search])

  // Auto-expand tous les nœuds si recherche active
  const effectiveExpandedIds = useMemo(() => {
    if (search) {
      // Tout expand si recherche
      const allIds = new Set<string>()
      function collectIds(nodes: CategoryNode[]) {
        for (const node of nodes) {
          allIds.add(node.category.id)
          collectIds(node.children)
        }
      }
      collectIds(filteredTree)
      return allIds
    }
    return expandedIds
  }, [search, expandedIds, filteredTree])

  const toggleExpand = (id: string) => {
    if (search) return // Pas de toggle si recherche active
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelect = (categoryId: string | null) => {
    if (multiple) {
      if (categoryId === null) return // Pas de "Aucune" en mode multiple

      const current = selectedIds
      if (current.includes(categoryId)) {
        onChange(current.filter((id) => id !== categoryId))
      } else {
        onChange([...current, categoryId])
      }
    } else {
      onChange(categoryId ?? '')
    }
  }

  const isSelected = (categoryId: string | null) => {
    if (categoryId === null) {
      return !multiple && selectedIds.length === 0
    }
    return selectedIds.includes(categoryId)
  }

  // Obtenir les chemins des catégories sélectionnées
  const selectedPaths = useMemo(() => {
    if (!categories) return []
    return selectedIds
      .map((id) => {
        const cat = categories.find((c) => c.id === id)
        return cat ? { id, path: getCategoryPath(cat, categories) } : null
      })
      .filter(Boolean) as { id: string; path: string }[]
  }, [selectedIds, categories])

  return (
    <div className="space-y-2">
      {/* Catégories sélectionnées */}
      {selectedPaths.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedPaths.map(({ id, path }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleSelect(id)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-primary text-primary-foreground hover:bg-primary/80"
            >
              {path}
              <span className="ml-1">×</span>
            </button>
          ))}
        </div>
      )}

      {/* Barre de recherche */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {/* Liste des catégories */}
      <div
        className="border rounded-md overflow-y-auto"
        style={{ maxHeight }}
      >
        {/* Option "Aucune" */}
        {showNone && !multiple && (
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={cn(
              'w-full text-left px-3 py-2 text-sm flex items-center hover:bg-muted transition-colors',
              isSelected(null) && 'bg-primary/10 font-medium'
            )}
          >
            <Folder className="h-4 w-4 mr-2 text-muted-foreground" />
            <span className={cn(isSelected(null) && 'text-primary')}>
              {noneLabel}
            </span>
            {isSelected(null) && <span className="ml-auto text-primary">✓</span>}
          </button>
        )}

        {/* Arbre des catégories */}
        {filteredTree.map((node) => (
          <TreeNode
            key={node.category.id}
            node={node}
            level={0}
            expandedIds={effectiveExpandedIds}
            selectedIds={selectedIds}
            onToggleExpand={toggleExpand}
            onSelect={handleSelect}
            searchActive={!!search}
          />
        ))}

        {filteredTree.length === 0 && !showNone && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            {search ? 'Aucun résultat' : 'Aucune catégorie'}
          </div>
        )}
      </div>
    </div>
  )
}

interface TreeNodeProps {
  node: CategoryNode
  level: number
  expandedIds: Set<string>
  selectedIds: string[]
  onToggleExpand: (id: string) => void
  onSelect: (id: string) => void
  searchActive: boolean
}

function TreeNode({
  node,
  level,
  expandedIds,
  selectedIds,
  onToggleExpand,
  onSelect,
  searchActive,
}: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.category.id)
  const isSelected = selectedIds.includes(node.category.id)

  return (
    <div>
      <div
        className={cn(
          'flex items-center hover:bg-muted transition-colors',
          isSelected && 'bg-primary/10'
        )}
        style={{ paddingLeft: `${8 + level * 16}px` }}
      >
        {/* Bouton expand/collapse */}
        <button
          type="button"
          onClick={() => onToggleExpand(node.category.id)}
          className={cn(
            'p-1 rounded hover:bg-muted-foreground/10',
            !hasChildren && 'invisible'
          )}
          disabled={searchActive}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>

        {/* Bouton sélection */}
        <button
          type="button"
          onClick={() => onSelect(node.category.id)}
          className="flex-1 flex items-center gap-2 py-2 pr-3 text-sm text-left"
        >
          {isExpanded && hasChildren ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Folder className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={cn(isSelected && 'text-primary font-medium')}>
            {node.category.name}
          </span>
          {isSelected && <span className="ml-auto text-primary">✓</span>}
        </button>
      </div>

      {/* Enfants */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.category.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              selectedIds={selectedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              searchActive={searchActive}
            />
          ))}
        </div>
      )}
    </div>
  )
}