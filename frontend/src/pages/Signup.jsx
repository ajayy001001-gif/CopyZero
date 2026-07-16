import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/common/Logo';
import LoadingDots from '../components/common/LoadingDots';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const { signup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (error) setError('');
  }, [fullName, email, password, role]);

  useEffect(() => {
    // Validate email domain
    if (email && !email.endsWith('@vit.ac.in') && !email.endsWith('@vitstudent.ac.in')) {
      setEmailError('Please use a valid VIT email address');
    } else {
      setEmailError('');
    }
  }, [email]);

  useEffect(() => {
    // Calculate password strength
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    setPasswordStrength(strength);
  }, [password]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    
    if (emailError) {
      setError('Please fix the errors before submitting');
      return;
    }
    
    setLoading(true);

    try {
      await signup(email, password, fullName, role);
      navigate(role === 'professor' ? '/professor/dashboard' : '/student/dashboard');
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  const strengthColors = ['#2A2A2A', '#FF3B30', '#FF9500', '#FFCC00', '#FFFFFF'];

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md page-enter">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Logo size="lg" animated={true} />
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Full Name */}
          <div className="page-enter" style={{ animationDelay: '100ms' }}>
            <input
              type="text"
              required
              className="input-underline"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {/* Email */}
          <div className="page-enter" style={{ animationDelay: '150ms' }}>
            <input
              type="email"
              required
              className={`input-underline ${emailError ? 'error' : ''}`}
              placeholder="VIT Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            {emailError && (
              <p className="mt-2 text-xs" style={{ color: 'var(--color-accent-error)' }}>
                {emailError}
              </p>
            )}
          </div>
          
          {/* Password */}
          <div className="page-enter" style={{ animationDelay: '200ms' }}>
            <input
              type="password"
              required
              className="input-underline"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            {/* Password strength indicator */}
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className="h-0.5 flex-1 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: passwordStrength >= level 
                      ? strengthColors[passwordStrength] 
                      : 'var(--color-border)'
                  }}
                />
              ))}
            </div>
          </div>
          
          {/* Role Selection */}
          <div className="page-enter" style={{ animationDelay: '250ms' }}>
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
              Role
            </p>
            <div className="radio-group">
              <label 
                className={`radio-item ${role === 'professor' ? 'selected' : ''}`}
                onClick={() => setRole('professor')}
              >
                <div className="radio-circle" />
                <span>Professor</span>
              </label>
              <label 
                className={`radio-item ${role === 'student' ? 'selected' : ''}`}
                onClick={() => setRole('student')}
              >
                <div className="radio-circle" />
                <span>Student</span>
              </label>
            </div>
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
          <div className="page-enter" style={{ animationDelay: '300ms' }}>
            <button
              type="submit"
              disabled={loading || !!emailError}
              className="btn-outline w-full"
            >
              {loading ? (
                <LoadingDots text="" />
              ) : (
                'Create Account'
              )}
            </button>
          </div>
          
          {/* Sign in link */}
          <div className="text-center page-enter" style={{ animationDelay: '350ms' }}>
            <Link to="/login" className="link text-sm">
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
