const express = require('express');
const router = express.Router();
const backup = require('../utils/backup');
const scheduler = require('../utils/scheduler');
const { isAuthenticated, isAdmin } = require('../middlewares/auth');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron'); // 添加缺失的cron模組引入

// 只允許管理員訪問備份功能
router.use(isAuthenticated, isAdmin);

/**
 * 備份管理頁面
 */
router.get('/', (req, res) => {
  try {
    // 獲取所有備份文件
    const backups = backup.getBackupsList();
    
    // 獲取所有排程任務
    const tasks = scheduler.getAllTasks();
    
    // 預定義的排程選項
    const scheduleOptions = [
      { value: scheduler.constructor.SCHEDULES.EVERY_DAY, label: '每天' },
      { value: scheduler.constructor.SCHEDULES.EVERY_WEEK, label: '每週' },
      { value: scheduler.constructor.SCHEDULES.EVERY_MONTH, label: '每月' }
    ];
    
    res.render('pages/backup/index', {
      active: 'backup',
      backups,
      tasks,
      scheduleOptions,
      explainCron: scheduler.constructor.explainCronExpression
    });
  } catch (err) {
    console.error('獲取備份列表錯誤:', err);
    req.flash('error', '獲取備份列表失敗');
    res.redirect('/');
  }
});

/**
 * 建立手動備份
 */
router.post('/create', async (req, res) => {
  try {
    const { note } = req.body;
    
    // 執行備份
    await backup.createBackup(note || '手動備份');
    
    req.flash('success', '備份已建立');
    res.redirect('/backup');
  } catch (err) {
    console.error('建立備份錯誤:', err);
    req.flash('error', `建立備份失敗: ${err.message}`);
    res.redirect('/backup');
  }
});

/**
 * 刪除備份
 */
router.post('/delete/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // 執行刪除
    const success = backup.deleteBackup(filename);
    
    if (success) {
      req.flash('success', '備份已刪除');
    } else {
      req.flash('error', '刪除備份失敗');
    }
    
    res.redirect('/backup');
  } catch (err) {
    console.error('刪除備份錯誤:', err);
    req.flash('error', `刪除備份失敗: ${err.message}`);
    res.redirect('/backup');
  }
});

/**
 * 下載備份
 */
router.get('/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(backup.backupDir, filename);
    
    // 檢查文件是否存在
    if (!fs.existsSync(filePath)) {
      req.flash('error', '備份文件不存在');
      return res.redirect('/backup');
    }
    
    // 設置文件下載頭
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    
    // 發送文件
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('下載備份錯誤:', err);
    req.flash('error', `下載備份失敗: ${err.message}`);
    res.redirect('/backup');
  }
});

/**
 * 建立排程備份任務
 */
router.post('/schedule', (req, res) => {
  try {
    const { 
      id, 
      cronExpression, 
      note, 
      scheduleType, 
      backupTime,
      weekday,
      monthDay,
      customCron
    } = req.body;
    
    // 驗證必要字段
    if (!id) {
      req.flash('error', '請提供排程ID');
      return res.redirect('/backup');
    }
    
    // 根據前端提供的參數生成cron表達式
    let finalCronExpression;
    
    if (customCron) {
      // 如果提供了自定義cron表達式，使用它
      finalCronExpression = customCron;
    } else {
      // 解析時間
      const [hour, minute] = (backupTime || '00:00').split(':').map(Number);
      
      // 根據排程類型生成cron表達式
      switch(scheduleType) {
        case 'daily':
          finalCronExpression = `${minute} ${hour} * * *`;
          break;
        case 'weekly':
          finalCronExpression = `${minute} ${hour} * * ${weekday || 0}`;
          break;
        case 'monthly':
          finalCronExpression = `${minute} ${hour} ${monthDay || 1} * *`;
          break;
        default:
          // 如果沒有指定類型，使用傳入的cronExpression或默認每天備份
          finalCronExpression = cronExpression || scheduler.constructor.SCHEDULES.EVERY_DAY;
      }
    }
    
    // 驗證生成的cron表達式
    if (!cron.validate(finalCronExpression)) {
      req.flash('error', `無效的cron表達式: ${finalCronExpression}`);
      return res.redirect('/backup');
    }
    
    // 建立排程任務
    const success = scheduler.scheduleTask(id, finalCronExpression, 'backup', note);
    
    if (success) {
      req.flash('success', '備份排程已建立');
    } else {
      req.flash('error', '建立備份排程失敗');
    }
    
    res.redirect('/backup');
  } catch (err) {
    console.error('建立備份排程錯誤:', err);
    req.flash('error', `建立備份排程失敗: ${err.message}`);
    res.redirect('/backup');
  }
});

