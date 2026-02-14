import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function DailySalesReport() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/reports')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-content-secondary">Redirecting to Sales Reports...</p>
    </div>
  )
}
