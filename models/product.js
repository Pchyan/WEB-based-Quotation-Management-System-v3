const { getDb } = require('../database/init');

class Product {
  constructor(id, name, description, sku, price, unit, categoryId, createdAt, updatedAt) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.sku = sku;
    this.price = price;
    this.unit = unit;
    this.categoryId = categoryId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  // 取得所有產品
  static getAll() {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         ORDER BY p.name`,
        [],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          const products = rows.map(row => {
            const product = new Product(
              row.id,
              row.name,
              row.description,
              row.sku,
              row.price,
              row.unit,
              row.category_id,
              row.created_at,
              row.updated_at
            );
            product.categoryName = row.category_name;
            return product;
          });
          resolve(products);
        }
      );
    });
  }

  // 根據ID取得產品
  static findById(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.get(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.id = ?`,
        [id],
        (err, row) => {
          if (err) {
            return reject(err);
          }
          if (!row) {
            return resolve(null);
          }
          const product = new Product(
            row.id,
            row.name,
            row.description,
            row.sku,
            row.price,
            row.unit,
            row.category_id,
            row.created_at,
            row.updated_at
          );
          product.categoryName = row.category_name;
          resolve(product);
        }
      );
    });
  }

  // 根據分類取得產品
  static findByCategory(categoryId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.category_id = ?
         ORDER BY p.name`,
        [categoryId],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          const products = rows.map(row => {
            const product = new Product(
              row.id,
              row.name,
              row.description,
              row.sku,
              row.price,
              row.unit,
              row.category_id,
              row.created_at,
              row.updated_at
            );
            product.categoryName = row.category_name;
            return product;
          });
          resolve(products);
        }
      );
    });
  }

  // 搜尋產品
  static search(searchTerm) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const searchParam = `%${searchTerm}%`;
      db.all(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON p.category_id = pc.id
         WHERE p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?
         ORDER BY p.name`,
        [searchParam, searchParam, searchParam],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          const products = rows.map(row => {
            const product = new Product(
              row.id,
              row.name,
              row.description,
              row.sku,
              row.price,
              row.unit,
              row.category_id,
              row.created_at,
              row.updated_at
            );
            product.categoryName = row.category_name;
            return product;
          });
          resolve(products);
        }
      );
    });
  }

  // 創建新產品
  static create(productData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      const now = new Date().toISOString();
      
      db.run(
        `INSERT INTO products (name, description, sku, price, unit, category_id, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productData.name,
          productData.description,
          productData.sku,
          productData.price,
          productData.unit,
          productData.categoryId,
          now,
          now
        ],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          Product.findById(this.lastID)
            .then(product => resolve(product))
            .catch(err => reject(err));
        }
      );
    });
  }

  // 更新產品資料
  static update(id, productData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      const now = new Date().toISOString();
      
      db.run(
        `UPDATE products 
         SET name = ?, description = ?, sku = ?, price = ?, unit = ?, category_id = ?, updated_at = ?
         WHERE id = ?`,
        [
          productData.name,
          productData.description,
          productData.sku,
          productData.price,
          productData.unit,
          productData.categoryId,
          now,
          id
        ],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('產品不存在或未更新任何資料'));
          }
          
          Product.findById(id)
            .then(product => resolve(product))
            .catch(err => reject(err));
        }
      );
    });
  }

  /**
   * 刪除產品
   * @param {number} id - 產品ID
   * @returns {Promise<boolean>} - 是否刪除成功
   */
  static delete(id) {
    return new Promise((resolve, reject) => {
      console.log(`正在刪除產品，ID: ${id}`);
      
      // 先確認產品存在
      const db = getDb();
      db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
        if (err) {
          console.error('查詢產品失敗:', err);
          return reject(new Error('查詢產品時發生錯誤'));
        }
        
        if (!product) {
          console.error(`找不到ID為 ${id} 的產品`);
          return reject(new Error('找不到該產品'));
        }
        
        // 檢查產品是否已被使用在報價單項目中
        db.all('SELECT * FROM quote_items WHERE product_id = ? LIMIT 1', [id], (err, items) => {
          if (err) {
            console.error('檢查產品關聯項目失敗:', err);
            return reject(new Error('檢查產品使用情況時發生錯誤'));
          }
          
          if (items && items.length > 0) {
            console.error(`產品 ${id} 已被使用在報價單項目中，無法刪除`);
            return reject(new Error('產品已被使用在報價單中，無法刪除'));
          }
          
          // 執行刪除操作
          db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
            if (err) {
              console.error('刪除產品錯誤:', err);
              return reject(new Error('刪除產品時發生錯誤'));
            }
            
            if (this.changes === 0) {
              console.error(`刪除產品 ${id} 失敗，沒有記錄被刪除`);
              return reject(new Error('刪除產品失敗，請稍後再試'));
            }
            
            console.log(`產品 ${id} 刪除成功，影響行數: ${this.changes}`);
            resolve(true);
          });
        });
      });
    });
  }

  // 取得所有產品分類
  static getAllCategories() {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all('SELECT * FROM product_categories ORDER BY name', [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  // 創建新產品分類
  static createCategory(categoryData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      const now = new Date().toISOString();
      
      db.run(
        `INSERT INTO product_categories (name, description, created_at, updated_at) 
         VALUES (?, ?, ?, ?)`,
        [
          categoryData.name,
          categoryData.description,
          now,
          now
        ],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          db.get('SELECT * FROM product_categories WHERE id = ?', [this.lastID], (err, row) => {
            if (err) {
              return reject(err);
            }
            resolve(row);
          });
        }
      );
    });
  }

  // 更新產品分類
  static updateCategory(id, categoryData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      const now = new Date().toISOString();
      
      db.run(
        `UPDATE product_categories 
         SET name = ?, description = ?, updated_at = ?
         WHERE id = ?`,
        [
          categoryData.name,
          categoryData.description,
          now,
          id
        ],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('產品分類不存在或未更新任何資料'));
          }
          
          db.get('SELECT * FROM product_categories WHERE id = ?', [id], (err, row) => {
            if (err) {
              return reject(err);
            }
            resolve(row);
          });
        }
      );
    });
  }

  // 刪除產品分類
  static deleteCategory(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 檢查是否有關聯的產品
      db.get('SELECT COUNT(*) as count FROM products WHERE category_id = ?', [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        
        if (row.count > 0) {
          return reject(new Error('無法刪除產品分類，因為有關聯的產品存在'));
        }
        
        // 執行刪除
        db.run('DELETE FROM product_categories WHERE id = ?', [id], function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('產品分類不存在'));
          }
          
          resolve(true);
        });
      });
    });
  }

  // 批量匯入產品
  static bulkImport(products) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const now = new Date().toISOString();
      let successCount = 0;
      let failedCount = 0;
      const failedItems = [];
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const stmt = db.prepare(`
          INSERT INTO products (name, description, sku, price, unit, category_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        products.forEach((product) => {
          try {
            if (!product.name || product.price === undefined || isNaN(product.price)) {
              failedCount++;
              failedItems.push({
                data: product,
                reason: '產品名稱或價格無效'
              });
              return;
            }
            
            stmt.run(
              product.name,
              product.description || '',
              product.sku || '',
              product.price,
              product.unit || '',
              product.categoryId || null,
              now,
              now,
              function(err) {
                if (err) {
                  failedCount++;
                  failedItems.push({
                    data: product,
                    reason: err.message
                  });
                } else {
                  successCount++;
                }
              }
            );
          } catch (err) {
            failedCount++;
            failedItems.push({
              data: product,
              reason: err.message
            });
          }
        });
        
        stmt.finalize();
        
        db.run('COMMIT', function(err) {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          
          resolve({
            success: successCount,
            failed: failedCount,
            failedItems: failedItems
          });
        });
      });
    });
  }

  /**
   * 獲取使用此產品的報價單
   * @param {number} productId - 產品ID
   * @returns {Promise<Array>} - 報價單數組
   */
  static getQuotes(productId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all(
        `SELECT q.* FROM quotes q
         JOIN quote_items qi ON q.id = qi.quote_id
         WHERE qi.product_id = ?
         GROUP BY q.id
         ORDER BY q.issue_date DESC`,
        [productId],
        (err, rows) => {
          if (err) {
            console.error('獲取產品關聯報價單失敗:', err);
            return reject(err);
          }
          resolve(rows);
        }
      );
    });
  }
}

module.exports = Product; 