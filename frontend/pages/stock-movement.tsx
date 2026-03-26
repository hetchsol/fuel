import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function StockMovementRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/fuel-operations') }, [])
  return <div className="p-8 text-center text-content-secondary">Redirecting to Fuel Operations...</div>
}
