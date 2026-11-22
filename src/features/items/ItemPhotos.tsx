import { ImagePlus, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { apiUrl, isApiError } from '@/api'
import { Badge, Button, buttonClass, Dialog, Spinner, useToast } from '@/components'
import { cn } from '@/lib/cn'
import {
  ACCEPTED_IMAGE_TYPES,
  checkImageFile,
  formatFileSize,
  MAX_IMAGE_BYTES,
} from './image-check'
import type { Item } from './item-form'
import { useRemoveImage, useUploadImage } from './queries'

type Upload = {
  key: string
  file: File
  /** An object URL for the thumbnail, once the file passed the checks. */
  preview: string | null
  status: 'checking' | 'invalid' | 'queued' | 'uploading' | 'failed'
  /** 0 to 1: how much of the file has been sent; null until the browser first says. */
  progress: number | null
  problem: string | null
  requestId: string | null
}

/** Files from the desktop, not text or a link dragged from the page. */
const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

const isPending = (upload: Upload) =>
  upload.status === 'checking' || upload.status === 'queued' || upload.status === 'uploading'

function uploadProblem(error: unknown): Pick<Upload, 'problem' | 'requestId'> {
  if (!isApiError(error))
    return { problem: 'Something went wrong. Please try again.', requestId: null }
  let problem = error.message
  if (error.status === 413) {
    problem = `It's too large for the server; photos can be at most ${formatFileSize(MAX_IMAGE_BYTES)}.`
  } else if (error.status === 404) {
    problem = 'This item no longer exists.'
  } else if (error.status === 400) {
    // The server's own words ("not a PNG, JPEG or WebP image"), as a sentence.
    problem = `${problem.charAt(0).toUpperCase()}${problem.slice(1)}.`
  }
  return { problem, requestId: error.requestId }
}

/**
 * The item's photos: add (several at once, by picking or dropping), watch them upload, remove.
 * Changes apply straight away, apart from the details form and its Save button. Files are checked
 * here first and sent one at a time, in the order they were picked, so the first becomes the cover.
 */
export function ItemPhotos({
  item,
  onBusyChange,
}: {
  item: Item
  /** True while photos are still being checked or uploaded: leaving the page would drop them. */
  onBusyChange: (busy: boolean) => void
}) {
  const { toast } = useToast()
  const upload = useUploadImage(item.id)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState<{ url: string; index: number } | null>(null)

  // Bookkeeping the async upload loop reads; the list on screen is `uploads`.
  const files = useRef(new Map<string, File>())
  const previews = useRef(new Map<string, string>())
  const queue = useRef<string[]>([])
  const checks = useRef(Promise.resolve())
  const running = useRef(false)
  const inFlight = useRef<{ key: string; controller: AbortController } | null>(null)
  const alive = useRef(true)

  const busy = uploads.some(isPending)
  useEffect(() => onBusyChange(busy), [busy, onBusyChange])

  useEffect(() => {
    alive.current = true
    const urls = previews.current
    return () => {
      // Leaving the page: stop what's left and free the previews.
      alive.current = false
      queue.current = []
      inFlight.current?.controller.abort()
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const patch = (key: string, changes: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...changes } : u)))

  function forget(key: string) {
    files.current.delete(key)
    queue.current = queue.current.filter((k) => k !== key)
    const preview = previews.current.get(key)
    if (preview) URL.revokeObjectURL(preview)
    previews.current.delete(key)
    setUploads((list) => list.filter((u) => u.key !== key))
  }

  function addFiles(picked: Iterable<File>) {
    const added: Upload[] = [...picked].map((file) => ({
      key: crypto.randomUUID(),
      file,
      preview: null,
      status: 'checking',
      progress: null,
      problem: null,
      requestId: null,
    }))
    if (added.length === 0) return
    added.forEach((u) => files.current.set(u.key, u.file))
    setUploads((list) => [...list, ...added])
    // One after another, so the upload order is the order they were picked in.
    for (const entry of added) {
      checks.current = checks.current.then(() => check(entry))
    }
  }

  async function check({ key, file }: Upload) {
    const problem = await checkImageFile(file)
    if (!alive.current || !files.current.has(key)) return
    if (problem) {
      patch(key, { status: 'invalid', problem })
      return
    }
    const preview = URL.createObjectURL(file)
    previews.current.set(key, preview)
    patch(key, { status: 'queued', preview })
    queue.current.push(key)
    void sendQueued()
  }

  /** Sends queued photos one at a time: each one is appended to the item. */
  async function sendQueued() {
    if (running.current) return
    running.current = true
    let added = 0
    try {
      for (let key = queue.current.shift(); key !== undefined; key = queue.current.shift()) {
        if (await send(key)) added += 1
      }
    } finally {
      running.current = false
    }
    if (added > 0 && alive.current) {
      toast({ tone: 'success', title: added === 1 ? 'Photo added' : `${added} photos added` })
    }
  }

  async function send(key: string): Promise<boolean> {
    const file = files.current.get(key)
    if (!file) return false
    const controller = new AbortController()
    inFlight.current = { key, controller }
    patch(key, { status: 'uploading', progress: null, problem: null, requestId: null })
    try {
      await upload.mutateAsync({
        file,
        signal: controller.signal,
        onProgress: ({ loaded, total }) => {
          if (total > 0) patch(key, { progress: loaded / total })
        },
      })
      // It's in the item's photos now.
      forget(key)
      return true
    } catch (error) {
      if (!controller.signal.aborted && alive.current) {
        patch(key, { status: 'failed', ...uploadProblem(error) })
      }
      return false
    } finally {
      inFlight.current = null
    }
  }

  function retry(key: string) {
    patch(key, { status: 'queued', progress: null, problem: null, requestId: null })
    queue.current.push(key)
    void sendQueued()
  }

  function cancel(key: string) {
    if (inFlight.current?.key === key) inFlight.current.controller.abort()
    forget(key)
  }

  const count = item.imageUrls.length

  return (
    // Dropping files is a shortcut for the mouse; "Add photos" does the same from the keyboard.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-labelledby="photos-heading"
      className={cn(
        'flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:p-6',
        dragging && 'border-primary ring-2 ring-primary/30',
      )}
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(event) => {
        // Only when leaving the section, not when moving between its children.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setDragging(false)
        addFiles(event.dataTransfer.files)
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-60 flex-1">
          <h2 id="photos-heading" className="text-lg font-semibold">
            Photos
          </h2>
          <p className="text-sm text-muted">
            The first photo is the one guests see in the menu. JPEG, PNG or WebP, up to{' '}
            {formatFileSize(MAX_IMAGE_BYTES)} each. Photos are added and removed straight away.
          </p>
        </div>
        <label
          className={buttonClass({
            variant: 'secondary',
            className:
              'cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
          })}
        >
          <ImagePlus aria-hidden="true" className="size-4" />
          Add photos
          <input
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            multiple
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files ?? [])
              // Picking the same file again (after a failure) should fire change again.
              event.target.value = ''
            }}
          />
        </label>
      </div>

      {count > 0 ? (
        <ul aria-label="Photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {item.imageUrls.map((url, index) => (
            <li key={url} className="relative">
              <img
                src={apiUrl(item.thumbnailUrls[index] ?? url)}
                alt={count > 1 ? `${item.name}, ${index + 1} of ${count}` : item.name}
                loading="lazy"
                className="aspect-square w-full rounded-control bg-surface-muted object-cover"
              />
              {index === 0 && (
                <Badge className="absolute top-2 left-2 bg-surface/95 text-text shadow-sm">
                  Cover
                </Badge>
              )}
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => setRemoving({ url, index })}
                className="absolute top-2 right-2 rounded-full bg-surface/90 p-1.5 text-danger shadow-sm hover:bg-surface"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-control border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          No photos yet: guests see a placeholder. Add some, or drop them here.
        </p>
      )}

      {uploads.length > 0 && (
        <ul aria-label="Uploads" className="flex flex-col divide-y divide-border">
          {uploads.map((u) => (
            <UploadRow
              key={u.key}
              upload={u}
              onRetry={() => retry(u.key)}
              onCancel={() => cancel(u.key)}
            />
          ))}
        </ul>
      )}

      {removing && (
        <RemovePhotoDialog item={item} photo={removing} onClose={() => setRemoving(null)} />
      )}
    </section>
  )
}

