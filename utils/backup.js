const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { format } = require('date-fns');
const dotenv = require('dotenv');

// 載入環境變數
dotenv.config();

/**
 * 資料庫備份工具
 */
class DatabaseBackup {
  constructor() {
    // 獲取資料庫路徑，預設為 ./database/quotation.sqlite
    this.dbPath = process.env.DB_PATH || path.join(__dirname, '../database/quotation.sqlite');
    
    // 設定備份目錄
    this.backupDir = path.join(__dirname, '../backups');
    
    // 確保備份目錄存在
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * 建立資料庫壓縮備份
   * @param {string} note 備份說明
   * @returns {Promise<string>} 備份檔案路徑
   */
  createBackup(note = '') {
    return new Promise((resolve, reject) => {
      try {
        // 檢查資料庫文件是否存在
        if (!fs.existsSync(this.dbPath)) {
          return reject(new Error(`資料庫文件不存在: ${this.dbPath}`));
        }

        // 創建備份檔案名稱（使用時間戳）
        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        const backupFileName = `backup_${timestamp}.zip`;
        const backupFilePath = path.join(this.backupDir, backupFileName);

        // 創建壓縮檔案
        const output = fs.createWriteStream(backupFilePath);
        const archive = archiver('zip', {
          zlib: { level: 9 } // 設定壓縮級別為最高
        });

        // 處理壓縮完成事件
        output.on('close', () => {
          console.log(`資料庫備份完成: ${backupFilePath}`);
          console.log(`備份檔案大小: ${archive.pointer()} 位元組`);

          // 記錄備份資訊
          this._saveBackupInfo(backupFileName, note, archive.pointer());
          resolve(backupFilePath);
        });

        // 處理錯誤
        archive.on('error', (err) => {
          reject(err);
        });

        // 將壓縮檔案指向輸出流
        archive.pipe(output);

        // 將資料庫檔案加入壓縮檔
        archive.file(this.dbPath, { name: path.basename(this.dbPath) });

        // 完成壓縮
        archive.finalize();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 獲取所有備份檔案列表
   * @returns {Array} 備份檔案列表
   */
  getBackupsList() {
    try {
      // 檢查備份目錄是否存在
      if (!fs.existsSync(this.backupDir)) {
        return [];
      }

      // 讀取備份資訊檔案
      const infoFilePath = path.join(this.backupDir, 'backup_info.json');
      let backupInfo = [];
      
      if (fs.existsSync(infoFilePath)) {
        backupInfo = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
      }

      // 獲取所有備份檔案
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.endsWith('.zip'))
        .map(file => {
          const filePath = path.join(this.backupDir, file);
          const stats = fs.statSync(filePath);
          
          // 查找對應的備份記錄
          const info = backupInfo.find(i => i.filename === file) || {};
          
          return {
            filename: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            note: info.note || '',
            auto: info.auto || false
          };
        })
        .sort((a, b) => b.created - a.created); // 按時間降序排序

      return files;
    } catch (err) {
      console.error('獲取備份列表錯誤:', err);
      return [];
    }
  }

  /**
   * 刪除備份檔案
   * @param {string} filename 備份檔案名稱
   * @returns {boolean} 是否刪除成功
   */
  deleteBackup(filename) {
    try {
      const filePath = path.join(this.backupDir, filename);
      
      // 檢查檔案是否存在
      if (!fs.existsSync(filePath)) {
        return false;
      }

      // 刪除檔案
      fs.unlinkSync(filePath);
      
      // 更新備份資訊
      this._removeBackupInfo(filename);
      
      return true;
    } catch (err) {
      console.error('刪除備份檔案錯誤:', err);
      return false;
    }
  }

  /**
   * 還原備份
   * @param {string} filename 備份檔案名稱
   * @returns {Promise<boolean>} 是否還原成功
   */
  restoreBackup(filename) {
    // 注意：還原備份會先停止伺服器，再重新啟動
    return new Promise((resolve, reject) => {
      // 此功能需在管理界面實現，暫時留下框架
      // 實際實現需考慮安全性和伺服器重啟
      reject(new Error('尚未實現此功能'));
    });
  }

  /**
   * 記錄備份資訊
   * @param {string} filename 備份檔案名稱
   * @param {string} note 備份說明
   * @param {number} size 檔案大小
   * @param {boolean} auto 是否為自動備份
   * @private
   */
  _saveBackupInfo(filename, note, size, auto = false) {
    try {
      const infoFilePath = path.join(this.backupDir, 'backup_info.json');
      let backupInfo = [];
      
      // 讀取現有的備份資訊
      if (fs.existsSync(infoFilePath)) {
        backupInfo = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
      }

      // 添加新的備份資訊
      backupInfo.push({
        filename,
        note,
        size,
        timestamp: new Date().toISOString(),
        auto
      });

      // 寫入備份資訊檔案
      fs.writeFileSync(infoFilePath, JSON.stringify(backupInfo, null, 2), 'utf8');
    } catch (err) {
      console.error('記錄備份資訊錯誤:', err);
    }
  }

  /**
   * 從記錄中移除備份資訊
   * @param {string} filename 備份檔案名稱
   * @private
   */
  _removeBackupInfo(filename) {
    try {
      const infoFilePath = path.join(this.backupDir, 'backup_info.json');
      
      // 檢查資訊檔案是否存在
      if (!fs.existsSync(infoFilePath)) {
        return;
      }

      // 讀取現有的備份資訊
      let backupInfo = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
      
      // 過濾掉要刪除的備份資訊
      backupInfo = backupInfo.filter(info => info.filename !== filename);
      
      // 寫入更新後的備份資訊檔案
      fs.writeFileSync(infoFilePath, JSON.stringify(backupInfo, null, 2), 'utf8');
    } catch (err) {
      console.error('移除備份資訊錯誤:', err);
    }
  }
}

module.exports = new DatabaseBackup(); 