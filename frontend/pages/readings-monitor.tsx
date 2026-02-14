import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function ReadingsMonitor() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/tank-readings-report?tab=validated')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-content-secondary">Redirecting to Tank Readings & Monitor...</p>
    </div>
  )
}