function UploadRow({
  upload: u,
  onRetry,
  onCancel,
}: {
  upload: Upload
  onRetry: () => void
  onCancel: () => void
}) {
  const failed = u.status === 'invalid' || u.status === 'failed'
  const processing = u.status === 'uploading' && u.progress !== null && u.progress >= 1
  let status
  if (u.status === 'checking') status = 'Checking…'
  else if (u.status === 'queued') status = 'Waiting to upload…'
  else if (processing) status = 'Processing…'
  else if (u.status === 'uploading') {
    // No figure yet (or none coming): the bar runs without one.
    status = u.progress === null ? 'Uploading…' : `Uploading… ${Math.round(u.progress * 100)}%`
  }

  return (
    <li className="flex items-center gap-3 py-3">
      {u.preview ? (
        <img src={u.preview} alt="" className="size-12 shrink-0 rounded-control object-cover" />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-surface-muted text-muted">
          <ImagePlus aria-hidden="true" className="size-5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="truncate font-medium">{u.file.name}</span>
          <span className="shrink-0 text-xs text-muted">{formatFileSize(u.file.size)}</span>
        </p>
        {failed ? (
          <div role="alert" className="text-sm text-danger">
            <p>{u.problem}</p>
            {u.requestId && (
              <p className="mt-1 text-xs text-muted">
                Reference: <code className="font-mono select-all">{u.requestId}</code>
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted">
            {u.status === 'uploading' && !processing ? (
              <progress
                value={u.progress ?? undefined}
                max={1}
                aria-label={`Uploading ${u.file.name}`}
                className="h-1.5 w-full max-w-48 appearance-none overflow-hidden rounded-full bg-surface-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-muted [&::-webkit-progress-value]:bg-primary"
              />
            ) : (
              (u.status === 'checking' || processing) && (
                <Spinner label={null} className="size-3.5" />
              )
            )}
            <span className="shrink-0">{status}</span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {u.status === 'failed' && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RotateCcw aria-hidden="true" className="size-4" />
            Retry
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${failed ? 'Dismiss' : 'Cancel'} ${u.file.name}`}
          onClick={onCancel}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </li>
  )
}

function RemovePhotoDialog({
  item,
  photo,
  onClose,
}: {
  item: Item
  photo: { url: string; index: number }
  onClose: () => void
}) {
  const { toast } = useToast()
  const remove = useRemoveImage(item.id)
  const thumbnail = item.thumbnailUrls[photo.index] ?? photo.url
  const newCover = photo.index === 0 && item.imageUrls.length > 1

  async function confirm() {
    try {
      await remove.mutateAsync(photo.url)
      toast({ tone: 'success', title: 'Photo removed' })
      onClose()
    } catch {
      // Shown in the dialog.
    }
  }

  return (
    <Dialog
      open
      onClose={() => !remove.isPending && onClose()}
      title="Remove this photo?"
      description={
        newCover
          ? 'Guests will see the next photo as the cover instead. This can’t be undone.'
          : 'Guests stop seeing it. This can’t be undone.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={remove.isPending}>
            Remove
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <img
          src={apiUrl(thumbnail)}
          alt=""
          className="size-32 self-center rounded-control bg-surface-muted object-cover"
        />
        {remove.error && (
          <div role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm">
            <p>{remove.error.message}</p>
            {isApiError(remove.error) && remove.error.requestId && (
              <p className="mt-2 text-xs text-muted">
                Reference: <code className="font-mono select-all">{remove.error.requestId}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
