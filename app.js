// 引入必要的模組
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const dotenv = require('dotenv');

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

// 建立 Express 應用程式
const app = express();

// 設定視圖引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// 全域中間件
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = req.session.isAuthenticated || false;
  res.locals.appName = process.env.APP_NAME || '報價管理系統';
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