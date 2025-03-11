const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

const router = express.Router();

// 使用者列表頁面 (僅管理員可訪問)
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const users = await User.getAll();
    res.render('pages/users/index', {
      title: '使用者管理',
      users
    });
  } catch (err) {
    console.error('取得使用者列表錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得使用者列表時發生錯誤'
    });
  }
});

// 新增使用者頁面 (僅管理員可訪問)
router.get('/create', isAuthenticated, isAdmin, (req, res) => {
  res.render('pages/users/create', {
    title: '新增使用者',
    error: null,
    user: {}
  });
});

// 處理新增使用者請求 (僅管理員可訪問)
router.post('/create', [
  body('username').trim().isLength({ min: 3 }).withMessage('使用者名稱至少需要3個字元'),
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址'),
  body('password').isLength({ min: 6 }).withMessage('密碼至少需要6個字元'),
  body('fullName').trim().notEmpty().withMessage('請輸入全名'),
  body('role').isIn(['admin', 'user']).withMessage('角色無效')
], isAuthenticated, isAdmin, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/users/create', {
      title: '新增使用者',
      error: errors.array()[0].msg,
      user: {
        username: req.body.username,
        email: req.body.email,
        fullName: req.body.fullName,
        role: req.body.role
      }
    });
  }

  try {
    // 檢查使用者名稱是否已存在
    const existingUsername = await User.findByUsername(req.body.username);
    if (existingUsername) {
      return res.render('pages/users/create', {
        title: '新增使用者',
        error: '使用者名稱已被使用',
        user: {
          username: req.body.username,
          email: req.body.email,
          fullName: req.body.fullName,
          role: req.body.role
        }
      });
    }

    // 檢查電子郵件是否已存在
    const existingEmail = await User.findByEmail(req.body.email);
    if (existingEmail) {
      return res.render('pages/users/create', {
        title: '新增使用者',
        error: '電子郵件已被使用',
        user: {
          username: req.body.username,
          email: req.body.email,
          fullName: req.body.fullName,
          role: req.body.role
        }
      });
    }

    // 創建新使用者
    await User.create({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.fullName,
      role: req.body.role
    });

    res.redirect('/users');
  } catch (err) {
    console.error('創建使用者錯誤:', err);
    res.render('pages/users/create', {
      title: '新增使用者',
      error: '創建使用者時發生錯誤',
      user: {
        username: req.body.username,
        email: req.body.email,
        fullName: req.body.fullName,
        role: req.body.role
      }
    });
  }
});

// 編輯使用者頁面 (僅管理員可訪問)
router.get('/edit/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).render('pages/error', {
        title: '找不到使用者',
        message: '找不到指定的使用者'
      });
    }

    res.render('pages/users/edit', {
      title: '編輯使用者',
      error: null,
      user
    });
  } catch (err) {
    console.error('取得使用者錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得使用者資料時發生錯誤'
    });
  }
});

// 處理編輯使用者請求 (僅管理員可訪問)
router.post('/edit/:id', [
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址'),
  body('fullName').trim().notEmpty().withMessage('請輸入全名'),
  body('role').isIn(['admin', 'user']).withMessage('角色無效')
], isAuthenticated, isAdmin, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/users/edit', {
      title: '編輯使用者',
      error: errors.array()[0].msg,
      user: {
        id: req.params.id,
        email: req.body.email,
        fullName: req.body.fullName,
        role: req.body.role
      }
    });
  }

  try {
    // 檢查使用者是否存在
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).render('pages/error', {
        title: '找不到使用者',
        message: '找不到指定的使用者'
      });
    }

    // 檢查電子郵件是否已被其他使用者使用
    if (req.body.email !== existingUser.email) {
      const existingEmail = await User.findByEmail(req.body.email);
      if (existingEmail && existingEmail.id !== parseInt(req.params.id)) {
        return res.render('pages/users/edit', {
          title: '編輯使用者',
          error: '電子郵件已被使用',
          user: {
            id: req.params.id,
            email: req.body.email,
            fullName: req.body.fullName,
            role: req.body.role
          }
        });
      }
    }

    // 更新使用者資料
    const userData = {
      email: req.body.email,
      fullName: req.body.fullName,
      role: req.body.role
    };

    // 如果提供了新密碼，則更新密碼
    if (req.body.password && req.body.password.trim() !== '') {
      userData.password = req.body.password;
    }

    await User.update(req.params.id, userData);

    res.redirect('/users');
  } catch (err) {
    console.error('更新使用者錯誤:', err);
    res.render('pages/users/edit', {
      title: '編輯使用者',
      error: '更新使用者時發生錯誤',
      user: {
        id: req.params.id,
        email: req.body.email,
        fullName: req.body.fullName,
        role: req.body.role
      }
    });
  }
});

