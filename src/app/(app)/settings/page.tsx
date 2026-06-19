/**
 * Settings (ARCHITECTURE §3.2, FR-41). The full account + preferences screen
 * lands in a later pipeline slice; theme switching is already available from the
 * top bar and the account menu. Placeholder keeps the Settings nav item live.
 */
import { Settings as SettingsIcon } from 'lucide-react'
import { ComingSoon } from '@/components/app/coming-soon'

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      description="Account details and preferences arrive in an upcoming slice. You can switch theme from the top bar or your account menu now."
      icon={SettingsIcon}
    />
  )
}
