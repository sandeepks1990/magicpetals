document.addEventListener('DOMContentLoaded', () => {
  const customerForm = document.getElementById('customer-form');
  const alertContainer = document.getElementById('alert-container');
  const submitBtn = document.getElementById('submit-btn');
  const formCard = document.getElementById('form-card');
  const successCard = document.getElementById('success-card');

  if (customerForm) {
    customerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertContainer.innerHTML = '';

      const name = document.getElementById('name').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const feedback = document.getElementById('feedback').value.trim();

      if (!name || !phone) {
        showAlert('Please fill in both your Name and Phone Number.', 'error');
        return;
      }

      // UI Loading state
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

      try {
        const response = await fetch('/api/submissions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, phone, feedback })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          customerForm.reset();
          formCard.style.display = 'none';
          successCard.style.display = 'block';
        } else {
          showAlert(data.message || 'Error submitting details. Please try again.', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Submit Details</span> <i class="fa-solid fa-paper-plane"></i>`;
        }
      } catch (error) {
        console.error('Submission error:', error);
        showAlert('Network error. Please check your connection and try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Submit Details</span> <i class="fa-solid fa-paper-plane"></i>`;
      }
    });
  }
});

function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alert-container');
  if (!alertContainer) return;

  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
  alertDiv.innerHTML = `
    <i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i>
    <span>${message}</span>
  `;

  alertContainer.innerHTML = '';
  alertContainer.appendChild(alertDiv);
}

function resetForm() {
  const formCard = document.getElementById('form-card');
  const successCard = document.getElementById('success-card');
  const submitBtn = document.getElementById('submit-btn');

  if (formCard && successCard) {
    successCard.style.display = 'none';
    formCard.style.display = 'block';
  }
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Submit Details</span> <i class="fa-solid fa-paper-plane"></i>`;
  }
}
