async function toggleLicense(licenseId) {
    try {
        const response = await fetch(`/api/licenses/${licenseId}/toggle`, {
            method: 'POST'
        });
        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Error toggling license:', error);
    }
}

async function deleteLicense(licenseId) {
        try {
            const response = await fetch(`/api/licenses/${licenseId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                window.location.reload();
            }
        } catch (error) {
            console.error('Error deleting license:', error);
        }
    }
async function resetHWID(licenseId) {
    try {
        const response = await fetch(`/api/licenses/${licenseId}/reset-hwid`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showToast('HWID reset successfully.');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else if (response.status === 429) {
            showToast('HWID reset is currently on cooldown. Please try again later.');
        }
    } catch (error) {
        showToast('Failed to reset HWID');
    }
}


function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
function toggleMenu() {
    const burger = document.querySelector('.burger');
    const navLinks = document.querySelector('.nav-links');
    burger.classList.toggle('active');
    navLinks.classList.toggle('active');
    }

    function copyKey(key) {
        navigator.clipboard.writeText(key);
        showToast('License key copied!');
    }