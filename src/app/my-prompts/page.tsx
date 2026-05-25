import { redirect } from 'next/navigation'
import { withLocaleHref } from '@/lib/i18n'

interface MyPromptsRedirectPageProps {
  searchParams?: Promise<{
    lang?: string
  }>
}

export default async function MyPromptsRedirectPage({ searchParams }: MyPromptsRedirectPageProps) {
  const params = await searchParams
  redirect(withLocaleHref('/prompts', params?.lang === 'en' ? 'en' : 'zh'))
}
