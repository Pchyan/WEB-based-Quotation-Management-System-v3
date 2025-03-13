const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const Quote = require('../models/quote');
const Customer = require('../models/customer');
const Product = require('../models/product');
const User = require('../models/user');
const ExcelJS = require('exceljs');
const path = require('path');

// 通用函數: 設置Excel文件的標頭，讓瀏覽器下載它
const setExcelResponseHeaders = (res, filename) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.setHeader('Cache-Control', 'max-age=0');
};

// 通用函數: 格式化貨幣
const formatCurrency = (value) => {
  if (typeof value !== 'number') {
    value = parseFloat(value) || 0;
  }
  return value.toFixed(2);
};

// 通用函數: 格式化日期為 YYYY-MM-DD
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// 報表首頁
router.get('/', isAuthenticated, async (req, res) => {
  try {
    res.render('pages/reports/index', {
      title: '報表中心',
      active: 'reports'
    });
  } catch (err) {
    console.error('載入報表頁面錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '載入報表頁面時發生錯誤'
    });
  }
});

// 銷售報表
router.get('/sales', isAuthenticated, async (req, res) => {
  try {
    // 獲取查詢參數 (支持兩種參數名稱)
    const { startDate, endDate, fromDate, toDate, status, groupBy } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 1); // 默認顯示最近一個月
    
    // 優先使用 startDate/endDate，其次使用 fromDate/toDate
    const queryStartDate = startDate ? new Date(startDate) : (fromDate ? new Date(fromDate) : defaultStartDate);
    const queryEndDate = endDate ? new Date(endDate) : (toDate ? new Date(toDate) : defaultEndDate);
    
    console.log(`銷售報表 - 查詢時間範圍: ${queryStartDate.toISOString()} 至 ${queryEndDate.toISOString()}${groupBy ? ', 分組方式: ' + groupBy : ''}`);
    
    // 獲取報價數據
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    console.log(`銷售報表 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 如果指定了狀態，則過濾結果
    let filteredQuotes = quotes;
    if (status && status !== 'all') {
      filteredQuotes = quotes.filter(quote => quote.status === status);
      console.log(`銷售報表 - 過濾狀態 "${status}" 後剩餘 ${filteredQuotes.length} 筆數據`);
    }
    
    // 計算統計數據
    const totalQuotes = filteredQuotes.length;
    const totalAmount = filteredQuotes.reduce((sum, quote) => {
      const quoteTotal = parseFloat(quote.total) || 0;
      return sum + quoteTotal;
    }, 0);
    
    const acceptedQuotes = filteredQuotes.filter(quote => quote.status === 'accepted').length;
    const acceptanceRate = totalQuotes > 0 ? (acceptedQuotes / totalQuotes * 100).toFixed(2) : 0;
    
    // 按月份分組的數據 (處理不同的 groupBy 參數)
    const monthlyData = {};
    filteredQuotes.forEach(quote => {
      // 處理報價單日期，優先使用 issue_date，兼容 quoteDate
      const quoteDate = quote.issue_date || quote.quoteDate || quote.created_at || new Date().toISOString();
      
      try {
        let periodKey;
        
        if (groupBy === 'week') {
          // 按週分組
          const date = new Date(quoteDate);
          const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
          const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
          const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
          periodKey = `${date.getFullYear()}年第${weekNumber}週`;
        } else if (groupBy === 'quarter') {
          // 按季度分組
          const date = new Date(quoteDate);
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          periodKey = `${date.getFullYear()}年第${quarter}季度`;
        } else {
          // 默認按月分組
          periodKey = new Date(quoteDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
        }
        
        if (!monthlyData[periodKey]) {
          monthlyData[periodKey] = {
            count: 0,
            amount: 0,
            accepted: 0
          };
        }
        
        monthlyData[periodKey].count++;
        monthlyData[periodKey].amount += parseFloat(quote.total) || 0;
        if (quote.status === 'accepted') {
          monthlyData[periodKey].accepted++;
        }
      } catch (err) {
        console.error(`處理報價單 ID: ${quote.id} 的日期時出錯:`, err);
      }
    });
    
    // 轉換為數組以便在模板中使用
    const monthlyStats = Object.keys(monthlyData).map(month => ({
      month,
      count: monthlyData[month].count,
      amount: monthlyData[month].amount,
      accepted: monthlyData[month].accepted,
      acceptanceRate: monthlyData[month].count > 0 
        ? (monthlyData[month].accepted / monthlyData[month].count * 100).toFixed(2) 
        : 0
    }));
    
    // 按客戶分組的統計
    const customerData = {};
    filteredQuotes.forEach(quote => {
      const customerId = quote.customer_id;
      const customerName = quote.customer_name || '未知客戶';
      const key = `${customerId}-${customerName}`;
      
      if (!customerData[key]) {
        customerData[key] = {
          id: customerId,
          name: customerName,
          count: 0,
          amount: 0,
          accepted: 0
        };
      }
      
      customerData[key].count++;
      customerData[key].amount += parseFloat(quote.total) || 0;
      if (quote.status === 'accepted') {
        customerData[key].accepted++;
      }
    });
    
    // 轉換為數組並按銷售額降序排序
    const customerStats = Object.values(customerData)
      .map(customer => ({
        ...customer,
        acceptanceRate: customer.count > 0 ? (customer.accepted / customer.count * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10); // 只取前10個客戶
    
    // 數據格式化輔助函數
    const formatCurrency = (value) => {
      return parseFloat(value).toLocaleString('zh-TW', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
    
    const formatDate = (dateString) => {
      if (!dateString) return '未設定';
      try {
        return new Date(dateString).toLocaleDateString('zh-TW');
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
    
    // 準備頁面標題
    let reportTitle = '銷售報表';
    if (groupBy) {
      if (groupBy === 'week') {
        reportTitle += ' (按週)';
      } else if (groupBy === 'quarter') {
        reportTitle += ' (按季度)';
      } else {
        reportTitle += ' (按月)';
      }
    }
    
    // 渲染報表頁面
    res.render('pages/reports/sales', {
      title: reportTitle,
      active: 'reports',
      quotes: filteredQuotes,
      startDate: startDate || fromDate || queryStartDate.toISOString().split('T')[0],
      endDate: endDate || toDate || queryEndDate.toISOString().split('T')[0],
      status: status || 'all',
      groupBy: groupBy || 'month',
      totalQuotes,
      totalAmount,
      acceptedQuotes,
      acceptanceRate,
      monthlyStats,
      customerStats, // 確保在所有情況下都傳遞 customerStats
      formatCurrency,
      formatDate,
      getStatusText,
      getStatusBadgeClass
    });
  } catch (err) {
    console.error('載入銷售報表錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '載入銷售報表時發生錯誤: ' + err.message
    });
  }
});

// 銷售報表 Excel 匯出
router.get('/sales/export', isAuthenticated, async (req, res) => {
  try {
    // 獲取查詢參數 (支持兩種參數名稱)
    const { startDate, endDate, fromDate, toDate, status, groupBy } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 1); // 默認顯示最近一個月
    
    // 優先使用 startDate/endDate，其次使用 fromDate/toDate
    const queryStartDate = startDate ? new Date(startDate) : (fromDate ? new Date(fromDate) : defaultStartDate);
    const queryEndDate = endDate ? new Date(endDate) : (toDate ? new Date(toDate) : defaultEndDate);
    
    console.log(`銷售報表 Excel 匯出 - 查詢時間範圍: ${queryStartDate.toISOString()} 至 ${queryEndDate.toISOString()}${groupBy ? ', 分組方式: ' + groupBy : ''}`);
    
    // 獲取報價數據
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    console.log(`銷售報表 Excel 匯出 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 如果指定了狀態，則過濾結果
    let filteredQuotes = quotes;
    if (status && status !== 'all') {
      filteredQuotes = quotes.filter(quote => quote.status === status);
    }
    
    // 創建一個新的Excel工作簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Quotation Management System';
    workbook.lastModifiedBy = req.user ? req.user.username || '系統用戶' : '系統用戶';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // 添加一個工作表
    const worksheet = workbook.addWorksheet('銷售報表');
    
    // 設置列頭
    worksheet.columns = [
      { header: '報價單號', key: 'quoteNumber', width: 15 },
      { header: '日期', key: 'date', width: 12 },
      { header: '客戶', key: 'customerName', width: 20 },
      { header: '聯絡人', key: 'contactName', width: 15 },
      { header: '總金額', key: 'totalAmount', width: 15, style: { numFmt: '#,##0.00' } },
      { header: '狀態', key: 'status', width: 12 },
      { header: '業務人員', key: 'salesPerson', width: 15 },
      { header: '最後更新', key: 'updatedAt', width: 18 }
    ];
    
    // 添加標題樣式
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // 添加報表數據
    filteredQuotes.forEach(quote => {
      // 打印某一個報價單數據，用於調試
      console.log(`處理報價單: ${JSON.stringify(quote)}`);
      
      worksheet.addRow({
        quoteNumber: quote.quote_number || quote.quoteNumber || '',
        date: formatDate(quote.issue_date || quote.created_at || quote.createdAt || ''),
        customerName: quote.customer_name || quote.customerName || '',
        contactName: quote.contact_name || quote.contactName || '',
        totalAmount: parseFloat(quote.total_amount || quote.total || 0),
        status: getStatusText(quote.status || ''),
        salesPerson: quote.created_by_name || quote.createdByName || '',
        updatedAt: formatDate(quote.updated_at || quote.updatedAt || '')
      });
    });
    
    // 添加統計行
    worksheet.addRow({});
    const totalRow = worksheet.addRow({
      quoteNumber: '總計',
      totalAmount: filteredQuotes.reduce((sum, q) => sum + parseFloat(q.total_amount || q.total || 0), 0)
    });
    totalRow.font = { bold: true };
    
    // 設置回應頭部並發送文件
    const filename = `銷售報表_${formatDate(queryStartDate)}_到_${formatDate(queryEndDate)}.xlsx`;
    setExcelResponseHeaders(res, filename);
    
    // 將工作簿寫入響應
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('產生銷售報表 Excel 錯誤:', err);
    res.status(500).json({ error: '產生 Excel 時發生錯誤', details: err.message });
  }
});

