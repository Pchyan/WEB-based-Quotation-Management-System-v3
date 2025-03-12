/**
 * 認證與授權中間件
 */

/**
 * 檢查用戶是否已登入
 * @param {Object} req - 請求對象
 * @param {Object} res - 響應對象
 * @param {Function} next - 下一個中間件函數
 */
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  
  // 將當前請求的URL保存在會話中，以便登入後重定向回來
  req.session.returnTo = req.originalUrl;
  req.flash('error', '請先登入再訪問此頁面');
  res.redirect('/auth/login');
};

/**
 * 檢查用戶是否為管理員
 * @param {Object} req - 請求對象
 * @param {Object} res - 響應對象
 * @param {Function} next - 下一個中間件函數
 */
const isAdmin = (req, res, next) => {
  if (req.session && req.session.user && (req.session.user.role === 'admin' || req.session.user.isAdmin)) {
    return next();
  }
  
  req.flash('error', '您沒有訪問此頁面的權限');
  res.redirect('/');
};

/**
 * 檢查用戶是否為普通用戶或管理員
 * @param {Object} req - 請求對象
 * @param {Object} res - 響應對象
 * @param {Function} next - 下一個中間件函數
 */
const isUser = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'user') {
    return next();
  }
  
  req.flash('error', '您沒有訪問此頁面的權限');
  res.redirect('/');
};

/**
 * 檢查用戶是否有權限訪問特定資源
 * @param {string} resourceType - 資源類型
 * @returns {Function} 中間件函數
 */
const hasResourceAccess = (resourceType) => {
  return (req, res, next) => {
    // 管理員總是有權限
    if (req.session.user.role === 'admin' || req.session.user.isAdmin) {
      return next();
    }
    
    // 根據資源類型和用戶權限檢查
    // 這裡可以擴展實現更複雜的權限檢查邏輯
    switch (resourceType) {
      case 'quote':
        // 例如：僅允許查看自己創建的報價單
        if (req.params.id && req.session.user.canAccessQuote) {
          return next();
        }
        break;
      case 'customer':
        if (req.session.user.canAccessCustomer) {
          return next();
        }
        break;
      case 'product':
        if (req.session.user.canAccessProduct) {
          return next();
        }
        break;
      default:
        break;
    }
    
    req.flash('error', '您沒有訪問此資源的權限');
    res.redirect('/');
  };
};

module.exports = {
  isAuthenticated,
  isAdmin,
  isUser,
  hasResourceAccess
}; 