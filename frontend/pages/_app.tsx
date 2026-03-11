import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../components/Layout'
import { ThemeProvider } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { Toaster } from 'react-hot-toast'

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
      <Head>
        <title>NextStop</title>
      </Head>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--color-bg-card)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
          },
          success: {
            iconTheme: { primary: 'var(--color-status-success)', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: 'var(--color-status-error)', secondary: '#fff' },
          },
        }}
      />
      <Layout>
        {loading ? (
          <LoadingSpinner fullPage text="Loading page..." />
        ) : (
          <div className="page-fade-in" key={router.asPath}>
            <Component {...pageProps} />
          </div>
        )}
      </Layout>
    </ThemeProvider>
  )
}