/**
 * 更新排程備份任務
 */
router.post('/schedule/:id/update', (req, res) => {
  try {
    const { id } = req.params;
    const { 
      cronExpression, 
      note, 
      active,
      scheduleType, 
      backupTime,
      weekday,
      monthDay,
      customCron
    } = req.body;
    
    // 根據前端提供的參數生成cron表達式
    let finalCronExpression;
    
    if (customCron) {
      // 如果提供了自定義cron表達式，使用它
      finalCronExpression = customCron;
    } else {
      // 解析時間
      const [hour, minute] = (backupTime || '00:00').split(':').map(Number);
      
      // 根據排程類型生成cron表達式
      switch(scheduleType) {
        case 'daily':
          finalCronExpression = `${minute} ${hour} * * *`;
          break;
        case 'weekly':
          finalCronExpression = `${minute} ${hour} * * ${weekday || 0}`;
          break;
        case 'monthly':
          finalCronExpression = `${minute} ${hour} ${monthDay || 1} * *`;
          break;
        default:
          // 如果沒有指定類型，使用傳入的cronExpression或默認每天備份
          finalCronExpression = cronExpression || scheduler.constructor.SCHEDULES.EVERY_DAY;
      }
    }
    
    // 驗證生成的cron表達式
    if (!cron.validate(finalCronExpression)) {
      req.flash('error', `無效的cron表達式: ${finalCronExpression}`);
      return res.redirect('/backup');
    }
    
    // 更新排程任務
    const success = scheduler.updateTask(id, {
      cronExpression: finalCronExpression,
      note,
      active: active === 'true'
    });
    
    if (success) {
      req.flash('success', '備份排程已更新');
    } else {
      req.flash('error', '更新備份排程失敗');
    }
    
    res.redirect('/backup');
  } catch (err) {
    console.error('更新備份排程錯誤:', err);
    req.flash('error', `更新備份排程失敗: ${err.message}`);
    res.redirect('/backup');
  }
});

/**
 * 刪除排程備份任務
 */
router.post('/schedule/:id/delete', (req, res) => {
  try {
    const { id } = req.params;
    
    // 刪除排程任務
    const success = scheduler.deleteTask(id);
    
    if (success) {
      req.flash('success', '備份排程已刪除');
    } else {
      req.flash('error', '刪除備份排程失敗');
    }
    
    res.redirect('/backup');
  } catch (err) {
    console.error('刪除備份排程錯誤:', err);
    req.flash('error', `刪除備份排程失敗: ${err.message}`);
    res.redirect('/backup');
  }
});

/**
 * 立即執行排程備份任務
 */
router.post('/schedule/:id/run-now', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 立即執行排程任務
    const success = await scheduler.runTaskNow(id);
    
    if (success) {
      req.flash('success', '備份任務已執行');
    } else {
      req.flash('error', '執行備份任務失敗');
    }
    
    res.redirect('/backup');
  } catch (err) {
    console.error('執行備份任務錯誤:', err);
    req.flash('error', `執行備份任務失敗: ${err.message}`);
    res.redirect('/backup');
  }
});

module.exports = router;