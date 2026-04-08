import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'

const INIT_STEPS = [
  { label: 'Initializing system...', reverseLabel: 'Shutting down system...' },
  { label: 'Setting up infrastructure...', reverseLabel: 'Clearing infrastructure...' },
  { label: 'Configuring fuel islands...', reverseLabel: 'Removing configuration...' },
  { label: 'Preparing station defaults...', reverseLabel: 'Resetting defaults...' },
  { label: 'Loading operational modules...', reverseLabel: 'Unloading modules...' },
  { label: 'Verifying system integrity...', reverseLabel: 'Cleaning up...' },
  { label: 'Almost ready...', reverseLabel: 'Logging out...' },
]

const FORWARD_DURATION = 15000
const REVERSE_DURATION = 5000

export default function InitializingPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [done, setDone] = useState(false)
  const [reversing, setReversing] = useState(false)

  const isReverse = router.query.direction === 'reverse'

  const doLogout = useCallback(() => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
    localStorage.removeItem('stationId')
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
    document.cookie = `user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
    document.cookie = `needsSetup=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
    router.replace('/login')
  }, [router])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData && !isReverse) {
      router.push('/login')
      return
    }

    if (!isReverse) {
      const parsed = JSON.parse(userData!)
      if (parsed.role !== 'owner') {
        router.push('/')
        return
      }
    }

    const duration = isReverse ? REVERSE_DURATION : FORWARD_DURATION
    const stepDuration = duration / INIT_STEPS.length
    const startTime = Date.now()

    if (isReverse) {
      setReversing(true)
      setProgress(100)
      setCurrentStep(INIT_STEPS.length - 1)
    } else {
      // Intercept browser back during forward initialization
      const handlePopState = () => {
        router.replace('/initializing?direction=reverse')
      }
      window.history.pushState(null, '', window.location.href)
      window.addEventListener('popstate', handlePopState)
      // Cleanup handled by the interval's return
      const cleanup = () => window.removeEventListener('popstate', handlePopState)
      ;(window as any).__initCleanup = cleanup
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime

      if (isReverse) {
        const pct = Math.max(100 - (elapsed / duration) * 100, 0)
        setProgress(pct)

        // Step index counts down
        const stepsRemaining = Math.floor(pct / (100 / INIT_STEPS.length))
        setCurrentStep(Math.min(stepsRemaining, INIT_STEPS.length - 1))

        if (elapsed >= duration) {
          clearInterval(interval)
          setDone(true)
        }
      } else {
        const pct = Math.min((elapsed / duration) * 100, 100)
        setProgress(pct)

        let accumulated = 0
        for (let i = 0; i < INIT_STEPS.length; i++) {
          accumulated += stepDuration
          if (elapsed < accumulated) {
            setCurrentStep(i)
            break
          }
        }

        if (elapsed >= duration) {
          clearInterval(interval)
          setDone(true)
        }
      }
    }, 50)

    return () => {
      clearInterval(interval)
      if ((window as any).__initCleanup) {
        ;(window as any).__initCleanup()
        delete (window as any).__initCleanup
      }
    }
  }, [isReverse])

  useEffect(() => {
    if (!done) return
    if (isReverse) {
      const timer = setTimeout(doLogout, 300)
      return () => clearTimeout(timer)
    } else {
      const timer = setTimeout(() => router.push('/setup'), 500)
      return () => clearTimeout(timer)
    }
  }, [done, isReverse, router, doLogout])

  const stepLabel = isReverse
    ? INIT_STEPS[currentStep]?.reverseLabel
    : INIT_STEPS[currentStep]?.label

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D7A] via-[#0F2847] to-[#0A1B30]" />
      <div className="absolute top-[20%] left-[15%] w-64 h-64 bg-action-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-[20%] right-[10%] w-80 h-80 bg-action-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />

      <div className="max-w-md w-full relative z-10">
        <div className="glass-card-static p-10 border border-white/10 relative overflow-hidden">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-action-primary via-action-primary-hover to-status-success" />

          <div className="text-center space-y-8">
            {/* Animated icon */}
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 bg-action-primary/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
              <div className="relative w-20 h-20 bg-action-primary/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-action-primary"
                  style={{
                    animationDuration: '3s',
                    animationName: 'spin',
                    animationTimingFunction: 'linear',
                    animationIterationCount: 'infinite',
                    animationDirection: reversing ? 'reverse' : 'normal',
                  }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <div>
              <h1 className="text-xl font-bold text-content-primary">
                {done
                  ? (reversing ? 'Session Ended' : 'System Ready')
                  : (reversing ? 'Closing Session' : 'Setting Up Your Station')}
              </h1>
              <p className="text-sm text-content-secondary mt-2">
                {done
                  ? (reversing ? 'Redirecting to login...' : 'Launching setup wizard...')
                  : (reversing ? 'Reverting changes...' : 'Please wait while we prepare everything for you')}
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-3">
              <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: done
                      ? (reversing ? 'var(--color-status-warning)' : 'var(--color-status-success)')
                      : (reversing
                        ? 'linear-gradient(90deg, var(--color-status-warning), var(--color-status-error))'
                        : 'linear-gradient(90deg, var(--color-action-primary), var(--color-action-primary-hover))'),
                  }}
                />
              </div>

              {/* Step label */}
              <div className="flex items-center justify-center gap-2">
                {!done && (
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${reversing ? 'bg-status-warning' : 'bg-action-primary'}`} />
                )}
                <p className="text-xs text-content-secondary">
                  {done ? (reversing ? 'Session closed' : 'Initialization complete') : stepLabel}
                </p>
              </div>

              {/* Percentage */}
              <p className="text-lg font-mono font-bold text-content-primary">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          Powered by NextStop Fuel Management v1.0
        </p>
        <p className="mt-1 text-center text-[10px] text-white/10">
          Developed by Hetch Solutions
        </p>
      </div>
    </div>
  )
}
