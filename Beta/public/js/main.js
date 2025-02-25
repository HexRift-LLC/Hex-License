document.addEventListener('DOMContentLoaded', () => {
    // Dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
        });
    }

    // License creation modal
    const createLicenseBtn = document.getElementById('createLicense');
    if (createLicenseBtn) {
        createLicenseBtn.addEventListener('click', () => {
            // Show license creation modal
            showModal('createLicenseModal');
        });
    }

    // Search functionality
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    }

    // Status filter
    const statusFilter = document.querySelector('.filter-select');
    if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
            const status = e.target.value;
            const rows = document.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                if (status === 'all') {
                    row.style.display = '';
                    return;
                }
                const rowStatus = row.querySelector('.status-badge').textContent.toLowerCase();
                row.style.display = rowStatus === status ? '' : 'none';
            });
        });
    }
});

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}
