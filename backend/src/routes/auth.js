const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// Input validation helpers
const validateLoginInput = (username, password) => {
  const errors = {};
  
  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    errors.username = 'Username is required';
  } else if (username.length < 3 || username.length > 20) {
    errors.username = 'Username must be between 3 and 20 characters';
  }
  
  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.password = 'Password is required';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    const validation = validateLoginInput(username, password);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please check your input',
        fields: validation.errors
      });
    }

    // Find user by username
    const user = await User.findByUsername(username.trim());
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }

    // Verify password
    const isPasswordValid = await user.verifyPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;

    // Return user data (excluding sensitive information)
    res.json({
      user: user.toJSON(),
      message: 'Login successful'
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

/**
 * GET /api/auth/user
 * Get current authenticated user information
 */
router.get('/user', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      // User was deleted but session still exists
      req.session.destroy(() => {});
      return res.status(404).json({
        error: 'User not found',
        message: 'Your account no longer exists'
      });
    }

    res.json({
      user: user.toJSON()
    });

  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user information',
      message: 'An error occurred while retrieving user data'
    });
  }
});

/**
 * POST /api/auth/logout
 * Destroy user session
 */
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy((error) => {
      if (error) {
        console.error('❌ Logout error:', error);
        return res.status(500).json({
          error: 'Logout failed',
          message: 'An error occurred during logout'
        });
      }

      // Clear the session cookie
      res.clearCookie('clarity.sid');
      
      res.json({
        message: 'Logout successful'
      });
    });
  } else {
    res.json({
      message: 'No active session found'
    });
  }
});

/**
 * GET /api/auth/status
 * Check authentication status
 */
router.get('/status', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.userId),
    sessionId: req.sessionID,
    userId: req.session?.userId || null,
    username: req.session?.username || null
  });
});

module.exports = router;