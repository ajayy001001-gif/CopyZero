import { useState, useEffect } from 'react';

export default function BlockchainAnimation({ 
  isActive = false, 
  blockNumber = null,
  onComplete 
}) {
  const [activeNodes, setActiveNodes] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(0);
  
  useEffect(() => {
    if (!isActive) {
      setActiveNodes(0);
      return;
    }
    
    const nodeInterval = setInterval(() => {
      setActiveNodes(prev => {
        if (prev >= 4) {
          clearInterval(nodeInterval);
          return 4;
        }
        return prev + 1;
      });
    }, 300);
    
    return () => clearInterval(nodeInterval);
  }, [isActive]);
  
  useEffect(() => {
    if (!isActive || !blockNumber) return;
    
    const duration = 2000;
    const steps = 30;
    const increment = blockNumber / steps;
    let current = 0;
    
    const blockInterval = setInterval(() => {
      current += increment;
      if (current >= blockNumber) {
        setCurrentBlock(blockNumber);
        clearInterval(blockInterval);
        onComplete?.();
      } else {
        setCurrentBlock(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(blockInterval);
  }, [isActive, blockNumber, onComplete]);
  
  if (!isActive) return null;
  
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="blockchain-animation">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center">
            <div 
              className={`blockchain-node ${i < activeNodes ? 'active' : ''}`}
              style={{ animationDelay: `${i * 0.2}s` }}
            />
            {i < 3 && (
              <div 
                className="blockchain-link"
                style={{ 
                  width: i < activeNodes - 1 ? '24px' : '0',
                  transition: 'width 0.5s ease-out',
                  transitionDelay: `${(i + 1) * 0.2}s`
                }}
              />
            )}
          </div>
        ))}
      </div>
      
      {blockNumber && (
        <div className="text-center">
          <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
            Block
          </p>
          <p className="text-lg font-mono text-[var(--color-text-primary)]">
            #{currentBlock.toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
