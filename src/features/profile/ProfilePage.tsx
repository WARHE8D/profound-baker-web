import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useLocation } from 'react-router'
import { isApiError } from '@/api'
import { Button, ErrorState, Field, Input, Select, Spinner, useToast } from '@/components'
import { session } from '@/features/auth/session'
import { formatLocal, timeZoneGroups } from '@/lib/time'
import { useNow } from '@/lib/use-now'
import { dismissPasswordReminder } from './password-reminder'
import {
  PASSWORD_MAX,
  passwordFormSchema,
  profileFieldErrors,
  profileFormSchema,
  toProfileForm,
  toProfileRequest,
  type PasswordFormValues,
  type ProfileField,
  type ProfileFormInput,
  type ProfileFormValues,
} from './profile-form'
import { profileQuery, useChangePassword, useUpdateProfile, type OwnerProfile } from './queries'

type Problem = { message: string; requestId: string | null }

/** `/owner/profile`: the bakery's details and time zone, and the Owner's password. */
export function ProfilePage() {
  const profile = useQuery(profileQuery())

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold">Profile</h1>
      {profile.data ? (
        <>
          {/* Keyed by the saved profile: after a save the form starts from what the server kept. */}
          <ProfileForm key={JSON.stringify(profile.data)} profile={profile.data} />
          <PasswordForm profile={profile.data} />
        </>
      ) : profile.isError ? (
        <ErrorState
          error={profile.error}
          title="We couldn't load your profile"
          onRetry={() => void profile.refetch()}
          retrying={profile.isFetching}
        />
      ) : (
        <div className="flex justify-center py-12">
          <Spinner label="Loading your profile" />
        </div>
      )}
    </div>
  )
}

