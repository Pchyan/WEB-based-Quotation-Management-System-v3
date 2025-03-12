const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const { isNotAuthenticated } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// 載入環境變數
dotenv.config();

const router = express.Router();

// 設定郵件發送器
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'Gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASSWORD || 'your-password'
  }
});

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

// 忘記密碼頁面
router.get('/forgot-password', isNotAuthenticated, (req, res) => {
  console.log('訪問忘記密碼頁面');
  res.render('pages/auth/forgot-password', {
    title: '忘記密碼',
    error: null,
    success: null
  });
});

// 處理忘記密碼請求
router.post('/forgot-password', [
  body('email').isEmail().withMessage('請輸入有效的電子郵件地址')
], isNotAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/auth/forgot-password', {
      title: '忘記密碼',
      error: errors.array()[0].msg,
      success: null
    });
  }

  try {
    const { email } = req.body;
    
    // 生成重設令牌
    const result = await User.generateResetToken(email);
    
    if (!result.success) {
      // 即使找不到用戶，也返回成功訊息（安全措施）
      return res.render('pages/auth/forgot-password', {
        title: '忘記密碼',
        error: null,
        success: '如果此電子郵件存在於我們的系統中，您將收到密碼重設連結'
      });
    }

    // 構建重設 URL
    const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${result.token}`;
    
    // 準備發送重設郵件
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: email,
      subject: '密碼重設請求',
      html: `
        <h1>密碼重設請求</h1>
        <p>親愛的用戶：</p>
        <p>我們收到了重設您密碼的請求。如果您沒有要求重設密碼，請忽略此郵件。</p>
        <p>點擊下面的連結重設您的密碼。此連結將在一小時內有效：</p>
        <p><a href="${resetUrl}" target="_blank">重設您的密碼</a></p>
        <p>或複製此連結到瀏覽器：</p>
        <p>${resetUrl}</p>
        <p>謝謝</p>
        <p>報價管理系統團隊</p>
      `
    };

    if (process.env.EMAIL_ENABLED === 'true') {
      // 如果郵件配置啟用，發送郵件
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('發送郵件錯誤:', error);
        } else {
          console.log('郵件已發送:', info.response);
        }
      });
    } else {
      // 如果未啟用郵件功能，將重設連結記錄到控制台（開發環境使用）
      console.log('==== 重設密碼連結 ====');
      console.log(resetUrl);
      console.log('========================');
    }

    // 返回成功訊息
    res.render('pages/auth/forgot-password', {
      title: '忘記密碼',
      error: null,
      success: '如果此電子郵件存在於我們的系統中，您將收到密碼重設連結'
    });
  } catch (err) {
    console.error('處理忘記密碼請求時發生錯誤:', err);
    res.render('pages/auth/forgot-password', {
      title: '忘記密碼',
      error: '處理請求時發生錯誤，請稍後再試',
      success: null
    });
  }
});

// 密碼重設頁面
router.get('/reset-password/:token', isNotAuthenticated, async (req, res) => {
  try {
    const { token } = req.params;
    
    // 驗證令牌
    const user = await User.verifyResetToken(token);
    
    if (!user) {
      return res.render('pages/auth/reset-password', {
        title: '重設密碼',
        error: '無效或已過期的重設連結',
        token: null
      });
    }
    
    res.render('pages/auth/reset-password', {
      title: '重設密碼',
      error: null,
      token
    });
  } catch (err) {
    console.error('顯示密碼重設頁面時發生錯誤:', err);
    res.render('pages/auth/reset-password', {
      title: '重設密碼',
      error: '處理請求時發生錯誤，請稍後再試',
      token: null
    });
  }
});

// 處理密碼重設
router.post('/reset-password/:token', [
  body('password').isLength({ min: 6 }).withMessage('密碼至少需要6個字元'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('密碼確認不匹配');
    }
    return true;
  })
], isNotAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/auth/reset-password', {
      title: '重設密碼',
      error: errors.array()[0].msg,
      token: req.params.token
    });
  }

  try {
    const { token } = req.params;
    const { password } = req.body;
    
    // 重設密碼
    const result = await User.resetPassword(token, password);
    
    if (!result.success) {
      return res.render('pages/auth/reset-password', {
        title: '重設密碼',
        error: result.message,
        token
      });
    }
    
    // 重定向到登入頁面，顯示成功訊息
    req.flash('success', '密碼已成功重設，請使用新密碼登入');
    res.redirect('/auth/login');
  } catch (err) {
    console.error('重設密碼時發生錯誤:', err);
    res.render('pages/auth/reset-password', {
      title: '重設密碼',
      error: '重設密碼時發生錯誤，請稍後再試',
      token: req.params.token
    });
  }
});

module.exports = router; 