let adminToken = localStorage.getItem('magic_petals_admin_token');

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('admin-login-form');
  const logoutBtn = document.getElementById('logout-btn');
  const searchInput = document.getElementById('search-input');

  if (adminToken) {
    showDashboard();
  } else {
    showLogin();
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const loginAlert = document.getElementById('login-alert');
      const loginBtn = document.getElementById('login-btn');
      
      loginAlert.innerHTML = '';
      
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      loginBtn.disabled = true;
      loginBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          adminToken = data.token;
          localStorage.setItem('magic_petals_admin_token', adminToken);
          showDashboard();
        } else {
          showLoginAlert(data.message || 'Invalid username or password.', 'error');
          loginBtn.disabled = false;
          loginBtn.innerHTML = `<span>Log In to Dashboard</span> <i class="fa-solid fa-arrow-right-to-bracket"></i>`;
        }
      } catch (err) {
        console.error('Login error:', err);
        showLoginAlert('Network error. Please try again.', 'error');
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<span>Log In to Dashboard</span> <i class="fa-solid fa-arrow-right-to-bracket"></i>`;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      adminToken = null;
      localStorage.removeItem('magic_petals_admin_token');
      showLogin();
    });
  }

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchSubmissions();
      }, 300);
    });
  }
});

function showLoginAlert(msg, type = 'error') {
  const loginAlert = document.getElementById('login-alert');
  if (!loginAlert) return;
  loginAlert.innerHTML = `
    <div class="alert alert-${type}">
      <i class="fa-solid fa-circle-exclamation"></i>
      <span>${msg}</span>
    </div>
  `;
}

function showLogin() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('dashboard-view').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

function showDashboard() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('dashboard-view').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-flex';
  fetchSubmissions();
}

async function fetchSubmissions() {
  const searchInput = document.getElementById('search-input');
  const query = searchInput ? searchInput.value.trim() : '';

  try {
    const url = `/api/admin/submissions?search=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await res.json();

    if (res.status === 401 || res.status === 403) {
      // Token expired or invalid
      adminToken = null;
      localStorage.removeItem('magic_petals_admin_token');
      showLogin();
      showLoginAlert('Session expired. Please log in again.');
      return;
    }

    if (data.success) {
      renderTable(data.data);
      if (data.stats) {
        document.getElementById('stat-total').innerText = data.stats.total || 0;
        document.getElementById('stat-today').innerText = data.stats.today || 0;
      }
    }
  } catch (err) {
    console.error('Error fetching submissions:', err);
  }
}

function renderTable(records) {
  const tbody = document.getElementById('submissions-table-body');
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <i class="fa-solid fa-inbox" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem;"></i>
          <p>No customer records found.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(item => {
    const dateFormatted = new Date(item.created_at).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const feedbackText = item.feedback 
      ? escapeHTML(item.feedback)
      : '<span style="color: #94a3b8; font-style: italic;">None provided</span>';

    return `
      <tr>
        <td style="font-weight: 700; color: var(--primary);">#${item.id}</td>
        <td style="font-weight: 600;">${escapeHTML(item.name)}</td>
        <td><span class="phone-badge"><i class="fa-solid fa-phone" style="font-size: 0.75rem;"></i> ${escapeHTML(item.phone)}</span></td>
        <td><div class="feedback-text">${feedbackText}</div></td>
        <td style="font-size: 0.85rem; color: var(--text-muted);">${dateFormatted}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteSubmission(${item.id})">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteSubmission(id) {
  if (!confirm(`Are you sure you want to delete entry #${id}?`)) return;

  try {
    const res = await fetch(`/api/admin/submissions/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await res.json();
    if (data.success) {
      fetchSubmissions();
    } else {
      alert(data.message || 'Could not delete entry.');
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert('Failed to delete entry.');
  }
}

function downloadCSV() {
  if (!adminToken) return;
  // Trigger download via protected export URL
  window.location.href = `/api/admin/export?token=${encodeURIComponent(adminToken)}`;
}

let qrGenerated = false;
function showShopQRCode() {
  const modal = document.getElementById('qr-modal');
  const container = document.getElementById('qrcode-container');
  modal.classList.add('active');

  if (!qrGenerated && container) {
    container.innerHTML = '';
    const targetUrl = window.location.origin + '/';
    new QRCode(container, {
      text: targetUrl,
      width: 220,
      height: 220,
      colorDark : "#7c3aed",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
    qrGenerated = true;
  }
}

function closeShopQRCode() {
  const modal = document.getElementById('qr-modal');
  modal.classList.remove('active');
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
