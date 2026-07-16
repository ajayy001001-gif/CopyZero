import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/common/Logo';
import LoadingDots from '../components/common/LoadingDots';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Clear error when user types
    if (error) setError('');
  }, [email, password]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const profile = await login(email, password);
      setShowSuccess(true);
      
      // Delay navigation for success animation
      setTimeout(() => {
        if (profile.role === 'professor') {
          navigate('/professor/dashboard');
        } else {
          navigate('/student/dashboard');
        }
      }, 600);
    } catch (err) {
      console.error('Login error:', err);
      
      if (err.message?.includes('Invalid') || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid credentials');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      {/* Success overlay animation */}
      {showSuccess && (
        <div 
          className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
          style={{
            background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
            animation: 'expandCircle 600ms ease-out forwards'
          }}
        />
      )}
      
      <div 
        className="w-full max-w-md page-enter"
        style={{ animationDelay: '100ms' }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <Logo size="lg" animated={true} />
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Email field */}
          <div 
            className="page-enter"
            style={{ animationDelay: '200ms' }}
          >
            <input
              type="email"
              required
              className={`input-underline ${error ? 'error' : ''}`}
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {/* Password field */}
          <div 
            className="page-enter"
            style={{ animationDelay: '300ms' }}
          >
            <input
              type="password"
              required
              className={`input-underline ${error ? 'error' : ''}`}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {/* Error message */}
          {error && (
            <div 
              className="text-center text-sm"
              style={{ 
                color: 'var(--color-accent-error)',
                animation: 'shake 300ms ease-out'
              }}
            >
              {error}
            </div>
          )}
          
          {/* Submit button */}
          <div 
            className="page-enter"
            style={{ animationDelay: '400ms' }}
          >
            <button
              type="submit"
              disabled={loading}
              className="btn-outline w-full"
            >
              {loading ? (
                <LoadingDots text="" />
              ) : (
                'Sign In'
              )}
            </button>
          </div>
          
          {/* Sign up link */}
          <div 
            className="text-center page-enter"
            style={{ animationDelay: '500ms' }}
          >
            <Link 
              to="/signup" 
              className="link text-sm"
            >
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
