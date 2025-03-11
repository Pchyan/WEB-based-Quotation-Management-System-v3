// 身份驗證中間件

/**
 * 檢查使用者是否已經登入
 */
const isAuthenticated = (req, res, next) => {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/auth/login');
};

/**
 * 檢查使用者是否為管理員
 */
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error', '只有管理員才能訪問此頁面');
  res.redirect('/dashboard');
};

// 檢查使用者是否未登入（用於登入/註冊頁面）
const isNotAuthenticated = (req, res, next) => {
  if (!req.session.isAuthenticated) {
    return next();
  }
  
  res.redirect('/');
};

module.exports = {
  isAuthenticated,
  isAdmin,
  isNotAuthenticated
}; 