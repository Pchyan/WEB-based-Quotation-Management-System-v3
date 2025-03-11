/**
 * 使用者偏好設定 JavaScript
 * 用於應用使用者的偏好設定到頁面
 */

document.addEventListener('DOMContentLoaded', function() {
  // 從 localStorage 或 session 中獲取使用者偏好設定
  const userPreferences = getUserPreferences();
  
  // 應用偏好設定
  applyPreferences(userPreferences);
  
  // 監聽偏好設定表單提交
  setupPreferencesForm();
});

/**
 * 從 localStorage 或 session 中獲取使用者偏好設定
 * @returns {Object} 使用者偏好設定
 */
function getUserPreferences() {
  // 嘗試從 localStorage 獲取
  const storedPreferences = localStorage.getItem('userPreferences');
  
  if (storedPreferences) {
    try {
      return JSON.parse(storedPreferences);
    } catch (e) {
      console.error('解析偏好設定時發生錯誤:', e);
    }
  }
  
  // 如果 localStorage 中沒有，嘗試從頁面數據中獲取
  if (window.userPreferences) {
    return window.userPreferences;
  }
  
  // 返回預設值
  return {
    theme: 'light',
    colorScheme: 'blue',
    fontSize: 'medium',
    fontFamily: 'system',
    language: 'zh-TW'
  };
}

/**
 * 應用偏好設定到頁面
 * @param {Object} preferences 使用者偏好設定
 */
function applyPreferences(preferences) {
  const body = document.body;
  
  // 清除所有可能的主題類別
  body.classList.remove(
    'theme-light', 'theme-dark',
    'color-blue', 'color-green', 'color-purple', 'color-orange', 'color-teal',
    'font-small', 'font-medium', 'font-large', 'font-x-large',
    'font-system', 'font-serif', 'font-sans-serif', 'font-monospace'
  );
  
  // 應用主題模式
  if (preferences.theme === 'auto') {
    // 檢測系統偏好
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      body.classList.add('theme-dark');
    } else {
      body.classList.add('theme-light');
    }
    
    // 監聽系統主題變化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
      body.classList.remove('theme-light', 'theme-dark');
      body.classList.add(event.matches ? 'theme-dark' : 'theme-light');
    });
  } else {
    body.classList.add(`theme-${preferences.theme}`);
  }
  
  // 應用顏色方案
  body.classList.add(`color-${preferences.colorScheme || 'blue'}`);
  
  // 應用字體大小
  body.classList.add(`font-${preferences.fontSize || 'medium'}`);
  
  // 應用字體系列
  body.classList.add(`font-${preferences.fontFamily || 'system'}`);
  
  // 儲存到 localStorage
  localStorage.setItem('userPreferences', JSON.stringify(preferences));
}

/**
 * 設置偏好設定表單的事件監聽
 */
function setupPreferencesForm() {
  const preferencesForm = document.getElementById('preferencesForm');
  
  if (preferencesForm) {
    // 即時預覽偏好設定變更
    const themeSelect = document.getElementById('theme');
    const colorSchemeSelect = document.getElementById('colorScheme');
    const fontSizeSelect = document.getElementById('fontSize');
    const fontFamilySelect = document.getElementById('fontFamily');
    
    // 主題變更預覽
    if (themeSelect) {
      themeSelect.addEventListener('change', function() {
        const currentPreferences = getUserPreferences();
        currentPreferences.theme = this.value;
        applyPreferences(currentPreferences);
      });
    }
    
    // 顏色方案變更預覽
    if (colorSchemeSelect) {
      colorSchemeSelect.addEventListener('change', function() {
        const currentPreferences = getUserPreferences();
        currentPreferences.colorScheme = this.value;
        applyPreferences(currentPreferences);
      });
    }
    
    // 字體大小變更預覽
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', function() {
        const currentPreferences = getUserPreferences();
        currentPreferences.fontSize = this.value;
        applyPreferences(currentPreferences);
      });
    }
    
    // 字體系列變更預覽
    if (fontFamilySelect) {
      fontFamilySelect.addEventListener('change', function() {
        const currentPreferences = getUserPreferences();
        currentPreferences.fontFamily = this.value;
        applyPreferences(currentPreferences);
      });
    }
  }
} 