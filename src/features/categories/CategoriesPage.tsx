import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { isApiError } from '@/api'
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Spinner,
  useToast,
} from '@/components'
import {
  CATEGORY_NAME_MAX,
  categoryNameError,
  ownerCategoriesQuery,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
  type Category,
} from './queries'

type Problem = { message: string; requestId: string | null }

/** `/owner/categories`: the menu's categories, which guests filter the storefront by. */
export function CategoriesPage() {
  const categories = useQuery(ownerCategoriesQuery())

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">Categories</h1>
        <p className="text-muted">Guests browse and filter your menu by these.</p>
      </div>

      {categories.data ? (
        <>
          <AddCategory categories={categories.data} />
          <CategoryList categories={categories.data} />
        </>
      ) : categories.isError ? (
        <ErrorState
          error={categories.error}
          title="We couldn't load your categories"
          onRetry={() => void categories.refetch()}
          retrying={categories.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading categories" />
        </div>
      )}
    </div>
  )
}

function AddCategory({ categories }: { categories: readonly Category[] }) {
  const { toast } = useToast()
  const create = useCreateCategory()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (create.isPending) return
    setProblem(null)
    const invalid = categoryNameError(name, categories)
    setError(invalid)
    if (invalid) return inputRef.current?.focus()

    try {
      const created = await create.mutateAsync(name.trim())
      setName('')
      toast({ tone: 'success', title: `Added “${created.name}”` })
    } catch (failure) {
      const known = nameProblem(failure)
      if (known) setError(known)
      else setProblem(toProblem(failure))
      inputRef.current?.focus()
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-label="Add a category"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field label="New category" error={error ?? undefined} className="flex-1">
          <Input
            ref={inputRef}
            value={name}
            maxLength={CATEGORY_NAME_MAX}
            placeholder="e.g. Cookies"
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
          />
        </Field>
        <Button type="submit" loading={create.isPending} className="sm:mt-7">
          <Plus aria-hidden="true" className="size-4" />
          Add category
        </Button>
      </div>
      {problem && <ProblemBox problem={problem} />}
    </form>
  )
}

