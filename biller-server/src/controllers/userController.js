import db from '../config/database.js';
import config from '../config/config.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Get all users (admin only)
export const getAllUsers = async (req, res) => {
  try {
    const users = db.prepare(`
      SELECT uid, email, phone, displayName, role, isActive, requirePasswordChange, permissions, lastLogin, createdAt
      FROM users
      ORDER BY createdAt DESC
    `).all();

    // Parse permissions JSON
    const parsedUsers = users.map(user => {
      let permissions = user.permissions ? JSON.parse(user.permissions) : [];
      // Admin gets all permissions by default
      if (user.role === 'admin' && permissions.length === 0) {
        permissions = ['dashboard', 'products', 'bills', 'customers', 'settings'];
      }
      return {
        ...user,
        permissions,
        isActive: Boolean(user.isActive),
        requirePasswordChange: Boolean(user.requirePasswordChange)
      };
    });

    res.json({
      success: true,
      data: parsedUsers
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

// Create new user (admin only)
export const createUser = async (req, res) => {
  try {
    const { phone, displayName, role, permissions } = req.body;

    // Validate required fields
    if (!phone || !displayName || !role) {
      return res.status(400).json({
        success: false,
        message: 'Phone, display name, and role are required'
      });
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'staff'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be admin, manager, or staff'
      });
    }

    // Check if phone already exists
    const existingUser = db.prepare('SELECT uid FROM users WHERE phone = ?').get(phone);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists'
      });
    }

    // Generate unique UID and email
    const uid = uuidv4();
    const email = `${phone}@biller.local`; // Generate email from phone

    // Hash default password
    const hashedPassword = await bcrypt.hash(config.defaultPassword, 10);

    // Set default permissions based on role
    let defaultPermissions = [];
    if (role === 'admin') {
      defaultPermissions = ['dashboard', 'products', 'bills', 'customers', 'settings'];
    } else if (role === 'manager') {
      defaultPermissions = ['dashboard', 'products', 'bills', 'customers'];
    } else {
      defaultPermissions = ['dashboard', 'bills'];
    }

    const userPermissions = permissions || defaultPermissions;

    // Insert user
    db.prepare(`
      INSERT INTO users (uid, email, phone, password, displayName, role, isActive, requirePasswordChange, permissions, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(uid, email, phone, hashedPassword, displayName, role, 1, 1, JSON.stringify(userPermissions));

    // Fetch created user
    const user = db.prepare(`
      SELECT uid, email, phone, displayName, role, isActive, requirePasswordChange, permissions, createdAt
      FROM users WHERE uid = ?
    `).get(uid);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        ...user,
        permissions: JSON.parse(user.permissions),
        isActive: Boolean(user.isActive),
        requirePasswordChange: Boolean(user.requirePasswordChange),
        defaultPassword: config.defaultPassword
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    // Check for specific error types
    if (error.message && error.message.includes('UNIQUE')) {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number or email already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create user: ' + (error.message || 'Unknown error')
    });
  }
};

// Update user (admin only)
export const updateUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const { displayName, role, permissions, isActive } = req.body;

    // Check if user exists
    const user = db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Build update query
    const updates = [];
    const values = [];

    if (displayName !== undefined) {
      updates.push('displayName = ?');
      values.push(displayName);
    }
    if (role !== undefined) {
      const validRoles = ['admin', 'manager', 'staff'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role'
        });
      }
      updates.push('role = ?');
      values.push(role);
    }
    if (permissions !== undefined) {
      updates.push('permissions = ?');
      values.push(JSON.stringify(permissions));
    }
    if (isActive !== undefined) {
      updates.push('isActive = ?');
      values.push(isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updatedAt = datetime(\'now\')');
      values.push(uid);

      const query = `UPDATE users SET ${updates.join(', ')} WHERE uid = ?`;
      db.prepare(query).run(...values);
    }

    // Fetch updated user
    const updatedUser = db.prepare(`
      SELECT uid, email, phone, displayName, role, isActive, requirePasswordChange, permissions, lastLogin, createdAt
      FROM users WHERE uid = ?
    `).get(uid);

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        ...updatedUser,
        permissions: updatedUser.permissions ? JSON.parse(updatedUser.permissions) : [],
        isActive: Boolean(updatedUser.isActive),
        requirePasswordChange: Boolean(updatedUser.requirePasswordChange)
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

// Delete user (admin only)
export const deleteUser = async (req, res) => {
  try {
    const { uid } = req.params;

    // Check if user exists
    const user = db.prepare('SELECT uid, role FROM users WHERE uid = ?').get(uid);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting last admin
    if (user.role === 'admin') {
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
      if (adminCount.count <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last admin user'
        });
      }
    }

    // Delete user
    db.prepare('DELETE FROM users WHERE uid = ?').run(uid);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// Reset user password (admin only)
export const resetUserPassword = async (req, res) => {
  try {
    const { uid } = req.params;

    // Check if user exists
    const user = db.prepare('SELECT uid FROM users WHERE uid = ?').get(uid);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash default password
    const hashedPassword = await bcrypt.hash(config.defaultPassword, 10);

    // Update password and set requirePasswordChange flag
    db.prepare(`
      UPDATE users 
      SET password = ?, requirePasswordChange = 1, updatedAt = datetime('now')
      WHERE uid = ?
    `).run(hashedPassword, uid);

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        defaultPassword: config.defaultPassword
      }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

// Change own password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.uid; // From auth middleware

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Get user
    const user = db.prepare('SELECT password FROM users WHERE uid = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and remove requirePasswordChange flag
    db.prepare(`
      UPDATE users 
      SET password = ?, requirePasswordChange = 0, updatedAt = datetime('now')
      WHERE uid = ?
    `).run(hashedPassword, userId);

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

export default {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  changePassword
};
