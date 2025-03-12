/**
 * 系統設置管理
 */
const fs = require('fs');
const path = require('path');

class SystemSettings {
  constructor() {
    this.configDir = path.join(__dirname);
    
    // 確保配置目錄存在
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 備份配置目錄
    this.backupConfigDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(this.backupConfigDir)) {
      fs.mkdirSync(this.backupConfigDir, { recursive: true });
    }
  }

  /**
   * 初始化系統設置
   */
  init() {
    console.log('正在初始化系統設置...');
    
    // 檢查並創建必要的目錄
    this._ensureDirectories();
    
    console.log('系統設置初始化完成');
  }

  /**
   * 確保必要的目錄存在
   * @private
   */
  _ensureDirectories() {
    const directories = [
      path.join(__dirname, '../uploads'),
      path.join(__dirname, '../uploads/customers'),
      path.join(__dirname, '../uploads/products'),
      path.join(__dirname, '../uploads/quotes'),
      path.join(__dirname, '../backups'),
      path.join(__dirname, '../database'),
      path.join(__dirname, '../temp')
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`已創建目錄: ${dir}`);
        } catch (err) {
          console.error(`創建目錄失敗 ${dir}:`, err);
        }
      }
    });
  }
}

module.exports = new SystemSettings(); 