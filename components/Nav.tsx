'use client'

import TopNav from './TopNav'

// Universal nav — wraps TopNav for backward compatibility
// All pages use <Nav active="..."> but TopNav ignores the active prop
export default function Nav({ active }: { active?: string; transparent?: boolean }) {
  return <TopNav />
}
