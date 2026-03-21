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
        message: 'Email/Phone and password are required'
      });
    }

    // Get user from SQLite - support login with email or phone
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    // If not found by email, try phone number
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE phone = ?').get(email);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/phone or password'
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
        message: 'Invalid email/phone or password'
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

    // Parse permissions - admin gets all permissions by default
    let permissions = user.permissions ? JSON.parse(user.permissions) : [];
    if (user.role === 'admin' && permissions.length === 0) {
      permissions = ['dashboard', 'products', 'bills', 'customers', 'settings'];
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          uid: user.uid,
          email: user.email,
          phone: user.phone,
          displayName: user.displayName,
          role: user.role,
          requirePasswordChange: Boolean(user.requirePasswordChange),
          permissions,
          profilePhoto: user.profilePhoto
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
    const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.user.uid);
    
    res.json({
      success: true,
      data: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get profile'
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { displayName, profilePhoto } = req.body;
    const { uid } = req.user;

    const updates = [];
    const params = [];

    if (displayName !== undefined) {
      updates.push('displayName = ?');
      params.push(displayName);
    }

    if (profilePhoto !== undefined) {
      // Validate profile photo size (base64 string max ~2MB)
      if (profilePhoto && profilePhoto.length > 2 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'Profile photo must be less than 2MB'
        });
      }
      updates.push('profilePhoto = ?');
      params.push(profilePhoto);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updates.push('updatedAt = ?');
    params.push(new Date().toISOString());
    params.push(uid);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE uid = ?`).run(...params);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
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

export default { login, logout, refreshToken, changePassword, getProfile, updateProfile, register };
