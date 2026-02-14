interface LoadingSpinnerProps {
  text?: string
  fullPage?: boolean
}

export default function LoadingSpinner({ text = 'Loading...', fullPage = false }: LoadingSpinnerProps) {
  const lines = 12

  return (
    <div className={`flex flex-col items-center justify-center ${fullPage ? 'min-h-[60vh]' : 'py-12'}`}>
      <div className="spinner-lines">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="spinner-line"
            style={{
              transform: `rotate(${i * (360 / lines)}deg)`,
              animationDelay: `${-(lines - i) * (1 / lines)}s`,
            }}
          />
        ))}
      </div>
      <p className="mt-6 text-sm font-medium text-content-secondary">{text}</p>

      <style jsx>{`
        .spinner-lines {
          position: relative;
          width: 48px;
          height: 48px;
        }

        .spinner-line {
          position: absolute;
          top: 0;
          left: 50%;
          width: 3px;
          height: 14px;
          margin-left: -1.5px;
          border-radius: 2px;
          background: var(--color-text-secondary);
          transform-origin: center 24px;
          animation: spinner-fade 1s linear infinite;
        }

        @keyframes spinner-fade {
          0% { opacity: 1; }
          100% { opacity: 0.15; }
        }
      `}</style>
    </div>
  )
}
