import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import { db } from '../config/firebase.js';

// In-memory user store for demo (replace with Firebase in production)
const users = new Map();

// Initialize default admin
users.set(config.admin.email, {
  uid: 'admin-001',
  email: config.admin.email,
  password: config.admin.password,
  displayName: 'Administrator',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString()
});

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check user in memory store first (for demo)
    let user = users.get(email);

    // If not in memory, try Firebase
    if (!user && db) {
      try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          user = { uid: doc.id, ...doc.data() };
        }
      } catch (error) {
        // Firebase not configured, using memory store
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Simple password check (in production, use bcrypt)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is disabled'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        uid: user.uid,
        email: user.email,
        role: user.role,
        displayName: user.displayName
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Update last login
    user.lastLogin = new Date().toISOString();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

export const logout = async (req, res) => {
  try {
    // In a real app, you might want to blacklist the token
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    const decoded = jwt.verify(token, config.jwt.secret, { ignoreExpiration: true });
    
    // Generate new token
    const newToken = jwt.sign(
      {
        uid: decoded.uid,
        email: decoded.email,
        role: decoded.role,
        displayName: decoded.displayName
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      success: true,
      data: { token: newToken }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { email } = req.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = users.get(email);
    
    if (!user || user.password !== currentPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    users.set(email, user);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        uid: req.user.uid,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

export default { login, logout, refreshToken, changePassword, getProfile };
