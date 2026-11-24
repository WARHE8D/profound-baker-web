import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { isApiError } from '@/api'
import { Button, Field, Input, RouteFocus, Spinner } from '@/components'
import { useNow } from '@/lib/use-now'
import { safeNext } from './redirect'
import { session, type SessionEnd } from './session'
import { useSession } from './use-session'

type Problem = { message: string; requestId: string | null }
type FieldErrors = { email?: string; password?: string }

const endedMessage: Record<SessionEnd, string> = {
  expired: 'Your session has ended. Please sign in again.',
  signedOut: 'You have signed out.',
}

/** `/owner/login`: email and password; afterwards, back to the page the Owner was opening. */
export function LoginPage() {
  const state = useSession()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const ended = (useLocation().state as { ended?: SessionEnd | null } | null)?.ended ?? null
  const [restoreFailed, setRestoreFailed] = useState(false)

  // A session stored by this or another tab: use it instead of asking for the password again.
  useEffect(() => {
    if (state.status === 'unknown') session.restore().catch(() => setRestoreFailed(true))
  }, [state.status])

  if (state.status === 'signedIn') return <Navigate to={next} replace />

  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10 outline-none"
    >
      <RouteFocus />
      <Link to="/" className="font-display text-3xl font-semibold text-primary">
        SugarCrumbs
      </Link>
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
        {state.status === 'unknown' && !restoreFailed ? (
          <div className="flex justify-center py-8">
            <Spinner label="Checking your session…" />
          </div>
        ) : (
          <LoginForm next={next} notice={ended ? endedMessage[ended] : null} />
        )}
      </div>
      <Link
        to="/"
        className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
      >
        ← Back to the shop
      </Link>
    </main>
  )
}

function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [problem, setProblem] = useState<Problem | null>(null)
  const [sending, setSending] = useState(false)
  const [rateLimit, setRateLimit] = useState<{ until: number; seconds: number } | null>(null)
  const now = useNow(1000)
  // `now` can be up to a second old, so cap at the server's wait rather than show one more second.
  const waitSeconds = rateLimit
    ? Math.min(rateLimit.seconds, Math.max(0, Math.ceil((rateLimit.until - now) / 1000)))
    : 0
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending || waitSeconds > 0) return
    setProblem(null)

    const errors: FieldErrors = {}
    if (!email.trim()) errors.email = 'Enter your email address'
    if (!password) errors.password = 'Enter your password'
    setFieldErrors(errors)
    if (errors.email) return emailRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()

    setSending(true)
    try {
      await session.login(email.trim(), password)
      await navigate(next, { replace: true })
    } catch (error) {
      setPassword('')
      if (!isApiError(error)) {
        setProblem({ message: 'Something went wrong. Please try again.', requestId: null })
      } else if (error.status === 401) {
        setProblem({ message: "That email and password don't match.", requestId: null })
        passwordRef.current?.focus()
      } else if (error.status === 429) {
        const seconds = error.retryAfterSeconds ?? 60
        setRateLimit({ until: Date.now() + seconds * 1000, seconds })
        setProblem({
          message: `Too many sign-in attempts. Please wait ${seconds} seconds, then try again.`,
          requestId: error.requestId,
        })
      } else if (error.status === 400 && error.fieldErrors.length > 0) {
        setFieldErrors({
          email: error.fieldError('email') && `Email ${error.fieldError('email')}`,
          password: error.fieldError('password') && `Password ${error.fieldError('password')}`,
        })
      } else {
        setProblem({ message: error.message, requestId: error.requestId })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Owner sign in</h1>
        <p className="text-sm text-muted">Manage orders, items and opening hours.</p>
      </div>

      {notice && !problem && (
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

      <Field label="Email" error={fieldErrors.email} required>
        <Input
          ref={emailRef}
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Password" error={fieldErrors.password} required>
        <Input
          ref={passwordRef}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Button type="submit" size="lg" loading={sending} disabled={waitSeconds > 0}>
        {sending ? 'Signing in…' : waitSeconds > 0 ? `Try again in ${waitSeconds} s` : 'Sign in'}
      </Button>
    </form>
  )
}
