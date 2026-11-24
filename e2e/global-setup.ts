import { seedBakery } from './support/api'

/** Once per run, before any test: the backend is up and the bakery can take orders. */
export default async function globalSetup() {
  await seedBakery()
}
