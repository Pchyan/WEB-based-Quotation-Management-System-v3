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

  // 刪除產品
  static delete(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 檢查是否有關聯的報價單項目
      db.get('SELECT COUNT(*) as count FROM quote_items WHERE product_id = ?', [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        
        if (row.count > 0) {
          return reject(new Error('無法刪除產品，因為有關聯的報價單項目存在'));
        }
        
        // 執行刪除
        db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('產品不存在'));
          }
          
          resolve(true);
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
}

module.exports = Product; 