async function toggleBan(userId, element) {
    try {
        const response = await fetch(`/staff/users/${userId}/toggle-ban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.success) {
            const button = element;
            const icon = button.querySelector('i');
            const currentStatus = button.classList.contains('danger');
            
            // Toggle button appearance
            button.classList.toggle('danger');
            button.classList.toggle('success');
            
            // Update icon and text
            icon.classList.toggle('fa-ban');
            icon.classList.toggle('fa-unlock');
            button.innerHTML = currentStatus ? 
                '<i class="fas fa-unlock"></i> Unban User' : 
                '<i class="fas fa-ban"></i> Ban User';
                
            createNotification('User ban status updated successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        }
    } catch (error) {
        console.error('Error toggling ban:', error);
        createNotification('Error updating ban status', 'error');
    }
}

async function toggleStaff(userId) {
    try {
        const response = await fetch(`/staff/users/${userId}/toggle-staff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.success) {
            createNotification('Staff status updated successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            createNotification('Failed to update staff status', 'error');
        }
    } catch (error) {
        console.error('Error toggling staff status:', error);
        createNotification('Error updating staff status', 'error');
    }
}

async function toggleLicense(licenseId) {
    fetch(`/staff/licenses/${licenseId}/toggle`, { method: 'POST' })
        .then(response => {
            if (response.ok) {
                createNotification('License status updated', 'success');
                setTimeout(() => location.reload(), 1500);
            } else {
                createNotification('Failed to update license', 'error');
            }
        });
}

async function deleteLicense(licenseId) {
    fetch(`/staff/licenses/${licenseId}`, { method: 'DELETE' })
        .then(response => {
            if (response.ok) {
                createNotification('License deleted successfully', 'success');
                setTimeout(() => location.reload(), 1500);
            } else {
                createNotification('Failed to delete license', 'error');
            }
        });
}

async function resetHWID(licenseId) {
    try {
        const response = await fetch(`/staff/licenses/${licenseId}/reset-hwid`, {
            method: 'POST'
        });
        if (response.ok) {
            createNotification('HWID reset successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        }
    } catch (error) {
        createNotification('Failed to reset HWID', 'error');
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

// Product Management
async function addProduct(event) {
    event.preventDefault();
    const form = event.target;
    const productName = form.productName.value;

    try {
        const response = await fetch('/staff/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productName })
        });
        const data = await response.json();
        if (data.success) {
            createNotification('Product added successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        }
    } catch (error) {
        console.error('Error adding product:', error);
        createNotification('Failed to add product', 'error');
    }
}

async function deleteProduct(productId) {
    try {
        const response = await fetch(`/staff/products/${productId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            createNotification('Product deleted successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        createNotification('Failed to delete product', 'error');
    }
}

// License Management
async function generateLicense(event) {
    event.preventDefault();
    const form = event.target;
    const formData = {
        duration: form.duration.value,
        quantity: form.quantity.value,
        product: form.product.value || form.newProduct.value,
        userId: form.userId.value,
        discordId: form.discordId.value
    };

    try {
        const response = await fetch('/staff/licenses/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        const data = await response.json();
        if (data.success) {
            createNotification('License generated successfully', 'success');
            setTimeout(() => location.reload(), 1500);
        }
    } catch (error) {
        console.error('Error generating license:', error);
        createNotification('Failed to generate license', 'error');
    }
}
// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const productForm = document.getElementById('productForm');
    const generateForm = document.getElementById('generateForm');
    
    if (productForm) productForm.addEventListener('submit', addProduct);
    if (generateForm) generateForm.addEventListener('submit', generateLicense);
    
    // Fetch Discord members for the dropdown
    fetchDiscordMembers();
});
  async function fetchDiscordMembers() {
      try {
          const response = await fetch('/auth/discord/members');
          const data = await response.json();
        
          if (data.members) {
              const discordSelect = document.querySelector('.discord-members-select');
              data.members.forEach(member => {
                  const option = document.createElement('option');
                  option.value = member.id;
                  option.textContent = `${member.username}#${member.discriminator}`;
                  discordSelect.appendChild(option);
              });
          }
      } catch (error) {
          console.error('Error fetching Discord members:', error);
      }
  }
  function showSection(sectionId, event) {
    // Hide all sections
    document.querySelectorAll('.staff-section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.staff-nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected section
    const selectedSection = document.getElementById(`${sectionId}-section`);
    if (selectedSection) selectedSection.classList.add('active');

    // Activate clicked button
    if (event.currentTarget) event.currentTarget.classList.add('active');
}
// Notification system
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

// Copy text function with notification
function copyText(text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            createNotification('Copied to clipboard!', 'success');
        })
        .catch(err => {
            createNotification('Failed to copy text', 'error');
        });
}

