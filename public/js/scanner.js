let html5QrCode;
let cameraActive = false;

document.addEventListener('DOMContentLoaded', () => {
  renderShopFrontQR();
});

function renderShopFrontQR() {
  const qrContainer = document.getElementById('shop-front-qrcode');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    // Generate QR code pointing to customer form (root URL or relative path)
    const targetUrl = window.location.origin + '/';
    new QRCode(qrContainer, {
      text: targetUrl,
      width: 220,
      height: 220,
      colorDark: "#7c3aed",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }
}

function toggleCameraMode() {
  const qrSection = document.getElementById('qr-display-section');
  const cameraSection = document.getElementById('camera-section');

  if (!cameraActive) {
    qrSection.style.display = 'none';
    cameraSection.style.display = 'block';
    cameraActive = true;
    startCamera();
  } else {
    stopCamera();
    cameraSection.style.display = 'none';
    qrSection.style.display = 'block';
    cameraActive = false;
  }
}

function startCamera() {
  const alertBox = document.getElementById('scanner-alert');
  const resultBox = document.getElementById('scanned-result');
  
  if (resultBox) resultBox.style.display = 'none';
  if (alertBox) alertBox.innerHTML = '';

  if (typeof Html5Qrcode === 'undefined') {
    if (alertBox) {
      alertBox.innerHTML = `<div class="alert alert-error"><i class="fa-solid fa-triangle-exclamation"></i> Camera library loading. Please check internet connection.</div>`;
    }
    return;
  }

  html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess,
    onScanFailure
  ).catch(err => {
    console.warn("Retrying with user facing camera...", err);
    html5QrCode.start({ facingMode: "user" }, config, onScanSuccess, onScanFailure)
      .catch(error => {
        console.error("Camera access error:", error);
        if (alertBox) {
          alertBox.innerHTML = `
            <div class="alert alert-error">
              <i class="fa-solid fa-camera-slash"></i> Camera access unavailable. Tap below to return to QR code display.
            </div>`;
        }
      });
  });
}

function stopCamera() {
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {});
  }
}

function onScanSuccess(decodedText, decodedResult) {
  const resultBox = document.getElementById('scanned-result');
  const resultText = document.getElementById('scanned-text');

  if (resultBox && resultText) {
    resultText.innerText = decodedText;
    resultBox.style.display = 'block';
  }

  // Redirect to form or URL
  if (decodedText.startsWith('http://') || decodedText.startsWith('https://') || decodedText.startsWith('/')) {
    window.location.href = decodedText;
  } else {
    window.location.href = '/';
  }
}

function onScanFailure(error) {
  // Silent scan frame updates
}
