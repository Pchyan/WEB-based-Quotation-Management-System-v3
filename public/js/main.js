// 頁面載入完成後執行
document.addEventListener('DOMContentLoaded', function() {
  // 啟用所有工具提示
  $('[data-toggle="tooltip"]').tooltip();
  
  // 啟用所有彈出框
  $('[data-toggle="popover"]').popover();
  
  // 自動關閉警告訊息
  setTimeout(function() {
    $('.alert-dismissible').alert('close');
  }, 5000);
  
  // 確認刪除對話框
  $('.delete-confirm').on('click', function(e) {
    if (!confirm('確定要刪除嗎？此操作無法復原。')) {
      e.preventDefault();
      return false;
    }
  });
  
  // 報價單項目計算
  setupQuoteItemCalculation();
  
  // 報價單總計計算
  setupQuoteTotalCalculation();
});

// 報價單項目計算
function setupQuoteItemCalculation() {
  const quoteItemsContainer = document.getElementById('quote-items');
  if (!quoteItemsContainer) return;
  
  // 監聽數量和單價變更
  quoteItemsContainer.addEventListener('change', function(e) {
    const target = e.target;
    if (target.classList.contains('item-quantity') || 
        target.classList.contains('item-price') || 
        target.classList.contains('item-discount')) {
      
      const row = target.closest('.quote-item-row');
      if (!row) return;
      
      const quantityInput = row.querySelector('.item-quantity');
      const priceInput = row.querySelector('.item-price');
      const discountInput = row.querySelector('.item-discount');
      const amountInput = row.querySelector('.item-amount');
      
      if (!quantityInput || !priceInput || !amountInput) return;
      
      const quantity = parseFloat(quantityInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const discount = parseFloat(discountInput?.value) || 0;
      
      // 計算金額 (數量 * 單價 * (1 - 折扣/100))
      const amount = quantity * price * (1 - discount / 100);
      amountInput.value = amount.toFixed(2);
      
      // 更新總計
      updateQuoteTotal();
    }
  });
}

// 報價單總計計算
function setupQuoteTotalCalculation() {
  const subtotalInput = document.getElementById('subtotal');
  const discountTypeSelect = document.getElementById('discount-type');
  const discountValueInput = document.getElementById('discount-value');
  const taxRateInput = document.getElementById('tax-rate');
  const taxAmountInput = document.getElementById('tax-amount');
  const totalInput = document.getElementById('total');
  
  if (!subtotalInput || !totalInput) return;
  
  // 監聽折扣和稅率變更
  [discountTypeSelect, discountValueInput, taxRateInput].forEach(element => {
    if (element) {
      element.addEventListener('change', updateQuoteTotal);
    }
  });
}

// 更新報價單總計
function updateQuoteTotal() {
  const subtotalInput = document.getElementById('subtotal');
  const discountTypeSelect = document.getElementById('discount-type');
  const discountValueInput = document.getElementById('discount-value');
  const taxRateInput = document.getElementById('tax-rate');
  const taxAmountInput = document.getElementById('tax-amount');
  const totalInput = document.getElementById('total');
  
  if (!subtotalInput || !totalInput) return;
  
  // 計算小計
  let subtotal = 0;
  const amountInputs = document.querySelectorAll('.item-amount');
  amountInputs.forEach(input => {
    subtotal += parseFloat(input.value) || 0;
  });
  subtotalInput.value = subtotal.toFixed(2);
  
  // 計算折扣後金額
  let discountedAmount = subtotal;
  if (discountTypeSelect && discountValueInput) {
    const discountType = discountTypeSelect.value;
    const discountValue = parseFloat(discountValueInput.value) || 0;
    
    if (discountType === 'percentage') {
      discountedAmount = subtotal * (1 - discountValue / 100);
    } else if (discountType === 'fixed') {
      discountedAmount = subtotal - discountValue;
    }
  }
  
  // 計算稅金
  let taxAmount = 0;
  if (taxRateInput) {
    const taxRate = parseFloat(taxRateInput.value) || 0;
    taxAmount = discountedAmount * (taxRate / 100);
    if (taxAmountInput) {
      taxAmountInput.value = taxAmount.toFixed(2);
    }
  }
  
  // 計算總計
  const total = discountedAmount + taxAmount;
  totalInput.value = total.toFixed(2);
}

// 獲取報價單狀態的徽章類別
function getStatusBadgeClass(status) {
  switch (status) {
    case 'draft':
      return 'secondary';
    case 'sent':
      return 'info';
    case 'accepted':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'expired':
      return 'warning';
    default:
      return 'secondary';
  }
}

// 添加報價單項目
function addQuoteItem() {
  const quoteItemsContainer = document.getElementById('quote-items');
  const itemTemplate = document.getElementById('quote-item-template');
  
  if (!quoteItemsContainer || !itemTemplate) return;
  
  const newRow = itemTemplate.content.cloneNode(true);
  const rowCount = quoteItemsContainer.querySelectorAll('.quote-item-row').length;
  
  // 更新索引
  const inputs = newRow.querySelectorAll('input, select');
  inputs.forEach(input => {
    const name = input.getAttribute('name');
    if (name) {
      input.setAttribute('name', name.replace('[index]', `[${rowCount}]`));
    }
  });
  
  quoteItemsContainer.appendChild(newRow);
  
  // 重新綁定事件
  setupQuoteItemCalculation();
}

// 移除報價單項目
function removeQuoteItem(button) {
  const row = button.closest('.quote-item-row');
  if (row) {
    row.remove();
    updateQuoteTotal();
  }
}

// 從產品選擇中填充項目
function populateItemFromProduct(select) {
  const row = select.closest('.quote-item-row');
  if (!row) return;
  
  const productId = select.value;
  if (!productId) return;
  
  // 發送AJAX請求獲取產品資訊
  fetch(`/products/api/${productId}`)
    .then(response => response.json())
    .then(product => {
      const descriptionInput = row.querySelector('.item-description');
      const priceInput = row.querySelector('.item-price');
      const quantityInput = row.querySelector('.item-quantity');
      const amountInput = row.querySelector('.item-amount');
      
      if (descriptionInput) descriptionInput.value = product.name;
      if (priceInput) priceInput.value = product.price.toFixed(2);
      if (quantityInput && quantityInput.value === '') quantityInput.value = '1';
      
      // 計算金額
      if (quantityInput && priceInput && amountInput) {
        const quantity = parseFloat(quantityInput.value) || 0;
        const price = parseFloat(priceInput.value) || 0;
        amountInput.value = (quantity * price).toFixed(2);
      }
      
      // 更新總計
      updateQuoteTotal();
    })
    .catch(error => console.error('獲取產品資訊失敗:', error));
} 