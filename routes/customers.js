const express = require('express');
const { body, validationResult } = require('express-validator');
const Customer = require('../models/customer');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 確保上傳目錄存在
// 使用絕對路徑而不是相對路徑，以避免路徑問題
const uploadsDir = path.resolve(__dirname, '../uploads');
console.log('客戶資料上傳目錄路徑:', uploadsDir);

try {
  if (!fs.existsSync(uploadsDir)) {
    console.log('創建客戶資料上傳目錄:', uploadsDir);
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (error) {
  console.error('創建客戶資料上傳目錄失敗:', error);
}

// 配置文件上傳
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // 如果主目錄不可用，使用系統臨時目錄
    if (!fs.existsSync(uploadsDir)) {
      const tempDir = require('os').tmpdir();
      console.log('使用系統臨時目錄:', tempDir);
      cb(null, tempDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: function(req, file, cb) {
    const uniqueFileName = `customer-import-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    console.log('生成客戶資料文件名:', uniqueFileName);
    cb(null, uniqueFileName);
  }
});

// 定義允許的文件類型
const fileFilter = (req, file, cb) => {
  const originalName = file.originalname.toLowerCase();
  const mimeType = file.mimetype.toLowerCase();
  
  console.log(`檢查檔案: ${originalName}, MIME類型: ${mimeType}`);
  
  // 檢查副檔名
  const validExtensions = ['.csv', '.xls', '.xlsx'];
  const fileExt = path.extname(originalName).toLowerCase();
  const isValidExtension = validExtensions.includes(fileExt);
  
  // 檢查MIME類型
  const validMimeTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream' // 某些系統可能會將CSV檔案識別為此類型
  ];
  const isValidMimeType = validMimeTypes.includes(mimeType);
  
  if (isValidExtension && isValidMimeType) {
    console.log(`檔案格式有效: ${originalName}`);
    cb(null, true);
  } else {
    console.log(`檔案格式無效: ${originalName}, 副檔名有效: ${isValidExtension}, MIME類型有效: ${isValidMimeType}`);
    cb(new Error(`不支援的文件格式！只允許 .csv, .xls 和 .xlsx 文件。您上傳的檔案是 ${fileExt} (${mimeType})`), false);
  }
};

// 創建 upload 實例
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 5 // 限制 5MB
  }
});

const router = express.Router();

// 客戶列表頁面
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const customers = await Customer.getAll();
    
    res.render('pages/customers/index', {
      title: '客戶管理',
      active: 'customers',
      customers
    });
  } catch (err) {
    console.error('取得客戶列表錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得客戶列表時發生錯誤'
    });
  }
});

// 新增客戶頁面
router.get('/create', isAuthenticated, async (req, res) => {
  res.render('pages/customers/create', {
    title: '新增客戶',
    active: 'customers',
    error: null,
    customer: {}
  });
});

// 處理新增客戶請求
router.post('/create', [
  body('name').trim().notEmpty().withMessage('請輸入客戶名稱'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('請輸入有效的電子郵件'),
  body('phone').optional({ checkFalsy: true }),
  body('address').optional({ checkFalsy: true }),
  body('contactPerson').optional({ checkFalsy: true }),
  body('notes').optional({ checkFalsy: true })
], isAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/customers/create', {
      title: '新增客戶',
      active: 'customers',
      error: errors.array()[0].msg,
      customer: req.body
    });
  }

  try {
    // 創建新客戶
    await Customer.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      contactPerson: req.body.contactPerson,
      notes: req.body.notes
    });

    res.redirect('/customers');
  } catch (err) {
    console.error('創建客戶錯誤:', err);
    res.render('pages/customers/create', {
      title: '新增客戶',
      active: 'customers',
      error: '創建客戶時發生錯誤',
      customer: req.body
    });
  }
});

// 編輯客戶頁面 - 放在 /:id 之前
router.get('/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).render('pages/error', {
        title: '找不到客戶',
        message: '找不到指定的客戶'
      });
    }

    res.render('pages/customers/edit', {
      title: '編輯客戶',
      active: 'customers',
      error: null,
      customer
    });
  } catch (err) {
    console.error('取得客戶資料錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得客戶資料時發生錯誤'
    });
  }
});

// 處理編輯客戶請求
router.post('/edit/:id', [
  body('name').trim().notEmpty().withMessage('請輸入客戶名稱'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('請輸入有效的電子郵件'),
  body('phone').optional({ checkFalsy: true }),
  body('address').optional({ checkFalsy: true }),
  body('contactPerson').optional({ checkFalsy: true }),
  body('notes').optional({ checkFalsy: true })
], isAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('pages/customers/edit', {
      title: '編輯客戶',
      active: 'customers',
      error: errors.array()[0].msg,
      customer: { id: req.params.id, ...req.body }
    });
  }

  try {
    // 檢查客戶是否存在
    const existingCustomer = await Customer.findById(req.params.id);
    if (!existingCustomer) {
      return res.status(404).render('pages/error', {
        title: '找不到客戶',
        message: '找不到指定的客戶'
      });
    }

    // 更新客戶資料
    await Customer.update(req.params.id, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      contactPerson: req.body.contactPerson,
      notes: req.body.notes
    });

    res.redirect(`/customers/${req.params.id}`);
  } catch (err) {
    console.error('更新客戶錯誤:', err);
    res.render('pages/customers/edit', {
      title: '編輯客戶',
      active: 'customers',
      error: '更新客戶時發生錯誤',
      customer: { id: req.params.id, ...req.body }
    });
  }
});

// 刪除客戶
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    // 檢查客戶是否存在
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: '找不到客戶' });
    }

    // 檢查客戶是否有關聯的報價單
    const quotes = await Customer.getQuotes(req.params.id);
    if (quotes && quotes.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: '無法刪除客戶，因為有關聯的報價單。請先刪除報價單或將報價單關聯到其他客戶。' 
      });
    }

    // 刪除客戶
    await Customer.delete(req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('刪除客戶錯誤:', err);
    res.status(500).json({ success: false, message: err.message || '刪除客戶時發生錯誤' });
  }
});

// 搜尋客戶 - 確保在 /:id 路由之前
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const query = req.query.q || '';
    
    const customers = await Customer.search(query);
    
    res.render('pages/customers/search', {
      title: '搜尋客戶',
      active: 'customers',
      customers,
      searchQuery: query
    });
  } catch (err) {
    console.error('搜尋客戶錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '搜尋客戶時發生錯誤'
    });
  }
});

// 客戶批量匯入頁面 - 確保在 /:id 路由之前
router.get('/import', isAuthenticated, (req, res) => {
  res.render('pages/customers/import', {
    title: '批量匯入客戶',
    error: null,
    success: null
  });
});

// 處理客戶批量匯入
router.post('/import', isAuthenticated, upload.single('file'), async (req, res) => {
  let filePath = null;
  
  try {
    console.log('客戶批量匯入請求開始處理');
    
    if (!req.file) {
      console.log('未收到檔案');
      return res.render('pages/customers/import', {
        title: '批量匯入客戶',
        error: '請選擇要上傳的檔案',
        success: null
      });
    }

    filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const fileExt = path.extname(fileName).toLowerCase();
    
    console.log(`收到上傳檔案: ${fileName}，類型: ${fileExt}，大小: ${fileSize} 字節，暫存路徑: ${filePath}`);
    
    // 檢查文件是否為空
    if (fileSize === 0) {
      throw new Error('上傳的檔案是空的，請檢查您的檔案');
    }
    
    // 基本檢查文件是否正確
    if (!fs.existsSync(filePath)) {
      throw new Error('檔案上傳失敗，找不到上傳的檔案');
    }
    
    let customers = [];

    // 解析檔案
    console.log(`開始解析 ${fileExt} 檔案...`);
    
    try {
      if (fileExt === '.csv') {
        // 解析 CSV 檔案
        console.log('開始解析CSV檔案...');
        customers = await parseCSV(filePath);
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        // 解析 Excel 檔案
        console.log('開始解析Excel檔案...');
        customers = parseExcel(filePath);
      } else {
        throw new Error(`不支援的檔案格式: ${fileExt}，僅支援 .csv, .xlsx 和 .xls`);
      }
    } catch (parseError) {
      console.error('檔案解析錯誤:', parseError);
      throw new Error(`檔案解析錯誤: ${parseError.message}`);
    }

    // 檢查是否有數據
    if (!customers || customers.length === 0) {
      return res.render('pages/customers/import', {
        title: '批量匯入客戶',
        error: '檔案中沒有有效的客戶數據，請檢查檔案格式是否正確',
        success: null
      });
    }

    console.log(`成功解析 ${customers.length} 筆客戶資料，準備匯入資料庫`);
    
    // 過濾掉沒有客戶名稱的數據
    const validCustomers = customers.filter(customer => customer.name.trim() !== '');
    if (validCustomers.length === 0) {
      return res.render('pages/customers/import', {
        title: '批量匯入客戶',
        error: '檔案中沒有有效的客戶名稱，請確保至少有一個客戶名稱',
        success: null
      });
    }
    
    console.log(`有效客戶數: ${validCustomers.length} (過濾掉 ${customers.length - validCustomers.length} 筆無效資料)`);
    
    // 添加創建者資訊
    const customersWithCreator = validCustomers.map(customer => {
      customer.createdBy = req.session.user.id;
      return customer;
    });

    // 匯入客戶
    console.log('開始批量匯入客戶資料到資料庫...');
    
    try {
      const importResults = await Customer.bulkImport(customersWithCreator);
      console.log(`匯入結果: 成功 ${importResults.success} 筆，失敗 ${importResults.failed} 筆`);
      
      // 清理上傳的檔案
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`已刪除暫存檔案: ${filePath}`);
      }
      
      // 如果有失敗項目，顯示詳細信息
      if (importResults.failed > 0 && importResults.failedItems.length > 0) {
        console.log(`有 ${importResults.failedItems.length} 筆資料匯入失敗，第一個失敗原因: ${importResults.failedItems[0].reason}`);
      }

      return res.render('pages/customers/import', {
        title: '批量匯入客戶',
        error: null,
        success: `成功匯入 ${importResults.success} 筆客戶資料，失敗 ${importResults.failed} 筆。`,
        results: importResults
      });
    } catch (importError) {
      console.error('資料庫匯入錯誤:', importError);
      throw new Error(`資料庫匯入錯誤: ${importError.message}`);
    }
  } catch (err) {
    console.error('客戶匯入錯誤:', err);
    
    // 清理上傳的檔案
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`已刪除暫存檔案: ${filePath}`);
      } catch (unlinkErr) {
        console.error(`刪除暫存檔案時發生錯誤: ${unlinkErr.message}`);
      }
    }
    
    res.render('pages/customers/import', {
      title: '批量匯入客戶',
      error: `匯入過程發生錯誤: ${err.message}`,
      success: null
    });
  }
});

// 客戶詳情頁面 - 確保在特定路由後面
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).render('pages/error', {
        title: '找不到客戶',
        message: '找不到指定的客戶'
      });
    }

    // 獲取該客戶的報價單
    const quotes = await Customer.getQuotes(req.params.id);

    res.render('pages/customers/view', {
      title: customer.name,
      active: 'customers',
      customer,
      quotes
    });
  } catch (err) {
    console.error('取得客戶詳情錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得客戶詳情時發生錯誤'
    });
  }
});

// 解析 CSV 檔案
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`開始解析CSV檔案: ${filePath}`);
      
      // 嘗試檢測CSV文件的編碼和分隔符
      const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
      const firstLine = fileContent.split('\n')[0].trim();
      
      console.log(`CSV檔案首行: ${firstLine}`);
      
      // 嘗試檢測分隔符
      let separator = ','; // 預設分隔符
      if (firstLine.includes('\t')) {
        separator = '\t';
        console.log('檢測到分隔符為 Tab');
      } else if (firstLine.includes(';')) {
        separator = ';';
        console.log('檢測到分隔符為 ;');
      } else {
        console.log('使用預設分隔符 ,');
      }
      
      const customers = [];
      let rowCount = 0;
      
      fs.createReadStream(filePath, { encoding: 'utf8' })
        .on('error', (err) => {
          console.error(`讀取CSV檔案時發生錯誤: ${err.message}`, err);
          reject(new Error(`讀取CSV檔案時發生錯誤: ${err.message}`));
        })
        .pipe(csv({
          separator: separator,
          skipLines: 0,
          mapHeaders: ({ header }) => header.trim()
        }))
        .on('data', (row) => {
          rowCount++;
          
          // 輸出行數據以進行調試
          if (rowCount <= 3) {
            console.log(`第 ${rowCount} 行數據:`, JSON.stringify(row));
          }
          
          // 標準化欄位名稱
          const customer = {
            name: row.name || row.Name || row['客戶名稱'] || row['Name'] || row['客户名称'] || '',
            contactPerson: row.contactPerson || row.ContactPerson || row['聯絡人'] || row['Contact Person'] || row['联系人'] || '',
            email: row.email || row.Email || row['電子郵件'] || row['Email Address'] || row['电子邮件'] || '',
            phone: row.phone || row.Phone || row['電話'] || row['Phone Number'] || row['电话'] || '',
            address: row.address || row.Address || row['地址'] || row['Company Address'] || '',
            taxId: row.taxId || row.TaxId || row['統一編號'] || row['Tax ID'] || row['税号'] || '',
            notes: row.notes || row.Notes || row['備註'] || row['Remarks'] || row['注释'] || ''
          };
          
          // 檢查必要欄位
          if (!customer.name) {
            console.warn(`第 ${rowCount} 行沒有客戶名稱:`, JSON.stringify(row));
          } else {
            console.log(`第 ${rowCount} 行有效: ${customer.name}`);
          }
          
          customers.push(customer);
        })
        .on('end', () => {
          console.log(`CSV解析完成，共 ${customers.length} 筆記錄`);
          resolve(customers);
        })
        .on('error', (err) => {
          console.error(`解析CSV檔案時發生錯誤: ${err.message}`, err);
          reject(new Error(`解析CSV檔案時發生錯誤: ${err.message}`));
        });
    } catch (err) {
      console.error(`CSV解析過程中發生未預期錯誤: ${err.message}`, err);
      reject(new Error(`CSV解析過程中發生未預期錯誤: ${err.message}`));
    }
  });
}

// 解析 Excel 檔案
function parseExcel(filePath) {
  try {
    console.log(`開始解析Excel檔案: ${filePath}`);
    
    // 檢查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`找不到文件: ${filePath}`);
    }
    
    // 檢查文件大小
    const stats = fs.statSync(filePath);
    console.log(`文件大小: ${stats.size} 字節`);
    
    if (stats.size === 0) {
      throw new Error('檔案大小為0，無法讀取空檔案');
    }
    
    // 讀取Excel檔案，並捕捉可能的錯誤
    let workbook;
    try {
      workbook = xlsx.readFile(filePath, {
        type: 'file',
        cellDates: true,
        dateNF: 'yyyy-mm-dd',
        cellNF: true,
        cellText: true
      });
    } catch (error) {
      console.error(`Excel讀取錯誤: ${error.message}`);
      throw new Error(`無法讀取Excel檔案: ${error.message}`);
    }
    
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel檔案無效或不包含任何工作表');
    }
    
    console.log(`Excel檔案已讀取，包含 ${workbook.SheetNames.length} 個工作表: ${workbook.SheetNames.join(', ')}`);
    
    // 獲取第一個工作表
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error(`無法讀取工作表 "${sheetName}"`);
    }
    
    // 獲取工作表範圍
    const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');
    console.log(`工作表範圍: ${worksheet['!ref']}, 行數: ${range.e.r - range.s.r + 1}, 列數: ${range.e.c - range.s.c + 1}`);
    
    // 將工作表轉換為JSON，並嘗試不同的選項
    let jsonData;
    try {
      console.log('嘗試標準轉換...');
      jsonData = xlsx.utils.sheet_to_json(worksheet, { 
        raw: false, 
        defval: '',
        header: 'A'
      });
      
      // 如果沒有數據，嘗試使用不同的選項
      if (!jsonData || jsonData.length === 0) {
        console.log('使用標準頭部嘗試轉換...');
        jsonData = xlsx.utils.sheet_to_json(worksheet, { 
          raw: false, 
          defval: '',
          blankrows: false
        });
      }
      
      console.log(`成功將工作表轉換為JSON，共 ${jsonData.length} 筆記錄`);
      
      // 輸出前3行以進行調試
      for (let i = 0; i < Math.min(3, jsonData.length); i++) {
        console.log(`第 ${i+1} 行數據:`, JSON.stringify(jsonData[i]));
      }
    } catch (error) {
      console.error(`JSON轉換錯誤: ${error.message}`);
      throw new Error(`無法將Excel轉換為JSON: ${error.message}`);
    }
    
    if (!jsonData || jsonData.length === 0) {
      throw new Error('Excel檔案中沒有找到有效數據');
    }
    
    // 檢查標題行
    const firstRow = jsonData[0];
    console.log('檢測到的欄位:', Object.keys(firstRow).join(', '));
    
    // 標準化欄位名稱
    return jsonData.map((row, index) => {
      const result = {
        name: row.name || row.Name || row['客戶名稱'] || row['Name'] || row['客户名称'] || '',
        contactPerson: row.contactPerson || row.ContactPerson || row['聯絡人'] || row['Contact Person'] || row['联系人'] || '',
        email: row.email || row.Email || row['電子郵件'] || row['Email Address'] || row['电子邮件'] || '',
        phone: row.phone || row.Phone || row['電話'] || row['Phone Number'] || row['电话'] || '',
        address: row.address || row.Address || row['地址'] || row['Company Address'] || '',
        taxId: row.taxId || row.TaxId || row['統一編號'] || row['Tax ID'] || row['税号'] || '',
        notes: row.notes || row.Notes || row['備註'] || row['Remarks'] || row['注释'] || ''
      };
      
      // 檢查額外欄位 (如果是用A, B, C等作為標題的情況)
      if (!result.name && (row.A || row[0])) {
        result.name = row.A || row[0] || '';
      }
      if (!result.contactPerson && (row.B || row[1])) {
        result.contactPerson = row.B || row[1] || '';
      }
      if (!result.email && (row.C || row[2])) {
        result.email = row.C || row[2] || '';
      }
      if (!result.phone && (row.D || row[3])) {
        result.phone = row.D || row[3] || '';
      }
      if (!result.address && (row.E || row[4])) {
        result.address = row.E || row[4] || '';
      }
      if (!result.taxId && (row.F || row[5])) {
        result.taxId = row.F || row[5] || '';
      }
      if (!result.notes && (row.G || row[6])) {
        result.notes = row.G || row[6] || '';
      }
      
      // 檢查必要欄位
      if (!result.name) {
        // 跳過標題行
        if (index > 0) {
          console.warn(`第 ${index + 1} 行沒有客戶名稱:`, JSON.stringify(row));
        } else {
          console.log('這可能是標題行，忽略空名稱檢查');
        }
      } else {
        console.log(`第 ${index + 1} 行有效: ${result.name}`);
      }
      
      return result;
    }).filter((customer, index) => {
      // 過濾掉空記錄和標題行
      if (index === 0 && (customer.name === '客戶名稱' || customer.name === 'name' || customer.name === 'Name')) {
        console.log('過濾掉標題行');
        return false;
      }
      
      if (!customer.name) {
        console.log(`過濾掉第 ${index + 1} 行，沒有客戶名稱`);
        return false;
      }
      
      return true;
    });
  } catch (error) {
    console.error(`解析Excel檔案時發生錯誤: ${error.message}`, error);
    throw new Error(`解析Excel檔案時發生錯誤: ${error.message}`);
  }
}

module.exports = router; 