import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import config from '../config/config.js';
import db from '../config/database.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Get user from SQLite
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password (support both plain and hashed passwords for migration)
    let passwordValid = false;
    if (user.password.startsWith('$2')) {
      // Bcrypt hashed password
      passwordValid = await bcrypt.compare(password, user.password);
    } else {
      // Plain text password (legacy/demo)
      passwordValid = user.password === password;
    }

    if (!passwordValid) {
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
    db.prepare('UPDATE users SET lastLogin = ? WHERE uid = ?')
      .run(new Date().toISOString(), user.uid);

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
    
    // Verify user still exists and is active
    const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(decoded.uid);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Generate new token
    const newToken = jwt.sign(
      {
        uid: user.uid,
        email: user.email,
        role: user.role,
        displayName: user.displayName
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
    const { uid } = req.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check current password
    let passwordValid = false;
    if (user.password.startsWith('$2')) {
      passwordValid = await bcrypt.compare(currentPassword, user.password);
    } else {
      passwordValid = user.password === currentPassword;
    }

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    db.prepare('UPDATE users SET password = ?, updatedAt = ? WHERE uid = ?')
      .run(hashedPassword, new Date().toISOString(), uid);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
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

// Register new user (admin only)
export const register = async (req, res) => {
  try {
    const { email, password, displayName, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check if user exists
    const existingUser = db.prepare('SELECT uid FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = `user-${Date.now()}`;

    db.prepare(`
      INSERT INTO users (uid, email, password, displayName, role, isActive)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(uid, email, hashedPassword, displayName || email.split('@')[0], role || 'user');

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { uid, email, displayName }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register user'
    });
  }
};

export default { login, logout, refreshToken, changePassword, getProfile, register };
