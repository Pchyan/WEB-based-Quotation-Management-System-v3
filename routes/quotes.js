const express = require('express');
const { body, validationResult } = require('express-validator');
const Quote = require('../models/quote');
const Customer = require('../models/customer');
const Product = require('../models/product');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 計算相關輔助函數
function calculateSubtotal(items) {
  return items.reduce((total, item) => {
    const quantity = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    return total + (quantity * price);
  }, 0);
}

function calculateTaxAmount(items, taxRate) {
  const subtotal = calculateSubtotal(items);
  return subtotal * (parseFloat(taxRate) || 0) / 100;
}

function calculateTotal(items, discountType, discountValue, taxRate) {
  const subtotal = calculateSubtotal(items);
  const discount = discountType === 'percentage' 
    ? subtotal * (parseFloat(discountValue) || 0) / 100 
    : (parseFloat(discountValue) || 0);
  const afterDiscount = subtotal - discount;
  const tax = afterDiscount * (parseFloat(taxRate) || 0) / 100;
  return afterDiscount + tax;
}

// 配置文件上傳
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // 使用絕對路徑而不是相對路徑，以避免路徑問題
    const uploadsDir = path.resolve(__dirname, '../uploads');
    console.log('報價單上傳目錄路徑:', uploadsDir);
    
    // 確保目錄存在
    try {
      if (!fs.existsSync(uploadsDir)) {
        console.log('創建報價單上傳目錄:', uploadsDir);
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    } catch (error) {
      console.error('創建報價單上傳目錄失敗:', error);
      // 如果無法創建目錄，則使用系統臨時目錄
      const tempDir = require('os').tmpdir();
      console.log('使用系統臨時目錄:', tempDir);
      cb(null, tempDir);
    }
  },
  filename: function(req, file, cb) {
    const uniqueFileName = `quote-import-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    console.log('生成報價單文件名:', uniqueFileName);
    cb(null, uniqueFileName);
  }
});

// 定義允許的文件類型
const fileFilter = (req, file, cb) => {
  const originalName = file.originalname.toLowerCase();
  const mimeType = file.mimetype.toLowerCase();
  
  console.log(`檢查報價單檔案: ${originalName}, MIME類型: ${mimeType}`);
  
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
    console.log(`報價單檔案格式有效: ${originalName}`);
    cb(null, true);
  } else {
    console.error(`報價單檔案格式無效: ${originalName}, MIME: ${mimeType}`);
    cb(new Error('不支援的文件格式！只允許 .csv、.xls 和 .xlsx 文件'), false);
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

// 報價單列表頁面
router.get('/', isAuthenticated, async (req, res) => {
  try {
    console.log('開始獲取報價單列表...');
    const quotes = await Quote.getAll();
    console.log(`成功獲取 ${quotes.length} 筆報價單數據`);
    
    // 檢查每個報價單的必要欄位
    const validQuotes = quotes.filter(quote => {
      const hasRequiredFields = quote.id && quote.customer_name;
      if (!hasRequiredFields) {
        console.warn('發現缺少必要欄位的報價單:', quote);
      }
      return hasRequiredFields;
    });
    
    console.log(`過濾後有效的報價單數量: ${validQuotes.length}`);
    
    res.render('pages/quotes/index', {
      title: '報價單管理',
      active: 'quotes',
      quotes: validQuotes
    });
  } catch (err) {
    console.error('取得報價單列表錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得報價單列表時發生錯誤'
    });
  }
});

// 新增報價單頁面
router.get('/create', isAuthenticated, async (req, res) => {
  try {
    const customers = await Customer.getAll();
    const products = await Product.getAll();
    
    res.render('pages/quotes/create', {
      title: '建立新報價單',
      active: 'quotes',
      error: null,
      quote: {
        items: [{}] // 預設一個空白項目
      },
      customers,
      products
    });
  } catch (err) {
    console.error('準備建立報價單錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '準備建立報價單時發生錯誤'
    });
  }
});

// 處理新增報價單請求
router.post('/create', [
  body('customerId').notEmpty().withMessage('請選擇客戶'),
  body('issueDate').isDate().withMessage('請輸入有效的報價日期'),
  body('validUntil').isDate().withMessage('請輸入有效的有效期限'),
  body('items').isArray().withMessage('至少需要一個項目'),
  body('items.*.productId').notEmpty().withMessage('請選擇產品'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('數量必須大於零'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('價格必須是有效的數字'),
  body('terms').optional({ checkFalsy: true }),
  body('notes').optional({ checkFalsy: true })
], isAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    try {
      const customers = await Customer.getAll();
      const products = await Product.getAll();
      return res.render('pages/quotes/create', {
        title: '建立新報價單',
        active: 'quotes',
        error: errors.array()[0].msg,
        quote: req.body,
        customers,
        products
      });
    } catch (err) {
      console.error('表單驗證後取得資料錯誤:', err);
      return res.status(500).render('pages/error', {
        title: '伺服器錯誤',
        message: '表單驗證後取得資料時發生錯誤'
      });
    }
  }

  try {
    // 創建報價單
    const quoteNumber = await Quote.generateQuoteNumber();
    
    const quoteData = {
      quoteNumber: quoteNumber,
      customerId: req.body.customerId,
      title: req.body.title || `報價單 ${quoteNumber}`,
      description: req.body.description || '',
      issueDate: req.body.issueDate,
      validUntil: req.body.validUntil,
      status: 'draft', // 預設為草稿狀態
      subtotal: calculateSubtotal(req.body.items),
      discountType: req.body.discountType || null,
      discountValue: req.body.discountValue || 0,
      taxRate: req.body.taxRate || 0,
      taxAmount: calculateTaxAmount(req.body.items, req.body.taxRate),
      total: calculateTotal(req.body.items, req.body.discountType, req.body.discountValue, req.body.taxRate),
      notes: req.body.notes || '',
      terms: req.body.terms || '',
      createdBy: req.session.user.id,
      items: req.body.items.map(item => ({
        productId: item.productId || null,
        description: item.description || '',
        quantity: parseFloat(item.quantity) || 0,
        unitPrice: parseFloat(item.price) || 0,
        discount: parseFloat(item.discount) || 0,
        amount: (parseFloat(item.quantity) * parseFloat(item.price)) - parseFloat(item.discount) || 0
      }))
    };

    console.log('準備創建報價單，表單數據:', req.body);
    console.log('處理後的報價單數據:', quoteData);
    
    const quote = await Quote.create(quoteData);
    console.log('報價單創建成功, ID:', quote.id, '報價單號:', quote.quote_number);
    
    // 確認報價單已經創建
    const savedQuote = await Quote.findById(quote.id);
    console.log('從資料庫驗證報價單:', savedQuote ? `已找到 ID ${savedQuote.id}` : '未找到');
    
    // 重新載入報價單列表確保更新
    const allQuotes = await Quote.getAll();
    console.log(`目前資料庫中有 ${allQuotes.length} 筆報價單記錄`);
    
    req.flash('success', '報價單創建成功！');
    res.redirect(`/quotes/${quote.id}`);
  } catch (err) {
    console.error('創建報價單錯誤:', err);
    try {
      const customers = await Customer.getAll();
      const products = await Product.getAll();
      res.render('pages/quotes/create', {
        title: '建立新報價單',
        active: 'quotes',
        error: '創建報價單時發生錯誤',
        quote: req.body,
        customers,
        products
      });
    } catch (error) {
      console.error('取得資料錯誤:', error);
      res.status(500).render('pages/error', {
        title: '伺服器錯誤',
        message: '創建報價單時發生錯誤'
      });
    }
  }
});

// 編輯報價單頁面 - 確保在 /:id 之前
router.get('/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).render('pages/error', {
        title: '找不到報價單',
        message: '找不到指定的報價單'
      });
    }

    const customers = await Customer.getAll();
    const products = await Product.getAll();
    
    // 獲取報價單項目
    const items = await Quote.getItems(quote.id);
    console.log(`編輯頁面 - 獲取到 ${items.length} 個報價單項目`);
    
    // 計算總計金額
    let subtotal = 0;
    items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unit_price) || 0;
      subtotal += quantity * price;
    });
    
    // 取得折扣和稅率
    const discountType = quote.discount_type || 'amount';
    const discountValue = parseFloat(quote.discount_value) || 0;
    const taxRate = parseFloat(quote.tax_rate) || 0;
    
    // 計算折扣金額
    let discountAmount = 0;
    if (discountType === 'percentage') {
      discountAmount = subtotal * (discountValue / 100);
    } else {
      discountAmount = discountValue;
    }
    
    // 稅前金額
    const afterDiscount = subtotal - discountAmount;
    
    // 計算稅額
    const taxAmount = afterDiscount * (taxRate / 100);
    
    // 總計
    const total = afterDiscount + taxAmount;
    
    // 準備供編輯頁面使用的數據
    const preparedQuote = {
      ...quote,
      quoteNumber: quote.quote_number,
      customerId: quote.customer_id,
      quoteDate: quote.issue_date || '',
      validUntil: quote.valid_until || '',
      items: items || [],
      subtotal: subtotal,
      discountType: discountType,
      discountValue: discountValue,
      discountAmount: discountAmount,
      discountRate: discountType === 'percentage' ? discountValue : 0,
      taxRate: taxRate,
      taxAmount: taxAmount,
      total: total
    };
    
    console.log('編輯頁面 - 報價日期:', preparedQuote.quoteDate);
    console.log('編輯頁面 - 有效期限:', preparedQuote.validUntil);
    
    // 格式化日期輔助函數
    const formatDateForInput = (dateString) => {
      if (!dateString) return '';
      try {
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
      } catch (e) {
        console.error('日期格式化錯誤:', e);
        return '';
      }
    };
    
    res.render('pages/quotes/edit', {
      title: '編輯報價單',
      active: 'quotes',
      error: null,
      quote: preparedQuote,
      customers,
      products,
      formatDateForInput
    });
  } catch (err) {
    console.error('取得報價單資料錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得報價單資料時發生錯誤'
    });
  }
});

// 處理編輯報價單請求
router.post('/edit/:id', [
  body('customerId').notEmpty().withMessage('請選擇客戶'),
  body('quoteDate').isDate().withMessage('請輸入有效的報價日期'),
  body('validUntil').isDate().withMessage('請輸入有效的有效期限'),
  body('items').isArray().withMessage('至少需要一個項目'),
  body('items.*.productId').notEmpty().withMessage('請選擇產品'),
  body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('數量必須大於零'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('價格必須是有效的數字'),
  body('terms').optional({ checkFalsy: true }),
  body('notes').optional({ checkFalsy: true })
], isAuthenticated, async (req, res) => {
  try {
    // 檢查報價單是否存在
    const existingQuote = await Quote.findById(req.params.id);
    if (!existingQuote) {
      return res.status(404).render('pages/error', {
        title: '找不到報價單',
        message: '找不到指定的報價單'
      });
    }

    // 不允許編輯非草稿狀態的報價單
    if (existingQuote.status !== 'draft') {
      return res.status(403).render('pages/error', {
        title: '無法編輯',
        message: '只能編輯草稿狀態的報價單'
      });
    }

    // 驗證表單
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      try {
        const customers = await Customer.getAll();
        const products = await Product.getAll();
        return res.render('pages/quotes/edit', {
          title: '編輯報價單',
          active: 'quotes',
          error: errors.array()[0].msg,
          quote: { ...existingQuote, ...req.body },
          customers,
          products
        });
      } catch (err) {
        console.error('表單驗證後取得資料錯誤:', err);
        return res.status(500).render('pages/error', {
          title: '伺服器錯誤',
          message: '表單驗證後取得資料時發生錯誤'
        });
      }
    }

    // 更新報價單資料
    const quoteData = {
      customerId: req.body.customerId,
      quoteDate: req.body.quoteDate,
      validUntil: req.body.validUntil,
      terms: req.body.terms,
      notes: req.body.notes,
      items: req.body.items.map(item => ({
        id: item.id, // 如果是現有項目，則包含ID
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount || 0
      }))
    };

    await Quote.update(req.params.id, quoteData);
    
    res.redirect(`/quotes/${req.params.id}`);
  } catch (err) {
    console.error('更新報價單錯誤:', err);
    try {
      const customers = await Customer.getAll();
      const products = await Product.getAll();
      res.render('pages/quotes/edit', {
        title: '編輯報價單',
        active: 'quotes',
        error: '更新報價單時發生錯誤',
        quote: { id: req.params.id, ...req.body },
        customers,
        products
      });
    } catch (error) {
      console.error('取得資料錯誤:', error);
      res.status(500).render('pages/error', {
        title: '伺服器錯誤',
        message: '更新報價單時發生錯誤'
      });
    }
  }
});

// 產生報價單 PDF
router.get('/pdf/:id', isAuthenticated, async (req, res) => {
  try {
    console.log(`正在產生報價單 ID: ${req.params.id} 的 PDF`);
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      console.log(`找不到 ID 為 ${req.params.id} 的報價單`);
      return res.status(404).render('pages/error', {
        title: '找不到報價單',
        message: '找不到指定的報價單'
      });
    }

    // 取得客戶資料
    const customer = await Customer.findById(quote.customer_id);
    if (!customer) {
      console.log(`警告：找不到報價單關聯的客戶 ID: ${quote.customer_id}`);
    }
    
    // 取得報價單項目
    const items = await Quote.getItems(quote.id);
    console.log(`獲取到 ${items.length} 個報價單項目`);
    
    // 從設定檔讀取公司資訊
    let company = {
      name: '貴公司企業有限公司',
      address: '台北市中正區忠孝東路100號',
      phone: '(02) 2345-6789',
      email: 'contact@company.com.tw',
      website: 'www.company.com.tw'
    };
    
    try {
      const settingsPath = path.resolve(process.cwd(), 'company_settings.json');
      if (fs.existsSync(settingsPath)) {
        const settingsData = fs.readFileSync(settingsPath, 'utf8');
        const companySettings = JSON.parse(settingsData);
        company = {
          name: companySettings.name || company.name,
          address: companySettings.address || company.address,
          phone: companySettings.phone || company.phone,
          email: companySettings.email || company.email,
          website: companySettings.website || company.website
        };
      }
    } catch (error) {
      console.error('讀取公司設定時發生錯誤:', error);
    }
    
    // 準備報價單數據
    const preparedQuote = {
      ...quote,
      quoteNumber: quote.quote_number,
      quoteDate: quote.issue_date,
      validUntil: quote.valid_until,
      items: items || [],
      customer: customer || { name: '未知客戶' }
    };
    
    console.log('PDF - 報價單數據已準備完成');
    
    // 提供格式化輔助函數
    const formatDate = (dateString) => {
      if (!dateString) return '未設定';
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-TW');
      } catch (e) {
        return '無效日期';
      }
    };

    const getStatusText = (status) => {
      switch (status) {
        case 'draft': return '草稿';
        case 'sent': return '已發送';
        case 'accepted': return '已接受';
        case 'rejected': return '已拒絕';
        case 'expired': return '已過期';
        default: return '未知狀態';
      }
    };
    
    // 渲染PDF模板
    res.render('pages/quotes/pdf', {
      layout: 'pdf', // 使用PDF專用布局
      quote: preparedQuote,
      customer,
      company,
      items,
      formatDate,
      getStatusText
    });
  } catch (err) {
    console.error('產生報價單PDF錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '產生報價單PDF時發生錯誤'
    });
  }
});

// 複製報價單頁面 - 確保在 /:id 之前
router.get('/copy/:id', isAuthenticated, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).render('pages/error', {
        title: '找不到報價單',
        message: '找不到指定的報價單'
      });
    }

    const customers = await Customer.getAll();
    const products = await Product.getAll();
    
    // 準備複製的報價單
    const copiedQuote = { ...quote };
    copiedQuote.id = null;
    copiedQuote.quoteNumber = ''; // 新建時會自動生成
    copiedQuote.status = 'draft';
    copiedQuote.issueDate = new Date().toISOString().split('T')[0]; // 今天
    
    // 計算新的有效期限 (今天 + 30天)
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);
    copiedQuote.validUntil = validUntil.toISOString().split('T')[0];
    
    res.render('pages/quotes/create', {
      title: '複製報價單',
      active: 'quotes',
      error: null,
      quote: copiedQuote,
      customers,
      products,
      isCopy: true
    });
  } catch (err) {
    console.error('複製報價單錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '複製報價單時發生錯誤'
    });
  }
});

// 更新報價單狀態
router.post('/status/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log(`正在更新報價單 ID: ${id} 的狀態為: ${status}`);
    
    // 驗證狀態值
    const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).render('pages/error', {
        title: '無效的請求',
        message: '無效的報價單狀態值'
      });
    }
    
    // 獲取報價單
    const quote = await Quote.findById(id);
    if (!quote) {
      return res.status(404).render('pages/error', {
        title: '找不到報價單',
        message: '找不到指定的報價單'
      });
    }
    
    // 更新狀態
    await Quote.updateStatus(id, status, req.session.user.id);
    
    // 重定向回報價單詳情頁
    res.redirect(`/quotes/${id}`);
  } catch (err) {
    console.error('更新報價單狀態錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '更新報價單狀態時發生錯誤: ' + (err.message || '未知錯誤')
    });
  }
});

// 刪除報價單
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    // 檢查報價單是否存在
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: '找不到報價單' });
    }

    // 刪除報價單
    await Quote.delete(req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('刪除報價單錯誤:', err);
    res.status(500).json({ success: false, message: err.message || '刪除報價單時發生錯誤' });
  }
});

// 搜尋報價單
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const { q: query, status, customer, startDate, endDate, page = 1, limit = 10 } = req.query;
    
    const quotes = await Quote.search(query, status, startDate, endDate);
    
    // 修改渲染部分，確保傳遞所有可能需要的參數
    res.render('pages/quotes/search', {
      quotes: quotes,
      query: query || '',  // 確保 query 有值，即使是空字串
      status: status || '',
      customer: customer || '',
      startDate: startDate || '',
      endDate: endDate || '',
      title: '報價單搜尋結果',
      active: 'quotes',
      formatDate: (dateString) => {
        if (!dateString) return '未設定';
        try {
          const date = new Date(dateString);
          return date.toLocaleDateString('zh-TW');
        } catch (e) {
          return '無效日期';
        }
      },
      getStatusBadgeClass: (status) => {
        switch(status) {
          case 'draft': return 'bg-secondary';
          case 'sent': return 'bg-primary';
          case 'accepted': return 'bg-success';
          case 'rejected': return 'bg-danger';
          case 'expired': return 'bg-warning';
          default: return 'bg-secondary';
        }
      },
      getStatusText: (status) => {
        switch(status) {
          case 'draft': return '草稿';
          case 'sent': return '已發送';
          case 'accepted': return '已接受';
          case 'rejected': return '已拒絕';
          case 'expired': return '已過期';
          default: return '未知';
        }
      }
    });
  } catch (error) {
    console.error('搜尋報價單時發生錯誤:', error);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '搜尋報價單時發生錯誤'
    });
  }
});

// 報價單批量匯入頁面 - 確保在 /:id 之前
router.get('/import', isAuthenticated, async (req, res) => {
  try {
    const customers = await Customer.getAll();
    const products = await Product.getAll();
    
    res.render('pages/quotes/import', {
      title: '批量匯入報價單',
      error: null,
      success: null,
      customers,
      products
    });
  } catch (err) {
    console.error('獲取客戶和產品列表錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '獲取客戶和產品列表時發生錯誤'
    });
  }
});

// 處理報價單批量匯入
router.post('/import', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('pages/quotes/import', {
        title: '批量匯入報價單',
        error: '請選擇要上傳的檔案',
        success: null
      });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let quotes = [];

    // 解析檔案
    if (fileExt === '.csv') {
      // 解析 CSV 檔案
      quotes = await parseCSV(filePath);
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // 解析 Excel 檔案
      quotes = parseExcel(filePath);
    }

    // 檢查是否有數據
    if (quotes.length === 0) {
      return res.render('pages/quotes/import', {
        title: '批量匯入報價單',
        error: '檔案中沒有有效的報價單數據',
        success: null
      });
    }

    // 添加創建者資訊
    quotes = quotes.map(quote => {
      quote.createdBy = req.session.user.id;
      return quote;
    });

    // 匯入報價單
    const importResults = await Quote.bulkImport(quotes);

    // 清理上傳的檔案
    fs.unlinkSync(filePath);

    res.render('pages/quotes/import', {
      title: '批量匯入報價單',
      error: null,
      success: `成功匯入 ${importResults.success} 筆報價單資料，失敗 ${importResults.failed} 筆。`,
      results: importResults,
      customers,
      products
    });
  } catch (err) {
    console.error('報價單匯入錯誤:', err);
    const customers = await Customer.getAll();
    const products = await Product.getAll();
    res.render('pages/quotes/import', {
      title: '批量匯入報價單',
      error: '匯入過程發生錯誤: ' + err.message,
      success: null,
      customers,
      products
    });
  }
});

// 解析 CSV 檔案
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const quotes = [];
    let currentQuote = null;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // 檢查是否為新報價單的開始
        if (row.quoteNumber || row.QuoteNumber || row['報價單號']) {
          // 如果已有報價單，先保存
          if (currentQuote) {
            quotes.push(currentQuote);
          }
          
          // 確保客戶ID為整數
          let customerId = row.customerId || row.CustomerId || row['客戶ID'] || '';
          if (customerId && !isNaN(customerId)) {
            customerId = parseInt(customerId, 10);
          }
          
          // 創建新報價單
          currentQuote = {
            quoteNumber: row.quoteNumber || row.QuoteNumber || row['報價單號'] || '',
            customerId: customerId,
            title: row.title || row.Title || row['標題'] || '',
            description: row.description || row.Description || row['描述'] || '',
            issueDate: row.issueDate || row.IssueDate || row['報價日期'] || new Date().toISOString().split('T')[0],
            validUntil: row.validUntil || row.ValidUntil || row['有效期限'] || '',
            status: row.status || row.Status || row['狀態'] || 'draft',
            discountType: row.discountType || row.DiscountType || row['折扣類型'] || '',
            discountValue: parseFloat(row.discountValue || row.DiscountValue || row['折扣值'] || 0),
            taxRate: parseFloat(row.taxRate || row.TaxRate || row['稅率'] || 0),
            notes: row.notes || row.Notes || row['備註'] || '',
            terms: row.terms || row.Terms || row['條款'] || '',
            items: []
          };
        }
        
        // 如果有產品資訊，添加到當前報價單的項目中
        if (currentQuote && (row.productId || row.ProductId || row['產品ID'] || row.productName || row.ProductName || row['產品名稱'])) {
          currentQuote.items.push({
            productId: row.productId || row.ProductId || row['產品ID'] || '',
            description: row.itemDescription || row.ItemDescription || row['項目描述'] || '',
            quantity: parseFloat(row.quantity || row.Quantity || row['數量'] || 0),
            unitPrice: parseFloat(row.unitPrice || row.UnitPrice || row['單價'] || 0),
            discount: parseFloat(row.itemDiscount || row.ItemDiscount || row['項目折扣'] || 0),
            amount: parseFloat(row.amount || row.Amount || row['金額'] || 0)
          });
        }
      })
      .on('end', () => {
        // 保存最後一個報價單
        if (currentQuote) {
          quotes.push(currentQuote);
        }
        resolve(quotes);
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
  
  const quotes = [];
  let currentQuote = null;
  
  jsonData.forEach(row => {
    // 檢查是否為新報價單的開始
    if (row.quoteNumber || row.QuoteNumber || row['報價單號']) {
      // 如果已有報價單，先保存
      if (currentQuote) {
        quotes.push(currentQuote);
      }
      
      // 確保客戶ID為整數
      let customerId = row.customerId || row.CustomerId || row['客戶ID'] || '';
      if (customerId && !isNaN(customerId)) {
        customerId = parseInt(customerId, 10);
      }
      
      // 創建新報價單
      currentQuote = {
        quoteNumber: row.quoteNumber || row.QuoteNumber || row['報價單號'] || '',
        customerId: customerId,
        title: row.title || row.Title || row['標題'] || '',
        description: row.description || row.Description || row['描述'] || '',
        issueDate: row.issueDate || row.IssueDate || row['報價日期'] || new Date().toISOString().split('T')[0],
        validUntil: row.validUntil || row.ValidUntil || row['有效期限'] || '',
        status: row.status || row.Status || row['狀態'] || 'draft',
        discountType: row.discountType || row.DiscountType || row['折扣類型'] || '',
        discountValue: parseFloat(row.discountValue || row.DiscountValue || row['折扣值'] || 0),
        taxRate: parseFloat(row.taxRate || row.TaxRate || row['稅率'] || 0),
        notes: row.notes || row.Notes || row['備註'] || '',
        terms: row.terms || row.Terms || row['條款'] || '',
        items: []
      };
    }
    
    // 如果有產品資訊，添加到當前報價單的項目中
    if (currentQuote && (row.productId || row.ProductId || row['產品ID'] || row.productName || row.ProductName || row['產品名稱'])) {
      currentQuote.items.push({
        productId: row.productId || row.ProductId || row['產品ID'] || '',
        description: row.itemDescription || row.ItemDescription || row['項目描述'] || '',
        quantity: parseFloat(row.quantity || row.Quantity || row['數量'] || 0),
        unitPrice: parseFloat(row.unitPrice || row.UnitPrice || row['單價'] || 0),
        discount: parseFloat(row.itemDiscount || row.ItemDiscount || row['項目折扣'] || 0),
        amount: parseFloat(row.amount || row.Amount || row['金額'] || 0)
      });
    }
  });
  
  // 保存最後一個報價單
  if (currentQuote) {
    quotes.push(currentQuote);
  }
  
  return quotes;
}

// 報價單詳情頁面 - 確保在特定路由後面
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    console.log(`正在獲取報價單 ID: ${req.params.id} 的詳情`);
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      console.log(`找不到 ID 為 ${req.params.id} 的報價單`);
      return res.status(404).render('pages/error', {
        title: '找不到報價單',
        message: '找不到指定的報價單'
      });
    }

    console.log(`成功獲取報價單: ${quote.id}, 客戶ID: ${quote.customer_id}`);

    // 取得報價單項目
    const items = await Quote.getItems(quote.id);
    console.log(`獲取到 ${items.length} 個報價單項目`);

    // 取得客戶資料
    const customer = await Customer.findById(quote.customer_id);
    if (!customer) {
      console.log(`警告：找不到報價單關聯的客戶 ID: ${quote.customer_id}`);
    }
    
    // 提供格式化輔助函數
    const formatDate = (dateString) => {
      if (!dateString) return '未設定';
      try {
        return new Date(dateString).toLocaleDateString();
      } catch (e) {
        return '無效日期';
      }
    };

    const formatDateTime = (dateTimeString) => {
      if (!dateTimeString) return '未設定';
      try {
        return new Date(dateTimeString).toLocaleString();
      } catch (e) {
        return '無效日期時間';
      }
    };

    const getStatusText = (status) => {
      switch (status) {
        case 'draft': return '草稿';
        case 'sent': return '已發送';
        case 'accepted': return '已接受';
        case 'rejected': return '已拒絕';
        case 'expired': return '已過期';
        default: return '未知狀態';
      }
    };

    const getStatusBadgeClass = (status) => {
      switch (status) {
        case 'draft': return 'bg-secondary';
        case 'sent': return 'bg-primary';
        case 'accepted': return 'bg-success';
        case 'rejected': return 'bg-danger';
        case 'expired': return 'bg-warning';
        default: return 'bg-secondary';
      }
    };
    
    // 整合數據
    const viewData = {
      title: `報價單 #${quote.quote_number || quote.id}`,
      active: 'quotes',
      quote: {
        ...quote,
        items: items,
        issueDate: quote.issue_date,
        validUntil: quote.valid_until,
        quoteDate: quote.issue_date,
        customer: customer || { name: '未知客戶' },
        createdAt: quote.created_at,
        updatedAt: quote.updated_at
      },
      formatDate,
      formatDateTime,
      getStatusText,
      getStatusBadgeClass
    };

    res.render('pages/quotes/view', viewData);
  } catch (err) {
    console.error('取得報價單詳情錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得報價單詳情時發生錯誤: ' + (err.message || '未知錯誤')
    });
  }
});

module.exports = router;