const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const backup = require('./backup');

/**
 * 排程管理工具
 */
class Scheduler {
  constructor() {
    this.tasks = new Map();
    this.configPath = path.join(__dirname, '../config/schedule.json');
    
    // 確保配置目錄存在
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 載入排程配置
    this.loadConfig();
  }

  /**
   * 載入排程配置
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        
        // 清除所有現有的任務
        this.stopAllTasks();
        
        // 載入配置的任務
        if (config.tasks && Array.isArray(config.tasks)) {
          config.tasks.forEach(task => {
            if (task.active) {
              this.scheduleTask(task.id, task.cronExpression, task.type, task.note);
            }
          });
        }
        
        console.log(`已載入 ${this.tasks.size} 個排程任務`);
      } else {
        // 如果配置文件不存在，創建一個空的配置
        this.saveConfig();
      }
    } catch (err) {
      console.error('載入排程配置錯誤:', err);
    }
  }

  /**
   * 保存排程配置
   */
  saveConfig() {
    try {
      const tasks = Array.from(this.tasks.values()).map(task => ({
        id: task.id,
        cronExpression: task.cronExpression,
        type: task.type,
        note: task.note,
        active: task.active,
        lastRun: task.lastRun
      }));

      const config = {
        tasks,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log('排程配置已保存');
    } catch (err) {
      console.error('保存排程配置錯誤:', err);
    }
  }

  /**
   * 獲取所有任務
   * @returns {Array} 任務列表
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * 獲取指定任務
   * @param {string} id 任務ID
   * @returns {Object|null} 任務對象或null
   */
  getTask(id) {
    return this.tasks.get(id) || null;
  }

  /**
   * 排程一個任務
   * @param {string} id 任務ID
   * @param {string} cronExpression cron表達式
   * @param {string} type 任務類型
   * @param {string} note 任務說明
   * @returns {boolean} 是否成功
   */
  scheduleTask(id, cronExpression, type = 'backup', note = '') {
    try {
      // 驗證cron表達式
      if (!cron.validate(cronExpression)) {
        console.error(`無效的cron表達式: ${cronExpression}`);
        return false;
      }

      // 如果已存在同ID的任務，先停止它
      if (this.tasks.has(id)) {
        this.stopTask(id);
      }

      // 根據任務類型創建執行函數
      const executeFunction = this._createExecuteFunction(type);
      if (!executeFunction) {
        console.error(`不支援的任務類型: ${type}`);
        return false;
      }

      // 創建排程任務
      const task = {
        id,
        cronExpression,
        type,
        note,
        active: true,
        created: new Date().toISOString(),
        lastRun: null,
        job: cron.schedule(cronExpression, async () => {
          console.log(`執行排程任務: ${id}`);
          task.lastRun = new Date().toISOString();

          try {
            await executeFunction(task);
            console.log(`任務 ${id} 執行完成`);
          } catch (err) {
            console.error(`任務 ${id} 執行出錯:`, err);
          }

          // 更新配置
          this.saveConfig();
        })
      };

      // 將任務添加到集合中
      this.tasks.set(id, task);
      
      // 保存配置
      this.saveConfig();
      
      console.log(`已排程任務 ${id}: ${cronExpression}`);
      return true;
    } catch (err) {
      console.error('排程任務錯誤:', err);
      return false;
    }
  }

  /**
   * 更新任務排程
   * @param {string} id 任務ID
   * @param {Object} updates 更新的屬性
   * @returns {boolean} 是否成功
   */
  updateTask(id, updates) {
    try {
      if (!this.tasks.has(id)) {
        console.error(`任務不存在: ${id}`);
        return false;
      }

      const task = this.tasks.get(id);
      let needRestart = false;

      // 更新cronExpression需要重新排程
      if (updates.cronExpression && updates.cronExpression !== task.cronExpression) {
        if (!cron.validate(updates.cronExpression)) {
          console.error(`無效的cron表達式: ${updates.cronExpression}`);
          return false;
        }
        task.cronExpression = updates.cronExpression;
        needRestart = true;
      }

      // 更新其他屬性
      if (updates.note !== undefined) {
        task.note = updates.note;
      }

      if (updates.active !== undefined) {
        task.active = !!updates.active;
        needRestart = true;
      }

      // 如果需要，重新啟動任務
      if (needRestart) {
        this.stopTask(id);
        if (task.active) {
          const executeFunction = this._createExecuteFunction(task.type);
          task.job = cron.schedule(task.cronExpression, async () => {
            console.log(`執行排程任務: ${id}`);
            task.lastRun = new Date().toISOString();

            try {
              await executeFunction(task);
              console.log(`任務 ${id} 執行完成`);
            } catch (err) {
              console.error(`任務 ${id} 執行出錯:`, err);
            }

            // 更新配置
            this.saveConfig();
          });
        }
      }

      // 保存配置
      this.saveConfig();

      return true;
    } catch (err) {
      console.error('更新任務錯誤:', err);
      return false;
    }
  }

  /**
   * 停止任務
   * @param {string} id 任務ID
   * @returns {boolean} 是否成功
   */
  stopTask(id) {
    try {
      if (!this.tasks.has(id)) {
        console.error(`任務不存在: ${id}`);
        return false;
      }

      const task = this.tasks.get(id);
      if (task.job) {
        task.job.stop();
      }

      task.active = false;
      this.saveConfig();

      return true;
    } catch (err) {
      console.error('停止任務錯誤:', err);
      return false;
    }
  }

  /**
   * 刪除任務
   * @param {string} id 任務ID
   * @returns {boolean} 是否成功
   */
  deleteTask(id) {
    try {
      if (!this.tasks.has(id)) {
        console.error(`任務不存在: ${id}`);
        return false;
      }

      // 停止任務
      const task = this.tasks.get(id);
      if (task.job) {
        task.job.stop();
      }

      // 從集合中移除
      this.tasks.delete(id);
      
      // 保存配置
      this.saveConfig();

      return true;
    } catch (err) {
      console.error('刪除任務錯誤:', err);
      return false;
    }
  }

  /**
   * 立即執行任務
   * @param {string} id 任務ID
   * @returns {Promise<boolean>} 是否成功
   */
  async runTaskNow(id) {
    try {
      if (!this.tasks.has(id)) {
        console.error(`任務不存在: ${id}`);
        return false;
      }

      const task = this.tasks.get(id);
      const executeFunction = this._createExecuteFunction(task.type);
      
      if (!executeFunction) {
        console.error(`不支援的任務類型: ${task.type}`);
        return false;
      }

      task.lastRun = new Date().toISOString();
      
      await executeFunction(task);
      
      // 保存配置
      this.saveConfig();
      
      return true;
    } catch (err) {
      console.error('立即執行任務錯誤:', err);
      return false;
    }
  }

  /**
   * 停止所有任務
   */
  stopAllTasks() {
    for (const task of this.tasks.values()) {
      if (task.job) {
        task.job.stop();
      }
    }
    this.tasks.clear();
  }

  /**
   * 根據任務類型創建執行函數
   * @param {string} type 任務類型
   * @returns {Function|null} 執行函數或null
   * @private
   */
  _createExecuteFunction(type) {
    switch (type) {
      case 'backup':
        return async (task) => {
          // 執行資料庫備份
          const note = `自動備份 (${task.id})`;
          await backup.createBackup(note);
        };
      // 可以在這裡添加其他類型的任務處理函數
      default:
        return null;
    }
  }

  /**
   * 解釋cron表達式為人類可讀的文字
   * @param {string} expression cron表達式
   * @returns {string} 人類可讀的描述
   */
  static explainCronExpression(expression) {
    // 簡單的解釋，可以根據需要擴展
    const parts = expression.split(' ');
    
    if (parts.length !== 6 && parts.length !== 5) {
      return '無效的cron表達式';
    }
    
    let [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    
    // 處理秒數（如果有）
    if (parts.length === 6) {
      [, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    }
    
    // 這裡只提供一些基本模式的解釋
    if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return '每分鐘';
    } else if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return '每小時';
    } else if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return '每天凌晨';
    } else if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '0') {
      return '每週日凌晨';
    } else if (minute === '0' && hour === '0' && dayOfMonth === '1' && month === '*' && dayOfWeek === '*') {
      return '每月1號凌晨';
    }
    
    return expression; // 如果沒有匹配的模式，返回原始表達式
  }
}

// 預定義的cron表達式
Scheduler.SCHEDULES = {
  EVERY_MINUTE: '* * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_DAY: '0 0 * * *',
  EVERY_WEEK: '0 0 * * 0',
  EVERY_MONTH: '0 0 1 * *'
};

module.exports = new Scheduler(); 