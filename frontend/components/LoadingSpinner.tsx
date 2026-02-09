import { useEffect, useState } from 'react'

interface LoadingSpinnerProps {
  text?: string
  fullPage?: boolean
}

export default function LoadingSpinner({ text = 'Loading...', fullPage = false }: LoadingSpinnerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const spinner = (
    <div className={`flex flex-col items-center justify-center ${fullPage ? 'min-h-[60vh]' : 'py-12'}`}>
      <div className="perspective-container">
        <div className={`cube ${mounted ? 'cube-animate' : ''}`}>
          <div className="cube-face cube-front" />
          <div className="cube-face cube-back" />
          <div className="cube-face cube-right" />
          <div className="cube-face cube-left" />
          <div className="cube-face cube-top" />
          <div className="cube-face cube-bottom" />
        </div>
      </div>
      <p className="mt-6 text-sm font-medium text-gray-500 animate-pulse">{text}</p>

      <style jsx>{`
        .perspective-container {
          perspective: 200px;
          width: 48px;
          height: 48px;
        }

        .cube {
          width: 48px;
          height: 48px;
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(-25deg) rotateY(30deg);
        }

        .cube-animate {
          animation: cubeRotate 2s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite;
        }

        .cube-face {
          position: absolute;
          width: 48px;
          height: 48px;
          border-radius: 6px;
          border: 2px solid rgba(99, 102, 241, 0.3);
        }

        .cube-front {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.7), rgba(99, 102, 241, 0.5));
          transform: translateZ(24px);
        }

        .cube-back {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(99, 102, 241, 0.3));
          transform: rotateY(180deg) translateZ(24px);
        }

        .cube-right {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.7), rgba(5, 150, 105, 0.5));
          transform: rotateY(90deg) translateZ(24px);
        }

        .cube-left {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.4), rgba(5, 150, 105, 0.3));
          transform: rotateY(-90deg) translateZ(24px);
        }

        .cube-top {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.6), rgba(16, 185, 129, 0.6));
          transform: rotateX(90deg) translateZ(24px);
        }

        .cube-bottom {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(5, 150, 105, 0.3));
          transform: rotateX(-90deg) translateZ(24px);
        }

        @keyframes cubeRotate {
          0% {
            transform: rotateX(-25deg) rotateY(0deg);
          }
          25% {
            transform: rotateX(25deg) rotateY(90deg);
          }
          50% {
            transform: rotateX(-25deg) rotateY(180deg);
          }
          75% {
            transform: rotateX(25deg) rotateY(270deg);
          }
          100% {
            transform: rotateX(-25deg) rotateY(360deg);
          }
        }
      `}</style>
    </div>
  )

  return spinner
}
