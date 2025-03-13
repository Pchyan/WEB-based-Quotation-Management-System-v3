const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 引入中間件
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// 系統設定頁面
router.get('/settings', isAuthenticated, isAdmin, (req, res) => {
  // 讀取當前應用程式名稱
  const appName = process.env.APP_NAME || '報價管理系統';
  
  // 讀取公司資訊
  const companySettings = {};
  try {
    const settingsPath = path.resolve(process.cwd(), 'company_settings.json');
    if (fs.existsSync(settingsPath)) {
      const settingsData = fs.readFileSync(settingsPath, 'utf8');
      Object.assign(companySettings, JSON.parse(settingsData));
    }
  } catch (error) {
    console.error('讀取公司設定時發生錯誤:', error);
  }
  
  res.render('pages/admin/settings', {
    title: '系統設定',
    appName: appName, // 傳遞當前應用程式名稱
    companyName: companySettings.name,
    companyAddress: companySettings.address,
    companyPhone: companySettings.phone,
    companyEmail: companySettings.email,
    companyWebsite: companySettings.website
  });
});

// 處理系統設定更新
router.post('/settings', isAuthenticated, isAdmin, (req, res) => {
  try {
    const { 
      appName, 
      companyName, 
      companyAddress, 
      companyPhone, 
      companyEmail, 
      companyWebsite 
    } = req.body;
    
    if (!appName || appName.trim() === '') {
      req.flash('error', '應用程式名稱不能為空');
      return res.redirect('/admin/settings');
    }
    
    // 讀取現有的 .env 文件
    const envPath = path.resolve(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // 查找並替換 APP_NAME
    const lines = envContent.split('\n');
    let appNameExists = false;
    
    const newLines = lines.map(line => {
      if (line.startsWith('APP_NAME=')) {
        appNameExists = true;
        return `APP_NAME=${appName}`;
      }
      return line;
    });
    
    // 如果 APP_NAME 不存在，添加它
    if (!appNameExists) {
      newLines.push(`APP_NAME=${appName}`);
    }
    
    // 寫回 .env 文件
    fs.writeFileSync(envPath, newLines.join('\n'));
    
    // 儲存公司資訊
    const companySettings = {
      name: companyName || '貴公司企業有限公司',
      address: companyAddress || '台北市中正區忠孝東路100號',
      phone: companyPhone || '(02) 2345-6789',
      email: companyEmail || 'contact@company.com.tw',
      website: companyWebsite || 'www.company.com.tw'
    };
    
    const settingsPath = path.resolve(process.cwd(), 'company_settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(companySettings, null, 2));
    
    // 重新載入環境變數
    dotenv.config();
    
    // 更新全域應用程式名稱
    process.env.APP_NAME = appName;
    
    // 更新当前请求的 locals，确保重定向后也能显示更新后的名称
    res.locals.appName = appName;
    
    req.flash('success', '系統設定已成功更新');
    res.redirect('/admin/settings');
  } catch (error) {
    console.error('更新系統設定時發生錯誤:', error);
    req.flash('error', '更新系統設定時發生錯誤');
    res.redirect('/admin/settings');
  }
});

module.exports = router; 