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
    const editUser = await User.findById(req.params.id);
    
    if (!editUser) {
      req.flash('error', '找不到使用者');
      return res.redirect('/users');
    }
    
    // 確保有當前登入用戶資訊
    const currentUser = req.session.user;
    console.log(`Admin ${currentUser.username} 正在編輯用戶 ${editUser.username}`);
    
    res.render('pages/users/edit', {
      title: '編輯使用者',
      user: editUser,  // 保持與原模板相容，但在模板中會重命名
      editUser,        // 提供明確命名的變量
      currentUser      // 提供當前登入用戶信息給模板
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
    console.log(`開始處理用戶 ID: ${id} 的編輯請求`);
    const user = await User.findById(id);
    
    if (!user) {
      console.warn(`找不到 ID 為 ${id} 的用戶`);
      req.flash('error', '找不到使用者');
      return res.redirect('/users');
    }
    
    console.log(`找到用戶: ${user.username} (ID: ${user.id})`);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // 確保當前登入用戶訊息可用
      const currentUser = req.session.user;
      console.warn(`表單驗證錯誤: ${errors.array()[0].msg}`);
      return res.render('pages/users/edit', {
        title: '編輯使用者',
        user,
        editUser: user,
        currentUser,
        error: errors.array()[0].msg
      });
    }
    
    const { email, fullName, role, password } = req.body;
    console.log(`請求更新用戶資料 - Email: ${email}, 姓名: ${fullName}, 角色: ${role}, 密碼更新: ${password ? '是' : '否'}`);
    
    // 檢查電子郵件是否與其他使用者重複
    const existingEmail = await User.findByEmail(email);
    if (existingEmail && existingEmail.id !== parseInt(id)) {
      // 確保當前登入用戶訊息可用
      const currentUser = req.session.user;
      console.warn(`電子郵件 ${email} 已被用戶 ${existingEmail.username} (ID: ${existingEmail.id}) 使用`);
      return res.render('pages/users/edit', {
        title: '編輯使用者',
        user,
        editUser: user,
        currentUser,
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
    
    console.log(`準備更新用戶 ${user.username} (ID: ${user.id}) 的資料`);
    console.log('更新資料:', JSON.stringify({
      email: updateData.email,
      fullName: updateData.fullName,
      role: updateData.role,
      password: updateData.password ? '已提供' : '未提供'
    }));
    
    try {
      // 關鍵更改：使用本地變數獲取更新結果，避免其影響 session
      const updatedUser = await User.update(id, updateData);
      console.log(`用戶 ${user.username} (ID: ${user.id}) 資料更新成功`);
      
      // 更新 session 資料（「只有」在管理員編輯自己的資料時才執行）
      const currentUserId = parseInt(req.session.user.id, 10);
      const editedUserId = parseInt(id, 10);
      
      if (currentUserId === editedUserId) {
        console.log('更新了自己的資料，需要更新 session');
        
        try {
          // 確保我們有完整的用戶資料
          if (!updatedUser || !updatedUser.id) {
            console.warn('更新成功但獲取的用戶資料不完整，嘗試重新獲取');
            const refreshedUser = await User.findById(editedUserId);
            if (!refreshedUser) {
              console.error('無法獲取更新後的用戶資料，保持原始 session');
            } else {
              // 更新 session 中的使用者資訊，但保留原始身份驗證狀態
              req.session.user = {
                id: refreshedUser.id,
                username: refreshedUser.username,
                email: refreshedUser.email,
                fullName: refreshedUser.fullName,
                role: refreshedUser.role,
                preferences: refreshedUser.preferences
              };
              console.log(`已更新 session 中的用戶資料`);
            }
          } else {
            // 直接使用 updatedUser
            req.session.user = {
              id: updatedUser.id,
              username: updatedUser.username,
              email: updatedUser.email,
              fullName: updatedUser.fullName,
              role: updatedUser.role,
              preferences: updatedUser.preferences
            };
            console.log(`已使用返回的數據更新 session 中的用戶資料`);
          }
        } catch (sessionErr) {
          console.error(`更新 session 時發生錯誤:`, sessionErr);
          // 繼續處理，不要中斷流程
        }
      } else {
        console.log('更新了其他使用者的資料，不更新 session');
      }
      
      req.flash('success', '使用者資料已成功更新');
      res.redirect('/users');
    } catch (updateErr) {
      console.error(`更新用戶時發生錯誤:`, updateErr);
      
      // 清理錯誤消息以顯示給用戶
      const errorMessage = updateErr.message || '更新用戶數據時發生未知錯誤';
      
      // 確保當前登入用戶訊息可用
      const currentUser = req.session.user || { id: 0, username: 'unknown' };
      
      res.render('pages/users/edit', {
        title: '編輯使用者',
        user,
        editUser: user,
        currentUser,
        error: `更新使用者資料時發生錯誤: ${errorMessage}`
      });
    }
  } catch (err) {
    console.error('查詢用戶或驗證時發生錯誤:', err);
    
    // 打印詳細的錯誤堆疊
    console.error(err.stack);
    
    // 確保當前登入用戶訊息可用
    const currentUser = req.session.user || { id: 0, username: 'unknown' };
    
    // 嘗試返回用戶編輯頁面，即使我們無法獲取原始用戶資料
    const editUserData = {
      id: req.params.id,
      username: req.body.username || '未知用戶',
      email: req.body.email || '',
      fullName: req.body.fullName || '',
      role: req.body.role || 'user'
    };
    
    res.render('pages/users/edit', {
      title: '編輯使用者',
      user: editUserData,
      editUser: editUserData,
      currentUser,
      error: '無法處理您的請求: ' + (err.message || '未知錯誤')
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