// 刪除使用者 (僅管理員可訪問)
router.post('/delete/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    // 檢查使用者是否存在
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: '找不到使用者' });
    }

    // 不允許刪除自己
    if (parseInt(req.params.id) === req.session.user.id) {
      return res.status(400).json({ success: false, message: '不能刪除自己的帳號' });
    }

    // 刪除使用者
    await User.delete(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('刪除使用者錯誤:', err);
    res.status(500).json({ success: false, message: err.message || '刪除使用者時發生錯誤' });
  }
});

// 個人資料頁面
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }

    res.render('pages/users/profile', {
      title: '個人資料',
      error: null,
      success: null,
      user
    });
  } catch (err) {
    console.error('取得個人資料錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得個人資料時發生錯誤'
    });
  }
});

// 更新個人資料
router.post('/profile', [
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址'),
  body('fullName').trim().notEmpty().withMessage('請輸入全名')
], isAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/users/profile', {
      title: '個人資料',
      error: errors.array()[0].msg,
      success: null,
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        email: req.body.email,
        fullName: req.body.fullName,
        role: req.session.user.role
      }
    });
  }

  try {
    // 檢查使用者是否存在
    const existingUser = await User.findById(req.session.user.id);
    if (!existingUser) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }

    // 檢查電子郵件是否已被其他使用者使用
    if (req.body.email !== existingUser.email) {
      const existingEmail = await User.findByEmail(req.body.email);
      if (existingEmail && existingEmail.id !== req.session.user.id) {
        return res.render('pages/users/profile', {
          title: '個人資料',
          error: '電子郵件已被使用',
          success: null,
          user: {
            id: req.session.user.id,
            username: req.session.user.username,
            email: req.body.email,
            fullName: req.body.fullName,
            role: req.session.user.role
          }
        });
      }
    }

    // 更新使用者資料
    const userData = {
      email: req.body.email,
      fullName: req.body.fullName
    };

    // 如果提供了新密碼，則更新密碼
    if (req.body.newPassword && req.body.newPassword.trim() !== '') {
      // 驗證當前密碼
      const isValidPassword = User.verifyPassword(req.body.currentPassword, existingUser.password);
      if (!isValidPassword) {
        return res.render('pages/users/profile', {
          title: '個人資料',
          error: '當前密碼不正確',
          success: null,
          user: {
            id: req.session.user.id,
            username: req.session.user.username,
            email: req.body.email,
            fullName: req.body.fullName,
            role: req.session.user.role
          }
        });
      }

      // 檢查新密碼長度
      if (req.body.newPassword.length < 6) {
        return res.render('pages/users/profile', {
          title: '個人資料',
          error: '新密碼至少需要6個字元',
          success: null,
          user: {
            id: req.session.user.id,
            username: req.session.user.username,
            email: req.body.email,
            fullName: req.body.fullName,
            role: req.session.user.role
          }
        });
      }

      // 檢查新密碼確認
      if (req.body.newPassword !== req.body.confirmPassword) {
        return res.render('pages/users/profile', {
          title: '個人資料',
          error: '新密碼確認不匹配',
          success: null,
          user: {
            id: req.session.user.id,
            username: req.session.user.username,
            email: req.body.email,
            fullName: req.body.fullName,
            role: req.session.user.role
          }
        });
      }

      userData.password = req.body.newPassword;
    }

    // 更新使用者
    const updatedUser = await User.update(req.session.user.id, userData);

    // 更新 session
    req.session.user = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      role: updatedUser.role
    };

    res.render('pages/users/profile', {
      title: '個人資料',
      error: null,
      success: '個人資料已更新',
      user: updatedUser
    });
  } catch (err) {
    console.error('更新個人資料錯誤:', err);
    res.render('pages/users/profile', {
      title: '個人資料',
      error: '更新個人資料時發生錯誤',
      success: null,
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        email: req.body.email,
        fullName: req.body.fullName,
        role: req.session.user.role
      }
    });
  }
});

// 更新使用者偏好設定
router.post('/preferences', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { theme, colorScheme, fontSize, fontFamily, language } = req.body;
    
    // 建立偏好設定物件
    const preferences = {};
    
    // 只包含有值的欄位
    if (theme) preferences.theme = theme;
    if (colorScheme) preferences.colorScheme = colorScheme;
    if (fontSize) preferences.fontSize = fontSize;
    if (fontFamily) preferences.fontFamily = fontFamily;
    if (language) preferences.language = language;
    
    // 更新使用者偏好設定
    const updatedUser = await User.updatePreferences(userId, preferences);
    
    // 更新 session 中的使用者資訊
    req.session.user = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      role: updatedUser.role,
      preferences: updatedUser.preferences
    };
    
    req.flash('success', '偏好設定已成功更新');
    res.redirect('/users/profile');
  } catch (error) {
    console.error('更新偏好設定時發生錯誤:', error);
    req.flash('error', '更新偏好設定時發生錯誤');
    res.redirect('/users/profile');
  }
});

module.exports = router; 