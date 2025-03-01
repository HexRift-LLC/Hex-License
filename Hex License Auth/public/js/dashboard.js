function createNotification(message, type = 'success') {
    const notificationStack = document.getElementById('notificationStack');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    notificationStack.appendChild(notification);
    
    // Fade out and remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function copyKey(key) {
    navigator.clipboard.writeText(key)
        .then(() => {
            createNotification('Key copied to clipboard!', 'success');
        })
        .catch(err => {
            createNotification('Failed to copy key', 'error');
        });
}

async function resetHWID(licenseId) {
    try {
        const response = await fetch(`/api/licenses/${licenseId}/reset-hwid`, {
            method: 'POST'
        });

        if (response.ok) {
            createNotification('HWID reset successfully', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }
    } catch (error) {
        createNotification('Failed to reset HWID', 'error');
    }
}

function toggleMenu() {
    const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');
    burger.classList.toggle('active');
    navLinks.classList.toggle('active');
}