function CategoryList({ categories }: { categories: readonly Category[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={<Tags className="size-8 text-muted" />}
        title="No categories yet"
        description="Add your first one above, e.g. Bread, Cakes or Pastries."
      />
    )
  }

  return (
    <section aria-labelledby="category-list" className="flex flex-col gap-2">
      <h2 id="category-list" className="text-sm font-semibold text-muted">
        {categories.length === 1 ? '1 category' : `${categories.length} categories`}
      </h2>
      <ul
        aria-label="Categories"
        className="divide-y divide-border rounded-card border border-border bg-surface"
      >
        {categories.map((category) => (
          <li key={category.id} className="px-4 py-3">
            {editingId === category.id ? (
              <RenameCategory
                category={category}
                categories={categories}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 font-medium break-words">{category.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Rename ${category.name}`}
                  onClick={() => setEditingId(category.id)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  <span className="hidden sm:inline">Rename</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${category.name}`}
                  className="text-danger hover:text-danger"
                  onClick={() => setDeleting(category)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <DeleteCategoryDialog category={deleting} onClose={() => setDeleting(null)} />
    </section>
  )
}

type RenameCategoryProps = {
  category: Category
  categories: readonly Category[]
  onDone: () => void
}

function RenameCategory({ category, categories, onDone }: RenameCategoryProps) {
  const { toast } = useToast()
  const rename = useRenameCategory()
  const [name, setName] = useState(category.name)
  const [error, setError] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (rename.isPending) return
    setProblem(null)
    if (name.trim() === category.name) return onDone()
    const invalid = categoryNameError(name, categories, category.id)
    setError(invalid)
    if (invalid) return inputRef.current?.focus()

    try {
      const renamed = await rename.mutateAsync({ id: category.id, name: name.trim() })
      toast({ tone: 'success', title: `Renamed to “${renamed.name}”` })
      onDone()
    } catch (failure) {
      if (isApiError(failure) && failure.status === 404) {
        toast({ tone: 'error', title: `“${category.name}” was already deleted` })
        return onDone()
      }
      const known = nameProblem(failure)
      if (known) setError(known)
      else setProblem(toProblem(failure))
      inputRef.current?.focus()
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onDone()
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void save(event)}
      aria-labelledby={labelId}
      className="flex flex-col gap-2"
    >
      <span id={labelId} className="sr-only">
        Rename {category.name}
      </span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Field label="Name" error={error ?? undefined} className="flex-1">
          <Input
            ref={inputRef}
            // Rename was just clicked: the field is what the Owner wants next.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={name}
            maxLength={CATEGORY_NAME_MAX}
            onFocus={(event) => event.target.select()}
            onKeyDown={onKeyDown}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
          />
        </Field>
        <div className="flex gap-2 sm:mt-7">
          <Button type="submit" size="sm" loading={rename.isPending}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onDone} disabled={rename.isPending}>
            Cancel
          </Button>
        </div>
      </div>
      {problem && <ProblemBox problem={problem} />}
    </form>
  )
}

function DeleteCategoryDialog({
  category,
  onClose,
}: {
  category: Category | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const remove = useDeleteCategory()
  // Kept while the dialog closes, so its text doesn't blank out mid-animation.
  const [shown, setShown] = useState<Category | null>(category)
  if (category && category !== shown) setShown(category)
  // 409: the server refused because items still use the category.
  const inUse = isApiError(remove.error) && remove.error.status === 409 ? remove.error : null

  function close() {
    if (remove.isPending) return
    remove.reset()
    onClose()
  }

  async function confirm() {
    if (!category) return
    try {
      await remove.mutateAsync(category.id)
      toast({ tone: 'success', title: `Deleted “${category.name}”` })
      close()
    } catch (failure) {
      if (isApiError(failure) && failure.status === 404) {
        // Gone already (another tab): the list refreshes, nothing left to do.
        remove.reset()
        onClose()
      }
    }
  }

  return (
    <Dialog
      open={category !== null}
      onClose={close}
      title={`Delete “${shown?.name ?? ''}”?`}
      description="Guests won't see this category any more. This can't be undone."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={remove.isPending}>
            {inUse ? 'OK' : 'Cancel'}
          </Button>
          {!inUse && (
            <Button variant="danger" onClick={() => void confirm()} loading={remove.isPending}>
              Delete
            </Button>
          )}
        </>
      }
    >
      {inUse ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-control bg-danger/10 px-4 py-3 text-sm"
        >
          <p className="font-semibold">This category still has items.</p>
          <p>
            {capitalize(inUse.message)}. Move its items to another category or delete them, then try
            again.
          </p>
          <Link to="/owner/items" className="self-start font-medium text-primary underline">
            Go to Items
          </Link>
        </div>
      ) : (
        remove.error && <ProblemBox problem={toProblem(remove.error)} />
      )}
    </Dialog>
  )
}

/** A server answer about the name itself: a duplicate (409) or a validation error on `name`. */
function nameProblem(error: unknown): string | null {
  if (!isApiError(error)) return null
  if (error.status === 409) return capitalize(error.message)
  const field = error.fieldError('name')
  return field ? `Name ${field}` : null
}

function toProblem(error: unknown): Problem {
  return isApiError(error)
    ? { message: error.message, requestId: error.requestId }
    : { message: 'Something went wrong. Please try again.', requestId: null }
}

function ProblemBox({ problem }: { problem: Problem }) {
  return (
    <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm text-text">
      <p>{problem.message}</p>
      {problem.requestId && (
        <p className="mt-2 text-xs text-muted">
          Reference: <code className="font-mono select-all">{problem.requestId}</code>
        </p>
      )}
    </div>
  )
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
