import {
  CalendarClock,
  ClipboardList,
  Croissant,
  LayoutDashboard,
  Receipt,
  Tags,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

export type OwnerNavItem = {
  /** Path under /owner; '' is the dashboard. */
  path: string
  label: string
  icon: LucideIcon
  /** Sprint that builds the page; shown on its placeholder until then. */
  sprint: number
}

export const ownerNav: OwnerNavItem[] = [
  { path: '', label: 'Dashboard', icon: LayoutDashboard, sprint: 7 },
  { path: 'orders', label: 'Orders', icon: ClipboardList, sprint: 6 },
  { path: 'items', label: 'Items', icon: Croissant, sprint: 5 },
  { path: 'categories', label: 'Categories', icon: Tags, sprint: 5 },
  { path: 'availability', label: 'Availability', icon: CalendarClock, sprint: 5 },
  { path: 'invoices', label: 'Invoices', icon: Receipt, sprint: 7 },
  { path: 'profile', label: 'Profile', icon: UserRound, sprint: 4 },
]
