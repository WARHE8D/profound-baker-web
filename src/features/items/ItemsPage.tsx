import { useQuery } from '@tanstack/react-query'
import { Croissant, Plus, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { apiUrl } from '@/api'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  Pagination,
  SearchInput,
  Select,
  SortHeader,
  Spinner,
  useToast,
} from '@/components'
import { ownerCategoriesQuery } from '@/features/categories/queries'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import type { Item } from './item-form'
import { ownerItemsQuery, useSetAvailability, type ItemListParams, type SortField } from './queries'

const SORT_FIELDS: SortField[] = [
  'name',
  'category.name',
  'price',
  'leadTimeHours',
  'stockQuantity',
]

/** The list's filters, sort and page live in the URL, so a reload or a shared link keeps them. */
function readParams(search: URLSearchParams): ItemListParams {
  const sort = search.get('sort') as SortField | null
  const status = search.get('status')
  return {
    search: search.get('q') ?? '',
    categoryId: search.get('category'),
    available: status === 'available' ? true : status === 'hidden' ? false : null,
    sort: sort && SORT_FIELDS.includes(sort) ? sort : 'name',
    direction: search.get('dir') === 'desc' ? 'desc' : 'asc',
    page: Math.max(0, (Number(search.get('page')) || 1) - 1),
  }
}

/** `/owner/items`: every item on the menu, hidden ones included. */
export function ItemsPage() {
  const [search, setSearch] = useSearchParams()
  const params = readParams(search)
  const items = useQuery(ownerItemsQuery(params))
  const categories = useQuery(ownerCategoriesQuery())

  /** Updates some URL params; any filter or sort change goes back to page 1. */
  function update(changes: Record<string, string | null>, { keepPage = false } = {}) {
    setSearch(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  function sortBy(field: SortField) {
    const direction = params.sort === field && params.direction === 'asc' ? 'desc' : 'asc'
    update({ sort: field === 'name' ? null : field, dir: direction === 'asc' ? null : 'desc' })
  }

  const filtered = params.search !== '' || params.categoryId !== null || params.available !== null
  const page = items.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">Items</h1>
          <p className="text-muted">Everything on your menu, including items hidden from guests.</p>
        </div>
        <ButtonLink to="/owner/items/new">
          <Plus aria-hidden="true" className="size-4" />
          New item
        </ButtonLink>
      </div>

      <search className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem]">
        <SearchInput
          label="Search items"
          placeholder="Search by name"
          value={params.search}
          onChange={(q) => update({ q })}
        />
        <Select
          aria-label="Category"
          value={params.categoryId ?? ''}
          onChange={(event) => update({ category: event.target.value })}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Status"
          value={params.available === null ? '' : params.available ? 'available' : 'hidden'}
          onChange={(event) => update({ status: event.target.value })}
        >
          <option value="">All items</option>
          <option value="available">On the storefront</option>
          <option value="hidden">Hidden</option>
        </Select>
      </search>

      {page ? (
        page.items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<Search className="size-8 text-muted" />}
              title="No items match"
              description="Try another search, or clear the filters."
              action={
                <Button
                  variant="secondary"
                  onClick={() => update({ q: null, category: null, status: null })}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Croissant className="size-8 text-muted" />}
              title="No items yet"
              description="Add the first thing guests can order."
              action={<ButtonLink to="/owner/items/new">New item</ButtonLink>}
            />
          )
        ) : (
          <>
            <ItemsTable
              items={page.items}
              params={params}
              onSort={sortBy}
              busy={items.isPlaceholderData}
            />
            <Pagination
              page={page.number}
              totalPages={page.totalPages}
              total={page.totalElements}
              noun={['item', 'items']}
              onPage={(n) => update({ page: n === 0 ? null : String(n + 1) }, { keepPage: true })}
            />
          </>
        )
      ) : items.isError ? (
        <ErrorState
          error={items.error}
          title="We couldn't load your items"
          onRetry={() => void items.refetch()}
          retrying={items.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading items" />
        </div>
      )}
    </div>
  )
}

