const express = require('express');
const { body, validationResult } = require('express-validator');
const Customer = require('../models/customer');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 配置文件上傳
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadsDir = path.join(__dirname, '../uploads');
    // 確保目錄存在
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    cb(null, `customer-import-${Date.now()}-${file.originalname}`);
  }
});

// 定義允許的文件類型
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === 'text/csv' || 
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    cb(null, true);
  } else {
    cb(new Error('不支援的文件格式！只允許 .csv 和 .xlsx 文件'), false);
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

// 客戶詳情頁面
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

// 編輯客戶頁面
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

// 搜尋客戶
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

// 客戶批量匯入頁面
router.get('/import', isAuthenticated, (req, res) => {
  res.render('pages/customers/import', {
    title: '批量匯入客戶',
    error: null,
    success: null
  });
});

// 處理客戶批量匯入
router.post('/import', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('pages/customers/import', {
        title: '批量匯入客戶',
        error: '請選擇要上傳的檔案',
        success: null
      });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let customers = [];

    // 解析檔案
    if (fileExt === '.csv') {
      // 解析 CSV 檔案
      customers = await parseCSV(filePath);
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // 解析 Excel 檔案
      customers = parseExcel(filePath);
    }

    // 檢查是否有數據
    if (customers.length === 0) {
      return res.render('pages/customers/import', {
        title: '批量匯入客戶',
        error: '檔案中沒有有效的客戶數據',
        success: null
      });
    }

    // 添加創建者資訊
    customers = customers.map(customer => {
      customer.createdBy = req.session.user.id;
      return customer;
    });

    // 匯入客戶
    const importResults = await Customer.bulkImport(customers);

    // 清理上傳的檔案
    fs.unlinkSync(filePath);

    res.render('pages/customers/import', {
      title: '批量匯入客戶',
      error: null,
      success: `成功匯入 ${importResults.success} 筆客戶資料，失敗 ${importResults.failed} 筆。`,
      results: importResults
    });
  } catch (err) {
    console.error('客戶匯入錯誤:', err);
    res.render('pages/customers/import', {
      title: '批量匯入客戶',
      error: '匯入過程發生錯誤: ' + err.message,
      success: null
    });
  }
});

// 解析 CSV 檔案
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const customers = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        customers.push({
          name: row.name || row.Name || row['客戶名稱'] || '',
          contactPerson: row.contactPerson || row.ContactPerson || row['聯絡人'] || '',
          email: row.email || row.Email || row['電子郵件'] || '',
          phone: row.phone || row.Phone || row['電話'] || '',
          address: row.address || row.Address || row['地址'] || '',
          taxId: row.taxId || row.TaxId || row['統一編號'] || '',
          notes: row.notes || row.Notes || row['備註'] || ''
        });
      })
      .on('end', () => {
        resolve(customers);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}

// 解析 Excel 檔案
function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json(worksheet);
  
  return jsonData.map(row => ({
    name: row.name || row.Name || row['客戶名稱'] || '',
    contactPerson: row.contactPerson || row.ContactPerson || row['聯絡人'] || '',
    email: row.email || row.Email || row['電子郵件'] || '',
    phone: row.phone || row.Phone || row['電話'] || '',
    address: row.address || row.Address || row['地址'] || '',
    taxId: row.taxId || row.TaxId || row['統一編號'] || '',
    notes: row.notes || row.Notes || row['備註'] || ''
  }));
}

module.exports = router; 