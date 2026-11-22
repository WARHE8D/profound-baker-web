import { z } from 'zod'
import type { ApiError, Schema } from '@/api'
import type { OwnerProfile } from './queries'

const optional = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`)

/** The profile, with the server's limits (OwnerProfileRequest, AddressDto). */
export const profileFormSchema = z.object({
  businessName: optional(150).min(1, 'Enter the bakery’s name'),
  ownerName: optional(150).min(1, 'Enter your name'),
  phone: optional(30),
  logoUrl: optional(300).refine((value) => value === '' || /^https?:\/\/\S+$/i.test(value), {
    message: 'Enter a full web address starting with https://',
  }),
  timeZone: z.string().min(1, 'Choose a time zone'),
  street: optional(200),
  city: optional(100),
  region: optional(100),
  postalCode: optional(20),
  country: optional(100),
})

export type ProfileFormInput = z.input<typeof profileFormSchema>
export type ProfileFormValues = z.output<typeof profileFormSchema>
export type ProfileField = keyof ProfileFormValues

export function toProfileForm(profile: OwnerProfile): ProfileFormInput {
  return {
    businessName: profile.businessName,
    ownerName: profile.ownerName,
    phone: profile.phone ?? '',
    logoUrl: profile.logoUrl ?? '',
    timeZone: profile.timeZone,
    street: profile.address?.street ?? '',
    city: profile.address?.city ?? '',
    region: profile.address?.region ?? '',
    postalCode: profile.address?.postalCode ?? '',
    country: profile.address?.country ?? '',
  }
}

/** The PUT body. Empty optional fields are left out, which clears them on the server. */
const orUndefined = (value: string) => value || undefined

export function toProfileRequest(values: ProfileFormValues): Schema<'OwnerProfileRequest'> {
  const address = {
    street: orUndefined(values.street),
    city: orUndefined(values.city),
    region: orUndefined(values.region),
    postalCode: orUndefined(values.postalCode),
    country: orUndefined(values.country),
  }
  return {
    businessName: values.businessName,
    ownerName: values.ownerName,
    phone: orUndefined(values.phone),
    logoUrl: orUndefined(values.logoUrl),
    timeZone: values.timeZone,
    address: Object.values(address).some(Boolean) ? address : undefined,
  }
}

const SERVER_FIELDS: Record<string, ProfileField> = {
  businessName: 'businessName',
  ownerName: 'ownerName',
  phone: 'phone',
  logoUrl: 'logoUrl',
  timeZone: 'timeZone',
  'address.street': 'street',
  'address.city': 'city',
  'address.region': 'region',
  'address.postalCode': 'postalCode',
  'address.country': 'country',
}

/**
 * The server's errors, by form field. A 400 without fields that names the time zone (the backend
 * rejects unknown and fixed-offset zones that way) goes on the time-zone picker.
 */
export function profileFieldErrors(error: ApiError): Partial<Record<ProfileField, string>> {
  const fields: Partial<Record<ProfileField, string>> = {}
  for (const { field, message } of error.fieldErrors) {
    const formField = SERVER_FIELDS[field]
    if (formField) fields[formField] ??= capitalize(message)
  }
  if (error.fieldErrors.length === 0 && /timeZone/.test(error.message)) {
    fields.timeZone = 'The server doesn’t accept this time zone. Choose a city in the same zone.'
  }
  return fields
}

/** New password rules, from the server: 12 to 128 characters, different from the current one. */
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
      .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.confirmPassword === v.newPassword, {
    path: ['confirmPassword'],
    message: 'The passwords don’t match',
  })
  .refine((v) => !v.currentPassword || v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  })

export type PasswordFormValues = z.infer<typeof passwordFormSchema>

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
