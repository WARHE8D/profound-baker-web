import { ButtonLink } from '@/components'
import { CartContents } from './CartContents'
import { CheckoutLink } from './CheckoutLink'

/** `/cart`: the full-page cart. */
export function CartPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold sm:text-4xl">Your cart</h1>
      <CartContents
        renderActions={(cart) => (
          <>
            <CheckoutLink cart={cart} />
            <ButtonLink to="/" variant="secondary" size="lg" className="w-full sm:w-auto">
              Continue shopping
            </ButtonLink>
          </>
        )}
      />
    </div>
  )
}
