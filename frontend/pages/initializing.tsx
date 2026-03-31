import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

const INIT_STEPS = [
  { label: 'Initializing system...', duration: 2000 },
  { label: 'Setting up infrastructure...', duration: 2500 },
  { label: 'Configuring fuel islands...', duration: 2000 },
  { label: 'Preparing station defaults...', duration: 2500 },
  { label: 'Loading operational modules...', duration: 2000 },
  { label: 'Verifying system integrity...', duration: 2000 },
  { label: 'Almost ready...', duration: 2000 },
]

const TOTAL_DURATION = INIT_STEPS.reduce((s, step) => s + step.duration, 0)

export default function InitializingPage() {
  const router = useRouter()
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    const parsed = JSON.parse(userData)
    if (parsed.role !== 'owner') {
      router.push('/')
      return
    }

    // Animate progress
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const pct = Math.min((elapsed / TOTAL_DURATION) * 100, 100)
      setProgress(pct)

      // Determine current step
      let accumulated = 0
      for (let i = 0; i < INIT_STEPS.length; i++) {
        accumulated += INIT_STEPS[i].duration
        if (elapsed < accumulated) {
          setCurrentStep(i)
          break
        }
      }

      if (elapsed >= TOTAL_DURATION) {
        clearInterval(interval)
        setDone(true)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (done) {
      const timer = setTimeout(() => router.push('/setup'), 500)
      return () => clearTimeout(timer)
    }
  }, [done, router])

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
                <svg className="w-10 h-10 text-action-primary animate-spin" style={{ animationDuration: '3s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <div>
              <h1 className="text-xl font-bold text-content-primary">
                {done ? 'System Ready' : 'Setting Up Your Station'}
              </h1>
              <p className="text-sm text-content-secondary mt-2">
                {done ? 'Launching setup wizard...' : 'Please wait while we prepare everything for you'}
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
                      ? 'var(--color-status-success)'
                      : 'linear-gradient(90deg, var(--color-action-primary), var(--color-action-primary-hover))',
                  }}
                />
              </div>

              {/* Step label */}
              <div className="flex items-center justify-center gap-2">
                {!done && (
                  <div className="w-1.5 h-1.5 bg-action-primary rounded-full animate-pulse" />
                )}
                <p className="text-xs text-content-secondary">
                  {done ? 'Initialization complete' : INIT_STEPS[currentStep]?.label}
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
      </div>
    </div>
  )
}
