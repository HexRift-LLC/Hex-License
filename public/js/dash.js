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

function updateHwidResetButton(button, lastResetTime) {
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const now = new Date();
    const resetTime = new Date(lastResetTime);
    const timeLeft = cooldownPeriod - (now - resetTime);

    if (timeLeft > 0) {
        // Hide button, show countdown
        button.style.display = 'none';
        const hours = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
        
        const countdownText = `Available in ${hours}h ${minutes}m`;
        const countdownElement = document.createElement('div');
        countdownElement.className = 'reset-countdown';
        countdownElement.textContent = countdownText;
        
        button.parentNode.insertBefore(countdownElement, button);
    } else {
        // Show only the reset button
        button.style.display = 'flex';
        const existingCountdown = button.parentNode.querySelector('.reset-countdown');
        if (existingCountdown) {
            existingCountdown.remove();
        }
    }
}


// Call this for each button on page load
document.querySelectorAll('.reset-hwid-btn').forEach(button => {
    const lastReset = button.dataset.lastReset;
    if (lastReset) {
        updateHwidResetButton(button, lastReset);
    }
});


function toggleMenu() {
    const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');
    burger.classList.toggle('active');
    navLinks.classList.toggle('active');
}