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
    if (confirm('Are you sure you want to delete this license?')) {
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
}
