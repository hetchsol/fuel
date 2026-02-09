import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { ThemeProvider } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handleStart = (url: string) => {
      if (url !== router.asPath) setLoading(true)
    }
    const handleComplete = () => setLoading(false)

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleComplete)
    router.events.on('routeChangeError', handleComplete)

    return () => {
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleComplete)
      router.events.off('routeChangeError', handleComplete)
    }
  }, [router])

  return (
    <ThemeProvider>
      <Layout>
        {loading ? (
          <LoadingSpinner fullPage text="Loading page..." />
        ) : (
          <Component {...pageProps} />
        )}
      </Layout>
    </ThemeProvider>
  )
}
