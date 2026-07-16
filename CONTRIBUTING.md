# Contributing to CopyZero

Thank you for your interest in contributing to CopyZero! We welcome contributions from everyone.

---

## 🤝 How to Contribute

### Reporting Bugs

**Before submitting a bug report:**
1. Check existing issues to avoid duplicates
2. Verify the bug exists in the latest version
3. Collect relevant information (browser, OS, error messages)

**Submit a bug report:**
1. Go to [Issues](https://github.com/YOUR-USERNAME/copyzero/issues)
2. Click "New Issue"
3. Choose "Bug Report" template
4. Fill in all sections:
   - Clear title
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - Environment details

### Suggesting Features

**Before suggesting a feature:**
1. Check if it's already been suggested
2. Make sure it aligns with project goals
3. Consider the scope and complexity

**Submit a feature request:**
1. Go to [Issues](https://github.com/YOUR-USERNAME/copyzero/issues)
2. Click "New Issue"
3. Choose "Feature Request" template
4. Describe:
   - The problem it solves
   - Your proposed solution
   - Alternative solutions considered
   - Additional context

---

## 💻 Development Process

### Setting Up Development Environment

1. **Fork the repository**
```bash
# Click "Fork" on GitHub
```

2. **Clone your fork**
```bash
git clone https://github.com/YOUR-USERNAME/copyzero.git
cd copyzero
```

3. **Add upstream remote**
```bash
git remote add upstream https://github.com/ORIGINAL-OWNER/copyzero.git
```

4. **Install dependencies**
```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install
```

5. **Create a branch**
```bash
git checkout -b feature/your-feature-name
```

### Making Changes

1. **Write clean code**
   - Follow existing code style
   - Add comments for complex logic
   - Use meaningful variable names
   - Keep functions small and focused

2. **Test your changes**
   - Test manually in browser
   - Verify both frontend and backend work
   - Check for console errors
   - Test edge cases

3. **Commit your changes**
```bash
git add .
git commit -m "feat: add new feature"
```

### Commit Message Format

Use conventional commits:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

**Examples:**
```
feat(student): add auto-save draft feature
fix(professor): resolve score calculation bug
docs(readme): update installation instructions
style(frontend): format code with prettier
refactor(api): simplify submission logic
```

### Submitting Pull Request

1. **Push to your fork**
```bash
git push origin feature/your-feature-name
```

2. **Create Pull Request**
   - Go to your fork on GitHub
   - Click "Compare & pull request"
   - Fill in the PR template:
     - Description of changes
     - Related issues
     - Screenshots (if UI changes)
     - Testing steps

3. **Wait for review**
   - Address any feedback
   - Make requested changes
   - Push updates (they'll appear in the PR)

4. **After approval**
   - PR will be merged
   - Delete your branch
   - Sync your fork

---

## 📋 Code Style Guide

### JavaScript/React

**General:**
- Use ES6+ features (arrow functions, destructuring, etc.)
- Use `const` by default, `let` when needed, avoid `var`
- Use template literals for string interpolation
- Use async/await over promises

**React:**
```jsx
// ✅ Good
function MyComponent({ prop1, prop2 }) {
  const [state, setState] = useState(initialValue);
  
  useEffect(() => {
    // Side effects
  }, [dependency]);
  
  const handleClick = () => {
    // Handler logic
  };
  
  return <div onClick={handleClick}>{prop1}</div>;
}

// ❌ Bad
function MyComponent(props) {
  var state = useState(initialValue)[0];
  var setState = useState(initialValue)[1];
  
  return <div onClick={function() { /* ... */ }}>{props.prop1}</div>;
}
```

**Naming Conventions:**
- Components: `PascalCase` (e.g., `SubmitAssignment`)
- Functions: `camelCase` (e.g., `handleSubmit`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_URL`)
- Files: Match component name (e.g., `SubmitAssignment.jsx`)

**File Organization:**
```jsx
// 1. Imports
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. Component
export default function MyComponent() {
  // 3. State
  const [state, setState] = useState();
  
  // 4. Hooks
  const navigate = useNavigate();
  
  // 5. Effects
  useEffect(() => {}, []);
  
  // 6. Handlers
  const handleClick = () => {};
  
  // 7. Render
  return <div></div>;
}
```

### Backend

**Controller Structure:**
```javascript
// ✅ Good
async function controllerFunction(req, res) {
  try {
    const { param } = req.body;
    
    // Validation
    if (!param) {
      return res.status(400).json({ error: 'Param required' });
    }
    
    // Business logic
    const result = await service.doSomething(param);
    
    // Success response
    return res.status(200).json({
      message: 'Success',
      data: result
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
```

**Error Handling:**
- Always wrap async functions in try-catch
- Return appropriate HTTP status codes
- Provide meaningful error messages
- Log errors with context

---

## 🧪 Testing Guidelines

### Manual Testing

Before submitting PR:

**Frontend:**
- [ ] Test in Chrome, Firefox, Safari
- [ ] Test mobile responsive design
- [ ] Check for console errors
- [ ] Verify all links work
- [ ] Test form validation
- [ ] Test error states

**Backend:**
- [ ] Test all affected endpoints with Postman
- [ ] Verify database changes
- [ ] Check authentication/authorization
- [ ] Test error responses
- [ ] Verify logging works

**Integration:**
- [ ] Test frontend + backend together
- [ ] Verify data flows correctly
- [ ] Check real-time features (auto-save)
- [ ] Test edge cases

---

## 🐛 Debugging Tips

### Frontend Debugging

**Console Logging:**
```javascript
console.log('📤 Sending data:', data);
console.log('✅ Success:', response);
console.error('❌ Error:', error);
```

**React DevTools:**
1. Install React DevTools extension
2. Inspect component props and state
3. Track re-renders

**Network Tab:**
1. Open F12 → Network
2. Check API calls
3. Verify request/response

### Backend Debugging

**Logging:**
```javascript
console.log('📥 Request:', req.body);
console.log('👤 User:', req.user);
console.log('📊 Result:', result);
```

**Postman Testing:**
1. Create collection for CopyZero
2. Save common requests
3. Test with different data

---

## 📦 Adding Dependencies

**Before adding a dependency:**
1. Check if it's really needed
2. Consider bundle size impact
3. Verify it's actively maintained
4. Check license compatibility

**How to add:**
```bash
# Frontend
cd frontend
npm install package-name

# Backend
cd backend
npm install package-name
```

**Update documentation:**
- Add to README dependencies section
- Note why it's needed
- Include version

---

## 🎨 UI/UX Guidelines

### Design Principles
1. **Consistency** - Use existing components and styles
2. **Simplicity** - Keep interfaces clean and intuitive
3. **Accessibility** - Support keyboard navigation, screen readers
4. **Responsiveness** - Work on all screen sizes

### Tailwind Usage
```jsx
// ✅ Good - Use existing classes
<button className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
  Submit
</button>

// ❌ Bad - Custom inline styles
<button style={{ padding: '8px 16px', background: '#4F46E5' }}>
  Submit
</button>
```

### Color Palette
- Primary: `indigo-600` (#2E3192)
- Success: `green-600` (#00A86B)
- Error: `red-600`
- Warning: `yellow-500`
- Info: `blue-500`

---

## 📝 Documentation

### Code Comments

**When to comment:**
- Complex algorithms
- Non-obvious logic
- Workarounds for known issues
- Public API functions

**When NOT to comment:**
- Self-explanatory code
- Obvious variable names
- Standard patterns

```javascript
// ✅ Good comment
// Calculate score with weighted criteria (see Issue #42)
const weightedScore = criteria.reduce((sum, c) => sum + c.score * c.weight, 0);

// ❌ Bad comment
// Set name variable
const name = user.name;
```

### README Updates

When adding features:
1. Update main README.md
2. Update relevant section README
3. Add to API documentation if needed
4. Update screenshots if UI changed

---

## 🔐 Security

### Don't Commit Secrets
Never commit:
- API keys
- Firebase credentials
- Environment variables
- Private keys
- Passwords

**Use:**
- `.env` files (in `.gitignore`)
- Environment variables
- Secret management services

### Input Validation
Always validate user input:
```javascript
// Backend
if (!email || !email.includes('@')) {
  return res.status(400).json({ error: 'Invalid email' });
}

// Frontend
const isValid = fileName.length > 0 && fileName.length < 255;
```

---

## 📞 Getting Help

**Need help?**
- 💬 Ask in [Discussions](https://github.com/YOUR-USERNAME/copyzero/discussions)
- 🐛 Report bugs in [Issues](https://github.com/YOUR-USERNAME/copyzero/issues)
- 📧 Email: dev@copyzero.dev
- 💬 Discord: [Join our server](https://discord.gg/copyzero)

**Resources:**
- [React Docs](https://react.dev)
- [Firebase Docs](https://firebase.google.com/docs)
- [Tailwind Docs](https://tailwindcss.com/docs)
- [Express Docs](https://expressjs.com)

---

## ✅ Pull Request Checklist

Before submitting your PR:

- [ ] Code follows style guidelines
- [ ] Comments added for complex logic
- [ ] No console.log statements (except intentional logging)
- [ ] All tests pass
- [ ] No linting errors
- [ ] Documentation updated
- [ ] Screenshots added (if UI changes)
- [ ] Tested on multiple browsers (if frontend)
- [ ] No merge conflicts
- [ ] Branch is up to date with main

---

## 🏆 Recognition

Contributors will be:
- Listed in README.md
- Mentioned in release notes
- Given credit in commits
- Invited to CopyZero contributors team

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to CopyZero! 🎉**

*Together, we're building better academic integrity tools for everyone.*

---

**Team CopyZero | Academic Integrity for the Digital Age**
