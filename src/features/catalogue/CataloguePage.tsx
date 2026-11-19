import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import type { Schema } from '@/api'
import { Button, EmptyState, ErrorState } from '@/components'
import { CategoryFilter } from './CategoryFilter'
import { ItemCard, ItemCardSkeleton } from './ItemCard'
import { catalogueItemsQuery, categoriesQuery } from './queries'

const SKELETON_COUNT = 8
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

const GRID = 'grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-6'

/** Storefront home: every available item, filterable by category through `?category=<id>`. */
export function CataloguePage() {
  const [searchParams] = useSearchParams()
  const categoryParam = searchParams.get('category')
  // The backend answers a malformed UUID with 400, so such a link never reaches it.
  const categoryId = categoryParam !== null && UUID.test(categoryParam) ? categoryParam : null

  const categories = useQuery(categoriesQuery())
  const items = useInfiniteQuery({
    ...catalogueItemsQuery(categoryId),
    enabled: categoryParam === null || categoryId !== null,
  })

  const selectedCategory = categories.data?.find((c) => c.id === categoryId)
  const unknownCategory =
    categoryParam !== null && (categoryId === null || (categories.isSuccess && !selectedCategory))

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold sm:text-5xl">
          Fresh from the oven, ready for pickup.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Breads, cakes and pastries baked to order. Choose your pickup time at checkout.
        </p>
      </div>

      {/* Without categories the items still show; the filter is the only thing missing. */}
      {categories.data && categories.data.length > 0 && (
        <CategoryFilter
          categories={categories.data}
          selectedId={unknownCategory ? null : categoryId}
        />
      )}

      <section aria-labelledby="catalogue-heading" className="flex flex-col gap-4">
        <h2 id="catalogue-heading" className="sr-only">
          {selectedCategory?.name ?? 'All items'}
        </h2>
        {unknownCategory ? (
          <EmptyState
            icon="🔎"
            title="We couldn't find that category"
            description="It may have been renamed or removed."
            action={<ShowAllLink />}
          />
        ) : items.data ? (
          <ItemGrid
            items={items.data.pages.flatMap((page) => page.items)}
            total={items.data.pages[0]?.totalElements ?? 0}
            showCategory={categoryId === null}
            filtered={categoryId !== null}
            loadMore={
              items.hasNextPage
                ? {
                    onClick: () => void items.fetchNextPage(),
                    loading: items.isFetchingNextPage,
                    error: items.isFetchNextPageError ? items.error : null,
                  }
                : undefined
            }
          />
        ) : items.isError ? (
          <ErrorState
            error={items.error}
            title="We couldn't load the menu"
            onRetry={() => void items.refetch()}
            retrying={items.isFetching}
          />
        ) : (
          <LoadingGrid />
        )}
      </section>
    </div>
  )
}

type ItemGridProps = {
  items: Schema<'PublicItemResponse'>[]
  total: number
  showCategory: boolean
  filtered: boolean
  loadMore?: { onClick: () => void; loading: boolean; error: unknown }
}

function ItemGrid({ items, total, showCategory, filtered, loadMore }: ItemGridProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🧺"
        title={filtered ? 'Nothing in this category right now' : 'Nothing on the menu right now'}
        description={
          filtered
            ? 'Have a look at the rest of the menu.'
            : 'The bakery is restocking. Please check back soon.'
        }
        action={filtered ? <ShowAllLink /> : undefined}
      />
    )
  }

  return (
    <>
      <ul className={GRID}>
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} showCategory={showCategory} />
          </li>
        ))}
      </ul>
      {loadMore && (
        <div className="flex flex-col items-center gap-3 pt-4">
          <p className="text-sm text-muted">
            Showing {items.length} of {total}
          </p>
          {loadMore.error !== null && (
            <ErrorState error={loadMore.error} title="We couldn't load more items" />
          )}
          <Button variant="secondary" onClick={loadMore.onClick} loading={loadMore.loading}>
            {loadMore.error !== null ? 'Try again' : 'Show more'}
          </Button>
        </div>
      )}
    </>
  )
}

function LoadingGrid() {
  return (
    <>
      <output className="sr-only">Loading the menu…</output>
      <ul aria-hidden="true" className={GRID}>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <li key={i}>
            <ItemCardSkeleton />
          </li>
        ))}
      </ul>
    </>
  )
}

function ShowAllLink() {
  return (
    <Link
      to={{ search: '' }}
      className="inline-flex h-10 items-center rounded-control bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
    >
      See the whole menu
    </Link>
  )
}
