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
    title: '新增使用者'
  });
});

// 處理使用者創建
router.post('/create', isAuthenticated, isAdmin, [
  body('username').trim().isLength({ min: 3 }).withMessage('使用者名稱至少需要 3 個字元'),
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址'),
  body('fullName').trim().notEmpty().withMessage('請輸入姓名'),
  body('role').isIn(['user', 'admin']).withMessage('角色無效'),
  body('password').isLength({ min: 6 }).withMessage('密碼至少需要 6 個字元'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('確認密碼與密碼不符');
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/users/create', {
      title: '新增使用者',
      error: errors.array()[0].msg,
      userData: req.body
    });
  }

  try {
    const { username, email, fullName, role, password } = req.body;
    
    // 檢查使用者名稱是否已存在
    const existingUsername = await User.findByUsername(username);
    if (existingUsername) {
      return res.render('pages/users/create', {
        title: '新增使用者',
        error: '使用者名稱已被使用',
        userData: req.body
      });
    }
    
    // 檢查電子郵件是否已存在
    const existingEmail = await User.findByEmail(email);
    if (existingEmail) {
      return res.render('pages/users/create', {
        title: '新增使用者',
        error: '電子郵件已被使用',
        userData: req.body
      });
    }
    
    // 創建新使用者
    await User.create({
      username,
      email,
      fullName,
      role,
      password
    });
    
    req.flash('success', '使用者已成功創建');
    res.redirect('/users');
  } catch (err) {
    console.error('創建使用者錯誤:', err);
    res.render('pages/users/create', {
      title: '新增使用者',
      error: '創建使用者時發生錯誤',
      userData: req.body
    });
  }
});

// 使用者編輯頁面
router.get('/:id/edit', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      req.flash('error', '找不到使用者');
      return res.redirect('/users');
    }
    
    res.render('pages/users/edit', {
      title: '編輯使用者',
      user
    });
  } catch (err) {
    console.error('取得使用者錯誤:', err);
    req.flash('error', '取得使用者資料時發生錯誤');
    res.redirect('/users');
  }
});

// 處理使用者編輯
router.post('/:id/edit', isAuthenticated, isAdmin, [
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址'),
  body('fullName').trim().notEmpty().withMessage('請輸入姓名'),
  body('role').isIn(['user', 'admin']).withMessage('角色無效'),
  body('password').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('密碼至少需要 6 個字元'),
  body('confirmPassword').custom((value, { req }) => {
    if (req.body.password && value !== req.body.password) {
      throw new Error('確認密碼與密碼不符');
    }
    return true;
  })
], async (req, res) => {
  const { id } = req.params;
  
  try {
    const user = await User.findById(id);
    
    if (!user) {
      req.flash('error', '找不到使用者');
      return res.redirect('/users');
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render('pages/users/edit', {
        title: '編輯使用者',
        user,
        error: errors.array()[0].msg
      });
    }
    
    const { email, fullName, role, password } = req.body;
    
    // 檢查電子郵件是否與其他使用者重複
    const existingEmail = await User.findByEmail(email);
    if (existingEmail && existingEmail.id !== parseInt(id)) {
      return res.render('pages/users/edit', {
        title: '編輯使用者',
        user,
        error: '電子郵件已被使用'
      });
    }
    
    // 更新使用者資料
    const updateData = {
      email,
      fullName,
      role
    };
    
    // 如果有提供密碼，則更新密碼
    if (password) {
      updateData.password = password;
    }
    
    // 關鍵更改：使用本地變數獲取更新結果，避免其影響 session
    const updatedUserData = await User.update(id, updateData);
    
    // 更新 session 資料（「只有」在管理員編輯自己的資料時才執行）
    // 使用嚴格相等和明確轉換的數值比較
    const currentUserId = parseInt(req.session.user.id, 10);
    const editedUserId = parseInt(id, 10);
    
    if (currentUserId === editedUserId) {
      console.log('更新了自己的資料，需要更新 session');
      
      // 重新讀取使用者資料以確保 session 中的資料完整且最新
      const refreshedUser = await User.findById(editedUserId);
      
      // 保留原始身份驗證狀態
      const isAuthenticated = req.session.isAuthenticated;
      
      // 更新 session 中的使用者資訊
      req.session.user = {
        id: refreshedUser.id,
        username: refreshedUser.username,
        email: refreshedUser.email,
        fullName: refreshedUser.fullName,
        role: refreshedUser.role,
        preferences: refreshedUser.preferences
      };
      
      // 確保身份驗證狀態不變
      req.session.isAuthenticated = isAuthenticated;
    } else {
      console.log('更新了其他使用者的資料，不更新 session');
    }
    
    req.flash('success', '使用者資料已成功更新');
    res.redirect(`/users/${id}/edit`);
  } catch (err) {
    console.error('更新使用者錯誤:', err);
    res.render('pages/users/edit', {
      title: '編輯使用者',
      user: {
        id: req.params.id,
        ...req.body
      },
      error: '更新使用者資料時發生錯誤'
    });
  }
});

// 處理使用者刪除
router.post('/:id/delete', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    // 不能刪除自己
    if (parseInt(id) === req.session.user.id) {
      req.flash('error', '不能刪除自己的帳號');
      return res.redirect('/users');
    }
    
    const user = await User.findById(id);
    
    if (!user) {
      req.flash('error', '找不到使用者');
      return res.redirect('/users');
    }
    
    await User.delete(id);
    
    req.flash('success', '使用者已成功刪除');
    res.redirect('/users');
  } catch (err) {
    console.error('刪除使用者錯誤:', err);
    req.flash('error', '刪除使用者時發生錯誤');
    res.redirect('/users');
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

    // 更新 session，保留身份驗證狀態
    const isAuthenticated = req.session.isAuthenticated;
    
    // 重新讀取使用者資料以確保 session 中的資料完整且最新
    const refreshedUser = await User.findById(req.session.user.id);
    
    req.session.user = {
      id: refreshedUser.id,
      username: refreshedUser.username,
      email: refreshedUser.email,
      fullName: refreshedUser.fullName,
      role: refreshedUser.role,
      preferences: refreshedUser.preferences
    };
    
    // 確保身份驗證狀態不變
    req.session.isAuthenticated = isAuthenticated;

    res.render('pages/users/profile', {
      title: '個人資料',
      error: null,
      success: '個人資料已更新',
      user: refreshedUser
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
    
    // 保留原始身份驗證狀態
    const isAuthenticated = req.session.isAuthenticated;
    
    // 更新 session 中的使用者資訊，確保保留完整的使用者資料
    req.session.user = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      role: updatedUser.role,
      preferences: updatedUser.preferences
    };
    
    // 確保身份驗證狀態不變
    req.session.isAuthenticated = isAuthenticated;
    
    // 儲存 session 變更，確保資料被正確寫入
    req.session.save(err => {
      if (err) {
        console.error('儲存 session 時發生錯誤:', err);
      }
      
      // 增加一個成功提示
      req.flash('success', '偏好設定已更新');
      
      // 重定向回個人資料頁面
      return res.redirect('/users/profile');
    });
  } catch (error) {
    console.error('更新偏好設定時發生錯誤:', error);
    req.flash('error', '更新偏好設定時發生錯誤');
    res.redirect('/users/profile');
  }
});

module.exports = router; 