type ItemsTableProps = {
  items: Item[]
  params: ItemListParams
  onSort: (field: SortField) => void
  busy: boolean
}

function ItemsTable({ items, params, onSort, busy }: ItemsTableProps) {
  const header = (field: SortField, label: string, className?: string) => (
    <SortHeader
      field={field}
      label={label}
      sort={params.sort}
      direction={params.direction}
      onSort={onSort}
      className={className}
    />
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface transition-opacity',
        busy && 'opacity-60',
      )}
      aria-busy={busy || undefined}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">Items, sorted by {sortLabel(params)}</caption>
        <thead className="border-b border-border bg-surface-muted/60 text-left text-xs text-muted">
          <tr>
            {header('name', 'Item')}
            {header('category.name', 'Category', 'hidden md:table-cell')}
            {header('price', 'Price', 'text-right')}
            {header('leadTimeHours', 'Notice', 'hidden text-right lg:table-cell')}
            {header('stockQuantity', 'Stock', 'hidden text-right sm:table-cell')}
            <th scope="col" className="px-4 py-2 text-right font-semibold">
              On storefront
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const SORT_LABELS: Record<SortField, string> = {
  name: 'name',
  'category.name': 'category',
  price: 'price',
  leadTimeHours: 'notice',
  stockQuantity: 'stock',
}

const sortLabel = (params: ItemListParams) =>
  `${SORT_LABELS[params.sort]}, ${params.direction === 'asc' ? 'ascending' : 'descending'}`

function ItemRow({ item }: { item: Item }) {
  const thumbnail = item.thumbnailUrls[0]
  return (
    <tr className={cn(!item.available && 'text-muted')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {thumbnail ? (
            <img
              src={apiUrl(thumbnail)}
              alt=""
              loading="lazy"
              className="size-10 shrink-0 rounded-control object-cover"
            />
          ) : (
            <span className="size-10 shrink-0 rounded-control bg-surface-muted" />
          )}
          <div className="flex min-w-0 flex-col">
            <Link
              to={`/owner/items/${item.id}`}
              className="font-medium text-text underline-offset-4 hover:underline"
            >
              {item.name}
            </Link>
            <span className="text-xs text-muted md:hidden">{item.category.name}</span>
            {item.available && !item.orderable && (
              <Badge tone="warning" className="mt-1 self-start">
                Sold out
              </Badge>
            )}
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 md:table-cell">{item.category.name}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(item.price)}</td>
      <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
        {item.leadTimeHours === 0 ? '—' : `${item.leadTimeHours} h`}
      </td>
      <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
        {item.stockQuantity === null ? (
          <span className="text-muted">Unlimited</span>
        ) : (
          item.stockQuantity
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <AvailabilitySwitch item={item} />
      </td>
    </tr>
  )
}

function AvailabilitySwitch({ item }: { item: Item }) {
  const { toast } = useToast()
  const change = useSetAvailability()
  // Show the new position right away; the list catches up when it refetches.
  const shown = change.isPending ? (change.variables?.available ?? item.available) : item.available

  function toggle() {
    change.mutate(
      { id: item.id, available: !item.available },
      {
        onSuccess: (saved) =>
          toast({
            tone: 'success',
            title: saved.available
              ? `“${saved.name}” is on the storefront`
              : `“${saved.name}” is hidden from guests`,
          }),
        onError: (error) =>
          toast({
            tone: 'error',
            title: `Couldn't change “${item.name}”`,
            description: error.message,
          }),
      },
    )
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={`Show ${item.name} on the storefront`}
      onClick={toggle}
      disabled={change.isPending}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-60',
        shown ? 'bg-success' : 'bg-border',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-5 rounded-full bg-surface shadow transition-transform',
          shown ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
