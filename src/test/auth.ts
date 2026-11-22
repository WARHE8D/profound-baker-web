import { session } from '@/features/auth/session'
import { FIXTURE_OWNER_CREDENTIALS } from '@/mocks/fixtures'

/** Signs the Owner in through the mock API, as the login page would. */
export async function signInAsOwner(): Promise<void> {
  await session.login(FIXTURE_OWNER_CREDENTIALS.email, FIXTURE_OWNER_CREDENTIALS.password)
}
