const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/product');
const { isAuthenticated } = require('../middleware/auth');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 配置文件上傳
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // 使用絕對路徑而不是相對路徑，以避免路徑問題
    const uploadsDir = path.resolve(__dirname, '../uploads');
    console.log('上傳目錄路徑:', uploadsDir);
    
    // 確保目錄存在
    try {
      if (!fs.existsSync(uploadsDir)) {
        console.log('創建上傳目錄:', uploadsDir);
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    } catch (error) {
      console.error('創建上傳目錄失敗:', error);
      // 如果無法創建目錄，則使用系統臨時目錄
      const tempDir = require('os').tmpdir();
      console.log('使用系統臨時目錄:', tempDir);
      cb(null, tempDir);
    }
  },
  filename: function(req, file, cb) {
    const uniqueFileName = `product-import-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    console.log('生成文件名:', uniqueFileName);
    cb(null, uniqueFileName);
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

// 產品列表頁面
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const products = await Product.getAll();
    const categories = await Product.getAllCategories();
    
    res.render('pages/products/index', {
      title: '產品管理',
      active: 'products',
      products,
      categories
    });
  } catch (err) {
    console.error('取得產品列表錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得產品列表時發生錯誤'
    });
  }
});

// 新增產品頁面
router.get('/create', isAuthenticated, async (req, res) => {
  try {
    const categories = await Product.getAllCategories();
    
    res.render('pages/products/create', {
      title: '新增產品',
      active: 'products',
      error: null,
      product: {},
      categories
    });
  } catch (err) {
    console.error('取得產品分類錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得產品分類時發生錯誤'
    });
  }
});

// 處理新增產品請求
router.post('/create', [
  body('name').trim().notEmpty().withMessage('請輸入產品名稱'),
  body('price').isFloat({ min: 0 }).withMessage('價格必須是有效的數字'),
  body('description').optional({ checkFalsy: true }),
  body('sku').optional({ checkFalsy: true }),
  body('unit').optional({ checkFalsy: true }),
  body('categoryId').optional({ checkFalsy: true })
], isAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    try {
      const categories = await Product.getAllCategories();
      return res.render('pages/products/create', {
        title: '新增產品',
        active: 'products',
        error: errors.array()[0].msg,
        product: req.body,
        categories
      });
    } catch (err) {
      console.error('取得產品分類錯誤:', err);
      return res.status(500).render('pages/error', {
        title: '伺服器錯誤',
        message: '取得產品分類時發生錯誤'
      });
    }
  }

  try {
    // 創建新產品
    await Product.create({
      name: req.body.name,
      description: req.body.description,
      sku: req.body.sku,
      price: req.body.price,
      unit: req.body.unit,
      categoryId: req.body.categoryId || null
    });

    res.redirect('/products');
  } catch (err) {
    console.error('創建產品錯誤:', err);
    try {
      const categories = await Product.getAllCategories();
      res.render('pages/products/create', {
        title: '新增產品',
        active: 'products',
        error: '創建產品時發生錯誤',
        product: req.body,
        categories
      });
    } catch (err) {
      console.error('取得產品分類錯誤:', err);
      res.status(500).render('pages/error', {
        title: '伺服器錯誤',
        message: '創建產品時發生錯誤'
      });
    }
  }
});

// 編輯產品頁面 - 確保在 /:id 之前
router.get('/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).render('pages/error', {
        title: '找不到產品',
        message: '找不到指定的產品'
      });
    }

    const categories = await Product.getAllCategories();

    res.render('pages/products/edit', {
      title: '編輯產品',
      active: 'products',
      error: null,
      product,
      categories
    });
  } catch (err) {
    console.error('取得產品資料錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得產品資料時發生錯誤'
    });
  }
});

// 處理編輯產品請求
router.post('/edit/:id', [
  body('name').trim().notEmpty().withMessage('請輸入產品名稱'),
  body('price').isFloat({ min: 0 }).withMessage('價格必須是有效的數字'),
  body('description').optional({ checkFalsy: true }),
  body('sku').optional({ checkFalsy: true }),
  body('unit').optional({ checkFalsy: true }),
  body('categoryId').optional({ checkFalsy: true })
], isAuthenticated, async (req, res) => {
  // 驗證表單
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    try {
      const categories = await Product.getAllCategories();
      return res.render('pages/products/edit', {
        title: '編輯產品',
        active: 'products',
        error: errors.array()[0].msg,
        product: { id: req.params.id, ...req.body },
        categories
      });
    } catch (err) {
      console.error('取得產品分類錯誤:', err);
      return res.status(500).render('pages/error', {
        title: '伺服器錯誤',
        message: '取得產品分類時發生錯誤'
      });
    }
  }

  try {
    // 檢查產品是否存在
    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) {
      return res.status(404).render('pages/error', {
        title: '找不到產品',
        message: '找不到指定的產品'
      });
    }

    // 更新產品資料
    await Product.update(req.params.id, {
      name: req.body.name,
      description: req.body.description,
      sku: req.body.sku,
      price: req.body.price,
      unit: req.body.unit,
      categoryId: req.body.categoryId || null
    });

    res.redirect('/products');
  } catch (err) {
    console.error('更新產品錯誤:', err);
    try {
      const categories = await Product.getAllCategories();
      res.render('pages/products/edit', {
        title: '編輯產品',
        active: 'products',
        error: '更新產品時發生錯誤',
        product: { id: req.params.id, ...req.body },
        categories
      });
    } catch (err) {
      console.error('取得產品分類錯誤:', err);
      res.status(500).render('pages/error', {
        title: '伺服器錯誤',
        message: '更新產品時發生錯誤'
      });
    }
  }
});

// 刪除產品
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    // 檢查產品是否存在
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: '找不到產品' });
    }

    // 刪除產品
    await Product.delete(req.params.id);

    res.json({ success: true });
  } catch (err) {
    console.error('刪除產品錯誤:', err);
    res.status(500).json({ success: false, message: err.message || '刪除產品時發生錯誤' });
  }
});

// API 端點，獲取產品信息，用於報價單項目選擇 - 確保在 /:id 之前
router.get('/api/:id', isAuthenticated, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: '找不到產品' });
    }
    
    res.json({
      id: product.id,
      name: product.name,
      price: product.price,
      sku: product.sku,
      unit: product.unit
    });
  } catch (err) {
    console.error('API 獲取產品錯誤:', err);
    res.status(500).json({ error: '獲取產品信息時發生錯誤' });
  }
});

// 產品批量匯入頁面 - 確保在 /:id 之前
router.get('/import', isAuthenticated, (req, res) => {
  res.render('pages/products/import', {
    title: '批量匯入產品',
    error: null,
    success: null
  });
});

// 處理產品批量匯入
router.post('/import', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('pages/products/import', {
        title: '批量匯入產品',
        error: '請選擇要上傳的檔案',
        success: null
      });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    let products = [];

    // 解析檔案
    if (fileExt === '.csv') {
      // 解析 CSV 檔案
      products = await parseCSV(filePath);
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // 解析 Excel 檔案
      products = parseExcel(filePath);
    }

    // 檢查是否有數據
    if (products.length === 0) {
      return res.render('pages/products/import', {
        title: '批量匯入產品',
        error: '檔案中沒有有效的產品數據',
        success: null
      });
    }

    // 匯入產品
    const importResults = await Product.bulkImport(products);

    // 清理上傳的檔案
    fs.unlinkSync(filePath);

    res.render('pages/products/import', {
      title: '批量匯入產品',
      error: null,
      success: `成功匯入 ${importResults.success} 筆產品資料，失敗 ${importResults.failed} 筆。`,
      results: importResults
    });
  } catch (err) {
    console.error('產品匯入錯誤:', err);
    res.render('pages/products/import', {
      title: '批量匯入產品',
      error: '匯入過程發生錯誤: ' + err.message,
      success: null
    });
  }
});

// 產品詳情頁面 - 確保在特定路由後面
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).render('pages/error', {
        title: '找不到產品',
        message: '找不到指定的產品'
      });
    }

    res.render('pages/products/view', {
      title: product.name,
      active: 'products',
      product
    });
  } catch (err) {
    console.error('取得產品詳情錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '取得產品詳情時發生錯誤'
    });
  }
});

// 解析 CSV 檔案
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const products = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        products.push({
          name: row.name || row.Name || row['產品名稱'] || '',
          description: row.description || row.Description || row['產品描述'] || '',
          sku: row.sku || row.SKU || row['產品編號'] || '',
          price: parseFloat(row.price || row.Price || row['價格'] || 0),
          unit: row.unit || row.Unit || row['單位'] || '',
          categoryId: parseInt(row.category_id || row.categoryId || row.CategoryId || row['分類ID'] || 0) || null
        });
      })
      .on('end', () => {
        resolve(products);
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
    name: row.name || row.Name || row['產品名稱'] || '',
    description: row.description || row.Description || row['產品描述'] || '',
    sku: row.sku || row.SKU || row['產品編號'] || '',
    price: parseFloat(row.price || row.Price || row['價格'] || 0),
    unit: row.unit || row.Unit || row['單位'] || '',
    categoryId: parseInt(row.category_id || row.categoryId || row.CategoryId || row['分類ID'] || 0) || null
  }));
}

module.exports = router; 