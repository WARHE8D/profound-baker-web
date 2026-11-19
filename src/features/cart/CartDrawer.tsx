import { ButtonLink, Dialog } from '@/components'
import { CartContents } from './CartContents'
import { useCartCount } from './cart-store'
import { CheckoutLink } from './CheckoutLink'

type CartDrawerProps = { open: boolean; onClose: () => void }

/** The cart as a panel sliding in from the right, opened from the header's cart button. */
export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const count = useCartCount()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your cart"
      description={count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : undefined}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md rounded-none border-y-0 border-r-0"
    >
      {/* Only mounted while open, so the catalogue re-check runs when the guest looks. */}
      {open && (
        <CartContents
          onNavigate={onClose}
          renderActions={(cart) => (
            <>
              <CheckoutLink cart={cart} onNavigate={onClose} />
              <ButtonLink
                to="/cart"
                variant="secondary"
                size="lg"
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                View cart
              </ButtonLink>
            </>
          )}
        />
      )}
    </Dialog>
  )
}
