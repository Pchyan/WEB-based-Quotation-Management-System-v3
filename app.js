// 引入必要的模組
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const dotenv = require('dotenv');
const flash = require('express-flash');
const fs = require('fs');

// 載入環境變數
dotenv.config();

// 引入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const quoteRoutes = require('./routes/quotes');
const reportRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');

// 引入資料庫初始化
const { initDatabase } = require('./database/init');

// 初始化系統設置
require('./config/settings').init();

// 導入備份排程工具，確保系統啟動時初始化排程
const scheduler = require('./utils/scheduler');

// 建立 Express 應用程式
const app = express();

// 設定視圖引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 確保上傳目錄存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`建立上傳目錄: ${uploadsDir}`);
  } catch (err) {
    console.error(`無法建立上傳目錄: ${err.message}`);
  }
}

// 提供上傳目錄的存取
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 設定 Session
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.sqlite',
    dir: './database'
  }),
  secret: process.env.SESSION_SECRET || '報價系統安全密鑰',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 24小時
  }
}));

// 配置 Flash 訊息
app.use(flash());

// 設置全局變量和 locals
app.use((req, res, next) => {
  // 為所有頁面設置 user 資訊（會話用戶）
  res.locals.user = req.session.user || null;
  
  // 添加一個明確的 currentUser 變量，確保表示的是當前登入用戶
  res.locals.currentUser = req.session.user || null;
  
  // 重新添加其他全局變量
  res.locals.isAuthenticated = req.session.isAuthenticated || false;
  
  // 每次請求時讀取最新的環境變數，確保 APP_NAME 變更能立即生效
  res.locals.appName = process.env.APP_NAME || '報價管理系統';
  
  // 記錄請求資訊，便於調試
  const username = req.session.user ? req.session.user.username : '未登入用戶';
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - 用戶: ${username}`);
  next();
});

// 設定路由
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/customers', customerRoutes);
app.use('/products', productRoutes);
app.use('/quotes', quoteRoutes);
app.use('/reports', reportRoutes);
app.use('/admin', adminRoutes);
app.use('/backup', require('./routes/backup')); // 新增：備份管理路由

// 首頁路由
app.get('/', (req, res) => {
  if (!req.session.isAuthenticated) {
    return res.redirect('/auth/login');
  }
  res.render('pages/dashboard');
});

// 錯誤處理中間件
app.use((req, res, next) => {
  res.status(404).render('pages/error', {
    title: '找不到頁面',
    message: '您請求的頁面不存在'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('pages/error', {
    title: '伺服器錯誤',
    message: '伺服器發生錯誤，請稍後再試'
  });
});

// 初始化資料庫
initDatabase()
  .then(() => {
    // 啟動伺服器
    const port = process.env.PORT || 3001;
    const appName = process.env.APP_NAME || '報價管理系統';
    
    app.listen(port, () => {
      console.log(`${appName} 應用運行於 http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error('資料庫初始化失敗:', err);
    process.exit(1);
  }); 