function ProfileForm({ profile }: { profile: OwnerProfile }) {
  const { toast } = useToast()
  const update = useUpdateProfile()
  const [problem, setProblem] = useState<Problem | null>(null)
  const form = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: toProfileForm(profile),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { register, handleSubmit, setError, setValue, formState } = form
  const { errors, isDirty } = formState
  const timeZone = useWatch({ control: form.control, name: 'timeZone' })
  const zoneChanged = timeZone !== profile.timeZone

  async function submit(values: ProfileFormValues) {
    setProblem(null)
    try {
      await update.mutateAsync(toProfileRequest(values))
      toast({
        tone: 'success',
        title: 'Profile saved',
        description: zoneChanged ? `Times now show in ${values.timeZone}.` : undefined,
      })
    } catch (error) {
      if (!isApiError(error)) {
        setProblem({ message: 'Something went wrong. Please try again.', requestId: null })
        return
      }
      const fields = profileFieldErrors(error)
      const entries = Object.entries(fields) as [ProfileField, string][]
      entries.forEach(([field, message], index) =>
        setError(field, { type: 'server', message }, { shouldFocus: index === 0 }),
      )
      if (entries.length === 0) setProblem({ message: error.message, requestId: error.requestId })
    }
  }

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="profile-heading" className="text-xl font-semibold">
          Bakery details
        </h2>
        <p className="text-sm text-muted">
          Guests see the name, phone and address on the storefront and their order page.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
        className="flex flex-col gap-5 rounded-card border border-border bg-surface p-5 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bakery name" required error={errors.businessName?.message}>
            <Input autoComplete="organization" maxLength={150} {...register('businessName')} />
          </Field>
          <Field label="Your name" required error={errors.ownerName?.message}>
            <Input autoComplete="name" maxLength={150} {...register('ownerName')} />
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            <Input type="tel" autoComplete="tel" maxLength={30} {...register('phone')} />
          </Field>
          <Field
            label="Logo URL"
            hint="A link to an image of your logo."
            error={errors.logoUrl?.message}
          >
            <Input type="url" inputMode="url" maxLength={300} {...register('logoUrl')} />
          </Field>
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">Pickup address</legend>
          <Field label="Street" error={errors.street?.message} className="sm:col-span-2">
            <Input autoComplete="address-line1" maxLength={200} {...register('street')} />
          </Field>
          <Field label="City" error={errors.city?.message}>
            <Input autoComplete="address-level2" maxLength={100} {...register('city')} />
          </Field>
          <Field label="State or region" error={errors.region?.message}>
            <Input autoComplete="address-level1" maxLength={100} {...register('region')} />
          </Field>
          <Field label="Postal code" error={errors.postalCode?.message}>
            <Input autoComplete="postal-code" maxLength={20} {...register('postalCode')} />
          </Field>
          <Field label="Country" error={errors.country?.message}>
            <Input autoComplete="country-name" maxLength={100} {...register('country')} />
          </Field>
        </fieldset>

        <TimeZoneField
          saved={profile.timeZone}
          value={timeZone}
          error={errors.timeZone?.message}
          register={register('timeZone')}
          onUseDevice={(zone) =>
            setValue('timeZone', zone, { shouldDirty: true, shouldValidate: true })
          }
        />

        {problem && <ProblemBox problem={problem} />}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button type="submit" loading={update.isPending} disabled={!isDirty}>
            Save changes
          </Button>
          {isDirty && (
            <Button
              variant="ghost"
              onClick={() => {
                form.reset()
                setProblem(null)
              }}
              disabled={update.isPending}
            >
              Discard
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}

type TimeZoneFieldProps = {
  saved: string
  value: string
  error: string | undefined
  register: ReturnType<ReturnType<typeof useForm<ProfileFormInput>>['register']>
  onUseDevice: (zone: string) => void
}

function TimeZoneField({ saved, value, error, register, onUseDevice }: TimeZoneFieldProps) {
  const now = useNow(60_000)
  // Offsets depend on the date (daylight saving), so the list is rebuilt once a minute at most.
  const groups = useMemo(() => timeZoneGroups(new Date(now), [saved]), [now, saved])
  const device = deviceTimeZone()
  const localTime = value ? formatLocal(new Date(now), value, 'time') : null

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Time zone"
        required
        hint={
          localTime
            ? `Working hours, pickup slots and every time in the app use this zone. It's ${localTime} there now.`
            : undefined
        }
        error={error}
      >
        <Select {...register}>
          {groups.map((group) => (
            <optgroup key={group.region} label={group.region}>
              {group.zones.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>
      {device && device !== value && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => onUseDevice(device)}
        >
          Use this device’s zone ({device.replaceAll('_', ' ')})
        </Button>
      )}
      {value !== saved && (
        <p className="flex gap-2 rounded-control border border-warning/50 bg-warning/10 p-3 text-sm">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Changing the time zone moves your working hours and pickup slots to the same clock times
            in the new zone. Orders already placed keep their pickup moment, so their times will
            read differently.
          </span>
        </p>
      )}
    </div>
  )
}

function PasswordForm({ profile }: { profile: OwnerProfile }) {
  const { toast } = useToast()
  const change = useChangePassword()
  const [problem, setProblem] = useState<Problem | null>(null)
  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { register, handleSubmit, setError, reset, formState } = form
  const { errors } = formState
  const [signingIn, setSigningIn] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const { hash } = useLocation()

  // Arriving from the password reminder (/owner/profile#password): this section renders only after
  // the profile loads, too late for the router's own scroll to the hash, so do it here.
  useEffect(() => {
    if (hash !== '#password') return
    sectionRef.current?.scrollIntoView({ block: 'start' })
    form.setFocus('currentPassword')
  }, [hash, form])

  async function submit(values: PasswordFormValues) {
    setProblem(null)
    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
    } catch (error) {
      if (!isApiError(error)) {
        setProblem({ message: 'Something went wrong. Please try again.', requestId: null })
      } else if (/current password is incorrect/i.test(error.message)) {
        setError(
          'currentPassword',
          { type: 'server', message: 'That isn’t your current password' },
          { shouldFocus: true },
        )
      } else if (/must differ/i.test(error.message)) {
        setError(
          'newPassword',
          { type: 'server', message: 'Choose a password different from the current one' },
          { shouldFocus: true },
        )
      } else if (error.fieldError('newPassword')) {
        setError(
          'newPassword',
          { type: 'server', message: `Password ${error.fieldError('newPassword')}` },
          { shouldFocus: true },
        )
      } else {
        setProblem({ message: error.message, requestId: error.requestId })
      }
      return
    }

    dismissPasswordReminder(profile.id)
    reset()
    // The server has revoked every session, this one included: sign straight back in.
    setSigningIn(true)
    try {
      await session.login(profile.email, values.newPassword)
      toast({
        tone: 'success',
        title: 'Password changed',
        description: 'Other devices have been signed out.',
      })
    } catch {
      toast({
        tone: 'success',
        title: 'Password changed',
        description: 'Please sign in with your new password.',
      })
      await session.logout()
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby="password-heading"
      id="password"
      className="flex scroll-mt-6 flex-col gap-5"
    >
      <div>
        <h2 id="password-heading" className="text-xl font-semibold">
          Password
        </h2>
        <p className="text-sm text-muted">
          Changing it signs you out on every other device. You stay signed in here.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(submit)(event)}
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 sm:max-w-md sm:p-6"
      >
        {/* Lets password managers file the new password under the right account. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={profile.email}
          readOnly
          hidden
        />
        <Field label="Current password" required error={errors.currentPassword?.message}>
          <Input
            type="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            {...register('currentPassword')}
          />
        </Field>
        <Field
          label="New password"
          required
          hint="At least 12 characters. A few unrelated words make a strong one."
          error={errors.newPassword?.message}
        >
          <Input
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            {...register('newPassword')}
          />
        </Field>
        <Field label="Confirm new password" required error={errors.confirmPassword?.message}>
          <Input
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            {...register('confirmPassword')}
          />
        </Field>

        {problem && <ProblemBox problem={problem} />}

        <Button type="submit" className="self-start" loading={change.isPending || signingIn}>
          Change password
        </Button>
      </form>
    </section>
  )
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

/** This device's IANA zone, e.g. "Europe/London". */
function deviceTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone
}
