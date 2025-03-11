const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const Quote = require('../models/quote');
const Customer = require('../models/customer');
const Product = require('../models/product');
const User = require('../models/user');

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
    // 獲取查詢參數
    const { startDate, endDate, status } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 1); // 默認顯示最近一個月
    
    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
    
    // 獲取報價數據
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    // 如果指定了狀態，則過濾結果
    let filteredQuotes = quotes;
    if (status && status !== 'all') {
      filteredQuotes = quotes.filter(quote => quote.status === status);
    }
    
    // 計算統計數據
    const totalQuotes = filteredQuotes.length;
    const totalAmount = filteredQuotes.reduce((sum, quote) => sum + quote.total, 0);
    const acceptedQuotes = filteredQuotes.filter(quote => quote.status === 'accepted').length;
    const acceptanceRate = totalQuotes > 0 ? (acceptedQuotes / totalQuotes * 100).toFixed(2) : 0;
    
    // 按月份分組的數據
    const monthlyData = {};
    filteredQuotes.forEach(quote => {
      const month = new Date(quote.quoteDate).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
      if (!monthlyData[month]) {
        monthlyData[month] = {
          count: 0,
          amount: 0,
          accepted: 0
        };
      }
      
      monthlyData[month].count++;
      monthlyData[month].amount += quote.total;
      if (quote.status === 'accepted') {
        monthlyData[month].accepted++;
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
    
    // 渲染報表頁面
    res.render('pages/reports/sales', {
      title: '銷售報表',
      quotes: filteredQuotes,
      totalQuotes,
      totalAmount,
      acceptedQuotes,
      acceptanceRate,
      monthlyStats,
      startDate: queryStartDate.toISOString().split('T')[0],
      endDate: queryEndDate.toISOString().split('T')[0],
      status: status || 'all'
    });
  } catch (error) {
    console.error('獲取銷售報表時出錯:', error);
    res.status(500).render('error', { 
      message: '獲取銷售報表時發生錯誤',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// 客戶報表
router.get('/customers', isAuthenticated, async (req, res) => {
  try {
    // 獲取查詢參數
    const { startDate, endDate, sort } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 3); // 默認顯示最近三個月
    
    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
    
    // 獲取所有客戶
    const customers = await Customer.getAll();
    
    // 獲取報價數據
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    // 計算每個客戶的統計數據
    const customerStats = customers.map(customer => {
      const customerQuotes = quotes.filter(quote => quote.customerId === customer.id);
      const totalQuotes = customerQuotes.length;
      const totalAmount = customerQuotes.reduce((sum, quote) => sum + quote.total, 0);
      const acceptedQuotes = customerQuotes.filter(quote => quote.status === 'accepted').length;
      const acceptanceRate = totalQuotes > 0 ? (acceptedQuotes / totalQuotes * 100).toFixed(2) : 0;
      
      return {
        id: customer.id,
        name: customer.name,
        contactPerson: customer.contactPerson,
        email: customer.email,
        phone: customer.phone,
        totalQuotes,
        totalAmount,
        acceptedQuotes,
        acceptanceRate
      };
    });
    
    // 根據排序參數排序
    let sortedStats = [...customerStats];
    switch (sort) {
      case 'quotes':
        sortedStats.sort((a, b) => b.totalQuotes - a.totalQuotes);
        break;
      case 'amount':
        sortedStats.sort((a, b) => b.totalAmount - a.totalAmount);
        break;
      case 'acceptance':
        sortedStats.sort((a, b) => b.acceptanceRate - a.acceptanceRate);
        break;
      default:
        sortedStats.sort((a, b) => b.totalAmount - a.totalAmount); // 默認按總金額排序
    }
    
    // 渲染報表頁面
    res.render('pages/reports/customers', {
      title: '客戶報表',
      customerStats: sortedStats,
      startDate: queryStartDate.toISOString().split('T')[0],
      endDate: queryEndDate.toISOString().split('T')[0],
      sort: sort || 'amount'
    });
  } catch (error) {
    console.error('獲取客戶報表時出錯:', error);
    res.status(500).render('error', { 
      message: '獲取客戶報表時發生錯誤',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// 產品銷售報表
router.get('/products', isAuthenticated, async (req, res) => {
  try {
    // 獲取查詢參數
    const { startDate, endDate, categoryId, sort } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 3); // 默認顯示最近三個月
    
    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
    
    // 獲取所有產品
    let products;
    if (categoryId && categoryId !== 'all') {
      products = await Product.getByCategoryId(categoryId);
    } else {
      products = await Product.getAll();
    }
    
    // 獲取報價數據
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    // 獲取所有報價項目
    const allQuoteItems = [];
    for (const quote of quotes) {
      const items = await Quote.getItems(quote.id);
      items.forEach(item => {
        allQuoteItems.push({
          ...item,
          quote: quote
        });
      });
    }
    
    // 計算每個產品的統計數據
    const productStats = products.map(product => {
      // 找出所有包含此產品的報價項目
      const quoteItems = allQuoteItems.filter(item => item.productId === product.id);
      
      const totalQuotes = new Set(quoteItems.map(item => item.quoteId)).size;
      const totalQuantity = quoteItems.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = quoteItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      // 計算接受的報價中的產品數量
      const acceptedQuoteItems = quoteItems.filter(item => item.quote.status === 'accepted');
      const acceptedQuantity = acceptedQuoteItems.reduce((sum, item) => sum + item.quantity, 0);
      const acceptedAmount = acceptedQuoteItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        category: product.categoryName || '無分類',
        totalQuotes,
        totalQuantity,
        totalAmount,
        acceptedQuantity,
        acceptedAmount,
        conversionRate: totalQuantity > 0 ? (acceptedQuantity / totalQuantity * 100).toFixed(2) : 0
      };
    });
    
    // 根據排序參數排序
    let sortedStats = [...productStats];
    switch (sort) {
      case 'quantity':
        sortedStats.sort((a, b) => b.totalQuantity - a.totalQuantity);
        break;
      case 'amount':
        sortedStats.sort((a, b) => b.totalAmount - a.totalAmount);
        break;
      case 'conversion':
        sortedStats.sort((a, b) => b.conversionRate - a.conversionRate);
        break;
      default:
        sortedStats.sort((a, b) => b.totalAmount - a.totalAmount); // 默認按總金額排序
    }
    
    // 獲取所有產品類別
    const categories = await Product.getAllCategories();
    
    // 渲染報表頁面
    res.render('pages/reports/products', {
      title: '產品報表',
      productStats: sortedStats,
      categories,
      startDate: queryStartDate.toISOString().split('T')[0],
      endDate: queryEndDate.toISOString().split('T')[0],
      categoryId: categoryId || 'all',
      sort: sort || 'amount'
    });
  } catch (error) {
    console.error('獲取產品報表時出錯:', error);
    res.status(500).render('error', { 
      message: '獲取產品報表時發生錯誤',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// 轉換率報表
router.get('/conversion', isAuthenticated, async (req, res) => {
  try {
    // 獲取查詢參數
    const { startDate, endDate, period } = req.query;
    
    // 設置默認日期範圍（如果未提供）
    const today = new Date();
    const defaultEndDate = new Date(today);
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(today.getMonth() - 6); // 默認顯示最近六個月
    
    const queryStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const queryEndDate = endDate ? new Date(endDate) : defaultEndDate;
    const queryPeriod = period || 'month'; // 默認按月分組
    
    // 獲取報價數據
    const quotes = await Quote.getReportData(queryStartDate, queryEndDate);
    
    // 按時間段分組
    const periodData = {};
    quotes.forEach(quote => {
      let periodKey;
      const quoteDate = new Date(quote.quoteDate);
      
      if (queryPeriod === 'week') {
        // 按週分組
        const firstDayOfYear = new Date(quoteDate.getFullYear(), 0, 1);
        const pastDaysOfYear = (quoteDate - firstDayOfYear) / 86400000;
        const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        periodKey = `${quoteDate.getFullYear()}-W${weekNumber}`;
      } else if (queryPeriod === 'quarter') {
        // 按季度分組
        const quarter = Math.floor(quoteDate.getMonth() / 3) + 1;
        periodKey = `${quoteDate.getFullYear()}-Q${quarter}`;
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
      periodData[periodKey][quote.status]++;
      periodData[periodKey].amount += quote.total;
      
      if (quote.status === 'accepted') {
        periodData[periodKey].acceptedAmount += quote.total;
      }
    });
    
    // 轉換為數組以便在模板中使用
    const conversionStats = Object.keys(periodData).map(period => ({
      period,
      total: periodData[period].total,
      draft: periodData[period].draft,
      sent: periodData[period].sent,
      accepted: periodData[period].accepted,
      rejected: periodData[period].rejected,
      amount: periodData[period].amount,
      acceptedAmount: periodData[period].acceptedAmount,
      conversionRate: periodData[period].total > 0 
        ? (periodData[period].accepted / periodData[period].total * 100).toFixed(2) 
        : 0,
      amountConversionRate: periodData[period].amount > 0 
        ? (periodData[period].acceptedAmount / periodData[period].amount * 100).toFixed(2) 
        : 0
    }));
    
    // 渲染報表頁面
    res.render('pages/reports/conversion', {
      title: '轉換率報表',
      conversionStats,
      startDate: queryStartDate.toISOString().split('T')[0],
      endDate: queryEndDate.toISOString().split('T')[0],
      period: queryPeriod
    });
  } catch (error) {
    console.error('獲取轉換率報表時出錯:', error);
    res.status(500).render('error', { 
      message: '獲取轉換率報表時發生錯誤',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

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