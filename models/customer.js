const { getDb } = require('../database/init');

class Customer {
  constructor(id, name, contactPerson, email, phone, address, taxId, notes, createdAt, updatedAt, createdBy) {
    this.id = id;
    this.name = name;
    this.contactPerson = contactPerson;
    this.email = email;
    this.phone = phone;
    this.address = address;
    this.taxId = taxId;
    this.notes = notes;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.createdBy = createdBy;
  }

  // 取得所有客戶
  static getAll() {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all('SELECT * FROM customers ORDER BY name', [], (err, rows) => {
        if (err) {
          return reject(err);
        }
        const customers = rows.map(row => new Customer(
          row.id,
          row.name,
          row.contact_person,
          row.email,
          row.phone,
          row.address,
          row.tax_id,
          row.notes,
          row.created_at,
          row.updated_at,
          row.created_by
        ));
        resolve(customers);
      });
    });
  }

  // 根據ID取得客戶
  static findById(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        if (!row) {
          return resolve(null);
        }
        const customer = new Customer(
          row.id,
          row.name,
          row.contact_person,
          row.email,
          row.phone,
          row.address,
          row.tax_id,
          row.notes,
          row.created_at,
          row.updated_at,
          row.created_by
        );
        resolve(customer);
      });
    });
  }

  // 搜尋客戶
  static search(searchTerm) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const searchParam = `%${searchTerm}%`;
      db.all(
        `SELECT * FROM customers 
         WHERE name LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ? OR tax_id LIKE ?
         ORDER BY name`,
        [searchParam, searchParam, searchParam, searchParam, searchParam],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          const customers = rows.map(row => new Customer(
            row.id,
            row.name,
            row.contact_person,
            row.email,
            row.phone,
            row.address,
            row.tax_id,
            row.notes,
            row.created_at,
            row.updated_at,
            row.created_by
          ));
          resolve(customers);
        }
      );
    });
  }

  // 創建新客戶
  static create(customerData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      const now = new Date().toISOString();
      
      db.run(
        `INSERT INTO customers (name, contact_person, email, phone, address, tax_id, notes, created_at, updated_at, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerData.name,
          customerData.contactPerson,
          customerData.email,
          customerData.phone,
          customerData.address,
          customerData.taxId,
          customerData.notes,
          now,
          now,
          customerData.createdBy
        ],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          Customer.findById(this.lastID)
            .then(customer => resolve(customer))
            .catch(err => reject(err));
        }
      );
    });
  }

  // 更新客戶資料
  static update(id, customerData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      const now = new Date().toISOString();
      
      db.run(
        `UPDATE customers 
         SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, tax_id = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          customerData.name,
          customerData.contactPerson,
          customerData.email,
          customerData.phone,
          customerData.address,
          customerData.taxId,
          customerData.notes,
          now,
          id
        ],
        function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('客戶不存在或未更新任何資料'));
          }
          
          Customer.findById(id)
            .then(customer => resolve(customer))
            .catch(err => reject(err));
        }
      );
    });
  }

  // 刪除客戶
  static delete(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 檢查是否有關聯的報價單
      db.get('SELECT COUNT(*) as count FROM quotes WHERE customer_id = ?', [id], (err, row) => {
        if (err) {
          return reject(err);
        }
        
        if (row.count > 0) {
          return reject(new Error('無法刪除客戶，因為有關聯的報價單存在'));
        }
        
        // 執行刪除
        db.run('DELETE FROM customers WHERE id = ?', [id], function(err) {
          if (err) {
            return reject(err);
          }
          
          if (this.changes === 0) {
            return reject(new Error('客戶不存在'));
          }
          
          resolve(true);
        });
      });
    });
  }

  // 取得客戶的報價單
  static getQuotes(customerId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all(
        `SELECT q.*, u.username as created_by_username
         FROM quotes q
         JOIN users u ON q.created_by = u.id
         WHERE q.customer_id = ?
         ORDER BY q.issue_date DESC`,
        [customerId],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows);
        }
      );
    });
  }

  // 批量匯入客戶
  static bulkImport(customers) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const now = new Date().toISOString();
      let successCount = 0;
      let failedCount = 0;
      const failedItems = [];
      
      console.log(`開始批量匯入 ${customers.length} 筆客戶資料`);
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const stmt = db.prepare(`
          INSERT INTO customers (name, contact_person, email, phone, address, tax_id, notes, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        customers.forEach((customer, index) => {
          try {
            if (!customer.name) {
              failedCount++;
              failedItems.push({
                data: customer,
                reason: '客戶名稱不能為空'
              });
              console.warn(`第 ${index + 1} 筆資料匯入失敗: 客戶名稱不能為空`);
              return;
            }
            
            stmt.run(
              customer.name,
              customer.contactPerson || '',
              customer.email || '',
              customer.phone || '',
              customer.address || '',
              customer.taxId || '',
              customer.notes || '',
              customer.createdBy,
              now,
              now,
              function(err) {
                if (err) {
                  failedCount++;
                  failedItems.push({
                    data: customer,
                    reason: err.message
                  });
                  console.error(`第 ${index + 1} 筆資料匯入失敗: ${err.message}`);
                } else {
                  successCount++;
                  if (successCount % 10 === 0) {
                    console.log(`已成功匯入 ${successCount} 筆資料`);
                  }
                }
              }
            );
          } catch (err) {
            failedCount++;
            failedItems.push({
              data: customer,
              reason: err.message
            });
            console.error(`處理第 ${index + 1} 筆資料時發生錯誤: ${err.message}`);
          }
        });
        
        stmt.finalize();
        
        db.run('COMMIT', function(err) {
          if (err) {
            console.error(`提交事務時發生錯誤: ${err.message}`);
            db.run('ROLLBACK');
            return reject(err);
          }
          
          console.log(`批量匯入完成: 成功 ${successCount} 筆，失敗 ${failedCount} 筆`);
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

module.exports = Customer; 