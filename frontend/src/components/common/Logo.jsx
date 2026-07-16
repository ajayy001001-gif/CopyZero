import { useEffect, useState } from 'react';

export default function Logo({ size = 'md', animated = true, showText = true }) {
  const [dotsVisible, setDotsVisible] = useState(animated ? 0 : 12);
  
  const sizeClasses = {
    sm: { container: 'w-8 h-8', dot: 'w-1 h-1', text: 'text-lg' },
    md: { container: 'w-12 h-12', dot: 'w-1.5 h-1.5', text: 'text-xl' },
    lg: { container: 'w-16 h-16', dot: 'w-2 h-2', text: 'text-2xl' },
    xl: { container: 'w-24 h-24', dot: 'w-3 h-3', text: 'text-3xl' }
  };
  
  const { container, dot, text } = sizeClasses[size] || sizeClasses.md;
  
  useEffect(() => {
    if (!animated) return;
    
    const interval = setInterval(() => {
      setDotsVisible(prev => {
        if (prev >= 12) {
          clearInterval(interval);
          return 12;
        }
        return prev + 1;
      });
    }, 40);
    
    return () => clearInterval(interval);
  }, [animated]);
  
  // Dot matrix pattern forming "C0" (C and Zero)
  const dotPattern = [
    // C shape (left side)
    { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 },
    { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 1, y: 4 }, { x: 2, y: 4 },
    // 0 shape (right side)
    { x: 4, y: 0 }, { x: 5, y: 0 },
    { x: 4, y: 4 }, { x: 5, y: 4 },
    { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 6, y: 3 },
    { x: 3, y: 1 }, { x: 3, y: 3 },
  ];
  
  // Simplified 5x5 grid for cleaner look
  const simplifiedPattern = [
    { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 },
    { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 1, y: 4 }, { x: 2, y: 4 },
    { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 },
    { x: 4, y: 0 }, { x: 4, y: 4 },
  ];
  
  return (
    <div className="flex items-center gap-4">
      <div className={`${container} relative`}>
        <svg 
          viewBox="0 0 5 5" 
          className="w-full h-full"
          style={{ display: 'block' }}
        >
          {simplifiedPattern.map((pos, i) => (
            <circle
              key={i}
              cx={pos.x + 0.5}
              cy={pos.y + 0.5}
              r="0.35"
              fill="white"
              className="logo-dot"
              style={{
                animationDelay: `${i * 40}ms`,
                opacity: animated ? (i < dotsVisible ? 1 : 0) : 1,
                transition: animated ? 'opacity 200ms ease-out' : 'none'
              }}
            />
          ))}
        </svg>
      </div>
      {showText && (
        <span 
          className={`${text} font-semibold tracking-tight`}
          style={{ 
            fontFamily: 'Inter, sans-serif',
            opacity: animated ? (dotsVisible >= 12 ? 1 : 0) : 1,
            transition: 'opacity 300ms ease-out 200ms'
          }}
        >
          CopyZero
        </span>
      )}
    </div>
  );
}
