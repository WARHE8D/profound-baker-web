import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { isApiError } from '@/api'
import {
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components'
import { formatLeadTime } from '@/features/catalogue/lead-time'
import { ownerCategoriesQuery, type Category } from '@/features/categories/queries'
import { defaultCurrency } from '@/lib/money'
import { isUuid } from '@/lib/uuid'
import {
  DESCRIPTION_MAX,
  emptyItemForm,
  FIELD_LABELS,
  itemFieldErrors,
  itemFormSchema,
  NAME_MAX,
  stateOfForm,
  stateOfItem,
  toItemForm,
  toItemRequest,
  type Item,
  type ItemFormField,
  type ItemFormValues,
  type ItemStateKey,
} from './item-form'
import { ItemPhotos } from './ItemPhotos'
import {
  isConcurrencyConflict,
  ownerItemQuery,
  useCreateItem,
  useDeleteItem,
  useSetAvailability,
  useUpdateItem,
} from './queries'

type Problem = { message: string; requestId: string | null }

/** `/owner/items/new` and `/owner/items/:id`. */
export function ItemEditorPage() {
  const { itemId } = useParams()
  const isNew = itemId === undefined
  const validId = !isNew && isUuid(itemId) ? itemId : null
  const item = useQuery({ ...ownerItemQuery(validId ?? ''), enabled: validId !== null })
  const categories = useQuery(ownerCategoriesQuery())

  let content
  if (!isNew && (validId === null || (isApiError(item.error) && item.error.status === 404))) {
    content = (
      <EmptyState
        icon="🥐"
        title="This item doesn't exist"
        description="It may have been deleted."
        action={<ButtonLink to="/owner/items">Back to items</ButtonLink>}
      />
    )
  } else if (item.isError || categories.isError) {
    const failed = item.isError ? item : categories
    content = (
      <ErrorState
        error={failed.error}
        title="We couldn't load this item"
        onRetry={() => void failed.refetch()}
        retrying={failed.isFetching}
      />
    )
  } else if (categories.data && (isNew || item.data)) {
    content =
      categories.data.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="Add a category first"
          description="Every item belongs to a category, so guests can find it."
          action={<ButtonLink to="/owner/categories">Go to categories</ButtonLink>}
        />
      ) : (
        <ItemForm
          key={item.data?.id ?? 'new'}
          item={item.data ?? null}
          categories={categories.data}
        />
      )
  } else {
    content = (
      <div className="flex justify-center py-12">
        <Spinner label="Loading item" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/owner/items"
        className="inline-flex items-center gap-1 self-start text-sm text-muted hover:text-text"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        All items
      </Link>
      {content}
    </div>
  )
}

function ItemForm({ item, categories }: { item: Item | null; categories: readonly Category[] }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const create = useCreateItem()
  const update = useUpdateItem(item?.id ?? '')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /**
   * The item as the form last started from it: what the Owner's edits are measured against when
   * saving. Not the live query data, which a refetch could move mid-edit and so turn someone
   * else's change into what looks like an edit of the Owner's.
   */
  const baseline = useRef(item)
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: item ? toItemForm(item) : emptyItemForm,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { register, handleSubmit, setError, formState, control } = form
  const { errors, isDirty, isSubmitSuccessful } = formState
  const [trackStock, leadTime] = useWatch({ control, name: ['trackStock', 'leadTimeHours'] })
  const saving = create.isPending || update.isPending
  const [photosBusy, setPhotosBusy] = useState(false)
  const onPhotosBusyChange = useCallback((busy: boolean) => setPhotosBusy(busy), [])

  // The server's copy changed (a refetch, another tab) while nothing is being edited: show it.
  useEffect(() => {
    if (!item || item.updatedAt === baseline.current?.updatedAt || isDirty || saving) return
    baseline.current = item
    form.reset(toItemForm(item))
  }, [item, isDirty, saving, form])

  // Leaving with unsaved edits, or photos still uploading, asks first (in-app navigation and
  // closing the tab).
  const unsaved = isDirty && !isSubmitSuccessful && !saving
  const blocker = useBlocker(unsaved || photosBusy)
  useEffect(() => {
    if (!isDirty && !photosBusy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty, photosBusy])

  async function submit(values: ItemFormValues) {
    setProblem(null)
    setNotice(null)
    try {
      const loaded = baseline.current
      if (!item || !loaded) {
        const created = await create.mutateAsync({
          request: toItemRequest(stateOfForm(values)),
          available: values.available,
        })
        toast({ tone: 'success', title: `Added “${created.name}”` })
        await navigate(`/owner/items/${created.id}`, { replace: true })
        return
      }
      const result = await update.mutateAsync({ loaded: stateOfItem(loaded), values })
      baseline.current = result.item
      form.reset(toItemForm(result.item))
      toast({ tone: 'success', title: 'Changes saved' })
      setNotice(describeMerge(result.updatedElsewhere, result.overwritten))
    } catch (error) {
      handleError(error)
    }
  }

  function handleError(error: unknown) {
    if (!isApiError(error)) {
      setProblem({ message: 'Something went wrong. Please try again.', requestId: null })
      return
    }
    if (isConcurrencyConflict(error)) {
      setProblem({
        message:
          'This item kept changing while we saved it (probably orders coming in). Nothing was lost: your edits are still here. Please save again.',
        requestId: error.requestId,
      })
      return
    }
    if (error.status === 404 && error.message.startsWith('Category')) {
      setError(
        'categoryId',
        { type: 'server', message: 'That category was deleted. Choose another.' },
        { shouldFocus: true },
      )
      return
    }
    const fields = Object.entries(itemFieldErrors(error)) as [ItemFormField, string][]
    fields.forEach(([field, message], index) =>
      setError(field, { type: 'server', message }, { shouldFocus: index === 0 }),
    )
    if (fields.length === 0) setProblem({ message: error.message, requestId: error.requestId })
  }

  const leadHours = Number(leadTime)
  const leadHint =
    leadTime.trim() === '' || !Number.isInteger(leadHours)
      ? 'How much notice you need before pickup.'
      : `${formatLeadTime(leadHours)}: guests can't pick a slot sooner than this.`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{item ? item.name : 'New item'}</h1>
        {item && <DeleteItem item={item} />}
      </div>

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
        className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
            <Input maxLength={NAME_MAX} {...register('name')} />
          </Field>
          <Field label="Category" required error={errors.categoryId?.message}>
            <Select {...register('categoryId')}>
              <option value="" disabled>
                Choose a category
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Price (${defaultCurrency})`} required error={errors.price?.message}>
            <Input inputMode="decimal" placeholder="4.50" {...register('price')} />
          </Field>
          <Field
            label="Description"
            hint="Shown to guests on the item's page."
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            <Textarea rows={4} maxLength={DESCRIPTION_MAX} {...register('description')} />
          </Field>
          <Field label="Notice (hours)" hint={leadHint} error={errors.leadTimeHours?.message}>
            <Input inputMode="numeric" {...register('leadTimeHours')} />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Stock</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                {...register('trackStock')}
              />
              Limit how many can be ordered
            </label>
            {trackStock ? (
              <Field label="In stock" error={errors.stockQuantity?.message}>
                <Input inputMode="numeric" {...register('stockQuantity')} />
              </Field>
            ) : (
              <p className="text-sm text-muted">Unlimited: guests can always order it.</p>
            )}
          </fieldset>
        </div>

        <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...register('available')}
          />
          <span>
            <span className="font-medium">Show on the storefront</span>
            <span className="block text-muted">
              Untick to hide it from guests without deleting it.
            </span>
          </span>
        </label>

        {notice && (
          <output className="block rounded-control bg-surface-muted px-4 py-3 text-sm">
            {notice}
          </output>
        )}
        {problem && (
          <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm text-text">
            <p>{problem.message}</p>
            {problem.requestId && (
              <p className="mt-2 text-xs text-muted">
                Reference: <code className="font-mono select-all">{problem.requestId}</code>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="submit" loading={saving} disabled={item !== null && !isDirty}>
            {item ? 'Save changes' : 'Add item'}
          </Button>
          {item && isDirty && (
            <Button variant="ghost" onClick={() => form.reset()} disabled={saving}>
              Discard changes
            </Button>
          )}
        </div>
      </form>

      {item ? (
        <ItemPhotos item={item} onBusyChange={onPhotosBusyChange} />
      ) : (
        <section className="rounded-card border border-dashed border-border p-5 text-sm text-muted sm:p-6">
          <h2 className="mb-1 text-lg font-semibold text-text">Photos</h2>
          Add the item first; then you can add its photos here.
        </section>
      )}

      <Dialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title={photosBusy && !unsaved ? 'Leave before the photos finish?' : 'Leave without saving?'}
        description={[
          unsaved && 'Your changes to this item will be lost.',
          photosBusy && "Photos that haven't finished uploading won't be added.",
        ]
          .filter(Boolean)
          .join(' ')}
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              {unsaved ? 'Keep editing' : 'Stay'}
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              {unsaved ? 'Discard changes' : 'Leave anyway'}
            </Button>
          </>
        }
      />
    </div>
  )
}

const fieldList = (keys: ItemStateKey[]) => keys.map((k) => FIELD_LABELS[k]).join(', ')

/** After a save, what the merge did with changes made elsewhere meanwhile (null: nothing). */
function describeMerge(updatedElsewhere: ItemStateKey[], overwritten: ItemStateKey[]) {
  const parts = []
  if (updatedElsewhere.length > 0) {
    parts.push(
      `The ${fieldList(updatedElsewhere)} changed while you were editing (orders or another tab); we kept the new value.`,
    )
  }
  if (overwritten.length > 0) {
    parts.push(`The ${fieldList(overwritten)} had also changed elsewhere; your value replaced it.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}

function DeleteItem({ item }: { item: Item }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const remove = useDeleteItem()
  const hide = useSetAvailability()
  const [open, setOpen] = useState(false)
  // 409: the item has order history and can only be hidden.
  const hasHistory = isApiError(remove.error) && remove.error.status === 409 ? remove.error : null

  function close() {
    if (remove.isPending || hide.isPending) return
    remove.reset()
    setOpen(false)
  }

  async function confirm() {
    try {
      await remove.mutateAsync(item.id)
      toast({ tone: 'success', title: `Deleted “${item.name}”` })
      setOpen(false)
      await navigate('/owner/items', { replace: true })
    } catch {
      // Shown in the dialog.
    }
  }

  async function hideInstead() {
    await hide.mutateAsync({ id: item.id, available: false })
    toast({ tone: 'success', title: `“${item.name}” is hidden from guests` })
    remove.reset()
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="ghost"
        className="text-danger hover:text-danger"
        onClick={() => setOpen(true)}
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Delete
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={`Delete “${item.name}”?`}
        description="It disappears from the menu for good. This can't be undone."
        footer={
          hasHistory ? (
            <>
              <Button variant="secondary" onClick={close}>
                Keep it
              </Button>
              {item.available && (
                <Button onClick={() => void hideInstead()} loading={hide.isPending}>
                  Hide it instead
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={close} disabled={remove.isPending}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void confirm()} loading={remove.isPending}>
                Delete
              </Button>
            </>
          )
        }
      >
        {hasHistory ? (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-control bg-surface-muted px-4 py-3 text-sm"
          >
            <p className="font-semibold">Guests have ordered this item, so it can't be deleted.</p>
            <p>
              Orders keep a link to it.{' '}
              {item.available
                ? 'Hide it instead: guests stop seeing it, and your order history stays complete.'
                : "It's already hidden from guests."}
            </p>
          </div>
        ) : (
          remove.error && (
            <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm">
              <p>{remove.error.message}</p>
              {isApiError(remove.error) && remove.error.requestId && (
                <p className="mt-2 text-xs text-muted">
                  Reference: <code className="font-mono select-all">{remove.error.requestId}</code>
                </p>
              )}
            </div>
          )
        )}
      </Dialog>
    </>
  )
}
