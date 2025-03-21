const { getDb } = require('../database/init');

class Quote {
  constructor(id, quoteNumber, customerId, title, description, issueDate, validUntil, status, 
              subtotal, discountType, discountValue, taxRate, taxAmount, total, notes, terms, 
              createdBy, createdAt, updatedAt) {
    this.id = id;
    this.quoteNumber = quoteNumber;
    this.customerId = customerId;
    this.title = title;
    this.description = description;
    this.issueDate = issueDate;
    this.validUntil = validUntil;
    this.status = status;
    this.subtotal = subtotal;
    this.discountType = discountType;
    this.discountValue = discountValue;
    this.taxRate = taxRate;
    this.taxAmount = taxAmount;
    this.total = total;
    this.notes = notes;
    this.terms = terms;
    this.createdBy = createdBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  // 取得所有報價單
  static getAll() {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all(
        `SELECT q.*, c.name as customer_name, u.username as created_by_username
         FROM quotes q
         JOIN customers c ON q.customer_id = c.id
         JOIN users u ON q.created_by = u.id
         ORDER BY q.issue_date DESC`,
        [],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows);
        }
      );
    });
  }

  // 根據ID取得報價單
  static findById(id) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.get(
        `SELECT q.*, c.name as customer_name, u.username as created_by_username
         FROM quotes q
         JOIN customers c ON q.customer_id = c.id
         JOIN users u ON q.created_by = u.id
         WHERE q.id = ?`,
        [id],
        (err, row) => {
          if (err) {
            return reject(err);
          }
          if (!row) {
            return resolve(null);
          }
          resolve(row);
        }
      );
    });
  }

  // 根據報價單號碼取得報價單
  static findByQuoteNumber(quoteNumber) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.get(
        `SELECT q.*, c.name as customer_name, u.username as created_by_username
         FROM quotes q
         JOIN customers c ON q.customer_id = c.id
         JOIN users u ON q.created_by = u.id
         WHERE q.quote_number = ?`,
        [quoteNumber],
        (err, row) => {
          if (err) {
            return reject(err);
          }
          if (!row) {
            return resolve(null);
          }
          resolve(row);
        }
      );
    });
  }

  // 獲取報價單項目
  static getItems(quoteId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      console.log(`獲取報價單 ID: ${quoteId} 的所有項目`);
      
      db.all(
        `SELECT qi.*, p.name as product_name, p.sku as product_sku 
         FROM quote_items qi
         LEFT JOIN products p ON qi.product_id = p.id
         WHERE qi.quote_id = ?
         ORDER BY qi.sort_order ASC`,
        [quoteId],
        (err, rows) => {
          if (err) {
            console.error(`獲取報價單項目時出錯:`, err);
            return reject(err);
          }
          
          console.log(`成功獲取 ${rows.length} 個報價單項目`);
          console.log('第一個項目數據結構:', rows.length > 0 ? JSON.stringify(rows[0]) : '無項目');
          
          // 處理項目數據
          const items = rows.map(item => {
            return {
              id: item.id,
              quote_id: item.quote_id,
              product_id: item.product_id,
              name: item.name || item.product_name || '未命名項目',
              description: item.description,
              price: parseFloat(item.unit_price) || 0,
              quantity: parseFloat(item.quantity) || 0,
              unit: item.unit || '個',
              discount: parseFloat(item.discount) || 0,
              amount: parseFloat(item.amount) || 0,
              item_order: item.sort_order || 0,
              product_sku: item.product_sku
            };
          });
          
          resolve(items);
        }
      );
    });
  }

  // 搜尋報價單
  static search(searchTerm, status, startDate, endDate) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      let sql = `
        SELECT q.*, c.name as customer_name, u.username as created_by_username
        FROM quotes q
        JOIN customers c ON q.customer_id = c.id
        JOIN users u ON q.created_by = u.id
        WHERE 1=1
      `;
      
      const params = [];
      
      // 添加關鍵字搜尋條件
      if (searchTerm) {
        const searchParam = `%${searchTerm}%`;
        sql += ` AND (q.quote_number LIKE ? OR q.title LIKE ? OR c.name LIKE ?)`;
        params.push(searchParam, searchParam, searchParam);
      }
      
      // 添加狀態篩選條件
      if (status) {
        sql += ` AND q.status = ?`;
        params.push(status);
      }
      
      // 添加日期範圍篩選條件
      if (startDate) {
        sql += ` AND q.issue_date >= ?`;
        params.push(startDate);
      }
      
      if (endDate) {
        sql += ` AND q.issue_date <= ?`;
        params.push(endDate);
      }
      
      sql += ` ORDER BY q.issue_date DESC`;
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('搜尋報價單錯誤:', err);
          return reject(err);
        }
        resolve(rows);
      });
    });
  }

  // 生成新的報價單號碼
  static generateQuoteNumber() {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const year = new Date().getFullYear();
      const prefix = `QT-${year}-`;
      
      db.get(
        `SELECT quote_number FROM quotes 
         WHERE quote_number LIKE ? 
         ORDER BY id DESC LIMIT 1`,
        [`${prefix}%`],
        (err, row) => {
          if (err) {
            return reject(err);
          }
          
          let nextNumber = 1;
          if (row) {
            const lastNumber = parseInt(row.quote_number.split('-')[2]);
            nextNumber = lastNumber + 1;
          }
          
          // 格式化為四位數字
          const formattedNumber = nextNumber.toString().padStart(4, '0');
          resolve(`${prefix}${formattedNumber}`);
        }
      );
    });
  }

  // 創建新報價單
  static create(quoteData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 開始交易
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const now = new Date().toISOString();
        
        // 確保數據有效
        const safeQuoteData = {
          quoteNumber: quoteData.quoteNumber || `QT-${Date.now()}`,
          customerId: quoteData.customerId,
          title: quoteData.title || `報價單 ${quoteData.quoteNumber || ''}`,
          description: quoteData.description || '',
          issueDate: quoteData.issueDate || now.split('T')[0],
          validUntil: quoteData.validUntil || '',
          status: quoteData.status || 'draft',
          subtotal: quoteData.subtotal || 0,
          discountType: quoteData.discountType || null,
          discountValue: quoteData.discountValue || 0,
          taxRate: quoteData.taxRate || 0,
          taxAmount: quoteData.taxAmount || 0,
          total: quoteData.total || 0,
          notes: quoteData.notes || '',
          terms: quoteData.terms || '',
          createdBy: quoteData.createdBy,
          items: quoteData.items || []
        };
        
        console.log('===== 開始創建報價單 =====');
        console.log('報價單號:', safeQuoteData.quoteNumber);
        console.log('客戶 ID:', safeQuoteData.customerId);
        
        // 插入報價單主表
        db.run(
          `INSERT INTO quotes (
            quote_number, customer_id, title, description, issue_date, valid_until, 
            status, subtotal, discount_type, discount_value, tax_rate, tax_amount, 
            total, notes, terms, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            safeQuoteData.quoteNumber,
            safeQuoteData.customerId,
            safeQuoteData.title,
            safeQuoteData.description,
            safeQuoteData.issueDate,
            safeQuoteData.validUntil,
            safeQuoteData.status,
            safeQuoteData.subtotal,
            safeQuoteData.discountType,
            safeQuoteData.discountValue,
            safeQuoteData.taxRate,
            safeQuoteData.taxAmount,
            safeQuoteData.total,
            safeQuoteData.notes,
            safeQuoteData.terms,
            safeQuoteData.createdBy,
            now,
            now
          ],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            const quoteId = this.lastID;
            
            // 如果沒有項目，直接提交
            if (!safeQuoteData.items || safeQuoteData.items.length === 0) {
              db.run('COMMIT');
              Quote.findById(quoteId)
                .then(quote => resolve(quote))
                .catch(err => {
                  console.error('創建後查找報價單時出錯:', err);
                  // 仍然將它視為成功，但返回基本資訊
                  resolve({
                    id: quoteId,
                    quote_number: safeQuoteData.quoteNumber,
                    customer_id: safeQuoteData.customerId,
                    status: safeQuoteData.status || 'draft'
                  });
                });
              return;
            }
            
            // 插入報價單項目
            const stmt = db.prepare(
              `INSERT INTO quote_items (
                quote_id, product_id, description, quantity, unit_price, 
                discount, amount, sort_order, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            
            let itemsProcessed = 0;
            let hasError = false;
            
            safeQuoteData.items.forEach((item, index) => {
              stmt.run(
                [
                  quoteId,
                  item.productId,
                  item.description,
                  item.quantity,
                  item.unitPrice,
                  item.discount || 0,
                  item.amount,
                  index + 1,
                  now,
                  now
                ],
                function(err) {
                  itemsProcessed++;
                  
                  if (err && !hasError) {
                    hasError = true;
                    db.run('ROLLBACK');
                    stmt.finalize();
                    return reject(err);
                  }
                  
                  // 所有項目處理完成
                  if (itemsProcessed === safeQuoteData.items.length && !hasError) {
                    stmt.finalize();
                    
                    // 記錄歷史
                    db.run(
                      `INSERT INTO quote_history (
                        quote_id, action, status, user_id, timestamp, notes
                      ) VALUES (?, ?, ?, ?, ?, ?)`,
                      [
                        quoteId,
                        'create',
                        safeQuoteData.status,
                        safeQuoteData.createdBy,
                        now,
                        '報價單已創建'
                      ],
                      function(err) {
                        if (err) {
                          db.run('ROLLBACK');
                          return reject(err);
                        }
                        
                        db.run('COMMIT');
                        Quote.findById(quoteId)
                          .then(quote => resolve(quote))
                          .catch(err => {
                            console.error('創建後查找報價單時出錯:', err);
                            // 仍然將它視為成功，但返回基本資訊
                            resolve({
                              id: quoteId,
                              quote_number: safeQuoteData.quoteNumber,
                              customer_id: safeQuoteData.customerId,
                              status: safeQuoteData.status || 'draft'
                            });
                          });
                      }
                    );
                  }
                }
              );
            });
          }
        );
      });
    });
  }

  // 更新報價單
  static update(id, quoteData) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 開始交易
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const now = new Date().toISOString();
        
        // 更新報價單主表
        db.run(
          `UPDATE quotes SET
            customer_id = ?, title = ?, description = ?, issue_date = ?, valid_until = ?, 
            status = ?, subtotal = ?, discount_type = ?, discount_value = ?, tax_rate = ?, 
            tax_amount = ?, total = ?, notes = ?, terms = ?, updated_at = ?
           WHERE id = ?`,
          [
            quoteData.customerId,
            quoteData.title,
            quoteData.description,
            quoteData.issueDate,
            quoteData.validUntil,
            quoteData.status,
            quoteData.subtotal,
            quoteData.discountType,
            quoteData.discountValue,
            quoteData.taxRate,
            quoteData.taxAmount,
            quoteData.total,
            quoteData.notes,
            quoteData.terms,
            now,
            id
          ],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            if (this.changes === 0) {
              db.run('ROLLBACK');
              return reject(new Error('報價單不存在或未更新任何資料'));
            }
            
            // 如果沒有項目更新，直接提交
            if (!quoteData.items) {
              db.run('COMMIT');
              Quote.findById(id)
                .then(quote => resolve(quote))
                .catch(err => {
                  db.run('ROLLBACK');
                  reject(err);
                });
              return;
            }
            
            // 刪除現有項目
            db.run('DELETE FROM quote_items WHERE quote_id = ?', [id], function(err) {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              // 如果沒有新項目，直接提交
              if (quoteData.items.length === 0) {
                db.run('COMMIT');
                Quote.findById(id)
                  .then(quote => resolve(quote))
                  .catch(err => {
                    db.run('ROLLBACK');
                    reject(err);
                  });
                return;
              }
              
              // 插入新項目
              const stmt = db.prepare(
                `INSERT INTO quote_items (
                  quote_id, product_id, description, quantity, unit_price, 
                  discount, amount, sort_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              );
              
              let itemsProcessed = 0;
              let hasError = false;
              
              quoteData.items.forEach((item, index) => {
                stmt.run(
                  [
                    id,
                    item.productId,
                    item.description,
                    item.quantity,
                    item.unitPrice,
                    item.discount || 0,
                    item.amount,
                    index + 1,
                    now,
                    now
                  ],
                  function(err) {
                    itemsProcessed++;
                    
                    if (err && !hasError) {
                      hasError = true;
                      db.run('ROLLBACK');
                      stmt.finalize();
                      return reject(err);
                    }
                    
                    // 所有項目處理完成
                    if (itemsProcessed === quoteData.items.length && !hasError) {
                      stmt.finalize();
                      
                      // 記錄歷史
                      db.run(
                        `INSERT INTO quote_history (
                          quote_id, action, status, user_id, timestamp, notes
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                          id,
                          'update',
                          quoteData.status,
                          quoteData.userId,
                          now,
                          '報價單已更新'
                        ],
                        function(err) {
                          if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                          }
                          
                          db.run('COMMIT');
                          Quote.findById(id)
                            .then(quote => resolve(quote))
                            .catch(err => {
                              db.run('ROLLBACK');
                              reject(err);
                            });
                        }
                      );
                    }
                  }
                );
              });
            });
          }
        );
      });
    });
  }

  // 更新報價單狀態
  static updateStatus(id, status, userId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      console.log(`更新報價單 ID: ${id} 的狀態為: ${status}, 操作者: ${userId}`);
      
      // 開始交易
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const now = new Date().toISOString();
        
        // 更新報價單狀態
        db.run(
          `UPDATE quotes SET status = ?, updated_at = ? WHERE id = ?`,
          [status, now, id],
          function(err) {
            if (err) {
              console.error(`更新報價單狀態失敗:`, err);
              db.run('ROLLBACK');
              return reject(err);
            }
            
            if (this.changes === 0) {
              console.error(`找不到 ID 為 ${id} 的報價單`);
              db.run('ROLLBACK');
              return reject(new Error('報價單不存在'));
            }
            
            // 記錄狀態變更歷史
            db.run(
              `INSERT INTO quote_history (
                quote_id, action, status, user_id, timestamp, notes
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                id,
                'status_change',
                status,
                userId,
                now,
                `報價單狀態更新為: ${status}`
              ],
              function(err) {
                if (err) {
                  console.error(`記錄報價單狀態更新歷史失敗:`, err);
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                db.run('COMMIT');
                resolve(true);
              }
            );
          }
        );
      });
    });
  }

  // 刪除報價單
  static delete(id, userId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      console.log(`[嚴重錯誤排查] 開始刪除報價單 ID: ${id}`);
      
      // 不使用事務，改用依序刪除並確保成功
      // 首先刪除報價單項目
      db.run('DELETE FROM quote_items WHERE quote_id = ?', [id], function(err) {
        if (err) {
          console.error('[嚴重錯誤排查] 刪除報價單項目失敗:', err);
          return reject(err);
        }
        
        console.log(`[嚴重錯誤排查] 成功刪除報價單項目，影響行數: ${this.changes}`);
        
        // 然後刪除報價單歷史
        db.run('DELETE FROM quote_history WHERE quote_id = ?', [id], function(err) {
          if (err) {
            console.error('[嚴重錯誤排查] 刪除報價單歷史失敗:', err);
            return reject(err);
          }
          
          console.log(`[嚴重錯誤排查] 成功刪除報價單歷史，影響行數: ${this.changes}`);
          
          // 最後刪除報價單本身
          db.run('DELETE FROM quotes WHERE id = ?', [id], function(err) {
            if (err) {
              console.error('[嚴重錯誤排查] 刪除報價單失敗:', err);
              return reject(err);
            }
            
            if (this.changes === 0) {
              console.error('[嚴重錯誤排查] 找不到報價單或刪除失敗，影響行數為0');
              return reject(new Error('報價單不存在或無法刪除'));
            }
            
            console.log(`[嚴重錯誤排查] 成功刪除報價單，影響行數: ${this.changes}`);
            resolve(true);
          });
        });
      });
    });
  }

  // 複製報價單
  static duplicate(id, userId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 開始交易
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // 取得原始報價單
        Quote.findById(id)
          .then(quote => {
            if (!quote) {
              db.run('ROLLBACK');
              return reject(new Error('報價單不存在'));
            }
            
            // 生成新的報價單號碼
            Quote.generateQuoteNumber()
              .then(quoteNumber => {
                const now = new Date().toISOString();
                const today = new Date().toISOString().split('T')[0];
                
                // 插入新報價單
                db.run(
                  `INSERT INTO quotes (
                    quote_number, customer_id, title, description, issue_date, valid_until, 
                    status, subtotal, discount_type, discount_value, tax_rate, tax_amount, 
                    total, notes, terms, created_by, created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    quoteNumber,
                    quote.customer_id,
                    `${quote.title} (複製)`,
                    quote.description,
                    today,
                    quote.valid_until,
                    'draft',
                    quote.subtotal,
                    quote.discount_type,
                    quote.discount_value,
                    quote.tax_rate,
                    quote.tax_amount,
                    quote.total,
                    quote.notes,
                    quote.terms,
                    userId,
                    now,
                    now
                  ],
                  function(err) {
                    if (err) {
                      db.run('ROLLBACK');
                      return reject(err);
                    }
                    
                    const newQuoteId = this.lastID;
                    
                    // 取得原始報價單項目
                    db.all('SELECT * FROM quote_items WHERE quote_id = ?', [id], (err, items) => {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      if (items.length === 0) {
                        // 沒有項目，直接提交
                        db.run(
                          `INSERT INTO quote_history (
                            quote_id, action, status, user_id, timestamp, notes
                          ) VALUES (?, ?, ?, ?, ?, ?)`,
                          [
                            newQuoteId,
                            'create',
                            'draft',
                            userId,
                            now,
                            '報價單已複製'
                          ],
                          function(err) {
                            if (err) {
                              db.run('ROLLBACK');
                              return reject(err);
                            }
                            
                            db.run('COMMIT');
                            Quote.findById(newQuoteId)
                              .then(quote => resolve(quote))
                              .catch(err => {
                                db.run('ROLLBACK');
                                reject(err);
                              });
                          }
                        );
                        return;
                      }
                      
                      // 插入新報價單項目
                      const stmt = db.prepare(
                        `INSERT INTO quote_items (
                          quote_id, product_id, description, quantity, unit_price, 
                          discount, amount, sort_order, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                      );
                      
                      let itemsProcessed = 0;
                      let hasError = false;
                      
                      items.forEach(item => {
                        stmt.run(
                          [
                            newQuoteId,
                            item.product_id,
                            item.description,
                            item.quantity,
                            item.unit_price,
                            item.discount,
                            item.amount,
                            item.sort_order,
                            now,
                            now
                          ],
                          function(err) {
                            itemsProcessed++;
                            
                            if (err && !hasError) {
                              hasError = true;
                              db.run('ROLLBACK');
                              stmt.finalize();
                              return reject(err);
                            }
                            
                            // 所有項目處理完成
                            if (itemsProcessed === items.length && !hasError) {
                              stmt.finalize();
                              
                              // 記錄歷史
                              db.run(
                                `INSERT INTO quote_history (
                                  quote_id, action, status, user_id, timestamp, notes
                                ) VALUES (?, ?, ?, ?, ?, ?)`,
                                [
                                  newQuoteId,
                                  'create',
                                  'draft',
                                  userId,
                                  now,
                                  '報價單已複製'
                                ],
                                function(err) {
                                  if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                  }
                                  
                                  db.run('COMMIT');
                                  Quote.findById(newQuoteId)
                                    .then(quote => resolve(quote))
                                    .catch(err => {
                                      db.run('ROLLBACK');
                                      reject(err);
                                    });
                                }
                              );
                            }
                          }
                        );
                      });
                    });
                  }
                );
              })
              .catch(err => {
                db.run('ROLLBACK');
                reject(err);
              });
          })
          .catch(err => {
            db.run('ROLLBACK');
            reject(err);
          });
      });
    });
  }

  // 取得報價單歷史
  static getHistory(quoteId) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      db.all(
        `SELECT qh.*, u.username
         FROM quote_history qh
         JOIN users u ON qh.user_id = u.id
         WHERE qh.quote_id = ?
         ORDER BY qh.timestamp DESC`,
        [quoteId],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          resolve(rows);
        }
      );
    });
  }

  // 取得報表數據
  static getReportData(startDate, endDate) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      
      // 格式化日期為字符串
      let formattedStartDate = startDate;
      let formattedEndDate = endDate;
      
      // 如果是Date對象，轉換為YYYY-MM-DD格式
      if (startDate instanceof Date) {
        formattedStartDate = startDate.toISOString().split('T')[0];
      }
      
      if (endDate instanceof Date) {
        // 將結束日期設為當天的23:59:59，以包含整天
        formattedEndDate = endDate.toISOString().split('T')[0] + ' 23:59:59';
      }
      
      console.log(`獲取報表數據 - 開始日期: ${formattedStartDate}, 結束日期: ${formattedEndDate}`);
      
      db.all(
        `SELECT q.*, c.name as customer_name, u.username as created_by_username,
                (SELECT SUM(quantity * unit_price) FROM quote_items WHERE quote_id = q.id) as calculated_total
         FROM quotes q
         LEFT JOIN customers c ON q.customer_id = c.id
         LEFT JOIN users u ON q.created_by = u.id
         WHERE q.issue_date >= ? AND q.issue_date <= ?
         ORDER BY q.issue_date DESC`,
        [formattedStartDate, formattedEndDate],
        (err, rows) => {
          if (err) {
            console.error('獲取報表數據錯誤:', err);
            return reject(err);
          }
          
          console.log(`獲取到 ${rows.length} 筆報價單報表數據`);
          
          // 處理總金額計算
          const processedRows = rows.map(row => {
            // 如果沒有total或為0，使用calculated_total
            if (!row.total || row.total === 0) {
              row.total = row.calculated_total || 0;
            }
            return row;
          });
          
          resolve(processedRows);
        }
      );
    });
  }

  // 批量匯入報價單
  static bulkImport(quotes) {
    return new Promise((resolve, reject) => {
      const db = getDb();
      const now = new Date().toISOString();
      let successCount = 0;
      let failedCount = 0;
      const failedItems = [];
      
      // 收集所有客戶ID，用於驗證
      db.all('SELECT id FROM customers', [], (err, rows) => {
        if (err) {
          console.error('獲取客戶ID列表時出錯:', err);
          return reject(err);
        }
        
        // 創建客戶ID集合，用於快速查找
        const validCustomerIds = new Set(rows.map(row => row.id));
        
        console.log(`系統中有 ${validCustomerIds.size} 個有效客戶ID`);
        
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          
          quotes.forEach((quote) => {
            try {
              if (!quote.quoteNumber || !quote.customerId) {
                failedCount++;
                failedItems.push({
                  data: quote,
                  reason: '報價單號或客戶ID不能為空'
                });
                return;
              }
              
              // 驗證客戶ID是否存在
              if (!validCustomerIds.has(parseInt(quote.customerId, 10))) {
                failedCount++;
                failedItems.push({
                  data: quote,
                  reason: `找不到指定的客戶ID: ${quote.customerId}`
                });
                console.warn(`報價單 ${quote.quoteNumber} 匯入失敗: 找不到客戶ID ${quote.customerId}`);
                return;
              }
              
              // 計算小計、稅額和總計
              let subtotal = 0;
              if (quote.items && quote.items.length > 0) {
                quote.items.forEach(item => {
                  subtotal += item.amount;
                });
              }
              
              // 計算折扣
              let discountAmount = 0;
              if (quote.discountType === 'percentage' && quote.discountValue) {
                discountAmount = subtotal * (quote.discountValue / 100);
              } else if (quote.discountType === 'fixed' && quote.discountValue) {
                discountAmount = quote.discountValue;
              }
              
              // 計算稅額
              const taxableAmount = subtotal - discountAmount;
              const taxAmount = quote.taxRate ? taxableAmount * (quote.taxRate / 100) : 0;
              
              // 計算總計
              const total = taxableAmount + taxAmount;
              
              // 插入報價單
              db.run(
                `INSERT INTO quotes (
                  quote_number, customer_id, title, description, issue_date, valid_until, 
                  status, subtotal, discount_type, discount_value, tax_rate, tax_amount, 
                  total, notes, terms, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  quote.quoteNumber,
                  quote.customerId,
                  quote.title || '',
                  quote.description || '',
                  quote.issueDate,
                  quote.validUntil || null,
                  quote.status || 'draft',
                  subtotal,
                  quote.discountType || null,
                  quote.discountValue || 0,
                  quote.taxRate || 0,
                  taxAmount,
                  total,
                  quote.notes || '',
                  quote.terms || '',
                  quote.createdBy,
                  now,
                  now
                ],
                function(err) {
                  if (err) {
                    failedCount++;
                    failedItems.push({
                      data: quote,
                      reason: err.message
                    });
                    return;
                  }
                  
                  const quoteId = this.lastID;
                  
                  // 插入報價單項目
                  if (quote.items && quote.items.length > 0) {
                    const itemStmt = db.prepare(`
                      INSERT INTO quote_items (
                        quote_id, product_id, description, quantity, unit_price, 
                        discount, amount, sort_order, created_at, updated_at
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    
                    let itemsProcessed = 0;
                    let hasItemError = false;
                    
                    quote.items.forEach((item, index) => {
                      try {
                        itemStmt.run(
                          quoteId,
                          item.productId || null,
                          item.description || '',
                          item.quantity || 0,
                          item.unitPrice || 0,
                          item.discount || 0,
                          item.amount || 0,
                          index + 1,
                          now,
                          now,
                          function(err) {
                            itemsProcessed++;
                            
                            if (err && !hasItemError) {
                              hasItemError = true;
                              failedCount++;
                              failedItems.push({
                                data: quote,
                                reason: `項目匯入錯誤: ${err.message}`
                              });
                            }
                            
                            // 如果所有項目都處理完畢
                            if (itemsProcessed === quote.items.length && !hasItemError) {
                              successCount++;
                            }
                          }
                        );
                      } catch (err) {
                        if (!hasItemError) {
                          hasItemError = true;
                          failedCount++;
                          failedItems.push({
                            data: quote,
                            reason: `項目處理錯誤: ${err.message}`
                          });
                        }
                      }
                    });
                    
                    itemStmt.finalize();
                  } else {
                    successCount++;
                  }
                }
              );
            } catch (err) {
              failedCount++;
              failedItems.push({
                data: quote,
                reason: err.message
              });
              console.error(`處理報價單時發生錯誤: ${err.message}`);
            }
          });
          
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
    });
  }
}

module.exports = Quote;