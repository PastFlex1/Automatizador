document.addEventListener('DOMContentLoaded', () => {
  const dot = document.getElementById('crm-dot');
  const statusText = document.getElementById('crm-status-text');
  const openWaBtn = document.getElementById('open-wa-btn');

  // Check localhost:3000 health
  fetch('http://localhost:3000/api/crm/products')
    .then(r => r.json())
    .then(() => {
      dot.style.background = '#10b981';
      dot.style.boxShadow = '0 0 6px #10b981';
      statusText.innerText = 'Online (Localhost)';
      statusText.style.color = '#34d399';
    })
    .catch(() => {
      dot.style.background = '#ef4444';
      dot.style.boxShadow = '0 0 6px #ef4444';
      statusText.innerText = 'Servidor Inactivo';
      statusText.style.color = '#f87171';
    });

  if (openWaBtn) {
    openWaBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://web.whatsapp.com' });
    });
  }
});
