const { getDb } = require('../database/init');
const bcrypt = require('bcryptjs');

class User {
  constructor(id, username, password, email, fullName, role, preferences, createdAt, updatedAt) {
    this.id = id;
    this.username = username;
    this.password = password;
    this.email = email;
    this.fullName = fullName;
    this.role = role;
    this.preferences = preferences ? JSON.parse(preferences) : null;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  // 取得所有使用者
  static getAll() {
    return new Promise((resolve, reject) => {
      const db = getDb();
      // 先檢查 preferences 欄位是否存在
      db.all("PRAGMA table_info(users)", [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        
        // 檢查 preferences 欄位是否存在
        const hasPreferences = rows.some(row => row.name === 'preferences');
        
        // 根據是否有 preferences 欄位構建查詢
        const query = hasPreferences 
          ? 'SELECT id, username, email, full_name, role, preferences, created_at, updated_at FROM users'
          : 'SELECT id, username, email, full_name, role, created_at, updated_at FROM users';
        
        db.all(query, [], (err, rows) => {
          if (err) {
            return reject(err);
          }
          const users = rows.map(row => new User(
            row.id,
            row.username,
            null, // 不返回密碼
            row.email,
            row.full_name,
            row.role,
            hasPreferences ? row.preferences : null,
            row.created_at,
            row.updated_at
          ));
          resolve(users);
        });
      });
    });
  }

  // 根據ID取得使用者
  static findById(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      // 先檢查 preferences 欄位是否存在
      db.all("PRAGMA table_info(users)", [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        
        // 檢查 preferences 欄位是否存在
        const hasPreferences = rows.some(row => row.name === 'preferences');
        
        // 根據是否有 preferences 欄位構建查詢
        const query = hasPreferences 
          ? 'SELECT id, username, email, full_name, role, preferences, created_at, updated_at FROM users WHERE id = ?'
          : 'SELECT id, username, email, full_name, role, created_at, updated_at FROM users WHERE id = ?';
        
        db.get(query, [id], (err, row) => {
          if (err) {
            return reject(err);
          }
          if (!row) {
            return resolve(null);
          }
          const user = new User(
            row.id,
            row.username,
            null, // 不返回密碼
            row.email,
            row.full_name,
            row.role,
            hasPreferences ? row.preferences : null,
            row.created_at,
            row.updated_at
          );
          resolve(user);
        });
      });
    });
  }

  // 根據使用者名稱取得使用者
  static findByUsername(username) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      // 先檢查 preferences 欄位是否存在
      db.all("PRAGMA table_info(users)", [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        
        // 檢查 preferences 欄位是否存在
        const hasPreferences = rows.some(row => row.name === 'preferences');
        
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
          if (err) {
            return reject(err);
          }
          if (!row) {
            return resolve(null);
          }
          const user = new User(
            row.id,
            row.username,
            row.password,
            row.email,
            row.full_name,
            row.role,
            hasPreferences && row.preferences ? row.preferences : null,
            row.created_at,
            row.updated_at
          );
          resolve(user);
        });
      });
    });
  }

  // 根據電子郵件取得使用者
  static findByEmail(email) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      // 先檢查 preferences 欄位是否存在
      db.all("PRAGMA table_info(users)", [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        
        // 檢查 preferences 欄位是否存在
        const hasPreferences = rows.some(row => row.name === 'preferences');
        
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
          if (err) {
            return reject(err);
          }
          if (!row) {
            return resolve(null);
          }
          const user = new User(
            row.id,
            row.username,
            row.password,
            row.email,
            row.full_name,
            row.role,
            hasPreferences && row.preferences ? row.preferences : null,
            row.created_at,
            row.updated_at
          );
          resolve(user);
        });
      });
    });
  }

  // 創建新使用者
  static create(userData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 密碼加密
      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync(userData.password, salt);
      
      const now = new Date().toISOString();
      
      db.run(
        `INSERT INTO users (username, password, email, full_name, role, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userData.username,
          hashedPassword,
          userData.email,
          userData.fullName,
          userData.role || 'user',
          now,
          now
        ],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          User.findById(this.lastID)
            .then(user => resolve(user))
            .catch(err => reject(err));
        }
      );
    });
  }

  // 更新使用者資料
  static update(id, userData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 檢查是否需要更新密碼
      if (userData.password) {
        const salt = bcrypt.genSaltSync(10);
        userData.password = bcrypt.hashSync(userData.password, salt);
      }
      
      const now = new Date().toISOString();
      
      // 建立更新欄位和參數
      let updateFields = [];
      let params = [];
      
      if (userData.username) {
        updateFields.push('username = ?');
        params.push(userData.username);
      }
      
      if (userData.password) {
        updateFields.push('password = ?');
        params.push(userData.password);
      }
      
      if (userData.email) {
        updateFields.push('email = ?');
        params.push(userData.email);
      }
      
      if (userData.fullName) {
        updateFields.push('full_name = ?');
        params.push(userData.fullName);
      }
      
      if (userData.role) {
        updateFields.push('role = ?');
        params.push(userData.role);
      }
      
      updateFields.push('updated_at = ?');
      params.push(now);
      
      // 加入ID參數
      params.push(id);
      
      const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
      
      db.run(query, params, function(err) {
        if (err) {
          return reject(err);
        }
        
        if (this.changes === 0) {
          return reject(new Error('使用者不存在或未更新任何資料'));
        }
        
        User.findById(id)
          .then(user => resolve(user))
          .catch(err => reject(err));
      });
    });
  }

  // 刪除使用者
  static delete(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
        if (err) {
          return reject(err);
        }
        
        if (this.changes === 0) {
          return reject(new Error('使用者不存在'));
        }
        
        resolve(true);
      });
    });
  }

  // 驗證密碼
  static verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  }

  // 更新使用者偏好設定
  static updatePreferences(id, preferencesData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const now = new Date().toISOString();
      
      // 先檢查 preferences 欄位是否存在
      db.all("PRAGMA table_info(users)", [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        
        // 檢查 preferences 欄位是否存在
        const hasPreferences = rows.some(row => row.name === 'preferences');
        
        if (!hasPreferences) {
          // 如果欄位不存在，則添加該欄位
          db.run("ALTER TABLE users ADD COLUMN preferences TEXT", [], (alterErr) => {
            if (alterErr) {
              return reject(alterErr);
            }
            
            // 欄位添加成功後繼續執行更新操作
            this.updatePreferencesInternal(db, id, preferencesData, now)
              .then(updatedUser => resolve(updatedUser))
              .catch(err => reject(err));
          });
        } else {
          // 欄位已存在，直接執行更新操作
          this.updatePreferencesInternal(db, id, preferencesData, now)
            .then(updatedUser => resolve(updatedUser))
            .catch(err => reject(err));
        }
      });
    });
  }
  
  // 內部方法，用於更新使用者偏好設定
  static updatePreferencesInternal(db, id, preferencesData, now) {
    return new Promise((resolve, reject) => {
      // 先取得現有使用者
      this.findById(id)
        .then(user => {
          if (!user) {
            return reject(new Error('使用者不存在'));
          }
          
          // 合併現有偏好設定與新的偏好設定
          let currentPreferences = {};
          
          // 確保 user.preferences 是一個有效的物件
          if (user.preferences) {
            try {
              // 如果已經是物件，則直接使用
              if (typeof user.preferences === 'object' && user.preferences !== null) {
                currentPreferences = user.preferences;
              } 
              // 如果是字符串，嘗試解析
              else if (typeof user.preferences === 'string') {
                currentPreferences = JSON.parse(user.preferences);
              }
            } catch (e) {
              console.error('解析偏好設定時發生錯誤:', e);
              // 解析錯誤，使用空物件
              currentPreferences = {};
            }
          }
          
          const newPreferences = JSON.stringify({
            ...currentPreferences,
            ...preferencesData
          });
          
          // 更新資料庫
          db.run(
            'UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?',
            [newPreferences, now, id],
            function(err) {
              if (err) {
                return reject(err);
              }
              
              // 重新取得使用者以返回更新後的資料
              User.findById(id)
                .then(updatedUser => resolve(updatedUser))
                .catch(err => reject(err));
            }
          );
        })
        .catch(err => reject(err));
    });
  }
}

module.exports = User; 