import { useState, type ReactNode } from 'react'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  useToast,
} from '@/components'

/**
 * Development-only gallery of the UI primitives (S0.3). Rendered by App in dev builds;
 * moves to a /dev/ui route when routing lands (S0.4).
 */
export function UiPreview() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  return (
    <section aria-labelledby="ui-preview" className="flex flex-col gap-8">
      <h2 id="ui-preview" className="text-2xl font-semibold">
        UI primitives
      </h2>

      <Group title="Buttons">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button disabled>Disabled</Button>
        <Button
          loading={loading}
          onClick={() => {
            setLoading(true)
            setTimeout(() => setLoading(false), 1500)
          }}
        >
          {loading ? 'Saving…' : 'Click to load'}
        </Button>
      </Group>

      <Group title="Badges">
        <Badge>Draft</Badge>
        <Badge tone="primary">New</Badge>
        <Badge tone="success">Fulfilled</Badge>
        <Badge tone="warning">Pending</Badge>
        <Badge tone="danger">Rejected</Badge>
        <Spinner />
      </Group>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required hint="As it should appear on the order.">
          <Input placeholder="Jane Baker" autoComplete="name" />
        </Field>
        <Field label="Email" required error="Enter a valid email address.">
          <Input type="email" defaultValue="jane@" autoComplete="email" />
        </Field>
        <Field label="Category">
          <Select defaultValue="bread">
            <option value="bread">Bread</option>
            <option value="cakes">Cakes</option>
            <option value="pastries">Pastries</option>
          </Select>
        </Field>
        <Field label="Disabled">
          <Input disabled defaultValue="Can't touch this" />
        </Field>
        <Field label="Notes" hint="Allergies, writing on the cake, …" className="sm:col-span-2">
          <Textarea />
        </Field>
      </div>

      <Group title="Dialog and toasts">
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          Open dialog
        </Button>
        <Button variant="secondary" onClick={() => toast({ title: 'Item saved', tone: 'success' })}>
          Success toast
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast({
              title: 'Could not save the item',
              description: 'Request id: 3f9c2a1b',
              tone: 'error',
            })
          }
        >
          Error toast
        </Button>
      </Group>

      <EmptyState
        icon="🥐"
        title="No items yet"
        description="Add your first bake so customers can order it."
        action={<Button>Add item</Button>}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Reject order SC-7F3K2?"
        description="The customer sees the reason on their order page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>
              Reject order
            </Button>
          </>
        }
      >
        <Field label="Reason" required>
          <Textarea placeholder="We're fully booked that morning." />
        </Field>
      </Dialog>
    </section>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
