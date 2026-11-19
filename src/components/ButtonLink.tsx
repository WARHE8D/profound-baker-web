import { Link, type LinkProps } from 'react-router'
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-styles'

type ButtonLinkProps = LinkProps & { variant?: ButtonVariant; size?: ButtonSize }

/** A router link that looks like a Button: for actions that navigate ("Checkout", "Back"). */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />
}
