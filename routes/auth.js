const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const { isNotAuthenticated } = require('../middleware/auth');

const router = express.Router();

// 登入頁面
router.get('/login', isNotAuthenticated, (req, res) => {
  res.render('pages/auth/login', {
    title: '登入',
    error: null
  });
});

// 處理登入請求
router.post('/login', [
  body('username').trim().notEmpty().withMessage('請輸入使用者名稱'),
  body('password').notEmpty().withMessage('請輸入密碼')
], isNotAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/auth/login', {
      title: '登入',
      error: errors.array()[0].msg,
      username: req.body.username
    });
  }

  try {
    // 檢查使用者是否存在
    const user = await User.findByUsername(req.body.username);
    if (!user) {
      return res.render('pages/auth/login', {
        title: '登入',
        error: '使用者名稱或密碼錯誤',
        username: req.body.username
      });
    }

    // 驗證密碼
    const isValidPassword = User.verifyPassword(req.body.password, user.password);
    if (!isValidPassword) {
      return res.render('pages/auth/login', {
        title: '登入',
        error: '使用者名稱或密碼錯誤',
        username: req.body.username
      });
    }

    // 設定 session
    req.session.isAuthenticated = true;
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    };

    // 重定向到原始請求的URL或首頁
    const redirectUrl = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('登入錯誤:', err);
    res.render('pages/auth/login', {
      title: '登入',
      error: '登入時發生錯誤，請稍後再試',
      username: req.body.username
    });
  }
});

// 註冊頁面
router.get('/register', isNotAuthenticated, (req, res) => {
  res.render('pages/auth/register', {
    title: '註冊',
    error: null,
    user: {}
  });
});

// 處理註冊請求
router.post('/register', [
  body('username').trim().isLength({ min: 3 }).withMessage('使用者名稱至少需要3個字元'),
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址'),
  body('password').isLength({ min: 6 }).withMessage('密碼至少需要6個字元'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('密碼確認不匹配');
    }
    return true;
  }),
  body('fullName').trim().notEmpty().withMessage('請輸入全名')
], isNotAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/auth/register', {
      title: '註冊',
      error: errors.array()[0].msg,
      user: {
        username: req.body.username,
        email: req.body.email,
        fullName: req.body.fullName
      }
    });
  }

  try {
    // 檢查使用者名稱是否已存在
    const existingUsername = await User.findByUsername(req.body.username);
    if (existingUsername) {
      return res.render('pages/auth/register', {
        title: '註冊',
        error: '使用者名稱已被使用',
        user: {
          username: req.body.username,
          email: req.body.email,
          fullName: req.body.fullName
        }
      });
    }

    // 檢查電子郵件是否已存在
    const existingEmail = await User.findByEmail(req.body.email);
    if (existingEmail) {
      return res.render('pages/auth/register', {
        title: '註冊',
        error: '電子郵件已被使用',
        user: {
          username: req.body.username,
          email: req.body.email,
          fullName: req.body.fullName
        }
      });
    }

    // 創建新使用者
    const newUser = await User.create({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.fullName,
      role: 'user'
    });

    // 設定 session
    req.session.isAuthenticated = true;
    req.session.user = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      fullName: newUser.fullName,
      role: newUser.role
    };

    res.redirect('/');
  } catch (err) {
    console.error('註冊錯誤:', err);
    res.render('pages/auth/register', {
      title: '註冊',
      error: '註冊時發生錯誤，請稍後再試',
      user: {
        username: req.body.username,
        email: req.body.email,
        fullName: req.body.fullName
      }
    });
  }
});

// 登出
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('登出錯誤:', err);
    }
    res.redirect('/auth/login');
  });
});

module.exports = router; 