const { getDb } = require('../database/init');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

class User {
  constructor(id, username, password, email, fullName, role, preferences, resetToken, resetTokenExpiry, createdAt, updatedAt) {
    this.id = id;
    this.username = username;
    this.password = password;
    this.email = email;
    this.fullName = fullName;
    this.role = role;
    this.preferences = preferences ? JSON.parse(preferences) : null;
    this.resetToken = resetToken;
    this.resetTokenExpiry = resetTokenExpiry;
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
            row.reset_token,
            row.reset_token_expiry,
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
      // 檢查 ID 參數
      if (!id) {
        console.warn('findById 方法被調用時沒有提供 ID 參數');
        return resolve(null);
      }
      
      // 轉換為數字以確保一致性
      const userId = parseInt(id, 10);
      if (isNaN(userId)) {
        console.warn(`findById 方法接收到無效的 ID 格式: "${id}"`);
        return resolve(null);
      }
      
      console.log(`嘗試查找 ID 為 ${userId} 的用戶`);
      
      const db = getDb();
      if (!db) {
        console.error('無法獲取資料庫連接');
        return reject(new Error('資料庫連接失敗'));
      }
      
      // 先檢查 preferences 欄位是否存在
      db.all("PRAGMA table_info(users)", [], (err, rows) => {
        if (err) {
          console.error(`檢查資料表結構時出錯: ${err.message}`);
          return reject(err);
        }
        
        // 檢查 preferences 欄位是否存在
        const hasPreferences = rows.some(row => row.name === 'preferences');
        
        // 根據是否有 preferences 欄位構建查詢
        const query = hasPreferences 
          ? 'SELECT id, username, email, full_name, role, preferences, created_at, updated_at FROM users WHERE id = ?'
          : 'SELECT id, username, email, full_name, role, created_at, updated_at FROM users WHERE id = ?';
        
        console.log(`執行查詢: ${query} 參數: [${userId}]`);
        
        db.get(query, [userId], (err, row) => {
          if (err) {
            console.error(`查詢用戶時出錯: ${err.message}`);
            return reject(err);
          }
          if (!row) {
            console.warn(`未找到 ID 為 ${userId} 的用戶`);
            return resolve(null);
          }
          
          try {
            const user = new User(
              row.id,
              row.username,
              null, // 不返回密碼
              row.email,
              row.full_name,
              row.role,
              hasPreferences ? row.preferences : null,
              row.reset_token,
              row.reset_token_expiry,
              row.created_at,
              row.updated_at
            );
            console.log(`成功找到用戶: ${user.username} (ID: ${user.id})`);
            resolve(user);
          } catch (parseErr) {
            console.error(`解析用戶資料時出錯: ${parseErr.message}`);
            reject(new Error(`解析用戶資料失敗: ${parseErr.message}`));
          }
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
            row.reset_token,
            row.reset_token_expiry,
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
            row.reset_token,
            row.reset_token_expiry,
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
      
      // 檢查 ID 參數
      if (!id) {
        return reject(new Error('缺少使用者 ID 參數'));
      }
      
      // 轉換為數字以確保一致性
      const userId = parseInt(id, 10);
      if (isNaN(userId)) {
        return reject(new Error('使用者 ID 格式無效'));
      }
      
      // 初始檢查：確保至少有一個欄位被更新
      if (!userData || Object.keys(userData).length === 0) {
        return reject(new Error('沒有提供任何要更新的欄位'));
      }
      
      // 檢查是否需要更新密碼
      if (userData.password) {
        try {
          const salt = bcrypt.genSaltSync(10);
          userData.password = bcrypt.hashSync(userData.password, salt);
        } catch (err) {
          return reject(new Error(`密碼加密失敗: ${err.message}`));
        }
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
      params.push(userId);
      
      if (updateFields.length <= 1) {
        return reject(new Error('沒有提供任何有效的欄位來更新'));
      }
      
      const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
      console.log(`執行更新查詢: ${query}`);
      console.log(`參數: ${JSON.stringify(params)}`);
      
      db.run(query, params, function(err) {
        if (err) {
          console.error(`資料庫更新錯誤: ${err.message}`, err);
          return reject(new Error(`資料庫更新失敗: ${err.message}`));
        }
        
        if (this.changes === 0) {
          console.warn(`未找到 ID 為 ${userId} 的用戶或未更新任何資料`);
          return reject(new Error('使用者不存在或未更新任何資料'));
        }
        
        console.log(`成功更新 ID 為 ${userId} 的用戶資料，影響行數: ${this.changes}`);
        
        // 嘗試獲取更新後的使用者資料
        User.findById(userId)
          .then(user => {
            if (!user) {
              console.error(`無法找到剛剛更新的用戶: ${userId}`);
              return reject(new Error('更新成功但無法獲取更新後的用戶資料'));
            }
            resolve(user);
          })
          .catch(findErr => {
            console.error(`獲取更新後的用戶資料失敗: ${findErr.message}`);
            // 更新成功但獲取失敗，仍然返回成功
            resolve({ id: userId, updated: true });
          });
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

  // 生成密碼重設令牌
  static generateResetToken(email) {
    return new Promise(async (resolve, reject) => {
      try {
        // 檢查電子郵件是否存在
        const user = await this.findByEmail(email);
        if (!user) {
          return resolve({ success: false, message: '找不到此電子郵件對應的帳號' });
        }

        const db = getDb();
        
        // 生成隨機令牌
        const token = crypto.randomBytes(32).toString('hex');
        // 設置過期時間（1小時後）
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 1);
        
        // 確保 reset_token 和 reset_token_expiry 欄位存在
        db.all("PRAGMA table_info(users)", [], (err, rows) => {
          if (err) {
            return reject(err);
          }
          
          const hasResetToken = rows.some(row => row.name === 'reset_token');
          const hasResetTokenExpiry = rows.some(row => row.name === 'reset_token_expiry');
          
          const alterTablePromises = [];
          
          if (!hasResetToken) {
            alterTablePromises.push(
              new Promise((resolve, reject) => {
                db.run("ALTER TABLE users ADD COLUMN reset_token TEXT", [], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              })
            );
          }
          
          if (!hasResetTokenExpiry) {
            alterTablePromises.push(
              new Promise((resolve, reject) => {
                db.run("ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME", [], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              })
            );
          }
          
          Promise.all(alterTablePromises)
            .then(() => {
              // 更新使用者的令牌信息
              db.run(
                'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
                [token, tokenExpiry.toISOString(), email],
                function(err) {
                  if (err) {
                    console.error('更新重設令牌時發生錯誤:', err);
                    return reject(err);
                  }
                  
                  if (this.changes === 0) {
                    return resolve({ success: false, message: '更新令牌失敗' });
                  }
                  
                  resolve({ 
                    success: true, 
                    userId: user.id,
                    email: user.email,
                    token: token,
                    expires: tokenExpiry
                  });
                }
              );
            })
            .catch(err => {
              console.error('添加重設令牌欄位時發生錯誤:', err);
              reject(err);
            });
        });
      } catch (err) {
        console.error('生成重設令牌時發生錯誤:', err);
        reject(err);
      }
    });
  }

  // 驗證重設令牌
  static verifyResetToken(token) {
    return new Promise((resolve, reject) => {
      if (!token) {
        return resolve(null);
      }
      
      const db = getDb();
      
      const now = new Date().toISOString();
      
      db.get(
        'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
        [token, now],
        (err, row) => {
          if (err) {
            console.error('驗證重設令牌時發生錯誤:', err);
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
            row.preferences,
            row.reset_token,
            row.reset_token_expiry,
            row.created_at,
            row.updated_at
          );
          
          resolve(user);
        }
      );
    });
  }

  // 重設密碼
  static resetPassword(token, newPassword) {
    return new Promise(async (resolve, reject) => {
      try {
        // 驗證令牌
        const user = await this.verifyResetToken(token);
        
        if (!user) {
          return resolve({ success: false, message: '無效或已過期的重設令牌' });
        }
        
        const db = getDb();
        
        // 密碼加密
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(newPassword, salt);
        
        // 更新密碼並清除重設令牌
        db.run(
          'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL, updated_at = ? WHERE id = ?',
          [hashedPassword, new Date().toISOString(), user.id],
          function(err) {
            if (err) {
              console.error('重設密碼時發生錯誤:', err);
              return reject(err);
            }
            
            if (this.changes === 0) {
              return resolve({ success: false, message: '重設密碼失敗' });
            }
            
            resolve({ success: true, message: '密碼已成功重設' });
          }
        );
      } catch (err) {
        console.error('重設密碼時發生錯誤:', err);
        reject(err);
      }
    });
  }
}

module.exports = User; 