const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

// 資料庫路徑
const dbPath = process.env.DB_PATH || path.join(__dirname, 'quotation.sqlite');

// 確保資料庫目錄存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 建立資料庫連接
const db = new sqlite3.Database(dbPath);

// 初始化資料庫
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 啟用外鍵約束
      db.run('PRAGMA foreign_keys = ON');

      // 建立使用者資料表
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        preferences TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) return reject(err);
      });

      // 建立客戶資料表
      db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        tax_id TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`, (err) => {
        if (err) return reject(err);
      });

      // 建立產品分類資料表
      db.run(`CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) return reject(err);
      });

      // 建立產品資料表
      db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        sku TEXT,
        price REAL NOT NULL,
        unit TEXT,
        category_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES product_categories(id)
      )`, (err) => {
        if (err) return reject(err);
      });

      // 建立報價單資料表
      db.run(`CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_number TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        issue_date DATE NOT NULL,
        valid_until DATE,
        status TEXT DEFAULT 'draft',
        subtotal REAL NOT NULL,
        discount_type TEXT,
        discount_value REAL,
        tax_rate REAL,
        tax_amount REAL,
        total REAL NOT NULL,
        notes TEXT,
        terms TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`, (err) => {
        if (err) return reject(err);
      });

      // 建立報價單項目資料表
      db.run(`CREATE TABLE IF NOT EXISTS quote_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL,
        product_id INTEGER,
        description TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        discount REAL DEFAULT 0,
        amount REAL NOT NULL,
        sort_order INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )`, (err) => {
        if (err) return reject(err);
      });

      // 建立報價單歷史記錄資料表
      db.run(`CREATE TABLE IF NOT EXISTS quote_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        status TEXT,
        user_id INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`, (err) => {
        if (err) return reject(err);
      });

      // 檢查是否需要創建管理員帳號
      db.get('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin'], (err, row) => {
        if (err) return reject(err);
        
        if (row.count === 0) {
          // 創建默認管理員帳號
          const salt = bcrypt.genSaltSync(10);
          const hashedPassword = bcrypt.hashSync('admin123', salt);
          
          db.run(`INSERT INTO users (username, password, email, full_name, role) 
                  VALUES (?, ?, ?, ?, ?)`, 
                  ['admin', hashedPassword, 'admin@example.com', '系統管理員', 'admin'], 
                  (err) => {
                    if (err) return reject(err);
                    console.log('已創建默認管理員帳號');
                  });
        }
      });

      // 檢查是否需要創建默認產品分類
      db.get('SELECT COUNT(*) as count FROM product_categories', [], (err, row) => {
        if (err) return reject(err);
        
        if (row.count === 0) {
          // 創建默認產品分類
          const categories = [
            ['商品', '實體商品'],
            ['服務', '服務項目'],
            ['耗材', '消耗性物品']
          ];
          
          const stmt = db.prepare('INSERT INTO product_categories (name, description) VALUES (?, ?)');
          categories.forEach(category => {
            stmt.run(category, (err) => {
              if (err) console.error('創建默認產品分類失敗:', err);
            });
          });
          stmt.finalize();
          console.log('已創建默認產品分類');
        }
      });

      resolve();
    });
  });
};

// 取得資料庫連接
const getDb = () => {
  return db;
};

module.exports = {
  initDatabase,
  getDb
}; 