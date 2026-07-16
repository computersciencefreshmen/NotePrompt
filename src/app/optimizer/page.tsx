import { notFound } from 'next/navigation'
import PromptOptimizerV2 from '@/components/PromptOptimizerV2'
import { featureFlags } from '@/config/features'

export default function OptimizerPage() {
  if (!featureFlags.promptOptimizerV2) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <PromptOptimizerV2 />
    </div>
  )
}