// 狀態文字對照函數
function getStatusText(status) {
  const statusMap = {
    'draft': '草稿',
    'sent': '已發送',
    'accepted': '已接受',
    'rejected': '已拒絕',
    'expired': '已過期'
  };
  return statusMap[status] || status;
}

// 客戶報表
router.get('/customers', isAuthenticated, async (req, res) => {
  try {
    // 從請求中獲取日期範圍和排序參數，支持兩種參數名稱
    let { startDate, endDate, fromDate, toDate, sortBy } = req.query;
    
    // 如果沒有指定日期範圍，默認顯示過去3個月的數據
    const today = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(today.getMonth() - 3);
    
    // 優先使用 startDate/endDate，如果沒有則使用 fromDate/toDate
    const queryStartDate = startDate ? new Date(startDate) : (fromDate ? new Date(fromDate) : threeMonthsAgo);
    const queryEndDate = endDate ? new Date(endDate) : (toDate ? new Date(toDate) : today);
    
    // 默認按總額排序
    sortBy = sortBy || 'amount';
    
    console.log(`客戶報表 - 日期範圍: ${queryStartDate.toISOString()} 到 ${queryEndDate.toISOString()}, 排序方式: ${sortBy}`);
    
    // 獲取所有客戶
    const customers = await Customer.getAll();
    console.log(`客戶報表 - 獲取到 ${customers.length} 個客戶`);
    
    // 獲取該日期範圍內的所有報價單
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    console.log(`客戶報表 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 計算每個客戶的統計數據
    const customerStats = [];
    
    // 對每個客戶計算統計數據
    customers.forEach(customer => {
      // 找出屬於該客戶的報價單
      const customerQuotes = quotes.filter(quote => {
        const customerId = parseInt(quote.customer_id) || 0;
        const currentId = parseInt(customer.id) || 0;
        return customerId === currentId;
      });
      
      // 即使沒有報價單，也添加客戶數據，但設置數值為 0
      // 計算總額、已接受金額、數量等
      const totalQuotes = customerQuotes.length;
      const totalAmount = customerQuotes.reduce((sum, q) => sum + (parseFloat(q.total) || 0), 0);
      const acceptedQuotes = customerQuotes.filter(q => q.status === 'accepted').length;
      const acceptanceRate = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;
      
      customerStats.push({
        id: customer.id,
        name: customer.name,
        contactPerson: customer.contact_person || customer.contactPerson || '',
        email: customer.email || '',
        phone: customer.phone || '',
        totalQuotes: totalQuotes,
        totalAmount: totalAmount,
        acceptedQuotes: acceptedQuotes,
        acceptanceRate: acceptanceRate
      });
    });
    
    // 根據指定的方式排序
    if (sortBy === 'name') {
      customerStats.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'total') {
      customerStats.sort((a, b) => b.totalQuotes - a.totalQuotes);
    } else if (sortBy === 'amount') {
      customerStats.sort((a, b) => b.totalAmount - a.totalAmount);
    } else if (sortBy === 'conversion') {
      customerStats.sort((a, b) => b.acceptanceRate - a.acceptanceRate);
    }
    
    // 格式化貨幣顯示
    const formatCurrency = (value) => {
      return parseFloat(value).toLocaleString('zh-TW', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
    
    // 渲染客戶報表頁面
    res.render('pages/reports/customers', {
      title: '客戶報表',
      startDate: startDate || fromDate || queryStartDate.toISOString().split('T')[0],
      endDate: endDate || toDate || queryEndDate.toISOString().split('T')[0],
      sortBy,
      customerStats,
      formatCurrency,
      active: 'reports'
    });
    
  } catch (error) {
    console.error('獲取客戶報表時出錯:', error);
    res.status(500).render('pages/error', { 
      title: '伺服器錯誤',
      message: '獲取客戶報表時出錯: ' + error.message,
      error: '獲取客戶報表時出錯'
    });
  }
});

// 客戶報表 Excel 匯出
router.get('/customers/export', isAuthenticated, async (req, res) => {
  try {
    // 獲取查詢參數
    const { startDate, endDate, sortBy } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 3); // 默認顯示最近三個月
    
    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
    
    console.log(`客戶報表 Excel 匯出 - 日期範圍: ${queryStartDate.toISOString()} 到 ${queryEndDate.toISOString()}, 排序方式: ${sortBy || 'amount'}`);
    
    // 獲取所有客戶
    const customers = await Customer.getAll();
    console.log(`客戶報表 Excel 匯出 - 獲取到 ${customers.length} 個客戶`);
    
    // 獲取日期範圍內的報價單
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    console.log(`客戶報表 Excel 匯出 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 打印第一個客戶和報價單，用於調試
    if (customers.length > 0) {
      console.log(`客戶數據樣本: ${JSON.stringify(customers[0])}`);
    }
    if (quotes.length > 0) {
      console.log(`報價單數據樣本: ${JSON.stringify(quotes[0])}`);
    }
    
    // 整理客戶統計數據
    const customerStats = [];
    
    // 先建立客戶映射，確保所有客戶都包含在結果中
    const customerMap = {};
    customers.forEach(customer => {
      const customerId = customer.id.toString();
      customerMap[customerId] = {
        id: customer.id,
        name: customer.name || '',
        contact: customer.contact_person || customer.contact_name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        totalQuotes: 0,
        acceptedQuotes: 0,
        acceptanceRate: 0,
        totalAmount: 0
      };
    });
    
    // 整理報價單數據
    quotes.forEach(quote => {
      const customerId = (quote.customer_id || quote.customerId || '').toString();
      if (customerId && customerMap[customerId]) {
        const customer = customerMap[customerId];
        customer.totalQuotes += 1;
        
        if (quote.status === 'accepted') {
          customer.acceptedQuotes += 1;
          customer.totalAmount += parseFloat(quote.total_amount || quote.total || 0);
        }
      }
    });
    
    // 計算接受率並添加到customerStats數組
    Object.values(customerMap).forEach(customer => {
      if (customer.totalQuotes > 0) {
        customer.acceptanceRate = (customer.acceptedQuotes / customer.totalQuotes) * 100;
      }
      
      customerStats.push(customer);
    });
    
    // 根據指定欄位排序
    const sortOrder = sortBy || 'amount';
    if (sortOrder === 'name') {
      customerStats.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'quotes') {
      customerStats.sort((a, b) => b.totalQuotes - a.totalQuotes);
    } else if (sortOrder === 'conversion') {
      customerStats.sort((a, b) => b.acceptanceRate - a.acceptanceRate);
    } else { // 默認按金額排序
      customerStats.sort((a, b) => b.totalAmount - a.totalAmount);
    }
    
    // 創建一個新的Excel工作簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Quotation Management System';
    workbook.lastModifiedBy = req.user ? req.user.username || '系統用戶' : '系統用戶';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // 添加一個工作表
    const worksheet = workbook.addWorksheet('客戶報表');
    
    // 設置列頭
    worksheet.columns = [
      { header: '客戶名稱', key: 'name', width: 25 },
      { header: '聯絡人', key: 'contact', width: 15 },
      { header: '電話', key: 'phone', width: 15 },
      { header: '電子郵件', key: 'email', width: 25 },
      { header: '報價單數量', key: 'totalQuotes', width: 12 },
      { header: '已接受數量', key: 'acceptedQuotes', width: 12 },
      { header: '接受率 (%)', key: 'acceptanceRate', width: 12, style: { numFmt: '0.00%' } },
      { header: '總金額', key: 'totalAmount', width: 15, style: { numFmt: '#,##0.00' } }
    ];
    
    // 添加標題樣式
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // 添加報表數據
    customerStats.forEach(customer => {
      const row = worksheet.addRow({
        name: customer.name,
        contact: customer.contact,
        phone: customer.phone,
        email: customer.email,
        totalQuotes: customer.totalQuotes,
        acceptedQuotes: customer.acceptedQuotes,
        acceptanceRate: customer.acceptanceRate / 100, // 轉為小數供Excel格式化
        totalAmount: customer.totalAmount
      });
      
      // 顯著標記高接受率的客戶 (例如超過50%)
      if (customer.acceptanceRate > 50) {
        row.getCell('acceptanceRate').font = {
          color: { argb: '00AA00' } // 綠色
        };
      }
    });
    
    // 添加統計行
    worksheet.addRow({});
    const totalRow = worksheet.addRow({
      name: '總計',
      totalQuotes: customerStats.reduce((sum, c) => sum + c.totalQuotes, 0),
      acceptedQuotes: customerStats.reduce((sum, c) => sum + c.acceptedQuotes, 0),
      acceptanceRate: customerStats.reduce((sum, c) => sum + c.totalQuotes, 0) > 0 ? 
        customerStats.reduce((sum, c) => sum + c.acceptedQuotes, 0) / customerStats.reduce((sum, c) => sum + c.totalQuotes, 0) : 0,
      totalAmount: customerStats.reduce((sum, c) => sum + c.totalAmount, 0)
    });
    totalRow.font = { bold: true };
    
    // 設置回應頭部並發送文件
    const filename = `客戶報表_${formatDate(queryStartDate)}_到_${formatDate(queryEndDate)}.xlsx`;
    setExcelResponseHeaders(res, filename);
    
    // 將工作簿寫入響應
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('產生客戶報表 Excel 錯誤:', err);
    res.status(500).json({ error: '產生 Excel 時發生錯誤', details: err.message });
  }
});

// 產品銷售報表
router.get('/products', isAuthenticated, async (req, res) => {
  try {
    // 從請求中獲取日期範圍、類別和排序參數，支持兩種參數名稱
    let { startDate, endDate, fromDate, toDate, category, sortBy, sort } = req.query;
    
    // 如果沒有指定日期範圍，默認顯示過去3個月的數據
    const today = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(today.getMonth() - 3);
    
    // 優先使用 startDate/endDate，如果沒有則使用 fromDate/toDate
    const queryStartDate = startDate ? new Date(startDate) : (fromDate ? new Date(fromDate) : threeMonthsAgo);
    const queryEndDate = endDate ? new Date(endDate) : (toDate ? new Date(toDate) : today);
    
    // 兼容舊的參數名稱 sort，並默認按總額排序
    sortBy = sortBy || sort || 'amount';
    
    console.log(`產品報表 - 日期範圍: ${queryStartDate.toISOString()} 到 ${queryEndDate.toISOString()}, 類別: ${category || '全部'}, 排序方式: ${sortBy}`);
    
    // 獲取所有產品 - 根據類別過濾
    let products;
    if (category && category !== 'all') {
      products = await Product.getByCategoryId(category);
    } else {
      products = await Product.getAll();
    }
    console.log(`產品報表 - 獲取到 ${products.length} 個產品`);
    
    // 獲取該日期範圍內的所有報價單
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    console.log(`產品報表 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 收集所有報價單項目
    const allItems = [];
    for (const quote of quotes) {
      try {
        const items = await Quote.getItems(quote.id);
        console.log(`產品報表 - 報價單 ${quote.id} 有 ${items.length} 個產品項目`);
        
        items.forEach(item => {
          allItems.push({
            quoteId: quote.id,
            quoteStatus: quote.status,
            productId: item.product_id || item.productId,
            productName: item.product_name || item.productName,
            quantity: item.quantity || 0,
            unitPrice: item.unit_price || item.unitPrice || 0,
            amount: (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price || item.unitPrice) || 0)
          });
        });
      } catch (err) {
        console.error(`獲取報價單 ${quote.id} 項目時出錯:`, err);
      }
    }
    
    console.log(`產品報表 - 總共有 ${allItems.length} 個產品項目`);
    
    // 計算每個產品的統計數據
    const productStats = [];
    
    // 按產品ID對項目進行分組
    const itemsByProduct = {};
    allItems.forEach(item => {
      const productId = item.productId ? (typeof item.productId === 'number' ? item.productId.toString() : item.productId) : null;
      if (productId) {
        if (!itemsByProduct[productId]) {
          itemsByProduct[productId] = [];
        }
        itemsByProduct[productId].push(item);
      }
    });
    
    // 計算每個產品的統計數據
    products.forEach(product => {
      const productId = product.id.toString();
      const items = itemsByProduct[productId] || [];
      
      if (items.length > 0) {
        // 計算產品數據
        const totalQuotes = new Set(items.map(item => item.quoteId)).size;
        const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        
        // 計算已接受的報價數據
        const acceptedItems = items.filter(item => item.quoteStatus === 'accepted');
        const acceptedQuotes = new Set(acceptedItems.map(item => item.quoteId)).size;
        const acceptedQuantity = acceptedItems.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        const acceptedAmount = acceptedItems.reduce((sum, item) => sum + (item.amount || 0), 0);
        
        // 計算轉換率
        const conversionRate = totalQuotes > 0 ? Math.round((acceptedQuotes / totalQuotes) * 100) : 0;
        
        productStats.push({
          id: productId,
          name: product.name,
          sku: product.sku || '',
          price: product.price || 0,
          category: product.category_name || product.categoryName || '',
          total: totalQuotes,
          quantity: totalQuantity,
          amount: totalAmount,
          accepted: acceptedQuotes,
          acceptedQuantity: acceptedQuantity,
          acceptedAmount: acceptedAmount,
          conversionRate: conversionRate
        });
      }
    });
    
    // 根據指定的方式排序
    if (sortBy === 'name') {
      productStats.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'total') {
      productStats.sort((a, b) => b.total - a.total);
    } else if (sortBy === 'quantity') {
      productStats.sort((a, b) => b.quantity - a.quantity);
    } else if (sortBy === 'amount') {
      productStats.sort((a, b) => b.amount - a.amount);
    } else if (sortBy === 'conversion') {
      productStats.sort((a, b) => b.conversionRate - a.conversionRate);
    } else {
      productStats.sort((a, b) => b.amount - a.amount); // 默認按總金額排序
    }
    
    // 獲取所有產品類別，用於下拉篩選
    const categories = await Product.getAllCategories();
    
    // 格式化貨幣顯示
    const formatCurrency = (value) => {
      return parseFloat(value).toLocaleString('zh-TW', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
    
    // 渲染產品報表頁面
    res.render('pages/reports/products', {
      title: '產品銷售報表',
      startDate: startDate || fromDate || queryStartDate.toISOString().split('T')[0],
      endDate: endDate || toDate || queryEndDate.toISOString().split('T')[0],
      category: category || 'all',
      sortBy: sortBy,
      categories,
      productStats,
      formatCurrency,
      active: 'reports'
    });
    
  } catch (error) {
    console.error('獲取產品報表時出錯:', error);
    res.status(500).render('pages/error', { 
      title: '伺服器錯誤',
      message: '獲取產品報表時出錯: ' + error.message,
      error: '獲取產品報表時出錯'
    });
  }
});

// 產品銷售報表 Excel 匯出
router.get('/products/export', isAuthenticated, async (req, res) => {
  try {
    // 獲取查詢參數
    const { startDate, endDate, category, sortBy } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 3); // 默認顯示最近三個月
    
    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
    const categoryId = category && category !== 'all' ? parseInt(category) : null;
    
    console.log(`產品報表 Excel 匯出 - 日期範圍: ${queryStartDate.toISOString()} 到 ${queryEndDate.toISOString()}, 類別: ${categoryId ? categoryId : '全部'}, 排序方式: ${sortBy || 'amount'}`);
    
    // 獲取所有產品或根據類別篩選
    let products = [];
    if (categoryId) {
      products = await Product.getByCategoryId(categoryId);
    } else {
      products = await Product.getAll();
    }
    console.log(`產品報表 Excel 匯出 - 獲取到 ${products.length} 個產品`);
    
    // 打印第一個產品樣本數據，用於調試
    if (products.length > 0) {
      console.log(`產品數據樣本: ${JSON.stringify(products[0])}`);
    }
    
    // 獲取日期範圍內的報價單
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    console.log(`產品報表 Excel 匯出 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 整理產品統計數據
    const productStats = [];
    const productMap = {};
    
    // 先建立產品映射
    products.forEach(product => {
      const productId = product.id.toString();
      productMap[productId] = {
        id: product.id,
        name: product.name || '',
        sku: product.sku || '',
        category: product.category_name || product.categoryName || '',
        price: parseFloat(product.price || 0),
        quantity: 0,
        amount: 0,
        acceptedQuantity: 0,
        acceptedAmount: 0,
        conversionRate: 0
      };
    });
    
    // 處理報價單數據
    for (const quote of quotes) {
      try {
        // 獲取報價單項目
        const items = await Quote.getItems(quote.id);
        console.log(`產品報表 Excel 匯出 - 報價單 ${quote.id} 有 ${items.length} 個產品項目`);
        
        if (items.length > 0 && items[0]) {
          console.log(`第一個產品項目數據樣本: ${JSON.stringify(items[0])}`);
        }
        
        items.forEach(item => {
          const productId = (item.product_id || item.productId || '').toString();
          if (productId && productMap[productId]) {
            const product = productMap[productId];
            const itemQuantity = parseInt(item.quantity || 0);
            const itemPrice = parseFloat(item.unit_price || item.unitPrice || 0);
            const itemAmount = parseFloat(item.amount || (itemQuantity * itemPrice) || 0);
            
            product.quantity += itemQuantity;
            product.amount += itemAmount;
            
            if (quote.status === 'accepted') {
              product.acceptedQuantity += itemQuantity;
              product.acceptedAmount += itemAmount;
            }
          }
        });
      } catch (error) {
        console.error(`獲取報價單 ${quote.id} 項目時出錯:`, error);
      }
    }
    
    // 計算轉換率並添加到統計數組
    Object.values(productMap).forEach(product => {
      if (product.quantity > 0) {
        product.conversionRate = product.quantity > 0 ? (product.acceptedQuantity / product.quantity) * 100 : 0;
        productStats.push(product);
      }
    });
    
    console.log(`產品報表 Excel 匯出 - 總共有 ${productStats.length} 個產品項目`);
    
    // 根據指定欄位排序
    const sortOrder = sortBy || 'amount';
    if (sortOrder === 'name') {
      productStats.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'quantity') {
      productStats.sort((a, b) => b.quantity - a.quantity);
    } else if (sortOrder === 'conversion') {
      productStats.sort((a, b) => b.conversionRate - a.conversionRate);
    } else { // 默認按金額排序
      productStats.sort((a, b) => b.amount - a.amount);
    }
    
    // 創建一個新的Excel工作簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Quotation Management System';
    workbook.lastModifiedBy = req.user ? req.user.username || '系統用戶' : '系統用戶';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // 添加一個工作表
    const worksheet = workbook.addWorksheet('產品銷售報表');
    
    // 設置列頭
    worksheet.columns = [
      { header: '產品名稱', key: 'name', width: 30 },
      { header: '產品編號', key: 'sku', width: 15 },
      { header: '類別', key: 'category', width: 15 },
      { header: '單價', key: 'price', width: 12, style: { numFmt: '#,##0.00' } },
      { header: '銷售數量', key: 'quantity', width: 10 },
      { header: '銷售金額', key: 'amount', width: 15, style: { numFmt: '#,##0.00' } },
      { header: '已接受數量', key: 'acceptedQuantity', width: 12 },
      { header: '已接受金額', key: 'acceptedAmount', width: 15, style: { numFmt: '#,##0.00' } },
      { header: '轉換率 (%)', key: 'conversionRate', width: 12, style: { numFmt: '0.00%' } }
    ];
    
    // 添加標題樣式
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // 添加報表數據
    productStats.forEach(product => {
      const row = worksheet.addRow({
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        quantity: product.quantity,
        amount: product.amount,
        acceptedQuantity: product.acceptedQuantity,
        acceptedAmount: product.acceptedAmount,
        conversionRate: product.conversionRate / 100 // 轉為小數供Excel格式化
      });
      
      // 顯著標記高轉換率的產品 (例如超過50%)
      if (product.conversionRate > 50) {
        row.getCell('conversionRate').font = {
          color: { argb: '00AA00' } // 綠色
        };
      }
    });
    
    // 添加統計行
    worksheet.addRow({});
    const totalRow = worksheet.addRow({
      name: '總計',
      quantity: productStats.reduce((sum, p) => sum + p.quantity, 0),
      amount: productStats.reduce((sum, p) => sum + p.amount, 0),
      acceptedQuantity: productStats.reduce((sum, p) => sum + p.acceptedQuantity, 0),
      acceptedAmount: productStats.reduce((sum, p) => sum + p.acceptedAmount, 0),
      conversionRate: productStats.reduce((sum, p) => sum + p.quantity, 0) > 0 ? 
        productStats.reduce((sum, p) => sum + p.acceptedQuantity, 0) / productStats.reduce((sum, p) => sum + p.quantity, 0) : 0
    });
    totalRow.font = { bold: true };
    
    // 設置回應頭部並發送文件
    const filename = `產品銷售報表_${formatDate(queryStartDate)}_到_${formatDate(queryEndDate)}.xlsx`;
    setExcelResponseHeaders(res, filename);
    
    // 將工作簿寫入響應
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('產生產品報表 Excel 錯誤:', err);
    res.status(500).json({ error: '產生 Excel 時發生錯誤', details: err.message });
  }
});

// 報價轉換率報表
router.get('/conversion', isAuthenticated, async (req, res) => {
  try {
    // 從請求中獲取日期範圍參數，支持兩種參數名稱
    let { startDate, endDate, fromDate, toDate, period } = req.query;
    
    // 如果沒有指定日期範圍，默認顯示過去6個月的數據
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    
    // 優先使用 startDate/endDate，如果沒有則使用 fromDate/toDate
    const queryStartDate = startDate ? new Date(startDate) : (fromDate ? new Date(fromDate) : sixMonthsAgo);
    const queryEndDate = endDate ? new Date(endDate) : (toDate ? new Date(toDate) : today);
    
    // 如果沒有指定分組方式，默認按月分組
    const queryPeriod = period || 'month';
    
    console.log(`轉換率報表 - 日期範圍: ${queryStartDate.toISOString()} 到 ${queryEndDate.toISOString()}, 分組方式: ${queryPeriod}`);
    
    // 獲取該日期範圍內的所有報價單
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    console.log(`轉換率報表 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 按時間分組處理數據
    const periodData = {};
    
    quotes.forEach(quote => {
      let periodKey;
      // 處理報價單日期，優先使用 issue_date，兼容 quoteDate
      const quoteDate = new Date(quote.issue_date || quote.quoteDate || quote.created_at || new Date().toISOString());
      
      try {
        if (queryPeriod === 'week') {
          // 按週分組
          const firstDayOfYear = new Date(quoteDate.getFullYear(), 0, 1);
          const pastDaysOfYear = (quoteDate - firstDayOfYear) / 86400000;
          const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
          periodKey = `${quoteDate.getFullYear()}年第${weekNumber}週`;
        } else if (queryPeriod === 'quarter') {
          // 按季度分組
          const quarter = Math.floor(quoteDate.getMonth() / 3) + 1;
          periodKey = `${quoteDate.getFullYear()}年第${quarter}季度`;
        } else {
          // 默認按月分組
          periodKey = quoteDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
        }
        
        if (!periodData[periodKey]) {
          periodData[periodKey] = {
            total: 0,
            draft: 0,
            sent: 0,
            accepted: 0,
            rejected: 0,
            amount: 0,
            acceptedAmount: 0
          };
        }
        
        periodData[periodKey].total++;
        
        // 根據報價單狀態累加數量
        if (quote.status) {
          periodData[periodKey][quote.status]++;
        }
        
        // 累加金額
        const quoteTotal = parseFloat(quote.total_amount || quote.total || 0);
        periodData[periodKey].amount += quoteTotal;
        
        if (quote.status === 'accepted') {
          periodData[periodKey].acceptedAmount += quoteTotal;
        }
      } catch (err) {
        console.error(`處理報價單 ID: ${quote.id} 的日期時出錯:`, err);
      }
    });
    
    // 轉換為數組以便在模板中使用，並按時間排序
    const periodKeys = Object.keys(periodData);
    console.log(`轉換率報表 - 分組後有 ${periodKeys.length} 個時間段`);
    
    const conversionStats = periodKeys.map(period => ({
      period,
      total: periodData[period].total,
      draft: periodData[period].draft || 0,
      sent: periodData[period].sent || 0,
      accepted: periodData[period].accepted || 0,
      rejected: periodData[period].rejected || 0,
      amount: periodData[period].amount,
      acceptedAmount: periodData[period].acceptedAmount,
      conversionRate: periodData[period].total > 0 
        ? (periodData[period].accepted / periodData[period].total * 100).toFixed(2) 
        : 0,
      amountConversionRate: periodData[period].amount > 0 
        ? (periodData[period].acceptedAmount / periodData[period].amount * 100).toFixed(2) 
        : 0
    }));
    
    // 按日期排序（最近的日期在前）
    conversionStats.sort((a, b) => {
      // 對於年季度格式，例如 "2023年第3季度"
      if (a.period.includes('季度') && b.period.includes('季度')) {
        const yearA = parseInt(a.period.split('年')[0]);
        const yearB = parseInt(b.period.split('年')[0]);
        if (yearA !== yearB) return yearB - yearA;
        
        const quarterA = parseInt(a.period.split('第')[1]);
        const quarterB = parseInt(b.period.split('第')[1]);
        return quarterB - quarterA;
      }
      
      // 對於年週格式，例如 "2023年第15週"
      if (a.period.includes('週') && b.period.includes('週')) {
        const yearA = parseInt(a.period.split('年')[0]);
        const yearB = parseInt(b.period.split('年')[0]);
        if (yearA !== yearB) return yearB - yearA;
        
        const weekA = parseInt(a.period.split('第')[1]);
        const weekB = parseInt(b.period.split('第')[1]);
        return weekB - weekA;
      }
      
      // 對於年月格式，例如 "2023年5月"
      try {
        const dateA = new Date(a.period);
        const dateB = new Date(b.period);
        return dateB - dateA;
      } catch (e) {
        return 0;
      }
    });
    
    // 計算總體統計數據
    const totalStats = {
      totalQuotes: quotes.length,
      acceptedQuotes: quotes.filter(q => q.status === 'accepted').length,
      totalAmount: quotes.reduce((sum, q) => sum + parseFloat(q.total_amount || q.total || 0), 0),
      acceptedAmount: quotes.filter(q => q.status === 'accepted').reduce((sum, q) => sum + parseFloat(q.total_amount || q.total || 0), 0)
    };
    
    totalStats.conversionRate = totalStats.totalQuotes > 0 
      ? Math.round((totalStats.acceptedQuotes / totalStats.totalQuotes) * 100) 
      : 0;
    
    totalStats.amountConversionRate = totalStats.totalAmount > 0 
      ? Math.round((totalStats.acceptedAmount / totalStats.totalAmount) * 100) 
      : 0;
    
    // 渲染轉換率報表頁面
    res.render('pages/reports/conversion', {
      title: '報價轉換率報表',
      startDate: startDate || fromDate || queryStartDate.toISOString().split('T')[0],
      endDate: endDate || toDate || queryEndDate.toISOString().split('T')[0],
      period: queryPeriod,
      conversionStats,
      totalStats,
      formatCurrency: (value) => {
        return parseFloat(value).toLocaleString('zh-TW', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      },
      active: 'reports'
    });
    
  } catch (error) {
    console.error('獲取轉換率報表時出錯:', error);
    res.status(500).render('pages/error', { 
      title: '伺服器錯誤',
      message: '獲取轉換率報表時出錯: ' + error.message,
      error: '獲取轉換率報表時出錯'
    });
  }
});

// 匯出轉換率報表
router.get('/conversion/export', isAuthenticated, async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 6); // 默認顯示最近半年
    
    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
    
    console.log(`轉換率報表 Excel 匯出 - 日期範圍: ${queryStartDate.toISOString()} 到 ${queryEndDate.toISOString()}, 分組方式: ${period}`);
    
    // 獲取報價單數據
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    console.log(`轉換率報表 Excel 匯出 - 獲取到 ${quotes.length} 筆報價單數據`);
    
    // 打印第一個報價單數據，用於調試
    if (quotes.length > 0) {
      console.log(`報價單數據樣本: ${JSON.stringify(quotes[0])}`);
    }
    
    // 創建Excel工作簿
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Quotation System';
    workbook.lastModifiedBy = 'Quotation System';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // 創建工作表
    const worksheet = workbook.addWorksheet('轉換率報表');
    
    // 設置列標題
    worksheet.columns = [
      { header: '時間段', key: 'period', width: 20 },
      { header: '報價單總數', key: 'total', width: 15 },
      { header: '草稿數', key: 'draft', width: 15 },
      { header: '已發送數', key: 'sent', width: 15 },
      { header: '已接受數', key: 'accepted', width: 15 },
      { header: '已拒絕數', key: 'rejected', width: 15 },
      { header: '報價總金額', key: 'amount', width: 15 },
      { header: '已接受金額', key: 'acceptedAmount', width: 15 },
      { header: '數量轉換率(%)', key: 'conversionRate', width: 15 },
      { header: '金額轉換率(%)', key: 'amountConversionRate', width: 15 }
    ];
    
    // 按時間段分組數據
    const periodData = {};
    
    quotes.forEach(quote => {
      try {
        const quoteDate = new Date(quote.created_at);
        let periodKey;
        
        // 根據選擇的時間段格式化日期
        if (period === 'weekly') {
          // 獲取週數和年份
          const weekNumber = getWeekNumber(quoteDate);
          const year = quoteDate.getFullYear();
          periodKey = `${year}年第${weekNumber}週`;
        } else if (period === 'quarterly') {
          // 獲取季度和年份
          const quarter = Math.floor(quoteDate.getMonth() / 3) + 1;
          const year = quoteDate.getFullYear();
          periodKey = `${year}年第${quarter}季度`;
        } else {
          // 默認按月分組
          const year = quoteDate.getFullYear();
          const month = quoteDate.getMonth() + 1;
          periodKey = `${year}年${month}月`;
        }
        
        // 初始化該時間段的數據
        if (!periodData[periodKey]) {
          periodData[periodKey] = {
            total: 0,
            draft: 0,
            sent: 0,
            accepted: 0,
            rejected: 0,
            amount: 0,
            acceptedAmount: 0
          };
        }
        
        // 累加報價單數量
        periodData[periodKey].total++;
        periodData[periodKey][quote.status]++;
        
        // 累加金額
        const quoteTotal = parseFloat(quote.total_amount || quote.total || 0);
        periodData[periodKey].amount += quoteTotal;
        
        if (quote.status === 'accepted') {
          periodData[periodKey].acceptedAmount += quoteTotal;
        }
      } catch (err) {
        console.error(`處理報價單 ID: ${quote.id} 的日期時出錯:`, err);
      }
    });
    
    // 轉換為數組以便在Excel中使用，並按時間排序
    const periodKeys = Object.keys(periodData);
    const conversionStats = periodKeys.map(period => {
      const data = periodData[period];
      return {
        period,
        total: data.total,
        draft: data.draft || 0,
        sent: data.sent || 0,
        accepted: data.accepted || 0,
        rejected: data.rejected || 0,
        amount: data.amount,
        acceptedAmount: data.acceptedAmount,
        conversionRate: data.total > 0 
          ? (data.accepted / data.total * 100).toFixed(2) 
          : '0.00',
        amountConversionRate: data.amount > 0 
          ? (data.acceptedAmount / data.amount * 100).toFixed(2) 
          : '0.00'
      };
    });
    
    // 按日期排序（最近的日期在前）
    conversionStats.sort((a, b) => {
      // 對於年季度格式，例如 "2023年第3季度"
      if (a.period.includes('季度') && b.period.includes('季度')) {
        const yearA = parseInt(a.period.split('年')[0]);
        const yearB = parseInt(b.period.split('年')[0]);
        if (yearA !== yearB) return yearB - yearA;
        
        const quarterA = parseInt(a.period.split('第')[1]);
        const quarterB = parseInt(b.period.split('第')[1]);
        return quarterB - quarterA;
      }
      
      // 對於年週格式，例如 "2023年第15週"
      if (a.period.includes('週') && b.period.includes('週')) {
        const yearA = parseInt(a.period.split('年')[0]);
        const yearB = parseInt(b.period.split('年')[0]);
        if (yearA !== yearB) return yearB - yearA;
        
        const weekA = parseInt(a.period.split('第')[1]);
        const weekB = parseInt(b.period.split('第')[1]);
        return weekB - weekA;
      }
      
      // 對於年月格式，例如 "2023年5月"
      try {
        const dateA = new Date(a.period);
        const dateB = new Date(b.period);
        return dateB - dateA;
      } catch (e) {
        return 0;
      }
    });
    
    // 添加數據行
    conversionStats.forEach(stat => {
      worksheet.addRow({
        period: stat.period,
        total: stat.total,
        draft: stat.draft,
        sent: stat.sent,
        accepted: stat.accepted,
        rejected: stat.rejected,
        amount: formatCurrency(stat.amount),
        acceptedAmount: formatCurrency(stat.acceptedAmount),
        conversionRate: stat.conversionRate,
        amountConversionRate: stat.amountConversionRate
      });
    });
    
    // 計算總體統計數據
    const totalStats = {
      totalQuotes: quotes.length,
      acceptedQuotes: quotes.filter(q => q.status === 'accepted').length,
      totalAmount: quotes.reduce((sum, q) => sum + parseFloat(q.total_amount || q.total || 0), 0),
      acceptedAmount: quotes.filter(q => q.status === 'accepted').reduce((sum, q) => sum + parseFloat(q.total_amount || q.total || 0), 0)
    };
    
    totalStats.conversionRate = totalStats.totalQuotes > 0 
      ? (totalStats.acceptedQuotes / totalStats.totalQuotes * 100).toFixed(2) 
      : '0.00';
    
    totalStats.amountConversionRate = totalStats.totalAmount > 0 
      ? (totalStats.acceptedAmount / totalStats.totalAmount * 100).toFixed(2) 
      : '0.00';
    
    // 添加總計行
    worksheet.addRow({});
    worksheet.addRow({
      period: '總計',
      total: totalStats.totalQuotes,
      accepted: totalStats.acceptedQuotes,
      amount: formatCurrency(totalStats.totalAmount),
      acceptedAmount: formatCurrency(totalStats.acceptedAmount),
      conversionRate: totalStats.conversionRate,
      amountConversionRate: totalStats.amountConversionRate
    });
    
    // 設置Excel響應頭
    setExcelResponseHeaders(res, '轉換率報表');
    
    // 寫入響應
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('匯出轉換率報表時出錯:', err);
    res.status(500).send('匯出報表時發生錯誤');
  }
});

// 輔助函數：將時段類型轉為中文
function periodToText(period) {
  const periodMap = {
    'week': '週',
    'month': '月',
    'quarter': '季度'
  };
  return periodMap[period] || period;
}

// 匯出報表為CSV
router.get('/export/:type', isAuthenticated, async (req, res) => {
  try {
    const { type } = req.params;
    const fromDate = req.query.fromDate || getDefaultFromDate();
    const toDate = req.query.toDate || getCurrentDate();
    
    let data;
    let filename;
    
    // 根據報表類型獲取數據
    switch (type) {
      case 'sales':
        data = await Quote.getSalesReportCSV(fromDate, toDate);
        filename = `sales_report_${fromDate}_${toDate}.csv`;
        break;
      case 'customers':
        data = await Customer.getCustomerReportCSV(fromDate, toDate);
        filename = `customer_report_${fromDate}_${toDate}.csv`;
        break;
      case 'products':
        data = await Quote.getProductSalesReportCSV(fromDate, toDate);
        filename = `product_sales_report_${fromDate}_${toDate}.csv`;
        break;
      case 'conversion':
        data = await Quote.getConversionReportCSV(fromDate, toDate);
        filename = `conversion_report_${fromDate}_${toDate}.csv`;
        break;
      default:
        return res.status(400).render('pages/error', {
          title: '無效的報表類型',
          message: `找不到報表類型: ${type}`
        });
    }
    
    // 設置響應頭
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    // 發送CSV數據
    res.send(data);
  } catch (err) {
    console.error('匯出報表錯誤:', err);
    res.status(500).render('pages/error', {
      title: '伺服器錯誤',
      message: '匯出報表時發生錯誤'
    });
  }
});

// 獲取當前日期，格式為 YYYY-MM-DD
function getCurrentDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// 獲取默認的開始日期（30天前）
function getDefaultFromDate() {
  const now = new Date();
  now.setDate(now.getDate() - 30);
  return now.toISOString().split('T')[0];
}

module.exports = router; 