import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Layout from '../components/Layout'
import { ThemeProvider } from '../contexts/ThemeContext'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ThemeProvider>
  )
}
