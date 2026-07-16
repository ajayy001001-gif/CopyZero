import { useState, useEffect } from 'react';

const statusMessages = [
  'Analyzing content',
  'Checking plagiarism',
  'Evaluating quality',
  'Generating feedback',
  'Finalizing results'
];

export default function AiEvaluatingAnimation() {
  const [statusIndex, setStatusIndex] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex(prev => (prev + 1) % statusMessages.length);
    }, 1200);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="dots-pulse">
        <span></span>
        <span></span>
        <span></span>
      </div>
      
      <div className="text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {statusMessages[statusIndex]}...
        </p>
      </div>
    </div>
  );
}
